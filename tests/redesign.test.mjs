import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {panel,read} from './helpers/runtime.mjs';
const contract=JSON.parse(read('tests/fixtures/frontend-contract.json'));
test('redesign preserva todos os IDs funcionais sem duplicação',()=>{
 const ids=[...read('index.html').matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);for(const id of contract.ids)assert.ok(ids.includes(id),id);
});
test('esquema integrado v5.7.2, fórmulas e motor permanecem preservados',()=>{
 for(const [name,sha] of Object.entries(contract.protected))assert.equal(createHash('sha256').update(read(name)).digest('hex'),sha,name);
});
test('cartões mostram USDT, período, fonte e estado indisponível sem inventar cotação',async()=>{
 const app=await panel();app.context.input=[{symbol:'BTCUSDT',entry:100,rows:[{close:99},{close:100}],time:1800000000000,trend:'Alta'},{symbol:'ETHUSDT',error:'Cotação desatualizada'}];
 app.run('renderMarketCards(input)');const text=app.get('assetCards').textContent;
 assert.match(text,/100,00 USDT/);assert.match(text,/1 min/);assert.match(text,/Binance/);assert.match(text,/Cotação desatualizada/);assert.match(text,/Indisponível/);
});
test('monitoramento não chama erro HTTP de candles válidos',async()=>{
 const app=await panel();app.context.input={last_run:{started_at:1800000000000,report:JSON.stringify([{symbol:'BTCUSD',error:'limite',httpStatus:429},{symbol:'ETHUSD',aligned:false}])}};
 app.run('renderCollectorStates(input)');const text=app.get('collectorStates').textContent;
 assert.match(text,/Falha 429/);assert.match(text,/✓ Candles validados/);assert.match(text,/Sem execução confirmada/);
});
test('textos pequenos atendem contraste 4.5 nas superfícies do tema',()=>{
 const css=read('petroleo.css');const tokens=Object.fromEntries([...css.matchAll(/--([a-z-]+):(#\w{6})/g)].map(x=>[x[1],x[2]]));
 const luminance=h=>{const c=h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 for(const text of ['sand','muted','coral','positive','negative-text'])for(const surface of ['bg','secondary','panel','raised']){const a=luminance(tokens[text]),b=luminance(tokens[surface]);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,text+' on '+surface)}
});

test('agendamento, coleta e controle v572 permanecem byte a byte fora do novo roteamento',()=>{
 const original=read('cloud-collector.js').replace("import {handleHistorical} from './historical.js';\n",'').replace('const historical=await handleHistorical(request,env,headers);if(historical)return historical;','');
 assert.equal(createHash('sha256').update(original).digest('hex'),contract.collector_v572_sha256);
});
