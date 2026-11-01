/* v5.7: one implementation for classic browser scripts and Worker module imports. */
(function(root){
  'use strict';
  const methodologyVersion='v5.7';
  function validate(values,n){
    if(!Number.isInteger(n)||n<1)throw Error('Período inválido');
    if(!Array.isArray(values))throw Error('Lista de preços inválida');
    for(const v of values)if(typeof v!=='number'||!Number.isFinite(v)||v<=0)throw Error('Preço inválido: use números positivos e finitos');
  }
  function emaSeries(values,n){
    validate(values,n);const out=new Array(values.length).fill(null);
    if(values.length<n)return out;
    // Incremental arithmetic mean avoids overflowing the initial sum.
    let value=values[0];for(let i=1;i<n;i++)value+=(values[i]-value)/(i+1);out[n-1]=value;
    const alpha=2/(n+1);
    for(let i=n;i<values.length;i++){value+=alpha*(values[i]-value);out[i]=value}
    return out;
  }
  function rsiSeries(values,n=14){
    validate(values,n);const out=new Array(values.length).fill(null);
    if(values.length<=n)return out;
    let gain=0,loss=0;
    for(let i=1;i<=n;i++){const delta=values[i]-values[i-1];gain+=Math.max(delta,0)/n;loss+=Math.max(-delta,0)/n}
    const reading=()=>loss===0?(gain===0?50:100):gain===0?0:100*(gain/(gain+loss));
    out[n]=reading();
    for(let i=n+1;i<values.length;i++){
      const delta=values[i]-values[i-1];
      gain=gain*((n-1)/n)+Math.max(delta,0)/n;
      loss=loss*((n-1)/n)+Math.max(-delta,0)/n;
      out[i]=reading();
    }
    return out;
  }
  const ema=(values,n)=>emaSeries(values,n).at(-1)??null;
  const rsi=(values,n=14)=>rsiSeries(values,n).at(-1)??null;
  function indicatorSeries(items){const values=items.map(x=>x.close);return {ema9:emaSeries(values,9),ema21:emaSeries(values,21),rsi14:rsiSeries(values,14)}}
  function classify(a,b,r,{tieDirection=0}={}){
    if(![-1,0].includes(tieDirection))throw Error('Regra de empate inválida');
    if([a,b,r].some(x=>x===null))return {direction:0,aligned:false};
    if(![a,b,r].every(Number.isFinite)||a<=0||b<=0||r<0||r>100)throw Error('Indicador inválido');
    const direction=a>b?1:a<b?-1:tieDirection;
    return {direction,aligned:(direction===1&&r>=50&&r<70)||(direction===-1&&r<=50&&r>30)};
  }
  // Explicit timestamp convention; all computations receive only closed, ordered minutes.
  function closedMinuteCandles(items,{now=Date.now(),timeKind='open-seconds',marginMs=5000}={}){
    if(!Array.isArray(items)||!Number.isFinite(now)||!Number.isFinite(marginMs)||marginMs<0||!['open-seconds','close-ms'].includes(timeKind))throw Error('Janela de candles inválida');
    const endTime=item=>timeKind==='open-seconds'?item.time*1000+60000:item.time;
    const byTime=new Map();
    for(const item of items){
      if(!item||!Number.isSafeInteger(endTime(item))||endTime(item)%60000!==0||endTime(item)<=0)throw Error('Timestamp de candle inválido');
      if(endTime(item)>now-marginMs)continue;
      validate([item.close],1);
      if(byTime.has(endTime(item))){if(byTime.get(endTime(item)).close!==item.close)throw Error('Candles duplicados divergentes');continue}
      byTime.set(endTime(item),item);
    }
    const rows=[...byTime.values()].sort((a,b)=>endTime(a)-endTime(b));
    for(let i=1;i<rows.length;i++)if(endTime(rows[i])-endTime(rows[i-1])!==60000)throw Error('Histórico com minutos ausentes');
    return rows;
  }
  function analyzeCandles(items,options={}){
    const rows=closedMinuteCandles(items,options),values=rows.map(x=>x.close);
    const a=ema(values,9),b=ema(values,21),strength=rsi(values);
    return {rows,ema9:a,ema21:b,rsi14:strength,...classify(a,b,strength,options),methodology_version:methodologyVersion};
  }
  root.RadarIndicators=Object.freeze({methodologyVersion,ema,rsi,emaSeries,rsiSeries,indicatorSeries,classify,closedMinuteCandles,analyzeCandles});
})(globalThis);
