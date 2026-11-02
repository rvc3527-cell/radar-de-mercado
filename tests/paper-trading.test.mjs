import test from 'node:test';
import assert from 'node:assert/strict';
import {PaperTradingEngine as Engine} from '../paper/engine.js';
import {MemoryPaperStore} from '../paper/store.js';
import {cash,qty,mul} from '../paper/money.js';
const T=Date.UTC(2026,10,2,12),DAY=86400000;
const BTC={provider:'binance',market:'spot',base:'BTC',quote:'USDT',symbol:'BTCUSDT'};
const ETH={provider:'binance',market:'spot',base:'ETH',quote:'USDT',symbol:'ETHUSDT'};
const baseConfig={feeBps:0,slippageBps:0};
const book=(patch={})=>({instrument:{...BTC},at:T,sequence:1,bid:100,ask:100,bidSize:100,askSize:100,available:true,...patch});
const open=(id='p1',patch={})=>({id,strategyId:'rule-1',action:'open',instrument:{...BTC},quantity:1,stopPrice:95,policy:'paper-test',...patch});
const close=(id='c1',positionId='p1',patch={})=>({id,strategyId:'rule-1',action:'close',instrument:{...BTC},positionId,...patch});
async function setup(config={},store=new MemoryPaperStore()) {
 const clock={now:T};const engine=await Engine.open({walletId:'wallet',store,clock:()=>clock.now,config:{...baseConfig,...config}});
 assert.equal((await engine.resume({id:'initial-review',reason:'Reviewed test wallet'})).approved,true);
 return {engine,store,clock};
}
const reason=code=>e=>e.code===code;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('valid trade uses explicit book and time; accounting identity is exact in micros',async()=>{
 const {engine}=await setup();const d=await engine.submit(open(),book());assert.equal(d.code,'OPENED');const s=await engine.snapshot();assert.equal(s.cash,9900);assert.equal(s.equity,10000);assert.equal(s.positions.length,1);assert.equal(s.positions[0].entryCost,100);assert.equal(s.trades[0].quoteAt,T);assert.equal(s.trades[0].at,T);assert.equal(s.trades[0].quoteSequence,1);assert.equal(s.trades[0].instrument.quote,'USDT');assert.equal(s.equity,s.initialBalance+s.realized+s.unrealized);
});
test('new engine requires operator review; strategy port cannot resume or access storage',async()=>{
 const store=new MemoryPaperStore(),engine=await Engine.open({walletId:'wallet',store,clock:()=>T,config:{}});const port=engine.strategyPort('fixed-rule');assert.deepEqual(Object.keys(port),['submit']);await engine.onQuote({id:'feed',quote:book()});assert.equal((await port.submit(open())).code,'SESSION_REVIEW_REQUIRED');assert.equal((await engine.snapshot()).positions.length,0);
});
test('risk per trade includes the stop and rejects oversize loss',async()=>{
 const {engine}=await setup();const d=await engine.submit(open('bad',{quantity:21}),book());assert.equal(d.code,'TRADE_RISK');assert.equal((await engine.snapshot()).trades.length,0);assert.equal((await engine.exportJournal()).events.at(-1).decision.approved,false);
});
test('asset exposure aggregates separate lots, including the same base',async()=>{
 const {engine}=await setup({maxAssetExposureBps:150});assert.equal((await engine.submit(open(),book())).approved,true);assert.equal((await engine.submit(open('p2'),book())).code,'ASSET_EXPOSURE');
});
test('maximum simultaneous positions is enforced',async()=>{
 const {engine}=await setup({maxPositions:1});await engine.submit(open(),book());assert.equal((await engine.submit(open('p2',{instrument:ETH}),book({instrument:ETH}))).code,'MAX_POSITIONS');
});
test('insufficient cash and spread block orders',async()=>{
 const {engine}=await setup();assert.equal((await engine.submit(open('large',{quantity:101,stopPrice:99.9}),book({askSize:1000,bidSize:1000}))).code,'INSUFFICIENT_BALANCE');assert.equal((await engine.submit(open('spread'),book({sequence:2,bid:95,ask:100}))).code,'SPREAD');
});
test('stale and future market data never fill positions',async()=>{
 for(const patch of [{at:T-30001},{at:T+1}]){const {engine}=await setup();const d=await engine.submit(open(),book(patch));assert.equal(d.approved,false);assert.equal((await engine.snapshot()).trades.length,0);assert.ok((await engine.snapshot()).halted?.startsWith('FEED_'))}
});
test('stale existing portfolio marks block a new instrument',async()=>{
 const {engine,clock}=await setup();await engine.submit(open(),book());clock.now+=30001;const d=await engine.submit(open('eth',{instrument:ETH}),book({instrument:ETH,at:clock.now}));assert.equal(d.code,'PORTFOLIO_STALE');assert.equal((await engine.snapshot()).valuationFresh,false);
});
test('same order ID is idempotent despite a changed quote; conflicting payload is audited',async()=>{
 const {engine}=await setup();await engine.submit(open(),book());const second=await engine.submit(open(),book({sequence:2,bid:105,ask:105}));assert.equal(second.duplicate,true);assert.equal((await engine.snapshot()).positions.length,1);const conflict=await engine.submit(open('p1',{quantity:2}),book());assert.equal(conflict.code,'DUPLICATE_ID_CONFLICT');assert.equal((await engine.snapshot()).trades.length,1);assert.equal((await engine.exportJournal()).events.at(-1).decision.code,'DUPLICATE_ID_CONFLICT');
});
test('concurrent duplicate requests commit one fill and position',async()=>{
 const {engine}=await setup();const result=await Promise.all(Array.from({length:8},()=>engine.submit(open(),book())));assert.ok(result.every(x=>x.approved));assert.equal((await engine.snapshot()).positions.length,1);assert.equal((await engine.snapshot()).trades.length,1);
});
test('two engine instances cannot bypass exposure using concurrent writes',async()=>{
 const {engine,store}=await setup({maxPositions:1});const other=await Engine.open({walletId:'wallet',store,clock:()=>T});await other.onQuote({id:'second-feed',quote:book()});await other.resume({id:'second-review',reason:'Second owner review'});
 const ds=await Promise.all([engine.submit(open('one'),book()),other.submit(open('two'),book())]);assert.equal(ds.filter(d=>d.approved).length,1);assert.equal((await engine.snapshot()).positions.length,1);
});
test('shared snapshot liquidity cannot be reused by different IDs',async()=>{
 const {engine}=await setup();const q=book({askSize:1});await engine.submit(open(),q);assert.equal((await engine.submit(open('p2'),q)).code,'NO_LIQUIDITY');
});
test('provider sequence and book conflict do not replenish used liquidity',async()=>{
 const {engine}=await setup();await engine.submit(open(),book({sequence:3,askSize:1}));const d=await engine.submit(open('p2'),book({sequence:3,askSize:10}));assert.equal(d.code,'QUOTE_CONFLICT');assert.equal((await engine.snapshot()).positions.length,1);
 const fresh=await setup();await fresh.engine.onQuote({id:'new',quote:book({sequence:3})});assert.equal((await fresh.engine.onQuote({id:'old',quote:book({sequence:2})})).code,'QUOTE_REORDERED');
});
test('no liquidity, crossed book and invalid numeric values are rejected',async()=>{
 for(const patch of [{askSize:0},{bid:0},{bid:101,ask:100},{ask:NaN},{bidSize:-1},{ask:Infinity},{askSize:1e-9}]){const {engine}=await setup();assert.equal((await engine.submit(open(),book(patch))).approved,false);assert.equal((await engine.snapshot()).trades.length,0)}
});
test('network interruption latches a circuit; fresh data alone does not rearm it',async()=>{
 const {engine}=await setup();await engine.reportFailure({id:'offline',code:'NETWORK'});assert.equal((await engine.submit(open(),book())).code,'CRITICAL_HALT');await engine.onQuote({id:'recovery',quote:book({sequence:2})});assert.equal((await engine.submit(open('p2'),book({sequence:2}))).code,'CRITICAL_HALT');assert.equal((await engine.resume({id:'recovered',reason:'Provider checked by operator'})).approved,true);assert.equal((await engine.submit(open('p3'),book({sequence:2}))).approved,true);
});
test('unavailable provider does not fabricate fills from supplied prices',async()=>{
 const {engine}=await setup();assert.equal((await engine.submit(open(),book({available:false}))).code,'PROVIDER_UNAVAILABLE');assert.equal((await engine.snapshot()).cash,10000);assert.equal((await engine.snapshot()).positions.length,0);
});
test('daily loss caused by a gap blocks entries and cannot be reset during same UTC day',async()=>{
 const {engine}=await setup();await engine.submit(open('gap',{quantity:10}),book());const d=await engine.onQuote({id:'crash',quote:book({sequence:2,bid:60,ask:60})});assert.equal(d.exits[0].approved,true);const s=await engine.snapshot();assert.equal(s.realized,-400);assert.equal(s.cash,9600);assert.equal(s.day.locked,true);assert.equal(s.halted,'STOP_GAP_OR_LOSS_LIMIT');assert.equal((await engine.submit(open('next',{stopPrice:55}),book({sequence:2,bid:60,ask:60}))).code,'DAILY_LOSS');assert.equal((await engine.resume({id:'bad-resume',reason:'Cannot override daily loss'})).code,'DAILY_LOSS');
});
test('daily risk reservations account for all open positions',async()=>{
 const {engine}=await setup({maxPositions:10,maxRiskBps:1000});await engine.submit(open('reserve',{quantity:10,stopPrice:80}),book());const d=await engine.submit(open('reserve2',{quantity:10,stopPrice:80}),book());assert.equal(d.code,'DAILY_RISK_RESERVED');
});
test('daily rollover preserves capital and critical halt; operator must review recovery',async()=>{
 const {engine,clock}=await setup();await engine.submit(open('gap',{quantity:10}),book());await engine.onQuote({id:'crash',quote:book({sequence:2,bid:60,ask:60})});clock.now+=DAY;await engine.onQuote({id:'new-day',quote:book({at:clock.now,sequence:3,bid:60,ask:60})});let s=await engine.snapshot();assert.equal(s.day.startEquity,9600);assert.equal(s.day.locked,false);assert.equal(s.halted,'STOP_GAP_OR_LOSS_LIMIT');await engine.resume({id:'new-review',reason:'Gap reviewed, new day'});assert.equal((await engine.submit(open('new-position',{stopPrice:55}),book({at:clock.now,sequence:3,bid:60,ask:60}))).approved,true);
});
test('stop executes at actual bid, not a fictitious stop price, and is not repeated',async()=>{
 const {engine}=await setup();await engine.submit(open(),book());const q=book({sequence:2,bid:95,ask:95});const d=await engine.onQuote({id:'stop1',quote:q});assert.equal(d.fills.length,1);assert.equal((await engine.snapshot()).realized,-5);await engine.onQuote({id:'stop2',quote:q});assert.equal((await engine.snapshot()).trades.length,2);assert.equal((await engine.snapshot()).positions.length,0);
});
test('stop with no available bid leaves position open, records rejection and halts',async()=>{
 const {engine}=await setup();await engine.submit(open(),book());const d=await engine.onQuote({id:'dry',quote:book({sequence:2,bid:94,ask:95,bidSize:0})});assert.equal(d.exits[0].code,'NO_LIQUIDITY');const s=await engine.snapshot();assert.equal(s.positions.length,1);assert.equal(s.liquidationExecutable,false);assert.equal(s.halted,'STOP_UNFILLED');assert.equal(s.trades.length,1);
});
test('same book bid liquidity is shared across multiple protective exits',async()=>{
 const {engine}=await setup();await engine.submit(open('a'),book());await engine.submit(open('b'),book());const d=await engine.onQuote({id:'thin',quote:book({sequence:2,bid:95,ask:95,bidSize:1})});assert.equal(d.exits.filter(x=>x.approved).length,1);assert.equal(d.exits.filter(x=>!x.approved).length,1);assert.equal((await engine.snapshot()).positions.length,1);
});
test('fees, slippage, realized and unrealized PnL have independent numeric references',async()=>{
 const {engine}=await setup({feeBps:100,slippageBps:100,maxRiskBps:1000,dailyLossBps:5000});await engine.submit(open('cost',{stopPrice:90}),book());let s=await engine.snapshot();near(s.cash,9897.99);near(s.positions[0].entryPrice,101);near(s.unrealized,-4);near(s.equity,9996);
 await engine.submit(close('exit','cost'),book({sequence:2,bid:110,ask:110}));s=await engine.snapshot();near(s.realized,5.801);near(s.cash,10005.801);near(s.fees,2.099);near(s.slippage,2.1);assert.equal(s.unrealized,0);assert.equal(s.equity,s.cash);
});
test('position ownership and full-close contract cannot silently close another strategy or quantity',async()=>{
 const {engine}=await setup();await engine.submit(open(),book());assert.equal((await engine.submit(close('other','p1',{strategyId:'other'}),book())).code,'STRATEGY_POSITION_MISMATCH');assert.equal((await engine.submit(close('partial','p1',{quantity:.5}),book())).code,'UNSUPPORTED_PARTIAL_CLOSE');assert.equal((await engine.snapshot()).positions.length,1);
});
test('restart replays exact wallet, costs, open positions and history without executing again',async()=>{
 const {engine,store}=await setup({feeBps:10,slippageBps:5});await engine.submit(open(),book());const before=await engine.snapshot(),serialized=store.exportJSON();const restoredStore=new MemoryPaperStore(serialized),restarted=await Engine.open({walletId:'wallet',store:restoredStore,clock:()=>T});const after=await restarted.snapshot();for(const field of ['cash','equity','realized','unrealized','fees','slippage','positions','trades'])assert.deepEqual(after[field],before[field]);assert.equal(after.sessionReviewed,false);
 assert.equal((await restarted.submit(open('no-review'),book())).code,'SESSION_REVIEW_REQUIRED');assert.equal((await restarted.submit(open(),book())).duplicate,true);assert.equal((await restarted.snapshot()).trades.length,1);
});
test('changing stored decisions, journal version or config shape fails closed on restore',async()=>{
 const {engine,store}=await setup();await engine.submit(open(),book());const source=store.exportJSON();
 for(const mutate of [d=>d[0][1].events.at(-1).decision.code='FAKE',d=>d[0][1].version++,d=>delete d[0][1].config,d=>d[0][1].cash=99999,d=>d[0][1].events[0].command.payload.apiKey='must not load']){const doc=JSON.parse(source);mutate(doc);await assert.rejects(Engine.open({walletId:'wallet',store:new MemoryPaperStore(JSON.stringify(doc)),clock:()=>T}),reason('CORRUPT_JOURNAL'))}
});
test('configuration cannot change silently after restart',async()=>{
 const {store}=await setup();await assert.rejects(Engine.open({walletId:'wallet',store,config:{initialBalance:99999}}),reason('CONFIG_MISMATCH'));
});
test('write failure produces no approval, latches runtime and requires restart/review',async()=>{
 class FailingStore extends MemoryPaperStore {fail=false;async compareAndSwap(...args){if(this.fail)throw Error('offline');return super.compareAndSwap(...args)}}
 const store=new FailingStore(),{engine}=await setup({},store);store.fail=true;await assert.rejects(engine.submit(open(),book()),reason('PERSISTENCE_UNCONFIRMED'));store.fail=false;await assert.rejects(engine.submit(open('p2'),book()),reason('PERSISTENCE_UNCONFIRMED'));assert.equal((await engine.snapshot()).positions.length,0);
 const restarted=await Engine.open({walletId:'wallet',store,clock:()=>T});assert.equal((await restarted.submit(open('p3'),book())).code,'SESSION_REVIEW_REQUIRED');
});
test('lost commit acknowledgement resolves by ID and never fills a duplicate after restart',async()=>{
 class LostAck extends MemoryPaperStore {lose=false;async compareAndSwap(...args){const result=await super.compareAndSwap(...args);if(this.lose){this.lose=false;throw Error('ack lost')}return result}}
 const store=new LostAck(),{engine}=await setup({},store);store.lose=true;await assert.rejects(engine.submit(open(),book()),reason('PERSISTENCE_UNCONFIRMED'));const restarted=await Engine.open({walletId:'wallet',store,clock:()=>T});assert.equal((await restarted.lookup('p1')).approved,true);assert.equal((await restarted.submit(open(),book())).duplicate,true);assert.equal((await restarted.snapshot()).positions.length,1);
});
test('USD/USDT and sources are separate; no implicit pair conversion',async()=>{
 const {engine}=await setup();const coin={provider:'coinbase-exchange',market:'spot',base:'BTC',quote:'USD',symbol:'BTC-USD'};assert.equal((await engine.submit(open('usd',{instrument:coin}),book({instrument:coin}))).code,'INSTRUMENT_MISMATCH');
 const usd=await setup({currency:'USD'});assert.equal((await usd.engine.submit(open('usd',{instrument:coin}),book({instrument:coin}))).approved,true);assert.equal((await usd.engine.snapshot()).currency,'USD');
});
test('credential/client fields are rejected and never stored; engine does not perform fetch',async()=>{
 const {engine}=await setup();const fetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('network forbidden')};try{
 const d=await engine.submit({...open(),apiKey:'SECRET-VALUE',brokerClient:'UNSAFE'},book());assert.equal(d.code,'UNSUPPORTED_FIELDS');assert.doesNotMatch(JSON.stringify(await engine.exportJournal()),/SECRET-VALUE|UNSAFE/);assert.equal((await engine.snapshot()).trades.length,0);
 }finally{globalThis.fetch=fetch}
 await assert.rejects(Engine.open({walletId:'w',store:new MemoryPaperStore(),apiKey:'forbidden'}),reason('UNSUPPORTED_ENGINE_FIELDS'));
});
test('regressive and invalid clocks cannot create an execution',async()=>{
 const {engine,clock}=await setup();await assert.rejects(engine.submit(open(),book(),{now:NaN}),reason('INVALID_TIME'));clock.now--;await assert.rejects(engine.submit(open(),book()),reason('CLOCK_REGRESSION'));clock.now=T;await assert.rejects(engine.submit(open('later'),book()),reason('CLOCK_REGRESSION'));
});
test('fixed-point conversions reject excess precision and preserve small amounts',()=>{
 assert.equal(cash(0.1),100000);assert.equal(qty(1e-8),1);assert.equal(cash(77760.123456),77760123456);assert.throws(()=>cash(1e-7),reason('PRECISION'));assert.throws(()=>qty(Infinity),reason('INVALID_NUMBER'));assert.equal(mul(1,1,3,{up:true}),1);
});

