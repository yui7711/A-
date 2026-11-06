import {parseSealArchive,type SealArchive} from './seal-archive.ts';
const ROOT='https://yui7711.github.io/A-/data/seal-snapshots.json';
const RAW='https://raw.githubusercontent.com/yui7711/A-/main/A-/public/data/seal-snapshots.json';
const CONTENTS='https://api.github.com/repos/yui7711/A-/contents/A-/public/data/seal-snapshots.json?ref=main';
export function createSharedSealReader(request:typeof fetch=fetch,now=Date.now){
 let apiCheckedAt=0,apiArchive:SealArchive|null=null;
 return async(signal?:AbortSignal):Promise<SealArchive>=>{
  const local=typeof location!=='undefined'&&/^https?:$/.test(location.protocol)?new URL('data/seal-snapshots.json',location.href).href:null;
  const urls=[...new Set([ROOT,RAW,...(local?[local]:[])])];
  const read=async(url:string,api=false)=>{const c=new AbortController(),timer=setTimeout(()=>c.abort(),6500),abort=()=>c.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)c.abort();try{const u=new URL(url);u.searchParams.set('v',String(Math.floor(now()/(api?300000:60000))));const r=await request(u.href,{credentials:'omit',cache:'no-store',signal:c.signal,...(api?{headers:{Accept:'application/vnd.github.raw+json'}}:{})});if(!r.ok)throw Error('共享快照暂不可读');return parseSealArchive(await r.json());}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}};
  // Public Contents API resolves current branch state; raw branch URLs can lag behind a data-only commit.
  // Limit the unauthenticated API lookup to once per five minutes per page; no GitHub token is exposed.
  const jobs=urls.map(url=>read(url));
  if(now()-apiCheckedAt>=300000||!apiCheckedAt){apiCheckedAt=now();jobs.push(read(CONTENTS,true).then(a=>{apiArchive=a;return a;}).catch(e=>{if(apiArchive)return apiArchive;throw e;}));}else if(apiArchive)jobs.push(Promise.resolve(apiArchive));
  const settled=await Promise.allSettled(jobs),valid=settled.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
  if(!valid.length)throw Error('共享快照连接暂不可用；继续显示本机观测并自动重试。');
  return valid.sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))[0];
 };
}
const sharedReader=createSharedSealReader();
export function readSharedSeals(request:typeof fetch=fetch,signal?:AbortSignal){return request===fetch?sharedReader(signal):createSharedSealReader(request)(signal);}
