import test from 'node:test';
import assert from 'node:assert/strict';
import {database,collector} from './helpers/runtime.mjs';
import {history,statistics,monitoring,summarizeHistory,summarizeRuns,parseFilters,handleHistorical} from '../historical.js';
const minute=60000,day=86400000,t=Date.UTC(2026,9,30),now=t+day;
const url=(route='/history',params={})=>new URL('https://collector.test'+route+'?'+new URLSearchParams({from:String(t),to:String(now),...params}));
function seed(db,{time=t,symbol='BTCUSD',methodology='v5.7',results=[.4,-.1,0],direction=1}={}){
 db.sqlite.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').run(symbol,time,100,direction,methodology);
 for(const [i,h] of [1,3,5].entries())if(results[i]!==undefined)db.sqlite.prepare('INSERT INTO results VALUES(?,?,?,?)').run(symbol,time,h,results[i]);
}
const row=(time,results={},extra={})=>({symbol:'BTCUSD',time,reference_price:100,direction:1,methodology_version:'v5.7',results,...extra});
const f={methodology:'v5.7',symbol:null,horizon:null,cost:.2};
test('paginação keyset percorre empates sem perdas nem duplicatas, em ambas ordens',async()=>{
 for(const order of ['asc','desc']){const DB=database();for(let i=0;i<4;i++)for(const symbol of ['BTCUSD','ETHUSD','SOLUSD'])seed(DB,{time:t+i*minute,symbol});let cursor=null,items=[];
 do{const d=await history({DB},url('/history',{limit:'2',order,...(cursor?{cursor}:{})}),now);assert.equal(d.total,12);assert.ok(d.items.length<=2);assert.equal(Object.keys(d.items[0].results).length,3);items.push(...d.items);cursor=d.next_cursor}while(cursor);
 assert.equal(items.length,12);assert.equal(new Set(items.map(x=>x.symbol+x.time)).size,12);assert.equal(items[0].time,order==='asc'?t:t+3*minute);DB.sqlite.close()}
});
test('filtros por período, ativo, horizonte e metodologia não misturam legados',async()=>{
 const DB=database();seed(DB);seed(DB,{symbol:'ETHUSD'});seed(DB,{time:t+minute,methodology:null});seed(DB,{time:t+2*minute});
 const d=await history({DB},url('/history',{symbol:'BTCUSD',horizon:'3',from:String(t),to:String(t+minute)}),now);assert.equal(d.total,1);assert.deepEqual(d.items[0].results,{'3':-.1});assert.equal(d.items[0].source,'Coinbase Exchange');assert.ok(d.methodologies.includes('legacy-unversioned'));
 const old=await history({DB},url('/history',{methodology:'legacy-unversioned'}),now);assert.equal(old.total,1);assert.equal(old.items[0].study_type,'unverified-legacy');assert.match(old.items[0].source,/não versionada/);DB.sqlite.close();
});
test('parâmetros inválidos, SQL injetado, datas impossíveis e limites são rejeitados',async()=>{
 for(const bad of [{symbol:"BTCUSD' OR 1=1"},{horizon:'2'},{limit:'101'},{limit:'-1'},{cost:'NaN'},{cost:'5.001'},{methodology:"v5.7'"},{order:'DROP'},{from:'2026-02-30'},{to:String(now+1)},{cursor:'bad!'}])await assert.rejects(history({DB:database()},url('/history',bad),now));
 assert.throws(()=>parseFilters(url('/history',{from:String(t-367*day)}),now));
});
test('cursor permanece vinculado aos filtros e impede continuação inconsistente',async()=>{
 const DB=database();seed(DB);seed(DB,{time:t+minute});const d=await history({DB},url('/history',{limit:'1'}),now);assert.ok(d.next_cursor);
 await assert.rejects(history({DB},url('/history',{limit:'1',cursor:d.next_cursor,symbol:'ETHUSD'}),now));DB.sqlite.close();
});
test('histórico sem resultados permanece pendente e conta observações, não linhas JOIN',async()=>{
 const DB=database();seed(DB,{results:[]});seed(DB,{time:t+minute,results:[0]});const h=await history({DB},url(),now);assert.equal(h.total,2);assert.deepEqual(h.items[1].pending_horizons,[1,3,5]);const s=await statistics({DB},url('/statistics'),now);assert.equal(s.totals.observations,2);assert.equal(s.totals.pending,2);assert.equal(s.totals.partial,1);assert.equal(s.groups.find(x=>x.symbol==='BTCUSD'&&x.horizon===1).unfavorable,0);DB.sqlite.close();
});
test('seleção de janelas ocorre antes dos resultados, sem viés por pendentes',()=>{
 const d=summarizeHistory([row(t,{}),row(t+minute,{5:10}),row(t+5*minute,{5:.4})],{...f,horizon:5});const g=d.groups[0];assert.equal(g.selected,2);assert.equal(g.excluded_overlap,1);assert.equal(g.pending,1);assert.equal(g.evaluated,1);assert.equal(g.mean_gross,.4);assert.equal(g.mean_net,.2);assert.equal(g.favorable_pct,100);
});
test('estatísticas independentes por ativo e horizonte, médias, medianas, custos e baseline',()=>{
 const rows=[row(t,{1:.4,3:.1,5:.9}),row(t+5*minute,{1:-.2,3:.3,5:-.3},{direction:-1}),row(t+10*minute,{1:0,3:.8,5:.2}),row(t,{1:9},{symbol:'ETHUSD'})];
 const d=summarizeHistory(rows,f),g=d.groups.find(x=>x.symbol==='BTCUSD'&&x.horizon===1);assert.equal(g.evaluated,3);assert.ok(Math.abs(g.mean_gross-1/15)<1e-12);assert.equal(g.median_gross,0);assert.equal(g.median_net,-.2);assert.equal(g.favorable,1);assert.equal(g.unfavorable,1);assert.equal(g.ties,1);assert.equal(g.net_positive,1);assert.ok(Math.abs(g.baseline_mean_net)<1e-12);assert.equal(d.groups.find(x=>x.symbol==='ETHUSD'&&x.horizon===1).mean_gross,9);assert.equal(d.totals.evaluated,3);assert.equal(d.totals.pending,1);
});
test('rejeita duplicações, números inválidos e metodologias incompatíveis na agregação',()=>{
 const d=summarizeHistory([row(t,{1:.4}),row(t,{1:100}),row(t+minute,{1:NaN}),row(t+2*minute,{1:5},{methodology_version:'legacy-unversioned'}),row(t+3*minute,{1:8},{reference_price:-1})],{...f,horizon:1});assert.equal(d.totals.duplicates,1);assert.equal(d.totals.invalid,1);assert.equal(d.totals.excluded_methodology,1);assert.equal(d.groups[0].evaluated,1);assert.equal(d.groups[0].pending,1);
});
test('amostra pequena não cria distribuição; 30 avaliações ocupam bins verdadeiros',()=>{
 const rows=Array.from({length:30},(_,i)=>row(t+i*5*minute,{5:i%2?-.5:.5}));const d=summarizeHistory(rows,{...f,horizon:5});assert.equal(d.groups[0].insufficient,false);assert.equal(d.groups[0].distribution.reduce((s,b)=>s+b.count,0),30);assert.equal(d.groups[0].mean_gross,0);assert.ok(Math.abs(d.groups[0].mean_net+.2)<1e-12);assert.equal(summarizeHistory(rows.slice(1),{...f,horizon:5}).groups[0].distribution.length,0);
});
test('consulta vazia tem métricas nulas, nenhum gráfico ou registro fictício',async()=>{
 const DB=database(),s=await statistics({DB},url('/statistics'),now);assert.equal(s.totals.observations,0);assert.equal(s.daily.length,0);assert.equal(s.groups[0].mean_net,null);assert.equal(s.groups[0].favorable_pct,null);DB.sqlite.close();
});
test('estatísticas e monitoramento recusam intervalos custosos',async()=>{
 const DB=database();await assert.rejects(statistics({DB},url('/statistics',{from:String(t-32*day)}),now));await assert.rejects(monitoring({DB},url('/collector-history',{from:String(t-8*day)}),now));DB.sqlite.close();
});
test('limite de 5000 observações evita materialização ilimitada',async()=>{
 const DB=database();const insert=DB.sqlite.prepare('INSERT INTO observations VALUES(?,?,?,?,?)');DB.sqlite.exec('BEGIN');for(let i=0;i<5001;i++)insert.run('BTCUSD',t+i*minute,100,1,'v5.7');DB.sqlite.exec('COMMIT');await assert.rejects(statistics({DB},url('/statistics',{to:String(t+6*day)}),t+6*day),e=>e.status===422);DB.sqlite.close();
});
test('consultas usam índices existentes e são estritamente somente leitura',async()=>{
 const DB=database();seed(DB);seed(DB,{time:t+minute,methodology:null});const before=DB.sqlite.prepare('SELECT * FROM observations ORDER BY time').all(),results=DB.sqlite.prepare('SELECT * FROM results ORDER BY time,horizon').all();
 const sql=[];const adapter={prepare(s){sql.push(s);assert.match(s,/^(SELECT|WITH)/);return DB.prepare(s)}};
 await history({DB:adapter},url(),now);await statistics({DB:adapter},url('/statistics'),now);await monitoring({DB:adapter},url('/collector-history'),now);
 assert.deepEqual(DB.sqlite.prepare('SELECT * FROM observations ORDER BY time').all(),before);assert.deepEqual(DB.sqlite.prepare('SELECT * FROM results ORDER BY time,horizon').all(),results);
 const plan=DB.sqlite.prepare('EXPLAIN QUERY PLAN SELECT * FROM observations WHERE time>=? AND time<=?').all(t,now);assert.match(JSON.stringify(plan),/obs_time/);assert.ok(sql.every(s=>!s.includes('OFFSET')));DB.sqlite.close();
});
const report=(items)=>JSON.stringify(items),ok=symbol=>({symbol,httpStatus:200,candles:180,latest:t+minute});
test('monitoramento distingue slots ausentes, falhas, cooldown e rejeição de candles',()=>{
 const rows=[{started_at:t,report:report([ok('BTCUSD'),{symbol:'ETHUSD',httpStatus:429,error:'limit',cooldownUntil:t+600000},{symbol:'SOLUSD',code:'COOLDOWN',deferred:true}])},{started_at:t+300000,report:report([{symbol:'BTCUSD',httpStatus:400,error:'bad'},{symbol:'ETHUSD',code:'API_NETWORK',error:'timeout'},{symbol:'SOLUSD',code:'MISSING_CANDLES',error:'gap',missing:2,duplicates:1}])}];
 const d=summarizeRuns(rows,t,t+900000);assert.equal(d.expected_slots,3);assert.equal(d.recorded_slots,2);assert.equal(d.assets[0].success,1);assert.equal(d.assets[0].http400,1);assert.equal(d.assets[0].missing,1);assert.equal(d.assets[1].http429,1);assert.equal(d.assets[1].network,1);assert.equal(d.assets[2].cooldown,1);assert.equal(d.assets[2].rejected,1);assert.equal(d.assets[2].missingMinutes,2);assert.equal(d.assets[2].duplicateCandles,1);assert.equal(d.cooldown.total_seconds,600);assert.equal(d.daily[0].expected,9);assert.equal(d.daily[0].success,1);
});
test('execuções repetidas não duplicam disponibilidade e slot atual não conta como falha',()=>{
 const all=['BTCUSD','ETHUSD','SOLUSD'].map(ok);const d=summarizeRuns([{started_at:t,report:report(all)},{started_at:t+1000,report:report(all)},{started_at:t+300001,report:'invalid JSON'}],t,t+300100);assert.equal(d.expected_slots,1);assert.equal(d.recorded_slots,1);assert.equal(d.assets[0].success,1);assert.equal(d.assets[0].availability_pct,100);assert.equal(d.last_all_success_in_complete_slots,t+1000);
});
test('legados sem diagnóstico não se tornam sucessos; cooldown sobreposto conta uma vez',()=>{
 const d=summarizeRuns([{started_at:t,report:report([{symbol:'BTCUSD',aligned:true},{symbol:'ETHUSD',httpStatus:429,error:'limit',cooldownUntil:t+600000},{symbol:'SOLUSD',httpStatus:429,error:'limit',cooldownUntil:t+900000}])}],t,t+900000);assert.equal(d.assets[0].unknown,1);assert.equal(d.assets[0].success,0);assert.equal(d.cooldown.periods,1);assert.equal(d.cooldown.total_seconds,900);
});
test('endpoints reais do Worker mantêm v572 e não chamam Coinbase',async()=>{
 const DB=database();seed(DB);const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Não deve acessar provedor')};try{
 for(const path of ['/history','/statistics','/collector-history']){const response=await collector.default.fetch(new Request(url(path)),{DB});assert.equal(response.status,200);assert.equal((await response.json()).api_version,'v6.0')}
 const health=await collector.default.fetch(new Request('https://collector.test/health'),{DB});assert.equal((await health.json()).version,'5.7.2');await collector.default.fetch(new Request('https://collector.test/probe'),{DB});assert.equal(calls,0);
 }finally{globalThis.fetch=original;DB.sqlite.close()}
});
test('erros JSON consistentes não expõem SQL ou credenciais',async()=>{
 const bad=await handleHistorical(new Request('https://collector.test/history?symbol=BAD'),{},{});assert.equal(bad.status,400);const dbFailure=await handleHistorical(new Request(url()),{DB:{prepare(){throw Error('secret SQL token')}}},{});assert.equal(dbFailure.status,503);assert.doesNotMatch(await dbFailure.text(),/secret|token|SELECT/);assert.equal(await handleHistorical(new Request('https://collector.test/other'),{},{}),null);
});
test('disponibilidade começa no primeiro registro confirmado, sem inventar falhas anteriores',async()=>{
 const DB=database();DB.sqlite.prepare('INSERT INTO collector_runs VALUES(?,?)').run(t+300000,JSON.stringify(['BTCUSD','ETHUSD','SOLUSD'].map(ok)));
 const d=await monitoring({DB},url('/collector-history',{from:String(t),to:String(t+900000)}),now);assert.equal(d.instrumented_from,t+300000);assert.equal(d.expected_slots,2);assert.equal(d.assets[0].success,1);assert.equal(d.assets[0].missing,1);DB.sqlite.close();
});
test('chaves existentes impedem observações e resultados duplicados sem alterar originais',()=>{
 const DB=database();seed(DB);assert.throws(()=>seed(DB),/UNIQUE constraint/);assert.throws(()=>DB.sqlite.prepare('INSERT INTO results VALUES(?,?,?,?)').run('BTCUSD',t,1,999),/UNIQUE constraint/);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM observations').get().n,1);assert.equal(DB.sqlite.prepare('SELECT directional_pct FROM results WHERE horizon=1').get().directional_pct,.4);DB.sqlite.close();
});
test('após custo zero, médias e proporções líquidas coincidem com métricas brutas',()=>{
 const d=summarizeHistory([row(t,{1:.2}),row(t+minute,{1:-.1})],{...f,horizon:1,cost:0});const g=d.groups[0];assert.equal(g.mean_gross,g.mean_net);assert.equal(g.median_gross,g.median_net);assert.equal(g.net_positive_pct,g.favorable_pct);
});
