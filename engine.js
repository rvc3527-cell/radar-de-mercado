/* Motor de simulação compartilhado: navegador e testes Node.js. */
(function(root){
  function simulate(candles, signals, {horizon=1, mode='spot', payout=80, fee=0.1, slippage=0.02, start=0}={}){
    if(!Number.isInteger(horizon)||horizon<1)throw Error('Horizonte inválido');
    if(!['spot','binary'].includes(mode))throw Error('Modo inválido');
    if(mode==='binary'&&!(payout>0&&payout<=100))throw Error('Payout inválido');
    if(mode==='spot'&&(!Number.isFinite(fee)||fee<0||!Number.isFinite(slippage)||slippage<0))throw Error('Custos inválidos');
    const trades=[];
    for(let i=start;i+horizon<=candles.length;){
      const dir=signals[i];
      if(dir!==1&&dir!==-1){i++;continue}
      if(mode==='spot'&&dir===-1){i++;continue}
      const entry=candles[i].open,exit=candles[i+horizon-1].close;
      if(!(entry>0&&exit>0))throw Error('Preço inválido');
      const gain=(exit-entry)/entry*dir,win=gain>0;
      const result=mode==='binary'?(win?payout/100:-1):(exit-entry)/entry*100-2*(fee+slippage);
      trades.push({index:i,dir,entry,exit,win,result,exitIndex:i+horizon-1});
      i+=horizon;
    }
    return trades;
  }
  root.RadarEngine=Object.freeze({simulate});
})(globalThis);
