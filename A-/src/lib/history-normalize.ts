import type {History} from './market-types';
const numeric=(v:unknown)=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const day=(ms:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
export function fyHistory(code:string,payload:any):History{
 const points=(Array.isArray(payload?.item)?payload.item:[]).flatMap((b:any)=>{const time=numeric(b.date_ms),price=numeric(b.close_price??b.close);if(time===null||price===null||price<=0)return [];return [{time:day(time),price,open:numeric(b.open_price??b.open)??undefined,high:numeric(b.high_price??b.high)??undefined,low:numeric(b.low_price??b.low)??undefined,volume:numeric(b.volume)??undefined}];}).sort((a:any,b:any)=>a.time.localeCompare(b.time)).slice(-60);
 return {code,name:code,source:'FUYAO · 前复权日线',date:points.at(-1)?.time||null,points};
}
export function tencentHistory(code:string,payload:any):History{
 const d=payload?.data?.[code],rows=d?.qfqday||d?.day||[];
 const points=Array.isArray(rows)?rows.flatMap((b:any)=>{const price=numeric(b[2]);return price!==null&&price>0?[{time:String(b[0]),price,open:numeric(b[1])??undefined,high:numeric(b[3])??undefined,low:numeric(b[4])??undefined,volume:numeric(b[5])??undefined}]:[];}).slice(-60):[];
 return {code,name:code,source:d?.qfqday?'腾讯 · 前复权日线':'腾讯 · 未复权日线',date:points.at(-1)?.time||null,points};
}
export function sinaHistory(code:string,payload:any):History{
 const points=(Array.isArray(payload)?payload:[]).flatMap((b:any)=>{const price=numeric(b.close);return price!==null&&price>0?[{time:String(b.day||'').slice(0,10),price,open:numeric(b.open)??undefined,high:numeric(b.high)??undefined,low:numeric(b.low)??undefined,volume:numeric(b.volume)??undefined}]:[];}).filter((b:any)=>/^\d{4}-\d{2}-\d{2}$/.test(b.time)).slice(-60);
 return {code,name:code,source:'新浪 · 未复权日线',date:points.at(-1)?.time||null,points};
}
