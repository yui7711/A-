import {useState} from 'react';
import type {Market} from '@/lib/market-types';
import {handbookThemeScore,handbookTurnCandidate,handbookTurning,referenceRotation,themeRoles,type Evidence} from '@/lib/reference-research';
import type {marketMethod} from '@/lib/market-method';
import type {SealSnapshot} from '@/lib/closing-signals';
import {buildClosingSignals} from '@/lib/closing-signals';
import {buildTacticScanner} from '@/lib/tactic-scanner';
import {assessTactics} from '@/lib/tactics';
import {buildMainlines} from '@/lib/research';
import {asOf,classifyRoleEvidence,closingVolumeRatio,cnMinute,middleEvidence,priorPerformance,type DecisionProof} from '@/lib/decision-proof';
import {useDecisionProof} from './use-decision-proof';

type Method=ReturnType<typeof marketMethod>;
type Base={data:Market|null;method:Method};
const nums=(n:number|null|undefined,d=0)=>n==null?'待核验':n.toFixed(d);
const cash=(n:number|null|undefined)=>n==null?'待核验':(n/1e8).toFixed(2)+' 亿';
const tally=(checks:Evidence[])=>({yes:checks.filter(s=>s.passed===true).length,known:checks.filter(s=>s.passed!=null).length});
const open=(onStock:(code:string,name:string)=>void,stock:{code:string;name:string})=>onStock(stock.code,stock.name);
function EvidenceList({checks}:{checks:Evidence[]}){
 return <ul className="reference-checks">{checks.map(s=><li key={s.label}>
  <span className={'focus-pill focus-'+(s.passed===true?'positive':s.passed===false?'watch':'muted')}>{s.passed===true?'命中':s.passed===false?'未命中':'待核验'}</span>
  <span>{s.label}{(s.detail||s.passed==null)&&<small>{s.detail||'缺少该规则所需的同口径历史、盘口或事件证据'}</small>}</span>
 </li>)}</ul>;
}

export function TopicBoard({data,method,onStock}:Base&{onStock:(code:string,name:string)=>void}){
 const valid=!!data&&!data.cached&&!method.current.blocked;
 const lines=valid?method.current.mainlines.lines.slice(0,12):[];
 const max=Math.max(1,...lines.map(s=>s.count));
 const industry=data?.sources.find(s=>s.id==='eastmoney');
 const popularity=data?.sources.find(s=>s.id==='hot');
 const sectors=valid&&industry?.date===data?.tradeDate?(data?.sectors||[]).slice(0,12):[];
 const hot=valid&&popularity?.date===data?.tradeDate?(data?.hot||[]).slice(0,12):[];
 return <div className="reference-board">
  <section className="panel reference-panel">
   <h3>涨停题材榜</h3><p>去除 ST 和噪声，同题材同股去重。代表股可点开核对。</p>
   <div className="reference-bars">{lines.map(g=><div key={g.name}>
    <strong>{g.name}</strong><span className="reference-bar" aria-label={g.count+' 只涨停'}><i style={{width:g.count/max*100+'%'}}/></span>
    <b>{g.count} 只</b><small>最高 {g.highest} 板 · {g.stocks.slice(0,3).map(s=>s.name).join('、')}</small>
   </div>)}</div>
   {!lines.length&&<p>等待完整有效的涨停池。</p>}
  </section>
  <section className="panel reference-panel">
   <h3>行业涨幅与主力净流入</h3><p>{industry?.name||'行业来源待确认'} · {industry?.date||'时点待核验'}</p>
   {sectors.length>0?<div className="reference-table"><table><thead><tr><th>行业</th><th>涨跌幅</th><th>主力净流入</th></tr></thead><tbody>{sectors.map(s=><tr key={s.code}><td>{s.name}</td><td className={s.change==null?'':s.change>0?'up':s.change<0?'down':''}>{s.change==null?'待核验':s.change.toFixed(2)+'%'}</td><td>{cash(s.flow)}</td></tr>)}</tbody></table></div>:<p>当前时点缺少同日行业行情，资金栏待核验。</p>}
  </section>
  <section className="panel reference-panel">
   <h3>热点人气 · 个股榜</h3><p>{popularity?.name||'人气来源待确认'} · {popularity?.date||'时点待核验'}</p>
   {hot.length>0?<div className="reference-table"><table><thead><tr><th>排名</th><th>个股</th><th>热度</th></tr></thead><tbody>{hot.map(s=><tr key={s.code}><td>{s.rank}</td><td><button className="text-btn" onClick={()=>open(onStock,s)}>{s.name}</button></td><td>{nums(s.heat)}</td></tr>)}</tbody></table></div>:<p>缺少同日热榜。全市场概念人气、上涨覆盖另待可核验的数据。</p>}
  </section>
  <section className="panel reference-panel">
   <h3>涨停代表股 · 交叉核验</h3><p>当前题材榜前三，每题材列出前两只高度样本。</p>
   {lines.slice(0,3).map(g=><div className="reference-stock-line" key={g.name}><strong>{g.name}</strong>{g.stocks.slice(0,2).map(s=><button key={s.code} className="text-btn" onClick={()=>open(onStock,s)}>{s.name} · {s.boards} 板</button>)}</div>)}
   {!lines.length&&<p>暂无可核验样本。</p>}
  </section>
 </div>;
}

