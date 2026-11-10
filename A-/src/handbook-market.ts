import {requestJSON} from './lib/client-request';
import {restoreFuyaoDirect} from './lib/fuyao-direct';
import {handbookMarketData} from './lib/handbook-market-data';
import type {Market,Quote} from './lib/market-types';

let running=false;
let quoteCache:{key:string;checked:number;quotes:Quote[]}|null=null;
const send=(body:object)=>window.parent.postMessage({kind:'obsidian-handbook-market',...body},location.origin);
void restoreFuyaoDirect();

window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent||event.data?.kind!=='obsidian-handbook-request'||running)return;
 running=true;
 void refresh(event.data.force===true).finally(()=>{running=false;});
});

async function refresh(force:boolean){
 try{
  const data=await requestJSON<Market>('/api/market'+(force?'?fresh=1':''));
  const initial=handbookMarketData(data,Date.now());
  const key=[initial.date,initial.previousDate,...initial.previousCodes].join('/');
  send({market:quoteCache?.key===key?handbookMarketData(data,Date.now(),quoteCache.quotes):initial});
  if(!initial.previousCodes.length||quoteCache?.key===key&&Date.now()-quoteCache.checked<45000)return;
  const groups=[];
  for(let i=0;i<initial.previousCodes.length;i+=35)groups.push(initial.previousCodes.slice(i,i+35));
  const responses=await Promise.allSettled(groups.map(group=>requestJSON<{quotes:Quote[]}>('/api/quotes?codes='+group.join(','),{},{timeoutMs:9000})));
  const quotes=responses.flatMap(r=>r.status==='fulfilled'?r.value.quotes:[]);
  quoteCache={key,checked:Date.now(),quotes};
  send({market:handbookMarketData(data,Date.now(),quotes)});
 }catch{
  send({error:'行情暂未取到，保留手动填写并自动重试。'});
 }
}

send({ready:true});
