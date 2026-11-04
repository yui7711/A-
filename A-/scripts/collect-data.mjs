import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicDataClient} from '../src/lib/public-data.ts';
import {collectFuyao} from './fuyao-data.mjs';

// Public market data only. Credentials and provider keys are never written into this artifact.
const transport=async(url,options={})=>{
 const response=await fetch(url,{method:options.method,body:options.body,headers:{'User-Agent':'Mozilla/5.0',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Market provider HTTP '+response.status);
 if(options.kind==='quotes')return new TextDecoder('gb18030').decode(await response.arrayBuffer());
 return response.json();
};
const client=createPublicDataClient(transport);
const file=new URL('../public/data/latest.json',import.meta.url);
let previous=null;try{previous=JSON.parse(await readFile(file,'utf8'));}catch{}
try{
 let data=null;
 try{const r=await fetch('https://obsidian-stock-radar.d69m29kwvj.chatgpt.site/api/market?fresh=1',{signal:AbortSignal.timeout(20000)});const j=await r.json();if(r.ok&&Array.isArray(j.stocks)&&Array.isArray(j.indices)&&j.sources?.some(s=>s.id==='fuyao'&&s.status==='ok'))data=j;}catch{}
 data??=await client.market(true,previous).catch(()=>previous);
 if(process.env.FUYAO_API_KEY&&!data?.sources?.some(s=>s.id==='fuyao'&&s.mode!=='snapshot')){
  try{const fy=await collectFuyao({key:process.env.FUYAO_API_KEY,transport,quotes:client.quotes,base:data});if(fy)data=fy;}
  catch{console.warn('同花顺兼容源暂不可用，使用其他真实数据；密钥与原始响应不会写入日志。');}
 }
 if(!data)throw Error('尚无可发布的行情数据');
 data={...data,providerMode:'snapshot',notice:'当前为构建时保存的备用数据，正在连接实时接口；实时请求每 5 秒更新。',sources:data.sources.map(s=>s.id==='tdx'?s:{...s,mode:'snapshot'})};
 if(!data.sources.some(s=>s.id==='fuyao'))try{const hot=await client.popularity();if(hot.length){data.hot=hot;data.sources=data.sources.map(s=>s.id==='hot'?{...s,status:'ok',date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),message:'构建时从东方财富公开热榜获取；排名无热度值，界面不补造热度'}:s);}}catch{}
 await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});await writeFile(file,JSON.stringify(data));
 console.log(JSON.stringify({tradeDate:data.tradeDate,stocks:data.stocks.length,indices:data.indices.length,lhb:data.lhb.length,hot:data.hot.length,snapshotAt:data.fetchedAt}));
}catch(e){
 if(!previous)throw e;
 console.warn('公开源暂不可用；继续发布已有真实快照，源日期保持不变。');
}
