'use client';
import {useState} from 'react';
import {ArrowRight,Check,Clock,Minus,ShieldCheck,Target} from 'lucide-react';
import {assessTactics,tacticStates} from '@/lib/tactics';
import type {Market} from '@/lib/market-types';
import TacticScanner from './tactic-scanner';

export default function TacticsPanel({data,now,expanded=false,onExpand,onStock}:{data:Market|null;now:number;expanded?:boolean;onExpand?:()=>void;onStock:(code:string,name:string)=>void}){
 const a=assessTactics(data,now),[expandedLists,setExpandedLists]=useState<string[]>([]);
 return <section className={'panel tactics-panel focus-'+a.status.color+' '+(expanded?'expanded':'')}>
  <div className="tactic-summary">
   <div className="tactic-heading"><span className="tactic-icon"><Target size={20}/></span><div><small>三大战法 · 适用性与操作含义</small><h2>{a.primaryId?'当前更适合研究：':'当前战法状态：'}<em>{a.primaryId?a.primary:a.status.label}</em></h2></div></div>
   <span className="tactic-phase focus-pill">{a.status.label}</span>
   {!expanded&&<button className="text-btn" onClick={onExpand}>查看依据与观察样本 <ArrowRight size={14}/></button>}
  </div>
  <div className="tactic-action-banner"><ShieldCheck size={18}/><div><strong>{a.status.action}</strong><span>买入信号：未生成已确认买点</span></div><small>{a.clock.live?'盘中条件评估':'休市复盘 · 下一交易时段重新验证'}</small></div>
  <p className="tactic-context"><Clock size={14}/>{a.context}</p>
  <TacticScanner assessment={a} onStock={onStock} compact={!expanded}/>
  <div className="tactic-detail-heading"><h3>三大战法 · 分项核验</h3><span>观察样本按观察分降序排列</span></div>
  <div className="tactic-cards">{a.tactics.map(t=>{
   const first=t.id===a.primaryId,label=t.stateId==='research'?(first?'当前可用 · 首选':'当前可用'):t.state.label;
   return <article key={t.id} className={'tactic-card focus-'+t.state.color+' '+(first?'preferred':'')}>
    <div className="tactic-card-title"><h3>{t.name}</h3><span className="focus-pill">{label}</span></div>
    <div className="tactic-card-action">{t.state.action}</div>
    <p>{t.description}</p>
    <div className="tactic-match"><strong>{t.matches}<small> / {t.checks.length} 项环境筛选满足</small></strong><span>{t.candidates.length} 只观察样本</span></div>
    <div className="tactic-state-reason">{t.stateReason}</div>
    {expanded&&<>
     <div className="tactic-checks">{t.checks.map(c=><div className={'tactic-check focus-'+(c.passed===true?'positive':c.passed===null?'muted':'watch')} key={c.label}>{c.passed===null?<Clock size={13}/>:c.passed?<Check size={13}/>:<Minus size={13}/>}<span>{c.label}<small>{c.detail}</small></span><b>{c.passed===null?'待核实':c.passed?'满足':'未满足'}</b></div>)}</div>
     <div className="tactic-candidates"><p className="tactic-sample-label">观察样本 · 观察分 ↓ · 非买入名单</p>{(expandedLists.includes(t.id)?t.candidates:t.candidates.slice(0,8)).map((s,i)=><button key={s.code} onClick={()=>onStock(s.code,s.name)}><em className="sample-rank">{String(i+1).padStart(2,'0')}</em><strong>{s.name}<small>{s.code} · {s.boards}板</small></strong><span className="sample-score"><b>{Number.isFinite(s.score)?s.score:'—'}<small> / {s.coverage??'—'}</small></b><small>{s.turnover==null?'换手缺失':`换手 ${s.turnover.toFixed(2)}%`}</small></span><ArrowRight size={12}/></button>)}{!t.candidates.length&&<p>暂无可验证样本，缺失数据不会当作条件已满足。</p>}</div>
     {t.candidates.length>8&&<button className="sample-more" onClick={()=>setExpandedLists(v=>v.includes(t.id)?v.filter(id=>id!==t.id):[...v,t.id])}>{expandedLists.includes(t.id)?'收起至前8只':'展开全部 '+t.candidates.length+' 只'}</button>}
     <div className="tactic-notes">{t.missing.map(s=><small key={s}>{s}</small>)}</div>
    </>}
   </article>;
  })}</div>
  <div className="tactic-state-guide" aria-label="战法状态含义">
   <div className="focus-priority"><b className="focus-pill">蓝 · 关注</b><p>值得继续跟踪的主线或样本，等待后续验证。</p></div>
   <div className="focus-positive"><b className="focus-pill">绿 · 可行</b><p>{tacticStates.research.meaning}</p></div>
   <div className="focus-watch"><b className="focus-pill">橙 · 警告</b><p>{tacticStates.waiting.meaning}</p></div>
   <div className="focus-risk"><b className="focus-pill">红 · 危险</b><p>{tacticStates.blocked.meaning}</p></div>
   <div className="focus-muted"><b className="focus-pill">灰 · 数据不足</b><p>缺少有效或必要数据时暂停判断；已核实但不适用的战法标红。</p></div>
  </div>
  <div className="tactic-disclosure"><ShieldCheck size={13}/>绿色表示当前环境与筛选条件支持使用该战法；个股买点仍需确认。本站不自动下单。</div>
  {expanded&&<p className="tactic-method">市场阶段：{a.phase}。筛选条件全部满足、且无风险或谨慎项时标为绿色当前可用；数据有效性与市场风控先于匹配排序。弱转强的昨日分歧和今日竞价尚未核实时，保持等待确认。研究规则未经收益回测。交易时段参照 <a href="https://www.sse.com.cn/lawandrules/sselawsrules2025/trade/universal/c/c_20260424_10816492.shtml" target="_blank" rel="noreferrer">上交所规则</a>，节假日以交易所公告为准。</p>}
 </section>;
}
