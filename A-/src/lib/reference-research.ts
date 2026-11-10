import {sealSource,type SealSnapshot} from './closing-signals.ts';
import type {Market,Stock} from './market-types.ts';
import {buildMainlines} from './research.ts';
import type {marketMethod} from './market-method.ts';
import {asOf,priorPerformance,cnMinute,middleEvidence,type DecisionProof} from './decision-proof.ts';

export type Evidence={label:string;passed:boolean|null;detail?:string};
type Method=ReturnType<typeof marketMethod>;
type Line=ReturnType<typeof buildMainlines>['lines'][number];
const check=(label:string,passed:boolean|null=null,detail?:string):Evidence=>({label,passed,detail});
const metric=(n:number|null|undefined,fn:(value:number)=>boolean)=>n==null?null:fn(n);
const pct=(n:number|null)=>n==null?'待核验':(n*100).toFixed(1)+'%';
const nameFor=(d:Market)=>d.themeBasis??(sealSource(d)==='FUYAO'?'reason':'industry');

export function handbookTurning(data:Market|null,m:Method,proof?:DecisionProof|null){
 const r=m.current,valid=!!data&&!data.cached&&!r.blocked;
 const up=valid?r.up:null,down=valid?r.down:null,highest=valid?r.highest:null,blast=valid?r.blast:null;
 const priorClose=m.priorClose;
 const heightDelta=highest!=null&&priorClose?.highest!=null?highest-priorClose.highest:null;
 const blastDelta=blast!=null&&priorClose?.blast!=null?blast-priorClose.blast:null;
 const pool=valid?data!.stocks.filter(s=>!s.isST):null;
 const leaders=pool?.filter(s=>s.boards>=2).length;
 const first=pool?.filter(s=>s.boards===1).length;
 const second=pool?.filter(s=>s.boards===2).length;
 const top=valid?m.currentLines[0]:null;
 const prior=valid&&data?priorPerformance(data,proof):null;
 const priorWhy=prior?.total?`腾讯及备用源同刻报价覆盖 ${prior.coverage}/${prior.total} · 需覆盖全部昨日涨停股`:'缺上一交易日完整涨停名单或行情仍在加载';
 return [
  {name:'出清拐点',path:'崩塌 → 冰点',signals:[check('跌停数较高峰减少至少一半',null,'需要完整周期的跌停峰值'),check('涨停连续两日不再创新低',null,'需要连续两个交易日的同口径收盘档案'),check('昨日涨停溢价止跌',metric(prior?.premium,n=>n>=-1),priorWhy),check('跌停少于 10 家且涨停至少 20 家',up==null||down==null?null:down<10&&up>=20),check('最高板不超过 2 板',metric(highest,n=>n<=2))]},
  {name:'试错拐点',path:'冰点 → 修复',signals:[check('最高板由 2 板升到 3 板',priorClose?.highest!=null&&highest!=null?priorClose.highest===2&&highest===3:null),check('涨停至少 25 家',metric(up,n=>n>=25)),check('同题材至少 3 只涨停',metric(top?.count,n=>n>=3)),check('连板样本至少 6 家',metric(leaders,n=>n>=6)),check('跌停少于 15 家',metric(down,n=>n<15)),check('次日晋级或维持红盘',null,'需该三板股下一交易日真实行情')]},
  {name:'启动拐点',path:'修复 → 启动',signals:[check('昨日涨停溢价达到非负',metric(prior?.premium,n=>n>=0),priorWhy+'；首次转正仍需前一日同口径溢价'),check('炸板率低于 30%',metric(blast,n=>n<.30),pct(blast)),check('有 3 板、2–3 只二板、至少 5 只首板',pool?pool.some(s=>s.boards===3)&&second!>=2&&second!<=3&&first!>=5:null),check('首板到二板晋级率超过 25%',metric(prior?.firstPromotion,n=>n>.25),'同口径涨停名单按股票代码匹配'),check('最高 4 板且首位题材占比超过 20%',highest!=null&&top?highest===4&&top.share>.2:null)]},
  {name:'确认拐点',path:'启动 → 确认',signals:[check('龙头放量分歧后回封'),check('分歧发生在 3–4 板'),check('同题材新首板补位'),check('中位股未批量跌停'),check('次日高开并快速封板或缩量确认')]},
  {name:'加速拐点',path:'确认 → 高潮',signals:[check('涨停突破 85 家',metric(up,n=>n>85)),check('最高板至少 6 板',metric(highest,n=>n>=6)),check('至少六个行业有涨停',valid&&data&&nameFor(data)==='industry'&&r.mainlines.unclassified===0?r.mainlines.lines.length>=6:null),check('炸板率低于 18%',metric(blast,n=>n<.18),pct(blast)),check('无大面股且昨日涨停溢价超过 3%',prior?.largeLoss!=null&&prior.premium!=null?prior.largeLoss===0&&prior.premium>3:null,priorWhy)]},
  {name:'见顶拐点',path:'高潮 → 分歧',signals:[check('炸板率较前一日升至少 10 个百分点且达到 30%',blastDelta!=null&&blast!=null?blastDelta+1e-9>=.10&&blast>=.30:null),check('中位股批量断板或跌停'),check('大面股至少 3 家',metric(prior?.largeLoss,n=>n>=3),priorWhy),check('昨日涨停溢价较前日回落'),check('出现天地板或高位爆量不封')]},
  {name:'退潮拐点',path:'分歧 → 退潮',signals:[check('最高板较前一日降低至少 2 板',metric(heightDelta,n=>n<=-2)),check('大面股至少 5 家',metric(prior?.largeLoss,n=>n>=5),priorWhy),check('昨日涨停溢价为负',metric(prior?.premium,n=>n<0),priorWhy),check('连板晋级率低于 25%',metric(prior?.promotion,n=>n<.25),'上一交易日二板及以上名单逐股匹配'),check('跌停至少 10 家',metric(down,n=>n>=10))]},
  {name:'崩塌拐点',path:'退潮 → 崩塌',signals:[check('跌停达到 20 家且继续增加',down!=null&&priorClose?.down!=null?down>=20&&down>priorClose.down:null),check('昨日涨停溢价低于 −3%',metric(prior?.premium,n=>n< -3),priorWhy),check('炸板率超过 45%',metric(blast,n=>n>.45),pct(blast)),check('涨停少于 35 家且大面股超过 10 家',up!=null&&up>=35?false:up!=null&&prior?.largeLoss!=null?prior.largeLoss>10:null,priorWhy),check('最高板不超过 2 板',metric(highest,n=>n<=2))]},
 ];
}

