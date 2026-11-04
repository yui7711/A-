import test from 'node:test';import assert from 'node:assert/strict';
import {getDataRoute,getRefreshPreferences,DATA_ROUTE_KEY,PUBLIC_DEFAULTS_KEY} from '../src/lib/connection-preferences.ts';
const reader=values=>key=>values[key]===undefined?null:JSON.stringify(values[key]);
test('new browsers and legacy saved routes default to public without manual setup',()=>{
 for(const values of [{},{'obsidian-data-route-v1':'auto'},{'obsidian-data-route-v1':'public'}])assert.equal(getDataRoute(reader(values)),'public');
 assert.equal(getDataRoute(()=>{throw Error('Storage blocked')}),'public');assert.equal(getDataRoute(()=>'{bad'),'public');
});
test('a deliberate choice made after migration is respected',()=>{
 assert.equal(getDataRoute(reader({[DATA_ROUTE_KEY]:'auto'})),'auto');assert.equal(getDataRoute(reader({[DATA_ROUTE_KEY]:'public'})),'public');
});
test('new and migrated browsers automatically poll every five seconds even if an old setting paused polling',()=>{
 assert.deepEqual(getRefreshPreferences(),{auto:true,intervalSec:5});assert.deepEqual(getRefreshPreferences(reader({'obsidian-auto':false,'obsidian-interval':300})),{auto:true,intervalSec:5});
 assert.deepEqual(getRefreshPreferences(()=>{throw Error('Storage blocked')}),{auto:true,intervalSec:5});
});
test('subsequent explicit refresh preferences remain editable',()=>{
 assert.deepEqual(getRefreshPreferences(reader({[PUBLIC_DEFAULTS_KEY]:true,'obsidian-auto':false,'obsidian-interval':10})),{auto:false,intervalSec:10});
});