test('restore of a missing wallet never silently recreates initial capital',async()=>{
 await assert.rejects(Engine.open({walletId:'missing',store:new MemoryPaperStore()}),reason('WALLET_NOT_FOUND'));
});
test('reserved IDs and inherited position names cannot corrupt accounting',async()=>{
 const {engine}=await setup();for(const id of ['__proto__','constructor','prototype'])await assert.rejects(engine.submit(open(id),book()),reason('COMMAND_ID'));assert.equal((await engine.submit(close('bad','toString'),book())).code,'POSITION_NOT_FOUND');assert.equal((await engine.snapshot()).cash,10000);
});
test('entry requires enough bid liquidity for all same-instrument positions',async()=>{
 const {engine}=await setup();const q=book({bidSize:1});assert.equal((await engine.submit(open(),q)).approved,true);assert.equal((await engine.submit(open('p2'),q)).code,'NO_EXIT_LIQUIDITY');
});
test('explicit null time is not silently converted to the current clock',async()=>{
 const {engine}=await setup();await assert.rejects(engine.submit(open(),book(),{now:null}),reason('INVALID_TIME'));assert.equal((await engine.snapshot()).positions.length,0);
});
test('randomized deterministic round trips preserve the accounting identity',async()=>{
 const {engine}=await setup({feeBps:10,slippageBps:5});let seed=71,sequence=1;
 for(let i=0;i<30;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const price=100+(seed%100)/100;const q=book({sequence:sequence++,bid:price,ask:price});assert.equal((await engine.submit(open('r'+i,{stopPrice:95}),q)).approved,true);const exitPrice=Math.round((price+.1)*100)/100,exit=book({sequence:sequence++,bid:exitPrice,ask:exitPrice});assert.equal((await engine.submit(close('c'+i,'r'+i),exit)).approved,true);const s=await engine.snapshot();near(s.equity,s.initialBalance+s.realized+s.unrealized);near(s.cash,s.equity);assert.equal(s.positions.length,0)}
});

