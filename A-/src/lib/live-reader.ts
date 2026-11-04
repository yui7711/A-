import type {Market} from './market-types';
import {hasMarketData} from './market-state.ts';
import {selectMarket} from './market-router.ts';
import {connectionHint} from './connection-hint.ts';
type Reader={live:(force:boolean,signal?:AbortSignal)=>Promise<Market>;snapshot:()=>Promise<Market|null>;publicMarket:(force:boolean,snapshot:Market|null)=>Promise<Market>;hedgeMs?:number};
/** Start an independent route when the proxy fails or stalls; abort the losing proxy. */
export async function readLiveMarket(force:boolean,reader:Reader):Promise<Market>{
 let proxy:Market|null=null,failure='网站服务端响应较慢，已启动独立行情通道；尚未验证同花顺 Key 状态';
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const healthy=(m:Market|null)=>hasMarketData(m)&&m.sources.some(s=>s.id==='fuyao'&&(s.status==='ok'||s.status==='partial'));
 const live=Promise.resolve().then(()=>reader.live(force,controller.signal)).then(m=>{proxy=m;if(!healthy(m))failure=m?.sources?.find(s=>s.id==='fuyao')?.message||connectionHint(null);return m;},e=>{failure=connectionHint(e);return null;});
 try{
  const first=await Promise.race([live.then(value=>({done:true as const,value})),new Promise<{done:false}>(resolve=>{timer=setTimeout(()=>resolve({done:false}),reader.hedgeMs??2500);})]);
  if(timer)clearTimeout(timer);
  if(first.done&&healthy(first.value))return selectMarket(first.value,null,null);
  const fallback=(async()=>{const snapshot=await reader.snapshot().catch(()=>null),direct=await reader.publicMarket(force,snapshot).catch(()=>null);return selectMarket(proxy,direct,snapshot,failure);})();
  if(first.done)return await fallback;
  return await Promise.race([fallback,live.then(value=>healthy(value)?selectMarket(value,null,null):fallback)]);
 }finally{if(timer)clearTimeout(timer);controller.abort();}
}
