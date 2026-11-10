import {buildClosingSignals,sealSource,type SealSnapshot} from './closing-signals.ts';
import type {Market} from './market-types.ts';
import {nextOutlook} from './next-outlook.ts';
import {buildResearch} from './research.ts';
import {assessTactics} from './tactics.ts';
import {marketMethod} from './market-method.ts';
import {handbookTurning,referenceRotation,themeRoles} from './reference-research.ts';

const percent=(n:number|null)=>n==null?'待核验':(n*100).toFixed(1)+'%';
const price=(n:number|null|undefined)=>n==null?'待核验':n.toFixed(2);
const time=(n:number)=>Number.isFinite(n)?new Date(n).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'待核验';

export function buildReviewArticle(data:Market,records:SealSnapshot[],now:number,slot:SealSnapshot['slot']){
 const tactics=assessTactics(data,now);
 const r=buildResearch(data,tactics);
 const closing=buildClosingSignals(data,records,now);
 const outlook=nextOutlook(data,records,now);
 const method=marketMethod(data,now,records);
 const turning=method.baseline
  ?`情绪对照 · ${method.baseline.date} ${method.baseline.slot==='noon'?'午盘':'收盘'} · ${method.improves?'修复线索':method.weakens?'降温线索':'方向未形成共振'}`
  :'情绪拐点待核验 · 尚缺同源基准';
 const rotation=method.previousLines.length&&method.currentLines.length
  ?`首位主线 · ${method.previousLines[0].name} → ${method.currentLines[0].name} · ${method.switchCandidate?'切换候选':method.switched?'排名变化待验证':'首位延续'}`
  :'主线切换待核验 · 尚缺同口径基准';
 const ladder=new Map<number,number>();
 for(const s of data.stocks.filter(s=>!s.isST))ladder.set(s.boards,(ladder.get(s.boards)??0)+1);
 const dimensions=r.dimensions.filter(d=>d.value!=null).sort((a,b)=>b.value!-a.value!);
 const strong=dimensions.filter(d=>d.value===dimensions[0]?.value).map(d=>d.name).join('、');
 const weak=dimensions.filter(d=>d.value===dimensions.at(-1)?.value).map(d=>d.name).join('、');
 const label=slot==='noon'?'午盘':'收盘';
 const next=slot==='noon'?'下午':'下一交易日';
 const score=r.average==null?'待核验':r.average.toFixed(1)+' / 10';
 const poolTime=data.poolTimestamp==null?'接口未给更新时间，采集于 '+time(Date.parse(data.fetchedAt)):'源时间 '+time(data.poolTimestamp);
 const date=data.tradeDate!;
 const sections=[
  {title:'情绪节点',lines:[`${r.phase} · ${score} · ${r.known}/6 维 · ${r.blocked?'暂停评估':tactics.status.label}`,r.conclusion,...r.risk.stops,...r.risk.warnings]},
  {title:'三大指标',lines:[`炸板率 ${percent(r.blast)} · 涨停 ${r.up??'—'} 家 / 炸板 ${r.opened??'—'} 家`,`最高 ${r.highest??'—'} 板 · 晋级率 ${percent(r.history.promotionRate)}`,`首位主线 ${r.mainlines.lines[0]?.name??'待归类'} · 涨停 ${r.mainlines.lines[0]?.count??'—'} 只`]},
  {title:'辅助信号',lines:[`回封率 ${percent(r.reseal)}${r.reseal!=null?'（按同口径涨停、开板及炸板数据计算）':''} · 最高板反复开板 ${r.highOpen??'待核验'} 只`,`高标核心警示 ${closing.valid?closing.riskCount:'待核验'} 只 · ${slot==='noon'?'尾盘对照待采集':'午盘对照 '+closing.rows.filter(x=>x.change!=null).length+'/'+closing.rows.length+' 只'}`]},
  {title:'连板梯队',lines:[[...ladder].sort(([a],[b])=>b-a).map(([boards,n])=>`${boards}板 ${n}只`).join(' · ')||'暂无梯队样本']},
  {title:'去噪涨停主线',lines:r.mainlines.lines.slice(0,5).map(g=>`${g.name} · ${g.count}只 · 最高${g.highest}板 · 热度${g.heat}/100`)},
  {title:'六维评分',lines:[`最强 ${strong||'待核验'} · 最弱 ${weak||'待核验'}`,...r.dimensions.map(d=>`${d.name} ${d.value?.toFixed(1)??'待核验'} · ${d.detail}`)]},
  {title:'高标与关注线索',lines:closing.rows.slice(0,8).map(({stock:s,ratio,comparison,signals})=>`${s.name} ${s.code} · ${s.boards}板 · 开板 ${s.openTimes??'待核验'} · ${s.themes.slice(0,2).join(' / ')||'题材待补齐'} · 封成比 ${ratio?.toFixed(3)??'待核验'} · ${signals.map(t=>t.label).join('、')} · ${comparison} · 快照日低点 ${price(s.low)}`)},
  {title:`${next}复盘计划`,lines:[...(slot==='late'?[outlook.title,outlook.base]:[]),...r.checks.map(c=>`${c.label} · ${c.detail} · ${c.passed==null?'待核验':c.passed?'已满足':'未满足'}`),`重新验证 · ${next}核对主线留存、梯队承接、封单和开板；条件齐备后再核验个股`,'失效条件 · 封板率低于 50% 或四指数均值不高于 −2% 等严重风险触发时，暂停战法评估','风控 · 快照日低点可作结构核验参考；实际退出条件与风险预算由使用者确认']},
 ];
 sections[0].lines.push(turning);
 sections[4].lines.push(rotation);
 if(!r.blocked&&!data.cached){
  const flags=handbookTurning(data,method).map(t=>({name:t.name,yes:t.signals.filter(s=>s.passed===true).length,known:t.signals.filter(s=>s.passed!=null).length,total:t.signals.length})).filter(t=>t.yes>=2);
  sections[2].lines.push(...(flags.length?flags.map(t=>`${t.name} · 命中 ${t.yes} · 已核验 ${t.known}/${t.total} · 待后续确认`):['八类拐点中暂无两项以上同类信号命中']));
  const rotationEvidence=referenceRotation(data,method,records);
  if(rotationEvidence.dates.length>1){
   sections[4].lines.push(`题材趋势 · ${rotationEvidence.trendSource} · ${rotationEvidence.dates.join(' / ')}`);
   sections[4].lines.push(...rotationEvidence.trend.slice(0,4).map(t=>t.name+' · '+t.counts.map(n=>n??'—').join(' / ')));
  }
  for(const g of method.currentLines.slice(0,3)){
   const role=themeRoles(g);
   sections[6].lines.push(`${g.name} · 高度龙头候选 ${role.leader?.name||'待核验'} · 中军成交线索 ${role.middle?.name||'待核验'} · 补涨线索 ${role.followers.map(s=>s.name).join('、')||'待核验'}`);
  }
 }
 const title=`${date} 曜石市场复盘 · ${label}版`;
 const meta=`${sealSource(data)||'行情快照'} · ${poolTime}`;
 return {title,meta,sections,disclaimer:'仅供行情研究参考，不构成投资建议。'};
}

