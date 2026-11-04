import test from 'node:test';import assert from 'node:assert/strict';
import {createMultiSourceReader,cohortGrade,firstAvailable} from '../src/lib/multi-source.ts';
import {sourceLabel} from '../src/lib/source-status.ts';
import {buildResearch} from '../src/lib/research.ts';
const now=Date.parse('2026-11-04T11:00:00+08:00');
function data(kind='public',extra={}){return {fetchedAt:new Date(now).toISOString(),servedAt:new Date(now).toISOString(),tradeDate:'2026-11-04',poolDate:'2026-11-04',poolTotal:1,poolTimestamp:kind==='fuyao'?now:null,providerMode:kind==='fuyao'?'proxy':'public',stocks:[{code:'000001',name:'测试',boards:2,price:10,isST:false,themes:['银行'],source:kind,seal:1e8,openTimes:0,score:60}],indices:['sh000001','sz399001','sz399006','sh000300'].map(code=>({code,price:10,change:1,time:'20261104110000'})),stats:{up:1,down:0,opened:0,sealRate:1,exact:[]},sectors:[],themes:[],lhb:[],lhbDate:null,hot:[],sources:[{id:kind==='fuyao'?'fuyao':'em-pool',name:kind,status:'ok',date:'2026-11-04',mode:'live'}],...extra};}
const fail=async()=>{throw new TypeError('Failed to fetch')};
test('public data renders without waiting for a hanging THS request, which is shared across refreshes',async()=>{
 let calls=0;const read=createMultiSourceReader({now:()=>now,live:()=>{calls++;return new Promise(()=>{})},snapshot:async()=>null,publicMarket:async()=>data()});
 for(let i=0;i<3;i++){const r=await read();assert.equal(r.providerMode,'public');assert.equal(r.sources[0].availability,'checking');}
 assert.equal(calls,1);
});
test('THS takes over automatically when Eastmoney is unavailable, keeping the complete THS cohort',async()=>{
 const fy=data('fuyao',{stats:{up:80,down:1,opened:20,sealRate:.8,exact:[]},research:{verified:'ths'}}),r=await createMultiSourceReader({now:()=>now,live:async()=>fy,snapshot:async()=>data(),publicMarket:fail})();
 assert.equal(r.providerMode,'proxy');assert.equal(r.stats,fy.stats);assert.equal(r.stocks,fy.stocks);assert.equal(r.research,fy.research);assert.equal(r.sources[0].availability,'active');assert.match(r.notice,/同花顺/);
});
test('blocked THS does not suppress current public data and recovery is picked up on a later refresh',async()=>{
 let calls=0,publicFail=false;const read=createMultiSourceReader({now:()=>now,live:async()=>{if(++calls===1)return fail();return data('fuyao')},snapshot:async()=>null,publicMarket:async()=>publicFail?fail():data()});
 let r=await read();assert.equal(r.providerMode,'public');assert.equal(r.sources[0].availability,'unavailable');publicFail=true;r=await read();assert.equal(r.providerMode,'proxy');assert.equal(calls,2);
});
test('misdated or future THS cohorts cannot win against verified current public data',async()=>{
 for(const extra of [{poolDate:'2026-11-03'}, {poolTimestamp:now+61000}, {sources:[{id:'fuyao',status:'ok',date:'2026-11-03'}]}]){
  const r=await createMultiSourceReader({now:()=>now,live:async()=>data('fuyao',extra),snapshot:async()=>null,publicMarket:async()=>data()})();assert.equal(r.providerMode,'public');
 }
 assert.equal(cohortGrade(data('fuyao',{poolTotal:2}),'fuyao',now),1);
 assert.equal(cohortGrade(data('fuyao',{stats:{up:1,down:0,opened:1,sealRate:.1}}),'fuyao',now),1);
});
test('both failures preserve the actual snapshot date and never mark it live',async()=>{
 const saved=data('fuyao',{fetchedAt:'2026-11-03T07:00:00Z',poolDate:'2026-11-03',tradeDate:'2026-11-03',providerMode:'snapshot'});
 const r=await createMultiSourceReader({now:()=>now,live:fail,publicMarket:fail,snapshot:async()=>saved})();assert.equal(r.providerMode,'snapshot');assert.equal(r.poolDate,'2026-11-03');assert.equal(r.fetchedAt,saved.fetchedAt);
});
test('completed THS live modules supplement public data without changing its pool, statistics or scoring source',async()=>{
 let resolve,calls=0;const fy=data('fuyao',{hot:[{code:'000001',name:'测试',rank:1,heat:100}],sources:[...data('fuyao').sources,{id:'hot',status:'ok',mode:'live',date:'2026-11-04',name:'THS实时热榜'}]});
 const pub=data('public',{hot:[],sources:[...data().sources,{id:'hot',status:'partial',mode:'snapshot',date:'2026-11-03'}]});
 const read=createMultiSourceReader({now:()=>now,live:()=>{calls++;return calls===1?new Promise(r=>resolve=r):new Promise(()=>{})},publicMarket:async()=>pub,snapshot:async()=>null});
 await read();resolve(fy);await new Promise(r=>setImmediate(r));const r=await read();assert.equal(r.providerMode,'public');assert.equal(r.stats,pub.stats);assert.equal(r.stocks,pub.stocks);assert.equal(r.hot,fy.hot);assert.equal(r.sources[0].availability,'standby');assert.match(sourceLabel(r.sources[0]),/备用可用/);
 assert.equal(buildResearch(r,{clock:{date:'2026-11-04',live:true},defensive:false,delayed:false,primary:''}).dimensions.find(d=>d.id==='breadth').source,'public');
});
test('chart and watch quote races ignore empty replies and return a valid backup',async()=>{
 assert.deepEqual(await firstAvailable([async()=>[],async()=>[1]],r=>r.length>0),[1]);assert.deepEqual(await firstAvailable([fail,async()=>[2]],r=>r.length>0),[2]);await assert.rejects(firstAvailable([fail,async()=>[]],r=>r.length>0));
});
