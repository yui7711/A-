import type {SealSnapshot} from './closing-signals.ts';
import {buildMainlines} from './research.ts';
import {assessTactics} from './tactics.ts';

const percent=(part:number,total:number)=>total>0?part/total*100:null;

export function handbookMarketData(snapshot:SealSnapshot){
 const data=snapshot.market;
 if(!data||snapshot.origin!=='cloud'||data.cached||data.tradeDate!==snapshot.date)return null;
 const now=Date.parse(snapshot.date+(snapshot.slot==='noon'?'T12:00:00':'T16:30:00')+'+08:00');
 if(assessTactics(data,now).dataIssue)return null;
 const pool=data.stocks;
 const {up,opened}=data.stats;
 if(up==null||opened==null)return null;
 const full=up===pool.length;
 const fields={
  zt:up,
  high:full?Math.max(0,...pool.map(s=>s.boards)):null,
  lb:full?pool.filter(s=>s.boards>=2).length:null,
  zbl:percent(opened,up+opened),
 };
 // The original ratio uses the entire source pool, including ST when it belongs to that universe.
 const themes=full?buildMainlines(pool.map(s=>s.isST?{...s,isST:false}:s)).lines.map(g=>({
  name:g.name,
  ratio:percent(g.count,pool.length),
  onlyFirst:g.highest===1,
 })): [];
 return {
  date:snapshot.date,valid:true,source:snapshot.source,
  time:snapshot.at,
  timeBasis:(snapshot.slot==='noon'?'午盘':'收盘')+(snapshot.basis==='source'?'源时点':'采集时点'),
  fields,themes,
  stocks:pool.filter(s=>!s.isST).map(({code,name,boards,turnover})=>({code,name,boards,turnover})),
 };
}

export function latestHandbookMarket(records:SealSnapshot[],today:string){
 const candidates=records.filter(s=>s.date<=today).flatMap(s=>{
  const data=handbookMarketData(s);
  return data?[{data,slot:s.slot}]:[];
 });
 const completeness=(data:NonNullable<ReturnType<typeof handbookMarketData>>)=>Object.values(data.fields).filter(v=>v!=null).length;
 return candidates.sort((a,b)=>
  b.data.date.localeCompare(a.data.date)||
  Number(b.slot==='late')-Number(a.slot==='late')||
  completeness(b.data)-completeness(a.data)||
  Number(b.data.source==='FUYAO')-Number(a.data.source==='FUYAO')||
  b.data.time-a.data.time
 )[0]?.data??null;
}