export function TurningBoard({data,method,proof}:Base&{proof?:DecisionProof|null}){
 const cards=handbookTurning(data,method,proof);
 const candidate=handbookTurnCandidate(cards,method.current.cycle.name);
 return <section className="panel reference-panel">
  <h3>八类拐点 · 逐条核验</h3><p><strong>{candidate?`${candidate.name} · ${candidate.path} · ${candidate.yes} 项命中，待确认`:'无明确拐点候选'}</strong>。当前周期位置约束候选，确认仍需手册规定的收盘与次日证据。</p>
  <div className="reference-board">{cards.map((c,i)=>{
   const {yes,known}=tally(c.signals);
   return <details key={c.name} className={'reference-check-card focus-'+(!known?'muted':yes>=2?(i>=5?'watch':'priority'):'muted')}>
    <summary><b>{i+1}. {c.name}</b><small>{c.path}</small><span className="focus-pill">{yes} 命中 · {known}/{c.signals.length} 已核验</span></summary>
    <EvidenceList checks={c.signals}/>
   </details>;
  })}</div>
 </section>;
}

export function RotationBoard({rotation}:{rotation:ReturnType<typeof referenceRotation>}){
 const groups=[
  {name:'旧线衰退',gate:'至少 3 项命中',checks:rotation.dead},
  {name:'新线成立',gate:'7 项均须满足',checks:rotation.born},
  {name:'终局确认',gate:'三选二',checks:rotation.final},
 ];
 return <>
  <div className="reference-board reference-board-three">{groups.map(g=>{
   const {yes,known}=tally(g.checks);
   return <section className="panel reference-panel" key={g.name}><h3>{g.name}</h3><p>{g.gate} · 命中 {yes} · 已核验 {known}/{g.checks.length}</p><EvidenceList checks={g.checks}/></section>;
  })}</div>
  <section className="panel reference-panel">
   <h3>题材涨停数趋势</h3><p>{rotation.trendSource} · 缺失记录显示「—」。</p>
   {rotation.dates.length>1&&rotation.trend.length?<div className="reference-table"><table><thead><tr><th>题材</th>{rotation.dates.map(d=><th key={d}>{d.slice(5)}</th>)}</tr></thead>
    <tbody>{rotation.trend.map(row=><tr key={row.name}><td>{row.name}</td>{row.counts.map((n,i)=><td key={rotation.dates[i]}>{n??'—'}</td>)}</tr>)}</tbody></table></div>:<p>需要至少两份同口径快照。</p>}
  </section>
 </>;
}

