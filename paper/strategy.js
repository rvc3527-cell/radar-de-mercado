import {INSTRUMENT} from './market.js';
import {invariant} from './money.js';
export const STRATEGY='ema-observe-v72',POLICY='v7.2-paper-test-1';
// An integration experiment, not a validated trading strategy or profit forecast.
export function decide({rows,quote,snapshot,now,indicators=globalThis.RadarIndicators}) {
  invariant(Object.entries(INSTRUMENT).every(([key,value])=>quote?.instrument?.[key]===value)&&snapshot.currency==='USD','STRATEGY_INSTRUMENT');
  const reading=indicators.analyzeCandles(rows,{now,marginMs:5000}),candles=reading.rows,last=candles.at(-1),time=last?last.time*1000+60000:0;
  const evidence={policy:POLICY,methodology:'v5.7',instrument:INSTRUMENT,start:candles[0]?.time,closeTime:time,closes:candles.map(x=>x.close),ranges10:candles.slice(-10).map(x=>[x.low,x.high]),ema9:reading.ema9,ema21:reading.ema21,rsi14:reading.rsi14};
  const wait=reason=>({time,reason,proposal:null,evidence});
  if(candles.length<40||now-time<5000||now-time>90000)return wait('Aguardando histórico fechado e recente.');
  if(!quote.available||quote.at>now||now-quote.at>10000)return wait('Aguardando livro de ofertas recente.');
  const position=snapshot.positions[0];
  if(position){
    if(position.strategyId!==STRATEGY)return wait('Posição de outra estratégia: revisão necessária.');
    if(reading.ema9<=reading.ema21||reading.rsi14>=70||now-position.openedAt>=300000)return {time,reason:'Saída fictícia: alinhamento terminou, força excessiva ou limite experimental de cinco minutos.',evidence,proposal:{id:'v72:close:'+position.id+':'+time,action:'close',instrument:{...INSTRUMENT},positionId:position.id,policy:POLICY}};
    return wait('Posição fictícia acompanhada; stop permanece condicionado ao bid disponível.');
  }
  const range=Math.max(...candles.slice(-10).map(x=>(x.high-x.low)/x.close*100)),extended=(last.close/reading.ema9-1)*100;
  evidence.maxRangePct=range;evidence.extensionPct=extended;
  if(range>1||extended>0.5)return wait('Aguardar: oscilação ou extensão do movimento acima do limite experimental.');
  if(quote.bid<=reading.ema9||Math.abs(quote.ask/last.close-1)*100>0.5)return wait('Aguardar: livro atual não confirma o contexto dos fechamentos.');
  const two=candles.slice(-3);if(!(reading.ema9>reading.ema21&&reading.rsi14>=50&&reading.rsi14<=65&&two[2].close>two[1].close&&two[1].close>two[0].close))return wait('Aguardar: tendência e dois fechamentos de alta ainda não confirmados.');
  const quantity=Math.floor(Math.min(snapshot.cash*0.05,1000)/quote.ask*1e8)/1e8,stopPrice=Math.floor(quote.bid*0.995*1e6)/1e6;
  return {time,reason:'Proposta fictícia: médias alinhadas, força moderada e dois fechamentos de alta. Evidência de rentabilidade ainda não validada.',evidence,proposal:{id:'v72:open:BTC-USD:'+time,action:'open',instrument:{...INSTRUMENT},quantity,stopPrice,policy:POLICY}};
}
