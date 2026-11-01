import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function buildPreview(){
 const assets=Object.fromEntries(['index.html','engine.js','indicators.js','statistics.js'].map(file=>['/'+file,readFileSync(resolve(root,file),'utf8')]));
 return `// Generated from repository files; target: radar-de-mercado-preview only.\nconst assets=${JSON.stringify(assets)};\naddEventListener('fetch',event=>{const path=new URL(event.request.url).pathname;const key=Object.hasOwn(assets,path)?path:'/index.html';const type=key.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8';event.respondWith(new Response(event.request.method==='HEAD'?null:assets[key],{headers:{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'}}))});\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const output=resolve(process.argv[2]||resolve(root,'dist/preview-worker.js'));mkdirSync(dirname(output),{recursive:true});writeFileSync(output,buildPreview());console.log(output)}
