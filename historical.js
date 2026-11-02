// Read-only historical API. No market fetch, DDL or data mutation.
const SYMBOLS=['BTCUSD','ETHUSD','SOLUSD'],HORIZONS=[1,3,5],DAY=86400000,MAX_OBSERVATIONS=5000,MAX_RUNS=2200;
class InputError extends Error{constructor(message,status=400){super(message);this.status=status}}
function integer(value,fallback,min,max){if(value===null)return fallback;if(!/^\d+$/.test(value))throw new InputError('Parâmetro inteiro inválido');const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw new InputError('Parâmetro fora do limite');return n}
function timestamp(value,fallback){if(value===null)return fallback;const n=/^\d+$/.test(value)?Number(value):/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value)?Date.parse(value):NaN;if(!Number.isSafeInteger(n)||n<0||n>8640000000000000||(!/^\d+$/.test(value)&&new Date(n).toISOString().slice(0,10)!==value.slice(0,10)))throw new InputError('Data inválida; use UTC ou milissegundos');return n}
export function parseFilters(url,now=Date.now()){
 if(url.search.length>4096)throw new InputError('Consulta muito longa');const p=url.searchParams;
 const to=timestamp(p.get('to'),now),from=timestamp(p.get('from'),to-7*DAY);
 if(to>now||from>to||to-from>366*DAY)throw new InputError('Período inválido: máximo 366 dias, sem datas futuras');
 const symbol=p.get('symbol')||null;if(symbol&&!SYMBOLS.includes(symbol))throw new InputError('Ativo inválido');
 const horizon=integer(p.get('horizon'),null,1,5);if(horizon&&!HORIZONS.includes(horizon))throw new InputError('Horizonte inválido');
 const methodology=p.get('methodology')||'v5.7';if(!/^[A-Za-z0-9_.-]{1,40}$/.test(methodology))throw new InputError('Metodologia inválida');
 const order=p.get('order')||'desc';if(!['asc','desc'].includes(order))throw new InputError('Ordenação inválida');
 const costText=p.get('cost')??'0.2';if(!/^\d+(?:\.\d{1,3})?$/.test(costText)||Number(costText)>5)throw new InputError('Custo total deve estar entre 0 e 5%');
 return {from,to,symbol,horizon,methodology,order,cost:Number(costText)};
}
function condition(f){const clauses=['o.time>=?','o.time<=?'],params=[f.from,f.to];if(f.symbol){clauses.push('o.symbol=?');params.push(f.symbol)}if(f.methodology==='legacy-unversioned')clauses.push("(o.methodology_version IS NULL OR o.methodology_version='')");else{clauses.push('o.methodology_version=?');params.push(f.methodology)}return {sql:clauses.join(' AND '),params}}
const versionOf=x=>x.methodology_version||'legacy-unversioned';
function hydrate(rows,horizon){
 const map=new Map();for(const x of rows){const key=x.symbol+':'+x.time;if(!map.has(key))map.set(key,{symbol:x.symbol,time:x.time,reference_price:x.reference_price,direction:x.direction,methodology_version:versionOf(x),source:versionOf(x)==='v5.7'?'Coinbase Exchange':'Origem histórica não versionada',quote:versionOf(x)==='v5.7'?'USD':null,study_type:versionOf(x)==='v5.7'?'prospective':'unverified-legacy',results:{}});if(x.horizon!==null&&x.horizon!==undefined&&Number.isFinite(x.directional_pct))map.get(key).results[x.horizon]=x.directional_pct}
 const horizons=horizon?[horizon]:HORIZONS;
 return [...map.values()].map(x=>({...x,evaluated_horizons:horizons.filter(h=>Number.isFinite(x.results[h])),pending_horizons:horizons.filter(h=>!Number.isFinite(x.results[h]))}));
}
function signature(f){return JSON.stringify({from:f.from,to:f.to,symbol:f.symbol,horizon:f.horizon,methodology:f.methodology,order:f.order})}
function encodeCursor(x){return btoa(JSON.stringify(x)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function cursorOf(text,f){if(!text)return null;try{if(text.length>2048||!/^[A-Za-z0-9_-]+$/.test(text))throw Error();const c=JSON.parse(atob(text.replaceAll('-','+').replaceAll('_','/')));if(c.v!==1||c.query!==signature(f)||!Number.isSafeInteger(c.time)||c.time<f.from||c.time>f.to||!SYMBOLS.includes(c.symbol))throw Error();return c}catch(error){throw new InputError('Cursor inválido ou filtros alterados; reinicie a paginação')}}
async function observationCount(env,f){const w=condition(f);return (await env.DB.prepare('SELECT COUNT(*) total FROM observations o WHERE '+w.sql).bind(...w.params).first()).total}
function joinedSql(where,order,limit){return `WITH page AS (SELECT o.* FROM observations o WHERE ${where} ORDER BY o.time ${order},o.symbol ASC LIMIT ?) SELECT o.symbol,o.time,o.reference_price,o.direction,o.methodology_version,r.horizon,r.directional_pct FROM page o LEFT JOIN results r ON r.symbol=o.symbol AND r.time=o.time${limit?' AND r.horizon=?':''} ORDER BY o.time ${order},o.symbol ASC,r.horizon ASC`}
export async function history(env,url,now=Date.now()){
 const f=parseFilters(url,now),limit=integer(url.searchParams.get('limit'),25,1,100),cursor=cursorOf(url.searchParams.get('cursor'),f),w=condition(f);
 if(cursor){w.sql+=` AND (o.time${f.order==='asc'?'>':'<'}? OR (o.time=? AND o.symbol>?))`;w.params.push(cursor.time,cursor.time,cursor.symbol)}
 const total=await observationCount(env,f),params=[...w.params,limit+1];if(f.horizon)params.push(f.horizon);
 const rows=await env.DB.prepare(joinedSql(w.sql,f.order.toUpperCase(),f.horizon)).bind(...params).all();const all=hydrate(rows.results,f.horizon),items=all.slice(0,limit),last=items.at(-1);
 const methodologies=await env.DB.prepare("SELECT DISTINCT COALESCE(NULLIF(methodology_version,''),'legacy-unversioned') methodology FROM observations ORDER BY methodology LIMIT 30").all();
 return {api_version:'v6.0',generated_at:now,filters:f,total,limit,items,next_cursor:all.length>limit?encodeCursor({v:1,time:last.time,symbol:last.symbol,query:signature(f)}):null,methodologies:methodologies.results.map(x=>x.methodology),source:'Observações armazenadas no D1; nenhum acesso ao provedor',period_basis:'Instante da observação, UTC. Resultados disponíveis na data da consulta.'};
}
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2};
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const dayOf=t=>new Date(t).toISOString().slice(0,10);
function validObservation(x){return SYMBOLS.includes(x.symbol)&&Number.isSafeInteger(x.time)&&x.time%60000===0&&Number.isFinite(x.reference_price)&&x.reference_price>0&&[1,-1].includes(x.direction)}
export function summarizeHistory(items,f){
 const compatible=items.filter(x=>versionOf(x)===f.methodology),seen=new Set(),unique=compatible.filter(x=>{const key=x.symbol+':'+x.time;if(seen.has(key))return false;seen.add(key);return true}),valid=unique.filter(validObservation),horizons=f.horizon?[f.horizon]:HORIZONS;
 const totals={observations:items.length,valid:valid.length,invalid:unique.length-valid.length,duplicates:compatible.length-unique.length,excluded_methodology:items.length-compatible.length,evaluated:0,partial:0,pending:0};
 for(const x of valid){const count=horizons.filter(h=>Number.isFinite(x.results[h])).length;if(count===horizons.length)totals.evaluated++;else{totals.pending++;if(count)totals.partial++}}
 const days=new Map();for(const x of valid){const day=dayOf(x.time);if(!days.has(day))days.set(day,{day,observations:0,evaluated:0,pending:0});const d=days.get(day);d.observations++;if(horizons.every(h=>Number.isFinite(x.results[h])))d.evaluated++;else d.pending++}
 const groups=[];
 for(const symbol of (f.symbol?[f.symbol]:SYMBOLS))for(const horizon of horizons){
  const rows=valid.filter(x=>x.symbol===symbol).sort((a,b)=>a.time-b.time),selected=[];let end=-Infinity;
  // Select before looking at outcomes: pending windows also block overlapping entries.
  for(const x of rows)if(x.time>=end){selected.push(x);end=x.time+horizon*60000}
  const evaluated=selected.filter(x=>Number.isFinite(x.results[horizon])),values=evaluated.map(x=>x.results[horizon]),net=values.map(v=>v-f.cost),n=values.length;
  const favorable=values.filter(v=>v>0).length,unfavorable=values.filter(v=>v<0).length,ties=n-favorable-unfavorable,positiveNet=net.filter(v=>v>0).length;
  const evolution=new Map();for(const x of selected){const day=dayOf(x.time);if(!evolution.has(day))evolution.set(day,{day,selected:0,evaluated:0,values:[]});const d=evolution.get(day);d.selected++;if(Number.isFinite(x.results[horizon])){d.evaluated++;d.values.push(x.results[horizon])}}
  const bins=[[-Infinity,-1],[-1,-.5],[-.5,-.2],[-.2,0],[0,.2],[.2,.5],[.5,1],[1,Infinity]].map(([lo,hi])=>({lower:Number.isFinite(lo)?lo:null,upper:Number.isFinite(hi)?hi:null,count:values.filter(v=>v>=lo&&v<hi).length}));
  groups.push({symbol,horizon,methodology:f.methodology,cost:f.cost,observations:rows.length,selected:selected.length,excluded_overlap:rows.length-selected.length,evaluated:n,pending:selected.length-n,favorable,unfavorable,ties,favorable_pct:n?100*favorable/n:null,unfavorable_pct:n?100*unfavorable/n:null,net_positive:positiveNet,net_positive_pct:n?100*positiveNet/n:null,mean_gross:mean(values),median_gross:median(values),mean_net:mean(net),median_net:median(net),baseline_mean_net:mean(evaluated.map(x=>x.results[horizon]*x.direction-f.cost)),insufficient:n<30,distribution:n>=30?bins:[],daily:[...evolution.values()].map(d=>({day:d.day,selected:d.selected,evaluated:d.evaluated,pending:d.selected-d.evaluated,mean_gross:mean(d.values),mean_net:d.values.length?mean(d.values)-f.cost:null}))});
 }
 return {totals,groups,daily:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)),selection:'Greedy cronológica por ativo/horizonte e metodologia, incluindo janelas pendentes antes de selecionar. Sem sobreposição dentro do recorte filtrado.',study_type:f.methodology==='v5.7'?'prospective':'unverified-legacy',limitations:['Descritivo, sem probabilidade futura ou recomendação.','Amostra de 30 é filtro inicial, não validação estatística.','Períodos e ativos podem compartilhar contexto; não somar amostras entre horizontes.','Baseline é compra simples nos mesmos instantes selecionados, não compra contínua.','Legados sem metadados não são reclassificados. Backtests locais não entram nesta análise.']};
}
export async function statistics(env,url,now=Date.now()){
 const f=parseFilters(url,now);if(f.to-f.from>31*DAY)throw new InputError('Estatísticas limitadas a 31 dias; reduza o período');
 const total=await observationCount(env,f);if(total>MAX_OBSERVATIONS)throw new InputError('Mais de 5.000 observações; reduza o período ou filtre um ativo',422);
 const w=condition(f),params=[...w.params,MAX_OBSERVATIONS+1];if(f.horizon)params.push(f.horizon);
 const rows=await env.DB.prepare(joinedSql(w.sql,'ASC',f.horizon)).bind(...params).all(),items=hydrate(rows.results,f.horizon);
 if(items.length>MAX_OBSERVATIONS)throw new InputError('Amostra excedeu limite durante consulta; reduza o período',422);
 return {api_version:'v6.0',generated_at:now,filters:f,source:'D1 / Coinbase USD para v5.7',...summarizeHistory(items,f)};
}
function outcome(x){if(x.code==='COOLDOWN'||x.deferred)return 'cooldown';if(x.httpStatus===429)return 'http429';if(x.httpStatus===400)return 'http400';if(x.code==='API_NETWORK')return 'network';if(x.error)return ['STALE_CANDLE','INSUFFICIENT_HISTORY','MISSING_CANDLES','INVALID_PRICE','INVALID_CANDLE','INVALID_TIMESTAMP','CONFLICTING_DUPLICATE','INVALID_RESPONSE'].includes(x.code)?'rejected':'otherError';return x.httpStatus===200&&Number.isFinite(x.latest)&&x.candles>=40?'success':'unknown'}
export function summarizeRuns(runs,from,to,instrumentedFrom=from){
 const slot=300000,start=Math.max(Math.ceil(from/slot),Math.floor(instrumentedFrom/slot)),end=Math.floor((to+1)/slot),expected=Math.max(0,end-start),bySlot=new Map(),cooldownIntervals=[];
 const latest=[...runs].sort((a,b)=>b.started_at-a.started_at)[0]||null;const successes=Object.fromEntries(SYMBOLS.map(s=>[s,null]));
 for(const run of [...runs].sort((a,b)=>a.started_at-b.started_at)){
  let report=[];try{report=JSON.parse(run.report);if(!Array.isArray(report))report=[]}catch(error){}
  const key=Math.floor(run.started_at/slot);if(key>=start&&key<end)bySlot.set(key,{...run,report});
  for(const x of report){if(SYMBOLS.includes(x.symbol)&&outcome(x)==='success')successes[x.symbol]=run.started_at;if(x.httpStatus===429&&Number.isFinite(x.cooldownUntil)&&x.cooldownUntil>run.started_at)cooldownIntervals.push([Math.max(from,run.started_at),Math.min(to+1,x.cooldownUntil)])}
 }
 const empty=()=>({expected:0,success:0,http400:0,http429:0,network:0,cooldown:0,rejected:0,otherError:0,unknown:0,missing:0,missingMinutes:0,duplicateCandles:0});
 const assets=Object.fromEntries(SYMBOLS.map(s=>[s,{symbol:s,...empty(),last_success_in_period:successes[s]}])),daily=new Map();let lastAllSuccess=null;
 for(let key=start;key<end;key++){
  const day=dayOf(key*slot);if(!daily.has(day))daily.set(day,{day,...empty()});const d=daily.get(day),run=bySlot.get(key);
  let all=true;
  for(const symbol of SYMBOLS){const a=assets[symbol];a.expected++;d.expected++;const item=run?.report.find(x=>x.symbol===symbol),kind=item?outcome(item):run?'unknown':'missing';a[kind]++;d[kind]++;for(const [target,source] of [['missingMinutes','missing'],['duplicateCandles','duplicates']]){const count=Number.isSafeInteger(item?.[source])&&item[source]>=0?item[source]:0;a[target]+=count;d[target]+=count}if(kind!=='success')all=false}
  if(all)lastAllSuccess=run.started_at;
 }
 const intervals=[];for(const [a,b] of cooldownIntervals.sort((a,b)=>a[0]-b[0])){if(b<=a)continue;const last=intervals.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else intervals.push([a,b])}
 return {instrumented_from:instrumentedFrom,expected_slots:expected,recorded_slots:bySlot.size,last_run:latest?{started_at:latest.started_at}:null,last_all_success_in_complete_slots:lastAllSuccess,assets:Object.values(assets).map(a=>({...a,availability_pct:a.expected?100*a.success/a.expected:null})),daily:[...daily.values()].map(d=>({...d,availability_pct:d.expected?100*d.success/d.expected:null})),cooldown:{periods:intervals.length,total_seconds:intervals.reduce((n,[a,b])=>n+(b-a)/1000,0),recent:intervals.slice(-50).map(([start,end])=>({start,end}))},note:'Disponibilidade = slots completos com candles válidos / slots esperados por ativo. Cooldown não é erro HTTP; slot ausente não prova erro de rede. Intervalo atual incompleto excluído.'};
}
export async function monitoring(env,url,now=Date.now()){
 const p=url.searchParams,to=timestamp(p.get('to'),now),from=timestamp(p.get('from'),to-DAY);if(from>to||to>now||to-from>7*DAY)throw new InputError('Monitoramento limitado a sete dias');
 const count=await env.DB.prepare('SELECT COUNT(*) total FROM collector_runs WHERE started_at>=? AND started_at<=?').bind(from,to).first();if(count.total>MAX_RUNS)throw new InputError('Mais de 2.200 execuções; reduza o período',422);
 const first=await env.DB.prepare('SELECT MIN(started_at) started_at FROM collector_runs').first();
 const r=await env.DB.prepare('SELECT started_at,report FROM collector_runs WHERE started_at>=? AND started_at<=? ORDER BY started_at ASC LIMIT ?').bind(from,to,MAX_RUNS+1).all();if(r.results.length>MAX_RUNS)throw new InputError('Limite de execuções excedido',422);
 return {api_version:'v6.0',generated_at:now,source:'collector_runs no D1; sem requisições Coinbase',from,to,recorded_runs:count.total,...summarizeRuns(r.results,from,to,first.started_at??to+300000)};
}
export async function handleHistorical(request,env,headers){
 const url=new URL(request.url);if(!['/history','/statistics','/collector-history'].includes(url.pathname))return null;
 try{const data=await ({'/history':history,'/statistics':statistics,'/collector-history':monitoring}[url.pathname])(env,url);return Response.json(data,{headers:{...headers,'cache-control':url.pathname==='/history'?'no-store':'public, max-age=30'}})}
 catch(error){const status=error instanceof InputError?error.status:503;if(status===503)console.error('historical_api_unavailable');return Response.json({api_version:'v6.0',error:{code:status===503?'DATA_UNAVAILABLE':'INVALID_QUERY',message:status===503?'Histórico indisponível. Tente novamente.':error.message}},{status,headers})}
}