test('strategy capability cannot supply a price, clock or operator commands',async()=>{
 const {engine}=await setup();await engine.onQuote({id:'trusted-feed',quote:book()});const port=engine.strategyPort('fixed');await assert.rejects(port.submit(open(),book({bid:1,ask:1})),reason('STRATEGY_INPUT'));const result=await port.submit(open());assert.equal(result.approved,true);const s=await engine.snapshot();assert.equal(s.positions[0].entryPrice,100);assert.equal(s.positions[0].strategyId,'fixed');assert.equal(port.resume,undefined);
});
test('strategy proposal without trusted quote is audited and never filled',async()=>{
 const {engine}=await setup();const d=await engine.strategyPort('fixed').submit(open());assert.equal(d.code,'QUOTE_REQUIRED');assert.equal((await engine.snapshot()).trades.length,0);assert.equal((await engine.exportJournal()).events.at(-1).decision.approved,false);
});
test('numeric command/config corruption cannot silently change capital or inventory',async()=>{
 const {engine,store}=await setup();await engine.submit(open(),book());const source=store.exportJSON();
 for(const mutate of [d=>d[0][1].config.initialBalance+=1000,d=>d[0][1].events.at(-1).command.payload.proposal.quantity=2,d=>d[0][1].checksum='0'.repeat(64)]){const data=JSON.parse(source);mutate(data);await assert.rejects(Engine.open({walletId:'wallet',store:new MemoryPaperStore(JSON.stringify(data))}),reason('CORRUPT_JOURNAL'))}
});
test('even an empty wallet protects its genesis against accidental capital changes',async()=>{
 const store=new MemoryPaperStore();await Engine.open({walletId:'wallet',store,config:{initialBalance:1000}});const d=JSON.parse(store.exportJSON());d[0][1].config.initialBalance=9999;await assert.rejects(Engine.open({walletId:'wallet',store:new MemoryPaperStore(JSON.stringify(d))}),reason('CORRUPT_JOURNAL'));
});

