import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicDataClient} from '../src/lib/public-data.ts';
import {collectFuyao} from './fuyao-data.mjs';
import {cloudSnapshot,collectionSlot,mergeSealArchive,parseSealArchive} from '../src/lib/seal-archive.ts';
import {mergeBackupStockFields} from '../src/lib/live-enrichment.ts';
import {createResearchEvidenceLoader} from '../src/lib/research-evidence.ts';
import {verifiedHistoryPool} from '../src/lib/public-research.ts';
import {asOf,sameMoment,withPreviousSnapshot} from '../src/lib/decision-proof.ts';
import {symbol} from '../src/lib/market-core.ts';
const file=new URL('../public/data/seal-snapshots.json',import.meta.url),key=process.env.FUYAO_API_KEY||'';
let archive=await readFile(file,'utf8').then(JSON.parse).then(parseSealArchive).catch(()=>({version:1,generatedAt:'',records:[],runs:[]}));
// Scheduled runners start early, then wait for the target. Delayed starts use actual time and never relabel a close as noon.
if(process.env.GITHUB_EVENT_NAME==='schedule'&&process.env.SEAL_TARGET){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const target=Date.parse(date+'T'+(process.env.SEAL_TARGET==='noon'?'11:30:10':'15:01:00')+'+08:00');
 const wait=target-Date.now();if(wait>0&&wait<20*60000){console.log('等待目标采集窗口；不依赖访客网页。');await new Promise(r=>setTimeout(r,wait));}
}
const now=Date.now(),window=collectionSlot(now),slot=process.env.SEAL_TARGET||window,date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
if(!slot){console.log('当前非采集窗口，保留已有共享快照。');process.exit(0);}
const transport=async(url,options={})=>{const r=await fetch(url,{method:options.method,body:options.body,headers:{'User-Agent':'Mozilla/5.0',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('上游暂不可用');return options.kind==='quotes'?new TextDecoder('gb18030').decode(await r.arrayBuffer()):r.json();};
const client=createPublicDataClient(transport),records=[];
if(slot===window){
 const emJob=client.market(true).catch(()=>null);
 const fyJob=key?Promise.all([
  collectFuyao({key,transport,quotes:client.quotes}).catch(()=>null),
  client.quotes(['sh000001','sz399001','sz399006','sh000300']).catch(()=>[])
 ]).then(([data,indices])=>data?{...data,indices}:null):Promise.resolve(null);
 const [em,fy]=await Promise.all([emJob,fyJob]);
 for(const data of [em,fy&&em?mergeBackupStockFields(fy,em):fy]){
  const record=data&&cloudSnapshot(data,slot,Date.now());
  if(record&&!archive.records.some(saved=>saved.date===date&&saved.slot===slot&&saved.source===record.source))records.push(record);
 }
 if(records.length){
  const history=await readFile(new URL('../public/data/history.json',import.meta.url),'utf8').then(JSON.parse).catch(()=>null);
  const evidence=createResearchEvidenceLoader({json:transport,fy:async()=>{throw Error('使用公开历史数据');},historicalPool:async d=>verifiedHistoryPool(d,Array.isArray(history?.pools)?history.pools:[])});
  const research=await evidence(date,slot==='noon'?'1130':'1500').catch(()=>null);
  if(research)for(const record of records)record.market.research=research;
  const emRecord=records.find(record=>record.source==='东方财富');
  for(const record of records){
   if(emRecord&&Math.abs(asOf(emRecord.market)-asOf(record.market))<=180000)record.market.decisionPools=emRecord.market.decisionPools;
   record.market=withPreviousSnapshot(record.market,archive.records);
  }
  const ids=[...new Set(records.flatMap(record=>record.market.research?.previousPool?.stocks.map(s=>symbol(s.code))||[]))];
  const jobs=[];
  for(let i=0;i<ids.length;i+=40)jobs.push(client.quotes(ids.slice(i,i+40)).catch(()=>[]));
  const quotes=(await Promise.all(jobs)).flat();
  for(const record of records){
   const previous=record.market.research?.previousPool;
   if(!previous?.complete)continue;
   const accepted=new Set(previous.stocks.map(s=>symbol(s.code)));
   record.market.decisionFeedback={previousDate:previous.date,quotes:quotes.filter(q=>accepted.has(q.code)&&sameMoment(q,date,asOf(record.market)))};
  }
 }
}
const available=[...archive.records.filter(saved=>saved.date===date&&saved.slot===slot),...records];
const status=available.length?'ok':slot===window?'failed':'missed';
const message=status==='ok'?'已归档：'+available.map(r=>r.source+' '+r.stocks.length+' 只').join('、'):status==='missed'?'任务启动时已错过目标窗口':'上游未返回完整同日行情，保留已归档记录';
archive=mergeSealArchive(archive,records,{at:new Date().toISOString(),date,slot,status,message});
const text=JSON.stringify(archive);if(key&&text.includes(key))throw Error('公开文件不得包含凭证');
await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});await writeFile(file,text);
console.log(JSON.stringify({slot,date,captured:records.map(r=>({source:r.source,count:r.stocks.length,at:new Date(r.at).toISOString()})),archiveGroups:archive.records.length}));
if(status==='failed')process.exitCode=1;
