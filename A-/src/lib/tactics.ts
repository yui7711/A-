import type {Market,Stock} from './market-types';
import {marketRisk} from './market-risk.ts';
import {locateEmotionCycle} from './emotion-cycle.ts';
export type Check={label:string;passed:boolean|null;detail:string};
export type Tactic={id:string;name:string;description:string;checks:Check[];candidates:Stock[];missing:string[]};
export const tacticStates={
 research:{color:'positive',label:'当前可用',action:'条件满足，可使用该战法筛选；个股买点未确认',meaning:'所需环境与候选条件满足，可使用战法继续筛选和核验。绿色表示战法适用性，不是已确认买点。'},
 waiting:{color:'watch',label:'等待确认 · 谨慎使用',action:'有条件待确认或市场分歧，谨慎核验后再使用',meaning:'已有部分数据支持，仍有条件未满足、未确认，或触及一般谨慎项。'},
 blocked:{color:'risk',label:'不可使用',action:'严重风险门槛触发，暂停使用该战法',meaning:'严重市场风险拦截；即使个别筛选条件满足，仍不可使用。'},
 unsuitable:{color:'risk',label:'不可使用',action:'已核实的适用条件不满足，当前不采用',meaning:'数据已返回，但缺少可用候选或适用条件明显不足。'},
 unavailable:{color:'muted',label:'无数据支撑',action:'所需数据不足或失效，暂停判断',meaning:'缺少日期、时效、完整名单或该战法必要证据，不能判断是否适用。'},
} as const;
export function marketClock(now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(new Date(now));
 const p=(name:string)=>parts.find(v=>v.type===name)?.value||'';
 const minutes=Number(p('hour'))*60+Number(p('minute')),weekend=['Sat','Sun'].includes(p('weekday'));
 const date=`${p('year')}-${p('month')}-${p('day')}`;
 let phase='closed',label='收盘 / 休市';
 if(!weekend){if(minutes>=555&&minutes<570){phase='auction';label='开盘竞价时段';}else if(minutes>=570&&minutes<690||minutes>=780&&minutes<897){phase='live';label='连续竞价时段';}else if(minutes>=897&&minutes<900){phase='auction';label='收盘竞价时段';}else if(minutes>=690&&minutes<780){phase='lunch';label='午间休市';}else if(minutes<555){phase='preopen';label='盘前准备';}}
 return {date,phase,label,live:phase==='live'||phase==='auction'};
}
export function quoteEpoch(time:string){if(!/^\d{14}$/.test(time))return null;const t=Date.parse(`${time.slice(0,4)}-${time.slice(4,6)}-${time.slice(6,8)}T${time.slice(8,10)}:${time.slice(10,12)}:${time.slice(12,14)}+08:00`);return Number.isFinite(t)?t:null;}
export function assessTactics(data:Market|null,now=Date.now()){
 const clock=marketClock(now),pool=(data?.stocks||[]).filter(s=>!s.isST),highest=pool.length?Math.max(...pool.map(s=>s.boards)):0;
 const rate=data?.stats.sealRate??null,up=data?.stats.up??null,down=data?.stats.down??null;
 const changes=(data?.indices||[]).map(q=>q.change).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)),average=changes.length?changes.reduce((a,b)=>a+b,0)/changes.length:null;
 const newest=Math.max(0,...(data?.indices||[]).map(q=>quoteEpoch(q.time)||0));
 const wrongDate=!!data?.tradeDate&&data.tradeDate!==clock.date;
 const quoteTimes=(data?.indices||[]).map(q=>quoteEpoch(q.time));
 const delayed=clock.live&&(wrongDate||quoteTimes.length!==4||quoteTimes.some(t=>!t||now-t>180000||t>now+60000)||!!data?.poolTimestamp&&(now-data.poolTimestamp>180000||data.poolTimestamp>now+60000));
 const opened=data?.stats.opened??null;
 const blast=up!==null&&opened!==null&&up+opened>0?opened/(up+opened):null;
 const risk=marketRisk(data,average),defenseReasons=risk.stops,caution=risk.caution,cautionReasons=risk.warnings;
 const defensive=risk.defensive;
 const topTheme=data?.themes[0]?.count??0;
 const leader=pool.slice().sort((a,b)=>b.boards-a.boards||b.score-a.score).slice(0,8);
 const quoteSameDay=(s:Stock)=>!!s.quoteDate&&s.quoteDate.slice(0,8)===data?.poolDate?.replaceAll('-','');
 const turnoverEvidence=pool.filter(s=>quoteSameDay(s)&&s.high!=null&&s.low!=null&&s.turnover!==null).length;
 const turnover=pool.filter(s=>quoteSameDay(s)&&s.high!=null&&s.low!=null&&s.high>s.low&&s.turnover!==null&&s.turnover>=3&&s.turnover<=35).sort((a,b)=>(b.seal??0)-(a.seal??0)).slice(0,8);
 const weak=pool.filter(s=>s.boards===2).sort((a,b)=>b.score-a.score).slice(0,8);
 const check=(label:string,passed:boolean|null,detail:string):Check=>({label,passed,detail});
 const tactics:Tactic[]=[
  {id:'leader',name:'龙头战法',description:'围绕市场高度与主线集中度，研究高位核心的持续性。',candidates:leader,missing:['主线龙头身份仍需结合题材与盘口验证','高度候选不等于买入信号'],checks:[check('市场高度 ≥ 3 板',highest?highest>=3:null,highest?`${highest} 连板`:'高度缺失'),check('封板率 ≥ 65%',rate===null?null:rate>=.65,rate===null?'统计缺失':`${(rate*100).toFixed(1)}%`),check('指数平均涨幅 ≥ 0',average===null?null:average>=0,average===null?'指数缺失':`${average.toFixed(2)}%`),check('头部题材 ≥ 5 只涨停',data?topTheme>=5:null,`${topTheme} 只`)]},
  {id:'turnover',name:'换手战法',description:'研究存在实际日内波动与成交换手的强势股，排除已知一字板。',candidates:turnover,missing:['换手率筛选范围为本站研究规则：3%–35%','缺少同日 OHLC 或换手率时不认定为换手候选'],checks:[check('有可验证的换手候选',data&&turnoverEvidence?turnover.length>0:null,turnoverEvidence?`${turnover.length} 只；使用同日报价`:'同日 OHLC / 换手证据待更新'),check('封板率 ≥ 55%',rate===null?null:rate>=.55,rate===null?'统计缺失':`${(rate*100).toFixed(1)}%`),check('指数平均跌幅小于 2%',average===null?null:average>-2,average===null?'指数缺失':`${average.toFixed(2)}%`),check('头部题材 ≥ 3 只涨停',data?topTheme>=3:null,`${topTheme} 只`)]},
  {id:'weak',name:'弱转强战法',description:'优先建立二板观察名单，再核验昨日分歧与今日竞价、放量和回封。',candidates:weak,missing:['昨日弱势、今日竞价超预期尚未验证','二板仅是观察候选，不能确认弱转强成立'],checks:[check('有二板观察候选',data?weak.length>0:null,`${weak.length} 只（最多展示8只）`),check('市场高度不超过 4 板',highest?highest<=4:null,highest?`${highest} 连板`:'高度缺失'),check('封板率 ≥ 60%',rate===null?null:rate>=.6,rate===null?'统计缺失':`${(rate*100).toFixed(1)}%`),check('昨日弱 / 今日强已确认',null,'缺少昨日分歧与竞价对照，待验证')]}
 ];
 const preferred=rate!==null&&rate>=.75&&highest>=5?'leader':'turnover';
 const ranked=tactics.map(t=>({...t,matches:t.checks.filter(c=>c.passed===true).length,known:t.checks.filter(c=>c.passed!==null).length})).sort((a,b)=>b.matches-a.matches||Number(b.id===preferred)-Number(a.id===preferred)||a.name.localeCompare(b.name));
 const incompletePool=!!data&&(data.poolTotal==null||data.stocks.length!==data.poolTotal||new Set(data.stocks.map(s=>s.code)).size!==data.poolTotal||data.stocks.some(s=>!/^\d{6}$/.test(s.code)));
 const invalidStats=!!data&&[up,down,opened].some(n=>n!=null&&(!Number.isFinite(n)||n<0))||rate!=null&&(!Number.isFinite(rate)||rate<0||rate>1);
 const indexCodes=['sh000001','sz399001','sz399006','sh000300'];
 const uniqueIndices=new Set((data?.indices||[]).filter(q=>indexCodes.includes(q.code)&&q.price!=null&&Number.isFinite(q.price)&&q.price>0).map(q=>q.code)).size===4;
 const dataIssue=!data?'尚未返回行情':!data.tradeDate||wrongDate?'行情日期与当前日期不一致':data.providerMode==='snapshot'?'当前为备用快照，等待实时通道恢复':data.poolDate!==data.tradeDate?'涨停池与统计日期不一致':delayed?'盘中行情延迟、不完整或时间异常':changes.length!==4||!uniqueIndices?'四大指数未完整、唯一返回':(data.indices.some(q=>!quoteEpoch(q.time)||q.time.slice(0,8)!==data.tradeDate!.replaceAll('-','')))?'指数与涨停池日期不一致':invalidStats?'统计数值超出合法范围':rate===null||up===null||down===null||opened===null?'封板率、涨停、跌停或炸板统计不完整':blast!==null&&Math.abs((1-blast)-rate)>.03?'封板率与涨停 / 炸板统计口径不一致':incompletePool?'完整涨停名单尚未齐备':'';
 const phase=dataIssue?'等待有效行情':locateEmotionCycle({valid:true,up,down,blast,highest:pool.length?highest:null,average,severeRisk:defensive,known:0}).name;
 const eligible=ranked.filter(t=>t.candidates.length&&t.checks.every(c=>c.passed===true));
 const best=dataIssue||defensive||caution||!clock.live?null:eligible[0]||null;
 const classified=ranked.map(t=>{
  const missing=t.checks.filter(c=>c.passed===null),failed=t.checks.filter(c=>c.passed===false);
  const essentialMissing=t.id==='turnover'&&t.checks[0].passed===null;
  const stateId:keyof typeof tacticStates=dataIssue||essentialMissing?'unavailable':defensive?'blocked':!t.candidates.length||t.matches<2?'unsuitable':!clock.live||caution||missing.length||failed.length?'waiting':'research';
  const stateReason=dataIssue|| (essentialMissing?'缺少同日OHLC、换手率或候选证据':defensive?defenseReasons.join('；'):stateId==='research'?'全部战法适用条件满足；个股买点仍需核验。':!clock.live?'休市参考，下一交易时段重新确认':caution?cautionReasons.join('；'):missing.length?'待核实：'+missing.map(c=>c.label).join('、'):!t.candidates.length?'数据已返回，但没有匹配候选。':'未满足：'+failed.map(c=>c.label).join('、'));
  return {...t,stateId,state:tacticStates[stateId],stateReason};
 });
 const status=classified.some(t=>t.stateId==='research')?tacticStates.research:dataIssue?tacticStates.unavailable:defensive?tacticStates.blocked:classified.some(t=>t.stateId==='waiting')?tacticStates.waiting:tacticStates.unsuitable;
 const snapshotLabel=!clock.live?`当前${clock.label}，按 ${data?.tradeDate||'最近'} 快照复盘，下一交易时段再验证。`:'';
 return {clock,phase,delayed,defensive,defenseReasons,caution,cautionReasons,riskLevel:risk.level,dataIssue,status,highest,average,newest:newest||null,primary:best?.name||'观望 / 等待验证',primaryId:best?.id||null,tactics:classified,context:[dataIssue?dataIssue+'，暂停适用性判断。':defensive?defenseReasons.join('；')+'。暂停使用战法。':caution?cautionReasons.join('；')+'。逐项核验战法，谨慎使用。':best?'当前适用'+best.name+'；个股买点仍需核验。':'尚未满足全部适用条件，等待确认。',snapshotLabel].filter(Boolean).join(' ')};
}
