// Corruption detection, not authentication against an owner who can rewrite storage.
import {invariant} from './money.js';
export function canonical(value) {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export async function digest(value) {
  invariant(globalThis.crypto?.subtle,'CRYPTO_UNAVAILABLE');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export const genesis=(walletId,config)=>digest({schema:'radar-paper-v1',walletId,config,moneyDecimals:6,quantityDecimals:8});
export const advance=(previous,event)=>digest({previous,event});
