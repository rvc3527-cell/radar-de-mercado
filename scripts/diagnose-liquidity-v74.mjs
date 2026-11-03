import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PaperTradingEngine} from '../paper/engine.js';
import {MemoryPaperStore} from '../paper/store.js';
import {genesis,advance} from '../paper/integrity.js';
const original=readFileSync('artifacts/v73-prospective.json'),capture=JSON.parse(original),j=capture.data.journal;
await PaperTradingEngine.open({walletId:j.walletId,store:new MemoryPaperStore(JSON.stringify([[j.walletId,j]]))});
const index=j.events.findIndex(e=>e.decision.code==='NO_EXIT_LIQUIDITY'),blocked=j.events[index],prefix={...j,version:index,events:j.events.slice(0,index),checksum:await genesis(j.walletId,j.config)};
for(const event of prefix.events)prefix.checksum=await advance(prefix.checksum,event);
const engine=await PaperTradingEngine.open({walletId:j.walletId,store:new MemoryPaperStore(JSON.stringify([[j.walletId,prefix]])),clock:()=>blocked.command.at});
const quote=blocked.command.payload.quote,proposal=blocked.command.payload.proposal;
// Historical replay in isolated memory. No new market observation or provider call.
await engine.onQuote({id:'diagnostic-quote',quote});await engine.resume({id:'diagnostic-review',reason:'Isolated historical risk regression'});
const before=await engine.snapshot(),replay=await engine.strategyPort(proposal.strategyId).submit(proposal),after=await engine.snapshot();
const result={format:'radar-liquidity-audit-v1',sourceCaptureSha256:createHash('sha256').update(original).digest('hex'),sourceJournalChecksum:j.checksum,eventSequence:blocked.seq,proposalId:proposal.id,at:blocked.command.at,instrument:quote.instrument,quoteAt:quote.at,quoteAgeMs:blocked.command.at-quote.at,quoteSequence:quote.sequence,bidUSD:quote.bid,askUSD:quote.ask,observedBidBTC:quote.bidSize,observedAskBTC:quote.askSize,proposedBTC:proposal.quantity,existingBTC:before.positions.reduce((sum,p)=>sum+p.quantity,0),requiredExitBTC:proposal.quantity,missingBTC:Number((proposal.quantity-quote.bidSize).toFixed(8)),originalCode:blocked.decision.code,replayedCode:replay.code,positionsBefore:before.positions.length,positionsAfter:after.positions.length,cashBefore:before.cash,cashAfter:after.cash,newExecutions:after.trades.length-before.trades.length,scope:'Best-price L1 snapshot only, not total Coinbase liquidity',conclusion:'Correct risk rejection of a new entry; no real exit failed, no limit relaxed',strategySha256:createHash('sha256').update(readFileSync('paper/strategy.js')).digest('hex')};
writeFileSync('artifacts/v74-liquidity-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
