// Imported by the Node collector only; never import this module into the browser bundle.
import {mapPool,num,shDate,symbol} from '../src/lib/market-core.ts';
export async function collectFuyao({key,transport,quotes,base}){
 if(!key)return null;
 base??={indices:[],sectors:[],sources:[],lhb:[],lhbDate:null,hot:[]};
 const get=async path=>{
  const j=await transport('https://fuyao.aicubes.cn/api/a-share/special-data/'+path,{headers:{'X-api-key':key}});
  if(j?.code!==0||!j.data)throw Error('同花顺兼容源未返回可用数据');
  return j.data;
 };
 const paths=['limit-up-pool?page=1&size=200&sort_field=continue_day_cnt&sort_dir=desc','limit-up-statistics','limit-down-pool?page=1&size=1','dragon-tiger-list?board_type=all','hot-stock-list?period=day&limit=12'];
 const jobs=await Promise.allSettled(paths.map(get));
 const val=i=>jobs[i].status==='fulfilled'?jobs[i].value:null;
 const pool=val(0),stats=val(1),down=val(2),lhb=val(3),hot=val(4);
 if(!Array.isArray(pool?.item)||!shDate(pool.timestamp))throw Error('同花顺兼容源涨停池不可用');
 let items=[...pool.item];
 const pages=Math.min(10,Number(pool.pagination?.pages)||1);
 for(let p=2;p<=pages;p++){try{const next=await get(paths[0].replace('page=1','page='+p));if(!Array.isArray(next.item))break;items.push(...next.item);}catch{break;}}
 const poolDate=shDate(pool.timestamp),reset=items.length>0&&num(stats?.limit_up_stock_count)===0;
 const sameStats=stats?.trade_date===poolDate&&!reset,sameDown=shDate(down?.timestamp)===poolDate&&!reset;
 let stocks=[...new Map(items.map(mapPool).filter(s=>/^\d{6}$/.test(s.code)).map(s=>[s.code,s])).values()];
 const detailed=await quotes(stocks.map(s=>symbol(s.code))).catch(()=>[]);
 const qmap=new Map(detailed.filter(q=>typeof q.time==='string'&&q.time.slice(0,8)===poolDate.replaceAll('-','')).map(q=>[q.code.slice(2),q]));
 stocks=stocks.map(s=>{const q=qmap.get(s.code);return q?{...s,price:q.price??s.price,change:q.change??s.change,turnover:q.turnover??s.turnover,amount:q.amount,open:q.open,high:q.high,low:q.low,quoteDate:q.time,source:s.source+' · 腾讯报价'}:s;});
 const themes=new Map();for(const s of stocks.filter(s=>!s.isST))for(const name of s.themes){const t=themes.get(name)||{name,count:0,leaders:[]};t.count++;if(t.leaders.length<3)t.leaders.push(s.name);themes.set(name,t);}
 const lmap=new Map();for(const x of lhb?.stock_items||lhb?.item||[]){const code=x.ticker||x.thscode?.split('.')[0];if(!/^\d{6}$/.test(code))continue;const row={code,name:String(x.name||''),net:num(x.net_value),org:num(x.org_net_value),days:x.range_days||1,reason:x.limit_reason||x.concept_list?.map(c=>c.name).join(' · ')||''},id=code+'-'+row.days;const old=lmap.get(id);if(!old||Math.abs(row.net??0)>Math.abs(old.net??0))lmap.set(id,row);}
 const sources=(base?.sources||[]).filter(s=>!['fuyao','em-pool','lhb','hot'].includes(s.id));
 sources.unshift({id:'fuyao',name:'同花顺兼容源 · FUYAO（第三方）',status:'partial',message:`安全采集快照：接口返回 ${stocks.length}/${pool.pagination?.total??stocks.length} 条；${reset?'盘前统计已归零，但名单仍有记录：行情时点待核实，统计不参与判断':sameStats?'同日统计可用':'统计日期未对齐，不参与判断'}；不是秒级实时`,date:poolDate,url:'https://fuyao.aicubes.cn'});
 sources.push({id:'lhb',name:'FUYAO · 龙虎榜',status:lhb?'ok':'error',message:lhb?'安全采集快照；按披露日期及统计周期显示':'本次未取得披露记录',date:lhb?.trade_date||null,url:'https://fuyao.aicubes.cn'},
 {id:'hot',name:'FUYAO · 人气榜',status:hot?'partial':'error',message:hot?'安全采集快照；热度不代表资金流入':'本次未取得人气记录',date:shDate(hot?.timestamp),url:'https://fuyao.aicubes.cn'});
 return {...base,fetchedAt:new Date().toISOString(),servedAt:new Date().toISOString(),providerMode:'snapshot',keyConfigured:true,tradeDate:poolDate,poolDate,poolTimestamp:num(pool.timestamp),poolTotal:num(pool.pagination?.total),stocks,stats:{up:sameStats?num(stats.limit_up_stock_count):null,down:sameDown?num(down?.pagination?.total):null,opened:sameStats?num(stats.open_stock_count):null,sealRate:sameStats?num(stats.seal_rate):null,exact:sameStats?(stats.exact_boards||[]).map(x=>({board:x.board_num,count:x.stock_count})):[]},themes:[...themes.values()].sort((a,b)=>b.count-a.count),lhb:[...lmap.values()],lhbDate:lhb?.trade_date||null,hot:(hot?.item||[]).map(x=>({code:x.ticker,name:x.name,rank:x.rank,heat:num(x.heat)})),sources,
 notice:reset?'同花顺兼容源盘前统计已归零，但仍有股票名单；接口日期不等于已核实的成交日期。统计与战法等待新行情。':'同花顺兼容源 · FUYAO 安全采集快照；保留上游行情时点，页面刷新不会将其标作实时。'};
}
