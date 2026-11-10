import {useState,type ReactNode} from 'react';
import {Activity,ArrowRightLeft,BookOpen,Flame,Layers,ShieldCheck,Target} from 'lucide-react';
import {buildClosingSignals,type SealSnapshot} from '@/lib/closing-signals';
import {emotionStages} from '@/lib/emotion-cycle';
import {marketMethod} from '@/lib/market-method';
import type {Market} from '@/lib/market-types';
import {buildResearch} from '@/lib/research';
import {assessTactics} from '@/lib/tactics';
import {ClosingWarningPanel,ClosingWatchPanel} from './closing-panels';
import {MarketMethodPanel} from './market-method-panel';
import {AuxiliaryPanel,MainlinePanel,PlanPanel,SentimentPanel} from './research-panels';
import {ArchivedArticle,ArchivedPlan} from './review-workspace';
import {SignalLegend} from './signal-legend';
import TacticsPanel from './tactics-panel';

const sections=[
 {id:'cycle',label:'周期判定',icon:Activity},
 {id:'topics',label:'题材热点',icon:Flame},
 {id:'turn',label:'拐点识别',icon:Target},
 {id:'rotation',label:'主线切换',icon:ArrowRightLeft},
 {id:'roles',label:'主线 · 龙头 · 中军 · 补涨',icon:Layers},
 {id:'plan',label:'操作策略',icon:ShieldCheck},
 {id:'report',label:'复盘报告',icon:BookOpen},
] as const;
type Section=typeof sections[number]['id'];
type Tone='priority'|'positive'|'watch'|'risk'|'muted';
type Metric={label:string;value:string;detail:string;tone?:Tone};
type Report={market:Market;now:number;slot:SealSnapshot['slot']};
type Props={
 data:Market|null;
 now:number;
 records:SealSnapshot[];
 archivePeriod?:SealSnapshot['slot'];
 report:Report|null;
 controls:ReactNode;
 onStock:(code:string,name:string)=>void;
};

