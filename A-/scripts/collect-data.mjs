import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicDataClient} from '../src/lib/public-data.ts';

// Public market data only. Credentials and provider keys are never written into this artifact.
const transport=async(url,options={})=>{
 const response=await fetch(url,{method:options.method,body:options.body,headers:{'User-Agent':'Mozilla/5.0',...(options.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('Market provider HTTP '+response.status);
 if(options.kind==='quotes')return new TextDecoder('gb18030').decode(await response.arrayBuffer());
 return response.json();
};
const client=createPublicDataClient(transport);
const file=new URL('../public/data/latest.json',import.meta.url);
let previous=null;try{previous=JSON.parse(await readFile(file,'utf8'));}catch{}
try{
 const data=await client.market(true,previous);
 try{const hot=await client.popularity();if(hot.length){data.hot=hot;data.sources=data.sources.map(s=>s.id==='hot'?{...s,status:'ok',date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),message:'构建时从东方财富公开热榜获取；排名无热度值，界面不补造热度'}:s);}}catch{}
 await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});await writeFile(file,JSON.stringify(data));
 console.log(JSON.stringify({tradeDate:data.tradeDate,stocks:data.stocks.length,indices:data.indices.length,lhb:data.lhb.length,hot:data.hot.length,snapshotAt:data.fetchedAt}));
}catch(e){
 if(!previous)throw e;
 console.warn('公开源暂不可用；继续发布已有真实快照，源日期保持不变。');
}
