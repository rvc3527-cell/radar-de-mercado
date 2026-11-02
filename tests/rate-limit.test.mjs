import test from 'node:test';
import assert from 'node:assert/strict';
import {read,collectorSource,database} from './helpers/runtime.mjs';
const source=collectorSource.replace("'./indicators.js'",JSON.stringify(new URL('../indicators.js',import.meta.url).href)).replace("'./historical.js'",JSON.stringify(new URL('../historical.js',import.meta.url).href));
const C=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {collect,healthData,retryAfterUntil,cooldownUntil};').toString('base64'));
const base=1800000010000,end=Math.floor(base/60000)*60000;
const candles=(at=base)=>Array.from({length:180},(_,i)=>[(Math.floor(at/60000)*60000-(180-i)*60000)/1000,90,110,100,100+Math.sin(i/4),1]);
function fixture(t,fetcher){const DB=database();t.after(()=>DB.sqlite.close());let now=base;t.mock.method(Date,'now',()=>now);t.mock.method(console,'error',()=>{});let calls=0;t.mock.method(globalThis,'fetch',async(...args)=>{calls++;return fetcher(...args)});return {DB,setTime:v=>now=v,get calls(){return calls},state:()=>JSON.parse(DB.sqlite.prepare('SELECT state FROM collector_control').get().state)}}
const run=DB=>C.collect({DB},{pause:async()=>{}});
const error=(status,headers={})=>Response.json({message:'provider '+status},{status,headers});
test('200: dados válidos e indicadores consistentes; slots não duplicam requisições',async t=>{
 const f=fixture(t,async()=>Response.json(candles()));const first=await run(f.DB);assert.equal(f.calls,3);assert.ok(first.every(x=>x.methodology_version==='v5.7'&&Number.isFinite(x.rsi14)));
 const again=await run(f.DB);assert.equal(again[0].code,'COLLECTION_SKIPPED');assert.equal(f.calls,3);assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM collector_runs').get().n,1);
 assert.equal((await C.healthData({DB:f.DB})).providerState,'operational');
});
test('400 em um ativo não bloqueia outros; health mostra parcial e contabiliza erro',async t=>{
 const f=fixture(t,async url=>url.pathname.includes('BTC')?error(400):Response.json(candles()));await run(f.DB);
 const h=await C.healthData({DB:f.DB});assert.equal(h.providerState,'partial');assert.equal(h.ok,false);assert.equal(h.workerOk,true);assert.equal(h.assets[0].http400,1);assert.equal(h.assets[1].lastSuccessAt,base);assert.equal(f.calls,3);
});
test('todos falham em rede: banco acessível não significa fonte saudável',async t=>{
 const f=fixture(t,async()=>{throw Error('network')});await run(f.DB);const h=await C.healthData({DB:f.DB});assert.equal(h.providerState,'unavailable');assert.equal(h.ok,false);assert.equal(h.database,true);assert.ok(h.assets.every(x=>x.networkErrors===1));
});
test('429 com Retry-After impede chamadas aos outros ativos e persiste cooldown',async t=>{
 const f=fixture(t,async()=>error(429,{'retry-after':'900'}));const r=await run(f.DB);assert.equal(f.calls,1);assert.equal(r[0].cooldownUntil,base+900000);assert.ok(r.slice(1).every(x=>x.deferred));
 const h=await C.healthData({DB:f.DB});assert.equal(h.providerState,'cooldown');assert.equal(h.cooldownUntil,base+900000);assert.equal(h.assets[0].http429,1);
});
test('Retry-After aceita segundos/data HTTP e rejeita valores inválidos sem overflow',()=>{
 assert.equal(C.retryAfterUntil('120',base),base+120000);
 const date=new Date(base+600000).toUTCString();assert.equal(C.retryAfterUntil(date,base),Math.floor((base+600000)/1000)*1000);
 for(const v of [null,'','-1','1.5','999999999999999999999','yesterday'])assert.equal(C.retryAfterUntil(v,base),null);
 assert.equal(C.cooldownUntil('0',base,1),base+60000);
});
test('429 sem cabeçalho usa espera progressiva limitada, sem sleep longo',()=>{
 assert.equal(C.cooldownUntil(null,base,1),base+300000);assert.equal(C.cooldownUntil(null,base,2),base+600000);assert.equal(C.cooldownUntil(null,base,99),base+3600000);
});
test('cooldown ativo sobrevive nova chamada/novo slot sem consultar Coinbase',async t=>{
 const f=fixture(t,async()=>error(429,{'retry-after':'900'}));await run(f.DB);f.setTime(base+300001);const r=await run(f.DB);
 assert.equal(f.calls,1);assert.ok(r.every(x=>x.code==='COOLDOWN'));assert.equal(f.state().assets.BTCUSD.http429,1);
});
test('recuperação após cooldown encerrado registra observações e retorna operacional',async t=>{
 let limited=true,at=base;const f=fixture(t,async()=>limited?error(429,{'retry-after':'120'}):Response.json(candles(at)));
 await run(f.DB);limited=false;at=base+300001;f.setTime(at);await run(f.DB);
 const h=await C.healthData({DB:f.DB});assert.equal(f.calls,4);assert.equal(h.providerState,'operational');assert.ok(h.assets.every(x=>x.lastSuccessAt===at&&x.lastError===null));assert.equal(f.state().consecutive429,0);
});
test('ausência de candles recentes não cria observações atuais',async t=>{
 const f=fixture(t,async()=>Response.json(candles(base-600000)));await run(f.DB);const h=await C.healthData({DB:f.DB});assert.equal(h.ok,false);assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM observations').get().n,0);
});
test('fonte passa a stale quando a última atualização válida envelhece',async t=>{
 const f=fixture(t,async()=>Response.json(candles()));await run(f.DB);f.setTime(base+700000);const h=await C.healthData({DB:f.DB});assert.equal(h.providerState,'stale');assert.equal(h.scheduleDelayed,true);assert.ok(h.assets.every(x=>x.ageSeconds>=700));
});
test('duas execuções concorrentes: somente a dona da lease consulta o provedor',async t=>{
 let unblock,started;const entered=new Promise(r=>started=r),gate=new Promise(r=>unblock=r);
 const f=fixture(t,async()=>{started();await gate;return Response.json(candles())});
 const first=run(f.DB);await entered;const other=await run(f.DB);assert.equal(other[0].code,'COLLECTION_SKIPPED');assert.equal(f.calls,1);unblock();await first;assert.equal(f.calls,3);
});
test('lease vencida permite recuperação; dono antigo não grava nem sobrescreve controle',async t=>{
 let unblock,started,first=true;const entered=new Promise(r=>started=r),gate=new Promise(r=>unblock=r);let at=base;
 const f=fixture(t,async()=>{if(first){first=false;started();await gate;return Response.json(candles())}return Response.json(candles(at))});
 const old=run(f.DB);await entered;at=base+300001;f.setTime(at);await run(f.DB);unblock();await old;
 assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM collector_runs').get().n,1);assert.equal(f.state().lastCompletedAt,at);
 assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM observations WHERE time=?').get(end).n,0);
});
test('probe repetido lê diagnósticos sem rede nem escrita',async t=>{
 const f=fixture(t,async()=>Response.json(candles()));await run(f.DB);const calls=f.calls,before=JSON.stringify(f.DB.sqlite.prepare('SELECT * FROM collector_control').all());
 for(let i=0;i<30;i++){const r=await C.default.fetch(new Request('https://test/probe'),{DB:f.DB});const data=await r.json();assert.equal(data.mode,'stored');assert.ok(data.checks.every(x=>x.ok));}
 assert.equal(f.calls,calls);assert.equal(JSON.stringify(f.DB.sqlite.prepare('SELECT * FROM collector_control').all()),before);
});
test('migração cria controle isolado sem alterar observações ou resultados',()=>{
 const DB=database({legacy:true});try{DB.sqlite.exec('DROP TABLE collector_control');DB.sqlite.prepare('INSERT INTO observations VALUES(?,?,?,?)').run('BTCUSD',end,100,1);DB.sqlite.prepare('INSERT INTO results VALUES(?,?,?,?)').run('BTCUSD',end,1,.123);
 const before=JSON.stringify([DB.sqlite.prepare('SELECT * FROM observations').all(),DB.sqlite.prepare('SELECT * FROM results').all()]);
 DB.sqlite.exec(read('migrations/0002_collector_control_v572.sql'));DB.sqlite.exec(read('migrations/0002_collector_control_v572.sql'));
 assert.equal(JSON.stringify([DB.sqlite.prepare('SELECT * FROM observations').all(),DB.sqlite.prepare('SELECT * FROM results').all()]),before);assert.equal(DB.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{DB.sqlite.close()}
});
test('estado ausente bloqueia coleta sem aplicar migração automaticamente',async t=>{
 const f=fixture(t,async()=>{throw Error('no request expected')});f.DB.sqlite.exec('DROP TABLE collector_control');const r=await run(f.DB);assert.ok(r.every(x=>x.code==='CONTROL_MIGRATION_REQUIRED'));assert.equal(f.calls,0);assert.equal((await C.healthData({DB:f.DB})).controlReady,false);
});
test('espaçamento limitado de 1 segundo entre ativos, sem retentativa',async t=>{
 const f=fixture(t,async()=>Response.json(candles()));const waits=[];await C.collect({DB:f.DB},{pause:async ms=>waits.push(ms)});assert.deepEqual(waits,[1000,1000]);assert.equal(f.calls,3);
});
test('histórico já concluído não é regravado e campos legados são preservados',async t=>{
 const f=fixture(t,async()=>Response.json(candles()));f.DB.sqlite.prepare('INSERT INTO observations(symbol,time,reference_price,direction) VALUES(?,?,?,?)').run('BTCUSD',end-300000,100,-1);
 for(const h of [1,3,5])f.DB.sqlite.prepare('INSERT INTO results VALUES(?,?,?,?)').run('BTCUSD',end-300000,h,.789);
 await run(f.DB);const legacy=f.DB.sqlite.prepare('SELECT * FROM observations WHERE time=?').get(end-300000);assert.equal(legacy.methodology_version,null);assert.equal(legacy.direction,-1);
 assert.ok(f.DB.sqlite.prepare('SELECT * FROM results WHERE time=?').all(end-300000).every(x=>x.directional_pct===.789));
});
test('ordem dos ativos gira por intervalo para não penalizar sempre o último',async t=>{
 let at=base;const f=fixture(t,async()=>Response.json(candles(at)));const one=await run(f.DB);at=base+300001;f.setTime(at);const two=await run(f.DB);
 assert.equal(one[0].symbol,'BTCUSD');assert.equal(two[0].symbol,'ETHUSD');assert.equal(f.calls,6);
});
test('todos os ativos HTTP 400: fonte indisponível, contadores exatos e nenhuma retentativa',async t=>{
 const f=fixture(t,async()=>error(400));await run(f.DB);const h=await C.healthData({DB:f.DB});assert.equal(h.providerState,'unavailable');assert.equal(h.totals.http400,3);assert.equal(f.calls,3);assert.equal(h.cooldownActive,false);
});
test('429 sem Retry-After é registrado e adia as consultas restantes por cinco minutos',async t=>{
 const f=fixture(t,async()=>error(429));const r=await run(f.DB);assert.equal(f.calls,1);assert.equal(r[0].cooldownUntil,base+300000);assert.equal((await C.healthData({DB:f.DB})).totals.http429,1);
});
