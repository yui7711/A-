import type {Market} from './market-types';
/** Compatible with browsers that do not implement AbortSignal.timeout(). */
export async function requestJSON<T>(url:string,init:RequestInit={},options:{timeoutMs?:number;retries?:number}={}):Promise<T>{
 const retries=options.retries??1;
 for(let attempt=0;;attempt++){
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(init.signal?.aborted)controller.abort();
  init.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,options.timeoutMs??25000);
  try{
   const r=await fetch(url,{...init,credentials:init.credentials??'same-origin',cache:'no-store',signal:controller.signal});
   if(r.status===401||r.status===403)throw Object.assign(new Error('登录状态或访问权限需要更新，请重新打开网站后重试。'),{status:r.status});
   if(!r.headers.get('content-type')?.includes('application/json'))throw Object.assign(new Error(`行情服务暂时不可用（HTTP ${r.status}），请稍后刷新。`),{status:r.ok?502:r.status});
   const data=await r.json() as T & {error?:string};
   if(!r.ok)throw Object.assign(new Error(data?.error||`行情服务返回 HTTP ${r.status}`),{status:r.status});
   return data;
  }catch(e){
   if(init.signal?.aborted)throw e;
   const status=(e as {status?:number})?.status;
   if(attempt>=retries||status&&status<500){
    if(controller.signal.aborted)throw new Error('行情请求超时，已保留最近可用数据，可点击刷新重试。');
    throw e;
   }
  }finally{clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
  await new Promise(resolve=>setTimeout(resolve,300));
 }
}

/** Public quotes only: no provider key or account credentials leave this origin. */
export async function fetchSectorFallback(signal?:AbortSignal):Promise<{sectors:Market['sectors'];date:string|null}>{
 const j=await requestJSON<{data?:{diff?:unknown}}>('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=12&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2+f:!50&fields=f12,f14,f3,f62,f124',{signal},{timeoutMs:5000,retries:0});
 const raw=j.data?.diff;
 const rows=(Array.isArray(raw)?raw:raw&&typeof raw==='object'?Object.values(raw):[]) as Record<string,unknown>[];
 const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const sectors=rows.filter(x=>typeof x.f12==='string'&&typeof x.f14==='string').map(x=>({code:x.f12 as string,name:x.f14 as string,change:numeric(x.f3),flow:numeric(x.f62)}));
 if(!sectors.length)throw new Error('行业数据暂不可用');
 const timestamp=rows.map(x=>numeric(x.f124)).find(x=>x!==null&&x>0);
 const date=timestamp?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp*1000)):null;
 return {sectors,date};
}
