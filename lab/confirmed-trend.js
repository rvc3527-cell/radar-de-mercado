// Offline observations only. Frozen ex-ante hypothesis: docs/HYPOTHESIS-confirmed-trend-v1.md.
import {freeze} from './contracts.js';
import {invariant} from '../paper/money.js';
import {INSTRUMENT} from '../paper/market.js';
import {canonical} from '../paper/integrity.js';
import {normalizedQuote} from '../paper/risk.js';
import {SESSION_CONFIG} from '../paper/config.js';
export const CONFIRMED_TREND=freeze({id:'confirmed-trend-v1',version:'confirmed-trend-policy-1',methodology:'v5.7',instrument:{...INSTRUMENT},execution:'offline-decisions-only',parameters:{emaFast:9,emaSlow:21,minBars:40,slopeBars:3,confirmCloses:3,rangeBars:10,maxRangePct:.8,maxExtensionPct:.3,maxHoldMs:300000,marginMs:5000}});
export function confirmedTrend({frame,quote=null,observation=null,indicators=globalThis.RadarIndicators}){
 invariant(frame?.execution==='forbidden'&&canonical(frame.instrument)===canonical(INSTRUMENT),'CANDIDATE_FRAME');
 const p=CONFIRMED_TREND.parameters,rows=indicators.closedMinuteCandles(frame.rows,{now:frame.asOf,marginMs:p.marginMs});
 invariant(rows.every(r=>[r.open,r.high,r.low,r.close].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)&&r.high>=Math.max(r.open,r.close)&&r.low<=Math.min(r.open,r.close)),'CANDIDATE_OHLC');
 let evidence={closedCandles:rows.length,methodology:'v5.7'};const wait=reason=>({action:'wait',reason,confirmed:false,evidence});if(rows.length<p.minBars)return wait('Histórico insuficiente.');
 const series=indicators.indicatorSeries(rows),fast=series.ema9.at(-1),slow=series.ema21.at(-1),last=rows.at(-1),closeAt=last.time*1000+60000;
 evidence={...evidence,ema9:fast,ema21:slow,closeAt};
 if(frame.asOf-closeAt>90000)return wait('Candles desatualizados.');
 if(quote)normalizedQuote(quote,SESSION_CONFIG,frame.asOf);
 if(observation){invariant(Number.isSafeInteger(observation.openedAt)&&observation.openedAt<=frame.asOf,'CANDIDATE_OBSERVATION');if(fast<=slow||last.close<slow||frame.asOf-observation.openedAt>=p.maxHoldMs)return {action:'close',reason:'Sinal terminou: tendência, fechamento ou limite de cinco minutos.',confirmed:!!quote,evidence};return wait('Acompanhando sinal hipotético; nenhuma posição foi executada.');}
 const range=Math.max(...rows.slice(-p.rangeBars).map(r=>100*(r.high-r.low)/r.close)),extension=100*(last.close/fast-1);
 evidence={...evidence,rangePct:range,extensionPct:extension};
 if(range>p.maxRangePct||extension<0||extension>p.maxExtensionPct)return wait('Oscilação ou extensão acima do filtro.');
 const recent=rows.slice(-3),ema=series.ema9.slice(-3);
 if(!(fast>slow&&fast>series.ema9.at(-4)&&slow>series.ema21.at(-4)&&recent.every((r,i)=>r.close>ema[i])&&recent[2].close>recent[1].close&&recent[1].close>recent[0].close))return wait('Tendência e três fechamentos ainda não confirmados.');
 if(!quote)return {action:'observe',reason:'Condição de candles; falta livro para confirmar.',confirmed:false,evidence};
 const q=normalizedQuote(quote,SESSION_CONFIG,frame.asOf);
 if((q.ask/q.bid-1)*10000>SESSION_CONFIG.maxSpreadBps||q.bidSize===0||q.askSize===0)return wait('Spread excessivo ou liquidez L1 ausente.');
 if(quote.bid<=fast||Math.abs(quote.ask/last.close-1)*100>p.maxExtensionPct)return wait('Livro não confirma os fechamentos.');
 return {action:'open',reason:'Tendência persistente, três fechamentos e livro confirmados; somente sinal offline.',confirmed:true,evidence};
}
