import test from 'node:test';import assert from 'node:assert/strict';
import {collectFuyao} from '../scripts/fuyao-data.mjs';
const key='test-only-provider-credential';
const timestamp=Date.parse('2026-11-04T03:00:00Z');
function mock({wrongDate=false,badKey=false,reset=false}={}){return async(url,options)=>{
 assert.equal(new URL(url).origin,'https://fuyao.aicubes.cn');assert.equal(options.headers['X-api-key'],key);
 if(badKey)return {code:2001,message:'rejected '+key};
 const name=new URL(url).pathname.split('/').at(-1);let data;
 if(name==='limit-up-pool')data={timestamp,pagination:{total:1,pages:1},item:[{ticker:'000001',name:'测试',continue_day_cnt:2,limit_up_reason:'机器人+融资融券',seal_money:1e7}]};
 if(name==='limit-up-statistics')data={trade_date:wrongDate?'2026-11-03':'2026-11-04',limit_up_stock_count:reset?0:1,open_stock_count:1,seal_rate:.5,exact_boards:[]};
 if(name==='limit-down-pool')data={timestamp,pagination:{total:0}};
 if(name==='dragon-tiger-list')data={trade_date:'2026-11-03',stock_items:[]};
 if(name==='hot-stock-list')data={timestamp,item:[]};
 return {code:0,data};
};}
test('server-only collector authenticates on the fixed provider and emits no credentials',async()=>{
 const r=await collectFuyao({key,transport:mock(),quotes:async()=>[],base:null});assert.equal(r.poolDate,'2026-11-04');assert.equal(r.poolTimestamp,timestamp);assert.equal(r.stocks.length,1);assert.deepEqual(r.stocks[0].themes,['机器人']);assert.equal(r.stats.sealRate,.5);assert.equal(r.stats.down,0);assert.equal(r.providerMode,'snapshot');assert.equal(JSON.stringify(r).includes(key),false);assert.deepEqual(r.indices,[]);
});
test('misaligned source dates leave statistics unknown, not zero or a blended value',async()=>{const r=await collectFuyao({key,transport:mock({wrongDate:true}),quotes:async()=>[],base:null});assert.equal(r.stats.up,null);assert.equal(r.stats.opened,null);assert.equal(r.stats.sealRate,null);});
test('rejected keys fail without echoing upstream messages or credentials',async()=>{await assert.rejects(collectFuyao({key,transport:mock({badKey:true}),quotes:async()=>[],base:null}),e=>!e.message.includes(key));});
test('pre-open reset cannot present zero breadth against a nonempty retained pool',async()=>{const r=await collectFuyao({key,transport:mock({reset:true}),quotes:async()=>[],base:null});assert.equal(r.stats.up,null);assert.equal(r.stats.down,null);assert.equal(r.stats.sealRate,null);assert.match(r.sources.find(s=>s.id==='fuyao').message,/待核实/);});