const count=(n:number|null|undefined,unit:string)=>n==null?'—':n+' '+unit;
const percent=(n:number|null|undefined)=>n==null?'—':(n*100).toFixed(1)+'%';
const delta=(n:number|null,unit:string,digits=0)=>n==null?'—':(n>0?'+':'')+n.toFixed(digits)+' '+unit;
const atLabel=(at:number)=>Number.isFinite(at)?new Date(at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'时点待核验';

function ResultCard({title,result,tone,description,metrics}:{title:string;result:string;tone:Tone;description:string;metrics:Metric[]}){
 return <section className={'panel result-card focus-'+tone}>
  <div className="result-card-heading"><div><span className="section-step">{title}</span><h2>{result}</h2><p>{description}</p></div><SignalLegend/></div>
  <div className="result-metrics">{metrics.map(m=><article key={m.label} className={'focus-'+(m.value==='—'?'muted':m.tone||'priority')}>
   <span>{m.label}</span><strong>{m.value}</strong><small>{m.detail}</small>
  </article>)}</div>
 </section>;
}

function Evidence({title,children}:{title:string;children:ReactNode}){
 return <details className="panel overview-fold result-evidence"><summary>{title}</summary>{children}</details>;
}

export function MarketResults({data,now,records,archivePeriod,report,controls,onStock}:Props){
 const [section,setSection]=useState<Section>('cycle');
 const context=assessTactics(data,now);
 const method=marketMethod(data,now,records);
 const r=method.current;
 const valid=!!data&&!data.cached&&!r.blocked;
 const lead=method.currentLines[0];
 const old=method.previousLines[0];
 const closing=buildClosingSignals(valid?data:null,records,now);
 const period=archivePeriod??(context.clock.phase==='lunch'?'noon':'late');
 const modelProps={data,now,records,onStock};
 const blastTone:Tone=r.blast==null?'muted':r.blast>.5?'risk':r.blast>=.25?'watch':'priority';
 const commonMetrics=(model:typeof r,usable:boolean):Metric[]=>[
  {label:'涨停 / 炸板',value:usable&&model.up!=null&&model.opened!=null?`${model.up} / ${model.opened}`:'—',detail:'同源整体统计 · 家'},
  {label:'最高连板',value:usable?count(model.highest,'板'):'—',detail:'非 ST 涨停池'},
  {label:'炸板率',value:usable?percent(model.blast):'—',detail:'炸板 ÷（涨停＋炸板）',tone:model.blast!=null&&model.blast>.5?'risk':model.blast!=null&&model.blast>=.25?'watch':'priority'},
 ];
 let panel:ReactNode;
 switch(section){
  case 'cycle':
   panel=<><ResultCard title="周期判定 · 当前结论" result={valid?r.phase:'等待有效行情'} tone={!valid?'muted':r.defensive?'risk':r.caution?'watch':emotionStages[r.cycle.index]?.color||'muted'}
    description={valid?r.conclusion:context.dataIssue||'行情等待校验。'}
    metrics={[{label:'情绪六维',value:valid&&r.average!=null?r.average.toFixed(1)+' / 10':'—',detail:valid?`${r.known}/6 维有数据`:'暂无有效评分'},...commonMetrics(r,valid),
     {label:'高标危险信号',value:valid?count(closing.riskCount,'只'):'—',detail:closing.high.find(row=>row.tone==='risk')?.signals[0]?.label||'见拐点识别内的封单明细',tone:closing.riskCount?'risk':'priority'}]}/>
    <Evidence title="查看情绪周期、六维评分与辅助信号"><SentimentPanel data={data} now={now}/><AuxiliaryPanel data={data} now={now}/></Evidence></>;
   break;
  case 'topics':
   panel=<><ResultCard title="题材热点 · 去噪排名" result={lead?lead.name+' 暂列首位':'题材数据待核验'} tone={lead?'priority':'muted'}
    description={lead?'按产业归并、同题材同股去重。热度结合涨停数、最高板和连板层级。':'等待有效涨停名单及题材归类。'}
    metrics={method.currentLines.length?method.currentLines.map((g,i)=>({label:`TOP ${i+1} · ${g.name}`,value:count(g.count,'只涨停'),detail:`热度 ${g.heat}/100 · 最高 ${g.highest} 板`})):[{label:'主线样本',value:'—',detail:'尚未取得有效名单'}]}/>
    <MainlinePanel data={valid?data:null} now={now} onStock={onStock}/></>;
   break;
  case 'turn':
   panel=<><ResultCard title="拐点识别 · 同源对照" result={!method.baseline?'拐点待核验':method.improves?'出现修复线索':method.weakens?'出现降温线索':'指标方向未形成共振'}
    tone={!method.baseline?'muted':method.weakens?'watch':'priority'}
    description={method.baseline?`${method.baseline.date} ${method.baseline.slot==='noon'?'午盘':'收盘'} ${atLabel(method.baseline.at)} → ${data?.tradeDate} ${atLabel(method.at)} · ${method.earlier?.phase} → ${r.phase}`:'缺少可对照的同源快照。快照齐备后按原规则重新判定。'}
    metrics={[
     {label:'涨停变化',value:delta(method.widthDelta,'家'),detail:'当前减基准'},
     {label:'炸板率变化',value:delta(method.blastDelta==null?null:method.blastDelta*100,'个百分点',1),detail:'当前减基准',tone:method.blastDelta!=null&&method.blastDelta>0?'watch':'priority'},
     {label:'最高板变化',value:delta(method.heightDelta,'板'),detail:'非 ST 梯队'},
    ]}/>
    <Evidence title="展开拐点依据与午盘、尾盘封单"><MarketMethodPanel {...modelProps} section="turn"/><ClosingWarningPanel {...modelProps} archiveView={!!archivePeriod} period={archivePeriod}/></Evidence></>;
   break;
  case 'rotation':
   panel=<><ResultCard title="主线切换 · 新旧首位" result={!lead||!old?'主线对照待核验':method.switchCandidate?'主线切换候选':method.switched?'榜首变动 · 待确认':'首位主线延续'}
    tone={!lead||!old?'muted':method.switched?'watch':'priority'}
    description="新首位至少 5 只涨停且已有连板层级，旧首位样本减少或退出时，列为切换候选。"
    metrics={[
     {label:'基准首位',value:old?.name||'—',detail:old?`${method.themeBaseline||'基准日期待核验'} · ${old.count} 只涨停`:'缺少同口径基准'},
     {label:'当前首位',value:lead?.name||'—',detail:lead?`${lead.count} 只涨停 · 最高 ${lead.highest} 板`:'当前主题待核验'},
     {label:'前三留存',value:old&&lead?method.previousLines.filter(l=>method.currentLines.some(c=>c.name===l.name)).length+' / '+method.previousLines.length:'—',detail:'按题材名匹配'},
    ]}/>
    <MarketMethodPanel {...modelProps} section="rotation"/></>;
   break;
  case 'roles':
   panel=<><ResultCard title="主线 · 龙头 · 中军 · 补涨" result={lead?`重点查看 ${lead.name}`:'等待有效主线'} tone={lead?'priority':'muted'}
    description="角色卡列出同题材样本与判定依据。中军仍需核验全板块成交和持续承接。"
    metrics={[
     {label:'主线涨停样本',value:count(lead?.count,'只'),detail:'去噪后样本'},
     {label:'高度龙头候选',value:lead?.stocks[0]?.name||'—',detail:lead?`${lead.highest} 板 · 题材内按板数优先`:'等待样本'},
     {label:'高标危险信号',value:valid?count(closing.riskCount,'只'):'—',detail:'当前完整池的高标警示',tone:closing.riskCount?'risk':'priority'},
    ]}/>
    <MarketMethodPanel {...modelProps} section="roles"/>
    <Evidence title="展开高标个股、封单与下一时段观察"><ClosingWatchPanel {...modelProps} period={archivePeriod}/></Evidence></>;
   break;
  case 'plan':
   panel=<><ResultCard title="操作策略 · 先看风控" result={valid?context.status.label:'暂停判断 · 等待有效数据'} tone={valid?context.status.color:'muted'}
    description={valid?context.status.action:context.dataIssue||'等待有效行情。'}
    metrics={[
     {label:'适用战法',value:valid&&context.primaryId?context.primary:'—',detail:'待盘口与个股确认'},
     {label:'环境条件',value:valid?r.checks.filter(c=>c.passed===true).length+' / '+r.checks.length:'—',detail:'达到环境观察门槛的项数'},
     {label:'严重风险',value:valid?count(r.risk.stops.length,'项'):'—',detail:r.risk.stops[0]||'按本站规则核验',tone:r.defensive?'risk':'priority'},
     {label:'炸板率',value:valid?percent(r.blast):'—',detail:'结合封板质量判断',tone:blastTone},
    ]}/>
    {archivePeriod&&data?<ArchivedPlan data={data} now={now} records={records} slot={period}/>:<PlanPanel data={data} now={now} period={period==='noon'?'下午':'下一交易日'}/>}
    <Evidence title="展开三大战法与三合一扫描"><TacticsPanel data={data} now={now} expanded onStock={onStock}/></Evidence></>;
   break;
  case 'report': {
   const review=report?buildResearch(report.market,assessTactics(report.market,report.now)):null;
   panel=<><ResultCard title="复盘报告 · 先看结论" result={review?.phase||'暂无该时段的复盘归档'} tone={!review||review.blocked?'muted':review.defensive?'risk':review.caution?'watch':'priority'}
    description={report?`${report.market.tradeDate} · ${report.slot==='noon'?'午盘':'收盘'}归档 · 支持复制全文和下载 HTML`:'选择有归档的日期或时段后查看。'}
    metrics={review?commonMetrics(review,!review.blocked):[{label:'归档状态',value:'—',detail:'等待有效快照'}]}/>
    {report&&<ArchivedArticle key={report.market.tradeDate+report.slot} data={report.market} now={report.now} records={records.filter(s=>s.origin==='cloud')} slot={report.slot}/>}</>;
   break;
  }
 }
 return <div className="market-results">
  <nav className="result-nav" aria-label="市场判定和复盘">
   {sections.map((s,i)=><button key={s.id} type="button" aria-pressed={section===s.id} onClick={()=>setSection(s.id)}>
    <s.icon size={16}/><span>{s.label}</span><small>{String(i+1).padStart(2,'0')}</small>
   </button>)}
  </nav>
  {controls}
  {panel}
 </div>;
}
