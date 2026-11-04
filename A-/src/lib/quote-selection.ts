import type {Quote} from './market-types';
/** Prefer complete responses; after all failures combine whole dated quotes, never fields. */
export async function selectQuotes(codes:string[],jobs:Array<()=>Promise<{quotes:Quote[]}>>){
 const wanted=new Set(codes),partials:Quote[][]=[];
 const valid=(q:Quote)=>wanted.has(q.code.replace(/^(sh|sz|bj)/,''))&&q.price!=null&&Number.isFinite(q.price)&&q.price>0&&/^\d{14}$/.test(q.time);
 try{return await Promise.any(jobs.map(async job=>{const r=await job(),quotes=r.quotes.filter(valid);partials.push(quotes);if(new Set(quotes.map(q=>q.code.replace(/^(sh|sz|bj)/,''))).size!==wanted.size)throw Error('报价未齐');return {quotes};}));}
 catch{const merged=new Map<string,Quote>();for(const q of partials.flat()){const id=q.code.replace(/^(sh|sz|bj)/,''),old=merged.get(id);if(!old||q.time>old.time)merged.set(id,q);}if(!merged.size)throw Error('各报价通道均未返回有效数据');return {quotes:[...merged.values()]};}
}
