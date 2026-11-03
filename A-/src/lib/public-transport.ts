/** Providers serve JSON with both JSON and JavaScript MIME types. Parse data, never evaluate it. */
export async function fetchPublicJSON(url:string,options:{method?:string;body?:string}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
 try{
  const r=await fetch(url,{method:options.method,body:options.body,headers:options.body?{'Content-Type':'application/json'}:undefined,credentials:'omit',cache:'no-store',signal:controller.signal});
  if(!r.ok)throw new Error('公开数据源 HTTP '+r.status);
  const text=await r.text();
  try{return JSON.parse(text);}catch{throw new Error('公开数据源未返回有效 JSON');}
 }finally{clearTimeout(timer);}
}
