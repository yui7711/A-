import type {Market} from './market-types';

/** Only completed JSON values may outlive a Worker request. */
export function hasMarketData(value:unknown):value is Market{
 const d=value as Partial<Market>|null;
 return !!d&&typeof d.fetchedAt==='string'&&Number.isFinite(Date.parse(d.fetchedAt))&&Array.isArray(d.stocks)&&Array.isArray(d.indices)&&Array.isArray(d.sources)&&!!d.stats&&Array.isArray(d.themes)&&Array.isArray(d.sectors)&&Array.isArray(d.lhb)&&Array.isArray(d.hot)&&(d.stocks.length>0||d.indices.length>0);
}

/** A failed refresh must not replace useful data with an empty result. */
export function retainMarket(previous:Market|null,next:Market):Market{
 if(previous?.stocks.length&&!next.stocks.length&&next.sources.some(s=>s.id==='fuyao'&&(s.status==='error'||s.status==='missing'))){
  return {...next,stocks:previous.stocks,poolDate:previous.poolDate,poolTimestamp:previous.poolTimestamp,poolTotal:previous.poolTotal,themes:previous.themes,tradeDate:previous.tradeDate,stats:previous.stats,fetchedAt:previous.fetchedAt,cached:true,notice:'涨停源暂时不可用，涨停池与情绪统计保留上次成功快照，其他模块按各自时点展示。'};
 }
 if(!hasMarketData(next)&&previous&&hasMarketData(previous))return {...previous,cached:true,notice:'本次行情请求未返回有效数据，当前保留上次成功快照。'};
 return next;
}
