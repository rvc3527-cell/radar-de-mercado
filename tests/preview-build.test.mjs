import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {buildPreview} from '../scripts/build-preview.mjs';
import {read} from './helpers/runtime.mjs';
test('artefato preview serve HTML e todos os scripts com conteúdo exato',async()=>{
 let handler;runInNewContext(buildPreview(),{URL,Response,addEventListener:(type,fn)=>{assert.equal(type,'fetch');handler=fn}});
 for(const path of ['/','/index.html','/engine.js','/indicators.js','/statistics.js','/petroleo.css','/dashboard.js','/intelligence.js','/digital.css','/opportunity-engine.js','/opportunities.js','/paper/panel.js','/paper/panel.css','/paper/engine.js','/paper/risk.js','/paper/money.js','/paper/store.js','/paper/integrity.js','/paper/session.js','/paper/market.js','/paper/strategy.js','/paper/report.js','/paper/report-panel.js']){
  let response;handler({request:new Request('https://preview.test'+path),respondWith:r=>response=r});
  assert.equal(await response.text(),read(path==='/'?'index.html':path.slice(1)));
  assert.match(response.headers.get('content-type'),path.endsWith('.js')?/application\/javascript/:path.endsWith('.css')?/text\/css/:/text\/html/);
 }
});
test('module format preserves deployed Worker type and serves exact paper assets',async()=>{
 const worker=await import('data:text/javascript;base64,'+Buffer.from(buildPreview({format:'module'})).toString('base64'));
 for(const path of ['/paper/panel.js','/paper/engine.js','/paper/market.js','/paper/panel.css','/index.html']){
  const response=await worker.default.fetch(new Request('https://preview.test'+path));assert.equal(await response.text(),read(path.slice(1)));assert.equal(response.headers.get('cache-control'),'no-store');
 }
 const head=await worker.default.fetch(new Request('https://preview.test/paper/panel.js',{method:'HEAD'}));assert.equal(await head.text(),'');
});
