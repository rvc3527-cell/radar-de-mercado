import assert from 'node:assert/strict';
import test from 'node:test';

// Motor isolado, determinístico e sem chamadas de rede.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const sandbox={};sandbox.globalThis=sandbox;
runInNewContext(readFileSync(new URL('../engine.js',import.meta.url),'utf8'),sandbox);
const simulate=sandbox.RadarEngine.simulate;
const candles=(prices)=>prices.map(([open,close])=>({open,close}));
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('Spot long-only: ignora venda e desconta dois lados de custo',()=>{
  const t=simulate(candles([[100,102],[102,103],[103,105]]),[-1,1,0],{fee:0.1,slippage:0.02});
  assert.equal(t.length,1);assert.equal(t[0].index,1);approx(t[0].result,(103-102)/102*100-0.24);
});
test('Opções: alta, baixa, empate; empate conta como perda',()=>{
  const t=simulate(candles([[100,102],[100,98],[100,100]]),[1,-1,1],{mode:'binary',payout:80});
  assert.deepEqual(t.map(x=>x.result),[0.8,0.8,-1]);
});
test('Entrada na abertura da vela seguinte, não no fechamento da vela do sinal',()=>{
  const t=simulate(candles([[100,500],[200,210],[210,211]]),[0,1,0],{fee:0,slippage:0});
  assert.equal(t[0].entry,200);approx(t[0].result,5);
});
test('Prazo de três velas: saída no fechamento da terceira e sem sobreposição',()=>{
  const t=simulate(candles([[100,101],[101,102],[102,103],[103,104],[104,105],[105,106]]),[1,1,1,1,1,1],{horizon:3,fee:0,slippage:0});
  assert.deepEqual(t.map(x=>[x.index,x.exitIndex]),[[0,2],[3,5]]);
});
test('Não opera se faltam velas para completar o prazo',()=>{
  assert.equal(simulate(candles([[100,101],[101,102]]),[1,1],{horizon:3}).length,0);
});
test('Payout e custos inválidos não são aceitos',()=>{
  assert.throws(()=>simulate(candles([[100,101]]),[1],{mode:'binary',payout:0}));
  assert.throws(()=>simulate(candles([[100,101]]),[1],{fee:-1}));
});
