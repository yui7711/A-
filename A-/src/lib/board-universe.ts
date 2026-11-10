import {num} from './market-core.ts';
import {asOf,cnMinute} from './decision-proof.ts';
import {buildMainlines} from './research.ts';
import {marketClock} from './tactics.ts';
import type {Market,Stock} from './market-types.ts';

type Row={f12?:string;f14?:string;f3?:unknown;f6?:unknown;f40?:unknown;f62?:unknown;f124?:unknown;f8?:unknown};
type Reply={data?:{total?:unknown;diff?:Row[]|Record<string,Row>}};
type Json=(url:string)=>Promise<unknown>;
export type BoardStock={code:string;name:string;change:number|null;amount:number;cap:number|null;flow:number|null;turnover:number|null};
export type BoardCoverage={date:string;at:number;boards:{code:string;name:string;kind:'概念'|'行业';change:number;flow:number|null;
 total:number;members:string[];liquid:BoardStock[]}[];trends?:Record<string,{above5:boolean;aligned:boolean|null;volumeRatio:number|null}>};
type Board=BoardCoverage['boards'][number];
const api='https://push2.eastmoney.com/api/qt/clist/get?po=1&np=1&fltt=2&invt=2';
const readRows=(j:Reply)=>Array.isArray(j?.data?.diff)?j.data.diff:Object.values(j?.data?.diff||{});
const ignored=/昨日|历史新高|融资融券|沪股通|深股通|机构重仓|基金重仓|股权转让|退市|破净|AH股|MSCI|转债|^ST|次新股|低价股|高价股|中证|百元股|中特估|大盘股|小盘股|养老金/;
const key=(name:string)=>/太阳能|光伏(概念|设备)?/.test(name)?'光伏':/机器人/.test(name)?'机器人':name.replace(/(概念|行业|板块)$/,'');
function timed(row:Row,date:string,at:number){
 const stamp=(num(row.f124)??0)*1000;
 return stamp>0&&marketClock(stamp).date===date&&(cnMinute(at)>=900?cnMinute(stamp)>=900:Math.abs(stamp-at)<=180000);
}
async function page(json:Json,filter:string,fields:string,index:number,sort:string){
 return await json(`${api}&pn=${index}&pz=100&fid=${sort}&fs=${filter}&fields=${fields}`) as Reply;
}

