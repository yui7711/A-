import type {ResearchEvidence,Stock,Market} from './market-types';
import {mapPool,mapEMPool,num,shDate} from './market-core.ts';
export type AmountDays=Map<string,Map<string,number>>;
const dateText=(v:unknown)=>String(v||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
const validDay=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d);
const validMinute=(t:string)=>/^\d{4}$/.test(t)&&(t>='0930'&&t<='1130'||t>='1300'&&t<='1500');
export function tencentAmountDays(payload:any,code:string):AmountDays{
 const result:AmountDays=new Map();
 for(const row of payload?.data?.[code]?.data||[]){const date=dateText(row.date);if(!validDay(date)||!Array.isArray(row.data))continue;const points=new Map<string,number>();let previous=-1;
  for(const raw of row.data){const f=String(raw).trim().split(/\s+/),value=num(f[3]);if(!validMinute(f[0])||value==null||value<0||value<previous)continue;points.set(f[0],value);previous=value;}
  if(points.size)result.set(date,points);
 }return result;
}
export function eastmoneyAmountDays(payload:any):AmountDays{
 const result:AmountDays=new Map();
 for(const raw of payload?.data?.trends||[]){const f=String(raw).split(','),date=f[0]?.slice(0,10),time=f[0]?.slice(11,16).replace(':',''),amount=num(f[6]);if(!validDay(date)||!validMinute(time)||amount==null||amount<0)continue;let points=result.get(date);if(!points){points=new Map();result.set(date,points);}points.set(time,amount);}
 // Eastmoney fields f57 are per-minute amounts; convert to cumulative exactly once.
 for(const [date,points] of result){let total=0;const cumulative=new Map<string,number>();for(const [time,value] of [...points].sort(([a],[b])=>a.localeCompare(b))){total+=value;cumulative.set(time,total);}result.set(date,cumulative);}return result;
}
export function compareAmounts(sh:AmountDays,sz:AmountDays,date:string,previousDate:string,cutoff:string,source:string):ResearchEvidence['volume']{
 const series=[sh.get(date),sz.get(date),sh.get(previousDate),sz.get(previousDate)];if(series.some(x=>!x?.size))return null;
 const minute=[...series[0]!.keys()].filter(t=>t<=cutoff&&series.every(s=>s!.has(t))).sort().at(-1);if(!minute)return null;
 const current=series[0]!.get(minute)!+series[1]!.get(minute)!,previous=series[2]!.get(minute)!+series[3]!.get(minute)!;
 if(!(previous>0)||current<0)return null;
 return {date,previousDate,cutoff:minute.slice(0,2)+':'+minute.slice(2),currentAmount:current,previousAmount:previous,ratio:current/previous,method:'minute',source};
}
export function researchCutoff(data:Market,now=Date.now()){
 const today=shDate(now)||'';if(data.tradeDate&&data.tradeDate<today)return '1500';
 const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(now)).replace(':','');
 const times=data.indices.filter(q=>['sh000001','sz399001'].includes(q.code)&&q.time.slice(0,8)===data.tradeDate?.replaceAll('-','')).map(q=>q.time.slice(8,12));
 return [local,...times,'1500'].sort()[0];
}
type Options={json:(url:string)=>Promise<any>;fy:(path:string)=>Promise<any>;now?:()=>number;historicalPool?:(date:string)=>Promise<NonNullable<ResearchEvidence['previousPool']>>};
export function createResearchEvidenceLoader({json,fy,now=Date.now,historicalPool}:Options){
 let calendar:{date:string;days:string[]}|undefined;
 let seriesCache:{time:number;series:AmountDays[]}|undefined;
 const pools=new Map<string,{time:number;pool:NonNullable<ResearchEvidence['previousPool']>}>();
 const volumes=new Map<string,{time:number;volume:ResearchEvidence['volume']}>();
 async function previousPool(date:string){
  const cached=pools.get(date);if(cached&&now()-cached.time<21600000)return cached.pool;
  if(historicalPool)try{const pool=await historicalPool(date);if(pool.date!==date||!pool.complete||new Set(pool.stocks.map(s=>s.code)).size!==pool.total)throw Error('公开历史名单不完整');pools.set(date,{time:now(),pool});return pool;}catch{/* Date-checked provider fallback below. */}
  try{const base='a-share/special-data/limit-up-pool?date_ms='+Date.parse(date+'T00:00:00+08:00')+'&size=200&sort_field=continue_day_cnt&sort_dir=desc';const first=await fy(base+'&page=1');if(!Array.isArray(first?.item)||num(first?.pagination?.total)==null)throw Error('历史池缺失');let items=first.item;
   const pages=Number(first.pagination.pages)||1;if(pages>10)throw Error('历史池分页不完整');for(let p=2;p<=pages;p++){const next=await fy(base+'&page='+p);if(!Array.isArray(next.item))throw Error('历史池分页缺失');items=items.concat(next.item);}
   const stocks=[...new Map<string,Stock>(items.map(mapPool).filter((s:Stock)=>/^\d{6}$/.test(s.code)).map((s:Stock)=>[s.code,s])).values()];if(stocks.length!==Number(first.pagination.total))throw Error('历史池数量不完整');
   const pool={date,total:stocks.length,complete:true,stocks,source:'FUYAO · 历史涨停池',taxonomy:'reason' as const};pools.set(date,{time:now(),pool});if(pools.size>8)pools.delete(pools.keys().next().value!);return pool;
  }catch{
   const j=await json('https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date='+date.replaceAll('-',''));const d=j?.data;
   if(dateText(d?.qdate)!==date||!Array.isArray(d?.pool)||num(d.tc)==null||d.pool.length!==Number(d.tc))throw Error('东方财富历史池不完整或日期不一致');
   const stocks=d.pool.map(mapEMPool),pool={date,total:stocks.length,complete:true,stocks,source:'东方财富 · 历史涨停池',taxonomy:'industry' as const};pools.set(date,{time:now(),pool});return pool;
  }
 }
 async function dailyAmount(date:string,prev:string):Promise<ResearchEvidence['volume']>{
  const start=Date.parse(prev+'T00:00:00+08:00'),end=Date.parse(date+'T23:59:59+08:00');
  const rows=await Promise.all(['000001.SH','399001.SZ'].map(async code=>{const j=await fy('a-share-index/prices/historical?thscode='+code+'&interval=1d&start='+start+'&end='+end);return new Map<string,number>((j?.item||[]).filter((x:any)=>num(x.close_price)!=null&&num(x.close_price)!>0&&num(x.turnover)!=null).map((x:any)=>[shDate(x.date_ms),Number(x.turnover)]));}));
  if(rows.some(s=>!s.has(date)||!s.has(prev)))return null;const current=rows[0].get(date)!+rows[1].get(date)!,previous=rows[0].get(prev)!+rows[1].get(prev)!;
  return previous>0?{date,previousDate:prev,cutoff:'15:00',currentAmount:current,previousAmount:previous,ratio:current/previous,method:'daily',source:'FUYAO · 沪深指数日线成交额'}:null;
 }
 return async function evidence(date:string,requestedCutoff:string):Promise<ResearchEvidence>{
  const fetchedAt=new Date(now()).toISOString(),issues:string[]=[],today=shDate(now())!;
  const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(now())).replace(':','');
  const cutoff=date<today?'1500':[requestedCutoff,local,'1500'].sort()[0];
  const calendarJob=(async()=>{if(calendar?.date===today)return calendar.days;const j=await fy('a-share/calendar/trading-days');const days=(j?.item||[]).map((x:any)=>dateText(x.date)).filter(validDay).sort();if(!days.includes(date))throw Error('交易日历缺少当前交易日');calendar={date:today,days};return days;})();
  const seriesJob=seriesCache&&now()-seriesCache.time<10000?Promise.resolve(seriesCache.series):Promise.all(['sh000001','sz399001'].map(async code=>tencentAmountDays(await json('https://web.ifzq.gtimg.cn/appstock/app/day/query?code='+code),code))).then(series=>{if(series.every(s=>s.size))seriesCache={time:now(),series};return series;}).catch(()=>null);
  const [daysResult,series]=await Promise.all([calendarJob.catch(()=>null),seriesJob]);
  let previousDate=daysResult?.filter((d:string)=>d<date).at(-1)||null;
  if(!previousDate&&series)previousDate=[...series[0].keys()].filter(d=>d<date&&series[1].has(d)).sort().at(-1)||null;
  if(!previousDate)return {tradeDate:date,previousDate:null,fetchedAt,previousPool:null,volume:null,issues:['未取得可核实的上一交易日']};
  const poolJob=previousPool(previousDate).catch(()=>{issues.push('上一交易日完整涨停池暂不可用');return null;});
  const id=date+'|'+previousDate+'|'+cutoff,old=volumes.get(id);
  let volume=old&&now()-old.time<(date<today?1800000:15000)?old.volume:null;
  if(!volume&&series)volume=compareAmounts(series[0],series[1],date,previousDate,cutoff,'腾讯 · 沪深五日分时成交额');
  if(!volume){try{const em=await Promise.all(['1.000001','0.399001'].map(async secid=>eastmoneyAmountDays(await json('https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid='+secid+'&ndays=5&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11&fields2=f51,f52,f53,f54,f55,f56,f57,f58'))));volume=compareAmounts(em[0],em[1],date,previousDate,cutoff,'东方财富 · 沪深五日分时成交额');}catch{}}
  if(!volume&&cutoff==='1500'&&(date<today||local>='1500'))try{volume=await dailyAmount(date,previousDate);}catch{}
  if(volume){volumes.set(id,{time:now(),volume});if(volumes.size>12)volumes.delete(volumes.keys().next().value!);}else issues.push('同一时刻的沪深两日成交额未齐，未用昨日全天值替代');
  return {tradeDate:date,previousDate,fetchedAt,previousPool:await poolJob,volume,issues};
 };
}
