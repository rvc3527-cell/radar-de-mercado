// Pure signals-only chronological replay. No wallet, execution engine, store or market I/O.
import {frameAt,freeze,splitWindows} from './contracts.js';
import {confirmedTrend,CONFIRMED_TREND} from './confirmed-trend.js';
import {decide,STRATEGY,POLICY} from '../paper/strategy.js';
import {INSTRUMENT,parseBook} from '../paper/market.js';
import {SESSION_CONFIG} from '../paper/config.js';
import {canonical,digest} from '../paper/integrity.js';
import {invariant} from '../paper/money.js';
export async function runOffline(input,{phase='selection',indicators=globalThis.RadarIndicators}={}){
 invariant(!input?.config||canonical(input.config)===canonical(SESSION_CONFIG),'OFFLINE_CONFIG');
 invariant(input?.format==='radar-offline-bars-v76'&&['synthetic','retrospective','prospective-real'].includes(input.origin),'OFFLINE_FORMAT');
 invariant(canonical(input.instrument)===canonical(INSTRUMENT),'OFFLINE_INSTRUMENT');const windows=splitWindows(input.windows);invariant(Object.hasOwn(windows,phase),'OFFLINE_PHASE');
 invariant(Array.isArray(input.rows)&&input.rows.length<=10000&&Array.isArray(input.times)&&input.times.length<=1000&&Array.isArray(input.books??[])&&(input.books??[]).length<=2000,'OFFLINE_SIZE');
 let t=0;for(const r of input.rows){invariant(r&&Number.isSafeInteger(r.time)&&r.time%60===0&&r.time>t&&Number.isSafeInteger(r.availableAt)&&r.availableAt>=r.time*1000+65000,'OFFLINE_ROWS');t=r.time}
 t=0;for(const at of input.times){invariant(Number.isSafeInteger(at)&&at>t,'OFFLINE_TIMES');t=at}
 const books=input.books??[];t=0;for(const b of books){invariant(Number.isSafeInteger(b.availableAt)&&b.availableAt>t,'OFFLINE_BOOK_ORDER');t=b.availableAt}
 const {seal,...body}=input;if(seal!==undefined)invariant(seal===await digest(body),'OFFLINE_SEAL');
 const states={reference:null,candidate:null},decisions=[];let cursor=0,last=null,previous=null,bookError=null,comparable=0;
 for(const asOf of input.times.filter(x=>x>=windows[phase][0]&&x<windows[phase][1])){
  while(cursor<books.length&&books[cursor].availableAt<=asOf){const b=books[cursor++];try{last=parseBook(b.book,b.availableAt,previous);previous=last;bookError=null}catch(e){last=null;bookError=e.code||e.message}}
  const quote=last&&asOf-last.at<=5000?last:null,liquid=quote&&quote.bidSize>0&&quote.askSize>0;
  let frame,quality='valid',reference,candidate;
  try{
   const full=frameAt({instrument:input.instrument,rows:input.rows,asOf,phase,windows});frame=freeze({...full,rows:full.rows.slice(-180)});
   // The shared indicator validator blocks gaps. No missing bar is filled.
   const reading=indicators.analyzeCandles(frame.rows,{now:asOf,marginMs:5000});
   invariant(frame.rows.length>=40,'OFFLINE_WARMUP');invariant(asOf-(frame.rows.at(-1).time*1000+60000)<=90000,'OFFLINE_STALE');
   quality=liquid?'valid':bookError||(!quote?'BOOK_UNAVAILABLE':'NO_L1_LIQUIDITY');
   candidate=confirmedTrend({frame,quote:liquid?quote:null,observation:states.candidate,indicators});
   if(liquid){const r=decide({rows:frame.rows,quote,snapshot:{currency:'USD',cash:SESSION_CONFIG.initialBalance,positions:states.reference?[{...states.reference,strategyId:STRATEGY}]:[]},now:asOf,indicators});reference={action:r.proposal?.action??'wait',reason:r.reason,confirmed:!!r.proposal,evidence:{ema9:r.evidence.ema9,ema21:r.evidence.ema21,rsi14:r.evidence.rsi14,closeAt:r.evidence.closeTime,rangePct:r.evidence.maxRangePct??null,extensionPct:r.evidence.extensionPct??null}};comparable++}
   else reference={action:'wait',reason:'Referência não avaliada: falta livro válido e líquido.',confirmed:false};
   void reading;
  }catch(e){quality=e.code||e.message;reference={action:'wait',reason:'Dados rejeitados: '+quality,confirmed:false};candidate={...reference}}
  for(const [key,d] of Object.entries({reference,candidate})){if(quality==='valid'&&d.action==='open'&&!states[key])states[key]={id:'signal:'+key+':'+asOf,openedAt:asOf};if(d.action==='close')states[key]=null;}
  decisions.push({asOf,knownThrough:frame?.rows.at(-1)?.time??null,quality,quoteEvidence:quote?{...quote,spreadBps:(quote.ask/quote.bid-1)*10000,availabilityTrust:'host-declared'}:null,reference,candidate,execution:'none'});
 }
 const summary=key=>{const d=decisions.map(x=>x[key]);return {decisions:d.length,openSignals:d.filter(x=>x.action==='open').length,exitSignals:d.filter(x=>x.action==='close').length,wait:d.filter(x=>x.action==='wait').length,candleOnly:d.filter(x=>x.action==='observe').length,abstention:d.length?d.filter(x=>['wait','observe'].includes(x.action)).length/d.length:null,completeTrades:0,net:null,drawdown:null,exposure:null,feesPaid:null,slippagePaid:null,costSensitivity:null}};
 const result={format:'radar-offline-report-v76',origin:input.origin,originTrust:'host-declared',instrument:INSTRUMENT,phase,window:windows[phase],dataDigest:await digest(body),reference:{id:STRATEGY,policy:POLICY,...summary('reference')},candidate:{descriptor:CONFIRMED_TREND,...summary('candidate')},config:SESSION_CONFIG,decisions,proposals:[],executions:[],roundTrips:[],comparison:{decisionsAllowed:comparable>0,comparableDecisions:comparable,totalDecisions:decisions.length,coverage:decisions.length?comparable/decisions.length:null,financialAllowed:false,winner:null},limitations:['Somente sinais e acompanhamento hipotético, sem posição, ordem ou fill.','Livros pontuais não comprovam execução, stop, fila ou liquidez ao longo da operação.','PnL, drawdown financeiro, exposição e sensibilidade executável não são calculados.','Amostra insuficiente para declarar vencedora ou validação final independente.']};
 return freeze({...result,seal:await digest(result)});
}
