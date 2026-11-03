const money=n=>n===null?'Não disponível':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'USD'});
export const originLabel=o=>({'prospective-real':'Prospectivo real','synthetic':'Teste sintético','retrospective':'Retrospectivo','unknown':'Origem não informada'}[o]||'Origem não informada');
export const plainReason=code=>({NO_EXIT_LIQUIDITY:'Nova entrada bloqueada: o melhor bid observado não cobre a saída planejada.',NO_LIQUIDITY:'Liquidez insuficiente para preencher a proposta fictícia.',TRADE_RISK:'A perda planejada ultrapassa o limite por operação.',DAILY_LOSS:'O limite de perda diária bloqueou novas entradas.',ASSET_EXPOSURE:'A exposição por ativo ultrapassa o limite.',OPENED:'Compra fictícia registrada.',CLOSED:'Saída fictícia registrada.'}[code]||code);
const date=n=>n===null?'Não confirmado':new Date(n).toLocaleString('pt-BR');
const statusLabel=s=>({'ended':'Encerrada','paused-risk':'Pausada pelo risco','paused-failure':'Pausada por falha','open-or-interrupted':'Término não confirmado','interrupted':'Interrompida'}[s]||s);
const seconds=n=>Math.max(0,Math.floor(n/1000));
export function renderReport(document,view,now=Date.now(),clockOnly=false){
 const $=id=>document.getElementById(id),text=(id,t)=>{if($(id))$(id).textContent=t};
 const sessions=view.analytics?.sessions||[],s=sessions.find(x=>x.id===view.sessionId)||(view.sessionId===null?sessions.at(-1):null);
 text('paperRemaining',view.active&&view.endsAt?seconds(view.endsAt-now)+' s restantes':'Sem contagem ativa');
 text('paperDataAge',view.quote?'Última marca recebida há '+seconds(now-view.quote.at)+' s; isso não confirma disponibilidade atual.':'Sem cotação carregada na sessão atual.');
 if(clockOnly)return;
 text('paperMonitored',s?seconds(s.monitoredMs)+' s com continuidade observada / '+seconds(s.elapsedMs)+' s entre eventos':'Aguardando eventos de uma sessão.');
 text('paperReadings',s?s.operations.validQuotes+' leituras válidas · '+s.operations.rejectedQuotes+' rejeitadas · '+s.operations.waitDecisions+' decisões de aguardar':'Nenhuma leitura registrada nesta sessão.');
 text('paperLatency',s?.operations.latencyBookMs.n?'Latência média do livro: '+Math.round(s.operations.latencyBookMs.mean)+' ms · máxima '+s.operations.latencyBookMs.max+' ms':'Latência não registrada.');
 text('paperOperational',s?.operations.telemetrySamples?'HTTP 400: '+s.operations.http400+' · HTTP 429: '+s.operations.http429+' · rede: '+s.operations.networkErrors+' · timeout: '+s.operations.timeouts+' · bloqueios: '+s.operations.riskBlocks+(s.operations.cooldownUntil?' · cooldown até '+date(s.operations.cooldownUntil):''):'Erros de API/rede não medidos neste diário.');
 text('paperDataAge',view.quote?'Última marca recebida há '+seconds(now-view.quote.at)+' s; isso não confirma disponibilidade atual.':'Sem cotação carregada na sessão atual.');
 const decisions=$('paperDecisions');if(decisions){decisions.replaceChildren();for(const d of (s?.decisions||[]).slice(-8).reverse()){const p=document.createElement('p'),status=d.action==='wait'?'Aguardar':d.outcome?(d.outcome.approved?'Proposta aprovada':'Proposta rejeitada'):'Proposta registrada; sem nova execução confirmada';p.textContent=date(d.at)+' · '+status+' · '+d.reason+(d.outcome?' '+plainReason(d.outcome.code)+' ('+d.outcome.code+')':'');decisions.append(p);const l=d.outcome?.liquidity;if(l){const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent='Ver a liquidez usada no bloqueio';text.textContent='Livro L1 · '+l.instrument.symbol+' · disponível no bid para o modelo: '+l.availableBid.toFixed(8)+' BTC; necessário: '+l.requiredExit.toFixed(8)+' BTC. Proposta: '+l.proposed.toFixed(8)+' BTC. Não representa toda a liquidez da Coinbase.';details.append(summary,text);decisions.append(details)}}if(!decisions.children.length)decisions.textContent='Nenhuma decisão registrada.'}
 const results=$('paperSessionResults');if(results){const expanded=new Set([...results.querySelectorAll('article[data-session]')].filter(x=>x.querySelector('details')?.open).map(x=>x.dataset.session));results.replaceChildren();for(const row of sessions.filter(s=>s.terminationConfirmed||s.id!==view.sessionId||!view.active).slice(-10).reverse()){
  const card=document.createElement('article');card.className='paper-result';card.dataset.session=row.id;
  const h=document.createElement('h4');h.textContent=originLabel(row.origin)+' · '+date(row.startedAt);card.append(h);
  const lines=[row.endedAt===null?'Término não confirmado: pode ter havido suspensão/reload.':'Término: '+date(row.endedAt)+' · '+statusLabel(row.status),
   'Motivo: '+plainReason(row.reason),
   'Capital inicial estimado '+money(row.capitalInitial)+' · final estimado '+money(row.capitalFinalEstimated)+' · resultado líquido fictício '+money(row.netSimulated),
   'Entradas '+row.opened+' · saídas '+row.closed+' · posições residuais '+row.residualPositions.length+' · pares completos válidos '+row.validRoundTrips,
   'Vencedoras '+row.winners+' · perdedoras '+row.losers+' · empates '+row.breakeven+' · ganho médio '+money(row.averageWin)+' · perda média '+money(row.averageLoss),
   'Taxas '+money(row.fees)+' · slippage '+money(row.slippage)+' · custos totais '+money(row.costs)+' (já incluídos no resultado)',
   'Drawdown observado '+money(row.drawdownObserved)+' · exposição observada '+seconds(row.exposureMs)+' s · propostas rejeitadas '+row.operations.proposalsRejected,
   row.sampleSufficient?'Taxa observada '+(row.hitRate*100).toFixed(1)+'% · expectativa observada '+money(row.expectancy)+' por par completo; não é previsão.':'Amostra insuficiente: taxa de acerto e expectativa não exibidas (mínimo '+row.sampleMinimum+' pares completos e origem identificada).',
   'Estratégia '+row.strategy+' · política '+row.policy+' · metodologia '+row.methodology,
   row.instrument?'Fonte '+row.instrument.provider+' · '+row.instrument.symbol+' · '+row.instrument.quote:'Fonte/instrumento sem leitura válida neste período.',
   row.valuationFresh?'Valores fictícios observados no diário.':'Patrimônio indicativo com marcas antigas; não é fechamento executado.'];
  for(const line of lines){const p=document.createElement('p');p.textContent=line;card.append(p)}
  const details=document.createElement('details'),summary=document.createElement('summary');details.open=expanded.has(row.id);summary.textContent='Motivos das execuções e limitações';details.append(summary);
  for(const execution of row.executions){const p=document.createElement('p');p.textContent=date(execution.at)+' · '+(execution.side==='buy'?'Compra fictícia':'Saída fictícia')+' · '+execution.reason;details.append(p)}
  for(const warning of row.warnings){const p=document.createElement('p');p.className='paper-meta';p.textContent=warning;details.append(p)}card.append(details);results.append(card);
 }if(!results.children.length)results.textContent='Nenhuma sessão registrada. Após iniciar, os resultados serão obtidos do diário verificado.'}
}