export type ReviewArticle=ReturnType<typeof buildReviewArticle>;
export const reviewText=(a:ReviewArticle)=>[a.title,a.meta,...a.sections.map(s=>[s.title,...(s.lines.length?s.lines:['待核验'])].join('\n')),a.disclaimer].join('\n\n');

export function reviewHtml(a:ReviewArticle){
 const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(a.title)}</title>
 <style>:root{color-scheme:light;--bg:#e7effa;--ink:#132237;--card:#ffffff62;--line:#ffffffa0;--accent:#285eaa}
 :root[data-theme=dark]{color-scheme:dark;--bg:#111a30;--ink:#e8ecf6;--card:#ffffff12;--line:#ffffff28;--accent:#a6c9ff}
 body{font:15px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);margin:0;background:radial-gradient(at 22% 0%,var(--card),transparent 60%),var(--bg);min-height:100vh}
 main{max-width:1050px;margin:auto;padding:clamp(16px,4vw,48px)}header,section{padding:20px;border:1px solid var(--line);border-radius:22px;background:var(--card);backdrop-filter:blur(20px) saturate(180%);box-shadow:0 12px 36px #0b204216,inset 0 1px 0 var(--line)}
 header{margin-bottom:16px}h1,h2{line-height:1.25;margin:0 0 10px}h1{font-size:clamp(24px,4vw,34px)}h2{font-size:18px;color:var(--accent)}
 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px}ul{padding-left:21px;margin:0}button{float:right;border:1px solid var(--line);background:var(--card);color:inherit;border-radius:20px;padding:6px 12px;cursor:pointer}</style>
 <main><header><button type="button" id="theme" aria-label="切换主题">切换主题</button><h1>${escape(a.title)}</h1><p>${escape(a.meta)}</p></header>
 <div class="grid">${a.sections.map(s=>`<section><h2>${escape(s.title)}</h2><ul>${(s.lines.length?s.lines:['待核验']).map(line=>`<li>${escape(line)}</li>`).join('')}</ul></section>`).join('')}</div>
 <p>${escape(a.disclaimer)}</p></main><script>const root=document.documentElement;try{root.dataset.theme=localStorage.getItem('obsidian-review-theme')||'light'}catch{};document.querySelector('#theme').onclick=()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('obsidian-review-theme',root.dataset.theme)}catch{}};</script></html>`;
}
