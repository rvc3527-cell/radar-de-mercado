import {mountArchivePanel} from './archive-panel.js';
import {messages,explainError} from './messages.js';
import {renderReport,plainReason} from './report-panel.js';
import {IndexedDBPaperStore} from './store.js';
import {CoinbasePaperFeed} from './market.js';
import {SupervisedPaperSession,STATES} from './session.js';
const $=id=>document.getElementById(id),money=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'USD'});

let timer=null,busy=false,pendingActions=0,archiveControls=null;
function text(id,value){$(id).textContent=value}
function render(view){
 archiveControls?.render(view,busy);
 renderReport(document,view);
 if(![STATES.READY,STATES.RUN].includes(view.state))$('paperConsent').checked=false;
 text('paperProtocolStatus',view.protocol?(view.protocol.linked?'Protocolo vinculado ao diário: ':'Protocolo selecionado: ')+view.protocol.id+' · SHA-256 '+view.protocol.seal+' · anterioridade independente não comprovada.':'Selecione um protocolo v7.6 antes de verificar a fonte. Nenhuma sessão é ativada por selecionar arquivo.');
 text('paperState',view.state);text('paperReason',messages[view.reason]||plainReason(view.reason));text('paperSource',view.source);
 const w=view.wallet;text('paperCash',w?money(w.cash):'Não carregado');text('paperEquity',w?money(w.equity):'—');text('paperPnl',w?money(w.realized+w.unrealized):'—');text('paperOpen',w?String(w.positions.length):'—');
 text('paperMark',w&&!w.valuationFresh?'Patrimônio indicativo com marcas antigas; não é preço de saída.':'Patrimônio estimado após custos simulados.');
 text('paperQuote',view.quote?'BTC/USD · bid '+money(view.quote.bid)+' / ask '+money(view.quote.ask)+' · '+new Date(view.quote.at).toLocaleString('pt-BR'):'Nenhum livro consultado.');
 text('paperSession',view.startedAt?'Sessão '+new Date(view.startedAt).toLocaleString('pt-BR')+' · limite '+new Date(view.endsAt).toLocaleTimeString('pt-BR'):'Sessão supervisionada de 1 ou 2 horas. Não funciona com a página suspensa.');
 text('paperResidual',view.unprotected?'ATENÇÃO: há posições fictícias abertas sem monitoramento ativo. Nenhuma saída foi inventada. Exporte os registros e revise antes de nova sessão.':'');
 text('paperCapacity',w?w.capacity.used+' / '+w.capacity.limit+' eventos · sem exclusão automática. Saldo inicial fixado: '+money(w.initialBalance)+'.':'Armazenamento local não é backup permanente.');
 const rows=$('paperTrades');rows.replaceChildren();for(const t of (w?.trades||[]).slice(-20).reverse()){const tr=document.createElement('tr');for(const value of [new Date(t.at).toLocaleString('pt-BR'),t.side==='buy'?'Compra fictícia':'Saída fictícia',String(t.quantity)+' BTC',money(t.price),money(t.fees),money(t.pnl)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}rows.append(tr)}
 if(!rows.children.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='Nenhuma operação fictícia registrada.';tr.append(td);rows.append(tr)}
 text('paperPositions',w?.positions.length?w.positions.map(p=>p.quantity+' BTC · entrada '+money(p.entryPrice)+' · stop gatilho '+money(p.stop)).join(' | '):'Nenhuma posição fictícia aberta.');
 $('paperProtocolFile').disabled=busy||view.active||[STATES.READY,STATES.WAIT].includes(view.state);
 $('paperStart').disabled=(view.protocolRequired&&!view.protocolReady)||busy||view.state!==STATES.READY||!$('paperConsent').checked;$('paperPrepare').disabled=busy||view.active;$('paperRestore').disabled=busy||view.active;$('paperEnd').disabled=view.state===STATES.OFF||view.state===STATES.END;$('paperExport').disabled=busy||!w;$('paperBalance').disabled=busy||!!w;$('paperDuration').disabled=busy||view.active;
}
const session=new SupervisedPaperSession({store:new IndexedDBPaperStore(),feed:new CoinbasePaperFeed(),origin:'prospective-real',runtimeManifest:async()=>{const r=await fetch('/lab/build.json',{cache:'no-store',credentials:'omit'});if(!r.ok)throw Error('Código publicado indisponível.');return r.json()},onChange:render});
archiveControls=mountArchivePanel(session,{run:action});
function schedule(){clearTimeout(timer);if(session.active)timer=setTimeout(async()=>{await action(()=>session.tick());schedule()},15000)}
async function action(fn){pendingActions++;busy=true;let problem;render(session.view());try{await fn();if(session.engine)await session.report()}catch(error){problem=explainError(error)}finally{pendingActions--;busy=pendingActions>0;render(session.view());if(problem)text('paperReason',problem)}}
// No network, storage creation or activation during bootstrap.
$('paperPrepare').addEventListener('click',()=>action(()=>session.prepare({initialBalance:Number($('paperBalance').value)})));
$('paperRestore').addEventListener('click',()=>action(()=>session.restore()));
$('paperConsent').addEventListener('change',()=>render(session.view()));
$('paperStart').addEventListener('click',async()=>{await action(()=>session.start({confirmed:$('paperConsent').checked,durationMinutes:Number($('paperDuration').value)}));schedule()});
$('paperEnd').addEventListener('click',async()=>{clearTimeout(timer);await action(()=>session.end())});
$('paperExport').addEventListener('click',()=>action(async()=>{const data=await session.export(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='radar-simulacao-'+Date.now()+'.json';link.style.display='none';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}));
const pause=reason=>{clearTimeout(timer);void action(()=>session.interrupt(reason))};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')pause('Página oculta: sessão pausada. Revalide antes de ativar novamente.')});
window.addEventListener('pagehide',()=>pause('Página encerrada. Nenhuma retomada automática será feita.'));
window.addEventListener('offline',()=>pause('Conexão interrompida. Revalide antes de ativar novamente.'));
window.addEventListener('pageshow',event=>{if(event.persisted){clearTimeout(timer);void action(()=>session.interrupt('Página restaurada após suspensão. Revalide antes de ativar novamente.'))}});
render(session.view());

// UI countdown only: no requests, trades, reactivation or journal writes.
setInterval(()=>{if(document.visibilityState==='visible')renderReport(document,session.view(),Date.now(),true)},1000);

$('paperProtocolFile').addEventListener('change',()=>action(async()=>{const file=$('paperProtocolFile').files?.[0];if(!file)return;if(file.size>32768)throw Error('Protocolo excede o limite de 32 KB.');await session.attachProtocol(await file.text());}));
