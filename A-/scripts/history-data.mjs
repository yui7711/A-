import {mapPool} from '../src/lib/market-core.ts';
export async function collectHistoricalPools({fy,now=Date.now()}){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const calendar=await fy('a-share/calendar/trading-days');
 const dates=[...new Set((calendar?.item||[]).map(x=>String(x.date).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<today))].sort().slice(-3);
 if(!dates.length)throw Error('未取得已结束的交易日');
 const pools=[];
 for(const date of dates){
  const path='a-share/special-data/limit-up-pool?date_ms='+Date.parse(date+'T00:00:00+08:00')+'&size=200&sort_field=continue_day_cnt&sort_dir=desc';
  const first=await fy(path+'&page=1');const total=Number(first?.pagination?.total),pages=Number(first?.pagination?.pages)||1;
  if(first?.pagination?.total==null||!Number.isInteger(total)||total<0||!Array.isArray(first.item)||pages>10)throw Error('历史池格式不完整');
  let items=first.item;for(let p=2;p<=pages;p++){const next=await fy(path+'&page='+p);if(!Array.isArray(next.item))throw Error('历史池分页缺失');items=items.concat(next.item);}
  const stocks=[...new Map(items.map(mapPool).filter(s=>/^\d{6}$/.test(s.code)).map(s=>[s.code,s])).values()];if(stocks.length!==total)throw Error('历史池数量未通过核对');
  pools.push({date,total,complete:true,stocks,taxonomy:'reason',source:'FUYAO · 明确交易日完整历史名单（GitHub同站公开）'});
 }
 return {generatedAt:new Date(now).toISOString(),pools};
}
