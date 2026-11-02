/* Presentation only. Indicator and statistics modules remain unchanged. */
function renderMarketCards(items){
  const area=document.getElementById('assetCards');if(!area)return;area.replaceChildren();
  const names={BTCUSDT:'Bitcoin',ETHUSDT:'Ethereum',SOLUSDT:'Solana'};
  for(const symbol of Object.keys(names)){
    const item=items.find(x=>x.symbol===symbol),card=document.createElement('button');card.type='button';card.className='market-card';card.dataset.asset=symbol;
    card.setAttribute('aria-pressed',String(document.getElementById('symbol').value===symbol));
    const code=document.createElement('span');code.className='asset-symbol';code.textContent=symbol.replace('USDT','');
    const name=document.createElement('span');name.className='asset-name';name.textContent=names[symbol];
    const change=document.createElement('span');change.className='asset-change';
    const value=document.createElement('strong'),detail=document.createElement('span'),source=document.createElement('small');detail.className='asset-detail';
    if(!item||item.error){value.textContent='—';change.textContent='Indisponível';detail.textContent=item?.error||'Aguardando consulta';source.textContent='Binance · USDT · sem dados validados';}
    else{
      value.textContent=item.entry.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' USDT';
      const previous=item.rows.at(-2)?.close,last=item.rows.at(-1)?.close;
      if(previous>0&&Number.isFinite(last)){const pct=(last/previous-1)*100;change.className+=' '+(pct>=0?'up':'down');change.textContent=(pct>=0?'↑ +':'↓ ')+pct.toFixed(2)+'% · 1 min';}
      else change.textContent='Variação indisponível';
      detail.textContent='Direção observada: '+item.trend;
      source.textContent='Binance · fechamento de 1 min · '+new Date(item.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    }
    card.append(code,name,change,value,detail,source);
    card.addEventListener('click',()=>{document.getElementById('symbol').value=symbol;connect();document.querySelectorAll('[data-asset]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.asset===symbol)));});area.append(card);
  }
}
function updateReading({trend,r,aligned,count}){
  document.getElementById('readingTrend').textContent=trend;
  document.getElementById('readingAlignment').textContent=count<21?'Histórico insuficiente':aligned?'Condições alinhadas':'Sem alinhamento';
  const last=history.filter(x=>x.time*1000+60000<=Date.now()-5000).at(-1);
  const age=last?Math.max(0,Math.floor((Date.now()-last.time*1000-60000)/1000)):null;
  document.getElementById('readingQuality').textContent=age===null?'Aguardando candles fechados.':age>120?'Dados desatualizados · '+age+' s desde o fechamento':count+' candles fechados · referência há '+age+' s';
}
function showDashboardRoute(route,{scroll=true}={}){
  const actual=route==='mercados'?'graficos':route;
  const allowed=['overview','graficos','analises','observacoes','laboratorio','educacao','configuracoes'];
  if(!allowed.includes(actual))return false;
  document.querySelectorAll('[data-view]').forEach(x=>{x.hidden=x.dataset.view!==actual});
  document.querySelectorAll('.dashboard-nav [data-route]').forEach(x=>{if(x.dataset.route===route)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});
  const names={overview:'Oportunidades',graficos:'Gráficos',mercados:'Gráficos',analises:'Análise',observacoes:'Histórico',laboratorio:'Laboratório',educacao:'Aprender',configuracoes:'Configurações'};
  document.getElementById('sectionTitle').textContent=names[route];
  if(actual==='graficos'&&typeof chart!=='undefined'&&chart)requestAnimationFrame(()=>{chart.applyOptions({width:document.getElementById('chart').clientWidth});chart.timeScale().fitContent()});
  if(scroll){if(route==='mercados')document.getElementById('mercados').scrollIntoView({block:'start'});else window.scrollTo({top:0,behavior:'auto'})}
  return true;
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('dashboardDate').textContent=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const routeFromHash=()=>{const hash=location.hash.slice(1)||'overview';if(showDashboardRoute(hash,{scroll:false}))return;const target=document.getElementById(hash);const view=target?.closest('[data-view]');showDashboardRoute(view?.dataset.view||'overview',{scroll:false});};
  routeFromHash();window.addEventListener('hashchange',routeFromHash);
  document.addEventListener('click',event=>{const link=event.target.closest('a[data-route]');if(!link)return;showDashboardRoute(link.dataset.route);});
  setInterval(()=>{
    if(document.visibilityState!=='visible')return;
    const last=history.at(-1);if(last&&Date.now()-last.time*1000>180000){document.getElementById('status').textContent='Dados desatualizados';}
    if(typeof updateReading==='function'){const v=closedCandles().map(x=>x.close),a=ema(v,9),b=ema(v,21),r=rsi(v);updateReading({trend:a===null||b===null?'Dados insuficientes':a>b?'Alta':a<b?'Baixa':'Neutra',r,aligned:(a>b&&r>=50&&r<70)||(a<b&&r<=50&&r>30),count:v.length});}
  },15000);
  setInterval(()=>{if(document.visibilityState==='visible'&&document.getElementById('cloudAuto').checked){refreshCloudCollector();refreshCloudDiagnostics();}},300000);
  document.getElementById('symbol').addEventListener('change',()=>document.querySelectorAll('[data-asset]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.asset===document.getElementById('symbol').value))));
});
function renderCollectorStates(data){
  const area=document.getElementById('collectorStates');if(!area)return;area.replaceChildren();
  let report=[];try{report=JSON.parse(data.last_run?.report||'[]')}catch(error){}
  for(const symbol of ['BTCUSD','ETHUSD','SOLUSD']){
    const item=report.find(x=>x.symbol===symbol),row=document.createElement('div'),title=document.createElement('strong'),state=document.createElement('span');
    title.textContent=symbol.replace('USD','/USD');
    state.textContent=!item?'Sem execução confirmada':item.error?'Falha '+(item.httpStatus||'de coleta'):data.scheduleDelayed?'Execução atrasada':'✓ Candles validados';
    state.className=!item||data.scheduleDelayed?'muted':item.error?'down':'up';
    row.append(title,state);area.append(row);
  }
  const time=document.createElement('small');time.className='collector-time';time.textContent=data.last_run?'Última execução: '+new Date(data.last_run.started_at).toLocaleString('pt-BR')+' · Coinbase USD':'Aguardando primeira execução';area.append(time);
}
