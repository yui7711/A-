import {handbookMarketData,latestHandbookMarket} from './lib/handbook-market-data';
import {readSharedSeals} from './lib/shared-seals';
import {assessTactics,marketClock} from './lib/tactics';
import {asOf,classifyRoleEvidence,closingVolumeRatio,middleEvidence,priorPerformance,withPreviousSnapshot} from './lib/decision-proof';
import {loadDecisionProof} from './lib/load-decision-proof';
import {requestJSON} from './lib/client-request';
import {sealSource,type SealSnapshot} from './lib/closing-signals';
import {buildMainlines} from './lib/research';
import type {Market} from './lib/market-types';

let version=0;
const send=(body:object)=>window.parent.postMessage({kind:'obsidian-handbook-market',...body},location.origin);

window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent||event.data?.kind!=='obsidian-handbook-request')return;
 void refresh(event.data,++version);
});

async function refresh(request:{date?:string;slot?:string;code?:string;tool?:string},id:number){
 try{
  const clock=marketClock(),today=clock.date;
  const requested=typeof request.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(request.date)?request.date:null;
  const liveJob=!requested&&clock.live?requestJSON<Market>('/api/market',{},{timeoutMs:9000}).catch(()=>null):Promise.resolve(null);
  const [archive,live]=await Promise.all([readSharedSeals().catch(()=>({records:[]})),liveJob]);
  const records=archive.records.filter(s=>!requested||s.date===requested&&(request.slot!=='noon'&&request.slot!=='late'||s.slot===request.slot));
  let market=latestHandbookMarket(records,today);
  let data=records.find(s=>s.date===market?.date&&s.source===market?.source&&s.at===market?.time&&s.origin==='cloud')?.market;
  const liveSource=live&&sealSource(live);
  const liveAt=live?asOf(live):0;
  let liveUsed=false;
  if(live&&liveSource&&live.tradeDate===today&&!live.cached&&!assessTactics(live,Date.now()).dataIssue
   &&Math.abs(Date.now()-liveAt)<=180000){
   const current=handbookMarketData({origin:'cloud',market:live,date:today,source:liveSource,at:liveAt,basis:'source',slot:'late',stocks:[],up:live.stats.up});
   if(current){market={...current,timeBasis:'盘中行情时点'};data=live;liveUsed=true;}
  }
  if(id!==version)return;
  if(!market||!data){send({error:requested?'该交易日和时段无有效快照。':'暂无有效行情快照，等待公开源恢复。'});return;}
  data=withPreviousSnapshot(data,archive.records);
  const meta={historical:market.date!==today,checkedAt:Date.now()};
  send({market,...meta});
  const code=request.tool==='locate'?market.stocks[0]?.code:typeof request.code==='string'&&/^\d{6}$/.test(request.code)?request.code:null;
  const stock=code?data.stocks.find(s=>s.code===code):undefined;
  const group=stock?buildMainlines(data.stocks).lines.filter(g=>g.stocks.some(s=>s.code===stock.code)):[];
  const industry=request.tool==='mainline'&&market.themes.some(t=>t.name===request.code)?request.code!:group.length===1?group[0].name:'';
  const proof=await loadDecisionProof(data,stock?[stock.code]:[],industry);
  if(id!==version)return;
  const prior=priorPerformance(data,proof);
  const model=assessTactics(data,liveUsed?Date.now():Date.parse(market.date+(market.timeBasis.startsWith('午盘')?'T12:00:00':'T16:30:00')+'+08:00'));
  const role=stock?{code:stock.code,...classifyRoleEvidence(stock,data,proof,industry||undefined)}:null;
  const themes=themeFacts(data,market.source,archive.records,proof.prior,market.themes).map(t=>({
   ...t,middleScore:t.name===industry&&middleEvidence(data!,proof,t.name)?.breakout?15:null,
  }));
  send({market:{...market,themes,prior,role,volumeRatio:stock?closingVolumeRatio(proof.daily[stock.code],data.tradeDate,proof.at):null,phase:model.phase},...meta});
 }catch{
  if(id===version)send({error:'行情补证暂未取到，稍后自动重试。'});
 }
}

function themeFacts(data:Market,source:string,records:SealSnapshot[],prior:Market['stocks'],themes:NonNullable<ReturnType<typeof handbookMarketData>>['themes']){
 const past=new Map(records.filter(s=>s.slot==='late'&&s.date<data.tradeDate!&&s.source===source&&s.market?.themeBasis===data.themeBasis&&handbookMarketData(s))
  .sort((a,b)=>a.at-b.at).map(s=>[s.date,s.market!]));
 const previous=buildMainlines(prior).lines;
 const current=new Map(data.stocks.map(s=>[s.code,s.boards]));
 const groupByDate=new Map([...past].map(([date,market])=>[date,{market,groups:buildMainlines(market.stocks)}]));
 return themes.map(t=>{
  let count=1,date=data.research?.previousDate,known=false;
  while(date&&count<5){
   const row=groupByDate.get(date);
   if(!row)break;
   const hit=row.groups.lines.some(x=>x.name===t.name);
   if(!hit){known=row.groups.unclassified===0;break;}
   count++;date=row.market.research?.previousDate;
  }
  const ladder=previous.find(g=>g.name===t.name)?.stocks.filter(s=>s.boards>=2);
  return {...t,daysScore:count>=5?25:known?(count>=3?18:count===2?10:3):null,
   promotion:ladder?.length&&data.research?.previousPool?.taxonomy===data.themeBasis?100*ladder.filter(s=>current.get(s.code)===s.boards+1).length/ladder.length:null};
 });
}

send({ready:true});
