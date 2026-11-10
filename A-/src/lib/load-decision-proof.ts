import {requestJSON} from './client-request';
import {fetchPublicJSON} from './public-transport';
import {asOf,cnMinute,emptyPools,sameMoment,type DecisionProof,type PoolProof,type SectorMember} from './decision-proof';
import {num,symbol} from './market-core';
import type {History,Market,Quote,Stock} from './market-types';
import {marketClock} from './tactics';

type RawRow={c?:unknown;ltsz?:unknown};
type RawPool={data?:{qdate?:unknown;tc?:unknown;pool?:RawRow[]}};
const code=(r:RawRow)=>String(r.c??'');
const validCode=(v:string)=>/^\d{6}$/.test(v);
const jobs=new Map<string,{time:number;job:Promise<DecisionProof>}>();

async function emPool(name:string,date:string){
 const day=date.replaceAll('-','');
 const url='https://push2ex.eastmoney.com/'+name+'?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date='+day;
 const d=(await fetchPublicJSON(url) as RawPool)?.data;
 if(String(d?.qdate)!==day||!Array.isArray(d?.pool)||num(d.tc)!==d.pool.length
  ||new Set(d.pool.map(code)).size!==d.pool.length||!d.pool.every(row=>validCode(code(row))))return null;
 return d.pool;
}

async function loadPools(date:string):Promise<PoolProof>{
 const rows=await Promise.allSettled(['getTopicZTPool','getTopicZBPool','getTopicDTPool'].map(n=>emPool(n,date)));
 const value=(n:number)=>rows[n].status==='fulfilled'?rows[n].value:null;
 const up=value(0);
 return {limitUp:up?Object.fromEntries(up.map(r=>[code(r),num(r.ltsz)])):null,broken:value(1)?.map(code)??null,down:value(2)?.map(code)??null};
}

async function industryMembers(data:Market,name:string,date:string,at:number):Promise<SectorMember[]>{
 const industry=data.sectors.find(s=>s.name===name&&/^BK\d+$/.test(s.code));
 if(!industry||data.themeBasis!=='industry'||!data.sources.some(s=>s.id==='eastmoney'&&s.date===date&&s.status==='ok'))return [];
 const url='https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=f6&fs=b:'+industry.code+'&fields=f12,f14,f40';
 const j=await fetchPublicJSON(url) as {data?:{diff?:{f12:string;f14:string;f40:unknown}[]}};
 const rows=j?.data?.diff;
 if(!Array.isArray(rows))return [];
 const members=rows.filter(x=>validCode(x.f12)&&x.f14).slice(0,20);
 if(!members.length)return [];
 const q=await requestJSON<{quotes:Quote[]}>('/api/quotes?codes='+members.map(x=>x.f12).join(','),{},{timeoutMs:10000});
 const quotes=new Map(q.quotes.filter(x=>sameMoment(x,date,at)).map(x=>[x.code.slice(2),x]));
 if(members.some(x=>!quotes.has(x.f12)))return [];
 return members.flatMap(x=>{
  const quote=quotes.get(x.f12)!;
  return quote.amount!=null&&quote.amount>0?[{code:x.f12,name:x.f14,cap:num(x.f40),amount:quote.amount,change:quote.change}]:[];
 }).sort((a,b)=>b.amount-a.amount);
}

export function loadDecisionProof(data:Market,codes:string[]=[],industry=''){
 const date=data.tradeDate||'',at=asOf(data),prior=data.research?.previousPool;
 const priorUsable=data.research?.tradeDate===date&&!!prior?.date&&prior.date===data.research.previousDate&&prior.date<date&&prior.complete
  &&prior.total===prior.stocks.length&&new Set(prior.stocks.map(s=>s.code)).size===prior.total&&prior.stocks.every(s=>validCode(s.code));
 const previous:Stock[]=priorUsable?prior!.stocks:[];
 const picked=[...new Set(codes.filter(validCode))].slice(0,5).sort();
 const sameDay=date===marketClock().date,closed=cnMinute(at)>=900;
 const currentPool=sameDay&&Math.abs(Date.now()-at)<=180000;
 const key=[date,Math.floor(at/60000),priorUsable?prior?.date:'',previous.length,industry,...picked].join('/');
 const old=jobs.get(key);
 if(old&&Date.now()-old.time<45000)return old.job;
 const job=(async()=>{
  const batches:string[][]=[];
  if(sameDay)for(let i=0;i<previous.length;i+=35)batches.push(previous.slice(i,i+35).map(s=>s.code));
  const quoteJob=Promise.allSettled(batches.map(batch=>requestJSON<{quotes:Quote[]}>('/api/quotes?codes='+batch.join(','),{},{timeoutMs:9500})));
  const sectorJob=sameDay&&industry?industryMembers(data,industry,date,at).catch(()=>[]):Promise.resolve([]);
  const dailyJob=sectorJob.then(async members=>{
   const middle=members.find(s=>s.cap!=null&&s.cap>=100e8&&s.cap<=800e8&&!data.stocks.some(x=>x.code===s.code&&x.boards>=2));
   const targets=middle?[...new Set([...picked,middle.code])]:picked;
   const rows=await Promise.allSettled(targets.map(c=>requestJSON<History>('/api/history?code='+symbol(c)+'&mode=day',{},{timeoutMs:9000})));
   return Object.fromEntries(rows.flatMap((r,i)=>r.status==='fulfilled'&&r.value.code===symbol(targets[i])?[[targets[i],r.value]]:[]));
  });
  const [quotes,daily,pools,members]=await Promise.all([quoteJob,dailyJob,closed||currentPool?loadPools(date):Promise.resolve(emptyPools),sectorJob]);
  return {date,at,previousDate:priorUsable?prior!.date:null,prior:previous,
   quotes:quotes.flatMap(r=>r.status==='fulfilled'&&Array.isArray(r.value.quotes)?r.value.quotes:[]),
   daily,pools,sector:members.length?{name:industry,members}:undefined};
 })();
 jobs.set(key,{time:Date.now(),job});
 if(jobs.size>14)jobs.delete(jobs.keys().next().value!);
 return job;
}
