import test from 'node:test';import assert from 'node:assert/strict';
import {mergePublicFields} from '../src/lib/live-enrichment.ts';
import {mapPool} from '../src/lib/market-core.ts';
const data=()=>({poolDate:'2026-11-03',fetchedAt:'2026-11-03T07:00:00Z',stocks:[mapPool({ticker:'002086',name:'测试',continue_day_cnt:2,open_times:null})]});
test('public fields preserve reported zero openings and never alter the pool time or existing statistics',()=>{const d=data(),r=mergePublicFields(d,{data:{qdate:20261103,pool:[{c:'002086',zbc:0,hs:12}]}});assert.equal(r.stocks[0].openTimes,0);assert.equal(r.stocks[0].turnover,12);assert.equal(r.fetchedAt,d.fetchedAt);assert.ok(r.stocks[0].coverage>d.stocks[0].coverage);});
test('yesterday fields cannot fill today data and existing known values are not overwritten',()=>{const d=data();assert.equal(mergePublicFields(d,{data:{qdate:20261102,pool:[{c:'002086',zbc:5}]}}),d);d.stocks[0].openTimes=0;d.stocks[0].turnover=8;assert.equal(mergePublicFields(d,{data:{qdate:20261103,pool:[{c:'002086',zbc:5,hs:18}]}}),d);});