export async function captureBoards(data:Market,json:Json):Promise<BoardCoverage|null>{
 const date=data.tradeDate,at=asOf(data);
 if(!date||data.cached||data.poolDate!==date||data.poolTotal!==data.stocks.length||!at||marketClock().date!==date)return null;
 const groups=buildMainlines(data.stocks).lines.slice(0,16);
 const rank=new Map(groups.flatMap((g,i)=>[g.name,...g.tags].map(name=>[key(name),16-i] as const)).reverse());
 const boardFields='f12,f14,f3,f62,f124';
 const directories=await Promise.allSettled([
  ...[1,2,3,4,5,6].map(i=>page(json,'m:90+t:3',boardFields,i,'f3').then(j=>({rows:readRows(j),kind:'概念' as const}))),
  page(json,'m:90+t:2+f:!50',boardFields,1,'f3').then(j=>({rows:readRows(j),kind:'行业' as const})),
 ]);
 const catalog=directories.flatMap(x=>x.status==='fulfilled'?x.value.rows.filter(r=>r?.f12&&r.f14&&/^BK\d+$/.test(r.f12)&&!ignored.test(r.f14)
  &&num(r.f3)!=null&&timed(r,date,at)).map(row=>({row,kind:x.value.kind})):[]);
 const concepts=catalog.filter(x=>x.kind==='概念');
 const matching=[...concepts].filter(x=>rank.has(key(x.row.f14!))).sort((a,b)=>rank.get(key(b.row.f14!))!-rank.get(key(a.row.f14!))!);
 const byTags=[...new Map(matching.reverse().map(x=>[key(x.row.f14!),x])).values()].reverse();
 const broadMatches=concepts.filter(x=>rank.has(key(x.row.f14!))&&/^(太阳能|人形机器人)$/.test(x.row.f14!));
 if(rank.has('机器人')&&!broadMatches.some(x=>x.row.f12==='BK1184')){
  const quote=await json('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&secids=90.BK1184&fields='+boardFields).catch(()=>null) as Reply;
  const row=readRows(quote).find(r=>r.f12==='BK1184'&&r.f14==='人形机器人'&&num(r.f3)!=null&&timed(r,date,at));
  if(row)broadMatches.push({row,kind:'概念'});
 }
 const industries=catalog.filter(x=>x.kind==='行业').sort((a,b)=>(rank.get(key(b.row.f14!))??0)-(rank.get(key(a.row.f14!))??0));
 const targets=[...new Map([...byTags.slice(0,7),...broadMatches,...concepts.slice(0,3),...industries.slice(0,4)].map(x=>[x.row.f12,x])).values()];
 const fields='f12,f14,f3,f6,f8,f40,f62,f124';
 const boards:Board[]=[];
 for(let i=0;i<targets.length;i+=4){
  const batch=await Promise.allSettled(targets.slice(i,i+4).map(async({row,kind})=>{
   const filter='b:'+row.f12;
   const first=await page(json,filter,fields,1,'f6');
   const total=num(first.data?.total);
   if(total==null||total<8||total>700)return null;
   const more=await Promise.allSettled(Array.from({length:Math.ceil(total/100)-1},(_,n)=>page(json,filter,fields,n+2,'f6')));
   const stocks=[...readRows(first),...more.flatMap(r=>r.status==='fulfilled'?readRows(r.value):[])].filter(s=>s?.f12&&/^\d{6}$/.test(s.f12));
   const unique=[...new Map(stocks.map(s=>[s.f12,s])).values()];
   if(!unique.length)return null;
   const liquid=unique.flatMap(s=>{
    const amount=num(s.f6);
    return s.f14&&amount!=null&&amount>0&&timed(s,date,at)?[{code:s.f12!,name:s.f14,change:num(s.f3),amount,cap:num(s.f40),flow:num(s.f62),turnover:num(s.f8)}]:[];
   }).sort((a,b)=>b.amount-a.amount).slice(0,12);
   return {code:row.f12!,name:row.f14!,kind,change:num(row.f3)!,flow:num(row.f62),total,members:unique.map(s=>s.f12!),liquid};
  }));
  for(const x of batch)if(x.status==='fulfilled'&&x.value)boards.push(x.value);
 }
 return boards.length?{date,at,boards}:null;
}

export function coverageMatchesMarket(data:Market,coverage:BoardCoverage|null|undefined){
 if(!coverage||coverage.date!==data.tradeDate)return false;
 const at=asOf(data);
 return at>0&&(cnMinute(at)>=900&&cnMinute(coverage.at)>=900||Math.abs(coverage.at-at)<=180000);
}

