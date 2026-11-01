import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const source=readFileSync(new URL('../cloud-collector.js',import.meta.url),'utf8');
const {validateCandles,candleWindow,collect,fetchCandles,default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source.replace("'./indicators.js'",JSON.stringify(new URL('../indicators.js',import.meta.url).href))+'\nexport {validateCandles,candleWindow,collect,fetchCandles};').toString('base64'));
const now=1800000010000,end=Math.floor(now/60000)*60000;
function candles(n=180){return Array.from({length:n},(_,i)=>[(end-(n-i)*60000)/1000,99,103,100,100+Math.sin(i/4),1])}
function db(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../cloud-schema.sql',import.meta.url),'utf8'));
 return {sqlite,prepare(sql){let args=[];return {bind(...values){args=values;return this},async run(){return sqlite.prepare(sql).run(...args)},async all(){return {results:sqlite.prepare(sql).all(...args)}},async first(){return sqlite.prepare(sql).get(...args)}}}};
}
test('ordena candles descendentes e converte abertura em fechamento',()=>{
 const {rows,diagnostics}=validateCandles(candles().reverse(),now);
 assert.equal(rows.length,180);assert.equal(rows.at(-1).time,end);assert.equal(diagnostics.ageSeconds,10);
});
test('descarta candle aberto, fechamento sem margem e histórico fora da janela',()=>{
 const raw=candles();raw.push([end/1000,99,103,100,101,1]);raw.unshift([(end-181*60000)/1000,99,103,100,101,1]);
 assert.equal(validateCandles(raw,now).rows.length,180);
 assert.equal(candleWindow(end+2000).end,end-60000);
});
test('não aceita cache antigo como atual',()=>{
 const old=candles().map(r=>[r[0]-180,...r.slice(1)]);
 assert.throws(()=>validateCandles(old,now),e=>e.code==='STALE_CANDLE'&&e.diagnostics.ageSeconds===190);
});
test('histórico insuficiente preserva diagnóstico',()=>assert.throws(()=>validateCandles(candles(39),now),e=>e.code==='INSUFFICIENT_HISTORY'&&e.diagnostics.candles===39));
test('lacuna e intervalos irregulares são rejeitados sem interpolação',()=>{
 const raw=candles();raw.splice(90,1);
 assert.throws(()=>validateCandles(raw,now),e=>e.code==='MISSING_CANDLES'&&e.diagnostics.missing===1);
 raw[20][0]++;
 assert.throws(()=>validateCandles(raw,now),e=>e.code==='INVALID_TIMESTAMP');
});
test('deduplica idênticos e rejeita duplicatas conflitantes',()=>{
 const raw=candles();raw.push([...raw[30]]);
 assert.equal(validateCandles(raw,now).diagnostics.duplicates,1);
 raw.at(-1)[4]=102;
 assert.throws(()=>validateCandles(raw,now),e=>e.code==='CONFLICTING_DUPLICATE');
});
test('rejeita NaN, zero, null, strings e OHLC inconsistente',()=>{
 for(const value of [NaN,0,null,'100',104]){const raw=candles();raw[30][4]=value;assert.throws(()=>validateCandles(raw,now));}
 assert.throws(()=>validateCandles({message:'error'},now),e=>e.code==='INVALID_RESPONSE');
});
test('consulta tem janela explícita de 180 minutos e pares USD',async t=>{
 t.mock.method(Date,'now',()=>now);
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(url.pathname,'/products/ETH-USD/candles');assert.equal(Date.parse(url.searchParams.get('end')),end);assert.equal(Date.parse(url.searchParams.get('start')),end-180*60000);return Response.json(candles(),{headers:{age:'0','cf-cache-status':'MISS'}})});
 const data=await fetchCandles('ETHUSD');assert.equal(data.diagnostics.cacheStatus,'MISS');
});
test('HTTP 429, JSON inválido e timeout são erros distintos',async t=>{
 for(const [response,code] of [[()=>new Response('',{status:429}),'API_HTTP'],[()=>new Response('bad'),'INVALID_RESPONSE'],[()=>{throw new Error('timeout')},'API_NETWORK']]){
  const m=t.mock.method(globalThis,'fetch',async()=>response());
  await assert.rejects(fetchCandles('BTCUSD',now),e=>e.code===code);m.mock.restore();
 }
});
test('coleta com SQL real é idempotente e calcula horizontes exatos',async t=>{
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>Response.json(candles()));
 const DB=db();t.after(()=>DB.sqlite.close());
 DB.sqlite.prepare('INSERT INTO observations(symbol,time,reference_price,direction) VALUES(?,?,?,?)').run('BTCUSD',end-5*60000,100,-1);
 await collect({DB});
 const rows=DB.sqlite.prepare("SELECT * FROM results WHERE symbol='BTCUSD' AND time=? ORDER BY horizon").all(end-5*60000);
 assert.deepEqual(rows.map(x=>x.horizon),[1,3,5]);
 for(const r of rows){const raw=candles().find(x=>x[0]*1000+60000===r.time+r.horizon*60000);assert.ok(Math.abs(r.directional_pct+(raw[4]/100-1)*100)<1e-12)}
 const before=DB.sqlite.prepare('SELECT COUNT(*) n FROM observations').get().n;
 t.mock.method(Date,'now',()=>now+1);await collect({DB});
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM observations').get().n,before);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM results WHERE time=?').get(end-5*60000).n,3);
});
test('falha de um ativo não interrompe outros e dados inválidos não geram registros',async t=>{
 t.mock.method(Date,'now',()=>now);t.mock.method(console,'error',()=>{});
 t.mock.method(globalThis,'fetch',async url=>url.pathname.includes('BTC')?new Response('',{status:503}):Response.json(candles()));
 const DB=db();t.after(()=>DB.sqlite.close());const report=await collect({DB});
 assert.equal(report[0].code,'API_HTTP');assert.equal(report[1].candles,180);assert.equal(report[2].candles,180);
 assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM observations WHERE symbol='BTCUSD'").get().n,0);
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM collector_runs').get().n,1);
});
test('lacunas impedem registros e resultados mesmo com preço final disponível',async t=>{
 t.mock.method(Date,'now',()=>now);t.mock.method(console,'error',()=>{});
 const raw=candles();raw.splice(-3,1);t.mock.method(globalThis,'fetch',async()=>Response.json(raw));
 const DB=db();t.after(()=>DB.sqlite.close());DB.sqlite.prepare('INSERT INTO observations(symbol,time,reference_price,direction) VALUES(?,?,?,?)').run('BTCUSD',end-5*60000,100,1);
 const report=await collect({DB});assert.ok(report.every(x=>x.code==='MISSING_CANDLES'));
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM results').get().n,0);
});
test('probe é somente leitura; health identifica ausência e atraso do Cron',async t=>{
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>Response.json(candles()));
 const DB=db();t.after(()=>DB.sqlite.close());
 const probe=await worker.fetch(new Request('https://test/probe'),{DB});assert.ok((await probe.json()).checks.every(x=>x.ok));
 assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM collector_runs').get().n,0);
 assert.equal((await (await worker.fetch(new Request('https://test/health'),{DB})).json()).scheduleDelayed,true);
 DB.sqlite.prepare('INSERT INTO collector_runs VALUES(?,?)').run(now,'[]');
 assert.equal((await (await worker.fetch(new Request('https://test/health'),{DB})).json()).scheduleDelayed,false);
 t.mock.method(Date,'now',()=>now+660000);
 assert.equal((await (await worker.fetch(new Request('https://test/health'),{DB})).json()).scheduleDelayed,true);
});
test('script do coletor e script inline têm sintaxe válida',async()=>{
 const {Script}=await import('node:vm');const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new Script(m[1]);
 assert.ok(source.includes('ctx.waitUntil(collect(env))'));
});
test('diagnóstico JSON de HTTP 400 preserva mensagem, data e identificação pública',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({message:'Invalid start\nend'},{status:400,headers:{date:'Sun, 01 Nov 2026 12:00:00 GMT','cf-ray':'public-request-id'}}));
 await assert.rejects(fetchCandles('BTCUSD',now),e=>e.code==='API_HTTP'&&e.diagnostics.upstreamMessage==='Invalid start end'&&e.diagnostics.requestId==='public-request-id'&&e.diagnostics.serverDate==='Sun, 01 Nov 2026 12:00:00 GMT');
});
test('diagnóstico nunca publica corpo HTML do provedor',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('<html>private upstream response</html>',{status:400,headers:{'content-type':'text/html'}}));
 await assert.rejects(fetchCandles('BTCUSD',now),e=>e.code==='API_HTTP'&&!JSON.stringify(e.diagnostics).includes('private upstream'));
});
test('diagnóstico limita leitura e cancela corpo grande, mantendo HTTP 400',async t=>{
 let cancelled=false;
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1025))},cancel(){cancelled=true}}),{status:400,headers:{'content-type':'application/json'}}));
 await assert.rejects(fetchCandles('BTCUSD',now),e=>e.code==='API_HTTP'&&e.diagnostics.upstreamMessage.includes('limite'));
 assert.equal(cancelled,true);
});
test('JSON de erro inválido não apaga classificação HTTP original',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('{invalid',{status:400,headers:{'content-type':'application/json'}}));
 await assert.rejects(fetchCandles('BTCUSD',now),e=>e.code==='API_HTTP'&&e.diagnostics.httpStatus===400);
});
test('Coinbase recebe User-Agent identificável mesmo quando a origem exige cabeçalho',async t=>{
 t.mock.method(Date,'now',()=>now);
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(!options.headers['User-Agent']?.startsWith('RadarDeMercado/5.7.1 '))return Response.json({message:'User-Agent header is required.'},{status:400});
  assert.equal(options.headers.Accept,'application/json');
  return Response.json(candles(),{headers:{'cf-cache-status':'MISS'}});
 });
 const {rows,diagnostics}=await fetchCandles('BTCUSD',now);
 assert.equal(rows.length,180);assert.equal(diagnostics.httpStatus,200);assert.equal(diagnostics.cacheStatus,'MISS');
 assert.match(diagnostics.requestUserAgent,/RadarDeMercado\/5\.7\.1/);
});
