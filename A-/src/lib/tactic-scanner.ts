import type {Stock} from './market-types';
import type {assessTactics} from './tactics';

export function compareObservation(a:Stock,b:Stock){
 const value=(s:Stock)=>Number.isFinite(s.score)?s.score:-1;
 return value(b)-value(a)||(b.coverage||0)-(a.coverage||0)||b.boards-a.boards||a.code.localeCompare(b.code);
}
type Assessment=ReturnType<typeof assessTactics>;
type Strategy=Assessment['tactics'][number];
export type ScanMatch={id:string;name:string;stateId:Strategy['stateId'];color:string;label:string;fit:number;score:number;reason:string};
export type ScanRow={stock:Stock;matches:ScanMatch[];best:ScanMatch;score:number;tier:'available'|'waiting'};

/** Counts each stock once; multiple overlapping tactics are explanations, never additive bonuses. */
export function buildTacticScanner(a:Assessment){
 const rows=new Map<string,ScanRow>(),unscored=new Set<string>();
 const strategies=a.tactics.map(t=>{
  const included=t.stateId==='research'||t.stateId==='waiting';
  const factor=t.stateId==='research'?1:t.stateId==='waiting'?.6:0;
  const fit=included?Math.round(t.matches/t.checks.length*100*factor):null;
  if(included)for(const stock of t.candidates){
   if(!Number.isFinite(stock.score)||stock.score<0||!Number.isFinite(stock.coverage)||stock.coverage<=0||stock.coverage>100||stock.score>stock.coverage){unscored.add(stock.code);continue;}
   const score=Math.round(fit!*.6+stock.score*.4);
   const match:ScanMatch={id:t.id,name:t.name,stateId:t.stateId,color:t.state.color,label:t.state.label,fit:fit!,score,reason:t.stateReason};
   const old=rows.get(stock.code);
   if(old){old.matches.push(match);if(score>old.score||score===old.score&&t.stateId==='research'&&old.best.stateId!=='research'){old.best=match;old.score=score;old.tier=t.stateId==='research'?'available':'waiting';}}
   else rows.set(stock.code,{stock,matches:[match],best:match,score,tier:t.stateId==='research'?'available':'waiting'});
  }
  return {id:t.id,name:t.name,color:t.state.color,label:t.state.label,stateId:t.stateId,fit,matches:t.matches,total:t.checks.length,count:t.candidates.length,reason:t.stateReason};
 }).sort((x,y)=>(y.fit??-1)-(x.fit??-1)||Number(y.id===a.primaryId)-Number(x.id===a.primaryId)||x.id.localeCompare(y.id));
 const ranked=[...rows.values()].sort((x,y)=>y.score-x.score||compareObservation(x.stock,y.stock));
 return {rows:ranked,strategies,available:ranked.filter(r=>r.tier==='available'),waiting:ranked.filter(r=>r.tier==='waiting'),excluded:strategies.filter(s=>s.fit==null).length,unscored:unscored.size};
}
