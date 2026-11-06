import type {Market,Stock} from './market-types';
import {assessTactics,marketClock,quoteEpoch} from './tactics.ts';

export type SealSnapshot={date:string;source:string;at:number;basis:'source'|'observed';slot:'noon'|'late';stocks:{code:string;name:string;boards:number;seal:number|null;isST:boolean}[];up:number|null};
export const SEAL_STORAGE='obsidian-seal-observations-v1';
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const minute=(at:number)=>{const d=new Date(at+8*3600000);return d.getUTCHours()*60+d.getUTCMinutes();};
export const sealSource=(d:Market)=>d.stocks.every(s=>s.source.startsWith('FUYAO'))?'FUYAO':d.stocks.every(s=>s.source.startsWith('东方财富'))?'东方财富':null;
function complete(d:Market){return !!d.tradeDate&&d.tradeDate===d.poolDate&&d.poolTotal!=null&&d.stocks.length===d.poolTotal&&new Set(d.stocks.map(s=>s.code)).size===d.poolTotal&&d.stocks.every(s=>/^\d{6}$/.test(s.code));}
export function sanitizeSnapshots(value:unknown):SealSnapshot[]{
 if(!Array.isArray(value))return [];
 return value.filter((v):v is SealSnapshot=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&['FUYAO','东方财富'].includes(v.source)&&finite(v.at)&&marketClock(v.at).date===v.date&&['source','observed'].includes(v.basis)&&['noon','late'].includes(v.slot)&&Array.isArray(v.stocks)&&v.stocks.length<=1000&&v.stocks.every((s:any)=>/^\d{6}$/.test(s.code)&&typeof s.name==='string'&&finite(s.boards)&&(s.seal===null||finite(s.seal))&&typeof s.isST==='boolean')).slice(-12);
}
/** Store actual browser observations only; never infer noon from a daily maximum. */
export function recordSealSnapshot(records:SealSnapshot[],data:Market|null,now:number):SealSnapshot[]{
 if(!data||!complete(data)||data.providerMode==='snapshot'||data.cached||data.tradeDate!==marketClock(now).date||assessTactics(data,now).dataIssue)return records;
 const source=sealSource(data);if(!source)return records;
 const at=data.poolTimestamp??Date.parse(data.fetchedAt),basis=data.poolTimestamp!=null?'source':'observed';
 if(!finite(at)||at>now+60000||now-at>180000||marketClock(at).date!==data.tradeDate)return records;
 const m=minute(at),slot=m>=685&&m<=695?'noon':m>=870&&m<=905?'late':null;
 if(!slot)return records;
 // Index times independently gate receipt-time samples, so a fresh HTTP response cannot relabel old quotes.
 const times=data.indices.map(q=>quoteEpoch(q.time));
 if(times.length!==4||times.some(t=>t==null||marketClock(t).date!==data.tradeDate||Math.abs(at-t)>180000))return records;
 const previous=records.find(s=>s.date===data.tradeDate&&s.source===source&&s.slot===slot);
 if(previous&&previous.at>=at)return records;
 const snapshot:SealSnapshot={date:data.tradeDate!,source,at,basis,slot,up:data.stats.up,stocks:data.stocks.map(({code,name,boards,seal,isST})=>({code,name,boards,seal:finite(seal)?seal:null,isST}))};
 return [...records.filter(s=>!(s.date===snapshot.date&&s.source===source&&s.slot===slot)),snapshot].sort((a,b)=>a.at-b.at).slice(-12);
}
export type SignalTone='risk'|'watch'|'positive'|'muted';
export function classifySeal(s:Stock,change:number|null,ratio:number|null,valid:boolean){
 const signals:{label:string;tone:SignalTone;reason:string}[]=[];
 if(change!=null&&change<=-.7)signals.push({label:'封单大幅衰减',tone:'risk',reason:`较午盘减少 ${(-change*100).toFixed(1)}%，触及 ≥70% 衰减门槛`});
 else if(change!=null&&change<=-.3)signals.push({label:'封单走弱',tone:'watch',reason:`较午盘减少 ${(-change*100).toFixed(1)}%，触及 ≥30% 衰减门槛`});
 if(ratio!=null&&ratio<.03)signals.push({label:'封单极薄',tone:'risk',reason:`封成比 ${ratio.toFixed(3)} <0.03，封单相对成交额较薄`});
 else if(ratio!=null&&ratio<.1)signals.push({label:'封单偏薄',tone:'watch',reason:`封成比 ${ratio.toFixed(3)} <0.10`});
 if(s.openTimes!=null&&s.openTimes>=3)signals.push({label:'反复开板',tone:'watch',reason:`开板 ${s.openTimes} 次；回封数量不等于回封质量`});
 if(s.turnover!=null&&s.turnover>=35)signals.push({label:'高换手',tone:'watch',reason:`换手 ${s.turnover.toFixed(1)}% ≥35%，留意分歧与承接`});
 const missing=[change==null?'午盘对照':null,ratio==null?'有效封单 / 成交额':null,s.openTimes==null?'开板次数':null,s.turnover==null?'换手率':null].filter(Boolean);
 const measured=!missing.length;
 if(!signals.length)signals.push(measured?{label:'结构相对稳定',tone:'positive',reason:'午盘衰减、封成比、开板次数和换手均未触及本站警示门槛'}:{label:'证据待补齐',tone:'muted',reason:`缺少${missing.join('、')}；现有数据未触及门槛，不认定为安全`});
 const tone:SignalTone=!valid?'muted':signals.some(s=>s.tone==='risk')?'risk':signals.some(s=>s.tone==='watch')?'watch':signals[0].tone;
 return {signals,tone,measured};
}
export function buildClosingSignals(data:Market|null,records:SealSnapshot[],now:number){
 const source=data?sealSource(data):null,valid=!!data&&complete(data)&&!assessTactics(data,now).dataIssue;
 const noon=records.find(s=>s.date===data?.tradeDate&&s.source===source&&s.slot==='noon');
 const at=data?.poolTimestamp??Date.parse(data?.fetchedAt||''),hasComparison=!!noon&&finite(at)&&at-noon.at>=30*60000&&minute(at)>=870;
 const pool=(data?.stocks||[]).filter(s=>!s.isST),highest=pool.length?Math.max(...pool.map(s=>s.boards)):0;
 const rows=pool.filter(s=>s.boards>=2).map(s=>{
  const prior=hasComparison?noon!.stocks.find(p=>p.code===s.code):undefined;
  const change=prior&&finite(prior.seal)&&prior.seal>0&&finite(s.seal)?s.seal/prior.seal-1:null;
  const ratio=finite(s.seal)&&finite(s.amount)&&s.amount>0?s.seal/s.amount:null;
  const result=classifySeal(s,valid?change:null,valid?ratio:null,valid);
  return {stock:s,prior:prior?.seal??null,change:valid?change:null,ratio:valid?ratio:null,...result};
 }).sort((a,b)=>({risk:0,watch:1,positive:2,muted:3}[a.tone]-{risk:0,watch:1,positive:2,muted:3}[b.tone])||b.stock.boards-a.stock.boards||b.stock.score-a.stock.score);
 const high=rows.filter(r=>r.stock.boards>=Math.max(2,Math.min(3,highest))),riskCount=high.filter(r=>r.tone==='risk').length;
 const disappeared=hasComparison?noon!.stocks.filter(s=>!s.isST&&s.boards>=2&&!pool.some(c=>c.code===s.code)):[];
 const growth=valid&&hasComparison&&finite(data?.stats.up)&&finite(noon!.up)?data!.stats.up!-noon!.up!:null;
 const title=!valid?'等待完整同日行情':riskCount?`${riskCount} 只高标触及核心警示`:!hasComparison?'已显示当前结构，午盘对照待补齐':'尚未发现高标核心警示';
 return {valid,source,noon,at,hasComparison,rows,high,highest,riskCount,disappeared,growth,title,divergence:growth!=null&&growth>0&&riskCount>0};
}
