import type {Market} from './market-types';
import {assessTactics,marketClock,quoteEpoch} from './tactics.ts';
import {sanitizeSnapshots,sealSource,type SealSnapshot} from './closing-signals.ts';
export type SealArchive={version:1;generatedAt:string;records:SealSnapshot[];runs:{at:string;date:string;slot:string;status:string;message:string}[]};
export function collectionSlot(now:number):'noon'|'late'|null{const d=new Date(now+8*3600000),m=d.getUTCHours()*60+d.getUTCMinutes();if([0,6].includes(d.getUTCDay()))return null;return m>=685&&m<775?'noon':m>=895?'late':null;}
export function cloudSnapshot(data:Market,slot:'noon'|'late',now:number):SealSnapshot|null{
 if(collectionSlot(now)!==slot||data.tradeDate!==marketClock(now).date||data.poolDate!==data.tradeDate||!sealSource(data))return null;
 const checked={...data,providerMode:'public' as const};
 if(assessTactics(checked,now).dataIssue)return null;
 const times=data.indices.map(q=>quoteEpoch(q.time));
 if(times.length!==4||times.some(t=>!t||marketClock(t).date!==data.tradeDate))return null;
 const minutes=times.map(t=>{const d=new Date(t!+8*3600000);return d.getUTCHours()*60+d.getUTCMinutes();});
 if(slot==='noon'&&minutes.some(m=>m<685||m>695)||slot==='late'&&minutes.some(m=>m<895))return null;
 const at=data.poolTimestamp??Date.parse(data.fetchedAt);
 if(!Number.isFinite(at)||at>now+60000||marketClock(at).date!==data.tradeDate)return null;
 // Source time may be the last quote during lunch/close; retain both source and actual collection time.
 return {date:data.tradeDate!,source:sealSource(data)!,at,basis:data.poolTimestamp!=null?'source':'observed',slot,up:data.stats.up,stocks:data.stocks.map(s=>({code:s.code,name:s.name,boards:s.boards,seal:s.seal,isST:s.isST})),origin:'cloud',collectedAt:new Date(now).toISOString(),market:{...checked,cached:false,servedAt:new Date(now).toISOString()}};
}
export function parseSealArchive(input:any):SealArchive{
 if(input?.version!==1||!Array.isArray(input.records))throw Error('共享快照格式无效');
 const records=sanitizeSnapshots(input.records).filter(s=>{if(s.origin!=='cloud')return true;try{return !!s.market&&s.market.tradeDate===s.date&&s.market.poolDate===s.date&&sealSource(s.market)===s.source&&!assessTactics(s.market,Date.parse(s.date+'T16:30:00+08:00')).dataIssue;}catch{return false;}});
 return {version:1,generatedAt:String(input.generatedAt||''),records,runs:Array.isArray(input.runs)?input.runs.slice(-12):[]};
}
export function mergeSealArchive(old:SealArchive,newRecords:SealSnapshot[],run:SealArchive['runs'][number]):SealArchive{
 const map=new Map(old.records.map(s=>[`${s.date}/${s.source}/${s.slot}`,s]));
 for(const s of newRecords){const id=`${s.date}/${s.source}/${s.slot}`,p=map.get(id);if(!p||s.at>p.at)map.set(id,s);}
 const records=[...map.values()].sort((a,b)=>a.at-b.at),dates=[...new Set(records.map(s=>s.date))].sort().slice(-8);
 return {version:1,generatedAt:run.at,records:records.filter(s=>dates.includes(s.date)),runs:[...old.runs,run].slice(-12)};
}
/** A completed cloud close is a fixed, labelled comparison, independent of which provider wins live refreshes. */
export function closingMarket(data:Market|null,records:SealSnapshot[],now:number,selectedDate?:string){
 const clock=marketClock(now);
 const late=records.filter(s=>s.origin==='cloud'&&s.slot==='late'&&s.market&&s.date<=clock.date&&(!selectedDate||s.date===selectedDate)).sort((a,b)=>b.date.localeCompare(a.date)||b.at-a.at)[0];
 const useCloud=!!late&&(!!selectedDate||!data||!clock.live||data.tradeDate!==clock.date);
 if(useCloud)return {data:{...late!.market!,research:data?.research?.tradeDate===late!.date?data.research:late!.market!.research},now:Date.parse(late!.date+'T16:30:00+08:00'),historical:late!.date!==clock.date,cloud:true,date:late!.date};
 return {data,now,historical:false,cloud:false,date:data?.tradeDate||null};
}