export function RoleBoard({data,method,onStock,records}:Base&{onStock:(code:string,name:string)=>void;records:SealSnapshot[]}){
 const [theme,setTheme]=useState('');
 const [code,setCode]=useState('');
 const lines=method.currentLines.length?method.current.mainlines.lines.slice(0,8):[];
 const line=lines.find(g=>g.name===theme)||lines[0];
 const candidate=line?.stocks.find(s=>s.code===code)||line?.stocks[0];
 const preview=line?themeRoles(line):null;
 const proof=useDecisionProof(line?data:null,[...(candidate?[candidate.code]:[]),...(preview?.followers.map(s=>s.code)??[])],line?.name,records);
 if(!line)return <section className="panel reference-panel"><h3>主线角色与交叉验证</h3><p>等待完整且可归类的涨停名单。</p></section>;
 const {leader,middle,followers,levels}=themeRoles(line);
 const body=data&&candidate?classifyRoleEvidence(candidate,data,proof,line.name):null;
 const verifiedMiddle=data?middleEvidence(data,proof,line.name):null;
 const industry=data?.sources.find(s=>s.id==='eastmoney'&&s.date===data.tradeDate&&s.status==='ok');
 const fund=industry?data?.sectors.find(s=>s.name===line.name):null;
 const ladder=levels.includes(1)&&levels.includes(2)&&levels.some(n=>n>=3&&n<line.highest)&&line.highest>=5&&levels.every((n,i)=>!i||n-levels[i-1]<=2);
 const strength=data?handbookThemeScore(data,line,records,proof):null;
 return <section className="panel reference-panel">
  <div className="reference-panel-top"><div><h3>题材内角色与交叉验证</h3><p>用技术、资金、消息、情绪四组证据检查每个题材。</p></div>
   <label>题材 <select value={line.name} onChange={e=>setTheme(e.target.value)}>{lines.map(g=><option key={g.name}>{g.name}</option>)}</select></label>
  </div>
  <div className="reference-board reference-board-three">
   <article className="reference-check-card focus-priority"><h4>龙头候选</h4>{leader&&<button className="text-btn" onClick={()=>open(onStock,leader)}>{leader.name} · {leader.boards} 板</button>}<small>题材内优先核对连板高度和带动性。</small></article>
   <article className={'reference-check-card focus-'+(verifiedMiddle?.breakout?'positive':'priority')}><h4>{verifiedMiddle?.breakout?'中军放量上攻':'中军线索'}</h4>
    {verifiedMiddle?<><button className="text-btn" onClick={()=>open(onStock,verifiedMiddle.candidate)}>{verifiedMiddle.candidate.name} · {cash(verifiedMiddle.candidate.amount)}</button>
     <small>东方财富行业成分与流通市值 {cash(verifiedMiddle.candidate.cap)} · 同时点报价 · 5/10/20 日均线 {verifiedMiddle.trend==null?'待同日收盘日线':verifiedMiddle.trend?'多头排列':'未呈多头排列'} · 量比 {nums(verifiedMiddle.volume,2)}</small></>:<>{middle?<button className="text-btn" onClick={()=>open(onStock,middle)}>{middle.name} · {cash(middle.amount)}</button>:<p>待核验</p>}<small>当前仅有涨停样本，缺可匹配的行业成分或同刻报价。</small></>}
   </article>
   <article className="reference-check-card focus-priority"><h4>补涨线索</h4>{followers.length?followers.map(s=>{
    const vol=data?closingVolumeRatio(proof?.daily[s.code],data.tradeDate,asOf(data)):null;
    const cap=proof?.pools.limitUp?.[s.code];
    return <div key={s.code}><button className="text-btn" onClick={()=>open(onStock,s)}>{s.name} · {s.boards} 板 · {s.time}</button>
     <small>量能 {vol==null?'待同日收盘日线':vol.toFixed(2)+' 倍'+(vol>=1.5?' · 达门槛':' · 未达 1.5 倍')} · 封单 / 流通市值 {cap&&s.seal!=null?(s.seal/cap*100).toFixed(2)+'%':'待市值或封单'}</small></div>;
   }):<p>暂无匹配样本</p>}<small>高度股至少 4 板、同题材首板或二板、早盘首封。业务关联和启动前涨幅另待核验。</small></article>
  </div>
  {body&&<section className="reference-panel">
   <div className="reference-panel-top"><div><h3>个股自动体检</h3><p>按手册原阈值计算，选择个股即可切换证据。</p></div>
    <label>个股 <select value={candidate?.code} onChange={e=>setCode(e.target.value)}>{line.stocks.map(s=><option value={s.code} key={s.code}>{s.name} · {s.boards} 板</option>)}</select></label>
   </div>
   <div className="reference-board">
    <details className={'reference-check-card focus-'+(body.g>=12?'positive':'priority')} key={candidate?.code+'g'}><summary><b>{body.leader}</b><span className="focus-pill">{body.g}/17 命中 · {17-body.gu}/17 已核验</span></summary><EvidenceList checks={body.good}/></details>
    <details className={'reference-check-card focus-'+(body.b>=5?'risk':body.b>0?'watch':'muted')} key={candidate?.code+'b'}><summary><b>{body.top}</b><span className="focus-pill">{body.b}/12 命中 · {12-body.bu}/12 已核验</span></summary><EvidenceList checks={body.bad}/></details>
   </div>
  </section>}
  <EvidenceList checks={[
   {label:'技术 · 高度与完整梯队',passed:line.highest>=5&&ladder,detail:`${line.count} 只涨停 · ${levels.join('、')} 板层级`},
   {label:'资金 · 同名行业主力净流入',passed:fund?.flow==null?null:fund.flow>0,detail:fund?.flow==null?'缺少同日同名行业数据':cash(fund.flow)},
   {label:'消息 · 持续催化',passed:null},
   {label:'情绪 · 市场风险门槛',passed:method.current.blocked?null:!method.current.defensive&&!method.current.caution,detail:method.current.phase},
  ]}/>
  <h4>手册主线强度 · 六项评分依据</h4>
  <div className="reference-table"><table><thead><tr><th>维度</th><th>已核验分项</th><th>满分</th><th>依据</th></tr></thead><tbody>
   {strength?.items.map(item=><tr key={item.label}><td>{item.label}</td><td>{item.value??'待核验'}</td><td>{item.max}</td><td>{item.detail}</td></tr>)}
  </tbody></table></div>
  <p>{strength?`已核验 ${strength.verified}/6 项 · 可能分数 ${strength.lower}–${strength.upper}。`:''}手册以 70、50、30 分分级。选股以已核实的下限判断是否达到门槛。</p>
 </section>;
}

