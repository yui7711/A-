import type {History,Market,Quote,Stock} from './market-types.ts';
import {buildMainlines} from './research.ts';
import {quoteEpoch,marketClock} from './tactics.ts';
import type {Evidence} from './reference-research.ts';
import {sealSource,type SealSnapshot} from './closing-signals.ts';

export type PoolProof={limitUp:Record<string,number|null>|null;broken:string[]|null;down:string[]|null};
export type SectorMember={code:string;name:string;cap:number|null;amount:number;change:number|null};
export type DecisionProof={date:string;at:number;previousDate:string|null;prior:Stock[];quotes:Quote[];pools:PoolProof;daily:Record<string,History>;sector?:{name:string;members:SectorMember[]}};
export const emptyPools:PoolProof={limitUp:null,broken:null,down:null};
export const asOf=(d:Market)=>d.poolTimestamp??Math.max(0,...d.indices.map(q=>quoteEpoch(q.time)||0));
export const cnMinute=(at:number)=>Math.floor((at/60000+480)%1440);
const avg=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const evidence=(label:string,passed:boolean|null,detail:string):Evidence=>({label,passed,detail});
const known=(v:number|null|undefined,fn:(n:number)=>boolean)=>finite(v)?fn(v):null;

export function withPreviousSnapshot(data:Market,records:SealSnapshot[]){
 const research=data.research;
 if(!research||research.previousPool?.complete||research.tradeDate!==data.tradeDate||!research.previousDate)return data;
 const source=sealSource(data),date=research.previousDate;
 const snapshot=records.filter(s=>s.origin==='cloud'&&s.slot==='late'&&s.source===source&&s.date===date)
  .sort((a,b)=>b.at-a.at).find(s=>{
   const m=s.market;
   return m&&!m.cached&&m.tradeDate===date&&m.poolDate===date&&m.themeBasis===data.themeBasis
    &&m.poolTotal===m.stocks.length&&m.stats.up===m.stocks.length&&new Set(m.stocks.map(x=>x.code)).size===m.stocks.length;
  });
 if(!snapshot?.market||!source)return data;
 const stocks=snapshot.market.stocks;
 return {...data,research:{...research,previousPool:{date,total:stocks.length,complete:true,stocks,source,taxonomy:data.themeBasis??(source==='FUYAO'?'reason':'industry')}}};
}

export function closingVolumeRatio(h:History|undefined,date:string|null,at:number){
 if(!h||!date||cnMinute(at)<900)return null;
 const rows=h.points.filter(x=>x.time<=date);
 const bar=rows.at(-1),before=rows.slice(-6,-1).map(x=>x.volume);
 return bar?.time===date&&finite(bar.volume)&&before.length===5&&before.every((v):v is number=>finite(v)&&v>0)?bar.volume/avg(before):null;
}

export function sameMoment(q:Quote,date:string,at:number){
 const stamp=quoteEpoch(q.time);
 return stamp!=null&&marketClock(stamp).date===date
  &&(cnMinute(at)>=900?cnMinute(stamp)>=900:Math.abs(stamp-at)<=180000);
}

export function priorPerformance(data:Market,proof?:DecisionProof|null){
 const p=proof?.date===data.tradeDate&&Math.abs(proof.at-asOf(data))<=180000?proof:null;
 const prior=p?.prior||[];
 const quotes=new Map((p?.quotes||[]).filter(q=>sameMoment(q,p!.date,p!.at)&&finite(q.change)).map(q=>[q.code.slice(2),q.change!]));
 const complete=prior.length>0&&prior.every(s=>quotes.has(s.code));
 const changes=complete?prior.map(s=>quotes.get(s.code)!):[];
 const today=new Map(data.stocks.map(s=>[s.code,s.boards]));
 const priorLadder=prior.filter(s=>s.boards>=2),first=prior.filter(s=>s.boards===1);
 const aligned=!data.cached&&data.tradeDate===data.poolDate&&data.poolTotal===data.stocks.length
  &&data.stats.up===priorUniverse(data,prior)&&today.size===data.stocks.length;
 const ratio=(group:Stock[],fn:(s:Stock)=>boolean)=>aligned&&group.length?group.filter(fn).length/group.length:null;
 return {premium:changes.length?avg(changes):null,largeLoss:changes.length?changes.filter(n=>n< -9).length:null,
  promotion:ratio(priorLadder,s=>today.get(s.code)===s.boards+1),firstPromotion:ratio(first,s=>today.get(s.code)===2),
  coverage:prior.filter(s=>quotes.has(s.code)).length,total:prior.length};
}

