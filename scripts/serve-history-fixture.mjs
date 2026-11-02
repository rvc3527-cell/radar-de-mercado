// Local integration harness; imports the actual read-only handlers and a captured real dataset.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {database} from '../tests/helpers/runtime.mjs';
import {history,statistics,monitoring} from '../historical.js';
const snapshot=JSON.parse(readFileSync(new URL('../artifacts/market-snapshot.json',import.meta.url)));
const DB=database();
for(const x of snapshot.observations.observations){DB.sqlite.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?)').run(x.symbol,x.time,x.reference_price,x.direction,x.methodology_version||null);if(x.horizon!==null&&Number.isFinite(x.directional_pct))DB.sqlite.prepare('INSERT OR IGNORE INTO results VALUES(?,?,?,?)').run(x.symbol,x.time,x.horizon,x.directional_pct)}
const run=snapshot.health.last_run;if(run)DB.sqlite.prepare('INSERT INTO collector_runs VALUES(?,?)').run(run.started_at,run.report);
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const fn={'/history':history,'/statistics':statistics,'/collector-history':monitoring}[url.pathname];const data=await fn({DB},url,snapshot.at);res.setHeader('content-type','application/json');res.end(JSON.stringify(data))}catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:{message:e.message}}))}}).listen(8766,'127.0.0.1',()=>console.log('Fixture API: 8766'));
