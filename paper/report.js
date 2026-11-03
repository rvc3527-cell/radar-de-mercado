// Reporting only. Never proposes trades or mutates a journal.
import {cash,sell,publicCash,checked} from './money.js';
import {keyOf} from './risk.js';
import {PaperTradingEngine} from './engine.js';
import {MemoryPaperStore} from './store.js';
export const REPORT_VERSION='v7.3-report-1',MIN_SAMPLE=30;
const parse=text=>{try{return JSON.parse(text)}catch(_){return null}};
const origins=['prospective-real','synthetic','retrospective'];
const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;
const range=a=>({n:a.length,min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null,mean:mean(a)});
function union(intervals){let total=0,last=null;for(const [a,b] of intervals.filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0])){if(last&&a<=last[1])last[1]=Math.max(last[1],b);else{if(last)total+=last[1]-last[0];last=[a,b]}}return total+(last?last[1]-last[0]:0)}
function equity(cashMicros,positions,marks,config){let value=cashMicros;for(const p of positions.values()){const m=marks.get(keyOf(p.instrument));if(!m)return null;value=checked(value+sell(p.quantity,m.bid,config).net)}return value}
function telemetry(s,t){
 if(!t||t.version!=='v7.3')return;
 s.telemetrySamples++;if(t.outcome==='rejected'){s.operations.sampleFailures++;if(t.requests?.some(x=>x.kind==='book'))s.operations.rejectedQuotes++}
 if(Number.isSafeInteger(t.cooldownUntil)&&t.cooldownUntil>0)s.operations.cooldownUntil=t.cooldownUntil;
 for(const r of Array.isArray(t.requests)?t.requests:[]){
  s.operations.requests++;if(r.status===400)s.operations.http400++;if(r.status===429)s.operations.http429++;
  if(r.error==='NETWORK')s.operations.networkErrors++;if(r.error==='TIMEOUT')s.operations.timeouts++;
  if(r.kind==='book'&&Number.isFinite(r.latencyMs)&&r.latencyMs>=0)s.latencies.push(r.latencyMs);
 }
}
function finish(s,state,at,status,reason,confirmed){
 const final=equity(state.cash,state.positions,state.marks,state.config),closed=s.closedTrades;
 const wins=closed.filter(t=>t.pnl>0),losses=closed.filter(t=>t.pnl<0),validOrigin=origins.includes(s.origin);
 const exposures=[...s.exposures];for(const p of state.positions.values())exposures.push([Math.max(s.startedAt,p.at),at]);
 const sampleSufficient=closed.length>=MIN_SAMPLE&&validOrigin&&s.carriedPositions===0&&state.positions.size===0&&confirmed&&!s.instrumentMismatch;
 const observedInstruments=[...s.observedInstruments.values()].sort((a,b)=>keyOf(a).localeCompare(keyOf(b)));
 const result={id:s.id,strategy:s.strategy,policy:s.policy,methodology:s.methodology,instrument:observedInstruments.length===1?observedInstruments[0]:null,declaredInstrument:s.instrument,observedInstruments,origin:s.origin,originTrust:'host-declared',config:s.config,startedAt:s.startedAt,plannedEndAt:s.plannedEndAt,endedAt:confirmed?at:null,lastObservedAt:at,status,reason,terminationConfirmed:confirmed,
  elapsedMs:Math.max(0,at-s.startedAt),monitoredMs:s.operations.monitoredMs,exposureMs:union(exposures),
  capitalInitial:s.initial===null?null:publicCash(s.initial),capitalFinalEstimated:final===null?null:publicCash(final),cashFinal:publicCash(state.cash),netSimulated:final===null||s.initial===null?null:publicCash(final-s.initial),realizedDuringSession:publicCash(state.realized-s.initialRealized),
  fees:publicCash(state.fees-s.initialFees),slippage:publicCash(state.slippage-s.initialSlippage),costs:publicCash((state.fees-s.initialFees)+(state.slippage-s.initialSlippage)),
  drawdownObserved:s.peak===null?null:publicCash(s.drawdown),drawdownObservedPct:s.drawdownPct,
  opened:s.opened,closed:s.allClosed,winners:wins.length,losers:losses.length,breakeven:closed.length-wins.length-losses.length,validRoundTrips:closed.length,
  averageWin:wins.length?publicCash(mean(wins.map(t=>t.pnl))):null,averageLoss:losses.length?publicCash(mean(losses.map(t=>t.pnl))):null,
  hitRate:sampleSufficient?wins.length/closed.length:null,expectancy:sampleSufficient?publicCash(mean(closed.map(t=>t.pnl))):null,sampleSufficient,sampleMinimum:MIN_SAMPLE,
  carriedPositions:s.carriedPositions,residualPositions:[...state.positions.values()].map(p=>({id:p.id,instrument:p.instrument,quantity:p.quantity/1e8})),
  valuationFresh:[...state.positions.values()].every(p=>{const m=state.marks.get(keyOf(p.instrument));return m?.ready&&at-m.at<=state.config.maxQuoteAgeMs}),
  operations:{...s.operations,lastQuoteAt:s.lastQuoteAt,uniqueSequences:s.sequences.size,latencyBookMs:range(s.latencies),dataAgeMs:range(s.ages),telemetrySamples:s.telemetrySamples},decisions:s.decisions.slice(-100),executions:s.executions,conditions:s.conditions,
  warnings:['Resultado fictício observado; não é garantia de lucro futuro.','Drawdown observado apenas nas marcas recebidas; gaps não são reconstruídos.','Custos = taxas + slippage; já estão nos preços/PnL, não descontar novamente.',...(!validOrigin?['Origem não informada: amostra antiga não atribuída à metodologia nova.']:[]),...(!sampleSufficient?['Amostra insuficiente para taxa de acerto e expectativa.']:[]),...(s.instrumentMismatch?['Instrumento declarado diverge dos eventos: comparação bloqueada.']:[]),...(state.positions.size?['Posições residuais: patrimônio indicativo, não liquidação executada.']:[]),...(s.carriedPositions?['Há posição herdada: não atribuir seu round trip a esta sessão.']:[]),...(!s.telemetrySamples?['Sem telemetria de latência/HTTP neste diário antigo; zero eventos conhecidos não comprova ausência de erros.']:[]),...(!confirmed?['Término não confirmado; duração limitada ao último evento, sem extrapolar até agora.']:[])]};
 return result;
}
// Caller must obtain this document through engine.exportJournal(), which verifies replay/hash.
export function reportVerifiedJournal(journal){
 const state={cash:cash(journal.config.initialBalance),realized:0,fees:0,slippage:0,positions:new Map(),marks:new Map(),config:journal.config};
 const sessions=[],preflights=[],registry=new Map(),reasons=new Map();let current=null,lastAt=0,pendingCheck=null;
 for(const event of journal.events){
  const c=event.command,d=event.decision,note=c.type==='note'?parse(c.payload.details):null;
  if(c.type==='note'&&d.approved&&c.payload.kind==='SESSION_CHECK'&&note){pendingCheck={id:c.id.replace(/:check$/,''),at:c.at,origin:origins.includes(note.origin)?note.origin:'unknown',status:'checked',failure:null,telemetry:null};preflights.push(pendingCheck)}
  if(c.type==='note'&&d.approved&&pendingCheck&&c.id.startsWith(pendingCheck.id+':')){if(c.payload.kind==='SESSION_START')pendingCheck.status='activated';if(!current&&pendingCheck.status!=='activated'&&c.payload.kind==='SESSION_PAUSE'){pendingCheck.status='failed';pendingCheck.failure=note?.reason??null;pendingCheck.telemetry=note?.telemetry??null}if(!current&&pendingCheck.status!=='activated'&&c.payload.kind==='SESSION_END')pendingCheck.status='ended-before-activation'}
  if(c.type==='note'&&d.approved&&c.payload.kind==='SESSION_START'&&note){
   if(current)sessions.push(finish(current,state,lastAt,'interrupted','Novo início sem término anterior confirmado.',false));
   const initial=equity(state.cash,state.positions,state.marks,state.config),instrument=note.instrument??null;
   current={id:c.id.replace(/:start$/,''),strategy:note.strategy??'unknown',policy:note.policy??'unknown',methodology:note.methodology??'unknown',instrument,origin:origins.includes(note.origin)?note.origin:'unknown',config:{...journal.config},startedAt:c.at,plannedEndAt:note.endsAt??null,
    initial,initialRealized:state.realized,initialFees:state.fees,initialSlippage:state.slippage,carriedPositions:state.positions.size,peak:initial,drawdown:0,drawdownPct:0,opened:0,allClosed:0,closedTrades:[],exposures:[],executions:[],decisions:[],conditions:[],observedInstruments:new Map(),sequences:new Set(),latencies:[],ages:[],telemetrySamples:0,lastQuoteAt:null,
    operations:{validQuotes:0,rejectedQuotes:0,sampleFailures:0,requests:0,http400:0,http429:0,networkErrors:0,networkInterruptions:0,supervisionInterruptions:0,timeouts:0,cooldownUntil:null,monitoredMs:0,waitDecisions:0,proposalsApproved:0,proposalsRejected:0,entriesRejected:0,protectiveExitsRejected:0,riskBlocks:0}};
  }
  if(c.payload.quote&&d.marketAccepted){const q=c.payload.quote;state.marks.set(keyOf(q.instrument),{bid:cash(q.bid),at:q.at,ready:true});if(current){current.observedInstruments.set(keyOf(q.instrument),q.instrument);if(current.instrument&&keyOf(current.instrument)!==keyOf(q.instrument))current.instrumentMismatch=true;}}
  if(c.type==='failure'||(c.type==='quote'&&!d.approved))for(const m of state.marks.values())m.ready=false;
  if(current&&c.type==='note'&&c.payload.kind==='STRATEGY_DECISION'&&note&&d.approved){
   let reason=note.reason??'Sem motivo registrado';const factors=[],e=note.evidence;
   if(note.proposal?.action==='close'&&current.policy==='v7.2-paper-test-1'&&e?.policy===current.policy){const p=registry.get(note.proposal.positionId);if(Number.isFinite(e.ema9)&&Number.isFinite(e.ema21)&&e.ema9<=e.ema21)factors.push('as médias deixaram de confirmar alta');if(Number.isFinite(e.rsi14)&&e.rsi14>=70)factors.push('força do movimento acima do limite experimental');if(p&&c.at-p.at>=300000)factors.push('limite experimental de cinco minutos de exposição atingido');if(factors.length)reason='Saída fictícia: '+factors.join('; ')+'.'}
   current.decisions.push({at:c.at,reason,originalReason:note.reason??null,factors,action:note.proposal?.action??'wait',proposalId:note.proposal?.id??null});
   if(note.proposal?.id)reasons.set(note.proposal.id,reason);
   else current.operations.waitDecisions++;
   if(note.evidence)current.conditions.push({at:c.at,ema9:note.evidence.ema9,ema21:note.evidence.ema21,rsi14:note.evidence.rsi14,maxRangePct:note.evidence.maxRangePct??null,extensionPct:note.evidence.extensionPct??null});
  }
  for(const fill of d.accounting?.executions||[]){
   const old=registry.get(fill.positionId);
   if(fill.side==='buy'){registry.set(fill.positionId,{id:fill.positionId,instrument:fill.instrument,quantity:fill.quantity,at:fill.at,strategyId:fill.strategyId,entryCost:fill.net});if(current)current.opened++}
   if(current){
    const reason=fill.reason==='STOP'?'Stop fictício acionado pelo bid recebido.':reasons.get(c.id)??(fill.side==='buy'?'Entrada fictícia registrada.':'Saída fictícia registrada.');
    current.executions.push({id:fill.id,positionId:fill.positionId,side:fill.side,at:fill.at,quoteAt:fill.quoteAt,sequence:fill.quoteSequence,quantity:fill.quantity/1e8,price:publicCash(fill.price),fees:publicCash(fill.fees),slippage:publicCash(fill.slippage),pnl:publicCash(fill.pnl),reason});
    if(fill.side==='sell'){current.allClosed++;if(old){current.exposures.push([Math.max(old.at,current.startedAt),fill.at]);if(old.at>=current.startedAt&&(old.strategyId===current.strategy||current.strategy==='unknown')&&old.strategyId===fill.strategyId)current.closedTrades.push({pnl:fill.pnl})}}
   }
   if(fill.side==='sell')registry.delete(fill.positionId);
  }
  const a=d.accounting;if(a){state.cash=a.cash;state.realized=a.realized;state.fees=a.fees;state.slippage=a.slippage;state.positions=new Map(a.positions.map(p=>[p.id,registry.get(p.id)]).filter(([,p])=>p));}
  if(current){
   const v=equity(state.cash,state.positions,state.marks,state.config);if(v!==null){if(current.peak===null||v>current.peak)current.peak=v;const draw=current.peak-v;current.drawdown=Math.max(current.drawdown,draw);current.drawdownPct=Math.max(current.drawdownPct,current.peak?100*draw/current.peak:0)}
   if(c.type==='quote'){
    if(d.approved&&d.marketAccepted){current.operations.validQuotes++;current.sequences.add(c.payload.quote.sequence);current.ages.push(c.at-c.payload.quote.at);if(current.lastQuoteAt!==null&&c.at-current.lastQuoteAt<=30000)current.operations.monitoredMs+=Math.max(0,c.at-current.lastQuoteAt);current.lastQuoteAt=c.at}
    else current.operations.rejectedQuotes++;
    telemetry(current,parse(c.payload.telemetry));
    for(const exit of d.exits||[])if(!exit.approved){current.operations.protectiveExitsRejected++;current.operations.riskBlocks++;current.riskReported=true}
   }
   if(c.type==='proposal'){const decision=[...current.decisions].reverse().find(x=>x.proposalId===c.id);if(decision)decision.outcome={approved:d.approved,code:d.code};if(d.approved)current.operations.proposalsApproved++;else{current.operations.proposalsRejected++;current.operations.riskBlocks++;current.riskReported=true;if(c.payload.proposal.action==='open')current.operations.entriesRejected++}}
   if(c.type==='note'&&c.payload.kind==='SESSION_PAUSE'&&note){telemetry(current,note.telemetry);if(note.risk&&!current.riskReported)current.operations.riskBlocks++;if(note.cause==='network')current.operations.networkInterruptions++;if(['visibility','supervision'].includes(note.cause))current.operations.supervisionInterruptions++}
   if(c.type==='note'&&d.approved&&['SESSION_END','SESSION_PAUSE'].includes(c.payload.kind)){
    sessions.push(finish(current,state,c.at,c.payload.kind==='SESSION_END'?'ended':note?.risk?'paused-risk':'paused-failure',note?.reason??'Término sem motivo registrado.',true));current=null;
   }
  }
  lastAt=c.at;
 }
 if(current)sessions.push(finish(current,state,lastAt,'open-or-interrupted','Sem término confirmado no diário.',false));
 const groups=new Map();for(const s of sessions){const key=JSON.stringify({strategy:s.strategy,policy:s.policy,methodology:s.methodology,instrument:s.instrument,declaredInstrument:s.declaredInstrument,observedInstruments:s.observedInstruments,origin:s.origin,config:s.config,plannedMs:s.plannedEndAt===null?null:s.plannedEndAt-s.startedAt});if(!groups.has(key))groups.set(key,{key:JSON.parse(key),sessionIds:[],validRoundTrips:0});const group=groups.get(key);group.sessionIds.push(s.id);group.validRoundTrips+=s.validRoundTrips}
 return {version:REPORT_VERSION,walletId:journal.walletId,journalChecksum:journal.checksum,journalVersion:journal.version,preflights,sessions,comparisonGroups:[...groups.values()],comparisonNote:'Grupos separados por estratégia, política, metodologia, fonte, moeda, origem, custos, risco e duração; não garantem independência estatística.'};
}
export async function verifyAndReport(journal){
 const store=new MemoryPaperStore(JSON.stringify([[journal.walletId,journal]]));
 const engine=await PaperTradingEngine.open({walletId:journal.walletId,store});
 return reportVerifiedJournal(await engine.exportJournal());
}
