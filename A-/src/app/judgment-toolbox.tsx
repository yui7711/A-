import {useState} from 'react';
import {BookOpen,Calculator} from 'lucide-react';
import {buildClosingSignals,sealSource,type SealSnapshot} from '@/lib/closing-signals';
import {emotionStages,locateEmotionCycle} from '@/lib/emotion-cycle';
import {marketMethod} from '@/lib/market-method';
import type {Market} from '@/lib/market-types';
import {assessTactics} from '@/lib/tactics';
import {SignalLegend} from './signal-legend';

const tools=[
 {id:'temperature',label:'情绪温度'},
 {id:'theme',label:'主线强度'},
 {id:'divergence',label:'分歧性质'},
 {id:'leader',label:'龙头体检'},
 {id:'stage',label:'周期定位'},
] as const;

type Evidence='support'|'pressure'|'unknown';
type Check={label:string;observed?:Evidence;detail?:string};
const direction=(delta:number|null,lowerBetter=false):Evidence=>{
 if(delta==null||delta===0)return 'unknown';
 return (delta>0)!==lowerBetter?'support':'pressure';
};
const evidenceText={support:'支持',pressure:'承压',unknown:'待核验'};

function EvidenceChecklist({checks,minimum,kind}:{checks:Check[];minimum:number;kind:'divergence'|'leader'}){
 const [manual,setManual]=useState<Record<string,Evidence>>({});
 const rows=checks.map(c=>({...c,state:c.observed??manual[c.label]??'unknown'}));
 const support=rows.filter(c=>c.state==='support').length;
 const pressure=rows.filter(c=>c.state==='pressure').length;
 const known=support+pressure;
 const grade=known<minimum?'muted':pressure>=support+2?'watch':support>=pressure+2?'positive':'priority';
 const verdict=grade==='muted'?'证据不足':kind==='divergence'
  ?grade==='watch'?'偏恶性分歧':grade==='positive'?'偏良性分歧':'分歧方向待确认'
  :grade==='watch'?'承压，优先复核':grade==='positive'?'龙头候选证据占优':'证据分化，继续关注';
 return <>
  <div className="tool-result" aria-live="polite"><span className={'focus-pill focus-'+grade}>{verdict}</span><span>支持 {support} · 承压 {pressure} · 已核验 {known}/{checks.length}</span></div>
  <div className="tool-checks">{rows.map(c=><div key={c.label}>
   <div><strong>{c.label}</strong><small>{c.detail??'手动核验'}</small></div>
   {c.observed!==undefined?<span className={'focus-pill focus-'+(c.state==='support'?'positive':c.state==='pressure'?'watch':'muted')}>{evidenceText[c.state]}</span>
    :<select aria-label={c.label} value={c.state} onChange={e=>setManual(old=>({...old,[c.label]:e.target.value as Evidence}))}>
     <option value="unknown">待核验</option><option value="support">支持</option><option value="pressure">承压</option>
    </select>}
  </div>)}</div>
  <p className="tool-caption">至少核验 {minimum} 项，且支持或承压证据净领先 2 项，才给出倾向。手动结果仅用于本次观察。</p>
 </>;
}

const fields=[
 {id:'up',label:'涨停家数',min:0,max:10000,step:1},
 {id:'down',label:'跌停家数',min:0,max:10000,step:1},
 {id:'highest',label:'最高连板',min:0,max:200,step:1},
 {id:'blast',label:'炸板率 %',min:0,max:100,step:.01},
 {id:'average',label:'四指数均值 %',min:-100,max:100,step:.01},
] as const;
type Field=typeof fields[number]['id'];