const firstSeal=(s:Stock)=>/^(?:09|1[0-5]):[0-5]\d/.test(s.time)?s.time.slice(0,5):null;
export function rankCoveredBoards(data:Market,coverage:BoardCoverage|null|undefined,previous?:Market|null){
 if(!coverage||!coverageMatchesMarket(data,coverage))return [];
 const prior=previous?.tradeDate===data.research?.previousDate&&previous?.poolTotal===previous?.stocks.length?previous:null;
 const old=new Map(prior?.boardCoverage?.boards.map(b=>[b.code,b])||[]);
 const rows=coverage.boards.map(board=>{
  const members=new Set(board.members);
  const stocks=data.stocks.filter(s=>!s.isST&&members.has(s.code)).sort((a,b)=>b.boards-a.boards||(firstSeal(a)||'99').localeCompare(firstSeal(b)||'99')||(b.seal??0)-(a.seal??0)||a.code.localeCompare(b.code));
  const leader=stocks[0];
  const previousBoard=old.get(board.code);
  const previousMembers=new Set(previousBoard?.members??board.members);
  const complete=members.size===board.total;
  const before=prior&&complete&&(!previousBoard||previousMembers.size===previousBoard.total)
   ?prior.stocks.filter(s=>!s.isST&&previousMembers.has(s.code)).length:null;
  const width=stocks.length;
  const highest=leader?.boards??0;
  const ladder=new Set(stocks.map(s=>s.boards));
  const capacity=board.liquid.filter(s=>s.code!==leader?.code&&!stocks.some(x=>x.code===s.code)
   &&s.cap!=null&&s.cap>=100e8&&(s.cap<=800e8||s.amount>=20e8));
  const middle=capacity.find(s=>coverage.trends?.[s.code]?.aligned===true)??capacity[0];
  const follower=stocks.filter(s=>s.code!==leader?.code&&s.boards<=2)
   .sort((a,b)=>Number((firstSeal(b)||'99')<='11:30')-Number((firstSeal(a)||'99')<='11:30')||b.boards-a.boards||(b.seal??0)-(a.seal??0))[0];
  const structuralFollower=!!follower&&highest>=4&&!!firstSeal(follower)&&firstSeal(follower)!<='11:30'
   &&(highest>=5||!!firstSeal(leader)&&firstSeal(follower)!>firstSeal(leader)!);
  const hot=Math.min(width,12)*4+Math.min(highest,6)*4+Math.min(ladder.size,4)*4+(board.flow!=null&&board.flow>0?4:0);
  return {board,stocks,width,highest,ladder:[...ladder].sort((a,b)=>b-a),leader,middle,follower,structuralFollower,complete,before,
   sameMembership:!!previousBoard,hot,aliases:[] as string[]};
 }).filter(x=>x.width>0).sort((a,b)=>Number(b.complete)-Number(a.complete)||b.hot-a.hot||b.width-a.width||b.board.change-a.board.change||a.board.code.localeCompare(b.board.code));
 const ranked:typeof rows=[];
 for(const row of rows){
  const overlap=ranked.find(other=>row.complete&&other.complete&&row.width>=3&&other.width>=3&&
   row.stocks.filter(s=>other.stocks.some(o=>o.code===s.code)).length/Math.max(row.width,other.width)>=.75);
  if(overlap)overlap.aliases.push(row.board.name);
  else ranked.push(row);
 }
 return ranked;
}

export async function addBoardTrends(data:Market,coverage:BoardCoverage,history:(code:string)=>Promise<import('./market-types.ts').History>){
 if(cnMinute(asOf(data))<900)return coverage;
 const ranked=rankCoveredBoards(data,coverage).slice(0,8);
 const codes=[...new Set(ranked.flatMap(r=>[r.middle?.code,r.follower?.code]).filter((c):c is string=>!!c))];
 const trends:NonNullable<BoardCoverage['trends']>={};
 for(let i=0;i<codes.length;i+=5){
  const batch=codes.slice(i,i+5);
  const result=await Promise.allSettled(batch.map(history));
  result.forEach((x,j)=>{
   if(x.status!=='fulfilled')return;
   const bars=x.value.points.filter(b=>b.time<=coverage.date).sort((a,b)=>a.time.localeCompare(b.time));
   if(bars.length<6||bars.at(-1)?.time!==coverage.date)return;
   const close=bars.at(-1)!;
   const ma=(n:number)=>bars.slice(-n).reduce((sum,b)=>sum+b.price,0)/n;
   const lastVolume=bars.slice(-6,-1).map(b=>b.volume);
   const volumeRatio=lastVolume.every((n):n is number=>n!=null&&n>0)&&close.volume!=null
    ?close.volume/(lastVolume.reduce((sum,v)=>sum+v,0)/5):null;
   trends[batch[j]]={above5:close.price>=ma(5),aligned:bars.length>=20?ma(5)>ma(10)&&ma(10)>ma(20):null,volumeRatio};
  });
 }
 return {...coverage,trends};
}
