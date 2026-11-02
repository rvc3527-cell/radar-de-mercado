import {handleHistorical} from './historical.js';
import './indicators.js';
// Cloud collector prototype: isolated from production, no trades or order execution.
const SYMBOLS=['BTCUSD','ETHUSD','SOLUSD'];
const {analyzeCandles,methodologyVersion}=globalThis.RadarIndicators;
const MINUTE=60000;
const VERSION='5.7.2';
const COINBASE_USER_AGENT='RadarDeMercado/5.7.2 (+https://github.com/rvc3527-cell/radar-de-mercado)';
function fail(code,message,diagnostics={}){const error=new Error(message);error.code=code;error.diagnostics=diagnostics;throw error}
// Coinbase timestamps mark the START of the minute; our database stores its END.
function candleWindow(now){
  const end=Math.floor((now-5000)/MINUTE)*MINUTE;
  return {start:end-180*MINUTE,end};
}
function validateCandles(raw,now,window=candleWindow(now)){
  if(!Array.isArray(raw))fail('INVALID_RESPONSE','Coinbase: resposta inválida');
  const diagnostics={received:raw.length,duplicates:0,missing:0};
  const unique=new Map();
  for(const row of raw){
    if(!Array.isArray(row)||row.length<6||row.slice(0,6).some(x=>typeof x!=='number'||!Number.isFinite(x)))fail('INVALID_CANDLE','Candle com formato ou número inválido',diagnostics);
    const [seconds,low,high,open,close,volume]=row;
    if(!Number.isSafeInteger(seconds)||seconds%60!==0||seconds<=0)fail('INVALID_TIMESTAMP','Timestamp fora do intervalo de um minuto',diagnostics);
    if(low<=0||high<low||open<low||open>high||close<low||close>high||volume<0)fail('INVALID_PRICE','Preços ou volume inválidos',diagnostics);
    const time=seconds*1000+MINUTE;
    // Ignore candles before the requested range and still forming/recently closed.
    if(seconds*1000<window.start||time>window.end)continue;
    if(unique.has(time)){
      if(unique.get(time).raw.some((v,i)=>v!==row[i]))fail('CONFLICTING_DUPLICATE','Candles divergentes para o mesmo minuto',diagnostics);
      diagnostics.duplicates++;continue;
    }
    unique.set(time,{time,close,raw:row.slice(0,6)});
  }
  const rows=[...unique.values()].sort((a,b)=>a.time-b.time);
  const last=rows.at(-1);
  Object.assign(diagnostics,{candles:rows.length,latest:last?.time??null,ageSeconds:last?Math.round((now-last.time)/1000):null});
  for(let i=1;i<rows.length;i++)diagnostics.missing+=(rows[i].time-rows[i-1].time)/MINUTE-1;
  if(!last||rows.length<40)fail('INSUFFICIENT_HISTORY','Histórico insuficiente: '+rows.length+' candles',diagnostics);
  if(now-last.time>120000)fail('STALE_CANDLE','Último candle antigo: '+diagnostics.ageSeconds+' segundos',diagnostics);
  if(diagnostics.missing)fail('MISSING_CANDLES','Histórico com '+diagnostics.missing+' minuto(s) ausente(s); sem interpolação',diagnostics);
  return {rows,diagnostics};
}
// Read only a bounded JSON error message, never arbitrary HTML or full bodies.
async function upstreamError(response){
  const diagnostics={serverDate:response.headers.get('date'),requestId:response.headers.get('cf-ray')};
  if(!response.headers.get('content-type')?.toLowerCase().includes('application/json')||!response.body){try{await response.body?.cancel()}catch(error){}return diagnostics;}
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024){diagnostics.upstreamMessage='Resposta de erro maior que o limite de diagnóstico';return diagnostics}chunks.push(value)}
    const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}
    const text=new TextDecoder().decode(buffer);
    const data=JSON.parse(text);
    if(typeof data?.message==='string')diagnostics.upstreamMessage=data.message.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200);
  }catch(error){/* Keep HTTP classification even if the error body is unreadable. */}
  finally{try{await reader.cancel()}catch(error){}reader.releaseLock()}
  return diagnostics;
}
async function fetchCandles(symbol,now=Date.now()){
  const window=candleWindow(now);
  const url=new URL('https://api.exchange.coinbase.com/products/'+symbol.replace('USD','-USD')+'/candles');
  url.search=new URLSearchParams({granularity:'60',start:new Date(window.start).toISOString(),end:new Date(window.end).toISOString()});
  let response;
  try{response=await fetch(url,{headers:{Accept:'application/json','User-Agent':COINBASE_USER_AGENT},signal:AbortSignal.timeout(8000)});}catch(error){fail('API_NETWORK','Coinbase: falha de conexão ou tempo esgotado');}
  const api={requestUserAgent:COINBASE_USER_AGENT,httpStatus:response.status,cacheStatus:response.headers.get('cf-cache-status'),cacheAge:response.headers.get('age'),retryAfter:response.headers.get('retry-after'),windowStart:window.start,windowEnd:window.end};
  if(!response.ok){const details=await upstreamError(response);fail('API_HTTP','Coinbase HTTP '+response.status+(details.upstreamMessage?': '+details.upstreamMessage:''),{...api,...details})}
  let raw;
  try{raw=await response.json()}catch(error){fail('INVALID_RESPONSE','Coinbase: JSON inválido',api)}
  try{const data=validateCandles(raw,Date.now(),window);return {...data,diagnostics:{...api,...data.diagnostics}}}catch(error){error.diagnostics={...api,...error.diagnostics};throw error}
}
async function methodologyReady(env){const columns=await env.DB.prepare('PRAGMA table_info(observations)').all();return columns.results.some(x=>x.name==='methodology_version')}
const LEASE_MS=180000, SLOT_MS=300000, STALE_MS=600000;
function changes(result){return Number(result.meta?.changes??result.changes??0)}
async function controlReady(env){return !!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collector_control'").first()}
async function controlRow(env){return env.DB.prepare("SELECT * FROM collector_control WHERE provider='coinbase'").first()}
function decodeState(row){try{return JSON.parse(row?.state||'{}')}catch(error){return {}}}
function retryAfterUntil(value,now){
  if(typeof value!=='string'||!value.trim())return null;
  const text=value.trim();let until;
  if(/^\d+$/.test(text))until=now+Number(text)*1000;
  else if(/^[A-Za-z]{3},/.test(text))until=Date.parse(text);
  else return null;
  return Number.isSafeInteger(until)&&until>=now&&until<=8640000000000000?until:null;
}
function cooldownUntil(value,now,strikes){
  const explicit=retryAfterUntil(value,now);
  // No in-invocation retry. Default backoff: 5,10,20,40,60 minutes.
  return explicit===null?now+Math.min(3600000,300000*2**Math.min(Math.max(strikes-1,0),4)):Math.max(now+60000,explicit);
}
async function requireLease(env,token){
  const row=await controlRow(env);
  if(row?.lease_token!==token||row.lease_until<=Date.now())fail('LEASE_LOST','Execução substituída ou prazo de execução encerrado');
}
async function storeControl(env,token,state,until){
  const r=await env.DB.prepare("UPDATE collector_control SET state=?,cooldown_until=? WHERE provider='coinbase' AND lease_token=? AND lease_until>?").bind(JSON.stringify(state),until,token,Date.now()).run();
  if(!changes(r))fail('LEASE_LOST','Controle de coleta pertence a outra execução');
}
function assetState(state,symbol){
  state.assets??={};state.assets[symbol]??={lastSuccessAt:null,lastCandleAt:null,lastAttemptAt:null,lastError:null,http429:0,http400:0,networkErrors:0};return state.assets[symbol];
}
async function healthData(env){
  const now=Date.now();
  const last=await env.DB.prepare('SELECT started_at,report FROM collector_runs ORDER BY started_at DESC LIMIT 1').first();
  const schema=await controlReady(env),row=schema?await controlRow(env):null,state=decodeState(row);
  const assets=SYMBOLS.map(symbol=>{
    const item=assetState(state,symbol),age=item.lastCandleAt===null?null:Math.max(0,Math.floor((now-item.lastCandleAt)/1000));
    const fresh=item.lastSuccessAt!==null&&now-item.lastSuccessAt<=STALE_MS&&age!==null&&age<=STALE_MS/1000;
    return {symbol,...item,ageSeconds:age,fresh};
  });
  const delayed=!last||now-last.started_at>STALE_MS;
  const cooling=(row?.cooldown_until||0)>now,valid=assets.filter(x=>x.fresh&&!x.lastError).length;
  const hasSuccess=assets.some(x=>x.lastSuccessAt!==null);
  const providerState=cooling?'cooldown':valid===3&&!delayed?'operational':valid>0&&!delayed?'partial':hasSuccess&&assets.every(x=>!x.fresh)?'stale':'unavailable';
  const labels={operational:'Operacional',partial:'Parcialmente operacional',cooldown:'Aguardando limite da API',stale:'Dados desatualizados',unavailable:'Indisponível'};
  return {ok:providerState==='operational',workerOk:true,database:true,version:VERSION,methodology_version:methodologyVersion,methodologyReady:await methodologyReady(env),controlReady:schema&&!!row,providerState,providerLabel:labels[providerState],cooldownUntil:row?.cooldown_until||0,cooldownActive:cooling,leaseActive:!!row&&row.lease_until>now,metricsSince:state.metricsSince||null,totals:assets.reduce((s,x)=>({http429:s.http429+x.http429,http400:s.http400+x.http400,networkErrors:s.networkErrors+x.networkErrors}),{http429:0,http400:0,networkErrors:0}),assets,runAgeSeconds:last?Math.max(0,Math.round((now-last.started_at)/1000)):null,scheduleDelayed:delayed,last_run:last||null,at:now};
}
async function collect(env,{pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const startedAt=Date.now(),report=[];
  const ready=await methodologyReady(env);
  if(!ready||!await controlReady(env)){
    const code=!ready?'METHODOLOGY_MIGRATION_REQUIRED':'CONTROL_MIGRATION_REQUIRED';
    const report=SYMBOLS.map(symbol=>({symbol,version:VERSION,code,error:'Migração pendente; nenhuma consulta à Coinbase realizada'}));
    await env.DB.prepare('INSERT INTO collector_runs(started_at,report) VALUES(?,?)').bind(startedAt,JSON.stringify(report)).run();return report;
  }
  const token=crypto.randomUUID(),slot=Math.floor(startedAt/SLOT_MS);
  const acquired=await env.DB.prepare("UPDATE collector_control SET lease_token=?,lease_until=?,last_slot=? WHERE provider='coinbase' AND lease_until<=? AND last_slot<?").bind(token,startedAt+LEASE_MS,slot,startedAt,slot).run();
  if(!changes(acquired)){console.info(JSON.stringify({event:'collection_skipped',slot,version:VERSION}));return [{code:'COLLECTION_SKIPPED',reason:'Execução concorrente ou intervalo já processado',version:VERSION}];}
  const row=await controlRow(env),state=decodeState(row);state.metricsSince??=startedAt;
  let coolingUntil=row.cooldown_until,attempts=0;
  try{
    const order=SYMBOLS.map((_,i)=>SYMBOLS[(slot+i)%SYMBOLS.length]);
    for(const symbol of order){
      try{
        if(Date.now()<coolingUntil){report.push({symbol,version:VERSION,code:'COOLDOWN',deferred:true,cooldownUntil:coolingUntil,error:'Aguardando limite da API; chamada adiada'});continue}
        if(attempts++)await pause(1000);
        await requireLease(env,token);
        assetState(state,symbol).lastAttemptAt=Date.now();
        const {rows,diagnostics}=await fetchCandles(symbol);
        const last=rows.at(-1);
        await requireLease(env,token);
        // Preserve collector's historical EMA tie rule; scanner uses neutral (0).
        const reading=analyzeCandles(rows,{now:Date.now(),timeKind:'close-ms',tieDirection:-1});
        const {aligned,direction}=reading;
        if(aligned)await env.DB.prepare('INSERT OR IGNORE INTO observations(symbol,time,reference_price,direction,methodology_version) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM collector_control WHERE provider=\'coinbase\' AND lease_token=? AND lease_until>?)').bind(symbol,last.time,last.close,direction,methodologyVersion,token,Date.now()).run();
        const pending=await env.DB.prepare('SELECT * FROM observations o WHERE symbol=? AND time>=? AND (SELECT COUNT(*) FROM results r WHERE r.symbol=o.symbol AND r.time=o.time)<3').bind(symbol,startedAt-7200000).all();
        const closes=new Map(rows.map(x=>[x.time,x.close]));
        let evaluated=0;
        for(const o of pending.results){
          if(!(o.reference_price>0)||!Number.isFinite(o.reference_price)||![1,-1].includes(o.direction))continue;
          for(const horizon of [1,3,5]){
            const target=o.time+horizon*MINUTE;
            if(target>last.time||!Array.from({length:horizon+1},(_,i)=>closes.has(o.time+i*MINUTE)).every(Boolean))continue;
            await env.DB.prepare('INSERT OR IGNORE INTO results(symbol,time,horizon,directional_pct) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM collector_control WHERE provider=\'coinbase\' AND lease_token=? AND lease_until>?)').bind(symbol,o.time,horizon,(closes.get(target)/o.reference_price-1)*100*o.direction,token,Date.now()).run();
            evaluated++;
          }
        }
        Object.assign(assetState(state,symbol),{lastSuccessAt:Date.now(),lastCandleAt:last.time,lastError:null});
        report.push({symbol,version:VERSION,methodology_version:methodologyVersion,ema9:reading.ema9,ema21:reading.ema21,rsi14:reading.rsi14,direction,aligned,...diagnostics,evaluated});
      }catch(error){
        const item={symbol,version:VERSION,...error.diagnostics,code:error.code||'STORAGE_ERROR',error:String(error).slice(0,200)};
        const metric=assetState(state,symbol);metric.lastError={code:item.code,httpStatus:item.httpStatus||null,at:Date.now()};
        if(item.httpStatus===400)metric.http400++;
        if(item.code==='API_NETWORK')metric.networkErrors++;
        if(item.httpStatus===429){metric.http429++;state.consecutive429=(state.consecutive429||0)+1;coolingUntil=cooldownUntil(item.retryAfter,Date.now(),state.consecutive429);item.cooldownUntil=coolingUntil;await storeControl(env,token,state,coolingUntil);}
        report.push(item);console.error(JSON.stringify({event:'collector_error',...item}));
      }
    }
  }
  finally{
    state.lastCompletedAt=Date.now();
    if(report.length===SYMBOLS.length&&report.every(x=>!x.error))state.consecutive429=0;
    // One transaction: journal and state must belong to the same current lease.
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO collector_runs(started_at,report) SELECT ?,? WHERE EXISTS(SELECT 1 FROM collector_control WHERE provider='coinbase' AND lease_token=? AND lease_until>?)").bind(startedAt,JSON.stringify(report),token,Date.now()),
      env.DB.prepare("UPDATE collector_control SET state=?,cooldown_until=?,lease_until=0,lease_token=NULL WHERE provider='coinbase' AND lease_token=? AND lease_until>?").bind(JSON.stringify(state),coolingUntil,token,Date.now())
    ]);
  }
  return report;
}
const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'https://radar-de-mercado-preview.rvc3426.workers.dev'};
export default {async scheduled(event,env,ctx){ctx.waitUntil(collect(env))},async fetch(request,env){const path=new URL(request.url).pathname;if(request.method!=='GET')return new Response('Method not allowed',{status:405});const historical=await handleHistorical(request,env,headers);if(historical)return historical;if(path==='/probe'){
 const data=await healthData(env);
 return Response.json({checks:data.assets.map(x=>({...x,ok:x.fresh&&!x.lastError&&!data.cooldownActive,error:x.lastError?('Última tentativa: '+(x.lastError.httpStatus||x.lastError.code)):undefined})),at:data.at,version:VERSION,source:'Coinbase Exchange USD spot',mode:'stored',providerState:data.providerState,cooldownUntil:data.cooldownUntil,note:'Diagnóstico armazenado. Nenhuma consulta à Coinbase foi realizada.'},{headers})
}if(path==='/health')return Response.json(await healthData(env),{headers});if(path==='/observations'){
  const ready=await methodologyReady(env);
  const versionColumn=ready?'o.methodology_version':'NULL';
  // Limit observations before the JOIN: never truncate an observation's horizons.
  const rows=await env.DB.prepare('WITH recent AS (SELECT * FROM observations ORDER BY time DESC,symbol LIMIT 180) SELECT o.symbol,o.time,o.reference_price,o.direction,'+versionColumn+' AS methodology_version,r.horizon,r.directional_pct FROM recent o LEFT JOIN results r ON o.symbol=r.symbol AND o.time=r.time ORDER BY o.time DESC,o.symbol,r.horizon').all();
  return Response.json({observations:rows.results,methodology_version:methodologyVersion,methodologyReady:ready,at:Date.now(),limitObservations:180,note:'Educational price references, not executable entries. Legacy NULL methodology is unknown; results inherit the observation methodology. Recent window only.'},{headers})
}return new Response('Not found',{status:404})}};
