import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicDataClient} from '../src/lib/public-data.ts';
import {collectFuyao} from './fuyao-data.mjs';
import {cloudSnapshot,collectionSlot,mergeSealArchive,parseSealArchive} from '../src/lib/seal-archive.ts';
const file=new URL('../public/data/seal-snapshots.json',import.meta.url),key=process.env.FUYAO_API_KEY||'';
let archive=await readFile(file,'utf8').then(JSON.parse).then(parseSealArchive).catch(()=>({version:1,generatedAt:'',records:[],runs:[]}));
// Scheduled runners start early, then wait for the target. Delayed starts use actual time and never relabel a close as noon.
if(process.env.GITHUB_EVENT_NAME==='schedule'&&process.env.SEAL_TARGET){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const target=Date.parse(date+'T'+(process.env.SEAL_TARGET==='noon'?'11:30:10':'15:01:00')+'+08:00');
 const wait=target-Date.now();if(wait>0&&wait<20*60000){console.log('等待目标采集窗口；不依赖访客网页。');await new Promise(r=>setTimeout(r,wait));}
}
const now=Date.now(),slot=collectionSlot(now),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
if(!slot){console.log('当前非采集窗口，保留已有共享快照。');process.exit(0);}
const transport=async(url,options={})=>{const r=await fetch(url,{method:options.method,body:options.body,headers:{'User-Agent':'Mozilla/5.0',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('上游暂不可用');return options.kind==='quotes'?new TextDecoder('gb18030').decode(await r.arrayBuffer()):r.json();};
const client=createPublicDataClient(transport),records=[];
let em=null;try{em=await client.market(true);const record=cloudSnapshot(em,slot,Date.now());if(record)records.push(record);}catch{}
if(key)try{const fy=await collectFuyao({key,transport,quotes:client.quotes,base:em});if(fy){const record=cloudSnapshot(fy,slot,Date.now());if(record)records.push(record);}}catch{}
archive=mergeSealArchive(archive,records,{at:new Date().toISOString(),date,slot,status:records.length?'ok':'failed',message:records.length?'后台独立采集，按来源保存完整名单':'本轮未取得完整同日行情；保留旧记录，不补造午盘或零封单'});
const text=JSON.stringify(archive);if(key&&text.includes(key))throw Error('公开文件不得包含凭证');
await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});await writeFile(file,text);
console.log(JSON.stringify({slot,date,captured:records.map(r=>({source:r.source,count:r.stocks.length,at:new Date(r.at).toISOString()})),archiveGroups:archive.records.length}));
if(!records.length)process.exitCode=1;
