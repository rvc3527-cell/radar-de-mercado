// SYNTHETIC ONLY: generated prices/books for robustness, not market performance.
export const T=Date.UTC(2026,10,4,12);
export function syntheticDataset({books=true,mode='up'}={}){
 const rows=Array.from({length:120},(_,i)=>{const close=mode==='flat'?100:mode==='down'?102-i*.01:100+i*.01;return {time:T/1000+i*60,availableAt:T+i*60000+65000,open:close-.001,high:close+.01,low:close-.01,close}});
 const times=Array.from({length:40},(_,i)=>T+(i+61)*60000+5000),instrument={provider:'coinbase-exchange',market:'spot',base:'BTC',quote:'USD',symbol:'BTC-USD'};
 return {format:'radar-offline-bars-v76',origin:'synthetic',instrument,windows:{development:[T,T+30*60000],selection:[T+40*60000,T+120*60000],final:[T+180*60000,T+300*60000]},rows,times,books:books?times.map((at,i)=>{const close=rows[i+60].close;return {availableAt:at-100,book:{time:new Date(at-500).toISOString(),sequence:i+1,auction_mode:false,auction:null,bids:[[(close+.0001).toFixed(6),'100',1]],asks:[[(close+.0002).toFixed(6),'100',1]]}}}):[]};
}
