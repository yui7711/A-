import {requestJSON} from './client-request';
import {fetchPublicJSON} from './public-transport';
import {archivedFeedback,asOf,cnMinute,emptyPools,sameMoment,type DecisionProof,type PoolProof,type SectorMember} from './decision-proof';
import {num,symbol} from './market-core';
import type {History,Market,Quote,Stock} from './market-types';
import {marketClock} from './tactics';
import {poolObservation} from './public-pool-evidence';
import {loadDatedMinuteHistory} from './minute-history';

const validCode=(v:string)=>/^\d{6}$/.test(v);
const jobs=new Map<string,{time:number;job:Promise<DecisionProof>}>();
let directory:{at:number;job:Promise<{code:string;name:string}[]>}|null=null;

async function emPool(name:string,date:string){
 const day=date.replaceAll('-','');
 const url='https://push2ex.eastmoney.com/'+name+'?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date='+day;
 return (await fetchPublicJSON(url) as {data?:unknown})?.data;
}

async function loadPools(date:string):Promise<PoolProof>{
 const rows=await Promise.allSettled(['getTopicZTPool','getTopicZBPool','getTopicDTPool'].map(n=>emPool(n,date)));
 const value=(n:number)=>rows[n].status==='fulfilled'?rows[n].value:null;
 return poolObservation(date,value(0),value(1),value(2));
}

type IndustryRow={f12:string;f14:string;f40?:unknown};
const rowsOf=(result:unknown):IndustryRow[]=>{
 const diff=(result as {data?:{diff?:IndustryRow[]|Record<string,IndustryRow>}})?.data?.diff;
 return Array.isArray(diff)?diff:Object.values(diff||{});
};
function industryDirectory(){
 if(directory&&Date.now()-directory.at<120000)return directory.job;
 const base='https://push2.eastmoney.com/api/qt/clist/get?pz=100&po=1&np=1&fid=f12&fs=m:90+t:2+f:!50&fields=f12,f14&pn=';
 const job=Promise.allSettled([1,2,3,4,5].map(page=>fetchPublicJSON(base+page))).then(results=>results.flatMap(r=>r.status==='fulfilled'?rowsOf(r.value):[])
  .filter(x=>x&&/^BK\d+$/.test(x.f12)&&x.f14).map(x=>({code:x.f12,name:x.f14})));
 directory={at:Date.now(),job};
 return job;
}

async function industryMembers(data:Market,name:string,date:string,at:number):Promise<SectorMember[]>{
 if(data.themeBasis!=='industry')return [];
 const industry=data.sectors.find(s=>s.name===name&&/^BK\d+$/.test(s.code))
  ??(await industryDirectory()).find(s=>s.name===name);
 if(!industry)return [];
 const url='https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=f6&fs=b:'+industry.code+'&fields=f12,f14,f40';
 const rows=rowsOf(await fetchPublicJSON(url));
 const members=rows.filter(x=>validCode(x.f12)&&x.f14).slice(0,20);
 if(!members.length)return [];
 const q=await requestJSON<{quotes:Quote[]}>('/api/quotes?codes='+members.map(x=>x.f12).join(','),{},{timeoutMs:10000});
 const quotes=new Map(q.quotes.filter(x=>sameMoment(x,date,at)).map(x=>[x.code.slice(2),x]));
 return members.flatMap(x=>{
  const quote=quotes.get(x.f12);
  return quote?.amount!=null&&quote.amount>0?[{code:x.f12,name:x.f14,cap:num(x.f40),amount:quote.amount,change:quote.change}]:[];
 }).sort((a,b)=>b.amount-a.amount);
}

export function loadDecisionProof(data:Market,codes:string[]=[],industry=''){
 const date=data.tradeDate||'',at=asOf(data),prior=data.research?.previousPool;
 const priorUsable=data.research?.tradeDate===date&&!!prior?.date&&prior.date===data.research.previousDate&&prior.date<date&&prior.complete
  &&prior.total===prior.stocks.length&&new Set(prior.stocks.map(s=>s.code)).size===prior.total&&prior.stocks.every(s=>validCode(s.code));
 const previous:Stock[]=priorUsable?prior!.stocks:[];
 const saved=archivedFeedback(data);
 const picked=[...new Set(codes.filter(validCode))].slice(0,5).sort();
 const focus=codes.find(validCode);
 const sameDay=date===marketClock().date,closed=cnMinute(at)>=900;
 const currentPool=sameDay&&Math.abs(Date.now()-at)<=180000;
 const key=[date,data.themeBasis,data.stocks[0]?.source,Math.floor(at/60000),priorUsable?prior?.date:'',previous.length,saved.length,industry,focus,...picked].join('/');
 const old=jobs.get(key);
 if(old&&Date.now()-old.time<45000)return old.job;
 const job=(async()=>{
  const batches:string[][]=[];
  const missing=previous.filter(s=>!saved.some(q=>q.code.slice(2)===s.code&&q.change!=null));
  if(sameDay)for(let i=0;i<missing.length;i+=35)batches.push(missing.slice(i,i+35).map(s=>s.code));
  const quoteJob=Promise.allSettled(batches.map(batch=>requestJSON<{quotes:Quote[]}>('/api/quotes?codes='+batch.join(','),{},{timeoutMs:9500})));
  const sectorJob=sameDay&&industry?industryMembers(data,industry,date,at).catch(()=>[]):Promise.resolve([]);
  const dailyJob=sectorJob.then(async members=>{
   const middle=members.find(s=>s.cap!=null&&s.cap>=100e8&&s.cap<=800e8&&!data.stocks.some(x=>x.code===s.code&&x.boards>=2));
   const targets=middle?[...new Set([...picked,middle.code])]:picked;
   const rows=await Promise.allSettled(targets.map(c=>requestJSON<History>('/api/history?code='+symbol(c)+'&mode=day',{},{timeoutMs:9000})));
   return Object.fromEntries(rows.flatMap((r,i)=>r.status==='fulfilled'&&r.value.code===symbol(targets[i])?[[targets[i],r.value]]:[]));
  });
  const minuteJob=focus?loadDatedMinuteHistory(symbol(focus),date,fetchPublicJSON):Promise.resolve(null);
  const existing=data.decisionPools;
  const missingPools=!existing||existing.limitUp==null||existing.broken==null||existing.down==null;
  const poolJob=missingPools&&(closed||currentPool)?loadPools(date):Promise.resolve(emptyPools);
  const [quotes,daily,pools,members,minute]=await Promise.all([quoteJob,dailyJob,
   poolJob,sectorJob,minuteJob]);
  return {date,at,previousDate:priorUsable?prior!.date:null,prior:previous,priorTaxonomy:priorUsable?prior!.taxonomy:undefined,
   quotes:[...saved,...quotes.flatMap(r=>r.status==='fulfilled'&&Array.isArray(r.value.quotes)?r.value.quotes:[])],
   daily,pools:{limitUp:existing?.limitUp??pools.limitUp,broken:existing?.broken??pools.broken,
    down:existing?.down??pools.down,lastSeal:existing?.limitUp?existing.lastSeal:pools.lastSeal},
   minute:focus&&minute?{[focus]:minute}:undefined,sector:members.length?{name:industry,members}:undefined};
 })();
 jobs.set(key,{time:Date.now(),job});
 if(jobs.size>14)jobs.delete(jobs.keys().next().value!);
 return job;
}
