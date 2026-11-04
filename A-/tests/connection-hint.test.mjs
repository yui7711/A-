import test from 'node:test';import assert from 'node:assert/strict';
import {connectionHint} from '../src/lib/connection-hint.ts';
import {readLiveMarket} from '../src/lib/live-reader.ts';
test('connection hints distinguish server reachability from API key validity and redact raw messages',()=>{
 assert.match(connectionHint({status:403}),/服务端访问受限/);assert.match(connectionHint({status:502}),/HTTP 502/);
 assert.match(connectionHint({status:429}),/限流/);assert.match(connectionHint(Error('超时')),/连接超时/);
 assert.match(connectionHint(new TypeError('Failed to fetch')),/尚未验证/);assert.doesNotMatch(connectionHint(Error('private request credential')),/private|credential/);
});
test('fallback displays why the live request failed and the next successful request removes that warning',async()=>{
 const snapshot={fetchedAt:'2026-11-04T02:00:00Z',poolDate:'2026-11-04',tradeDate:'2026-11-04',stocks:[{code:'000001'}],indices:[],stats:{up:1},themes:[],sectors:[],lhb:[],hot:[],sources:[{id:'fuyao',status:'ok',message:'已连接'}]};
 let calls=0;const reader={live:async()=>{if(++calls===1)throw Object.assign(Error('private'),{status:502});return snapshot},snapshot:async()=>snapshot,publicMarket:async()=>{throw Error('network')}};
 const failed=await readLiveMarket(false,reader);assert.match(failed.notice,/HTTP 502/);assert.match(failed.sources[0].message,/HTTP 502/);assert.equal(failed.providerMode,'snapshot');
 const recovered=await readLiveMarket(false,reader);assert.equal(recovered.providerMode,'proxy');assert.doesNotMatch(recovered.notice,/HTTP 502/);
});
