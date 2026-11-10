import type {Market,History,Quote,Source,Stock} from './market-types';
import {mapEMPool,num,parseTencent,shDate,symbol} from './market-core.ts';
import {tencentHistory} from './history-normalize.ts';
import {loadMinuteHistory} from './minute-history.ts';
import {poolObservation} from './public-pool-evidence.ts';

export type Transport=(url:string,options?:{kind?:'json'|'quotes'|'jsonp';method?:string;body?:string})=>Promise<any>;
const INDEX_CODES=['sh000001','sz399001','sz399006','sh000300'];
const EM='https://push2ex.eastmoney.com/';
const topic=(name:string,date:string)=>EM+name+'?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date='+date.replaceAll('-','');
const dateString=(v:unknown)=>String(v??'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
const error=(e:unknown)=>e instanceof Error?e.message:'上游暂不可用';

export function normalizeLhb(payload:any):{rows:Market['lhb'];date:string|null}{
 const raw=Array.isArray(payload?.result?.data)?payload.result.data:[];
 const date=raw.map((x:any)=>String(x.TRADE_DATE||'').slice(0,10)).filter((v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)).sort().at(-1)||null;
 const rows=new Map<string,Market['lhb'][number]>();
 for(const x of raw){if(String(x.TRADE_DATE).slice(0,10)!==date||!/^\d{6}$/.test(x.SECURITY_CODE))continue;
  const days=/连续三|三个交易日/.test(x.EXPLANATION||'')?3:1;
  const row={code:x.SECURITY_CODE,name:String(x.SECURITY_NAME_ABBR||''),net:num(x.BILLBOARD_NET_AMT),org:null,days,reason:String(x.EXPLANATION||'')},id=row.code+'-'+days,old=rows.get(id);
  if(!old||Math.abs(row.net??0)>Math.abs(old.net??0))rows.set(id,row);
 }
 return {rows:[...rows.values()],date};
}

export function createPublicDataClient(transport:Transport){
 let cache:{time:number;value:Market}|undefined;
 let extrasCache:{time:number;lhb:{rows:Market['lhb'];date:string|null}|null}|undefined;
 async function quotes(codes:string[]):Promise<Quote[]>{
  const valid=[...new Set(codes.filter(c=>/^(sh|sz|bj)\d{6}$/.test(c)))].slice(0,200);
  if(!valid.length)return [];
  let primary:Quote[]=[];
  try{const text=await transport('https://qt.gtimg.cn/q='+valid.join(','),{kind:'quotes'});primary=parseTencent(text).filter(q=>valid.includes(q.code)&&q.price!=null&&q.price>0);}catch{/* CORS-capable Tencent endpoint below. */}
  const missing=valid.filter(c=>!primary.some(q=>q.code===c));
  const rows=await Promise.allSettled(missing.map(async c=>{
   const j=await transport('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+c+',day,,,1,qfq');
   const q=j?.data?.[c]?.qt?.[c];return Array.isArray(q)?parseTencent(`v_${c}="${q.join('~')}";`):[];
  }));
 const result=[...primary,...rows.flatMap(r=>r.status==='fulfilled'?r.value:[])];
  if(!result.length)throw new Error('腾讯公开报价暂不可用');return result;
 }
 async function lhb(){
  if(extrasCache&&Date.now()-extrasCache.time<300000)return extrasCache.lhb;
  const url='https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILS&columns=ALL&sortColumns=TRADE_DATE&sortTypes=-1&pageSize=500&pageNumber=1&source=WEB&client=WEB';
  const result=normalizeLhb(await transport(url,{kind:'jsonp'}));
  if(!result.rows.length)throw new Error('龙虎榜暂未返回披露记录');extrasCache={time:Date.now(),lhb:result};return result;
 }
 async function sectors(){
  const j=await transport('https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=12&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2+f:!50&fields=f12,f14,f3,f62,f124');
  const rows=Array.isArray(j?.data?.diff)?j.data.diff:Object.values(j?.data?.diff||{});
  return rows.filter((x:any)=>x.f12&&x.f14).map((x:any)=>({code:String(x.f12),name:String(x.f14),change:num(x.f3),flow:num(x.f62)}));
 }
 async function market(force=false,snapshot:Market|null=null):Promise<Market>{
  if(cache&&Date.now()-cache.time<(force?1500:5000))return {...cache.value,cached:true,servedAt:new Date().toISOString()};
  const indexJob=quotes(INDEX_CODES),sectorJob=sectors().catch(()=>[]),lhbJob=lhb().catch(()=>null);
  const indices=await indexJob.catch(()=>[]);
  const quoteDate=indices.map(q=>q.time).filter(t=>/^\d{14}$/.test(t)).sort().at(-1)?.slice(0,8);
  const date=quoteDate?dateString(quoteDate):shDate(Date.now())!;
  const settled=await Promise.allSettled([transport(topic('getTopicZTPool',date)),transport(topic('getTopicZBPool',date)),transport(topic('getTopicDTPool',date)),sectorJob,lhbJob]);
  const val=(i:number)=>settled[i].status==='fulfilled'?(settled[i] as PromiseFulfilledResult<any>).value:null;
  const up=val(0)?.data,broken=val(1)?.data,down=val(2)?.data;
  if(!Array.isArray(up?.pool))throw new Error('东方财富涨停池暂未返回，保留最近可用快照');
  const poolDate=dateString(up.qdate);if(poolDate!==date)throw Error('东方财富涨停池交易日与请求日期不一致');
  const stocks:Stock[]=[...new Map<string,Stock>(up.pool.map(mapEMPool).filter((s:Stock)=>/^\d{6}$/.test(s.code)).map((s:Stock)=>[s.code,s])).values()];
  const details=await quotes(stocks.map(s=>symbol(s.code))).catch(()=>[]),qmap=new Map(details.map(q=>[q.code.slice(2),q]));
  const enriched=stocks.map(s=>{const q=qmap.get(s.code);return q?{...s,price:q.price??s.price,change:q.change??s.change,open:q.open,high:q.high,low:q.low,turnover:q.turnover??s.turnover,quoteDate:q.time,source:s.source+' · 腾讯报价'}:s;});
  const upCount=num(up.tc),opened=dateString(broken?.qdate)===poolDate?num(broken?.tc):null,downCount=dateString(down?.qdate)===poolDate?num(down?.tc):null;
  const sealRate=upCount!=null&&opened!=null&&upCount+opened>0?upCount/(upCount+opened):null;
  const boards=new Map<number,number>(),themes=new Map<string,Market['themes'][number]>();
  for(const s of enriched.filter(s=>!s.isST)){
   if(s.boards>=2)boards.set(s.boards,(boards.get(s.boards)||0)+1);
   for(const name of s.themes){const t=themes.get(name)||{name,count:0,leaders:[]};t.count++;if(t.leaders.length<3)t.leaders.push(s.name);themes.set(name,t);}
  }
  const l=val(4),oldHot=snapshot?.sources.find(s=>s.id==='hot'),hot=snapshot?.hot||[];
  const sources:Source[]=[
   {id:'em-pool',name:'东方财富 · 涨停 / 炸板池',status:opened==null||enriched.length!==upCount?'partial':'ok',mode:poolDate===shDate(Date.now())?'live':'close',checkedAt:new Date().toISOString(),message:`浏览器实时请求；涨停 ${enriched.length}/${upCount??'—'}；炸板 ${opened??'缺失'}；题材按行业近似；源未返回秒级池时间`,date:poolDate,url:'https://quote.eastmoney.com/ztb/'},
   {id:'tencent',name:'腾讯行情',status:indices.length===4?'ok':'partial',message:'四大指数、个股报价、真实分时与日线；浏览器直连公开接口',date,url:'https://gu.qq.com/'},
   {id:'eastmoney',name:'东方财富 · 行业行情',status:val(3)?.length?'ok':'error',message:val(3)?.length?'行业涨幅与主力净流入':'行业接口暂不可用',date:val(3)?.length?date:null,url:'https://quote.eastmoney.com/'},
   {id:'lhb',name:'东方财富 · 龙虎榜',status:l?'ok':snapshot?.lhb.length?'partial':'error',message:l?'按最新披露日、个股和统计周期去重；机构净额未提供':snapshot?.lhb.length?'保留静态快照；按实际披露日期显示':'等待公开披露接口返回',date:l?.date||snapshot?.lhbDate||null,url:'https://data.eastmoney.com/stock/tradedetail.html'},
   {id:'hot',name:oldHot?.name?oldHot.name+' · 备用快照':'人气榜备用快照',status:hot.length?'partial':'missing',mode:'snapshot',message:hot.length?'保留原来源的构建快照；页面刷新不会将快照标作实时':'等待 GitHub Actions 获取公开人气榜快照',date:oldHot?.date||null,url:oldHot?.url||'https://guba.eastmoney.com/rank/'},
   {id:'tdx',name:'通达信',status:'missing',message:'支持本机导入 .blk / .txt / .csv 自选，未配置实时授权接口',date:null,url:'https://www.tdx.com.cn/'},
  ];
  const value:Market={themeBasis:'industry',providerMode:'public',fetchedAt:new Date().toISOString(),servedAt:new Date().toISOString(),tradeDate:poolDate,poolDate,poolTimestamp:null,poolTotal:upCount,stocks:enriched,indices,stats:{up:upCount,down:downCount,opened,sealRate,sealRateDerived:true,exact:[...boards].map(([board,count])=>({board,count}))},sectors:val(3)||[],themes:[...themes.values()].sort((a,b)=>b.count-a.count).slice(0,18),lhb:l?.rows||snapshot?.lhb||[],lhbDate:l?.date||snapshot?.lhbDate||null,hot,sources,keyConfigured:false};
  value.decisionPools=poolObservation(poolDate,up,broken,down);
  cache={time:Date.now(),value};return value;
 }
 async function history(code:string,mode='day'):Promise<History>{
  if(!/^(sh|sz|bj)\d{6}$/.test(code))throw new Error('股票代码不合法');
  if(mode==='minute'){
   return {...await loadMinuteHistory(code,url=>transport(url)),fetchedAt:new Date().toISOString()};
  }
  const j=await transport('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+code+',day,,,60,qfq');
  const h=tencentHistory(code,j);if(!h.points.length)throw new Error('日线暂未返回真实价格');return {...h,fetchedAt:new Date().toISOString()};
 }
 async function popularity(){
  const j=await transport('https://emappdata.eastmoney.com/stockrank/getAllCurrentList',{method:'POST',body:JSON.stringify({appId:'appId01',globalId:'786e4c21-70dc-435a-93bb-38',marketType:'',pageNo:1,pageSize:12})});
  const raw=(j?.data||[]).filter((x:any)=>/^(SH|SZ|BJ)\d{6}$/.test(x.sc));
  const q=await quotes(raw.map((x:any)=>x.sc.toLowerCase())),names=new Map(q.map(x=>[x.code.slice(2),x.name]));
  return raw.map((x:any)=>({code:x.sc.slice(2),name:names.get(x.sc.slice(2))||x.sc.slice(2),rank:Number(x.rk),heat:null}));
 }
 return {market,history,quotes,popularity};
}
