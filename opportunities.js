/* UI only: consumes the existing scanner feed. Never requests Coinbase or sends orders. */
(function(root){
 'use strict';
 const O=root.RadarOpportunity,KEY='radar-observation-policy-v70',SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT'];
 const names={BTCUSDT:'Bitcoin',ETHUSDT:'Ethereum',SOLUSDT:'Solana'};
 const states={UP:'CONDIÇÕES FAVORÁVEIS PARA OBSERVAR ALTA',DOWN:'CONDIÇÕES FAVORÁVEIS PARA OBSERVAR BAIXA',WAIT:'AGUARDANDO CONFIRMAÇÃO',INDEFINITE:'MERCADO INDEFINIDO',RISK:'RISCO ELEVADO',DATA:'DADOS INSUFICIENTES OU DESATUALIZADOS'};
 const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const num=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const date=t=>Number.isFinite(t)?new Date(t).toLocaleString('pt-BR'):'Sem horário válido';
 const pair=s=>s.replace('USDT','/USDT');
 let records=[],storageIssue='',cache=new Map(),assessments=[],context=null,latestQuery=null,storageBlocked=false;
 try{const raw=localStorage.getItem(KEY);if(raw!==null){const data=JSON.parse(raw);if(data.policy!==O.policy||!Array.isArray(data.records)||data.records.some(x=>!O.validRecord(x)||!Array.isArray(x.blockers)||!x.features||!x.checks))throw Error('Formato não reconhecido');records=data.records}}
 catch(error){storageBlocked=true;storageIssue='O arquivo local não pôde ser lido. Ele foi preservado; novos registros estão bloqueados.'}
 function persist(next){
  if(storageBlocked)return false;
  try{localStorage.setItem(KEY,JSON.stringify({policy:O.policy,records:next}));records=next;return true}catch(error){storageIssue='Não foi possível salvar neste navegador. O histórico anterior foi preservado.';return false}
 }
 function spark(parent,sample){
  if(!sample?.raw)return;let rows;try{rows=root.RadarIndicators.closedMinuteCandles(sample.raw.map(k=>({time:Number(k[0])/1000,close:Number(k[4])}))).slice(-24)}catch(error){return}
  if(rows.length<2)return;
  const values=rows.map(x=>x.close),min=Math.min(...values),span=Math.max(...values)-min||1,svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  svg.setAttribute('viewBox','0 0 160 42');svg.setAttribute('role','img');svg.setAttribute('aria-label','Fechamentos recentes do mesmo ativo; não é uma previsão');svg.setAttribute('class','v7-spark');line.setAttribute('points',values.map((v,i)=>`${i*160/(values.length-1)},${37-(v-min)/span*32}`).join(' '));svg.append(line);parent.append(svg);
 }
 function journal(){
  $('v7JournalCount').textContent=records.length+' análises locais da política 7.0 · '+records.filter(x=>[1,3,5].every(h=>Number.isFinite(x.results[h]?.pct))).length+' com os três prazos conferidos. '+(storageIssue||'Registros anteriores preservados e separados.');
  $('v7Export').disabled=!records.length;const area=$('v7Journal');area.replaceChildren();
  for(const x of records.slice(-6).reverse()){
   const p=node('article',undefined,'v7-journal-row');p.append(node('strong',pair(x.instrument.symbol)+' · '+(x.direction===1?'Alta ↑':'Baixa ↓')),node('small',date(x.time)+' · '+num(x.reference_price)+' USDT · Binance Spot · v5.7 / '+x.policy));
   p.append(node('small',[1,3,5].map(h=>h+' min: '+(Number.isFinite(x.results[h]?.pct)?num(x.results[h].pct,3)+'% bruto':'pendente / sem resultado')).join(' · ')));
   const details=node('details'),summary=node('summary','Critérios registrados e bloqueios');details.append(summary,node('p',x.blockers.map(b=>b.text).join(' ')||'Condições de acompanhamento atendidas.'),node('p','Leitura registrada em '+date(x.observed_at)+'. A amostra não inclui testes retrospectivos.'));p.append(details);area.append(p);
  }
 }
 function render(){
  const ranked=O.rankGroups(assessments).flatMap(g=>g.items),focus=ranked.find(x=>x.eligible);context=focus||ranked[0];
  if(!context)return;
  $('v7AnalysisState').textContent=ranked.every(x=>x.status==='DATA')?'Análise sem dados atuais':focus?'Condições para observar':'Análise concluída · aguardar';
  $('v7Updated').textContent='Binance Spot · USDT · consulta '+(latestQuery?new Date(latestQuery).toLocaleTimeString('pt-BR'):'não confirmada')+' · '+(context.age_ms===null?'sem fechamentos válidos':context.age_ms>120000?'dados atrasados':'fechamentos verificados');
  $('v7Status').textContent=focus?states[focus.status]:ranked.every(x=>x.status==='DATA')?'DADOS INSUFICIENTES':context.status==='RISK'?'AGUARDAR · RISCO ELEVADO':'AGUARDANDO CONFIRMAÇÃO';
  $('v7HeroAsset').textContent=focus?names[focus.instrument.symbol]+' · '+pair(focus.instrument.symbol):'Três ativos monitorados. Uma leitura conservadora.';
  $('v7HeroTitle').textContent=focus?(focus.direction===1?'Alta em observação.':'Baixa em observação.'):'Nenhuma oportunidade confirmada.';
  $('v7HeroReason').textContent=focus?focus.explanation:'Nenhuma oportunidade suficientemente confirmada neste momento. '+context.explanation;
  $('v7HeroPrice').textContent=focus?num(focus.reference_price)+' USDT · último fechamento':'';
  const area=$('v7Plan');area.replaceChildren();
  for(const [title,value] of [['Ativo',pair(context.instrument.symbol)+' · em estudo'],['Direção',context.features?(context.direction===1?'Alta ↑':context.direction===-1?'Baixa ↓':'Indefinida'):'Não avaliada'],['Referência',Number.isFinite(context.reference_price)?num(context.reference_price)+' USDT · '+date(context.reference_time):'Sem preço validado'],['Entrada',context.eligible?'Condição confirmada para acompanhar':context.checks.confirmation?'Fechamentos confirmados; outros bloqueios ativos':'Aguardar fechamentos na mesma direção'],['Janela',context.window?context.window+' min · evidência inicial':'Tempo de operação ainda não validado.']]){const row=node('div');row.append(node('dt',title),node('dd',value));area.append(row)}
  const active=[...records].reverse().find(x=>x.eligible&&O.scopeKey(x.instrument)===O.scopeKey(context.instrument));
  $('v7PlanState').textContent=O.planState(active,context);$('v7PlanReason').textContent=context.explanation;
  const canRecord=!storageBlocked&&records.length<1000&&context.features&&context.direction!==0&&Date.now()-context.reference_time<30000;
  $('v7Record').disabled=!canRecord;
  $('v7RecordStatus').textContent=storageIssue||(canRecord?'Registre agora para conferir somente resultados futuros.':'Aguarde um candle recém-fechado para registrar antes dos resultados.');
  const dims=$('v7Dimensions');dims.replaceChildren();
  for(const d of context.dimensions.length?context.dimensions:['Tendência','Força do movimento','Confirmação técnica','Volatilidade'].map(name=>({name,state:'Não avaliada'}))){const n=node('div',undefined,'v7-dimension'),s=node('strong',d.state);s.dataset.state=d.state;n.append(node('span',d.name),s);dims.append(n)}
  $('v7Quality').textContent=pair(context.instrument.symbol)+' · Qualidade das condições técnicas: '+context.quality+'. Sem percentual de segurança.';
  $('v7ExplanationText').textContent=names[context.instrument.symbol]+': '+context.explanation;
  $('v7Blockers').replaceChildren(...context.blockers.map(b=>node('li',b.text)));
  const details=$('v7TechnicalDetails');details.replaceChildren();
  if(context.features)for(const [name,value] of Object.entries(context.features))details.append(node('p',name+': '+(typeof value==='number'?num(value,5):String(value)),'v7-technical-row'));
  else details.append(node('p','Sem indicadores válidos; não houve classificação favorável.','info'));
  for(const w of context.evidence?.windows||[])details.append(node('p',w.horizon+' min · '+w.evaluated+' / 90 resultados da coorte fixa · '+w.days+' dias · custo total '+num(w.cost)+'% · '+(w.ready?'evidência inicial positiva, sem validar operação real':'evidência insuficiente ou sem resultado consistente'),'v7-technical-row'));
  const list=$('v7Watchlist');list.replaceChildren();
  for(const x of ranked){
   const n=node('article',undefined,'v7-watch-row'),asset=node('div'),price=node('div',undefined,'v7-price-wrap'),meta=node('div',undefined,'v7-meta'),condition=node('div',undefined,'v7-condition-wrap'),graph=node('div');
   asset.append(node('strong',names[x.instrument.symbol]),node('small',pair(x.instrument.symbol)+' · Binance Spot'));
   price.append(node('strong',Number.isFinite(x.reference_price)?num(x.reference_price)+' USDT':'—','v7-price'),node('small',x.features?num(x.features.move5)+'% · últimos 5 min fechados':'Sem variação validada'));
   meta.append(node('strong',x.features?(x.direction===1?'Alta ↑':x.direction===-1?'Baixa ↓':'Indefinida'):'Não avaliada'),node('small','Qualidade: '+x.quality));
   condition.append(node('strong',states[x.status],'v7-condition'),node('small',x.window?x.window+' min · evidência inicial':'Janela ainda não validada'),node('small','Referência: '+date(x.reference_time)));
   if(x.status!=='DATA')spark(graph,cache.get(x.instrument.symbol));
   const button=node('button','Gráfico ↗');button.type='button';button.addEventListener('click',()=>{$('symbol').value=x.instrument.symbol;connect();location.hash='graficos';showDashboardRoute('graficos')});
   // Graph wrapper occupies the dedicated spark column on small screens.
   graph.className='v7-spark-wrap';n.append(asset,graph,price,meta,condition,button);list.append(n);
  }
  journal();
 }
 function recompute(){assessments=SYMBOLS.map(symbol=>O.assess(cache.get(symbol)||{instrument:O.instrument(symbol)},{records,now:Date.now()}));render();if(root.RadarV70AfterScan)root.RadarV70AfterScan()}
 function feed(items){
  const now=Date.now();latestQuery=now;
  for(const symbol of SYMBOLS){const item=items.find(x=>x.symbol===symbol),previous=cache.get(symbol),sample={instrument:O.instrument(symbol),raw:item?.raw??previous?.raw,apiAvailable:item?.raw!==undefined};cache.set(symbol,sample);const next=O.reconcile(records,sample,now);if(next.some((x,i)=>x!==records[i]))persist(next)}
  recompute();
 }
 root.RadarV70Feed=feed;
 root.RadarV70AfterScan=()=>{
  const focus=assessments.find(x=>x.eligible),summary=$('scanDecision');summary.replaceChildren(node('strong',focus?'Observar '+pair(focus.instrument.symbol):'Aguardar — nenhuma oportunidade suficientemente confirmada'),node('small',focus?focus.explanation:'A política 7.0 mantém os bloqueios técnicos e históricos também nesta análise.'));
  document.querySelectorAll('#scanResults .opportunity-card').forEach(card=>{
   const symbol=card.querySelector('.opportunity-heading strong')?.textContent.replace('/',''),a=assessments.find(x=>x.instrument.symbol===symbol);if(!a)return;
   card.querySelector('.opportunity-state').textContent=states[a.status];const values=card.querySelectorAll('.opportunity-grid b');if(values[1])values[1].textContent=a.eligible?'Condições para acompanhar':'Aguardar';if(values[2])values[2].textContent=a.window?a.window+' min · evidência inicial':'Não validada';
  });
 };

 root.RadarV70History=(symbol,raw)=>{const next=O.reconcile(records,{instrument:O.instrument(symbol),raw,apiAvailable:true},Date.now());if(next.some((x,i)=>x!==records[i])){persist(next);recompute()}};
 root.RadarV70=Object.freeze({refresh:recompute,getAssessments:()=>assessments.map(x=>({...x})),getRecords:()=>records.map(x=>({...x}))});
 document.addEventListener('DOMContentLoaded',()=>{
  $('v7Refresh').addEventListener('click',async()=>{if($('scanRefresh').disabled)return;$('v7Refresh').disabled=true;try{await compareAssets()}finally{$('v7Refresh').disabled=false}});
  $('v7Record').addEventListener('click',()=>{try{const entry=O.createRecord(context,Date.now(),records);if(!entry){$('v7RecordStatus').textContent='Esta análise já está registrada; o histórico foi preservado.';return}if(records.length>=1000)throw Error('Limite local atingido; nenhum registro foi apagado.');if(persist([...records,entry])){$('v7RecordStatus').textContent='Análise registrada antes dos resultados. Confira nas próximas atualizações.';journal()}}catch(error){$('v7RecordStatus').textContent=error.message}});
  $('v7Auto').addEventListener('change',()=>{$('scanAuto').checked=$('v7Auto').checked;scheduleScanAuto()});
  $('scanAuto').addEventListener('change',()=>{$('v7Auto').checked=$('scanAuto').checked});
  $('v7Understand').addEventListener('click',()=>{$('v7Technical').open=true});
  $('v7Export').addEventListener('click',()=>{const link=node('a');const url=URL.createObjectURL(new Blob([JSON.stringify({policy:O.policy,study_type:'prospective-local',records},null,2)],{type:'application/json'}));link.href=url;link.download='radar-observacoes-v70.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
  setInterval(()=>{if(document.visibilityState==='visible')recompute()},15000);
  recompute();
 });
})(globalThis);
