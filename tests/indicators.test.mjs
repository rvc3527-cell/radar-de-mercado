import assert from 'node:assert/strict';
import test from 'node:test';
import '../indicators.js';
const I=globalThis.RadarIndicators;
const near=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
// Exact rational, closed-form weights. No recurrence from the implementation.
function referenceEma(prices,n){
 const p=prices.map(BigInt),N=BigInt(n),k=p.length-n;
 if(k<0)return null;
 let numerator=p.slice(0,n).reduce((a,b)=>a+b,0n)*(N-1n)**BigInt(k);
 for(let j=1;j<=k;j++)numerator+=2n*N*p[n+j-1]*(N-1n)**BigInt(k-j)*(N+1n)**BigInt(j-1);
 return Number(numerator)/Number(N*(N+1n)**BigInt(k));
}
function referenceRsi(prices,n=14){
 if(prices.length<=n)return null;
 const N=BigInt(n),d=prices.slice(1).map((v,i)=>BigInt(v-prices[i])),k=d.length-n;
 const sum=sign=>{
  const moves=d.map(v=>v*sign>0n?v*sign:0n);
  let numerator=moves.slice(0,n).reduce((a,b)=>a+b,0n)*(N-1n)**BigInt(k);
  for(let j=1;j<=k;j++)numerator+=moves[n+j-1]*(N-1n)**BigInt(k-j)*N**BigInt(j);
  return numerator;
 };
 const gain=sum(1n),loss=sum(-1n);
 return gain+loss===0n?50:100*Number(gain)/Number(gain+loss);
}
test('EMA 9 e 21 contra pesos racionais independentes em todos os prefixos',()=>{
 const prices=Array.from({length:65},(_,i)=>100+(i*17)%31);
 for(const n of [9,21])for(let len=1;len<=prices.length;len++){
  const expected=referenceEma(prices.slice(0,len),n),actual=I.ema(prices.slice(0,len),n);
  if(expected===null)assert.equal(actual,null);else near(actual,expected);
 }
});
test('EMA semente SMA e referência simples calculada à mão',()=>{
 near(I.ema([1,2,3,4,5,6,7,8,9],9),5);
 near(I.ema([1,2,3,4,5,6,7,8,9,20],9),8);
 near(I.ema(Array.from({length:21},(_,i)=>i+1),21),11);
 near(I.ema([...Array.from({length:21},(_,i)=>i+1),33],21),13);
});
test('RSI Wilder contra exemplo numérico independente de referência',()=>{
 const p=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64,46.21];
 const expected=[70.46413502109705,66.24961855355505,66.48094183471265,69.34685316290866,66.29471265892624,57.91502067008556,62.880718309962404];
 expected.forEach((v,i)=>near(I.rsi(p.slice(0,15+i)),v,1e-8));
});
test('RSI Wilder contra soma de pesos racionais, não RSI simples',()=>{
 const p=Array.from({length:65},(_,i)=>100+(i*17)%31);
 for(let len=15;len<=p.length;len++)near(I.rsi(p.slice(0,len)),referenceRsi(p.slice(0,len)));
});
test('alta contínua: RSI 100 e EMA 9 maior que EMA 21',()=>{
 const p=Array.from({length:60},(_,i)=>100+i);assert.equal(I.rsi(p),100);assert.ok(I.ema(p,9)>I.ema(p,21));
});
test('queda contínua: RSI 0 e EMA 9 menor que EMA 21',()=>{
 const p=Array.from({length:60},(_,i)=>200-i);assert.equal(I.rsi(p),0);assert.ok(I.ema(p,9)<I.ema(p,21));
});
test('preços constantes: RSI 50 e EMAs constantes',()=>{
 const p=new Array(60).fill(100);assert.equal(I.ema(p,9),100);assert.equal(I.ema(p,21),100);assert.equal(I.rsi(p),50);
});
test('histórico insuficiente é null com limites corretos',()=>{
 assert.equal(I.ema([],9),null);assert.equal(I.ema(new Array(8).fill(100),9),null);
 assert.equal(I.ema(new Array(20).fill(100),21),null);assert.equal(I.rsi(new Array(14).fill(100)),null);
 assert.equal(I.rsi(new Array(15).fill(100)),50);
});
test('rejeita valores inválidos inclusive histórico curto e arrays esparsos',()=>{
 for(const invalid of [0,-1,NaN,Infinity,null,undefined,'100'])for(const fn of [p=>I.ema(p,9),p=>I.rsi(p)])assert.throws(()=>fn([invalid]));
 assert.throws(()=>I.ema(new Array(4),9));assert.throws(()=>I.ema([100],0));assert.throws(()=>I.rsi([100],1.5));
});
test('séries reais e escalares concordam sem usar preços futuros',()=>{
 const p=Array.from({length:80},(_,i)=>100+Math.sin(i)*3),series=I.indicatorSeries(p.map(close=>({close})));
 for(let i=0;i<p.length;i++){
  for(const [key,fn] of [['ema9',v=>I.ema(v,9)],['ema21',v=>I.ema(v,21)],['rsi14',v=>I.rsi(v)]])assert.equal(series[key][i],fn(p.slice(0,i+1)));
  if(series.rsi14[i]!==null)assert.ok(series.rsi14[i]>=0&&series.rsi14[i]<=100);
 }
});
test('candles abertos e recém-fechados ficam fora; entrada descendente é ordenada',()=>{
 const end=1800000000000,items=Array.from({length:50},(_,i)=>({time:(end-(49-i)*60000)/1000,close:100+i}));
 const a=I.analyzeCandles(items.reverse(),{now:end+62000});assert.equal(a.rows.length,49);
 const b=I.analyzeCandles([...items,{time:(end+60000)/1000,close:99999}],{now:end+70000});assert.equal(b.rows.length,50);
 assert.throws(()=>I.analyzeCandles(items.filter((_,i)=>i!==10),{now:end+70000}));
});
test('limites de alinhamento preservados e regra de empate explícita',()=>{
 assert.equal(I.classify(102,101,50).aligned,true);assert.equal(I.classify(102,101,70).aligned,false);
 assert.equal(I.classify(101,102,50).aligned,true);assert.equal(I.classify(101,102,30).aligned,false);
 assert.deepEqual(I.classify(100,100,50),{direction:0,aligned:false});
 assert.deepEqual(I.classify(100,100,50,{tieDirection:-1}),{direction:-1,aligned:true});
});