test('connection failure invalidates cached execution prices for strategy exits too',async()=>{
 const {engine}=await setup();await engine.submit(open(),book());await engine.reportFailure({id:'offline-exit',code:'NETWORK'});const d=await engine.strategyPort('rule-1').submit(close('must-not-fill'));assert.equal(d.approved,false);assert.equal(d.code,'PROVIDER_UNAVAILABLE');const s=await engine.snapshot();assert.equal(s.positions.length,1);assert.equal(s.trades.length,1);assert.equal(s.valuationFresh,false);assert.equal(s.liquidationExecutable,false);
});
test('restart does not authorize a strategy to execute using restored quote cache',async()=>{
 const {engine,store}=await setup();await engine.submit(open(),book());const other=await Engine.open({walletId:'wallet',store,clock:()=>T});const before=await other.snapshot();assert.equal(before.valuationFresh,false);assert.equal((await other.resume({id:'no-feed-review',reason:'Need new feed first'})).code,'SESSION_QUOTES_REQUIRED');const d=await other.strategyPort('rule-1').submit(close('stale-cache'));assert.equal(d.approved,false);assert.equal((await other.snapshot()).positions.length,1);
 await other.onQuote({id:'fresh-after-restart',quote:book()});assert.equal((await other.resume({id:'review-with-feed',reason:'Feed confirmed by operator'})).approved,true);assert.equal((await other.strategyPort('rule-1').submit(close('verified-exit'))).approved,true);
});
