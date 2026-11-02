import {IndexedDBPaperStore} from './store.js';
import {CoinbasePaperFeed} from './market.js';
import {SupervisedPaperSession,STATES} from './session.js';
const $=id=>document.getElementById(id),money=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'USD'});
const messages={BOOK_STALE_OR_CLOCK:'Livro atrasado ou relógio divergente.',COOLDOWN:'Aguardando limite da Coinbase. Não tente repetidamente.',HTTP_429:'A Coinbase limitou as consultas. A sessão foi pausada.',HTTP_400:'A Coinbase rejeitou a consulta.',STORAGE_RESERVE:'Não foi possível confirmar 20 MB livres para o diário.',SESSION_BUSY:'Outra aba já controla esta carteira.',WEB_LOCKS_REQUIRED:'Este navegador não oferece o controle de abas necessário.',WALLET_NOT_FOUND:'Nenhuma carteira anterior neste navegador. Verifique a fonte para criar uma.',SESSION_CAPACITY:'Diário próximo do limite. Exporte os registros; nenhuma nova sessão foi iniciada.',PREPARED_QUOTE_STALE:'Verificação expirou. Aguarde 15 segundos e verifique a fonte novamente.',POLL_INTERVAL:'Aguarde 15 segundos entre verificações.',DAILY_LOSS:'Limite de perda diária atingido.',PERSISTENCE_UNCONFIRMED:'Gravação não confirmada. Nenhuma nova execução será permitida.',SUPERVISION_INTERRUPTED:'A página ficou sem supervisão por mais de 30 segundos.',EXPLICIT_ACTIVATION:'Confirme a ciência dos riscos antes de ativar.'};
let timer=null,busy=false;
function text(id,value){$(id).textContent=value}
function render(view){
 if(![STATES.READY,STATES.RUN].includes(view.state))$('paperConsent').checked=false;
 text('paperState',view.state);text('paperReason',messages[view.reason]||view.reason);text('paperSource',view.source);
 const w=view.wallet;text('paperCash',w?money(w.cash):'Não carregado');text('paperEquity',w?money(w.equity):'—');text('paperPnl',w?money(w.realized+w.unrealized):'—');text('paperOpen',w?String(w.positions.length):'—');
 text('paperMark',w&&!w.valuationFresh?'Patrimônio indicativo com marcas antigas; não é preço de saída.':'Patrimônio estimado após custos simulados.');
 text('paperQuote',view.quote?'BTC/USD · bid '+money(view.quote.bid)+' / ask '+money(view.quote.ask)+' · '+new Date(view.quote.at).toLocaleString('pt-BR'):'Nenhum livro consultado.');
 text('paperSession',view.startedAt?'Sessão '+new Date(view.startedAt).toLocaleString('pt-BR')+' · limite '+new Date(view.endsAt).toLocaleTimeString('pt-BR'):'Sessão supervisionada de 1 ou 2 horas. Não funciona com a página suspensa.');
 text('paperResidual',view.unprotected?'ATENÇÃO: há posições fictícias abertas sem monitoramento ativo. Nenhuma saída foi inventada. Exporte os registros e revise antes de nova sessão.':'');
 text('paperCapacity',w?w.capacity.used+' / '+w.capacity.limit+' eventos · sem exclusão automática. Saldo inicial fixado: '+money(w.initialBalance)+'.':'Armazenamento local não é backup permanente.');
 const rows=$('paperTrades');rows.replaceChildren();for(const t of (w?.trades||[]).slice(-20).reverse()){const tr=document.createElement('tr');for(const value of [new Date(t.at).toLocaleString('pt-BR'),t.side==='buy'?'Compra fictícia':'Saída fictícia',String(t.quantity)+' BTC',money(t.price),money(t.fees),money(t.pnl)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}rows.append(tr)}
 if(!rows.children.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='Nenhuma operação fictícia registrada.';tr.append(td);rows.append(tr)}
 text('paperPositions',w?.positions.length?w.positions.map(p=>p.quantity+' BTC · entrada '+money(p.entryPrice)+' · stop gatilho '+money(p.stop)).join(' | '):'Nenhuma posição fictícia aberta.');
 $('paperStart').disabled=busy||view.state!==STATES.READY||!$('paperConsent').checked;$('paperPrepare').disabled=busy||view.active;$('paperRestore').disabled=busy||view.active;$('paperEnd').disabled=view.state===STATES.OFF||view.state===STATES.END;$('paperExport').disabled=busy||!w;$('paperBalance').disabled=busy||!!w;$('paperDuration').disabled=busy||view.active;
}
const session=new SupervisedPaperSession({store:new IndexedDBPaperStore(),feed:new CoinbasePaperFeed(),onChange:render});
function schedule(){clearTimeout(timer);if(session.active)timer=setTimeout(async()=>{await action(()=>session.tick());schedule()},15000)}
async function action(fn){busy=true;let problem;render(session.view());try{await fn()}catch(error){problem=messages[error.code||error.message]||'Simulação bloqueada: '+(error.code||error.message)}finally{busy=false;render(session.view());if(problem)text('paperReason',problem)}}
// No network, storage creation or activation during bootstrap.
$('paperPrepare').addEventListener('click',()=>action(()=>session.prepare({initialBalance:Number($('paperBalance').value)})));
$('paperRestore').addEventListener('click',()=>action(()=>session.restore()));
$('paperConsent').addEventListener('change',()=>render(session.view()));
$('paperStart').addEventListener('click',async()=>{await action(()=>session.start({confirmed:$('paperConsent').checked,durationMinutes:Number($('paperDuration').value)}));schedule()});
$('paperEnd').addEventListener('click',async()=>{clearTimeout(timer);await action(()=>session.end())});
$('paperExport').addEventListener('click',()=>action(async()=>{const data=await session.export(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='radar-simulacao-'+Date.now()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'){clearTimeout(timer);void session.interrupt('Página oculta: sessão pausada. Revalide antes de ativar novamente.')}});
window.addEventListener('pagehide',()=>{clearTimeout(timer);void session.interrupt('Página encerrada. Nenhuma retomada automática será feita.')});
window.addEventListener('offline',()=>{clearTimeout(timer);void session.interrupt('Conexão interrompida. Revalide antes de ativar novamente.')});
render(session.view());