export function middleEvidence(data:Market,proof:DecisionProof|null|undefined,theme:string){
 if(!proof||proof.date!==data.tradeDate||Math.abs(proof.at-asOf(data))>180000||proof.sector?.name!==theme)return null;
 const candidate=proof.sector.members.find(s=>s.cap!=null&&s.cap>=100e8&&s.cap<=800e8
  &&!data.stocks.some(x=>x.code===s.code&&x.boards>=2));
 if(!candidate)return null;
 const history=proof.daily[candidate.code];
 const rows=history?.points.filter(x=>x.time<=proof.date)||[];
 const bar=cnMinute(proof.at)>=900&&rows.at(-1)?.time===proof.date?rows.at(-1):null;
 const ma=(n:number)=>rows.length>=n?avg(rows.slice(-n).map(x=>x.price)):null;
 const ma5=bar?ma(5):null,ma10=bar?ma(10):null,ma20=bar?ma(20):null;
 const trend=ma5!=null&&ma10!=null&&ma20!=null?ma5>ma10&&ma10>ma20:null;
 const volumes=bar?rows.slice(-6,-1).map(x=>x.volume):[];
 const volume=finite(bar?.volume)&&volumes.length===5&&volumes.every((v):v is number=>finite(v)&&v>0)?bar.volume/avg(volumes):null;
 const breakout=trend!=null&&volume!=null&&candidate.change!=null?trend&&volume>1&&candidate.change>0:null;
 return {candidate,trend,volume,breakout,breakdown:bar&&ma10!=null&&candidate.change!=null?candidate.change< -5&&bar.price<ma10:null};
}

function priorUniverse(data:Market,prior:Stock[]){
 if(data.stats.up===data.stocks.length)return data.stocks.length;
 if(prior.some(s=>s.isST))return -1;
 return data.stocks.filter(s=>!s.isST).length;
}

