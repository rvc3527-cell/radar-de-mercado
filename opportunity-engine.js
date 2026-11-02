/* Deterministic educational observation policy. No network, trades or probabilities. */
(function (root) {
  'use strict';
  const POLICY = 'v7.0-observe-1';
  const MATH = 'v5.7';
  const MINUTE = 60000;
  const RULES = Object.freeze({minCandles:60,maxAgeMs:120000,maxVolatility:0.35,maxExtension:0.5,maxMove5:1,minSeparation:0.015,minImpulse:0.03,cost:0.2,exploration:60,validation:30,minDays:7});
  const instrument = symbol => ({provider:'Binance',market:'spot',quote:'USDT',symbol,methodology:MATH});
  const scopeKey = x => [x?.provider,x?.market,x?.quote,x?.symbol,x?.methodology].join(':');
  const supported = x => x?.provider==='Binance' && x.market==='spot' && x.quote==='USDT' && x.methodology===MATH && ['BTCUSDT','ETHUSDT','SOLUSDT'].includes(x.symbol);
  const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
  const median = a => {if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return (b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2};
  function validRecord(x) {
    return supported(x?.instrument) && x.policy===POLICY && x.study_type==='prospective-local' &&
      Number.isSafeInteger(x.time) && x.time>0 && x.time%MINUTE===0 && Number.isSafeInteger(x.observed_at) &&
      x.observed_at>=x.time && x.observed_at<x.time+30000 && Number.isFinite(x.reference_price) && x.reference_price>0 &&
      [1,-1].includes(x.direction) && x.results && typeof x.results==='object';
  }
  function resultAt(x,h,asOf) {
    const r=x.results[h];
    return r && Number.isFinite(r.pct) && r.target_time===x.time+h*MINUTE && Number.isSafeInteger(r.evaluated_at) && r.evaluated_at>=r.target_time+5000 && r.evaluated_at<=asOf ? r.pct : null;
  }
  function evidence(records,market,direction,asOf) {
    const seen=new Set();
    const candidates=records.filter(x=>validRecord(x) && x.technical_ready===true && x.time<asOf && x.observed_at<=asOf && x.direction===direction && scopeKey(x.instrument)===scopeKey(market)).sort((a,b)=>a.time-b.time).filter(x=>{const key=scopeKey(x.instrument)+x.time;if(seen.has(key))return false;seen.add(key);return true});
    const windows=[3,5,1].map(horizon=>{
      const selected=[];let end=-Infinity;
      for(const x of candidates)if(x.time>=end){selected.push(x);end=x.time+horizon*MINUTE}
      // Fixed first cohort, including missing outcomes: never choose by outcome availability.
      const cohort=selected.slice(0,RULES.exploration+RULES.validation),days=new Set(cohort.map(x=>new Date(x.time).toISOString().slice(0,10))).size;
      const values=cohort.map(x=>resultAt(x,horizon,asOf)),evaluated=values.filter(x=>x!==null).length;
      const complete=cohort.length===90 && evaluated===90 && days>=RULES.minDays;
      const first=complete?values.slice(0,60).map(v=>v-RULES.cost):[],later=complete?values.slice(60,90).map(v=>v-RULES.cost):[];
      const ready=complete && mean(first)>0 && median(first)>0 && mean(later)>0 && median(later)>0;
      return {horizon,selected:cohort.length,evaluated,pending:cohort.length-evaluated,days,ready,exploration_mean_net:mean(first),validation_mean_net:mean(later),cost:RULES.cost};
    });
    return {horizon:windows.find(x=>x.ready)?.horizon??null,windows,kind:'initial-descriptive',note:'Evidência local descritiva; não valida lucro, execução ou probabilidade futura. Prioridade fixa 3, 5, 1 min, sem escolher o maior retorno.'};
  }
  function canonical(raw) {
    if(!Array.isArray(raw))throw Error('Resposta de mercado inválida');
    const seen=new Map();return raw.map(k=>{
      if(!Array.isArray(k)||k.length<6)throw Error('Candle inválido');
      if(k.slice(0,6).some(v=>v===null||typeof v==='boolean'||(typeof v==='string'&&!v.trim())))throw Error('Candle inválido');
      const normalized=k.slice(0,6).map(Number),[ms,open,high,low,close,volume]=normalized;
      if(![ms,open,high,low,close,volume].every(Number.isFinite)||!Number.isSafeInteger(ms)||ms%MINUTE||ms<=0||low<=0||high<low||open<low||open>high||close<low||close>high||volume<0)throw Error('Preço ou horário inválido');
      if(seen.has(ms)&&seen.get(ms).some((v,i)=>v!==normalized[i]))throw Error('Duplicata divergente');seen.set(ms,normalized);
      return {time:ms/1000,open,high,low,close};
    });
  }
  function assess(sample,{now=Date.now(),records=[]}={}) {
    const out={policy:POLICY,instrument:sample.instrument,status:'DATA',direction:0,reference_time:null,reference_price:null,age_ms:null,features:null,checks:{},blockers:[],technical_ready:false,eligible:false,window:null,quality:'Não avaliada',dimensions:[],explanation:'Ainda não há dados suficientes para explicar este movimento.'};
    const block=(code,text)=>out.blockers.push({code,text});
    if(!supported(sample.instrument)){block('SCOPE','Fonte, moeda ou metodologia incompatível. Aguarde dados identificados.');return out}
    let reading;
    try{reading=root.RadarIndicators.analyzeCandles(canonical(sample.raw),{now});}
    catch(error){block(/ausentes/.test(error.message)?'GAPS':'INVALID',/ausentes/.test(error.message)?'Há minutos ausentes no histórico. Aguarde uma sequência completa.':'Os preços ou horários recebidos não puderam ser validados.');return out}
    const rows=reading.rows,values=rows.map(x=>x.close),last=rows.at(-1);
    if(last){out.reference_time=last.time*1000+MINUTE;out.reference_price=last.close;out.age_ms=now-out.reference_time}
    if(rows.length<RULES.minCandles){block('HISTORY','Faltam dados para uma leitura completa.');return out}
    const {ema9,ema21,rsi14,direction,aligned}=reading;out.direction=direction;
    const log=values.slice(-21).slice(1).map((v,i)=>Math.log(v/values.slice(-21)[i]));const avg=mean(log),vol=Math.sqrt(mean(log.map(v=>(v-avg)**2)))*100;
    const move5=(last.close/values.at(-6)-1)*100,separation=Math.abs(ema9/ema21-1)*100,extension=Math.abs(last.close/ema21-1)*100;
    const earlier=root.RadarIndicators.ema(values.slice(0,-3),9),slope=(ema9/earlier-1)*100;
    const fresh=out.age_ms>=5000 && out.age_ms<=RULES.maxAgeMs;
    const trend=direction!==0 && separation>=RULES.minSeparation && slope*direction>0;
    const impulse=aligned && move5*direction>=RULES.minImpulse && (direction===1?rsi14>=52:rsi14<=48);
    const confirmation=direction!==0 && (values.at(-1)-values.at(-2))*direction>0 && (values.at(-2)-values.at(-3))*direction>0;
    const volatility=vol<=RULES.maxVolatility;
    const extended=extension>RULES.maxExtension || Math.abs(move5)>RULES.maxMove5 || (direction===1?rsi14>=68:direction===-1?rsi14<=32:false);
    out.features={ema9,ema21,rsi14,volatility:vol,move5,separation,extension,slope,candles:rows.length,aligned};
    out.checks={fresh,sourceAvailable:sample.apiAvailable!==false,trend,impulse,confirmation,volatility,notExtended:!extended,aligned};
    out.dimensions=[{name:'Tendência',state:trend?'Favorável':'Moderada'},{name:'Força do movimento',state:impulse?'Favorável':'Moderada'},{name:'Confirmação técnica',state:confirmation&&aligned?'Favorável':'Desfavorável'},{name:'Volatilidade',state:volatility?'Favorável':'Desfavorável'}];
    const factors=out.dimensions.filter(x=>x.state==='Favorável').length;
    if(!fresh||sample.apiAvailable===false)out.dimensions=out.dimensions.map(d=>({...d,state:'Não avaliada'}));
    out.quality=fresh&&sample.apiAvailable!==false?(factors===4?'Consistente':factors>=2?'Parcial':'Fraca'):'Não avaliada';
    if(!fresh)block('STALE','Os dados estão atrasados. Aguarde uma atualização válida.');
    if(sample.apiAvailable===false)block('API','A consulta à fonte falhou. A leitura armazenada não confirma uma nova condição.');
    if(!aligned)block('ALIGNMENT','A direção e a força do movimento ainda não concordam.');
    if(!trend)block('TREND','O mercado ainda não apresenta uma direção suficientemente definida.');
    if(!impulse)block('IMPULSE','O movimento ainda não ganhou força suficiente.');
    if(!confirmation)block('CONFIRMATION','Aguarde dois fechamentos consecutivos na mesma direção.');
    if(!volatility)block('VOLATILITY','A oscilação está fora do limite de prudência definido.');
    if(extended)block('EXTENDED','O movimento já avançou muito. Há risco de reversão.');
    if(extended||!volatility)out.quality='Bloqueada';
    out.technical_ready=out.blockers.length===0;
    out.evidence=evidence(records,sample.instrument,direction,now);out.window=out.evidence.horizon;
    if(!out.window)block('EVIDENCE','Tempo de operação ainda não validado. Faltam resultados prospectivos compatíveis após custos.');
    out.eligible=out.blockers.length===0;
    out.status=!fresh?'DATA':sample.apiAvailable===false?'WAIT':extended||!volatility?'RISK':!trend?'INDEFINITE':out.eligible?(direction===1?'UP':'DOWN'):'WAIT';
    out.explanation=out.eligible?'A direção, a força e os fechamentos concordam. Há evidência histórica inicial para acompanhar este prazo, sem garantia de resultado.':out.blockers[0]?.text||'Aguarde novos dados.';
    return out;
  }
  function createRecord(assessment,now,records=[]) {
    if(!assessment.features || !supported(assessment.instrument) || assessment.age_ms<5000 || now-assessment.reference_time>=30000 || now<assessment.reference_time || ![1,-1].includes(assessment.direction))throw Error('Aguarde um candle recém-fechado para registrar antes dos resultados.');
    const key=[scopeKey(assessment.instrument),POLICY,assessment.reference_time].join(':');
    if(records.some(x=>x.id===key))return null;
    return {id:key,instrument:{...assessment.instrument},policy:POLICY,study_type:'prospective-local',time:assessment.reference_time,observed_at:now,reference_price:assessment.reference_price,direction:assessment.direction,technical_ready:assessment.technical_ready,eligible:assessment.eligible,window:assessment.window,features:{...assessment.features},checks:{...assessment.checks},blockers:assessment.blockers.map(x=>({...x})),results:{}};
  }
  function reconcile(records,sample,now) {
    if(!supported(sample.instrument)||sample.apiAvailable===false)return records;
    let rows;try{rows=root.RadarIndicators.closedMinuteCandles(canonical(sample.raw),{now})}catch(error){return records}
    const closed=new Map(rows.map(x=>[x.time*1000+MINUTE,x.close]));
    return records.map(x=>{
      if(!validRecord(x)||scopeKey(x.instrument)!==scopeKey(sample.instrument))return x;
      const results={...x.results};let changed=false;
      for(const h of [1,3,5])if(!Object.hasOwn(results,h) && x.time+h*MINUTE<=now-5000 && closed.has(x.time+h*MINUTE)){
        results[h]={pct:(closed.get(x.time+h*MINUTE)/x.reference_price-1)*100*x.direction,target_time:x.time+h*MINUTE,evaluated_at:now};changed=true;
      }
      return changed?{...x,results}:x;
    });
  }
  function rankGroups(assessments) {
    const groups=new Map();for(const x of assessments){const i=x.instrument,key=[i.provider,i.market,i.quote,i.methodology,x.policy].join(':');if(!groups.has(key))groups.set(key,{scope:key,items:[]});groups.get(key).items.push(x)}
    for(const g of groups.values())g.items.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||Number(!!b.checks.fresh)-Number(!!a.checks.fresh)||Number(b.technical_ready)-Number(a.technical_ready)||Number(a.status==='RISK')-Number(b.status==='RISK')||b.dimensions.filter(x=>x.state==='Favorável').length-a.dimensions.filter(x=>x.state==='Favorável').length||(b.reference_time||0)-(a.reference_time||0)||a.instrument.symbol.localeCompare(b.instrument.symbol));
    return [...groups.values()];
  }
  function planState(record,current,now=Date.now()) {
    if(record?.eligible && record.window && now>=record.time+record.window*MINUTE)return 'ENCERRADO';
    if(record?.eligible && (!current.eligible || record.direction!==current.direction || scopeKey(record.instrument)!==scopeKey(current.instrument)))return 'INVALIDADO';
    return current.eligible?'CONDIÇÕES CONFIRMADAS':'AGUARDANDO';
  }
  root.RadarOpportunity=Object.freeze({policy:POLICY,methodology:MATH,rules:RULES,instrument,scopeKey,supported,assess,evidence,createRecord,reconcile,rankGroups,planState,validRecord});
})(globalThis);
