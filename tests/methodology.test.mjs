import test from 'node:test';
import assert from 'node:assert/strict';
import {collector,database,panel,read} from './helpers/runtime.mjs';
import '../statistics.js';
const {versionOf,summarize}=globalThis.RadarStatistics;
const now=1800000010000,end=Math.floor(now/60000)*60000;
// Oscillating history ending in moderate upward momentum, not an overbought trend.
const raw=()=>Array.from({length:180},(_,i)=>[(end-(180-i)*60000)/1000,90,110,100,100+Math.sin(i/4),1]);
const binance=rows=>rows.map(x=>[x[0]*1000,x[3],x[2],x[1],x[4],x[5]]);
function seed(DB){
 DB.sqlite.prepare('INSERT INTO observations(symbol,time,reference_price,direction) VALUES(?,?,?,?)').run('BTCUSD',end-5*60000,100,-1);
 DB.sqlite.prepare('INSERT INTO results VALUES(?,?,?,?)').run('BTCUSD',end-5*60000,1,0.125);
 DB.sqlite.prepare('INSERT INTO collector_runs VALUES(?,?)').run(now-300000,'[{"version":"5.6"}]');
}
function original(DB){return {observations:DB.sqlite.prepare('SELECT symbol,time,reference_price,direction FROM observations ORDER BY symbol,time').all(),results:DB.sqlite.prepare('SELECT * FROM results ORDER BY symbol,time,horizon').all(),runs:DB.sqlite.prepare('SELECT * FROM collector_runs ORDER BY started_at').all()}}
test('migração aditiva preserva todas as linhas, chaves e valores antigos',()=>{
 const DB=database({legacy:true});try{
  seed(DB);const before=original(DB);DB.sqlite.exec(read('migrations/0001_methodology_v57.sql'));
  assert.deepEqual(original(DB),before);assert.equal(DB.sqlite.prepare('SELECT methodology_version FROM observations').get().methodology_version,null);
  assert.equal(DB.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(()=>DB.sqlite.exec(read('migrations/0001_methodology_v57.sql')),/duplicate column/);
  assert.deepEqual(original(DB),before);
 }finally{DB.sqlite.close()}
});
test('rollback de aplicação v5.6 mantém coluna e permite inserts legados',async()=>{
 const DB=database({legacy:true});try{
  seed(DB);DB.sqlite.exec(read('migrations/0001_methodology_v57.sql'));
  // Original code's exact observation INSERT remains supported; no DROP COLUMN.
  DB.sqlite.prepare('INSERT OR IGNORE INTO observations(symbol,time,reference_price,direction) VALUES(?,?,?,?)').run('ETHUSD',end,100,1);
  assert.equal(DB.sqlite.prepare("SELECT methodology_version FROM observations WHERE symbol='ETHUSD'").get().methodology_version,null);
  assert.equal(await collector.methodologyReady({DB}),true);
 }finally{DB.sqlite.close()}
});
test('coletor não grava observações sem migração e API antiga é legível',async t=>{
 const DB=database({legacy:true});t.after(()=>DB.sqlite.close());seed(DB);const before=original(DB);
 t.mock.method(Date,'now',()=>now);t.mock.method(console,'error',()=>{});
 t.mock.method(globalThis,'fetch',async()=>{throw Error('Não deve consultar antes da migração')});
 const report=await collector.collect({DB});assert.ok(report.every(x=>x.code==='METHODOLOGY_MIGRATION_REQUIRED'));
 assert.deepEqual(DB.sqlite.prepare('SELECT * FROM results').all(),before.results);
 assert.deepEqual(DB.sqlite.prepare('SELECT * FROM observations').all(),before.observations);
 const response=await collector.default.fetch(new Request('https://test/observations'),{DB});const json=await response.json();
 assert.equal(json.methodologyReady,false);assert.equal(json.observations[0].methodology_version,null);
});
test('painel e coletor executam o mesmo cálculo com os mesmos candles',async t=>{
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>Response.json(raw()));
 const DB=database();t.after(()=>DB.sqlite.close());const app=await panel();
 app.context.input=binance(raw());const scanner=app.run('analyzeScannerCandles(input,Date.now())');
 const report=await collector.collect({DB});
 for(const item of report){for(const k of ['ema9','ema21','rsi14'])assert.equal(item[k],scanner[k]);assert.equal(item.aligned,scanner.aligned);assert.equal(item.direction,scanner.direction)}
 // Chart, scalar panel displays and laboratory all consume real shared functions.
 app.context.closed=scanner.rows;
 assert.equal(app.run('ema(closed.map(x=>x.close),9)'),scanner.ema9);
 assert.equal(app.run('rsi(closed.map(x=>x.close))'),scanner.rsi14);
 assert.equal(app.run('indicatorSeries(closed).ema21.at(-1)'),scanner.ema21);
 assert.equal(app.run('emaPoints(closed,9).at(-1).value'),scanner.ema9);
});
test('scanner rejeita atraso, lacunas e preços inválidos, e descarta candle aberto',async()=>{
 const app=await panel();app.context.input=binance(raw());
 const initial=app.run('analyzeScannerCandles(input,Date.now())');
 app.context.input.push([end,100,110,90,100000,1]);
 assert.equal(app.run('analyzeScannerCandles(input,Date.now()).ema9'),initial.ema9);
 app.context.input=binance(raw().map(x=>[x[0]-180,...x.slice(1)]));assert.throws(()=>app.run('analyzeScannerCandles(input,Date.now())'),/desatualizada/);
 app.context.input=binance(raw());app.context.input.splice(10,1);assert.throws(()=>app.run('analyzeScannerCandles(input,Date.now())'),/ausentes/);
 app.context.input=binance(raw());app.context.input[30][4]='bad';assert.throws(()=>app.run('analyzeScannerCandles(input,Date.now())'),/inválido/);
});
test('nova observação persiste v5.7; resultado legado conserva origem e valor',async t=>{
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>Response.json(raw()));
 const DB=database({legacy:true});t.after(()=>DB.sqlite.close());seed(DB);DB.sqlite.exec(read('migrations/0001_methodology_v57.sql'));
 const report=await collector.collect({DB});assert.ok(report.every(x=>!x.error));
 const fresh=DB.sqlite.prepare('SELECT * FROM observations WHERE time=?').all(end);
 assert.equal(fresh.length,3);assert.ok(fresh.every(x=>x.methodology_version==='v5.7'));
 const legacy=DB.sqlite.prepare('SELECT * FROM observations WHERE time=?').get(end-5*60000);assert.equal(legacy.methodology_version,null);assert.equal(legacy.direction,-1);
 assert.equal(DB.sqlite.prepare('SELECT directional_pct FROM results WHERE time=? AND horizon=1').get(end-5*60000).directional_pct,0.125);
 const data=await (await collector.default.fetch(new Request('https://test/observations'),{DB})).json();
 assert.equal(data.observations.filter(x=>x.time===end-5*60000).length,3);assert.ok(data.observations.filter(x=>x.time===end-5*60000).every(x=>x.methodology_version===null));
 // Rerun at a new clock tick: no duplicate observations, no overwritten outcomes.
 t.mock.method(Date,'now',()=>now+1);await collector.collect({DB});
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM observations').get().n,4);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM results').get().n,3);
});
test('estatísticas não misturam versões e excluem sobreposição por grupo',()=>{
 const rows=[{symbol:'BTCUSD',time:end,horizon:3,directional_pct:1,methodology_version:null},{symbol:'BTCUSD',time:end,horizon:3,directional_pct:10,methodology_version:'v5.7'},{symbol:'BTCUSD',time:end+60000,horizon:3,directional_pct:100,methodology_version:'v5.7'},{symbol:'BTCUSD',time:end+180000,horizon:3,directional_pct:20,methodology_version:'v5.7'}];
 const old=summarize(rows,{symbol:'BTCUSD',horizon:3,methodology:'legacy-unversioned'}),fresh=summarize(rows,{symbol:'BTCUSD',horizon:3,methodology:'v5.7'});
 assert.equal(old.n,1);assert.equal(old.mean,0.8);assert.equal(fresh.n,2);assert.equal(fresh.total,3);assert.equal(fresh.mean,14.8);assert.equal(fresh.median,14.8);assert.equal(fresh.insufficient,true);
 assert.equal(versionOf({}), 'legacy-unversioned');
});
test('API limita observações antes do JOIN e preserva todos os horizontes',async()=>{
 const DB=database();try{
  for(let i=0;i<181;i++){
   const time=end-i*60000;DB.sqlite.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').run('BTCUSD',time,100,1,i%2?'v5.7':null);
   for(const h of [1,3,5])DB.sqlite.prepare('INSERT INTO results VALUES(?,?,?,?)').run('BTCUSD',time,h,0.1);
  }
  const data=await (await collector.default.fetch(new Request('https://test/observations'),{DB})).json();
  assert.equal(data.observations.length,540);assert.equal(new Set(data.observations.map(x=>x.time)).size,180);
  const groups=Map.groupBy(data.observations,x=>x.time);for(const rows of groups.values())assert.deepEqual(rows.map(x=>x.horizon),[1,3,5]);
 }finally{DB.sqlite.close()}
});
test('diário local preserva legados, novos são versionados e estatísticas usam só v5.7',async()=>{
 const legacy={symbol:'BTCUSDT',time:end-600000,entry:100,direction:1,results:{1:99,3:99,5:99}};
 const app=await panel({stored:[legacy],fetch:async url=>String(url).includes('binance')?Response.json(binance(raw())):Response.json({observations:[],checks:[]})});
 await app.run('compareAssets()');
 const stored=JSON.parse(app.storage.get('radar-observations-v1'));
 assert.deepEqual(stored.find(x=>x.time===legacy.time),legacy);
 assert.ok(stored.some(x=>x.methodology_version==='v5.7'));
 assert.match(app.get('scanJournal').textContent,/Anterior — versão não comprovada/);
 assert.match(app.get('scanJournalStatus').textContent,/v5.7: 3; anteriores\/outras versões: 1/);
 assert.doesNotMatch(app.get('scanStats').textContent,/98\.800/);
 assert.equal(app.run('methodologyJournal().length'),3);
});
test('painel remoto rotula versões, amostra pequena e horário, sem agregar versões',async()=>{
 const app=await panel();
 app.context.remote={at:now,methodologyReady:true,observations:[{symbol:'BTCUSD',time:end-60000,horizon:1,directional_pct:1,methodology_version:null},{symbol:'BTCUSD',time:end,horizon:1,directional_pct:10,methodology_version:'v5.7'}]};
 app.context.fetch=async()=>Response.json(app.context.remote);await app.run('refreshCloudCollector()');
 const text=app.get('cloudHorizonResults').textContent;
 assert.match(text,/Anterior — versão não comprovada/);assert.match(text,/v5.7/);assert.match(text,/0\.8000%/);assert.match(text,/9\.8000%/);assert.match(text,/amostra insuficiente/);assert.doesNotMatch(text,/5\.3000%/);
 assert.match(app.get('cloudUpdated').textContent,/Consulta:/);assert.match(app.get('cloudCollectorBoard').textContent,/BTC\/USD/);
});