function StageTool({r,usable}:{r:ReturnType<typeof marketMethod>['current'];usable:boolean}){
 const [input,setInput]=useState<Partial<Record<Field,string>>>({});
 const [scenario,setScenario]=useState(false);
 const parse=(id:Field)=>input[id]?.trim()?Number(input[id]):null;
 const valid=fields.every(f=>{const n=parse(f.id);return n!=null&&Number.isFinite(n)&&n>=f.min&&n<=f.max&&(f.step!==1||Number.isInteger(n));});
 const up=parse('up'),down=parse('down'),blast=parse('blast'),highest=parse('highest'),average=parse('average');
 const consistent=valid&&((up===0&&highest===0)||(up!>0&&highest!>0))&&(up===0||blast!<100);
 const manual=locateEmotionCycle({valid:consistent,up,down,highest,blast:blast==null?null:blast/100,average,known:0,
  severeRisk:valid&&(blast!>50||average!<=-2||down!>=10&&down!>=up!*.7)});
 const stage=scenario||!usable?manual:r.cycle;
 return <>
  <label className="tool-toggle"><input type="checkbox" checked={scenario} onChange={e=>setScenario(e.target.checked)}/> 使用手动情景</label>
  {scenario&&<div className="tool-inputs">{fields.map(f=><label key={f.id}>{f.label}<input type="number" min={f.min} max={f.max} step={f.step} value={input[f.id]??''} onChange={e=>setInput(old=>({...old,[f.id]:e.target.value}))}/></label>)}</div>}
  <div className="tool-result"><span className={'focus-pill focus-'+stage.color}>{stage.name}</span><span>{scenario?'手动情景':'当前行情或归档'} · {scenario&&!consistent?'填齐合法数值并核对涨停家数与最高板。':stage.basis}</span></div>
  <ol className="overview-cycle" aria-label="周期阶段">{emotionStages.map((s,i)=><li className={'focus-'+(i===stage.index?s.color:'muted')} key={s.id} aria-current={i===stage.index?'step':undefined}>{s.name}</li>)}</ol>
  <p className="tool-caption">{stage.matched.join(' · ')||'等候有效证据。'}</p>
 </>;
}