export function classifyRoleEvidence(stock:Stock,data:Market,proof?:DecisionProof|null,themeName?:string){
 const at=asOf(data);
 const p=proof?.date===data.tradeDate&&Math.abs(proof.at-at)<=180000?proof:null;
 const lines=buildMainlines(data.stocks).lines;
 const groups=lines.filter(g=>g.stocks.some(s=>s.code===stock.code));
 const group=themeName?groups.find(g=>g.name===themeName):groups.length===1?groups[0]:undefined;
 const peers=group?.stocks||[];
 const full=!!group&&data.poolTotal===data.stocks.length;
 const allKnown=(fn:(s:Stock)=>boolean)=>full&&peers.every(fn);
 const time=(s:Stock)=>/^\d\d:\d\d/.test(s.time)?s.time.slice(0,5):null;
 const first=time(stock);
 const cap=p?.pools.limitUp?.[stock.code],middle=group?middleEvidence(data,p,group.name):null;
 const close=cnMinute(at)>=900;
 const h=p?.daily[stock.code],rows=h?.points.filter(x=>x.time<=p!.date)||[];
 const bar=close&&rows.at(-1)?.time===p?.date?rows.at(-1):undefined;
 const before=bar?rows.slice(0,-1):rows.filter(x=>x.time<data.tradeDate!);
 const volumeRatio=closingVolumeRatio(h,data.tradeDate,at);
 const prev5=before.slice(-5);
 const firstBelow=bar&&prev5.length===5?bar.price<avg([...prev5.slice(1).map(b=>b.price),bar.price])&&prev5[4].price>=avg(prev5.map(x=>x.price)):null;
 const volumeWhy=volumeRatio==null?'需要当日收盘与此前五根同源有效日线':`${h?.source} · 当日量/前五日均量 ${volumeRatio.toFixed(2)} 倍`;
 const good=[
  evidence('板块或市场高度最高',full?stock.boards===group!.highest:stock.boards===Math.max(...data.stocks.map(s=>s.boards))&&data.poolTotal===data.stocks.length?true:null,group?'同题材涨停梯队':'候选题材归属待核验'),
  evidence('板块内首封最早',first&&allKnown(s=>!!time(s))?peers.every(s=>time(s)!>=first):null,'同题材首封时点；需要全组时点'),
  evidence('板块内封单最大',finite(stock.seal)&&allKnown(s=>finite(s.seal))?peers.every(s=>s.seal!<=stock.seal!):null,'同题材当前封单金额；需要全组金额'),
  evidence('首封后至少三只同题材样本跟进',first&&allKnown(s=>!!time(s))?peers.filter(s=>s.code!==stock.code&&time(s)!>first).length>=3:null,'按首封时序核对，不推断因果'),
  evidence('题材纯正',null,'涨停原因或行业标签不足以证明业务纯度'),
  evidence('达到三板',known(stock.boards,n=>n>=3),'涨停池连板数'),
  evidence('换手率 15%–35%',known(stock.turnover,n=>n>=15&&n<=35),'涨停池或同日个股报价'),
  evidence('分时未跌破均价线',null,'需要逐分钟价格及同刻均价'),
  evidence('有持续催化',null,'需要带时点的公告或产业事件及业务对应'),
  evidence('有中军配合',middle?.breakout??null,middle?`${middle.candidate.name} · 行业成交额前列 · 核对多头均线及放量上涨`:'需要全板块成交、体量和趋势确认'),
  evidence('下方有梯队补位',full?peers.some(s=>s.boards<stock.boards&&s.code!==stock.code):null,'同题材有更低板位涨停样本'),
  evidence('龙虎榜资金结构健康',null,'当前榜单只提供净额，缺席位结构'),
  evidence('流通市值 30–150 亿',known(cap,n=>n>=30e8&&n<=150e8),'东方财富同日涨停池流通市值'),
  evidence('有市场辨识度',null,'尚无可核验的统一识别条件'),
  evidence('分歧后转一致',null,'开板后封住仅能验证回封，缺次日转一致证据'),
  evidence('分时无异常操纵特征',null,'日线和公开盘口无法判断'),
  evidence('进入当日人气榜',data.sources.some(s=>s.id==='hot'&&s.date===data.tradeDate&&s.status==='ok')?data.hot.some(s=>s.code===stock.code):null,'同日可见人气榜样本'),
 ];
 const bad=[
  evidence('超过三倍量且反复开板',volumeRatio!=null&&stock.openTimes!=null?volumeRatio>3&&stock.openTimes>=3:null,volumeWhy),
  evidence('高位爆量冲板未封',p?.pools.broken&&volumeRatio!=null?stock.boards>=3&&p.pools.broken.includes(stock.code)&&volumeRatio>3:null,'东方财富炸板池与同源五日均量'),
  evidence('缩量加速后突然放量',null,'需要前一时段的加速及换手序列'),
  evidence('首次跌破五日线',firstBelow,h?.source||'需要当日收盘和前六根日线'),
  evidence('龙虎榜拉萨接盘或主力净卖',null,'需要同日席位和资金结构，普通净额不能替代'),
  evidence('题材补涨接力消失',null,'需要上一交易日已验证补涨名单与当日状态'),
  evidence('同身位候选卡位',null,'同板位并列不等于卡位，需盘口先后和承接'),
  evidence('题材中位股批量跌停',p?.pools.down&&group&&p.previousDate&&p.prior.length?(
   buildMainlines(p.prior).lines.find(g=>g.name===group.name)?.stocks.filter(s=>s.boards>=3&&s.boards<=5&&p.pools.down!.includes(s.code)).length??0
  )>=3?true:null:null,'东方财富跌停池与上一交易日中位梯队；仅核实命中'),
  evidence('中军大阴破位',middle?.trend===true?middle.breakdown:null,'中军候选须先有趋势证据，再核对跌超 5% 与跌破十日线'),
  evidence('尾盘勉强封板，封单不足一万手',null,'当前记录是封单金额，缺尾盘封单手数和最终封板时点'),
  evidence('出现天地板',null,'需要涨跌停价及先涨停后跌停的时序'),
  evidence('竞价高开后直线下杀',null,'需要竞价与开盘逐分钟序列'),
 ];
 const hit=(list:Evidence[])=>list.filter(x=>x.passed===true).length;
 const gaps=(list:Evidence[])=>list.filter(x=>x.passed==null).length;
 const g=hit(good),b=hit(bad),gu=gaps(good),bu=gaps(bad);
 return {good,bad,g,b,gu,bu,
  leader:g>=12?'已达龙头成色门槛':g+gu<8?'成色未达到候选门槛':g>=8?'强候选，龙头成色待确认':'龙头成色待核验',
  top:b>=5?'见顶 · 重度警示':b>=3?'见顶 · 中度预警':b>0?'见顶 · 轻度预警':bu?'见顶证据待核验':'本轮未命中见顶信号',
 };
}
