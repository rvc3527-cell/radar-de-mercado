// Public, read-only Coinbase Exchange. No candles are used as execution quotes.
import {invariant,units} from './money.js';
export const INSTRUMENT=Object.freeze({provider:'coinbase-exchange',market:'spot',base:'BTC',quote:'USD',symbol:'BTC-USD'});
export const POLLING_MS=15000;
const BASE='https://api.exchange.coinbase.com/products/BTC-USD',MINUTE=60000;
export function retryUntil(value,now) {
  const delay=/^\d+(\.\d+)?$/.test(value||'')?Number(value)*1000:Date.parse(value);
  return Math.max(now+60000,Number.isFinite(delay)?(/^\d/.test(value||'')&&!String(value).includes('-')?now+delay:delay):now+300000);
}
export function parseBook(raw,now,previous=null) {
  invariant(raw&&raw.auction_mode===false&&!raw.auction,'AUCTION_OR_INVALID_BOOK');
  invariant(Number.isSafeInteger(raw.sequence)&&raw.sequence>=0,'BOOK_SEQUENCE');
  invariant(typeof raw.time==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(raw.time),'BOOK_TIME');
  // Normalize provider nanoseconds to milliseconds explicitly for Safari.
  const at=Date.parse(raw.time.replace(/\.(\d+)(?=Z)/,(_,digits)=>'.'+digits.padEnd(3,'0').slice(0,3)));invariant(Number.isSafeInteger(at)&&new Date(at).toISOString().slice(0,19)===raw.time.slice(0,19)&&at<=now&&now-at<=5000,'BOOK_STALE_OR_CLOCK');
  invariant(Array.isArray(raw.bids)&&raw.bids.length===1&&Array.isArray(raw.asks)&&raw.asks.length===1,'BOOK_LEVELS');
  for(const row of [raw.bids[0],raw.asks[0]])invariant(Array.isArray(row)&&row.length===3&&row.slice(0,2).every(x=>typeof x==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(x))&&Number.isSafeInteger(row[2])&&row[2]>=0,'BOOK_LEVEL_VALUES');
  const bid=Number(raw.bids[0][0]),ask=Number(raw.asks[0][0]),bidSize=Number(raw.bids[0][1]),askSize=Number(raw.asks[0][1]);
  for(const x of [bid,ask])units(x,6);for(const x of [bidSize,askSize])units(x,8,{zero:true});
  invariant(ask>=bid,'CROSSED_BOOK');invariant((ask/bid-1)*10000<=20,'SPREAD');
  const quote={instrument:{...INSTRUMENT},at,sequence:raw.sequence,bid,ask,bidSize,askSize,available:true};
  if(previous){invariant(at>=previous.at&&quote.sequence>=previous.sequence,'BOOK_REORDERED');if(quote.sequence===previous.sequence)invariant(JSON.stringify(quote)===JSON.stringify(previous),'BOOK_CONFLICT')}
  return quote;
}
export function parseCandles(raw,now,indicators) {
  invariant(Array.isArray(raw)&&raw.length<=300,'CANDLE_RESPONSE');
  const items=raw.map(row=>{
    invariant(Array.isArray(row)&&row.length===6&&row.every(x=>typeof x==='number'&&Number.isFinite(x)),'CANDLE_RESPONSE');
    const [time,low,high,open,close,volume]=row;invariant(Number.isSafeInteger(time)&&time>0&&time%60===0&&low>0&&high>=Math.max(open,close)&&low<=Math.min(open,close)&&open>0&&close>0&&volume>=0,'CANDLE_OHLC');
    return {time,low,high,open,close,volume};
  });
  const seen=new Map();for(const x of items){if(seen.has(x.time))invariant(JSON.stringify(seen.get(x.time))===JSON.stringify(x),'CANDLE_CONFLICT');seen.set(x.time,x)}
  const rows=indicators.closedMinuteCandles([...seen.values()],{now,marginMs:5000});
  invariant(rows.length>=40&&rows.length<=180,'CANDLE_HISTORY');
  const latest=rows.at(-1).time*1000+MINUTE;invariant(now-latest>=5000&&now-latest<=90000,'CANDLE_STALE');return rows;
}
export class CoinbasePaperFeed {
  constructor({fetcher=(...args)=>globalThis.fetch(...args),clock=()=>Date.now(),indicators=globalThis.RadarIndicators,cooldown}={}){
    this.fetcher=fetcher;this.clock=clock;this.indicators=indicators;this.cooldown=cooldown;this.lastRequest=0;this.lastCandles=0;this.previous=null;this.rows=null;this.busy=false;
  }
  storage(){return this.cooldown??globalThis.localStorage}
  cooldownUntil(){const store=this.storage();invariant(store,'COOLDOWN_STORAGE');const n=Number(store.getItem('radar-paper-coinbase-cooldown-v72')||0);invariant(Number.isSafeInteger(n)&&n>=0,'COOLDOWN_STORAGE');return n}
  async request(path) {
    const now=this.clock();invariant(now>=this.cooldownUntil(),'COOLDOWN');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await this.fetcher(BASE+path,{cache:'no-store',credentials:'omit',signal:controller.signal});
      if(response.status===429){const until=retryUntil(response.headers.get('Retry-After'),this.clock());this.storage().setItem('radar-paper-coinbase-cooldown-v72',String(until));invariant(this.cooldownUntil()===until,'COOLDOWN_STORAGE')}
      invariant(response.ok,'HTTP_'+response.status);
      const reader=response.body?.getReader();let text='';
      if(reader){const decoder=new TextDecoder();let bytes=0;try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;invariant(bytes<=65536,'RESPONSE_SIZE');text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel()}}
      else {text=await response.text();invariant(text.length<=65536,'RESPONSE_SIZE')}
      return JSON.parse(text);
    }finally{clearTimeout(timer)}
  }
  async sample() {
    const now=this.clock();invariant(!this.busy,'FEED_BUSY');invariant(now>=this.cooldownUntil(),'COOLDOWN');invariant(now-this.lastRequest>=POLLING_MS,'POLL_INTERVAL');this.busy=true;this.lastRequest=now;
    try{
      if(!this.rows||now-this.lastCandles>=60000){const end=Math.floor((now-5000)/MINUTE)*MINUTE,start=end-180*MINUTE;this.rows=parseCandles(await this.request('/candles?granularity=60&start='+new Date(start).toISOString()+'&end='+new Date(end).toISOString()),this.clock(),this.indicators);this.lastCandles=now}
      const quote=parseBook(await this.request('/book?level=1'),this.clock(),this.previous);this.previous=quote;
      return {quote,rows:this.rows,receivedAt:this.clock(),source:'Coinbase Exchange · BTC/USD'};
    }finally{this.busy=false}
  }
}
