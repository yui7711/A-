import {ArrowDown,ArrowRight,ShieldCheck,Zap} from 'lucide-react';
import {buildClosingSignals,type SealSnapshot} from '@/lib/closing-signals';
import {emotionStages} from '@/lib/emotion-cycle';
import type {Market} from '@/lib/market-types';
import {buildResearch} from '@/lib/research';
import {assessTactics} from '@/lib/tactics';
import {SignalLegend} from './signal-legend';

export function OverviewSummary({data,now,records,onSeals,onTactics,onPlan}:{data:Market|null;now:number;records:SealSnapshot[];onSeals:()=>void;onTactics:()=>void;onPlan:()=>void}){
 const tactics=assessTactics(data,now);
 const r=buildResearch(data,tactics);
 const s=buildClosingSignals(data,records,now);
 const tone=r.blocked?'muted':r.defensive?'risk':r.caution?'watch':r.cycle.color;
 const risk=s.high.find(row=>row.tone==='risk');
 const warning=s.high.find(row=>row.tone==='watch');
 const sealTone=!s.valid?'muted':risk?'risk':warning?'watch':s.high.length>0&&s.high.every(row=>row.measured)?'positive':'priority';
 const compared=s.high.filter(row=>row.change!=null).length;
 return <div className="overview-summary" aria-label="市场核心结论">
  <section className={'panel overview-verdict focus-'+tone}>
   <div className="overview-verdict-top">
    <div><span className="section-step">01 · 情绪阶段</span><h2>{r.phase}</h2><p>{r.conclusion}</p></div>
    <div className="overview-score"><strong>{r.average?.toFixed(1)??'—'}<small> / 10</small></strong><span>{r.known}/6 维可计算</span></div>
   </div>
   <ol className="overview-cycle" aria-label="情绪周期">{emotionStages.map((stage,i)=><li key={stage.id} className={'focus-'+(r.cycle.index===i?stage.color:'muted')} aria-current={r.cycle.index===i?'step':undefined}>{stage.name}</li>)}</ol>
  </section>
  <section className="overview-priorities">
   <article className={'panel overview-tile focus-'+sealTone}>
    <span className="section-step"><ShieldCheck size={14}/>02 · 核心警示</span>
    <h3>{!s.valid?'等待有效行情':risk?`${s.riskCount} 只高标触发危险信号`:warning?'高标触发警告':'当前未触发核心警示'}</h3>
    <p>{risk||warning?`${(risk||warning)?.stock.name} · ${(risk||warning)?.signals[0]?.label}`:`午盘对照 ${compared}/${s.high.length} 只高标`}</p>
    <button className="text-btn" onClick={onSeals}>查看封单与依据 <ArrowDown size={14}/></button>
   </article>
   <article className={'panel overview-tile focus-'+tactics.status.color}>
    <span className="section-step"><Zap size={14}/>03 · 三大战法</span><h3>{tactics.primaryId?tactics.primary:tactics.status.label}</h3>
    <p>{tactics.status.action}</p>
    <button className="text-btn" onClick={onTactics}>查看三合一扫描 <ArrowRight size={14}/></button>
   </article>
   <article className="panel overview-tile focus-priority">
    <span className="section-step">04 · 去噪主线前三</span>
    {r.mainlines.lines.length?<ol className="overview-lines">{r.mainlines.lines.slice(0,3).map(g=><li key={g.name}><strong>{g.name}</strong><span>{g.count} 只涨停</span></li>)}</ol>:<p>等待可归类的涨停样本。</p>}
    <button className="text-btn" onClick={onPlan}>打开复盘计划 <ArrowRight size={14}/></button>
   </article>
  </section>
  <SignalLegend/>
 </div>;
}
