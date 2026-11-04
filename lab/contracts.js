// Data-only contracts. No strategy callbacks, market I/O, wallets or execution ports.
import {digest,canonical} from '../paper/integrity.js';
import {invariant} from '../paper/money.js';
import {INSTRUMENT} from '../paper/market.js';
import {SESSION_CONFIG} from '../paper/config.js';
export function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value}
const descriptor=(id,family,version,parameters,status='contract-only')=>freeze({id,family,version,parameters,methodology:'v5.7',instrument:{...INSTRUMENT},status,execution:'forbidden'});
export const CANDIDATES=freeze([
 descriptor('ema-observe-v72','ema-rsi','v7.2-paper-test-1',{emaFast:9,emaSlow:21,rsiPeriod:14,rsiMin:50,rsiMax:65,maxRangePct:1,maxExtensionPct:.5,confirmCloses:2,maxExposureMs:300000,allocationPct:5,stopDistancePct:.5},'reference-frozen'),
 descriptor('trend-confirmation','trend','contract-v1',{}),descriptor('breakout-volatility','breakout','contract-v1',{}),descriptor('mean-reversion','reversion','contract-v1',{}),descriptor('no-trade','abstention','contract-v1',{})
]);
export function candidate(input){const match=CANDIDATES.find(x=>x.id===input?.id);invariant(match&&canonical(input)===canonical(match),'LAB_CANDIDATE');return freeze(JSON.parse(JSON.stringify(match)))}
export function splitWindows(windows){invariant(windows&&Object.keys(windows).sort().join(',')==='development,final,selection','LAB_WINDOWS');let end=0;for(const key of ['development','selection','final']){const w=windows[key];invariant(Array.isArray(w)&&w.length===2&&w.every(Number.isSafeInteger)&&w[0]>0&&w[0]>=end&&w[1]>w[0],'LAB_CHRONOLOGY');end=w[1]}return freeze(JSON.parse(JSON.stringify(windows)))}
const HASH=/^[a-f0-9]{64}$/;
export async function createProtocol({registeredAt,windows,durationMinutes,codeHashes,origin='prospective-real'}){
 invariant(Number.isSafeInteger(registeredAt)&&registeredAt>0&&[60,120].includes(durationMinutes),'LAB_PROTOCOL');const periods=splitWindows(windows);
 invariant(periods.final[0]>=registeredAt&&periods.final[1]-periods.final[0]>=durationMinutes*60000,'LAB_FINAL_FUTURE');
 invariant(['prospective-real','synthetic','retrospective'].includes(origin),'LAB_ORIGIN');
 const required=['paper/strategy.js','paper/session.js','paper/risk.js','paper/engine.js','paper/market.js','paper/money.js','paper/integrity.js','paper/store.js','paper/archive.js','paper/report.js','indicators.js','lab/contracts.js','lab/evaluator.js'];invariant(codeHashes&&required.every(k=>HASH.test(codeHashes[k]))&&Object.values(codeHashes).every(x=>typeof x==='string'&&HASH.test(x)),'LAB_CODE_HASH');
 const body={format:'radar-protocol-v75',registeredAt,windows:periods,durationMinutes,codeHashes:{...codeHashes},origin,instrument:{...INSTRUMENT},strategy:'ema-observe-v72',policy:'v7.2-paper-test-1',methodology:'v5.7',config:{...SESSION_CONFIG},candidates:CANDIDATES,minRoundTrips:30,execution:'supervised-manual-only',stops:['risk','source','storage','visibility','supervision-gap','duration','journal-capacity'],pollingMs:15000};
 return freeze({...body,seal:await digest(body)});
}
export async function verifyProtocol(input){const expected=await createProtocol(input);invariant(canonical(input)===canonical(expected),'LAB_PROTOCOL_SEAL');return expected}
// An as-of view is the only candidate input contract. Availability is supplied,
// not inferred as evidence that a historical downloader knew a price earlier.
export function frameAt({instrument,rows,asOf,phase,windows}){
 invariant(canonical(instrument)===canonical(INSTRUMENT),'LAB_INSTRUMENT');splitWindows(windows);invariant(Object.hasOwn(windows,phase)&&Number.isSafeInteger(asOf)&&asOf>=windows[phase][0]&&asOf<windows[phase][1],'LAB_PHASE');
 invariant(Array.isArray(rows)&&rows.length<=10000,'LAB_ROWS');
 for(const r of rows)invariant(r&&Number.isSafeInteger(r.time)&&Number.isSafeInteger(r.availableAt),'LAB_AVAILABILITY');
 const eligible=rows.filter(r=>r.availableAt<=asOf&&r.time*1000+65000<=asOf);let previous=0;
 for(const r of eligible){invariant(r&&Object.keys(r).sort().join(',')==='availableAt,close,high,low,open,time','LAB_ROW');invariant(Number.isSafeInteger(r.time)&&r.time%60===0&&r.time>previous&&Number.isSafeInteger(r.availableAt)&&r.availableAt>=r.time*1000+65000,'LAB_AVAILABILITY');invariant([r.open,r.high,r.low,r.close].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)&&r.high>=Math.max(r.open,r.close)&&r.low<=Math.min(r.open,r.close)&&r.low<=r.high,'LAB_OHLC');previous=r.time}
 const known=eligible.map(r=>({...r}));
 return freeze({instrument:{...INSTRUMENT},asOf,phase,rows:known,execution:'forbidden',availabilityTrust:'host-declared'});
}
