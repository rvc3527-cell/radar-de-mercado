/* Descriptive summaries are always isolated by methodology, asset and horizon. */
(function(root){
  'use strict';
  const versionOf=row=>typeof row.methodology_version==='string'&&row.methodology_version.length?row.methodology_version:'legacy-unversioned';
  const labelOf=version=>version==='legacy-unversioned'?'Anterior — versão não comprovada':version;
  function summarize(records,{symbol,horizon,methodology,cost=0.2}={}){
    if(!Number.isFinite(cost)||cost<0)throw Error('Custo inválido');
    const all=records.filter(x=>x.symbol===symbol&&x.horizon===horizon&&versionOf(x)===methodology&&Number.isFinite(x.directional_pct)&&Number.isSafeInteger(x.time)).sort((a,b)=>a.time-b.time);
    const rows=[];let lastEnd=-Infinity;
    for(const item of all){if(item.time>=lastEnd){rows.push(item);lastEnd=item.time+horizon*60000}}
    const values=rows.map(x=>x.directional_pct-cost).sort((a,b)=>a-b),n=values.length;
    return {n,total:all.length,positive:values.filter(x=>x>0).length,mean:n?values.reduce((a,b)=>a+b,0)/n:null,median:n?(values[Math.floor(n/2)]+values[Math.floor((n-1)/2)])/2:null,insufficient:n<30};
  }
  root.RadarStatistics=Object.freeze({versionOf,labelOf,summarize});
})(globalThis);