export function StrategyChain({data,now,records,onStock,proof}:{
 data:Market|null;now:number;records:SealSnapshot[];onStock:(code:string,name:string)=>void;proof?:DecisionProof|null;
}){
 const context=assessTactics(data,now);
 const r=buildClosingSignals(data,records,now);
 const groups=data&&!data.cached&&r.valid?buildMainlines(data.stocks).lines:[];
 const standalone=useDecisionProof(proof===undefined&&groups.length?data:null,groups.slice(0,3).flatMap(g=>g.stocks[0]?.code??[]),groups[0]?.name,records);
 const evidence=proof??standalone;
 const prior=data?priorPerformance(data,evidence):null;
 const stop=prior?.largeLoss!=null&&prior.largeLoss>=7?'大面股至少 7 家':context.highest>=7?'最高板达 7 板，手册进入持有或兑现观察档':context.highest<=2?'最高板不超过 2 板':context.defensive||context.phase==='衰退'?'退潮或严重风控':null;
 const eligible=!!data&&!data.cached&&r.valid&&!stop;
 const actionWindow=eligible&&context.clock.live&&cnMinute(now)<870&&!context.caution;
 const risk=new Set(r.rows.filter(row=>row.tone==='risk').map(row=>row.stock.code));
 const used=new Set<string>();
 const scan=buildTacticScanner(context);
 const candidates=eligible?[...scan.available,...scan.waiting].filter(x=>{
  const {stock}=x;
  const group=groups.slice(0,3).find(g=>g.stocks.some(s=>s.code===stock.code));
  const theme=group?.name;
  if(!group||!theme||used.has(theme)||themeRoles(group).leader?.code!==stock.code||risk.has(stock.code)||classifyRoleEvidence(stock,data!,evidence,theme).b>=3||stock.seal==null||stock.amount==null||stock.amount<=0
   ||stock.seal/stock.amount<.10||stock.openTimes==null||stock.openTimes>=3)return false;
  if(handbookThemeScore(data!,group,records,evidence).upper<50)return false;
  used.add(theme);
  return true;
 }).slice(0,3):[];
 return <section className="panel reference-panel">
  <h3>环境 → 策略 → 个股</h3>
  <div className="reference-board reference-board-three">
   <article className="reference-check-card focus-priority"><h4>① 环境</h4><strong>{context.phase}</strong><p>{context.clock.label}</p></article>
   <article className={'reference-check-card focus-'+(stop?'risk':context.status.color)}><h4>② 策略</h4><strong>{stop?'停止筛选':actionWindow?context.status.label:'复盘观察'}</strong><p>{stop||(!actionWindow?'尾盘、休市或分歧时仅保留观察名单。':context.status.action)}</p></article>
   <article className={'reference-check-card focus-'+(eligible&&candidates.length?'priority':'muted')}><h4>③ 手册选股</h4><strong>{candidates.length?candidates.length+' 只前排待确认':'暂无通过初筛的样本'}</strong><p>{eligible?'仅保留前三题材各一只高度前排。题材强度须达 50 分才进入准主线；证据未齐先观察。':'当前环境或数据条件未通过。'}</p></article>
  </div>
  {candidates.map(({stock,best,score})=>{
   const group=groups.slice(0,3).find(g=>g.stocks.some(s=>s.code===stock.code))!;
   const strength=handbookThemeScore(data!,group,records,evidence);
   return <div className="reference-stock-line" key={stock.code}>
    <button className="text-btn" onClick={()=>open(onStock,stock)}>{stock.name} · {stock.boards} 板</button>
    <strong>{best.name} · 观察分 {score}</strong><small>{group.name} · 主线强度 {strength.lower}–{strength.upper} · {strength.lower>=70?'主线分已达 70':strength.lower>=50?'准主线，仅看最高板与前排':'低于 50 分的已核实下限，等待补证'}。命中 3 项见顶信号或核心封单警示时剔除。</small>
   </div>;
  })}
 </section>;
}
