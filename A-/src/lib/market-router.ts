import type {Market} from './market-types';
import {hasMarketData} from './market-state.ts';
const provider=(m:Market|null)=>hasMarketData(m)&&m.sources.some(s=>s.id==='fuyao'&&(s.status==='ok'||s.status==='partial'))&&!!m.poolDate;
const order=(a:Market,b:Market)=>String(a.poolDate||'').localeCompare(b.poolDate||'')||((a.poolTimestamp??0)-(b.poolTimestamp??0));

/** Keep a pool and its statistics together. Newer quotes never re-date an old pool. */
export function selectMarket(proxy:Market|null,direct:Market|null,snapshot:Market|null):Market{
 const candidates=[proxy,snapshot].filter((m):m is Market=>!!m&&provider(m)).sort((a,b)=>order(b,a));
 const best=candidates[0];
 if(best&&(!direct||String(best.poolDate)>=String(direct.poolDate||''))){
  if(best===proxy)return {...best,providerMode:'proxy',notice:'同花顺兼容源 · FUYAO（第三方）：服务端代理取数，Key 不进入网页；行情时点以上游返回为准。'};
  return {...best,providerMode:'snapshot',cached:true,servedAt:new Date().toISOString(),
   indices:direct?.indices.length?direct.indices:best.indices,sectors:direct?.sectors.length?direct.sectors:best.sectors,
   sources:best.sources.map(s=>s.id==='fuyao'?{...s,status:'partial',message:'GitHub 安全采集快照；交易日计划每 5 分钟更新（任务可能延迟），不是秒级实时。行情日期与时间保持源值。'}:s),
   notice:`当前使用同花顺兼容源 FUYAO 的安全采集快照（${best.poolDate}）；服务端实时通道暂不可用。快照计划每 5 分钟采集，可能延迟；指数可独立刷新，池时间不会随页面刷新改变。`};
 }
 if(direct)return {...direct,providerMode:'public',sources:[{id:'fuyao',name:'同花顺兼容源 · FUYAO（第三方）',status:'error',message:best?'同花顺兼容源快照较旧，本次使用更新的东方财富涨停池与同日统计':'服务端通道暂不可用，已使用东方财富备用源',date:best?.poolDate||null,url:'https://fuyao.aicubes.cn'},...direct.sources]};
 if(snapshot&&hasMarketData(snapshot))return {...snapshot,providerMode:'snapshot',cached:true,notice:`当前保留真实行情快照（${snapshot.poolDate||'日期缺失'}）；实时源连接失败，保留原始日期与时间。`,servedAt:new Date().toISOString()};
 throw new Error('行情源暂不可用，尚无有效快照');
}
