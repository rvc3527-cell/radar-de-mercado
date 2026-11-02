// Fixed point. Public numbers -> six quote decimals / eight base decimals.
export class PaperError extends Error {
  constructor(code) { super(code); this.name='PaperError'; this.code=code; }
}
export function invariant(ok,code) { if(!ok) throw new PaperError(code); }
export function checked(value) {
  invariant(Number.isSafeInteger(value),'NUMERIC_RANGE'); return value;
}
export function units(value,places,{zero=false}={}) {
  invariant(typeof value==='number'&&Number.isFinite(value)&&(zero?value>=0:value>0),'INVALID_NUMBER');
  const [coefficient,exponent='0']=value.toString().split('e');
  const [whole,fraction='']=coefficient.split('.');
  let n=BigInt(whole+fraction),shift=places+Number(exponent)-fraction.length;
  if(shift<0) {const divisor=10n**BigInt(-shift);invariant(n%divisor===0n,'PRECISION');n/=divisor;}
  else n*=10n**BigInt(shift);
  return checked(Number(n));
}
export function mul(a,b,denominator,{up=false}={}) {
  invariant([a,b,denominator].every(Number.isSafeInteger)&&a>=0&&b>=0&&denominator>0,'NUMERIC_RANGE');
  const product=BigInt(a)*BigInt(b),d=BigInt(denominator);
  return checked(Number((product+(up?d-1n:0n))/d));
}
export const cash=value=>units(value,6,{zero:true});
export const qty=value=>units(value,8);
export const publicCash=value=>value/1e6;
export const publicQty=value=>value/1e8;
export const fee=(amount,bps)=>mul(amount,bps,10000,{up:true});
export function buy(quantity,ask,config) {
  const price=mul(ask,10000+config.slippageBps,10000,{up:true});
  const gross=mul(price,quantity,1e8,{up:true}),fees=fee(gross,config.feeBps);
  return {price,gross,fees,net:checked(gross+fees),slippage:gross-mul(ask,quantity,1e8,{up:true})};
}
export function sell(quantity,bid,config) {
  const price=mul(bid,10000-config.slippageBps,10000);
  const gross=mul(price,quantity,1e8),fees=fee(gross,config.feeBps);
  return {price,gross,fees,net:gross-fees,slippage:mul(bid,quantity,1e8)-gross};
}
