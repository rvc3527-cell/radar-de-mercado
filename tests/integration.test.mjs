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
