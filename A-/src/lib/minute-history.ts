import type {History} from './market-types';
export function tencentMinuteHistory(code:string,payload:any,fiveDays=false):History{
 const raw=payload?.data?.[code]?.data;
 const day=fiveDays?(Array.isArray(raw)?raw.filter(x=>/^\d{8}$/.test(String(x.date))&&Array.isArray(x.data)).sort((a,b)=>String(a.date).localeCompare(String(b.date))).at(-1):null):raw;
 const date=String(day?.date||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
 const points=new Map<string,History['points'][number]>();
 if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Array.isArray(day?.data))for(const row of day.data){
  const f=String(row).trim().split(/\s+/),price=Number(f[1]),volume=Number(f[2]);
  if(!/^(?:[01]\d|2[0-3])[0-5]\d$/.test(f[0])||!Number.isFinite(price)||price<=0)continue;
  const time=f[0].slice(0,2)+':'+f[0].slice(2);points.set(time,{time,price,volume:f[2]!==undefined&&Number.isFinite(volume)&&volume>=0?volume:undefined});
  const amount=Number(f[3]);
  const average=volume>0&&amount>0?amount/(volume*100):NaN;
  if(Number.isFinite(average)&&average>=price*.5&&average<=price*1.5)points.get(time)!.average=average;
 }
 return {code,name:code,date:points.size?date:null,source:fiveDays?'腾讯 · 五日分时备用':'腾讯 · 分时',points:[...points.values()].sort((a,b)=>a.time.localeCompare(b.time))};
}

export async function loadDatedMinuteHistory(code:string,date:string,json:(url:string)=>Promise<any>){
 for(const mode of ['minute','day'])try{
  const payload=await json('https://web.ifzq.gtimg.cn/appstock/app/'+mode+'/query?code='+code);
  if(mode==='day'){
   const symbol=payload?.data?.[code];
   const day=Array.isArray(symbol?.data)?symbol.data.find((x:any)=>String(x.date)===date.replaceAll('-','')):null;
   if(!day)continue;
   const h=tencentMinuteHistory(code,{data:{[code]:{data:day}}});
   if(h.points.length)return h;
  }else{
   const h=tencentMinuteHistory(code,payload);
   if(h.date===date&&h.points.length)return h;
  }
 }catch{/* A date mismatch never becomes evidence. */}
 return null;
}
export async function loadMinuteHistory(code:string,json:(url:string)=>Promise<any>):Promise<History>{
 for(const fiveDays of [false,true])try{
  const j=await json('https://web.ifzq.gtimg.cn/appstock/app/'+(fiveDays?'day':'minute')+'/query?code='+code);
  const h=tencentMinuteHistory(code,j,fiveDays);if(h.points.length)return h;
 }catch{/* Try the independent five-day response; never create synthetic prices. */}
 throw Error('腾讯分时与五日备用均未返回真实价格');
}
