/* Presentation for bounded, read-only D1 APIs. No market-provider requests. */
(function(root){
 'use strict';
 const BASE='https://radar-cloud-collector-preview.rvc3426.workers.dev';
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const fmt=(n,d=3)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
 const pct=n=>Number.isFinite(n)?(n>0?'+':'')+fmt(n)+'%':'—';
 const date=n=>Number.isFinite(n)?new Date(n).toLocaleString('pt-BR'):'Sem registro no período';
 const label=m=>m==='legacy-unversioned'?'Anterior · não comprovada':m;
 let query=null,cursors=[null],page=0,next=null,busy=false,started=false;
 async function request(path,params){const response=await fetch(BASE+path+'?'+params,{signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok)throw Error(data.error?.message||'Consulta indisponível');return data}
 function table(headers,rows){const t=el('table',undefined,'history-table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');for(const row of rows){const tr=el('tr');row.forEach((value,i)=>{const td=el('td');td.dataset.label=headers[i];if(typeof value==='string')td.textContent=value;else td.append(value);tr.append(td)});body.append(tr)}t.append(body);return t}
 function empty(area,text='Não há registros neste período e metodologia.'){area.replaceChildren(el('p',text,'intelligence-empty'))}
 function detail(main,sub){const n=el('span');n.append(el('strong',main),el('small',sub));return n}
 function statistics(data){
  const area=$('hiSummary');area.replaceChildren();for(const [title,value] of [['Observações',data.totals.observations],['Avaliadas',data.totals.evaluated],['Pendentes',data.totals.pending],['Parciais · nas pendentes',data.totals.partial]]){const card=el('article');card.append(el('small',title),el('strong',String(value)));area.append(card)}
  const groups=data.groups.filter(g=>g.observations);const target=$('hiStatistics');
  if(!groups.length){empty(target);return}
  const rows=groups.map(g=>[detail(g.symbol.replace('USD','/USD')+' · '+g.horizon+' min',label(g.methodology)),detail('n = '+g.evaluated,g.pending+' pendentes · '+g.excluded_overlap+' sobrepostas excluídas'+(g.insufficient?' · Amostra insuficiente':'')),detail(fmt(g.favorable_pct,1)+'% favoráveis',fmt(g.unfavorable_pct,1)+'% desfavoráveis · '+g.ties+' neutros'),detail(pct(g.mean_gross)+' / '+pct(g.median_gross),'Média / mediana brutas'),detail(pct(g.mean_net)+' / '+pct(g.median_net),'Média / mediana após custo de '+fmt(g.cost,3)+'% · '+fmt(g.net_positive_pct,1)+'% positivos'),detail(pct(g.baseline_mean_net),'Compra nos mesmos instantes, após custo')]);
  target.replaceChildren(table(['Ativo / horizonte','Amostra selecionada','Direção observada','Bruto','Após custo simulado','Referência'],rows));
  if(data.totals.invalid)target.prepend(el('p',data.totals.invalid+' observações inválidas excluídas.','history-error'));
 }
 // Bounded SVG bar charts: labels and exact values also available to screen readers.
 function bars(parent,title,items,{percent=false,paired=false,note=''}={}){
  const box=el('article',undefined,'intelligence-chart');box.append(el('h3',title));parent.append(box);
  if(!items.length){empty(box,'Amostra insuficiente para este gráfico. São necessárias 30 avaliações válidas por grupo.');box.prepend(el('h3',title));return}
  box.append(el('p',note));const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');const width=600,row=paired?65:49,height=items.length*row+30,left=100,right=85,plot=width-left-right;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',title+'. '+items.map(x=>x.label+': '+fmt(x.value,percent?3:0)+(percent?'%':'')+(paired?', após custos '+pct(x.net):'')).join('; '));
  const values=items.flatMap(x=>paired?[x.value,x.net]:[x.value]).filter(Number.isFinite),min=Math.min(0,...values),max=Math.max(0,...values),span=max-min||1,scale=v=>left+(v-min)/span*plot,zero=scale(0);
  function add(tag,attrs,text){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n)}
  add('line',{x1:zero,x2:zero,y1:0,y2:height-20});
  items.forEach((x,i)=>{const y=i*row+12;add('text',{x:0,y:y+10},x.label);const draw=(v,dy,cls)=>{if(!Number.isFinite(v))return;add('rect',{x:Math.min(zero,scale(v)),y:y+dy,width:Math.abs(scale(v)-zero),height:paired?14:20,rx:2,class:cls});add('text',{x:width-right+8,y:y+dy+12},percent?pct(v):fmt(v,0))};draw(x.value,0,'gross');if(paired)draw(x.net,20,'net')});
  box.append(svg);
 }
 function charts(data){
  const area=$('hiCharts');area.replaceChildren();const symbol=data.filters.symbol||'BTCUSD',h=data.filters.horizon||5,g=data.groups.find(x=>x.symbol===symbol&&x.horizon===h);
  $('hiChartContext').textContent=label(data.filters.methodology)+' · Distribuição e evolução: '+symbol.replace('USD','/USD')+' / '+h+' min. Coral: bruto; areia: após custos. Comparações usam amostras distintas, sem indicar o melhor ativo futuro.';
  bars(area,'Observações por dia',data.daily.slice(-31).map(x=>({label:x.day.slice(5),value:x.observations})),{note:'Contagem real por dia UTC, antes da seleção de janelas.'});
  bars(area,'Distribuição direcional bruta',g&&!g.insufficient?g.distribution.map(b=>({label:(b.lower===null?'−∞':b.lower)+' a '+(b.upper===null?'+∞':b.upper)+'%',value:b.count})):[],{note:'Intervalos incluem o limite inferior e excluem o superior. n = '+(g?.evaluated||0)});
  bars(area,'Ativos · '+h+' min',data.groups.filter(x=>x.horizon===h&&!x.insufficient).map(x=>({label:x.symbol.replace('USD','')+' · n='+x.evaluated,value:x.mean_gross,net:x.mean_net})),{percent:true,paired:true,note:'Média direcional. Grupos com menos de 30 avaliações ficam fora do gráfico.'});
  bars(area,'Horizontes · '+symbol.replace('USD','/USD'),data.groups.filter(x=>x.symbol===symbol&&!x.insufficient).map(x=>({label:x.horizon+' min · n='+x.evaluated,value:x.mean_gross,net:x.mean_net})),{percent:true,paired:true,note:'Média direcional. Não some as amostras de horizontes diferentes.'});
  bars(area,'Movimento médio por dia · '+h+' min',g&&!g.insufficient?g.daily.filter(x=>x.evaluated>=30).map(x=>({label:x.day.slice(5)+' · n='+x.evaluated,value:x.mean_gross,net:x.mean_net})):[],{percent:true,paired:true,note:'Exibe somente dias com 30 avaliações. Não é curva de saldo nem retorno acumulado.'});
 }
 function history(data){
  next=data.next_cursor;$('hiPageStatus').textContent=data.total+' observações encontradas · página '+(page+1)+' · '+data.items.length+' nesta página · '+label(data.filters.methodology)+'. Fonte e hora de referência em cada registro.';
  $('hiPrevious').disabled=page===0;$('hiNext').disabled=!next;
  if(!data.items.length){empty($('hiHistory'));return}
  $('hiHistory').replaceChildren(table(['Registro','Condição observada','Resultados direcionais brutos','Origem'],data.items.map(x=>[detail(x.symbol.replace('USD','/USD'),date(x.time)),detail(x.direction===1?'Alta ↑':x.direction===-1?'Baixa ↓':'Inválida','Referência: '+fmt(x.reference_price,2)+' '+(x.quote||'cotação não comprovada')),detail((query.get('horizon')?[Number(query.get('horizon'))]:[1,3,5]).map(h=>h+' min: '+(Number.isFinite(x.results[h])?pct(x.results[h]):'pendente / sem resultado')).join(' · '),label(x.methodology_version)),detail(x.source,x.study_type==='prospective'?'Prospectiva · D1':'Origem histórica sem comprovação')])));
 }
 function monitor(data,health){
  const states={operational:'Operacional',partial:'Parcialmente operacional',cooldown:'Aguardando limite da API',stale:'Dados desatualizados',unavailable:'Indisponível'};
  const status=health?states[health.providerState]||health.providerLabel||'Estado não informado':'Estado atual indisponível';
  $('hiMonitorStatus').textContent='Worker: '+(health?'respondeu à consulta':'sem resposta confirmada')+' · Fonte: '+status+' · Última execução no período: '+date(data.last_run?.started_at)+' · Última execução completa com sucesso: '+date(data.last_all_success_in_complete_slots)+'. Monitoramento confirmado desde '+date(data.instrumented_from)+'.';
  $('hiMonitoring').replaceChildren(table(['Ativo','Candles válidos','Último sucesso no período','Falhas da fonte','Intervalos sem atualização'],data.assets.map(x=>[x.symbol.replace('USD','/USD'),detail(fmt(x.availability_pct,1)+'%',x.success+' / '+x.expected+' intervalos'),date(x.last_success_in_period),detail('429: '+x.http429+' · 400: '+x.http400,'Rede: '+x.network+' · coletas rejeitadas: '+x.rejected+' · outros: '+x.otherError),detail('Cooldown: '+x.cooldown+' · ausentes: '+x.missing,'Não classificados: '+x.unknown+' · minutos ausentes nos candles: '+x.missingMinutes+' · duplicatas detectadas: '+x.duplicateCandles)])));
  $('hiAvailability').replaceChildren();bars($('hiAvailability'),'Disponibilidade diária dos dados',data.daily.map(x=>({label:x.day.slice(5),value:x.availability_pct})),{percent:true,note:'Percentual dos intervalos esperados para os três ativos. Coral representa candles válidos, não resultado financeiro.'});
  $('hiCooldown').replaceChildren(el('p',data.cooldown.periods+' períodos de espera confirmados · '+fmt(data.cooldown.total_seconds/60,1)+' minutos no recorte.','info'),...data.cooldown.recent.map(x=>el('p',date(x.start)+' → '+date(x.end),'info')));
 }
 function filters(){
  const from=Date.parse($('hiFrom').value+'T00:00:00Z'),end=Date.parse($('hiTo').value+'T23:59:59.999Z'),now=Date.now(),to=Math.min(now,end);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)throw Error('Selecione um período válido.');
  const p=new URLSearchParams({from:String(from),to:String(to),methodology:$('hiMethod').value,cost:$('hiCost').value,order:$('hiOrder').value,limit:'25'});
  if($('hiSymbol').value)p.set('symbol',$('hiSymbol').value);if($('hiHorizon').value)p.set('horizon',$('hiHorizon').value);return p;
 }
 async function loadPage(index,cursor){if(busy)return;busy=true;$('hiPrevious').disabled=true;$('hiNext').disabled=true;$('hiRefresh').disabled=true;
  try{const p=new URLSearchParams(query);if(cursor)p.set('cursor',cursor);const data=await request('/history',p);page=index;history(data)}catch(e){$('hiPageStatus').textContent='Não foi possível carregar a página: '+e.message;$('hiPrevious').disabled=page===0;$('hiNext').disabled=!next}finally{busy=false;$('hiRefresh').disabled=false}}
 async function refresh(){
  if(busy)return;try{query=filters()}catch(e){$('hiStatus').textContent=e.message;return}
  busy=true;cursors=[null];page=0;next=null;$('hiRefresh').disabled=true;$('hiNext').disabled=true;$('hiPrevious').disabled=true;$('hiStatus').textContent='Consultando registros armazenados…';
  for(const id of ['hiSummary','hiStatistics','hiCharts','hiHistory','hiMonitoring','hiAvailability','hiCooldown'])$(id).replaceChildren();$('hiPageStatus').textContent='Carregando histórico…';$('hiMonitorStatus').textContent='Carregando diagnósticos…';
  const monitoringParams=new URLSearchParams({from:String(Math.max(Number(query.get('from')),Number(query.get('to'))-7*86400000)),to:query.get('to')});
  const responses=await Promise.allSettled([request('/history',query),request('/statistics',query),request('/collector-history',monitoringParams),request('/health',new URLSearchParams())]);
  if(responses[0].status==='fulfilled'){const d=responses[0].value;history(d);for(const value of d.methodologies)if(![...$('hiMethod').options].some(x=>x.value===value)){const option=el('option',label(value));option.value=value;$('hiMethod').append(option)}}else $('hiPageStatus').textContent=responses[0].reason.message;
  if(responses[1].status==='fulfilled'){statistics(responses[1].value);charts(responses[1].value)}else empty($('hiStatistics'),'Estatísticas indisponíveis: '+responses[1].reason.message);
  if(responses[2].status==='fulfilled')monitor(responses[2].value,responses[3].status==='fulfilled'?responses[3].value:null);else $('hiMonitorStatus').textContent='Monitoramento indisponível: '+responses[2].reason.message;
  const failed=responses.some(x=>x.status==='rejected');$('hiStatus').textContent=(failed?'Atualização parcial. ':'Atualizado em '+date(Date.now())+'. ')+label(query.get('methodology'))+' · Coinbase USD para v5.7 · Período UTC. '+(failed?'Consulte a mensagem de cada painel.':'Resultados históricos não estimam lucros futuros.');busy=false;$('hiRefresh').disabled=false;
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const now=Date.now();$('hiFrom').value=new Date(now-6*86400000).toISOString().slice(0,10);$('hiTo').value=new Date(now).toISOString().slice(0,10);
  $('intelligenceFilters').addEventListener('submit',e=>{e.preventDefault();refresh()});$('hiNext').addEventListener('click',()=>{if(next&&!busy){cursors[page+1]=next;loadPage(page+1,next)}});$('hiPrevious').addEventListener('click',()=>{if(page>0&&!busy)loadPage(page-1,cursors[page-1])});
  function activate(){if(location.hash==='#observacoes'&&!started){started=true;refresh()}}activate();window.addEventListener('hashchange',activate);
  setInterval(()=>{if(started&&!document.querySelector('[data-view="observacoes"]').hidden&&document.visibilityState==='visible'&&$('cloudAuto').checked)refresh()},300000);
 });
 root.RadarIntelligence=Object.freeze({statistics,charts,history,monitor,refresh});
})(globalThis);
