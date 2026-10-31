// Execute com: node tests/indicators.test.mjs
// Testes determinísticos sem acesso à rede ou execução de operações.
import assert from 'node:assert/strict';
import test from 'node:test';

function ema(values,n){if(values.length<n)return null;let e=values.slice(0,n).reduce((a,b)=>a+b,0)/n;for(let i=n;i<values.length;i++)e=values[i]*(2/(n+1))+e*(1-2/(n+1));return e}
function rsi(values,n=14){if(values.length<=n)return null;let gains=0,losses=0;for(let i=1;i<=n;i++){let d=values[i]-values[i-1];gains+=Math.max(d,0);losses+=Math.max(-d,0)}let g=gains/n,l=losses/n;for(let i=n+1;i<values.length;i++){let d=values[i]-values[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}return l===0?(g===0?50:100):100-100/(1+g/l)}
function indicatorSeries(items){const len=items.length,ema9=new Array(len).fill(null),ema21=new Array(len).fill(null),rsi14=new Array(len).fill(null),k9=2/10,k21=2/22;let sum9=0,sum21=0,e9=0,e21=0,g=0,l=0;for(let i=0;i<len;i++){const v=items[i].close;if(i<9)sum9+=v;if(i===8)e9=sum9/9;else if(i>8)e9=v*k9+e9*(1-k9);if(i>=8)ema9[i]=e9;if(i<21)sum21+=v;if(i===20)e21=sum21/21;else if(i>20)e21=v*k21+e21*(1-k21);if(i>=20)ema21[i]=e21;if(i>0){const d=v-items[i-1].close,up=Math.max(d,0),down=Math.max(-d,0);if(i<=14){g+=up;l+=down;if(i===14){g/=14;l/=14}}else{g=(g*13+up)/14;l=(l*13+down)/14}if(i>=14)rsi14[i]=l===0?(g===0?50:100):100-100/(1+g/l)}}return {ema9,ema21,rsi14}}
function near(a,b){if(a===null||b===null)assert.equal(a,b);else assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a)),`Diferença: ${a} vs ${b}`)}
function compare(closes){const items=closes.map(close=>({close})),series=indicatorSeries(items);for(let i=0;i<closes.length;i++){near(series.ema9[i],ema(closes.slice(0,i+1),9));near(series.ema21[i],ema(closes.slice(0,i+1),21));near(series.rsi14[i],rsi(closes.slice(0,i+1),14))}}
test('histórico oscilante determinístico',()=>{const prices=Array.from({length:300},(_,i)=>100+0.05*i+3*Math.sin(i/7)+0.5*Math.cos(i/3));compare(prices)});
test('mercado lateral',()=>compare(Array.from({length:80},()=>100)));
test('subida e queda',()=>compare([...Array.from({length:90},(_,i)=>100+i),...Array.from({length:90},(_,i)=>190-i)]));
test('histórico insuficiente',()=>compare([100,101,99,100]));
