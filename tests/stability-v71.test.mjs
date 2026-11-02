import test from 'node:test';
import assert from 'node:assert/strict';
import {collector,database,panel,read} from './helpers/runtime.mjs';
import {summarizeRuns} from '../historical.js';
const T=Date.UTC(2026,9,30);
test('one null report item no longer takes down stored diagnostics',async()=>{
 const DB=database();DB.sqlite.prepare('INSERT INTO collector_runs VALUES(?,?)').run(T,JSON.stringify([null,{symbol:'BTCUSD',httpStatus:200,candles:180,latest:T}]));
 const response=await collector.default.fetch(new Request('https://collector.test/collector-history?from='+T+'&to='+(T+300000)),{DB});assert.equal(response.status,200);const d=await response.json();assert.equal(d.malformed_reports,1);assert.equal(d.malformed_items,1);assert.equal(d.assets[0].success,1);assert.equal(d.assets[1].unknown,1);assert.equal(DB.sqlite.prepare('SELECT report FROM collector_runs').get().report.startsWith('[null,'),true);DB.sqlite.close();
});
test('malformed JSON, non-array and duplicate assets remain unknown, not healthy',()=>{
 const d=summarizeRuns([{started_at:T,report:'{broken'},{started_at:T+300000,report:'null'},{started_at:T+600000,report:JSON.stringify([{symbol:'BTCUSD',httpStatus:200,candles:180,latest:T},{symbol:'BTCUSD',httpStatus:429}])}],T,T+900000);
 assert.equal(d.malformed_reports,3);assert.equal(d.assets[0].success,0);assert.equal(d.assets[0].unknown,3);assert.equal(d.assets[1].unknown,3);
});
test('local observation rejects invalid clocks and foreign policy without a write',async()=>{
 const app=await panel();app.context.record={policy:'v7.0-observe-1',features:{},instrument:{provider:'Binance',market:'spot',quote:'USDT',symbol:'BTCUSDT',methodology:'v5.7'},reference_time:T,reference_price:100,age_ms:10000,direction:1,checks:{},blockers:[],technical_ready:false,eligible:false};
 const before=app.storage.get('radar-observations-v1');for(const expression of ['NaN','Infinity','null'])assert.throws(()=>app.run('RadarOpportunity.createRecord(record,'+expression+')'));
 app.context.record.policy='foreign';assert.throws(()=>app.run('RadarOpportunity.createRecord(record,'+(T+10000)+')'));assert.equal(app.storage.get('radar-observations-v1'),before);
});
test('scanner uses a bounded abort signal for each existing request',async()=>{
 const seen=[];const app=await panel({fetch:async(url,options)=>{if(url.includes('binance.vision'))seen.push(options.signal);throw Error('offline')}});await app.run('compareAssets()');assert.ok(seen.length>=3);assert.ok(seen.every(s=>s&&typeof s.aborted==='boolean'));assert.equal(app.get('scanRefresh').disabled,false);assert.equal(app.errors.length,0);
});
test('timeout fallback works when AbortSignal.timeout is unavailable in older Safari',async()=>{
 const app=await panel();let abort;app.context.AbortSignal={};app.context.setTimeout=fn=>{abort=fn;return 1};const signal=app.run('marketRequestSignal()');assert.equal(signal.aborted,false);abort();assert.equal(signal.aborted,true);
});

test('stored diagnostic warnings stay understandable without hiding valid assets',async()=>{
 const app=await panel();app.run(read('intelligence.js'));app.context.diagnostics=summarizeRuns([{started_at:T,report:'[null]'}],T,T+300000);app.run('RadarIntelligence.monitor(diagnostics,{providerState:"partial"})');assert.match(app.get('hiMonitorStatus').textContent,/incompleto.*isolado/);assert.match(app.get('hiMonitoring').textContent,/BTC\/USD/);
});

test('legacy status cards isolate null/object reports and never validate alignment alone',async()=>{
 const app=await panel();for(const report of ['null','{}','[null,12]','[{"symbol":"ETHUSD","aligned":false}]','[{"symbol":"BTCUSD"},{"symbol":"BTCUSD"}]']){app.context.input={last_run:{started_at:T,report}};app.run('renderCollectorStates(input)');assert.doesNotMatch(app.get('collectorStates').textContent,/Candles validados/)}
 app.context.input={last_run:{started_at:T,report:'[null,{"symbol":"BTCUSD","httpStatus":200,"latest":1800000000000,"candles":180}]'}};app.run('renderCollectorStates(input)');assert.match(app.get('collectorStates').textContent,/Candles validados/);
});

test('non-minute reference cannot create a local observation that breaks on restore',async()=>{
 const app=await panel();app.context.record={policy:'v7.0-observe-1',features:{},instrument:{provider:'Binance',market:'spot',quote:'USDT',symbol:'BTCUSDT',methodology:'v5.7'},reference_time:T+1000,reference_price:100,age_ms:10000,direction:1,checks:{},blockers:[]};assert.throws(()=>app.run('RadarOpportunity.createRecord(record,'+(T+11000)+')'));
});
