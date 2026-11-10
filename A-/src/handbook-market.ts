import {latestHandbookMarket} from './lib/handbook-market-data';
import {readSharedSeals} from './lib/shared-seals';
import {marketClock} from './lib/tactics';

let running=false;
let checked=0;
const send=(body:object)=>window.parent.postMessage({kind:'obsidian-handbook-market',...body},location.origin);

window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent||event.data?.kind!=='obsidian-handbook-request'||running)return;
 if(event.data.force!==true&&Date.now()-checked<30000)return;
 running=true;
 void refresh().finally(()=>{checked=Date.now();running=false;});
});

async function refresh(){
 try{
  const archive=await readSharedSeals();
  const market=latestHandbookMarket(archive.records,marketClock().date);
  if(market)send({market});
  else send({error:'暂无有效行情快照，可手动填写。'});
 }catch{
  send({error:'快照暂未取到，保留手动填写并自动重试。'});
 }
}

send({ready:true});
