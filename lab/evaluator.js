// Read-only evaluator of verified journals. Never constructs an execution engine
// or calls candidates; inspection replays only in a separate MemoryPaperStore.
import {inspectArchive} from '../paper/archive.js';
import {reportVerifiedJournal} from '../paper/report.js';
import {digest,canonical} from '../paper/integrity.js';
import {invariant,buy,sell,cash,publicCash} from '../paper/money.js';
import {INSTRUMENT} from '../paper/market.js';
import {verifyAnyProtocol as verifyProtocol} from './protocol.js';
import {verifyBinding} from '../paper/provenance.js';
export async function evaluate(input,{protocol=null,phase=null}={}){
 const checked=await inspectArchive(input),journal=checked.journal,report=reportVerifiedJournal(journal);
 if(protocol){await verifyProtocol(protocol);invariant(Object.hasOwn(protocol.windows,phase),'LAB_PHASE')}
 const allFills=new Map();for(const e of journal.events)for(const f of e.decision.accounting?.executions||[])allFills.set(f.id,{fill:f,quote:e.command.payload.quote});
 const sessions=await Promise.all(report.sessions.map(async s=>{
  const exclusions=[];let provenance={linked:false,independentAnteriority:false,finalValidationAllowed:false};
  const starts=journal.events.filter(e=>e.command.type==='note'&&e.command.payload.kind==='SESSION_START'&&e.command.id===s.id+':start');
  if(starts.length===1){try{const note=JSON.parse(starts[0].command.payload.details);if(note.provenance)provenance=await verifyBinding(note.provenance,{config:journal.config,origin:s.origin,startedAt:starts[0].command.at,endsAt:s.plannedEndAt,strategy:s.strategy,policy:s.policy,instrument:s.declaredInstrument})}catch(e){exclusions.push('Vínculo de protocolo inválido: '+(e.code||e.message));}}

  if(s.strategy!=='ema-observe-v72'||s.policy!=='v7.2-paper-test-1'||s.methodology!=='v5.7')exclusions.push('Metodologia ou estratégia incompatível.');
  if(canonical(s.instrument)!==canonical(INSTRUMENT)||s.instrumentMismatch)exclusions.push('Fonte, instrumento ou moeda incompatível.');
  if(!s.terminationConfirmed||s.carriedPositions||s.residualPositions.length)exclusions.push('Sessão incompleta ou com posições herdadas/residuais.');
  if(protocol){const w=protocol.windows[phase];if(s.startedAt<w[0]||s.lastObservedAt>=w[1])exclusions.push('Sessão fora da etapa cronológica.');if(s.origin!==protocol.origin||canonical(s.config)!==canonical(protocol.config)||(protocol.format==='radar-protocol-v76'?s.plannedEndAt!==protocol.windows.final[1]:s.plannedEndAt-s.startedAt!==protocol.durationMinutes*60000))exclusions.push('Origem, configuração ou duração incompatível com protocolo.');if(!provenance.linked)exclusions.push('O diário legado não atesta o hash de código/protocolo; comparação final bloqueada.');else if(provenance.manifestSha256!==protocol.seal)exclusions.push('Hash do protocolo externo difere do vínculo no diário.');if(phase==='final'&&!provenance.independentAnteriority)exclusions.push('Anterioridade independente não comprovada; comparação final bloqueada.');}
  const complete=s.carriedPositions===0&&s.residualPositions.length===0&&s.terminationConfirmed;
  const sensitivity=complete?[{feeBps:0,slippageBps:0},{feeBps:journal.config.feeBps,slippageBps:journal.config.slippageBps},{feeBps:20,slippageBps:10}].map(cost=>{
   let net=0,fees=0,slippage=0;for(const execution of s.executions){const item=allFills.get(execution.id);invariant(item?.quote,'LAB_FILL_QUOTE');const {fill:f,quote:q}=item,v=f.side==='buy'?buy(f.quantity,cash(q.ask),cost):sell(f.quantity,cash(q.bid),cost);net+=f.side==='buy'?-v.net:v.net;fees+=v.fees;slippage+=v.slippage}
   return {...cost,netFixedFills:publicCash(net),fees:publicCash(fees),slippage:publicCash(slippage)};
  }):[];
  return {provenance,sessionId:s.id,origin:s.origin,strategy:s.strategy,policy:s.policy,methodology:s.methodology,instrument:s.instrument,config:s.config,startedAt:s.startedAt,endedAt:s.endedAt,net:s.netSimulated,drawdownObserved:s.drawdownObserved,roundTrips:s.validRoundTrips,averageWin:s.averageWin,averageLoss:s.averageLoss,exposureMs:s.exposureMs,costs:s.costs,blocks:s.operations.riskBlocks,proposals:s.operations.proposalsApproved+s.operations.proposalsRejected,coverage:s.elapsedMs?s.monitoredMs/s.elapsedMs:null,validQuotes:s.operations.validQuotes,rejectedQuotes:s.operations.rejectedQuotes,telemetryAvailable:s.operations.telemetrySamples>0,conditions:s.conditions,phase:protocol?phase:'exploration',exclusions,eligibleForComparison:exclusions.length===0&&s.sampleSufficient,hitRate:exclusions.length===0&&s.sampleSufficient?s.hitRate:null,sensitivity,warnings:[...s.warnings,'Sensibilidade usa mesmos fills/quantidades: não reexecuta estratégia/risco nem comprova viabilidade sob outros custos.','Cobertura refere-se aos intervalos observados, não à disponibilidade contínua da fonte.']};
 }));
 return {format:'radar-lab-report-v75',walletId:journal.walletId,journalDigest:checked.digest,journalChecksum:journal.checksum,protocolSeal:protocol?.seal??null,reportVersion:report.version,sessions,ranking:null,warning:'Análise experimental. Sem classificação de melhor estratégia, previsão ou execução.',sampleDigest:await digest({journal:checked.digest,protocol:protocol?.seal??null,phase})};
}
export function compare(evaluations){const seen=new Set(),sessions=new Set();for(const r of evaluations){invariant(r.format==='radar-lab-report-v75'&&!seen.has(r.journalDigest),'LAB_DUPLICATE_SAMPLE');seen.add(r.journalDigest);for(const s of r.sessions){const key=JSON.stringify([r.walletId,s.sessionId,s.startedAt]);invariant(!sessions.has(key),'LAB_DUPLICATE_SESSION');sessions.add(key)}}return {ranking:null,groups:evaluations.flatMap(x=>x.sessions).map(s=>({strategy:s.strategy,origin:s.origin,phase:s.phase,roundTrips:s.roundTrips,eligible:s.eligibleForComparison})),warning:'Amostras não agregadas; períodos, condições e origens exigem revisão. Nenhuma candidata alternativa foi executada.'}}
