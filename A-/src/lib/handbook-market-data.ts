import type {Market,Quote} from './market-types.ts';
import {buildMainlines} from './research.ts';
import {sealSource} from './closing-signals.ts';
import {assessTactics,quoteEpoch} from './tactics.ts';

const number=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const percent=(part:number,total:number)=>total>0?part/total*100:null;

export function handbookMarketData(data:Market,now:number,previousQuotes:Quote[]=[]){
 const assessment=assessTactics(data,now);
 const valid=!data.cached&&!assessment.dataIssue;
 const pool=valid?data.stocks:[];
 const date=data.tradeDate||'';
 const research=data.research;
 const prior=research?.previousPool;
 const verifiedPrior=valid&&research?.tradeDate===date&&!!prior?.date&&prior.date===research.previousDate
  &&prior.date<date&&prior.complete&&prior.total===prior.stocks.length
  &&new Set(prior.stocks.map(s=>s.code)).size===prior.total&&prior.stocks.every(s=>/^\d{6}$/.test(s.code));
 const previous=verifiedPrior?prior!.stocks:[];
 const quoteMap=new Map(previousQuotes.filter(q=>{
  const at=quoteEpoch(q.time);
  return number(q.change)&&at!=null&&q.time.slice(0,8)===date.replaceAll('-','')&&at<=now+60000
   &&(!assessment.clock.live||now-at<=180000);
 }).map(q=>[q.code.slice(2),q.change!]));
 const changes=previous.length&&previous.every(s=>quoteMap.has(s.code))?previous.map(s=>quoteMap.get(s.code)!):null;
 const up=valid?data.stats.up:null;
 const opened=valid?data.stats.opened:null;
 const full=valid&&up===pool.length;
 const highest=full?Math.max(0,...pool.map(s=>s.boards)):null;
 const priorLadder=previous.filter(s=>s.boards>=2);
 const boardByCode=new Map(pool.map(s=>[s.code,s.boards]));
 const fields={
  prem:changes?changes.reduce((sum,v)=>sum+v,0)/changes.length:null,
  zt:up,
  high:highest,
  lb:full?pool.filter(s=>s.boards>=2).length:null,
  zbl:up!=null&&opened!=null?percent(opened,up+opened):null,
  jjl:full&&priorLadder.length?percent(priorLadder.filter(s=>(boardByCode.get(s.code)??0)>s.boards).length,priorLadder.length):null,
  damian:changes?changes.filter(v=>v< -9).length:null,
 };
 // The original ratio uses the entire source pool, including ST when it belongs to that universe.
 const themes=full?buildMainlines(pool.map(s=>s.isST?{...s,isST:false}:s)).lines.map(g=>({
  name:g.name,
  ratio:percent(g.count,pool.length),
  onlyFirst:g.highest===1,
 })): [];
 return {
  date,valid,source:data.stocks.length?sealSource(data)||'行情源':data.providerMode==='public'?'东方财富':'行情源',
  time:data.poolTimestamp??assessment.newest??Date.parse(data.fetchedAt),
  timeBasis:data.poolTimestamp!=null?'涨停池时点':assessment.newest!=null?'指数时点':'取数时点',
  issue:valid?'':assessment.dataIssue||'行情快照待验证',
  fields,themes,previousDate:verifiedPrior?prior!.date:null,
  previousCodes:previous.map(s=>s.code),
  stocks:pool.filter(s=>!s.isST).map(({code,name,boards,turnover})=>({code,name,boards,turnover})),
 };
}
