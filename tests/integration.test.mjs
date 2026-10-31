import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const engine=readFileSync(new URL('../engine.js',import.meta.url),'utf8');
test('carregamento do motor no HTML',()=>{
 assert.ok(html.includes('src="/engine.js"'));
 assert.ok(html.includes('RadarEngine.simulate(closed,signalFull,'));
});
test('motor disponivel no navegador',()=>{
 const context={};context.globalThis=context;
 runInNewContext(engine,context);
 assert.equal(typeof context.RadarEngine.simulate,'function');
});
test('sinais calculados com vela anterior',()=>{
 assert.ok(html.includes('ema9[i-1]'));
 assert.ok(html.includes('rsi14[i-1]'));
});

test('estrutura de layout e CSS sem escapes literais',()=>{
 for(const id of ['grafico','visao-geral','indicadores','laboratorio','dataFreshness'])assert.ok(html.includes('id="'+id+'"'),id);
 const css=html.split('<style>')[1]?.split('</style>')[0];
 assert.ok(css,'stylesheet ausente');
 assert.ok(!css.includes(String.fromCharCode(92)+'n'),'CSS contem barra-n literal');
});
test('idade dos dados atualizada após carregamento e eventos',()=>{
 assert.ok(html.includes('function updateFreshness()'));
 assert.ok(html.includes('candles.setData(history);updateFreshness()'));
 assert.ok(html.includes('candles.update(point);updateFreshness()'));
});
test('janelas temporais nao se sobrepoem',()=>{
 assert.ok(html.includes('start:group.from,end:group.to'));
 assert.ok(html.includes('from:start,to:middle'));
 assert.ok(html.includes('from:middle,to:closed.length'));
});
