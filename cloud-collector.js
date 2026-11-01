// Cloud collector prototype: isolated from production, no trades or order execution.
const SYMBOLS=['BTCUSD','ETHUSD','SOLUSD'];
function ema(a,n){let v=a[0],k=2/(n+1);for(let i=1;i<a.length;i++)v=a[i]*k+v*(1-k);return v}
function rsi(a){let up=0,down=0;for(let i=a.length-14;i<a.length;i++){let d=a[i]-a[i-1];up+=Math.max(d,0);down+=Math.max(-d,0)}return down===0?100:100-100/(1+up/down)}
const MINUTE=60000;
const VERSION='5.6';
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
async function fetchCandles(symbol,now=Date.now()){
  const window=candleWindow(now);
  const url=new URL('https://api.exchange.coinbase.com/products/'+symbol.replace('USD','-USD')+'/candles');
  url.search=new URLSearchParams({granularity:'60',start:new Date(window.start).toISOString(),end:new Date(window.end).toISOString()});
  let response;
  try{response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});}catch(error){fail('API_NETWORK','Coinbase: falha de conexão ou tempo esgotado');}
  const api={httpStatus:response.status,cacheStatus:response.headers.get('cf-cache-status'),cacheAge:response.headers.get('age'),windowStart:window.start,windowEnd:window.end};
  if(!response.ok)fail('API_HTTP','Coinbase HTTP '+response.status,api);
  let raw;
  try{raw=await response.json()}catch(error){fail('INVALID_RESPONSE','Coinbase: JSON inválido',api)}
  try{const data=validateCandles(raw,Date.now(),window);return {...data,diagnostics:{...api,...data.diagnostics}}}catch(error){error.diagnostics={...api,...error.diagnostics};throw error}
}
async function collect(env){
  const startedAt=Date.now(),report=[];
  for(const symbol of SYMBOLS){
    try{
      const {rows,diagnostics}=await fetchCandles(symbol);
      const last=rows.at(-1),prices=rows.map(x=>x.close),strength=rsi(prices),direction=ema(prices,9)>ema(prices,21)?1:-1;
      const aligned=(direction===1&&strength>=50&&strength<70)||(direction===-1&&strength<=50&&strength>30);
      if(aligned)await env.DB.prepare('INSERT OR IGNORE INTO observations(symbol,time,reference_price,direction) VALUES(?,?,?,?)').bind(symbol,last.time,last.close,direction).run();
      const pending=await env.DB.prepare('SELECT * FROM observations WHERE symbol=? AND time>=?').bind(symbol,startedAt-7200000).all();
      const closes=new Map(rows.map(x=>[x.time,x.close]));
      let evaluated=0;
      for(const o of pending.results){
        if(!(o.reference_price>0)||!Number.isFinite(o.reference_price)||![1,-1].includes(o.direction))continue;
        for(const horizon of [1,3,5]){
          const target=o.time+horizon*MINUTE;
          if(target>last.time||!Array.from({length:horizon+1},(_,i)=>closes.has(o.time+i*MINUTE)).every(Boolean))continue;
          await env.DB.prepare('INSERT OR IGNORE INTO results(symbol,time,horizon,directional_pct) VALUES(?,?,?,?)').bind(symbol,o.time,horizon,(closes.get(target)/o.reference_price-1)*100*o.direction).run();
          evaluated++;
        }
      }
      report.push({symbol,version:VERSION,aligned,...diagnostics,evaluated});
    }catch(error){
      const item={symbol,version:VERSION,...error.diagnostics,code:error.code||'STORAGE_ERROR',error:String(error).slice(0,200)};
      report.push(item);console.error(JSON.stringify({event:'collector_error',...item}));
    }
  }
  await env.DB.prepare('INSERT INTO collector_runs(started_at,report) VALUES(?,?)').bind(startedAt,JSON.stringify(report)).run();
  return report;
}
const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'https://radar-de-mercado-preview.rvc3426.workers.dev'};
export default {async scheduled(event,env,ctx){ctx.waitUntil(collect(env))},async fetch(request,env){const path=new URL(request.url).pathname;if(request.method!=='GET')return new Response('Method not allowed',{status:405});if(path==='/probe'){const checks=[];for(const symbol of SYMBOLS){try{const {diagnostics}=await fetchCandles(symbol);checks.push({symbol,ok:true,...diagnostics})}catch(error){checks.push({symbol,ok:false,...error.diagnostics,code:error.code||'API_NETWORK',error:String(error).slice(0,200)})}}return Response.json({checks,at:Date.now(),version:VERSION,source:'Coinbase Exchange USD spot',note:'Read-only upstream quality test; does not record signals.'},{headers})}if(path==='/health'){const last=await env.DB.prepare('SELECT started_at,report FROM collector_runs ORDER BY started_at DESC LIMIT 1').first();return Response.json({ok:true,version:VERSION,database:!!env.DB,runAgeSeconds:last?Math.round((Date.now()-last.started_at)/1000):null,scheduleDelayed:!last||Date.now()-last.started_at>600000,last_run:last||null},{headers})}if(path==='/observations'){const rows=await env.DB.prepare('SELECT o.symbol,o.time,o.reference_price,o.direction,r.horizon,r.directional_pct FROM observations o LEFT JOIN results r ON o.symbol=r.symbol AND o.time=r.time ORDER BY o.time DESC LIMIT 180').all();return Response.json({observations:rows.results,note:'Educational price references, not executable entries.'},{headers})}return new Response('Not found',{status:404})}};
