import type {Market} from './market-types';
import {num,scoreStock} from './market-core.ts';
import {quoteEpoch} from './tactics.ts';

export function mergeBackupStockFields(data:Market,backup:Market):Market{
 if(!data.poolDate||data.poolDate!==backup.poolDate||backup.poolDate!==backup.tradeDate)return data;
 const difference=Math.abs(Date.parse(data.fetchedAt)-Date.parse(backup.fetchedAt));
 if(!Number.isFinite(difference)||difference>30000)return data;
 const rows=new Map(backup.stocks.map(stock=>[stock.code,stock]));
 let changed=false;
 const stocks=data.stocks.map(stock=>{
  const alternate=rows.get(stock.code);
  if(!alternate||alternate.boards!==stock.boards)return stock;
  const poolAt=data.poolTimestamp;
  const quoteAt=alternate.quoteDate?quoteEpoch(alternate.quoteDate):null;
  const sameTime=poolAt!=null&&quoteAt!=null&&Math.abs(poolAt-quoteAt)<=180000;
  const opening=stock.openTimes??alternate.openTimes;
  const turnover=stock.turnover??(sameTime?alternate.turnover:stock.turnover);
  const amount=stock.amount??alternate.amount;
  if(opening===stock.openTimes&&turnover===stock.turnover&&amount===stock.amount)return stock;
  const next={...stock,openTimes:opening,turnover,amount,source:stock.source+' · 东方财富补充'};
  changed=true;
  return {...next,...scoreStock(next)};
 });
 return changed?{...data,stocks}:data;
}
/** Fill optional fields only from a matching public pool. A late response must not replace a newer refresh. */
export function mergePublicFields(data:Market,payload:any):Market{
 const pool=payload?.data,date=String(pool?.qdate||'').replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3');
 if(date!==data.poolDate||!Array.isArray(pool?.pool))return data;
 const rows=new Map<string,any>(pool.pool.map((x:any)=>[String(x.c),x]));let changed=false;
 const stocks=data.stocks.map(s=>{const row=rows.get(s.code);if(!row)return s;const openings=num(row.zbc),turnover=num(row.hs);if(!(s.openTimes==null&&openings!=null||s.turnover==null&&turnover!=null))return s;changed=true;const next={...s,openTimes:s.openTimes??openings,turnover:s.turnover??turnover,source:s.source+' · 东方财富补充'};return {...next,...scoreStock(next)};});
 return changed?{...data,stocks}:data;
}
export async function enrichMarketFields(data:Market,signal:AbortSignal):Promise<Market>{
 if(!data.poolDate||!data.stocks.some(s=>s.openTimes==null||s.turnover==null))return data;
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,3000);
 if(signal.aborted)controller.abort();signal.addEventListener('abort',abort,{once:true});
 try{const r=await fetch('https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date='+data.poolDate.replaceAll('-',''),{credentials:'omit',cache:'no-store',signal:controller.signal});if(!r.ok)return data;const j=JSON.parse(await r.text());return mergePublicFields(data,j);}catch{return data;}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
