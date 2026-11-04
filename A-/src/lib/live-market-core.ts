import type {Market,Quote,Stock,Source} from './market-types';
import {mapPool,mapEMPool,num,shDate,scoreStock,symbol} from './market-core.ts';
import {marketClock} from './tactics.ts';
import {providerFailure} from './provider-status.ts';

export function targetTradeDate(indices:Quote[],now=Date.now()){
 const clock=marketClock(now),latest=indices.map(q=>q.time).filter(t=>/^\d{14}$/.test(t)).sort().at(-1)?.slice(0,8).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3');
 // Before the opening auction / on weekends, use the last actual quote day. Never infer a trading day from a response assembly timestamp.
 return !clock.live&&clock.phase!=='lunch'&&latest?latest:clock.date;
}
export function poolParameters(date:string){return 'date_ms='+Date.parse(date+'T00:00:00+08:00');}
export function normalizeStats(pool:any,stats:any,down:any,broken:any,date:string):Market['stats']{
 const valid=stats?.trade_date===date&&!(pool?.item?.length>0&&num(stats?.limit_up_stock_count)===0);
 const up=valid?num(stats.limit_up_stock_count):null,opened=valid?num(stats.open_stock_count):num(broken?.pagination?.total);
 return {up,down:num(down?.pagination?.total),opened,sealRate:valid?num(stats.seal_rate):up!=null&&opened!=null&&up+opened>0?up/(up+opened):null,exact:valid?(stats.exact_boards||[]).map((x:any)=>({board:x.board_num,count:x.stock_count})):[]};
}
export function mergeQuotes(stocks:Stock[],quotes:Quote[],em:any=null,date?:string){
 const qmap=new Map(quotes.map(q=>[q.code.slice(2),q]));
 const emDate=String(em?.qdate||'').replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3');
 const extra=new Map<string,Stock>(emDate===date&&Array.isArray(em?.pool)?em.pool.map((x:any)=>{const s=mapEMPool(x);return [s.code,s];}):[]);
 return stocks.map(s=>{const q=qmap.get(s.code),e=extra.get(s.code);const next={...s,
  openTimes:s.openTimes??e?.openTimes??null,turnover:q?.turnover??e?.turnover??s.turnover,
  price:q?.price??s.price,change:q?.change??s.change,amount:q?.amount??e?.amount??s.amount,
  open:q?.open??s.open,high:q?.high??s.high,low:q?.low??s.low,quoteDate:q?.time||s.quoteDate,
  source:s.source+(q?' · '+q.source:'')+(s.openTimes==null&&e?.openTimes!=null?' · 东方财富开板次数':'')};
  return {...next,...scoreStock(next)};
 });
}
type Options={fy:(path:string)=>Promise<any>;quotes:(codes:string[])=>Promise<Quote[]>;sectors:()=>Promise<{rows:Market['sectors'];source:Source}>;publicPool:(date:string)=>Promise<any>;now?:number};
export async function loadLiveMarket({fy,quotes,sectors,publicPool,now=Date.now()}:Options):Promise<Market>{
 const clock=marketClock(now),sectorJob=sectors().catch(()=>null),indices=await quotes(['sh000001','sz399001','sz399006','sh000300']).catch(()=>[]),date=targetTradeDate(indices,now),params=poolParameters(date);
 const paths=[`limit-up-pool?${params}&page=1&size=200&sort_field=continue_day_cnt&sort_dir=desc`,`limit-up-statistics?date=${date}`,`limit-down-pool?${params}&page=1&size=1`,`limit-break-pool?${params}&page=1&size=1`,'dragon-tiger-list?board_type=all','hot-stock-list?period=day&limit=12'];
 const tasks=await Promise.allSettled(paths.map(p=>fy('a-share/special-data/'+p)));
 const val=(i:number)=>tasks[i].status==='fulfilled'?(tasks[i] as PromiseFulfilledResult<any>).value:null;
 let pool=val(0),items=Array.isArray(pool?.item)?pool.item:[],pages=Math.min(10,num(pool?.pagination?.pages)??1),pageError=false;
 for(let page=2;page<=pages;page++){try{const p=await fy('a-share/special-data/'+paths[0].replace('page=1&','page='+page+'&'));if(!Array.isArray(p.item))throw Error('页数据缺失');items=items.concat(p.item);}catch{pageError=true;break;}}
 let stocks:Stock[]=[...new Map<string,Stock>(items.map(mapPool).filter((s:Stock)=>/^\d{6}$/.test(s.code)).map((s:Stock)=>[s.code,s])).values()];
 const empty=!!pool&&num(pool.pagination?.total)===0&&!stocks.length;
 const stats=normalizeStats(pool,val(1),val(2),val(3),date),lhb=val(4),hot=val(5);
 // Public rows fill only independently verified fields for exactly the same business date.
 const emJob=(!pool||stocks.some(s=>s.openTimes==null))?publicPool(date).catch(()=>null):Promise.resolve(null);
 const detail=await quotes(stocks.map(s=>symbol(s.code))).catch(()=>[]),em=await emJob;
 let fallback=false;if(!pool&&Array.isArray(em?.pool)){stocks=em.pool.map(mapEMPool);fallback=true;}
 stocks=mergeQuotes(stocks,detail,em,date);
 const complete=!!pool&&!pageError&&stocks.length===(num(pool.pagination?.total)??stocks.length);
 const statReady=stats.up!=null&&stats.down!=null&&stats.opened!=null&&(stats.up+stats.opened===0||stats.sealRate!=null);
 const mode:Source['mode']=date!==clock.date||clock.phase==='closed'||clock.phase==='preopen'?'close':empty?'empty':'live';
 const stamp=new Date(now).toISOString(),poolFailure=tasks[0].status==='rejected'?providerFailure(tasks[0].reason):providerFailure(null),quoteSources=[...new Set(indices.map(q=>q.source))];
 const sources:Source[]=[{id:'fuyao',name:'同花顺兼容源 · FUYAO',status:pool?(complete&&statReady?'ok':'partial'):'error',mode,checkedAt:stamp,
  ...(!pool?{errorCode:poolFailure.errorCode}:{}),message:pool?`${date} 涨停池 ${stocks.length}/${pool.pagination?.total??stocks.length}；${statReady?'涨停 / 炸板 / 跌停统计齐备':'统计未齐，缺失项暂停判断'}。${mode==='close'?'休市读取最近交易日；开盘自动切换当日。':'每 5 秒自动请求，以上游采样时间为准。'}`:poolFailure.message+'；正在尝试备用源',date,url:'https://fuyao.aicubes.cn'},
 {id:'tencent',name:quoteSources.length&&quoteSources.every(s=>s.includes('FUYAO'))?'FUYAO · 实时报价':'腾讯 / 同花顺 · 自动报价',status:indices.length===4?'ok':indices.length?'partial':'error',mode:mode==='close'?'close':'live',checkedAt:stamp,message:`指数 ${indices.length}/4（${quoteSources.join(' / ')||'源未返回'}）；个股报价 ${detail.length}/${stocks.length}；含换手率与日内高低价`,date:indices[0]?.time?.slice(0,8).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3')||null,url:quoteSources.length&&quoteSources.every(s=>s.includes('FUYAO'))?'https://fuyao.aicubes.cn':'https://gu.qq.com/'},
 {id:'tdx',name:'通达信 · 本机导入',status:'missing',message:'支持 .blk / .txt / .csv 自选文件；本机解析',date:null,url:'https://www.tdx.com.cn/'}];
 const sector=await sectorJob;
 sources.push(sector?.source||{id:'eastmoney',name:'行业行情',status:'error',message:'行业主源与备用源均未返回行情，稍后自动重试',date:null,url:'https://quote.eastmoney.com/'});
 sources.push({id:'lhb',name:'FUYAO · 龙虎榜',status:lhb?'ok':'error',mode:lhb?.stock_items?.length||lhb?.item?.length?'close':'empty',checkedAt:stamp,message:lhb?'已连接；按实际披露日显示，盘后更新':'披露源暂不可用，稍后自动重试',date:lhb?.trade_date||null,url:'https://fuyao.aicubes.cn'},
 {id:'hot',name:'FUYAO · 实时人气榜',status:hot?'ok':'error',mode:'live',checkedAt:stamp,message:hot?'每轮刷新获取最新热榜；热度不等于资金流入':'热榜源暂不可用，稍后自动重试',date:shDate(hot?.timestamp),url:'https://fuyao.aicubes.cn'});
 if(fallback)sources.push({id:'em-pool',name:'东方财富 · 备用涨停池',status:'ok',mode:'fallback',message:'主源异常时启用；保留东方财富实际日期',date,url:'https://quote.eastmoney.com/ztb/'});
 const themes=new Map<string,Market['themes'][number]>();for(const s of stocks.filter(s=>!s.isST))for(const name of s.themes){const t=themes.get(name)||{name,count:0,leaders:[]};t.count++;if(t.leaders.length<3)t.leaders.push(s.name);themes.set(name,t);}
 const lmap=new Map<string,Market['lhb'][number]>();for(const x of lhb?.stock_items||lhb?.item||[]){const code=x.ticker||x.thscode?.split('.')[0];if(!/^\d{6}$/.test(code))continue;const row={code,name:x.name,net:num(x.net_value),org:num(x.org_net_value),days:x.range_days||1,reason:x.limit_reason||x.concept_list?.map((c:any)=>c.name).join(' · ')||''},id=code+'-'+row.days,old=lmap.get(id);if(!old||Math.abs(row.net??0)>Math.abs(old.net??0))lmap.set(id,row);}
 return {fetchedAt:stamp,servedAt:stamp,providerMode:'proxy',refreshMs:5000,keyConfigured:true,tradeDate:date,poolDate:date,poolTimestamp:num(pool?.timestamp),poolTotal:fallback?num(em?.tc):num(pool?.pagination?.total),stocks,indices,stats,sectors:sector?.rows||[],themes:[...themes.values()].sort((a,b)=>b.count-a.count),lhb:[...lmap.values()],lhbDate:lhb?.trade_date||null,hot:(hot?.item||[]).map((x:any)=>({code:x.ticker||x.thscode?.split('.')[0],name:x.name,rank:num(x.rank)??0,heat:num(x.heat)})),sources,
 notice:!pool?`同花顺主源暂不可用：${poolFailure.message}；${fallback?'已启用东方财富备用池':'保留各模块可用数据'}。`:mode==='close'?`实时接口已连接 · 每 5 秒刷新请求；当前休市，展示 ${date} 最近交易日行情，开盘自动切换。`:empty?'实时接口已连接 · 当日尚未产生涨停记录，继续每 5 秒刷新。':'实时接口已连接 · 默认每 5 秒自动刷新；行情时间以上游返回为准。'};
}
