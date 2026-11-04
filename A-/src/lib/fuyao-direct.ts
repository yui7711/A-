import type {Market,Quote} from './market-types';
import {loadLiveMarket} from './live-market-core.ts';
import {num,shDate} from './market-core.ts';
import {providerFailure} from './provider-status.ts';
import {marketClock} from './tactics.ts';

type Request=(url:string,init:RequestInit)=>Promise<Response>;
const ORIGIN='https://fuyao.aicubes.cn';
const names:Record<string,string>={sh000001:'上证指数',sz399001:'深证成指',sz399006:'创业板指',sh000300:'沪深300'};
/** Fixed provider origin; the supplied key is never forwarded to a proxy or public quote host. */
export function createFuyaoDirect(request:Request=fetch,now=Date.now){
 let blockedUntil=0,running=0;const queue:Array<()=>void>=[];
 async function limited<T>(job:()=>Promise<T>){if(running>=3)await new Promise<void>(r=>queue.push(r));else running++;try{return await job();}finally{const next=queue.shift();if(next)next();else running--;}}
 async function api(path:string,key:string){
  if(!/^(a-share|a-share-index)\//.test(path))throw Error('接口路径无效');
  return limited(async()=>{if(now()<blockedUntil)throw Object.assign(Error('稍后重试'),{providerCode:4001});
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
   try{const r=await request(ORIGIN+'/api/'+path,{headers:{'X-api-key':key},credentials:'omit',cache:'no-store',signal:controller.signal});
    let j:any;try{j=await r.json();}catch{throw Object.assign(Error('接口格式异常'),{status:r.status||502});}
    if(r.status===429||j.code===4001){const seconds=Number(r.headers.get('retry-after'))||30;blockedUntil=now()+Math.max(5,Math.min(120,seconds))*1000;}
    if(!r.ok||j.code!==0)throw Object.assign(Error('接口请求失败'),{status:r.ok?undefined:r.status,providerCode:j.code});
    return j.data;
   }finally{clearTimeout(timer);}
  });
 }
 async function publicJSON(url:string){const c=new AbortController(),timer=setTimeout(()=>c.abort(),2500);try{const r=await request(url,{credentials:'omit',cache:'no-store',signal:c.signal});if(!r.ok)throw Error('公开补充不可用');return JSON.parse(await r.text());}finally{clearTimeout(timer);}}
 async function quotes(codes:string[],key:string):Promise<Quote[]>{
  const valid=[...new Set(codes.filter(c=>/^(sh|sz|bj)\d{6}$/.test(c)))];
  const groups=[valid.filter(c=>!!names[c]),valid.filter(c=>!names[c])];
  const jobs=await Promise.allSettled(groups.map(async(group,i)=>{
   if(!group.length)return [];const j=await api((i?'a-share':'a-share-index')+'/prices/snapshot?thscodes='+group.map(c=>c.slice(2)+'.'+c.slice(0,2).toUpperCase()).join(','),key);
   const stamp=num(j?.timestamp);if(!stamp)return [];const time=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(stamp)).replace(/\D/g,'');
   return (j?.item||[]).flatMap((x:any)=>{const code=x.thscode?.split('.')[1]?.toLowerCase()+x.thscode?.split('.')[0],price=num(x.last_price);if(!group.includes(code)||price==null||price<=0)return [];return [{code,name:names[code]||x.name||x.ticker,price,change:num(x.price_change_ratio_pct),delta:num(x.price_change),amount:num(x.turnover),open:num(x.open_price),high:num(x.high_price),low:num(x.low_price),turnover:null,time,source:'FUYAO · 浏览器直连报价'}];});
  }));return jobs.flatMap(r=>r.status==='fulfilled'?r.value:[]);
 }
 return {
  async verify(key:string){if(!/^sk-fuyao-[\w-]{16,}$/.test(key))throw Error('请输入完整的同花顺 API Key');try{await api('a-share/special-data/limit-up-statistics?date='+marketClock(now()).date,key);return {checkedAt:new Date(now()).toISOString()};}catch(e){throw Error(providerFailure(e).message.replace('服务端未能连通','浏览器未能连通'));}},
  async market(key:string):Promise<Market>{
   const data=await loadLiveMarket({now:now(),fy:path=>api(path,key),quotes:codes=>quotes(codes,key),
    publicPool:async date=>(await publicJSON('https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date='+date.replaceAll('-','')))?.data,
    sectors:async()=>{const j=await publicJSON('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=12&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2+f:!50&fields=f12,f14,f3,f62,f124');const raw=Object.values(j?.data?.diff||{}) as any[];return {rows:raw.map(x=>({code:String(x.f12),name:String(x.f14),change:num(x.f3),flow:num(x.f62)})),source:{id:'eastmoney',name:'东方财富 · 行业行情',status:'ok',mode:'live',message:'公开行业补充，不传递同花顺 Key',date:shDate(num(raw[0]?.f124)!*1000),url:'https://quote.eastmoney.com/'} as const};}
   });
   return {...data,sources:data.sources.map(s=>s.id==='fuyao'?{...s,transport:'browser-direct' as const,name:'同花顺兼容源 · FUYAO（本页直连）',message:(s.status==='ok'?'本页直接连通 fuyao.aicubes.cn，Key 鉴权已通过；不依赖本站转发域名。':'本页直连：')+s.message.replace('服务端未能连通','浏览器未能连通')}:s)};
  }
 };
}

const client=createFuyaoDirect();let sessionKey='',generation=0,pending:Promise<Market>|null=null;
export function hasFuyaoDirect(){return !!sessionKey;}
export function fuyaoDirectRevision(){return generation;}
export async function enableFuyaoDirect(value:string){const key=value.trim(),verification=await client.verify(key);sessionKey=key;generation++;pending=null;return verification;}
export function disableFuyaoDirect(){sessionKey='';generation++;pending=null;}
export function readFuyaoDirect(){if(!sessionKey)return Promise.reject(Error('尚未启用本页直连'));if(pending)return pending;const rev=generation;const job=client.market(sessionKey).then(m=>{if(rev!==generation)throw Error('本页直连设置已变更');return m;}).finally(()=>{if(pending===job)pending=null;});pending=job;return job;}
