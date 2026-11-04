import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function buildPreview({format='classic'}={}){
 const assets=Object.fromEntries(['index.html','engine.js','indicators.js','statistics.js','petroleo.css','dashboard.js','intelligence.js','digital.css','opportunity-engine.js','opportunities.js','paper/engine.js','paper/risk.js','paper/money.js','paper/store.js','paper/integrity.js','paper/market.js','paper/strategy.js','paper/session.js','paper/panel.js','paper/panel.css','paper/report.js','paper/report-panel.js','paper/archive.js','paper/archive-panel.js','paper/messages.js','lab/contracts.js','lab/evaluator.js','lab/panel.js','paper/config.js','paper/provenance.js','lab/protocol.js','lab/confirmed-trend.js','lab/offline.js'].map(file=>['/'+file,readFileSync(resolve(root,file),'utf8')]));
 const hashes=Object.fromEntries(Object.entries(assets).filter(([path])=>path.endsWith('.js')).map(([path,content])=>[path.slice(1),createHash('sha256').update(content).digest('hex')]));assets['/lab/build.json']=JSON.stringify(hashes);
 const handler=`function handle(request){const path=new URL(request.url).pathname;const key=Object.hasOwn(assets,path)?path:'/index.html';const type=key.endsWith('.js')?'application/javascript; charset=utf-8':key.endsWith('.css')?'text/css; charset=utf-8':key.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8';return new Response(request.method==='HEAD'?null:assets[key],{headers:{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'}})}`;
 if(!['classic','module'].includes(format))throw Error('Unsupported Preview format');
 return `// Generated from repository files; target: radar-de-mercado-preview only.\nconst assets=${JSON.stringify(assets)};\n${handler}\n${format==='module'?'export default {fetch:handle};':"addEventListener('fetch',event=>event.respondWith(handle(event.request)));"}\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const output=resolve(process.argv[2]||resolve(root,'dist/preview-worker.js'));mkdirSync(dirname(output),{recursive:true});writeFileSync(output,buildPreview({format:process.argv.includes('--module')?'module':'classic'}));console.log(output)}
