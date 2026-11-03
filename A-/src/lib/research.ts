import type {Market,Stock} from './market-types';

const clamp=(n:number)=>Math.max(0,Math.min(10,n));
const score=(n:number)=>Math.round(clamp(n)*10)/10;
const noise=/融资融券|沪股通|深股通|转融通|MSCI|富时|标普|机构重仓|证金持股|养老金|社保重仓|沪深300|中证\d+|昨日涨停|连板股|次新股|一字板|低价股|超跌|ST板块|退市|字辈|谐音|生肖|三季报|半年报|年报|业绩|国企改革|国资|央企|股权|重组|并购|回购|分红|摘帽|资产注入|高送转|海峡两岸|福建|粤港澳|雄安|一带一路|西部开发/;
const aliases:[string,RegExp][]=[
 ['新能源电池',/钠.*电池|固态电池|锂.*电池|锂电|储能电池|动力电池|电池回收|^电池$|蓄电池/],
 ['传媒',/游戏|出版|影视|短剧|传媒|文化传媒/],
 ['水产养殖',/水产|海参|养殖.*鱼|渔业|海洋牧场/],
 ['电网设备',/电网|输变电|变压器|特高压|电力设备/],
 ['半导体',/半导体|集成电路|存储芯片|芯片/],
 ['机器人',/机器人|减速器|丝杠|灵巧手/],
 ['储能',/储能/],
 ['算力',/算力|数据中心|液冷|服务器/],
 ['商业航天',/商业航天|卫星互联网|低轨卫星/],
];
export function buildMainlines(stocks:Stock[]){
 const unique=[...new Map(stocks.map(s=>[s.code,s])).values()],pool=unique.filter(s=>!s.isST);
 const groups=new Map<string,{name:string;stocks:Stock[];tags:Set<string>}>(),removed=new Set<string>();
 for(const s of pool){
  const perStock=new Set<string>();
  for(const raw of s.themes){
   const tag=raw.replace(/[“”"']/g,'').trim();
   if(!tag||tag==='暂无题材说明'||tag==='行业未返回'||noise.test(tag)){if(tag)removed.add(tag);continue;}
   const name=aliases.find(([,pattern])=>pattern.test(tag))?.[0]||tag;
   const group=groups.get(name)||{name,stocks:[],tags:new Set<string>()};group.tags.add(tag);
   if(!perStock.has(name)){group.stocks.push(s);perStock.add(name);}groups.set(name,group);
  }
 }
 const lines=[...groups.values()].map(g=>{
  const highest=Math.max(...g.stocks.map(s=>s.boards)),ladder=new Set(g.stocks.filter(s=>s.boards>=2).map(s=>s.boards)).size;
  const seals=g.stocks.map(s=>s.seal).filter((v):v is number=>v!=null),seal=seals.length?seals.reduce((a,b)=>a+b,0):null;
  // A transparent structural heat index, not a price forecast or money-flow measure.
  const heat=Math.round(Math.min(g.stocks.length,12)/12*60+Math.min(highest,6)/6*25+Math.min(ladder,3)/3*15);
  return {name:g.name,count:g.stocks.length,share:pool.length?g.stocks.length/pool.length:0,highest,ladder,seal,sealKnown:seals.length,heat,tags:[...g.tags],stocks:g.stocks.sort((a,b)=>b.boards-a.boards||b.score-a.score)};
 }).sort((a,b)=>b.heat-a.heat||b.count-a.count||a.name.localeCompare(b.name,'zh-CN'));
 return {lines,poolCount:pool.length,excludedST:unique.length-pool.length,duplicates:stocks.length-unique.length,removed:[...removed]};
}

export type ResearchContext={dataIssue?:string;delayed:boolean;defensive:boolean;clock:{live:boolean;label:string;date:string};primary:string};
export function buildResearch(data:Market|null,context:ResearchContext){
 const mainlines=buildMainlines(data?.stocks||[]);
 // Height and ladder use the whole pool, including stocks without usable theme tags.
 const all=[...new Map((data?.stocks||[]).map(s=>[s.code,s])).values()],nonST=all.filter(s=>!s.isST),highest=nonST.length?Math.max(...nonST.map(s=>s.boards)):null;
 const up=data?.stats.up??null,opened=data?.stats.opened??null,down=data?.stats.down??null;
 const aligned=!!data?.tradeDate&&data.tradeDate===data.poolDate;
 const complete=data?.poolTotal!=null&&all.length===data.poolTotal;
 const blast=aligned&&up!=null&&opened!=null&&up+opened>0?opened/(up+opened):null;
 const rate=data?.stats.sealRate??null;
 const consistent=blast!=null&&rate!=null&&Math.abs((1-blast)-rate)<=.03;
 const changes=(data?.indices||[]).map(q=>q.change).filter((n):n is number=>n!=null);
 const avg=changes.length?changes.reduce((a,b)=>a+b,0)/changes.length:null;
 const levels=new Set(nonST.filter(s=>s.boards>=2).map(s=>s.boards)).size;
 const dimensions=[
  {id:'volume',name:'量能 / 主线切换',value:null as number|null,detail:'缺少同口径上一交易日成交额与主线快照，暂不计分。',rule:'需要沪深成交额同比及主线迁移对照；当前标签集中度仅作辅助。'},
  {id:'ladder',name:'连板高度与梯队',value:complete&&highest!=null?score(Math.min(highest,6)/6*7+Math.min(levels,3)):null,detail:highest==null?'涨停池未返回':`非 ST 最高 ${highest} 板 · ${levels} 个连板层级${complete?'':' · 池未完整，暂不计分'}`,rule:'高度 min(最高板,6)÷6×7 + min(连板层级数,3)，上限10分。'},
  {id:'promotion',name:'晋级率 / 接力意愿',value:null as number|null,detail:'缺少上一交易日完整涨停名单，无法核验接力晋级。',rule:'晋级率需昨日涨停股与今日连板股逐只交叉；不能用今日连板占比替代。'},
  {id:'breadth',name:'涨停广度 / 数量',value:aligned&&up!=null?score(up/10):null,detail:up==null?'涨停统计缺失':`源口径涨停 ${up} 家 · 跌停 ${down??'—'} 家`,rule:'涨停家数÷10，上限10分。固定阈值仅作本站研究标尺。'},
  {id:'quality',name:'炸板率 / 封板质量',value:consistent?score((1-blast!)*10):null,detail:blast==null?'炸板统计或同日口径缺失':`炸板率 ${(blast*100).toFixed(1)}%${consistent?(data?.stats.sealRateDerived?' · 按涨停 / 炸板两池计算':' · 与源封板率核对一致'):' · 未通过封板率交叉核对，暂不计分'}`,rule:'炸板数÷(涨停数+炸板数)；分值=(1−炸板率)×10，需源封板率误差≤3个百分点；Pages版封板率为同公式推算，不能视为独立交叉核对。'},
  {id:'index',name:'指数环境 / 大盘配合',value:changes.length===4?score(5+avg!*2):null,detail:avg==null?'四大指数缺失':`四大指数等权均值 ${avg>=0?'+':''}${avg.toFixed(2)}% · ${changes.length}/4 可用`,rule:'5 + 四大指数平均涨跌幅(%)×2，限制在0–10分；需四指数齐备。'},
 ];
 const known=dimensions.filter(d=>d.value!=null),average=known.length?score(known.reduce((sum,d)=>sum+d.value!,0)/known.length):null;
 const dated=!!data&&data.tradeDate===context.clock.date;
 const blocked=!data||context.delayed||!!context.dataIssue||!dated||!aligned;
 const defensive=context.defensive||blast!=null&&blast>=.25||up!=null&&up<40;
 const phase=blocked?'等待有效行情':defensive?'防守观察':average!=null&&average>=7?'偏强 · 继续验证':'分歧 · 条件观察';
 const resealPool=up===nonST.length?nonST:up===all.length?all:[];
 const resealScope=up===nonST.length?'非 ST':'含 ST';
 const recovered=complete&&resealPool.length>0&&resealPool.every(s=>s.openTimes!=null)?resealPool.filter(s=>s.openTimes!>0).length:null;
 const reseal=consistent&&recovered!=null&&opened!=null&&recovered+opened>0?recovered/(recovered+opened):null;
 const highStocks=highest==null?[]:nonST.filter(s=>s.boards===highest);
 const highOpen=highStocks.length&&highStocks.every(s=>s.openTimes!=null)?highStocks.filter(s=>s.openTimes!>1).length:null;
 const condition=(label:string,passed:boolean|null,detail:string)=>({label,passed,detail});
 const checks=[condition('涨停家数 ≥ 80',up==null?null:up>=80,`${up??'—'} 家`),condition('炸板率 < 18%',blast==null?null:blast<.18,blast==null?'待同口径统计':`${(blast*100).toFixed(1)}%`),condition('四大指数平均翻红',avg==null?null:avg>0,avg==null?'指数缺失':`${avg.toFixed(2)}%`),condition('首位主线 ≥ 5 只涨停',mainlines.lines.length?mainlines.lines[0].count>=5:null,`${mainlines.lines[0]?.count??'—'} 只`)];
 const ready=context.clock.live&&!blocked&&!defensive&&complete&&checks.every(c=>c.passed===true);
 return {mainlines,dimensions,known:known.length,average,phase,blocked,defensive,blast,reseal,recovered,resealScope,highOpen,highStocks,highest,up,down,opened,avg,complete,aligned,consistent,poolCount:nonST.length,checks,ready,
  conclusion:blocked?'核实行情日期与源时间后，再评估计划。':defensive?'风险条件已触及，优先防守观察。':ready?'进攻观察条件齐备，仍需核验个股承接。':'先看主线承接，等待环境与个股条件共振。',
  summary:`${data?.tradeDate||'最近交易日'}：涨停 ${up??'—'} 家，炸板 ${opened??'—'} 家，非 ST 最高 ${highest??'—'} 板。${mainlines.lines[0]?`结构热度首位为${mainlines.lines[0].name}（${mainlines.lines[0].count}只）。`:'主线待数据补充。'}`};
}
