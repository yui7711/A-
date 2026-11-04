import type {Market} from './market-types';
import {hasMarketData} from './market-state.ts';
const provider=(m:Market|null)=>hasMarketData(m)&&m.sources.some(s=>s.id==='fuyao'&&(s.status==='ok'||s.status==='partial'))&&!!m.poolDate;
const order=(a:Market,b:Market)=>String(a.poolDate||'').localeCompare(b.poolDate||'')||((a.poolTimestamp??0)-(b.poolTimestamp??0));

/** Keep a pool and its statistics together. Newer quotes never re-date an old pool. */
export function selectMarket(proxy:Market|null,direct:Market|null,snapshot:Market|null,failure='实时通道暂不可用，尚未验证同花顺 Key 状态'):Market{
 // A connected response is authoritative, including a healthy empty opening pool or explicitly missing statistics.
 // Never force it behind a newer-dated build snapshot; its date can be a response assembly date from before the fix.
 if(proxy&&provider(proxy))return {...proxy,providerMode:'proxy',notice:proxy.notice||'实时接口已连接 · 每 5 秒自动刷新，以上游行情时间为准。'};
 const candidates=[proxy,snapshot].filter((m):m is Market=>!!m&&provider(m)).sort((a,b)=>order(b,a));
 const best=candidates[0];
 if(best&&(!direct||String(best.poolDate)>=String(direct.poolDate||''))){
  return {...best,providerMode:'snapshot',cached:true,servedAt:new Date().toISOString(),
   indices:direct?.indices.length?direct.indices:best.indices,sectors:direct?.sectors.length?direct.sectors:best.sectors,
   sources:best.sources.map(s=>s.id==='fuyao'?{...s,status:'partial',mode:'snapshot',message:failure+'；当前使用有日期的备用快照，下一轮自动重连。'}:s),
   notice:`${failure}。当前为 ${best.poolDate} 备用快照；继续每 5 秒尝试恢复连接，池与统计保留原时间。`};
 }
 if(direct)return {...direct,providerMode:'public',notice:failure+'；已启用东方财富 / 腾讯备用源。',sources:[{id:'fuyao',name:'同花顺兼容源 · FUYAO（第三方）',status:'error',message:failure+'；'+(best?'兼容源快照较旧，本次使用更新的东方财富涨停池与同日统计':'已使用东方财富备用源'),date:best?.poolDate||null,url:'https://fuyao.aicubes.cn'},...direct.sources]};
 if(snapshot&&hasMarketData(snapshot))return {...snapshot,providerMode:'snapshot',cached:true,notice:`${failure}；当前保留真实行情快照（${snapshot.poolDate||'日期缺失'}），保留原始日期与时间。`,servedAt:new Date().toISOString()};
 throw new Error('行情源暂不可用，尚无有效快照');
}
