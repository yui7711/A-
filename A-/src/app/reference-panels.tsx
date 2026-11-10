import {useState} from 'react';
import type {Market} from '@/lib/market-types';
import {handbookTurning,referenceRotation,themeRoles,type Evidence} from '@/lib/reference-research';
import type {marketMethod} from '@/lib/market-method';
import type {SealSnapshot} from '@/lib/closing-signals';
import {buildClosingSignals} from '@/lib/closing-signals';
import {buildTacticScanner} from '@/lib/tactic-scanner';
import {assessTactics} from '@/lib/tactics';
import {buildMainlines} from '@/lib/research';

type Method=ReturnType<typeof marketMethod>;
type Base={data:Market|null;method:Method};
const nums=(n:number|null|undefined,d=0)=>n==null?'待核验':n.toFixed(d);
const cash=(n:number|null|undefined)=>n==null?'待核验':(n/1e8).toFixed(2)+' 亿';
const tally=(checks:Evidence[])=>({yes:checks.filter(s=>s.passed===true).length,known:checks.filter(s=>s.passed!=null).length});
const open=(onStock:(code:string,name:string)=>void,stock:{code:string;name:string})=>onStock(stock.code,stock.name);
function EvidenceList({checks}:{checks:Evidence[]}){
 return <ul className="reference-checks">{checks.map(s=><li key={s.label}>
  <span className={'focus-pill focus-'+(s.passed===true?'positive':s.passed===false?'watch':'muted')}>{s.passed===true?'命中':s.passed===false?'未命中':'待核验'}</span>
  <span>{s.label}{s.detail&&<small>{s.detail}</small>}</span>
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

export function TurningBoard({data,method}:Base){
 const cards=handbookTurning(data,method);
 return <section className="panel reference-panel">
  <h3>八类拐点 · 逐条核验</h3><p>每张卡分别显示命中数与证据覆盖。命中是观察线索，确认仍需手册规定的时点及数据。</p>
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

export function RoleBoard({data,method,onStock}:Base&{onStock:(code:string,name:string)=>void}){
 const [theme,setTheme]=useState('');
 const lines=method.currentLines.length?method.current.mainlines.lines.slice(0,8):[];
 const line=lines.find(g=>g.name===theme)||lines[0];
 if(!line)return <section className="panel reference-panel"><h3>主线角色与交叉验证</h3><p>等待完整且可归类的涨停名单。</p></section>;
 const {leader,middle,followers,levels}=themeRoles(line);
 const industry=data?.sources.find(s=>s.id==='eastmoney'&&s.date===data.tradeDate&&s.status==='ok');
 const fund=industry?data?.sectors.find(s=>s.name===line.name):null;
 const ladder=levels.includes(1)&&levels.includes(2)&&levels.some(n=>n>=3&&n<line.highest)&&line.highest>=5&&levels.every((n,i)=>!i||n-levels[i-1]<=2);
 const share=line.share*100;
 const samePool=data?.stats.up===method.current.poolCount&&method.current.mainlines.unclassified===0;
 const sharePoints=!samePool?null:share>35?20:share>=25?15:share>=15?10:share>=8?5:2;
 const ladderPoints=ladder?20:line.highest===1?4:line.highest<5?12:null;
 const scoreItems=[
  ['持续性',null,25],['涨停占比',sharePoints,20],['梯队完整度',ladderPoints,20],
  ['中军强度',null,15],['催化级别',null,10],['题材内晋级率',null,10],
 ] as const;
 return <section className="panel reference-panel">
  <div className="reference-panel-top"><div><h3>题材内角色与交叉验证</h3><p>用技术、资金、消息、情绪四组证据检查每个题材。</p></div>
   <label>题材 <select value={line.name} onChange={e=>setTheme(e.target.value)}>{lines.map(g=><option key={g.name}>{g.name}</option>)}</select></label>
  </div>
  <div className="reference-board reference-board-three">
   <article className="reference-check-card focus-priority"><h4>龙头候选</h4>{leader&&<button className="text-btn" onClick={()=>open(onStock,leader)}>{leader.name} · {leader.boards} 板</button>}<small>题材内优先核对连板高度和带动性。</small></article>
   <article className="reference-check-card focus-priority"><h4>中军线索</h4>{middle?<button className="text-btn" onClick={()=>open(onStock,middle)}>{middle.name} · {cash(middle.amount)}</button>:<p>待核验</p>}<small>取涨停样本中的成交线索，仍需全板块量价和市值确认。</small></article>
   <article className="reference-check-card focus-priority"><h4>补涨线索</h4>{followers.length?followers.map(s=><button key={s.code} className="text-btn" onClick={()=>open(onStock,s)}>{s.name} · 首板</button>):<p>待核验</p>}<small>同题材且首封晚于高度股，后续核对是否独立走强。</small></article>
  </div>
  <EvidenceList checks={[
   {label:'技术 · 高度与完整梯队',passed:line.highest>=5&&ladder,detail:`${line.count} 只涨停 · ${levels.join('、')} 板层级`},
   {label:'资金 · 同名行业主力净流入',passed:fund?.flow==null?null:fund.flow>0,detail:fund?.flow==null?'缺少同日同名行业数据':cash(fund.flow)},
   {label:'消息 · 持续催化',passed:null},
   {label:'情绪 · 市场风险门槛',passed:method.current.blocked?null:!method.current.defensive&&!method.current.caution,detail:method.current.phase},
  ]}/>
  <h4>手册主线强度 · 六项评分依据</h4>
  <div className="reference-table"><table><thead><tr><th>维度</th><th>已核验分项</th><th>满分</th></tr></thead><tbody>
   {scoreItems.map(([name,score,max])=><tr key={name}><td>{name}</td><td>{score??'待核验'}</td><td>{max}</td></tr>)}
  </tbody></table></div>
  <p>六项证据齐备后按 70、50、30 分分级。当前只展示可核验分项，保留结构热度供排序。</p>
 </section>;
}

export function StrategyChain({data,now,records,onStock}:{
 data:Market|null;now:number;records:SealSnapshot[];onStock:(code:string,name:string)=>void;
}){
 const context=assessTactics(data,now);
 const r=buildClosingSignals(data,records,now);
 const eligible=!!data&&!data.cached&&r.valid&&context.clock.live&&!context.defensive&&!context.caution&&!['冰点','衰退'].includes(context.phase);
 const risk=new Set(r.rows.filter(row=>row.tone==='risk').map(row=>row.stock.code));
 const used=new Set<string>();
 const groups=eligible?buildMainlines(data!.stocks).lines:[];
 const candidates=eligible?buildTacticScanner(context).available.filter(x=>{
  const {stock}=x;
  const theme=groups.find(g=>g.stocks.some(s=>s.code===stock.code))?.name;
  if(!theme||used.has(theme)||risk.has(stock.code)||stock.seal==null||stock.amount==null||stock.amount<=0
   ||stock.seal/stock.amount<.10||stock.openTimes==null||stock.openTimes>=3)return false;
  used.add(theme);
  return true;
 }).slice(0,3):[];
 return <section className="panel reference-panel">
  <h3>环境 → 策略 → 个股</h3>
  <div className="reference-board reference-board-three">
   <article className="reference-check-card focus-priority"><h4>① 环境</h4><strong>{context.phase}</strong><p>{context.clock.label}</p></article>
   <article className={'reference-check-card focus-'+context.status.color}><h4>② 策略</h4><strong>{context.status.label}</strong><p>{context.status.action}</p></article>
   <article className={'reference-check-card focus-'+(eligible&&candidates.length?'priority':'muted')}><h4>③ 个股验证</h4><strong>{candidates.length?candidates.length+' 只通过初筛':'暂无通过初筛的样本'}</strong><p>{eligible?'每个题材最多一只，总计最多三只。':'当前环境、时段或数据条件未通过。'}</p></article>
  </div>
  {candidates.map(({stock,best,score})=><div className="reference-stock-line" key={stock.code}>
   <button className="text-btn" onClick={()=>open(onStock,stock)}>{stock.name} · {stock.boards} 板</button>
   <strong>{best.name} · {score} 分</strong><small>触发需核验题材联动与盘口承接；若出现核心封单警示或承接失效，退出观察清单。</small>
  </div>)}
 </section>;
}
