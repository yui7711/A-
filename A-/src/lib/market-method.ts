import {sealSource,type SealSnapshot} from './closing-signals.ts';
import type {Market} from './market-types.ts';
import {buildResearch} from './research.ts';
import {assessTactics} from './tactics.ts';

const minute=(at:number)=>Math.floor((at/60000+480)%1440);
const sourceTime=(data:Market)=>data.poolTimestamp??Date.parse(data.fetchedAt);
const taxonomy=(data:Market)=>data.themeBasis??(sealSource(data)==='FUYAO'?'reason':'industry');

export function marketMethod(data:Market|null,now:number,records:SealSnapshot[]){
 const context=assessTactics(data,now);
 const current=buildResearch(data,context);
 const source=data&&sealSource(data);
 const available=!!data&&!data.cached&&!current.blocked&&current.cycle.index>=0;
 const at=data?sourceTime(data):NaN;
 const options=available&&source?records.filter(s=>s.origin==='cloud'&&s.source===source&&s.market&&s.at<at&&s.date<=data.tradeDate!):[];
 const latest=(list:SealSnapshot[])=>list.sort((a,b)=>b.at-a.at)[0];
 const afternoon=Number.isFinite(at)&&minute(at)>=810;
 const noon=latest(options.filter(s=>afternoon&&s.date===data!.tradeDate&&s.slot==='noon'));
 const prior=latest(options.filter(s=>s.date<data!.tradeDate!&&s.slot==='late'));
 const priorResearch=prior?.market&&prior.date===data?.research?.previousDate
  ?buildResearch(prior.market,assessTactics(prior.market,Date.parse(prior.date+'T16:30:00+08:00'))):null;
 const baseline=noon??prior;
 const baselineNow=baseline?Date.parse(baseline.date+(baseline.slot==='noon'?'T12:00:00':'T16:30:00')+'+08:00'):0;
 const earlier=baseline?.market&&!baseline.market.cached?buildResearch(baseline.market,assessTactics(baseline.market,baselineNow)):null;
 const comparable=!!earlier&&!earlier.blocked&&earlier.cycle.index>=0&&earlier.blast!=null&&current.blast!=null;
 const blastDelta=comparable?current.blast!-earlier!.blast!:null;
 const widthDelta=comparable&&current.up!=null&&earlier!.up!=null?current.up-earlier!.up:null;
 const heightDelta=comparable&&current.highest!=null&&earlier!.highest!=null?current.highest-earlier!.highest:null;
 const improves=widthDelta!=null&&widthDelta>0&&blastDelta!=null&&blastDelta<0;
 const weakens=widthDelta!=null&&widthDelta<0&&blastDelta!=null&&blastDelta>0;
 const canCompareThemes=available&&comparable&&baseline?.market&&data&&taxonomy(baseline.market)===taxonomy(data)
  &&!data.research?.themeCoverage&&!baseline.market.research?.themeCoverage;
 const previousLines=canCompareThemes?earlier!.mainlines.lines.slice(0,3):current.history.continuity!=null?current.history.previousLines:[];
 const currentLines=available?current.mainlines.lines.slice(0,3):[];
 const top=currentLines[0],oldTop=previousLines[0];
 const oldCurrent=oldTop&&current.mainlines.lines.find(line=>line.name===oldTop.name);
 const switched=!!top&&!!oldTop&&top.name!==oldTop.name;
 const oldWeakened=oldCurrent?oldCurrent.count<oldTop!.count:current.mainlines.unclassified===0;
 const switchCandidate=switched&&top.count>=5&&top.ladder>0&&oldWeakened;
 return {current,source,at,baseline:comparable?baseline:null,earlier:comparable?earlier:null,blastDelta,widthDelta,heightDelta,improves,weakens,
  previousLines,currentLines,switched,switchCandidate,priorClose:priorResearch&&!priorResearch.blocked?priorResearch:null,
  themeBaseline:canCompareThemes?baseline?.date:current.history.prior?.date};
}
