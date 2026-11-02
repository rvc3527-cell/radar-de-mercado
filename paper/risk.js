import {invariant,PaperError,cash,qty,units,mul,buy,sell,checked} from './money.js';
export const DEFAULTS=Object.freeze({currency:'USDT',initialBalance:10000,maxRiskBps:100,dailyLossBps:300,maxPositions:3,maxAssetExposureBps:2500,feeBps:10,slippageBps:5,maxSpreadBps:100,maxQuoteAgeMs:30000});
export const keyOf=i=>[i.provider,i.market,i.base,i.quote,i.symbol].join(':');
export function validInstrument(i,currency) {
  if(!i||typeof i!=='object'||Object.keys(i).sort().join(',')!=='base,market,provider,quote,symbol')return false;
  if(!['BTC','ETH','SOL'].includes(i.base)||i.market!=='spot'||i.quote!==currency)return false;
  return (i.provider==='binance'&&currency==='USDT'&&i.symbol===i.base+'USDT') || (i.provider==='coinbase-exchange'&&currency==='USD'&&i.symbol===i.base+'-USD');
}
export function configuration(input={}) {
  invariant(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_CONFIG');
  invariant(Object.keys(input).every(k=>Object.hasOwn(DEFAULTS,k)),'UNSUPPORTED_CONFIG_FIELDS');
  const c={...DEFAULTS,...input};invariant(['USD','USDT'].includes(c.currency),'CURRENCY');
  invariant(c.initialBalance>0&&c.initialBalance<=1e9,'INITIAL_BALANCE');cash(c.initialBalance);
  for(const [name,min,max] of [['maxRiskBps',1,1000],['dailyLossBps',1,5000],['maxPositions',1,20],['maxAssetExposureBps',1,10000],['feeBps',0,1000],['slippageBps',0,1000],['maxSpreadBps',1,1000],['maxQuoteAgeMs',1,60000]])invariant(Number.isSafeInteger(c[name])&&c[name]>=min&&c[name]<=max,'INVALID_'+name);
  return c;
}
export function normalizedQuote(q,c,now) {
  invariant(q!==null&&q!==undefined,'QUOTE_REQUIRED');invariant(validInstrument(q.instrument,c.currency),'QUOTE_INSTRUMENT');
  invariant(q.available===true,'PROVIDER_UNAVAILABLE');
  invariant(Number.isSafeInteger(q.at)&&q.at>0&&q.at<=now,'QUOTE_TIME');
  invariant(now-q.at<=c.maxQuoteAgeMs,'QUOTE_STALE');
  invariant(Number.isSafeInteger(q.sequence)&&q.sequence>=0,'QUOTE_SEQUENCE');
  const bid=units(q.bid,6),ask=units(q.ask,6),bidSize=units(q.bidSize,8,{zero:true}),askSize=units(q.askSize,8,{zero:true});
  invariant(ask>=bid,'CROSSED_BOOK');
  return {instrument:{...q.instrument},at:q.at,sequence:q.sequence,bid,ask,bidSize,askSize,bidLeft:bidSize,askLeft:askSize,ready:true};
}
export function valuation(s,c,now) {
  let liquidation=0,unrealized=0;const stale=[],illiquid=[];
  for(const p of Object.values(s.positions)) {
    const quote=s.quotes[keyOf(p.instrument)];invariant(quote,'MISSING_MARK');
    const value=sell(p.quantity,quote.bid,c).net;
    liquidation=checked(liquidation+value);unrealized=checked(unrealized+value-p.entryCost);
    if(quote.ready!==true||now<quote.at||now-quote.at>c.maxQuoteAgeMs)stale.push(keyOf(p.instrument));
    // Group quantity against the same available bid snapshot, not per lot.
  }
  const quantities={};for(const p of Object.values(s.positions))quantities[keyOf(p.instrument)]=(quantities[keyOf(p.instrument)]||0)+p.quantity;
  for(const [key,quantity] of Object.entries(quantities))if(s.quotes[key].ready!==true||s.quotes[key].bidLeft<quantity)illiquid.push(key);
  return {equity:checked(s.cash+liquidation),liquidation,unrealized,stale:[...new Set(stale)],illiquid,realized:s.realized};
}
export function daily(s,c,now) {
  const day=new Date(now).toISOString().slice(0,10),v=valuation(s,c,now);
  if(s.day?.date!==day)s.day={date:day,startEquity:v.equity,locked:false};
  const limit=mul(s.day.startEquity,c.dailyLossBps,10000),loss=Math.max(0,s.day.startEquity-v.equity);
  if(loss>=limit)s.day.locked=true;
  return {limit,loss};
}
export function opening(s,p,q,c,now) {
  invariant(!s.day.locked,'DAILY_LOSS');invariant(!s.halted,'CRITICAL_HALT');
  for(const position of Object.values(s.positions))if(s.quotes[keyOf(position.instrument)].bid<=position.stop){s.halted='STOP_ACTIVE';throw new PaperError('STOP_ACTIVE')}
  const v=valuation(s,c,now);invariant(v.stale.length===0,'PORTFOLIO_STALE');invariant(v.illiquid.length===0,'PORTFOLIO_ILLIQUID');
  invariant(Object.keys(s.positions).length<c.maxPositions,'MAX_POSITIONS');
  invariant(validInstrument(p.instrument,c.currency)&&keyOf(p.instrument)===keyOf(q.instrument),'INSTRUMENT_MISMATCH');
  invariant(mul(q.ask-q.bid,10000,q.bid,{up:true})<=c.maxSpreadBps,'SPREAD');
  const quantity=qty(p.quantity),stop=units(p.stopPrice,6);invariant(stop<q.bid,'STOP_PRICE');
  invariant(quantity<=q.askLeft,'NO_LIQUIDITY');
  const exitQuantity=Object.values(s.positions).filter(x=>keyOf(x.instrument)===keyOf(q.instrument)).reduce((sum,x)=>checked(sum+x.quantity),quantity);invariant(exitQuantity<=q.bidLeft,'NO_EXIT_LIQUIDITY');
  const fill=buy(quantity,q.ask,c);invariant(fill.net<=s.cash,'INSUFFICIENT_BALANCE');
  const atStop=sell(quantity,stop,c).net,risk=fill.net-atStop;
  invariant(risk>0&&risk<=mul(v.equity,c.maxRiskBps,10000),'TRADE_RISK');
  let exposure=fill.net,reserved=risk;
  for(const position of Object.values(s.positions)) {
    reserved=checked(reserved+position.risk);
    if(position.instrument.base===p.instrument.base)exposure=checked(exposure+Math.max(position.entryCost,mul(position.quantity,s.quotes[keyOf(position.instrument)].bid,1e8)));
  }
  invariant(exposure<=mul(v.equity,c.maxAssetExposureBps,10000),'ASSET_EXPOSURE');
  const d=daily(s,c,now);invariant(reserved+d.loss<=d.limit,'DAILY_RISK_RESERVED');
  return {quantity,stop,risk,fill};
}
export {PaperError};
