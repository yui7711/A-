import type {Market,Source} from './market-types';
import {hasMarketData} from './market-state.ts';
import {marketClock,quoteEpoch} from './tactics.ts';
import {connectionHint} from './connection-hint.ts';
import {selectMarket} from './market-router.ts';
type Kind='fuyao'|'public';
type Result={kind:Kind;data:Market|null;checkedAt:number;error?:string};
type Options={live:(force:boolean)=>Promise<Market>;publicMarket:(force:boolean,snapshot:Market|null)=>Promise<Market>;snapshot:()=>Promise<Market|null>;previous?:()=>Market|null;now?:()=>number;preferLive?:()=>boolean};
/** Whole-pool validation: a response containing quotes alone is not a healthy pool. */
export function cohortGrade(data:Market|null,kind:Kind,now=Date.now()){
 if(!hasMarketData(data)||!data.poolDate||data.poolDate!==data.tradeDate||data.providerMode==='snapshot')return 0;
 const source=data.sources.find(s=>s.id===(kind==='fuyao'?'fuyao':'em-pool'));
 if(!source||!['ok','partial'].includes(source.status)||source.mode==='snapshot'||source.date&&source.date!==data.poolDate)return 0;
 const clock=marketClock(now);if(data.poolDate>clock.date||(clock.live||clock.phase==='lunch')&&data.poolDate!==clock.date)return 0;
 if(!Number.isFinite(Date.parse(data.fetchedAt))||now-Date.parse(data.fetchedAt)>180000||Date.parse(data.fetchedAt)>now+60000)return 0;
 const quotes=data.indices.filter(q=>['sh000001','sz399001','sz399006','sh000300'].includes(q.code));
 const complete=data.poolTotal!=null&&new Set(data.stocks.map(s=>s.code)).size===data.poolTotal&&data.stocks.every(s=>/^\d{6}$/.test(s.code));
 const stats=data.stats,valid=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const total=Number(stats.up)+Number(stats.opened);
 const statsReady=valid(stats.up)&&valid(stats.down)&&valid(stats.opened)&&(total===0||valid(stats.sealRate)&&Math.abs(Number(stats.sealRate)-Number(stats.up)/total)<=.03);
 const quotesReady=new Set(quotes.map(q=>q.code)).size===4&&quotes.every(q=>{
  if(typeof q.time!=='string'||q.time.slice(0,8)!==data.poolDate!.replaceAll('-','')||q.price==null||q.price<=0)return false;
  const time=quoteEpoch(q.time);return time!=null&&(!clock.live||now-time<=180000&&time<=now+60000);
 });
 if(clock.live&&data.poolTimestamp&&(now-data.poolTimestamp>180000||data.poolTimestamp>now+60000))return 0;
 return complete&&statsReady&&quotesReady?2:1;
}
export async function firstAvailable<T>(jobs:Array<()=>Promise<T>>,valid:(value:T)=>boolean):Promise<T>{
 return Promise.any(jobs.map(async job=>{const value=await job();if(!valid(value))throw Error('通道未返回有效数据');return value;}));
}
/** A pending browser request is shared across polls, so a slow standby never multiplies requests. */
export function createMultiSourceReader({live,publicMarket,snapshot,previous=()=>null,now=Date.now,preferLive=()=>false}:Options){
 let pending:Promise<Result>|null=null,lastLive:Result|null=null,lastPublic:Result|null=null,active:Kind|null=null;
 function checkLive(force:boolean){
  if(pending)return pending;
  const job=Promise.resolve().then(()=>live(force)).then(data=>({kind:'fuyao' as const,data,checkedAt:now()}),e=>({kind:'fuyao' as const,data:null,checkedAt:now(),error:connectionHint(e)}));
  pending=job.then(result=>{lastLive=result;pending=null;return result;});return pending;
 }
 function standby():Source{
  const row=lastLive?.data?.sources.find(s=>s.id==='fuyao'),available=lastLive?.data&&cohortGrade(lastLive.data,'fuyao',now())===2;
  const direct=row?.transport==='browser-direct';
  return {id:'fuyao',transport:direct?'browser-direct':'server',name:direct?'同花顺兼容源 · FUYAO（本页直连）':'同花顺兼容源 · FUYAO（实时自动通道）',url:'https://fuyao.aicubes.cn',date:row?.date||null,
   status:available?'ok':lastLive?'error':'partial',mode:'fallback',availability:available?'standby':lastLive?'unavailable':'checking',
   checkedAt:lastLive?new Date(lastLive.checkedAt).toISOString():undefined,errorCode:row?.errorCode,
   message:available?(direct?'本页直连已验证，Key 仅用于同花顺接口；公开源故障时自动接管。':'同花顺实时通道可用；公开源故障时自动接管，Key只在服务端使用。'):lastLive?(lastLive.error||row?.message||'同花顺本轮日期、时效或池完整性未通过检查')+'；自动继续东方财富 / 腾讯，下轮重试。':'正在检测同花顺连接；不阻塞公开直连。'};
 }
 function modules(data:Market,other:Market|null){
  if(!other)return data;
  let next={...data,sources:[...data.sources]};
  const takeSource=(id:string)=>{const s=other.sources.find(s=>s.id===id);if(s)next.sources=next.sources.filter(s=>s.id!==id).concat(s);};
  const hot=other.sources.find(s=>s.id==='hot');if(hot?.status==='ok'&&hot.mode!=='snapshot'&&hot.date&&hot.date>=String(data.sources.find(s=>s.id==='hot')?.date||'')&&other.hot.length){next.hot=other.hot;takeSource('hot');}
  const lhb=other.sources.find(s=>s.id==='lhb');if(lhb?.status==='ok'&&other.lhbDate&&other.lhbDate>=String(data.lhbDate||'')&&other.lhb.length){next.lhb=other.lhb;next.lhbDate=other.lhbDate;takeSource('lhb');}
  const sector=other.sources.find(s=>s.id==='eastmoney');if(!next.sectors.length&&sector?.status==='ok'&&other.sectors.length){next.sectors=other.sectors;takeSource('eastmoney');}
  return next;
 }
 return async function read(force=false,prefer:'public'|'auto'='public'):Promise<Market>{
  const liveJob=checkLive(force),snapshotJob=snapshot().catch(()=>null);
  const publicJob=snapshotJob.then(s=>publicMarket(force,s)).then(data=>({kind:'public' as const,data,checkedAt:now()}),e=>({kind:'public' as const,data:null,checkedAt:now(),error:connectionHint(e)})).then(result=>{lastPublic=result;return result;});
  const valid=(r:Result)=>cohortGrade(r.data,r.kind,now())===2;
  let selected:Result;
  try{selected=await firstAvailable(prefer==='auto'?[()=>liveJob,()=>publicJob]:[()=>publicJob,()=>liveJob],valid);}
  catch{
   const results=await Promise.all([publicJob,liveJob]);
   const partial=results.filter(r=>cohortGrade(r.data,r.kind,now())>0).sort((a,b)=>String(b.data!.poolDate).localeCompare(String(a.data!.poolDate))||Number(b.kind==='public')-Number(a.kind==='public'));
   if(!partial.length){
    const saved=[previous(),await snapshotJob].filter((m):m is Market=>hasMarketData(m)).sort((a,b)=>String(b.poolDate).localeCompare(String(a.poolDate))||Date.parse(b.fetchedAt)-Date.parse(a.fetchedAt))[0];
    const result=selectMarket(null,null,saved||null,'同花顺、东方财富实时通道本轮均未通过检查；当前保留最新成功快照');
    return {...result,sources:result.sources.map(s=>s.id==='tdx'?s:{...s,availability:undefined,mode:'snapshot'})};
   }
   selected=partial[0];
  }
  // Explicitly enabled private direct connection gets a bounded chance, still requiring a full healthy cohort.
  if(preferLive()&&selected.kind==='public'&&valid(selected)){
   const direct=await new Promise<Result|null>(resolve=>{const timer=setTimeout(()=>resolve(null),2500);void liveJob.then(r=>{clearTimeout(timer);resolve(valid(r)?r:null);});});
   if(direct)selected=direct;
  }
  // Keep a healthy active cohort within a bounded 500ms grace, avoiding source-count flicker.
  if(active&&selected.kind!==active&&valid(selected)&&!(preferLive()&&selected.kind==='fuyao')){
   const previousJob=active==='fuyao'?liveJob:publicJob;
   const stable=await new Promise<Result|null>(resolve=>{const timer=setTimeout(()=>resolve(null),500);void previousJob.then(r=>{clearTimeout(timer);resolve(valid(r)?r:null);});});
   if(stable)selected=stable;
  }
  if(valid(selected))active=selected.kind;
  if(selected.kind==='fuyao'){
   const publicDone=await Promise.race([publicJob,Promise.resolve(null)]);
   const backup=publicDone||(lastPublic&&now()-lastPublic.checkedAt<30000?lastPublic:null),merged=modules(selected.data!,backup?.data||null),available=cohortGrade(backup?.data||null,'public',now())===2;
   const em:Source={id:'em-pool',name:'东方财富 · 实时自动备用池',status:available?'ok':backup?'error':'partial',availability:available?'standby':backup?'unavailable':'checking',mode:'fallback',date:backup?.data?.poolDate||null,url:'https://quote.eastmoney.com/ztb/',checkedAt:backup?new Date(backup.checkedAt).toISOString():undefined,message:available?'东方财富完整同日池可用；同花顺故障时自动接管。':backup?'东方财富本轮暂不可用；同花顺正在提供完整行情，下轮自动重试。':'正在独立检测东方财富备用池，不阻塞同花顺行情。'};
   const direct=merged.sources.some(s=>s.id==='fuyao'&&s.transport==='browser-direct');
   return {...merged,providerMode:'proxy',sources:[...merged.sources.filter(s=>s.id!=='em-pool').map(s=>s.id==='fuyao'?{...s,transport:s.transport||'server' as const,availability:'active' as const}:s),em],notice:`三源自动切换 · 当前涨停池与统计：同花顺${direct?'本页直连（绕过转发域名）':''}；报价按各自来源标注。每5秒请求，故障时自动切换东方财富 / 腾讯。`};
  }
  const other=lastLive&&now()-lastLive.checkedAt<30000?lastLive.data:null;
  const data=modules(selected.data!,other);
  return {...data,providerMode:'public',sources:[standby(),...data.sources.filter(s=>s.id!=='fuyao')],notice:'三源自动切换 · 当前涨停池与统计：东方财富，报价：腾讯 / 可用备用源。同花顺实时通道独立检测，故障不阻塞公开直连；每5秒刷新。'};
 };
}
