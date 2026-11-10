import type {History,Market,Quote} from './market-types';
import {symbol} from './market-core';
import {selectQuotes} from './quote-selection';
import {requestJSON as httpJSON,fetchSectorFallback} from './http-client';
import {createPublicDataClient} from './public-data';
import {fetchPublicJSON} from './public-transport';
import {createMultiSourceReader,firstAvailable} from './multi-source';
import {createPublicResearchClient} from './public-research';
import {getDataRoute} from './connection-preferences';
import {hasFuyaoDirect,readFuyaoDirect,fuyaoDirectRevision} from './fuyao-direct';
export {fetchSectorFallback};

const globals=window as unknown as Record<string,unknown>;
let quoteQueue=Promise.resolve();
function quoteScript(url:string):Promise<string>{
 const job=quoteQueue.then(()=>new Promise<string>((resolve,reject)=>{
  const parsed=new URL(url);if(parsed.origin!=='https://qt.gtimg.cn'||!/^\/q=(?:(?:sh|sz|bj)\d{6})(?:,(?:sh|sz|bj)\d{6})*$/.test(parsed.pathname))return reject(new Error('行情地址无效'));
  const codes=parsed.pathname.slice(3).split(','),script=document.createElement('script');script.charset='gbk';script.referrerPolicy='no-referrer';
  const clean=()=>{clearTimeout(timer);script.remove();for(const c of codes)delete globals['v_'+c];};
  const timer=setTimeout(()=>{clean();reject(new Error('公开报价连接超时'));},7000);
  script.onerror=()=>{clean();reject(new Error('公开报价连接失败'));};
  script.onload=()=>{const text=codes.map(c=>`v_${c}="${String(globals['v_'+c]||'')}";`).join('\n');clean();resolve(text);};
  script.src=url+'?t='+Date.now();document.head.append(script);
 }));
 quoteQueue=job.then(()=>undefined,()=>undefined);return job;
}
function jsonp(url:string):Promise<unknown>{
 return new Promise((resolve,reject)=>{
  const parsed=new URL(url);if(parsed.origin!=='https://datacenter-web.eastmoney.com')return reject(new Error('数据地址无效'));
  const name='obsidian_'+crypto.randomUUID().replaceAll('-',''),script=document.createElement('script');let called=false;
  const clean=()=>{clearTimeout(timer);script.remove();delete globals[name];};
  const timer=setTimeout(()=>{clean();reject(new Error('披露数据连接超时'));},7000);
  globals[name]=(data:unknown)=>{called=true;clean();resolve(data);};
  script.onerror=()=>{clean();reject(new Error('披露数据连接失败'));};
  script.onload=()=>{if(!called){clean();reject(new Error('披露数据未返回有效回调'));}};
  parsed.searchParams.set('callback',name);script.src=parsed.href;document.head.append(script);
 });
}
const client=createPublicDataClient(async(url,options={})=>{
 if(options.kind==='quotes')return quoteScript(url);
 if(options.kind==='jsonp')return jsonp(url);
 return fetchPublicJSON(url,options);
});
let historyCache:{time:number;pools:any[]}|undefined;
const publicResearch=createPublicResearchClient(url=>fetchPublicJSON(url),Date.now,async()=>{
 if(historyCache&&Date.now()-historyCache.time<60000)return historyCache.pools;
 const url=location.protocol==='file:'?new URL('https://yui7711.github.io/A-/data/history.json'):new URL('data/history.json',new URL(import.meta.env.BASE_URL,location.href));
 const j=await httpJSON<{pools:any[]}>(url.href,{}, {timeoutMs:3500,retries:0});if(!Array.isArray(j.pools))throw Error('历史对照格式无效');historyCache={time:Date.now(),pools:j.pools};return j.pools;
});
let snapshot:Market|null=null,snapshotPromise:Promise<Market|null>|null=null,snapshotCheckedAt=0,embeddedChecked=false;
export async function loadSnapshot():Promise<Market|null>{
 if(snapshotPromise)return snapshotPromise;
 if(snapshot&&Date.now()-snapshotCheckedAt<30000)return snapshot;
 const embedded=document.getElementById('bootstrap-market');
 if(!embeddedChecked&&embedded?.textContent){embeddedChecked=true;try{const j=JSON.parse(embedded.textContent) as Market;if(Array.isArray(j.stocks)&&Array.isArray(j.indices)&&Array.isArray(j.sources)){snapshot=j;snapshotCheckedAt=Date.now();return j;}}catch{/* Use the separately published snapshot. */}}
 const snapshotUrl=new URL('data/latest.json',new URL(import.meta.env.BASE_URL,location.href));snapshotUrl.searchParams.set('t',String(Math.floor(Date.now()/30000)));
 snapshotPromise=httpJSON<Market>(snapshotUrl.href,{}, {timeoutMs:3500,retries:0}).then(j=>{
  if(!Array.isArray(j.stocks)||!Array.isArray(j.indices)||!Array.isArray(j.sources))return null;snapshot=j;return j;
 }).catch(()=>snapshot).finally(()=>{snapshotPromise=null;snapshotCheckedAt=Date.now();});return snapshotPromise;
}
const liveURL='https://obsidian-stock-radar.d69m29kwvj.chatgpt.site';
const proxyJSON=<T,>(path:string,timeoutMs=18000,signal?:AbortSignal)=>httpJSON<T>(liveURL+path,{credentials:'omit',signal},{timeoutMs,retries:0});
function publicRoute(){return getDataRoute(k=>localStorage.getItem(k))==='public';}
let lastMarket:Market|null=null;
const makeReader=()=>createMultiSourceReader({
 live:f=>hasFuyaoDirect()?readFuyaoDirect():proxyJSON<Market>('/api/provider-market'+(f?'?fresh=1':''),12000),
 preferLive:hasFuyaoDirect,
 fuyaoFirst:true,
 snapshot:loadSnapshot,
 previous:()=>lastMarket,
 publicMarket:(f,s)=>client.market(f,s),
});
let multiSource=makeReader(),directRevision=fuyaoDirectRevision();
const enrichment=new Map<string,{pending:boolean;checkedAt:number;value?:Market}>();
function enrichOnNextPoll(data:Market){
 if(data.providerMode==='snapshot'||!data.tradeDate||data.research?.volume&&data.research.previousPool)return data;
 const key=[data.tradeDate,data.providerMode,data.themeBasis].join('/');
 let state=enrichment.get(key);
 if(!state){
  state={pending:false,checkedAt:0};
  enrichment.set(key,state);
  if(enrichment.size>4)enrichment.delete(enrichment.keys().next().value!);
 }
 if(!state.pending&&Date.now()-state.checkedAt>=20000){
  const entry=state;
  entry.pending=true;
  void loadSnapshot().then(s=>publicResearch(data,s)).then(result=>{entry.value=result;}).catch(()=>{}).finally(()=>{
   entry.checkedAt=Date.now();
   entry.pending=false;
  });
 }
 const evidence=state.value?.research;
 if(!evidence)return data;
 const current=data.research;
 const merged=current?{...evidence,...current,previousPool:current.previousPool??evidence.previousPool,volume:current.volume??evidence.volume}:evidence;
 return {...data,research:merged};
}
async function getMarket(force:boolean){
 if(directRevision!==fuyaoDirectRevision()){directRevision=fuyaoDirectRevision();multiSource=makeReader();}
 const data=await multiSource(force,publicRoute()?'public':'auto');
 const next=enrichOnNextPoll(data);
 if(next.providerMode!=='snapshot')lastMarket=next;return next;
}
const chartCache=new Map<string,History>();
async function chart(code:string,mode:string){
 const id=code+mode;try{const jobs=[()=>client.history(code,mode),()=>proxyJSON<History>('/api/history?code='+encodeURIComponent(code)+'&mode='+encodeURIComponent(mode),7000)];const h=await firstAvailable(publicRoute()?jobs:jobs.reverse(),h=>!!h.points?.length);chartCache.set(id,h);return h;}catch(e){const old=chartCache.get(id);if(old)return {...old,stale:true,notice:'保留本次页面中最近成功的真实图表'};throw e;}
}
async function getWatchQuotes(codes:string){
 const requested=[...new Set(codes.split(',').filter(c=>/^\d{6}$/.test(c)))];
 const jobs=[async()=>({quotes:await client.quotes(requested.map(symbol))}),()=>proxyJSON<{quotes:Quote[]}>('/api/quotes?codes='+encodeURIComponent(requested.join(',')),7000)];
 return selectQuotes(requested,publicRoute()?jobs:jobs.reverse());
}
export async function requestJSON<T>(url:string,init:RequestInit={},options:{timeoutMs?:number;retries?:number}={}):Promise<T>{
 if(!url.startsWith('/api/'))return httpJSON<T>(url,init,options);
 if(new Headers(init.headers).has('x-provider-key'))throw new Error('GitHub Pages 版不向公开前端传递服务端 Key，请清除会话覆盖 Key。');
 // Parse routes independently of Windows file:// drive letters. This base is never requested.
 const parsed=new URL(url,'https://radar.invalid/'),path=parsed.pathname;
 const operation=path==='/api/market'?getMarket(parsed.searchParams.get('fresh')==='1'):path==='/api/history'?chart(parsed.searchParams.get('code')||'',parsed.searchParams.get('mode')||'day'):path==='/api/quotes'?getWatchQuotes(parsed.searchParams.get('codes')||''):Promise.reject(new Error('静态站点没有此数据接口'));
 const controller=init.signal;
 return new Promise<T>((resolve,reject)=>{
  const finish=()=>{clearTimeout(timer);controller?.removeEventListener('abort',abort);};
  const abort=()=>{finish();reject(new DOMException('Aborted','AbortError'));};
  const timer=setTimeout(()=>{finish();reject(new Error('公开行情请求超时，保留最近可用数据。'));},options.timeoutMs??25000);
  if(controller?.aborted){abort();return;}controller?.addEventListener('abort',abort,{once:true});
  operation.then(v=>{finish();resolve(v as T);},e=>{finish();reject(e);});
 });
}
