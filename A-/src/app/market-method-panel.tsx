import {Activity,Layers,Target} from 'lucide-react';
import {type SealSnapshot} from '@/lib/closing-signals';
import type {Market,Stock} from '@/lib/market-types';
import {marketMethod} from '@/lib/market-method';

const signed=(n:number|null,unit:string,digits=0)=>n==null?'—':`${n>0?'+':''}${n.toFixed(digits)} ${unit}`;
const epochLabel=(at:number)=>new Date(at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});

export function MarketMethodPanel({data,now,records,onStock,section}:{data:Market|null;now:number;records:SealSnapshot[];onStock:(code:string,name:string)=>void;section?:'turn'|'rotation'|'roles'}){
 const m=marketMethod(data,now,records);
 const direction=!m.baseline?'muted':m.weakens?'watch':'priority';
 const signal=!m.baseline?'待核验':m.weakens?'降温线索':m.improves?'修复线索':'方向未形成共振';
 const headline=!m.previousLines.length||!m.currentLines.length?'主线对照待核验':m.switchCandidate?'主线切换候选':m.switched?'首位变动，继续跟踪':'首位主线延续';
 const lead=m.currentLines[0];
 const leader=lead?.stocks[0];
 const volume=[...(lead?.stocks??[])].filter(s=>s.code!==leader?.code&&typeof s.amount==='number'&&s.amount>0).sort((a,b)=>b.amount!-a.amount!)[0];
 const later=leader&&/^\d\d:\d\d/.test(leader.time)?lead?.stocks.filter(s=>s.boards===1&&/^\d\d:\d\d/.test(s.time)&&s.time.slice(0,5)>leader.time.slice(0,5)).slice(0,3):[];
 const pick=(s:Stock)=> <button className="text-btn" key={s.code} onClick={()=>onStock(s.code,s.name)}>{s.name} · {s.boards}板</button>;
 return <section className="panel review-card method-live" aria-label="拐点、主线切换和个股角色">
  <div className="panel-heading"><div><h2>{section==='turn'?'拐点对照依据':section==='rotation'?'主线对照依据':section==='roles'?'题材内角色与个股线索':'周期拐点与主线结构'}</h2><p>{data?.tradeDate||'等待行情'} · {m.source||'等待来源'} · 按当前查看的行情或复盘快照计算</p></div><Activity size={18}/></div>
  <div className={'review-article-grid'+(section?' method-single':'')}>
   {(!section||section==='turn')&&<article><h3>情绪拐点</h3><span className={'focus-pill focus-'+direction}>{signal}</span>
    {m.baseline&&m.earlier?<><p>{m.baseline.date} {m.baseline.slot==='noon'?'午盘':'收盘'} {epochLabel(m.baseline.at)} → {data?.tradeDate} {epochLabel(m.at)} · {m.earlier.phase} → {m.current.phase}</p>
    <ul><li>涨停 {signed(m.widthDelta,'家')} · 炸板率 {signed(m.blastDelta==null?null:m.blastDelta*100,'个百分点',1)} · 高度 {signed(m.heightDelta,'板')}</li>
    <li>涨停增加且炸板率下降记为修复线索，反向共振记为降温线索。仍需下一时点确认。</li></ul></>:<p>需要同源有效快照。优先与当日午盘对照，其次对照最近已归档收盘。跨交易日对照仅作背景。</p>}
   </article>}
   {(!section||section==='rotation')&&<article><h3><Layers size={15}/> 主线切换</h3><span className={'focus-pill focus-'+(!m.previousLines.length||!m.currentLines.length?'muted':m.switched?'watch':'priority')}>{headline}</span>
    <p>{m.themeBaseline||'基准待核验'}前三：{m.previousLines.map(g=>`${g.name} ${g.count}只`).join(' · ')||'需要完整且同口径的题材名单'}</p>
    <p>本期前三：{m.currentLines.map(g=>`${g.name} ${g.count}只`).join(' · ')||'等待行情'}</p>
    <small>新首位至少 5 只涨停且已有连板层级，旧首位样本减少或退出，才列为切换候选。</small>
   </article>}
   {(!section||section==='roles')&&<article className="method-roles"><h3><Target size={15}/> 主线角色 · {lead?.name||'等待主线'}</h3>
    <dl>
     <div><dt>高度龙头候选</dt><dd>{leader?pick(leader):'待核验'}</dd><dd>先按题材内连板高度，再看观察分。</dd></div>
     <div><dt>中军线索</dt><dd>{volume?pick(volume):'待核验'}</dd><dd>{volume?`涨停样本内其余个股成交额最高（${(volume.amount!/1e8).toFixed(2)} 亿）。`:'需要同日成交额。'} 定位仍需全板块成交、流通盘与持续承接。</dd></div>
     <div><dt>补涨线索</dt><dd>{later?.length?later.map(pick):'待核验'}</dd><dd>筛选同题材、首板且首次封板时间晚于高度股的样本。后续需区分补涨与跟风。</dd></div>
    </dl>
   </article>}
  </div>
 </section>;
}
