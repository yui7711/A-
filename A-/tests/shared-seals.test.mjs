import test from 'node:test';import assert from 'node:assert/strict';
import {createDeviceKeyStore,FUYAO_DEVICE_KEY} from '../src/lib/fuyao-key-store.ts';
import {cloudSnapshot,collectionSlot,mergeSealArchive,parseSealArchive,closingMarket} from '../src/lib/seal-archive.ts';
import {readSharedSeals,createSharedSealReader} from '../src/lib/shared-seals.ts';
import {nextOutlook} from '../src/lib/next-outlook.ts';
import {marketMethod} from '../src/lib/market-method.ts';
import {handbookTurning,referenceRotation} from '../src/lib/reference-research.ts';
import {handbookMarketData,latestHandbookMarket} from '../src/lib/handbook-market-data.ts';
import {archivedFeedback,classifyRoleEvidence,emptyPools,priorPerformance,sessionMinuteEvidence,withPreviousSnapshot} from '../src/lib/decision-proof.ts';
import {poolObservation} from '../src/lib/public-pool-evidence.ts';
import {tencentMinuteHistory} from '../src/lib/minute-history.ts';
const at=t=>Date.parse('2026-11-06T'+t+':00+08:00');
const key='sk-fuyao-test_key_only_1234567890';
const empty={version:1,generatedAt:'',records:[],runs:[]};
const stock=x=>({code:'000001',name:'测试',boards:5,seal:1e8,amount:1e9,maxSeal:1e8,openTimes:0,turnover:10,quoteDate:'20261106113000',time:'09:30',source:'东方财富 · 涨停池',isST:false,themes:['半导体'],score:80,price:10,change:10,...x});
function market(t='11:30',x={}){return {fetchedAt:new Date(at(t)).toISOString(),tradeDate:'2026-11-06',poolDate:'2026-11-06',poolTotal:1,poolTimestamp:null,stocks:[stock()],indices:['sh000001','sz399001','sz399006','sh000300'].map(code=>({code,time:'20261106'+t.replace(':','')+'00',price:100,change:1})),themes:[],sectors:[],hot:[],sources:[],lhb:[],lhbDate:null,stats:{up:1,down:0,opened:0,sealRate:1},...x};}
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('pool evidence distinguishes zero, truncated and wrong-date pools',()=>{
 const date='2026-11-06',qdate=20261106;
 const pools=poolObservation(date,{qdate,tc:1,pool:[{c:'000001',ltsz:30e8,lbt:145300}]},
  {qdate,tc:2,pool:[{c:'000002'}]},{qdate,tc:0,pool:null});
 assert.deepEqual(pools,{limitUp:{'000001':30e8},lastSeal:{'000001':893},broken:null,down:[]});
 assert.equal(poolObservation(date,null,null,{qdate:20261105,tc:0}).down,null);
});
test('minute evidence uses Tencent cumulative amount and never leaks a later bar into a selected cutoff',()=>{
 const h=tencentMinuteHistory('sz000001',{data:{sz000001:{data:{date:'20261106',data:[
  '0930 10.00 100 100000', '0931 10.02 200 200200', '0932 9.80 300 298200',
 ]}}}});
 assert.equal(h.points[1].average,10.01);
 assert.equal(sessionMinuteEvidence(h,'2026-11-06',at('09:31')).holdsAverage,true);
 assert.equal(sessionMinuteEvidence(h,'2026-11-06',at('09:32')).holdsAverage,false);
 assert.equal(sessionMinuteEvidence(h,'2026-11-05',at('09:32')),null);
 assert.equal(sessionMinuteEvidence(h,'2026-11-06',at('11:30')),null);
});
test('persisted feedback stays pinned to its archived session',()=>{
 const date='2026-11-05';
 const quotes=['20261106113000','20261106150000','20261109150000'].map(time=>({code:'sz000001',time,change:2}));
 const d=market('11:30',{research:{previousDate:date},decisionFeedback:{previousDate:date,quotes}});
 assert.deepEqual(archivedFeedback(d).map(q=>q.time),['20261106113000']);
 assert.equal(archivedFeedback({...d,research:{previousDate:'2026-11-04'}}).length,0);
});
test('same-session prior feedback never treats missing or afternoon quotes as a noon result',()=>{
 const a=stock({code:'000001',boards:2}),b=stock({code:'000002',boards:1});
 const d=market('11:30',{stocks:[stock({code:'000001',boards:3}),stock({code:'000002',boards:2})],
  poolTotal:2,stats:{up:2,down:0,opened:0,sealRate:1}});
 const p={date:d.tradeDate,at:at('11:30'),previousDate:'2026-11-05',prior:[a,b],daily:{},pools:emptyPools,
  quotes:[{code:'sz000001',time:'20261106113000',change:4},{code:'sz000002',time:'20261106150100',change:-9.1}]};
 assert.deepEqual(priorPerformance(d,p),{premium:null,largeLoss:null,promotion:1,firstPromotion:1,coverage:1,total:2});
 p.quotes[1].time='20261106113000';
 const complete=priorPerformance(d,p);
 assert.equal(complete.largeLoss,1);
 assert.ok(Math.abs(complete.premium+2.55)<1e-8);
});
test('role evidence uses genuine close and preserves missing values',()=>{
 const d=market('15:01');
 const candidate=d.stocks[0];
 const p={date:d.tradeDate,at:at('15:01'),previousDate:null,prior:[],quotes:[],pools:{...emptyPools,limitUp:{'000001':55e8}},daily:{}};
 const result=classifyRoleEvidence(candidate,d,p,'半导体');
 assert.deepEqual([result.good.length,result.bad.length],[17,12]);
 assert.equal(result.good[6].passed,false);
 assert.equal(result.good[12].passed,true);
 assert.equal(result.bad[0].passed,null);
 assert.equal(result.b,0);
 assert.equal(result.top,'见顶证据待核验');
 const previous='2026-11-05';
 const old={...d,tradeDate:previous,poolDate:previous};
 const current={...d,research:{tradeDate:d.tradeDate,previousDate:previous,previousPool:null}};
 const fallback={origin:'cloud',source:'东方财富',date:previous,slot:'late',at:Date.parse(previous+'T15:01:00+08:00'),market:old};
 assert.equal(withPreviousSnapshot(current,[fallback]).research.previousPool.total,1);
 assert.equal(withPreviousSnapshot(current,[{...fallback,slot:'noon'}]).research.previousPool,null);
});
test('reference evidence keeps unsupported checklist entries unknown and does not confirm rotation on a changed leader alone',()=>{
 const noon=cloudSnapshot(market('11:30',{stats:{up:1,down:1,opened:2,sealRate:1/3}}),'noon',at('11:30'));
 const stocks=Array.from({length:5},(_,i)=>stock({code:String(i+1).padStart(6,'0'),themes:['机器人'],boards:i===0?2:1}));
 const close=market('15:01',{stocks,poolTotal:5,stats:{up:5,down:0,opened:1,sealRate:5/6}});
 const method=marketMethod(close,at('16:00'),[noon]);
 const flags=handbookTurning(close,method);
 assert.equal(flags.length,8);
 assert.equal(flags[2].signals[0].passed,null);
 assert.equal(flags[2].signals[1].passed,true);
 const rotation=referenceRotation(close,method,[noon]);
 assert.equal(method.switched,true);
 assert.deepEqual([rotation.dead.length,rotation.born.length,rotation.final.length],[7,7,3]);
 assert.equal(rotation.born[3].passed,true);
 assert.equal(rotation.born[0].passed,null);
 assert.equal(rotation.confirmed,false);
});
test('the original thermometer receives only four fields from a validated snapshot',()=>{
 const current=market('15:01',{stats:{up:1,down:0,opened:3,sealRate:.25}});
 const snapshot=cloudSnapshot(current,'late',at('15:01'));
 const filled=handbookMarketData(snapshot);
 assert.deepEqual(filled.fields,{zt:1,high:5,lb:1,zbl:75});
 assert.equal(filled.source,'东方财富');
 assert.equal(filled.date,'2026-11-06');
 assert.equal(handbookMarketData({...snapshot,origin:'browser'}),null);
 const mismatch=handbookMarketData({...snapshot,market:{...snapshot.market,stats:{up:2,down:0,opened:0,sealRate:1}}});
 assert.equal(mismatch.fields.high,null);
 assert.equal(mismatch.fields.lb,null);
 const partial={...snapshot,source:'FUYAO',market:{...snapshot.market,stats:{up:2,down:0,opened:0,sealRate:1}}};
 assert.equal(latestHandbookMarket([partial,snapshot],'2026-11-06').source,'东方财富');
});
test('method compares an earlier same-source cohort and distinguishes a candidate rotation from a missing baseline',()=>{
 const morning=market('11:30',{stats:{up:1,down:0,opened:3,sealRate:.25}});
 const noon=cloudSnapshot(morning,'noon',at('11:30'));
 assert.ok(noon);
 const stocks=Array.from({length:5},(_,i)=>stock({code:String(i+1).padStart(6,'0'),themes:['机器人'],boards:i===0?2:1}));
 const close=market('15:01',{stocks,poolTotal:5,stats:{up:5,down:0,opened:1,sealRate:5/6}});
 const result=marketMethod(close,at('16:00'),[noon]);
 assert.equal(result.baseline,noon);
 assert.equal(result.improves,true);
 assert.equal(result.switchCandidate,true);
 assert.equal(marketMethod(close,at('16:00'),[{...noon,source:'FUYAO'}]).baseline,null);
 assert.equal(marketMethod({...close,cached:true},at('16:00'),[noon]).switchCandidate,false);
});
test('device key survives a new store instance and can be explicitly removed',()=>{const storage=memory();createDeviceKeyStore(storage).save(key);assert.equal(createDeviceKeyStore(storage).read(),key);assert.equal(storage.getItem(FUYAO_DEVICE_KEY),key);createDeviceKeyStore(storage).clear();assert.equal(createDeviceKeyStore(storage).read(),null);});
test('malformed keys are neither accepted nor restored; denied storage has a clear failure',()=>{const s=memory();assert.throws(()=>createDeviceKeyStore(s).save('bad'));s.setItem(FUYAO_DEVICE_KEY,'invalid');assert.equal(createDeviceKeyStore(s).read(),null);const denied=createDeviceKeyStore({getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}});assert.equal(denied.read(),null);assert.throws(()=>denied.save(key),/禁止保存/);});
test('background captures complete same-day source cohorts without any browser state',()=>{const noon=cloudSnapshot(market(),'noon',at('11:30'));assert.equal(noon.origin,'cloud');assert.equal(noon.market.stocks.length,1);assert.equal(cloudSnapshot(market('15:01'),'late',at('15:01')).slot,'late');assert.equal(cloudSnapshot(market('15:01'),'noon',at('15:01')),null);});
test('background collection rejects stale dates, incomplete indices, missing pool rows and morning-as-close',()=>{for(const patch of [{tradeDate:'2026-11-05'},{poolTotal:2},{indices:[]}])assert.equal(cloudSnapshot(market('11:30',patch),'noon',at('11:30')),null);assert.equal(cloudSnapshot(market('11:30'),'late',at('18:00')),null);});
test('scheduler delay during lunch preserves actual receipt time, without manufacturing an 11:30 pool timestamp',()=>{const d=market('11:30');d.fetchedAt=new Date(at('12:05')).toISOString();const s=cloudSnapshot(d,'noon',at('12:05'));assert.equal(s.at,at('12:05'));assert.equal(s.basis,'observed');assert.equal(cloudSnapshot(market('13:15'),'noon',at('13:15')),null);});
test('archive writes retain noon when close arrives and never replace newer observations with older ones',()=>{const noon=cloudSnapshot(market(),'noon',at('11:30')),late=cloudSnapshot(market('15:01'),'late',at('15:01'));let a=mergeSealArchive(empty,[noon],{at:'a'});a=mergeSealArchive(a,[late],{at:'b'});a=mergeSealArchive(a,[{...late,at:at('15:00')}],{at:'c'});assert.equal(a.records.length,2);assert.equal(a.records.find(s=>s.slot==='late').at,at('15:01'));assert.equal(parseSealArchive(a).records.length,2);});
test('new devices receive a fixed cloud close; a prior-day pair remains explicitly historical',()=>{const late=cloudSnapshot(market('15:01'),'late',at('15:01'));const v=closingMarket(null,[late],at('18:00'));assert.equal(v.cloud,true);assert.equal(v.historical,false);const tomorrow=closingMarket(null,[late],at('18:00')+86400000);assert.equal(tomorrow.historical,true);assert.equal(tomorrow.date,'2026-11-06');});
test('live intraday cohorts remain live rather than being replaced by yesterday cloud close',()=>{const late=cloudSnapshot(market('15:01'),'late',at('15:01'));const d=market('14:00');assert.equal(closingMarket(d,[late],at('14:00')).cloud,false);});
test('shared reader chooses newer archive, never sends keys or cross-origin cookies, and tolerates one failed host',async()=>{const seen=[];const a={...empty,generatedAt:'2026-11-06T07:00:00Z'};const result=await readSharedSeals(async(url,init)=>{seen.push({url,init});if(url.includes('github.io'))return new Response('fail',{status:503});return new Response(JSON.stringify(a));});assert.equal(result.generatedAt,a.generatedAt);assert.ok(seen.every(s=>s.init.credentials==='omit'&&!s.url.includes(key)&&!new Headers(s.init.headers).has('X-api-key')&&!new Headers(s.init.headers).has('Authorization')));});
test('forecast suspends without effective evidence and exposes exact basis when serious risk exists',()=>{assert.match(nextOutlook(null,[],at('18:00')).title,/暂停预测/);const d=market('15:01');d.indices=d.indices.map(q=>({...q,change:-3}));const r=nextOutlook(d,[],at('18:00'));assert.match(r.title,/偏弱延续/);assert.equal(r.strength,'有限');assert.ok(r.basis.some(s=>s.includes('-3.00')));assert.match(r.worse,/失效/);});
test('forecast offers conditional repair without inventing a calibrated win probability',()=>{const d=market('15:01',{poolTotal:80,stocks:Array.from({length:80},(_,i)=>stock({code:String(i+1).padStart(6,'0')})),stats:{up:80,down:0,opened:5,sealRate:80/85}});const r=nextOutlook(d,[],at('18:00'));assert.match(r.title,/修复观察/);assert.equal('probability' in r,false);assert.equal('winRate' in r,false);});

test('version API supplies newer data than stale raw branches and is bounded to five-minute lookups',async()=>{let time=Date.parse('2026-11-06T10:30:00Z'),calls=0;const reader=createSharedSealReader(async(url,init)=>{const api=url.includes('api.github.com');if(api){calls++;assert.equal(new Headers(init.headers).get('Accept'),'application/vnd.github.raw+json');}return new Response(JSON.stringify({...empty,generatedAt:api?'2026-11-06T10:29:00Z':'2026-11-06T10:12:00Z'}));},()=>time);assert.equal((await reader()).generatedAt,'2026-11-06T10:29:00Z');time+=60000;assert.equal((await reader()).generatedAt,'2026-11-06T10:29:00Z');assert.equal(calls,1);time+=300000;await reader();assert.equal(calls,2);});