export function handbookTurnCandidate(cards:ReturnType<typeof handbookTurning>,phase:string){
 const alias:Record<string,string[]>={发酵:['确认'],衰退:['退潮','崩塌']};
 const anchors=alias[phase]??[phase];
 const ranked=cards.filter(c=>c.path.split(' → ').some(s=>anchors.includes(s)))
  .map(c=>({name:c.name,path:c.path,yes:c.signals.filter(x=>x.passed===true).length}))
  .sort((a,b)=>b.yes-a.yes);
 const [top,next]=ranked;
 return top&&(top.yes>=3||top.yes>=2&&top.yes>(next?.yes??0))&&top.yes!==(next?.yes??0)?top:null;
}

export function referenceRotation(data:Market|null,m:Method,records:SealSnapshot[],proof?:DecisionProof|null){
 const top=m.currentLines[0],old=m.previousLines[0],eligible=!!data&&!!top&&!m.current.blocked&&!data.cached;
 const trend=eligible?records.filter(s=>s.origin==='cloud'&&s.slot==='late'&&s.date<data!.tradeDate!&&s.source===m.source&&s.market&&!s.market.cached&&nameFor(s.market)===nameFor(data!))
  .sort((a,b)=>a.date.localeCompare(b.date)||a.at-b.at)
  .map(s=>({date:s.date,previous:s.market!.research?.previousDate,lines:buildMainlines(s.market!.stocks)})):[];
 const history=[...new Map(trend.map(x=>[x.date,x])).values()].slice(-5);
 const current=eligible?{date:data!.tradeDate!,previous:data!.research?.previousDate,lines:m.current.mainlines}:null;
 const byName=(lines:typeof m.current.mainlines,name:string)=>lines.lines.find(t=>t.name===name)?.count??(lines.unclassified===0?0:null);
 const consecutive=(n:number)=>{
  if(!current||history.length<n-1)return null;
  const rows=[...history.slice(1-n),current];
  return rows.every((row,i)=>row.lines.unclassified===0&&(i===0||row.previous===rows[i-1].date))?rows:null;
 };
 const three=consecutive(3),two=consecutive(2);
 const newName=top?.name,oldName=old?.name,different=!!top&&!!old&&newName!==oldName;
 const newCounts=three&&newName?three.map(row=>byName(row.lines,newName)):null;
 const oldCurrent=oldName&&current?byName(current.lines,oldName):null;
 const sameProof=eligible&&proof&&proof.date===data!.tradeDate&&Math.abs(proof.at-asOf(data!))<=180000?proof:null;
 const oldMid=old&&sameProof&&sameProof.previousDate===m.themeBaseline
  ?old.stocks.filter(s=>s.boards>=3&&s.boards<=5):null;
 const midLimitDown=oldMid&&sameProof?.pools.down?oldMid.filter(s=>sameProof.pools.down!.includes(s.code)).length:null;
 const priorOld=three&&oldName?three[0].lines.lines.find(x=>x.name===oldName)?.stocks[0]:null;
 const noReseal=priorOld&&three&&data&&cnMinute(asOf(data))>=900?three.slice(1).every(row=>!row.lines.lines.some(l=>l.stocks.some(s=>s.code===priorOld.code))):null;
 const stable=(predicate:(values:number[])=>boolean)=>newCounts?.every((v):v is number=>v!=null)?predicate(newCounts):null;
 const dead=[
  check('旧龙头断板且次日未反包',noReseal,'需三日同口径收盘档案，逐股查验后两日是否重新封板'),
  check('旧题材涨停数较完整周期峰值回落超过一半',null,'归档窗口不等于完整周期峰值'),check('板块指数跌破五日线并转弱',null,'需要旧题材对应的板块指数日线'),
  check('旧中军大阴破位',null,'需要已确认的旧中军及其日线'),check('补涨接力失效',null,'缺少已确认的旧补涨名单'),
  check('至少三只旧题材中位股跌停',midLimitDown==null?null:midLimitDown>=3,midLimitDown==null?'需要同日东方财富跌停池与前日同口径旧题材样本':`${midLimitDown} 只 · 东方财富跌停池`),
  check('旧题材昨日涨停溢价连续两日为负',null,'需要旧题材连续两日完整逐股报价'),
 ];
 const born=[
  check('新方向连续三个交易日出现涨停',different?stable(values=>values.every(v=>v>0)):null),
  check('新方向至少 3 板，且高标题材归属已核验',different&&top!.highest<3?false:null,different?`当前最高 ${top!.highest} 板，题材纯度需核验`:undefined),
  check('新方向涨停至少 5 家且逐日增加',different&&top!.count<5?false:different?stable(values=>values.every((v,i)=>!i||v>values[i-1])):null),
  check('新方向同时有二板和首板',different?top!.stocks.some(s=>s.boards===1)&&top!.stocks.some(s=>s.boards===2):null),
  check('中大市值中军放量启动',different&&data&&newName?middleEvidence(data,sameProof,newName)?.breakout??null:null,'需板块成交前列、流通市值、同日上涨、五日均量及均线证据'),check('有可验证的持续催化',null,'需公告或产业事件、发布时间及题材关联'),
  check('新方向涨停数超过旧方向',different&&oldCurrent!=null?top!.count>oldCurrent:null),
 ];
 const final=[
  check('新方向高度超过旧线退潮时的高度'),
  check('新方向涨停数连续两日超过旧方向',different&&two?(()=>{
   const pairs=two.map(row=>[byName(row.lines,newName!),byName(row.lines,oldName!)]);
   return pairs.every(([a,b])=>a!=null&&b!=null)?pairs.every(([a,b])=>a!>b!):null;
  })():null),
  check('旧龙头断板后连续跌停'),
 ];
 const confirmed=different&&m.themeBaseline!==data?.tradeDate&&dead.filter(x=>x.passed===true).length>=3&&born.every(x=>x.passed===true)&&final.filter(x=>x.passed===true).length>=2;
 const rows=current?[...history,current]:history;
 const industryFallback=eligible&&rows.length<2?records.filter(s=>s.origin==='cloud'&&s.slot==='late'&&s.source==='东方财富'
  &&s.market&&!s.market.cached&&nameFor(s.market)==='industry'&&(s.date<data!.tradeDate!||s.date===data!.tradeDate&&s.at<=m.at))
  .sort((a,b)=>a.date.localeCompare(b.date)||a.at-b.at)
  .map(s=>({date:s.date,lines:buildMainlines(s.market!.stocks)})):[];
 const showIndustry=industryFallback.length>=2;
 const display=showIndustry?[...new Map(industryFallback.map(s=>[s.date,s])).values()].slice(-5):rows;
 const leadNames=showIndustry?display.at(-1)?.lines.lines.slice(0,3).map(x=>x.name)||[]:[...m.currentLines,...m.previousLines].map(x=>x.name);
 const names=[...new Set([...leadNames,...display.flatMap(row=>row.lines.lines.slice(0,2).map(x=>x.name))])].slice(0,8);
 return {dead,born,final,confirmed,trendSource:showIndustry?'东方财富 · 行业归类，仅作独立趋势对照':`${m.source||'来源待核验'} · 同口径归档`,
  dates:display.map(r=>r.date),trend:names.map(name=>({name,counts:display.map(row=>byName(row.lines,name))}))};
}

export function themeRoles(line:Line){
 const leader=line.stocks[0];
 const middle=[...line.stocks].filter(s=>s.code!==leader?.code&&s.amount!=null&&s.amount>0).sort((a,b)=>b.amount!-a.amount!)[0];
 const stamp=(s:Stock)=>/^\d\d:\d\d/.test(s.time)?s.time.slice(0,5):null;
 const leaderTime=leader&&stamp(leader);
 const followers=leaderTime&&leader.boards>=4?line.stocks.filter(s=>s.boards>=1&&s.boards<=2&&stamp(s)&&stamp(s)!>leaderTime&&stamp(s)!<='11:30').slice(0,3):[];
 const levels=[...new Set(line.stocks.map(s=>s.boards))].sort((a,b)=>a-b);
 return {leader,middle,followers,levels};
}
