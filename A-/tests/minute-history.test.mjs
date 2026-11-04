import test from 'node:test';import assert from 'node:assert/strict';
import {tencentMinuteHistory,loadMinuteHistory} from '../src/lib/minute-history.ts';
const payload=rows=>({data:{sh000001:{data:rows}}});
test('minute normalization rejects invalid prices, dates and times and deduplicates revisions',()=>{
 const h=tencentMinuteHistory('sh000001',payload({date:'20261104',data:['0931 3600 200','0930 3599 100','0931 3601 300','0961 3602 100','0932 NaN 10','0933 0 0']}));
 assert.equal(h.date,'2026-11-04');assert.deepEqual(h.points.map(p=>[p.time,p.price]),[['09:30',3599],['09:31',3601]]);
 assert.equal(tencentMinuteHistory('sh000001',payload({data:['0930 3600 1']})).points.length,0);
});
test('failed or empty minute response uses latest dated five-day series without mixing sessions',async()=>{
 for(const empty of [true,false]){const calls=[];const h=await loadMinuteHistory('sh000001',async url=>{calls.push(url);if(url.includes('/minute/')){if(empty)return payload({date:'20261104',data:[]});throw Error('network')};return payload([{date:'20261104',data:['0930 3600 100']},{date:'20261103',data:['1500 3500 200']}]);});
 assert.equal(calls.length,2);assert.equal(h.date,'2026-11-04');assert.equal(h.points[0].price,3600);assert.match(h.source,/备用/);}
});
test('working minute response avoids extra requests and total outage never invents points',async()=>{
 let calls=0;const h=await loadMinuteHistory('sh000001',async()=>{calls++;return payload({date:'20261104',data:['0930 3600 100']})});assert.equal(calls,1);assert.match(h.source,/分时/);
 await assert.rejects(loadMinuteHistory('sh000001',async()=>payload([])),/未返回真实价格/);
});
