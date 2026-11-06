import {parseSealArchive,type SealArchive} from './seal-archive.ts';
const ROOT='https://yui7711.github.io/A-/data/seal-snapshots.json';
const RAW='https://raw.githubusercontent.com/yui7711/A-/main/A-/public/data/seal-snapshots.json';
export async function readSharedSeals(request:typeof fetch=fetch,signal?:AbortSignal):Promise<SealArchive>{
 const local=typeof location!=='undefined'&&/^https?:$/.test(location.protocol)?new URL('data/seal-snapshots.json',location.href).href:null;
 const urls=[...new Set([ROOT,RAW,...(local?[local]:[])])];
 // Read-only public artifacts; no provider key or visitor credentials are sent.
 const jobs=urls.map(async url=>{const c=new AbortController(),timer=setTimeout(()=>c.abort(),6500),abort=()=>c.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)c.abort();try{const r=await request(url+'?v='+Math.floor(Date.now()/60000),{credentials:'omit',cache:'no-store',signal:c.signal});if(!r.ok)throw Error('共享快照暂不可读');return parseSealArchive(await r.json());}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}});
 const settled=await Promise.allSettled(jobs),valid=settled.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
 if(!valid.length)throw Error('共享快照连接暂不可用；继续显示本机观测并自动重试。');
 return valid.sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))[0];
}
