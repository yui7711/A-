import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {collectHistoricalPools} from './history-data.mjs';
const key=process.env.FUYAO_API_KEY||'',file=new URL('../public/data/history.json',import.meta.url);
try{
 if(!key)throw Error('历史采集凭证未配置');
 const fy=async path=>{const r=await fetch('https://fuyao.aicubes.cn/api/'+path,{headers:{'X-api-key':key},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('历史源不可用');const j=await r.json();if(j.code!==0)throw Error('历史源不可用');return j.data;};
 const archive=await collectHistoricalPools({fy});const text=JSON.stringify(archive);if(text.includes(key))throw Error('凭证不得写入公开文件');
 await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});await writeFile(file,text);console.log(JSON.stringify({historicalDates:archive.pools.map(p=>p.date),counts:archive.pools.map(p=>p.total)}));
}catch{
 const old=await readFile(file,'utf8').then(JSON.parse).catch(()=>null);
 if(old?.pools?.length)console.warn('历史源暂不可用，保留原日期的已核实公开历史名单。');
 else throw Error('没有可发布的完整历史名单；未回显密钥或上游响应。');
}
