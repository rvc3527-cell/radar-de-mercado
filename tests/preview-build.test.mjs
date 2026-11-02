import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {buildPreview} from '../scripts/build-preview.mjs';
import {read} from './helpers/runtime.mjs';
test('artefato preview serve HTML e todos os scripts com conteúdo exato',async()=>{
 let handler;runInNewContext(buildPreview(),{URL,Response,addEventListener:(type,fn)=>{assert.equal(type,'fetch');handler=fn}});
 for(const path of ['/','/index.html','/engine.js','/indicators.js','/statistics.js','/petroleo.css','/dashboard.js','/intelligence.js','/digital.css','/opportunity-engine.js','/opportunities.js']){
  let response;handler({request:new Request('https://preview.test'+path),respondWith:r=>response=r});
  assert.equal(await response.text(),read(path==='/'?'index.html':path.slice(1)));
  assert.match(response.headers.get('content-type'),path.endsWith('.js')?/application\/javascript/:path.endsWith('.css')?/text\/css/:/text\/html/);
 }
});
