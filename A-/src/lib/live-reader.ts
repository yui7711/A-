import type {Market} from './market-types';
import {hasMarketData} from './market-state.ts';
import {selectMarket} from './market-router.ts';
type Reader={live:(force:boolean)=>Promise<Market>;snapshot:()=>Promise<Market|null>;publicMarket:(force:boolean,snapshot:Market|null)=>Promise<Market>};
/** Every refresh reaches the live service. Offline artifacts are consulted only after that request fails. */
export async function readLiveMarket(force:boolean,reader:Reader):Promise<Market>{
 let proxy:Market|null=null;
 try{proxy=await reader.live(force);if(hasMarketData(proxy)&&proxy.sources.some(s=>s.id==='fuyao'&&(s.status==='ok'||s.status==='partial')))return selectMarket(proxy,null,null);}catch{}
 const snapshot=await reader.snapshot().catch(()=>null),direct=await reader.publicMarket(force,snapshot).catch(()=>null);
 return selectMarket(proxy,direct,snapshot);
}