export function JudgmentToolbox({data,now,records,onManual,onStock}:{data:Market|null;now:number;records:SealSnapshot[];onManual:()=>void;onStock:(code:string,name:string)=>void}){
 const [tool,setTool]=useState<typeof tools[number]['id']>('temperature');
 const [theme,setTheme]=useState('');
 const [code,setCode]=useState('');
 const method=marketMethod(data,now,records);
 const r=method.current;
 const a=assessTactics(data,now);
 const usable=!!data&&!data.cached&&!r.blocked;
 const closing=buildClosingSignals(usable?data:null,records,now);
 const currentThemes=usable?r.mainlines.lines:[];
 const line=currentThemes.find(g=>g.name===theme)??currentThemes[0];
 const leader=line?.stocks.find(s=>s.code===code)??line?.stocks[0];
 const row=closing.rows.find(s=>s.stock.code===leader?.code);
 const score=usable&&r.average!=null?(r.average*10).toFixed(0):null;
 const marketKey=(data?.tradeDate||'')+'/'+sealSourceOrUnknown(data);
 const divergence:Check[]=[
  {label:'涨停广度相对基准',observed:direction(method.widthDelta),detail:method.widthDelta==null?'同源基准未齐':`${method.widthDelta} 家变化`},
  {label:'炸板率相对基准',observed:direction(method.blastDelta,true),detail:method.blastDelta==null?'同源基准未齐':`${(method.blastDelta*100).toFixed(1)} 个百分点变化`},
  {label:'最高板相对基准',observed:direction(method.heightDelta),detail:method.heightDelta==null?'同源基准未齐':`${method.heightDelta} 板变化`},
  {label:'主线核心承接'},{label:'中军量价持续性'},{label:'后排亏钱效应'},{label:'跨梯队晋级表现'},
  {label:'同题材回流扩散'},{label:'放量方向与价格结构'},{label:'指数与短线情绪配合'},{label:'新方向能否分担压力'},{label:'异动或事件影响'},
 ];
 const leaderChecks:Check[]=[
  {label:'题材内高度',observed:leader&&line&&leader.boards>=2&&leader.boards===line.highest?'support':'unknown',detail:leader?`样本 ${leader.boards} 板 / 题材最高 ${line?.highest} 板`:'等待样本'},
  {label:'封板结构',observed:row?.tone==='risk'||row?.tone==='watch'?'pressure':row?.measured?'support':'unknown',detail:row?.signals.map(s=>s.label).join('、')||'需要完整结构数据'},
  {label:'是否带动同题材扩散'},{label:'分歧中的承接强度'},{label:'中军能否提供量价支持'},
  {label:'是否出现同方向卡位'},{label:'高位是否有抛压扩散'},{label:'隔日结构能否延续'},
 ];
 return <section className="panel judgment-toolbox">
  <div className="panel-heading"><div><h2><Calculator size={19}/> 判定工具箱</h2><p>{data?.tradeDate||'等待行情'} · {sealSourceOrUnknown(data)} · {usable?a.clock.label:a.dataIssue||'当前数据待核验'}</p></div>
   <button type="button" className="text-btn" onClick={onManual}><BookOpen size={15}/> 对照判定手册</button>
  </div>
  <div className="tool-body">
   <div className="button-row tool-tabs" aria-label="选择判定工具">{tools.map(t=><button type="button" key={t.id} className="secondary-btn" aria-pressed={t.id===tool} onClick={()=>setTool(t.id)}>{t.label}</button>)}</div>
   {tool==='temperature'&&<>
    <div className="tool-result"><strong className="tool-score">{score??'—'}<small> / 100</small></strong><span>六维可用 {usable?r.known:0}/6 · {usable&&r.known===6?'完整评分':'部分评分或待核验'}</span></div>
    {r.dimensions.map(d=><div className="tool-factor" key={d.id}><strong>{d.name}</strong><span>{usable?d.value?.toFixed(1)??'待核验':'待核验'}</span><small>{d.detail} · {d.source} · {d.asOf}</small></div>)}
    <p className="tool-caption">温度取本站可用维度的等权均分 × 10。阶段由周期定位器独立判定。</p>
   </>}
   {(tool==='theme'||tool==='leader')&&<label className="tool-select">题材
    <select value={line?.name??''} onChange={e=>{setTheme(e.target.value);setCode('');}} aria-label="题材">{!line&&<option value="">暂无可用题材</option>}{currentThemes.map(g=><option key={g.name}>{g.name}</option>)}</select>
   </label>}
   {tool==='theme'&&(line?<div className="tool-result"><strong className="tool-score">{line.heat}<small> / 100</small></strong><div><strong>{line.name}</strong><p>涨停 {line.count} 只 · 最高 {line.highest} 板 · {line.ladder} 个连板层级 · 封单覆盖 {line.sealKnown}/{line.count}</p><p className="tool-caption">热度按涨停广度、最高板和连板层级计算。延续性可在主线切换中核验。</p></div></div>:<p className="tool-caption">等待完整涨停名单及题材归类。</p>)}
   {tool==='divergence'&&<EvidenceChecklist key={marketKey} checks={divergence} minimum={4} kind="divergence"/>}
   {tool==='leader'&&<>
    {leader?<><label className="tool-select">候选股
     <select value={leader.code} onChange={e=>setCode(e.target.value)} aria-label="候选股">{line?.stocks.map(s=><option key={s.code} value={s.code}>{s.name} · {s.code}</option>)}</select>
     <button type="button" className="text-btn" onClick={()=>onStock(leader.code,leader.name)}>查看个股</button></label>
     {row?.tone==='risk'&&<p className="focus-pill focus-risk">危险 · {row.signals.filter(s=>s.tone==='risk').map(s=>s.label).join('、')}</p>}
     <EvidenceChecklist key={marketKey+'/'+leader.code} checks={leaderChecks} minimum={3} kind="leader"/>
    </>:<p className="tool-caption">等待可核验的题材样本。</p>}
   </>}
   {tool==='stage'&&<StageTool r={r} usable={usable}/>}
   <SignalLegend/>
  </div>
 </section>;
}

function sealSourceOrUnknown(data:Market|null){
 return data&&data.stocks.length?sealSource(data)||'混合来源':'来源待核验';
}
