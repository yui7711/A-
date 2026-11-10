import {useState} from 'react';
import {BookOpen,CalendarDays,Copy,Download,Target} from 'lucide-react';
import {buildClosingSignals,type SealSnapshot} from '@/lib/closing-signals';
import type {Market} from '@/lib/market-types';
import {buildReviewArticle,reviewHtml,reviewText} from '@/lib/review-article';
import {selectReviewSnapshot,type SealArchive} from '@/lib/seal-archive';
import {marketClock} from '@/lib/tactics';
import {PlanPanel} from './research-panels';

type Slot=SealSnapshot['slot'];
const localTime=(at:number)=>Number.isFinite(at)?new Date(at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
const periodName=(slot:Slot)=>slot==='noon'?'午盘':'收盘';

type ArchiveProps={
 records:SealSnapshot[];
 shared:SealArchive|null;
 error:string;
 date:string;
 effectiveDate:string;
 followArchive:boolean;
 slot:Slot;
 now:number;
 onDate:(date:string)=>void;
 onSlot:(slot:Slot)=>void;
};

export function ArchiveControls({records,shared,error,date,effectiveDate,followArchive,slot,now,onDate,onSlot}:ArchiveProps){
 const current=marketClock(now).date;
 const dates=[...new Set([current,effectiveDate,...records.filter(s=>s.origin==='cloud').map(s=>s.date)].filter(Boolean))].sort().reverse();
 const latest=selectReviewSnapshot(records,effectiveDate,slot);
 const run=shared?.runs.slice().reverse().find(s=>s.date===effectiveDate&&s.slot===slot);
 const target=Date.parse(effectiveDate+(slot==='noon'?'T11:30:00':'T15:00:00')+'+08:00');
 const outcome=latest?`已归档 · ${latest.source} · ${localTime(Date.parse(latest.collectedAt||'')||latest.at)} 采集`
  :run?.status==='missed'?'采集任务错过目标窗口':run?'采集未通过校验':target>now?'等待目标时段':'暂无后台归档';
 return <section className="panel review-toolbar" aria-label="复盘日期与时段">
  <label><CalendarDays size={16}/>行情日期<select value={date} onChange={e=>onDate(e.target.value)} aria-label="复盘日期">
   <option value="">{followArchive?'最近可用归档':'跟随当前行情'}</option>
   {dates.map(d=><option value={d} key={d}>{d}</option>)}
  </select></label>
  <label>归档时段<select value={slot} onChange={e=>onSlot(e.target.value as Slot)} aria-label="复盘时段">
   <option value="noon">午盘</option><option value="late">收盘</option>
  </select></label>
  <small aria-live="polite">{periodName(slot)} · {outcome}{error?' · 共享档案暂时不可达':''}</small>
 </section>;
}

export function ArchivedPlan({data,now,records,slot}:{data:Market;now:number;records:SealSnapshot[];slot:Slot}){
 const closing=buildClosingSignals(data,records,now);
 const watch=closing.rows.filter(row=>closing.valid&&row.checked>=2&&row.tone!=='risk').sort((a,b)=>b.stock.boards-a.stock.boards||b.stock.score-a.stock.score).slice(0,5);
 const period=slot==='noon'?'下午':'下一交易日';
 return <>
  <PlanPanel data={data} now={now} period={period}/>
  <section className="panel review-card">
   <div className="panel-heading"><div><h2>{period}观察清单</h2><p>验证主线承接和封板质量 · {data.tradeDate} {periodName(slot)}快照</p></div><Target size={18}/></div>
   <div className="closing-table-wrap"><table className="closing-table">
    <thead><tr><th>观察样本</th><th>触发与验证</th><th>失效参考</th></tr></thead>
    <tbody>{watch.map(row=><tr key={row.stock.code}>
     <td><strong>{row.stock.name}</strong><small>{row.stock.code} · {row.stock.boards} 板</small></td>
     <td>{row.signals.map(s=>s.label).join('、')}<small>{row.comparison} · 复核同题材跟随与封成比</small></td>
     <td>{row.stock.low==null?'快照日低点待核验':`快照日低点 ${row.stock.low.toFixed(2)}`}<small>跌破参考低点或触发核心警示时，重新评估该观察条件</small></td>
    </tr>)}</tbody>
   </table></div>
   {!watch.length&&<p className="research-empty">暂无满足筛选条件的观察样本。</p>}
   <small className="review-disclaimer">参考低点用于复核结构。实际退出条件与风险预算由使用者确认。仅供研究参考。</small>
  </section>
 </>;
}

export function ArchivedArticle({data,now,records,slot}:{data:Market;now:number;records:SealSnapshot[];slot:Slot}){
 const article=buildReviewArticle(data,records,now,slot);
 const [copied,setCopied]=useState(false);
 const [showText,setShowText]=useState(false);
 const copy=async()=>{try{await navigator.clipboard.writeText(reviewText(article));setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setShowText(true);}};
 const download=()=>{
  const url=URL.createObjectURL(new Blob([reviewHtml(article)],{type:'text/html;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;
  a.download=article.title+'.html';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <section className="panel review-card review-article">
  <div className="panel-heading"><div><h2><BookOpen size={18}/> {article.title}</h2><p>{article.meta}</p></div>
   <div className="button-row"><button className="secondary-btn" onClick={()=>void copy()}><Copy size={14}/>{copied?'已复制':'复制全文'}</button>
    <button className="secondary-btn" onClick={download}><Download size={14}/>下载 HTML</button></div>
  </div>
  {showText&&<textarea aria-label="复盘全文" className="review-note" readOnly value={reviewText(article)} onFocus={e=>e.target.select()}/>}
  <div className="review-article-grid">{article.sections.map(s=><article key={s.title}><h3>{s.title}</h3><ul>{(s.lines.length?s.lines:['待核验']).map((line,i)=><li key={i}>{line}</li>)}</ul></article>)}</div>
  <small className="review-disclaimer">{article.disclaimer}</small>
 </section>;
}
