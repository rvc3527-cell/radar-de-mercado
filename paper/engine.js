import {PaperError,invariant,checked,cash,publicCash,publicQty,sell} from './money.js';
import {genesis,advance} from './integrity.js';
import {DEFAULTS,configuration,keyOf,normalizedQuote,valuation,daily,opening,validInstrument} from './risk.js';
const SCHEMA='radar-paper-v1',MAX_EVENTS=10000;
const noteText=x=>typeof x==='string'&&x.length<=16384&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)?x:null;
const clone=x=>JSON.parse(JSON.stringify(x));
const idOK=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
const scalar=x=>typeof x==='number'&&Number.isFinite(x)||typeof x==='boolean'||(typeof x==='string'&&x.length<=160&&!/[\u0000-\u001f\u007f]/.test(x))?x:null;
const keysMatch=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k));
function clean(source,keys,issues) {
  if(!keysMatch(source,keys))issues.bad=true;
  return Object.fromEntries(keys.map(k=>[k,scalar(source?.[k])]));
}
function cleanInstrument(x,issues) {return clean(x,['provider','market','base','quote','symbol'],issues)}
function cleanQuote(x,issues) {
  if(x===null||x===undefined)return null;
  const q=clean(x,['instrument','at','sequence','bid','ask','bidSize','askSize','available'],issues);
  q.instrument=cleanInstrument(x?.instrument,issues);return q;
}
function proposalPayload(p,q) {
  const issues={bad:false};const proposal=clean(p,['id','strategyId','action','instrument','quantity','stopPrice','positionId','policy'],issues);
  proposal.instrument=cleanInstrument(p?.instrument,issues);
  return {payload:{proposal,quote:cleanQuote(q,issues)},issues:issues.bad};
}
function initial(config) {return {cash:cash(config.initialBalance),positions:{},quotes:{},trades:[],realized:0,totalFees:0,totalSlippage:0,day:null,halted:null,lastAt:0,operatorReviewed:false,processed:{}}}
function reject(c,code) {return {id:c.id,type:c.type,at:c.at,approved:false,code,fills:[]}}
function requestKey(c) {return c.type+':'+c.id}
function fingerprint(c) {return JSON.stringify(c.type==='proposal'?{proposal:c.payload.proposal,issues:c.issues}:{payload:c.payload,issues:c.issues})}
function quoteBody(q) {const {bidLeft,askLeft,ready,...body}=q;return JSON.stringify(body)}
function applyQuote(s,input,c,now) {
  const q=normalizedQuote(input,c,now),key=keyOf(q.instrument),old=s.quotes[key];
  if(old) {
    invariant(q.at>=old.at&&q.sequence>=old.sequence,'QUOTE_REORDERED');
    if(q.sequence===old.sequence){invariant(quoteBody(q)===quoteBody(old),'QUOTE_CONFLICT');old.ready=true;return old}
  }
  // Check arithmetic on all affected lots before replacing a valid mark.
  for(const p of Object.values(s.positions))if(keyOf(p.instrument)===key)sell(p.quantity,q.bid,c);
  valuation({...s,quotes:{...s.quotes,[key]:q}},c,now);s.quotes[key]=q;return q;
}
function invalidateQuotes(s,input,config){const keys=validInstrument(input?.instrument,config.currency)?[keyOf(input.instrument)]:Object.keys(s.quotes);for(const key of keys)if(s.quotes[key])s.quotes[key].ready=false;}
function closePosition(s,p,q,c,at,fillId,reason,strategyId) {
  invariant(p.quantity<=q.bidLeft,'NO_LIQUIDITY');const value=sell(p.quantity,q.bid,c);
  const nextCash=checked(s.cash+value.net),pnl=checked(value.net-p.entryCost);
  const totals={cash:nextCash,realized:checked(s.realized+pnl),totalFees:checked(s.totalFees+value.fees),totalSlippage:checked(s.totalSlippage+value.slippage)};Object.assign(s,totals);
  q.bidLeft-=p.quantity;delete s.positions[p.id];
  s.trades.push({id:fillId,positionId:p.id,side:'sell',instrument:{...p.instrument},quantity:p.quantity,...value,at,quoteAt:q.at,quoteSequence:q.sequence,strategyId,reason,pnl});
  if(pnl < -p.risk)s.halted='STOP_GAP_OR_LOSS_LIMIT';
  return fillId;
}
function reduce(previous,c,config) {
  // The reducer never mutates the idempotency map. Replay owns that map and
  // appends only after auditing; copying it at every event made replay quadratic.
  const {processed,...wallet}=previous;let s={...clone(wallet),processed};const answer={id:c.id,type:c.type,at:c.at,approved:true,code:'OK',fills:[],marketAccepted:false};
  try {
    daily(s,config,c.at);
    if(c.issues) {if(c.type==='quote')s.halted='INVALID_FEED';throw new PaperError('UNSUPPORTED_FIELDS')}
    if(c.type==='failure') {
      invariant(['NETWORK','PROVIDER','DATA','STORAGE'].includes(c.payload.code),'FAILURE_CODE');s.halted=c.payload.code;s.operatorReviewed=false;invalidateQuotes(s,null,config);answer.code='HALTED';
    } else if(c.type==='note') {
      invariant(['SESSION_CHECK','SESSION_START','SESSION_END','SESSION_PAUSE','STRATEGY_DECISION'].includes(c.payload.kind)&&noteText(c.payload.details)!==null,'INVALID_NOTE');answer.code='NOTED';
    } else if(c.type==='resume') {
      invariant(typeof c.payload.reason==='string'&&c.payload.reason.trim().length>=3&&c.payload.reason.length<=160,'REVIEW_REASON');
      invariant(c.reviewed,'SESSION_QUOTES_REQUIRED');const v=valuation(s,config,c.at);invariant(!s.day.locked,'DAILY_LOSS');invariant(v.stale.length===0,'PORTFOLIO_STALE');invariant(v.illiquid.length===0,'PORTFOLIO_ILLIQUID');
      for(const p of Object.values(s.positions))invariant(s.quotes[keyOf(p.instrument)].bid>p.stop,'STOP_ACTIVE');
      s.halted=null;s.operatorReviewed=true;answer.code='REVIEWED';
    } else if(c.type==='proposal'||c.type==='quote') {
      const p=c.payload.proposal;
      if(c.type==='proposal') {
        invariant(p&&idOK(p.strategyId)&&['open','close'].includes(p.action),'INVALID_PROPOSAL');
        invariant(validInstrument(p.instrument,config.currency),'INSTRUMENT_MISMATCH');
        if(p.action==='close'){invariant(idOK(p.positionId)&&Object.hasOwn(s.positions,p.positionId),'POSITION_NOT_FOUND');invariant(p.quantity===null&&p.stopPrice===null,'UNSUPPORTED_PARTIAL_CLOSE');invariant(s.positions[p.positionId].strategyId===p.strategyId,'STRATEGY_POSITION_MISMATCH')}
      }
      let q;try {q=applyQuote(s,c.payload.quote,config,c.at);answer.marketAccepted=true}catch(error){invalidateQuotes(s,c.payload.quote,config);s.operatorReviewed=false;s.halted='FEED_'+(error.code||'INVALID');throw error}
      daily(s,config,c.at);
      if(c.type==='proposal') {
        invariant(keyOf(p.instrument)===keyOf(q.instrument),'INSTRUMENT_MISMATCH');
        if(p.action==='open') {
          invariant(!s.day.locked,'DAILY_LOSS');invariant(!s.halted,'CRITICAL_HALT');
          invariant(c.reviewed&&s.operatorReviewed,'SESSION_REVIEW_REQUIRED');
          const plan=opening(s,p,q,config,c.at),id=c.id;
          const nextCash=s.cash-plan.fill.net,totalFees=checked(s.totalFees+plan.fill.fees),totalSlippage=checked(s.totalSlippage+plan.fill.slippage);
          s.positions[id]={id,instrument:{...p.instrument},strategyId:p.strategyId,policy:p.policy,quantity:plan.quantity,stop:plan.stop,risk:plan.risk,entryCost:plan.fill.net,entryPrice:plan.fill.price,openedAt:c.at};
          s.cash=nextCash;q.askLeft-=plan.quantity;s.totalFees=totalFees;s.totalSlippage=totalSlippage;
          const fillId='open:'+id;s.trades.push({id:fillId,positionId:id,side:'buy',instrument:{...p.instrument},quantity:plan.quantity,...plan.fill,at:c.at,quoteAt:q.at,quoteSequence:q.sequence,strategyId:p.strategyId,reason:'PROPOSAL',pnl:0});
          answer.positionId=id;answer.fills.push(fillId);answer.code='OPENED';
        } else {
          const position=s.positions[p.positionId];invariant(keyOf(position.instrument)===keyOf(q.instrument),'INSTRUMENT_MISMATCH');
          answer.fills.push(closePosition(s,position,q,config,c.at,'close:'+c.id,'PROPOSAL',p.strategyId));answer.code='CLOSED';
        }
      } else {
        answer.code='QUOTE_ACCEPTED';answer.exits=[];
        for(const p of Object.values(s.positions))if(keyOf(p.instrument)===keyOf(q.instrument)&&q.bid<=p.stop) {
          try {const id=closePosition(s,p,q,config,c.at,'stop:'+p.id,'STOP',p.strategyId);answer.fills.push(id);answer.exits.push({positionId:p.id,approved:true,code:'STOP_FILLED',fillId:id})}
          catch(error){if(!(error instanceof PaperError))throw error;s.halted='STOP_UNFILLED';answer.exits.push({positionId:p.id,approved:false,code:error.code})}
        }
      }
    } else throw new PaperError('UNKNOWN_COMMAND');
  } catch(error) {
    if(!(error instanceof PaperError))throw error;
    // Expected validation failures are before any fill. Quote ingestion may persist
    // a fresh mark/circuit state, but an approval requires a committed transaction.
    Object.assign(answer,reject(c,error.code));
  }
  daily(s,config,c.at);s.lastAt=c.at;return {state:s,decision:answer};
}
function conflict(previous,c,config) {const {processed,...wallet}=previous,state={...clone(wallet),processed};daily(state,config,c.at);state.lastAt=c.at;return {state,decision:reject(c,'DUPLICATE_ID_CONFLICT')}}
function audit(result,previous) {
  const s=result.state;result.decision.accounting={units:'quote-micros/base-1e8',cash:s.cash,realized:s.realized,fees:s.totalFees,slippage:s.totalSlippage,positions:Object.values(s.positions).map(p=>({id:p.id,quantity:p.quantity,entryCost:p.entryCost,stop:p.stop,risk:p.risk})),executions:s.trades.slice(previous.trades.length)};return result;
}
function validCommand(c) {
  return keysMatch(c,['type','id','at','reviewed','payload','issues'])&&['proposal','quote','failure','resume','note'].includes(c.type)&&idOK(c.id)&&Number.isSafeInteger(c.at)&&c.at>0&&typeof c.reviewed==='boolean'&&typeof c.issues==='boolean'&&c.payload&&typeof c.payload==='object';
}
async function replay(doc,walletId) {
  invariant(keysMatch(doc,['schema','walletId','version','config','events','checksum'])&&Object.keys(doc).length===6&&typeof doc.checksum==='string'&&/^[a-f0-9]{64}$/.test(doc.checksum)&&doc.schema===SCHEMA&&doc.walletId===walletId&&Array.isArray(doc.events)&&doc.version===doc.events.length&&doc.version<=MAX_EVENTS,'CORRUPT_JOURNAL');
  invariant(doc.config&&Object.keys(doc.config).length===Object.keys(DEFAULTS).length,'CORRUPT_JOURNAL');
  const config=configuration(doc.config);let state=initial(config),checksum=await genesis(walletId,config);
  for(let i=0;i<doc.events.length;i++) {
    const event=doc.events[i],command=event.command;
    invariant(keysMatch(event,['seq','command','decision'])&&Object.keys(event).length===3&&event.seq===i+1&&validCommand(command)&&command.at>=state.lastAt,'CORRUPT_JOURNAL');
    let canonical;const issues={bad:false};if(command.type==='proposal')canonical=proposalPayload(command.payload.proposal,command.payload.quote).payload;else if(command.type==='quote')canonical={quote:cleanQuote(command.payload.quote,issues)};else if(command.type==='note')canonical={kind:scalar(command.payload.kind),details:noteText(command.payload.details)};else canonical=command.type==='failure'?{code:scalar(command.payload.code)}:{reason:scalar(command.payload.reason)};invariant(JSON.stringify(canonical)===JSON.stringify(command.payload),'CORRUPT_JOURNAL');
    const old=state.processed[requestKey(command)];let result;
    if(old){invariant(old.fingerprint!==fingerprint(command),'CORRUPT_JOURNAL');result=conflict(state,command,config)}else result=reduce(state,command,config);
    result=audit(result,state);invariant(JSON.stringify(result.decision)===JSON.stringify(event.decision),'CORRUPT_JOURNAL');state=result.state;
    if(!old)state.processed[requestKey(command)]={fingerprint:fingerprint(command),decision:result.decision};checksum=await advance(checksum,event);
  }
  invariant(checksum===doc.checksum,'CORRUPT_JOURNAL');return {state,config};
}
export class PaperTradingEngine {
  #store;#walletId;#clock;#armed=false;#fault=null;#sessionQuotes=new Set();
  constructor({store,walletId,clock}) {this.#store=store;this.#walletId=walletId;this.#clock=clock;}
  static async open(options) {
    invariant(keysMatch(options,['store','walletId','config','clock']),'UNSUPPORTED_ENGINE_FIELDS');
    const {store,walletId,clock=()=>Date.now()}=options;invariant(idOK(walletId)&&store&&typeof store.read==='function'&&typeof store.compareAndSwap==='function'&&typeof clock==='function','ENGINE_OPTIONS');
    let doc=await store.read(walletId);
    if(doc===null) {
      invariant(options.config!==undefined,'WALLET_NOT_FOUND');
      const config=configuration(options.config),empty={schema:SCHEMA,walletId,version:0,config,events:[],checksum:await genesis(walletId,config)};
      if(await store.compareAndSwap(walletId,null,empty))doc=empty;else doc=await store.read(walletId);
    }
    const restored=await replay(doc,walletId);
    if(options.config)invariant(JSON.stringify(configuration(options.config))===JSON.stringify(restored.config),'CONFIG_MISMATCH');
    return new PaperTradingEngine({store,walletId,clock});
  }
  #time(value) {const now=value===undefined?this.#clock():value;invariant(Number.isSafeInteger(now)&&now>0&&now<8640000000000000,'INVALID_TIME');return now;}
  async #execute(command) {
    invariant(!this.#fault,this.#fault||'RUNTIME_HALT');
    try {
      for(let attempt=0;attempt<4;attempt++) {
        const doc=await this.#store.read(this.#walletId),{state,config}=await replay(doc,this.#walletId);
        if(command.at<state.lastAt){this.#fault='CLOCK_REGRESSION';throw new PaperError('CLOCK_REGRESSION')}
        const old=state.processed[requestKey(command)];
        if(old&&old.fingerprint===fingerprint(command))return {...clone(old.decision),duplicate:true};
        invariant(doc.version<MAX_EVENTS,'JOURNAL_FULL');
        const result=audit(old?conflict(state,command,config):reduce(state,command,config),state),event={seq:doc.version+1,command,decision:result.decision};
        const next={...doc,version:doc.version+1,events:[...doc.events,event],checksum:await advance(doc.checksum,event)};
        if(await this.#store.compareAndSwap(this.#walletId,doc.version,next))return clone(result.decision);
      }
      throw new PaperError('CONCURRENT_UPDATE');
    } catch(error) {
      if(error instanceof PaperError){if(['CORRUPT_JOURNAL','JOURNAL_FULL','CLOCK_REGRESSION','CRYPTO_UNAVAILABLE'].includes(error.code))this.#fault=error.code;throw error}
      this.#fault='PERSISTENCE_UNCONFIRMED';throw new PaperError('PERSISTENCE_UNCONFIRMED');
    }
  }
  async submit(proposal,quote,{now}={}) {
    invariant(idOK(proposal?.id),'COMMAND_ID');const data=proposalPayload(proposal,quote);
    const answer=await this.#execute({type:'proposal',id:proposal.id,at:this.#time(now),reviewed:this.#armed,...data});if(answer.marketAccepted&&!answer.duplicate)this.#sessionQuotes.add(keyOf(data.payload.quote.instrument));return answer;
  }
  async onQuote(input) {
    invariant(keysMatch(input,['id','quote','now'])&&idOK(input.id),'COMMAND_ID');const issues={bad:false};
    const quote=cleanQuote(input.quote,issues),answer=await this.#execute({type:'quote',id:input.id,at:this.#time(input.now),reviewed:this.#armed,payload:{quote},issues:issues.bad});if(!answer.duplicate){if(answer.marketAccepted)this.#sessionQuotes.add(keyOf(quote.instrument));else this.#sessionQuotes.clear()}return answer;
  }
  async reportFailure(input) {
    invariant(keysMatch(input,['id','code','now'])&&idOK(input.id),'COMMAND_ID');
    const answer=await this.#execute({type:'failure',id:input.id,at:this.#time(input.now),reviewed:this.#armed,payload:{code:scalar(input.code)},issues:false});if(answer.approved&&!answer.duplicate)this.#sessionQuotes.clear();return answer;
  }
  async recordNote(input) {
    invariant(keysMatch(input,['id','kind','details','now'])&&idOK(input.id),'COMMAND_ID');
    return this.#execute({type:'note',id:input.id,at:this.#time(input.now),reviewed:this.#armed,payload:{kind:scalar(input.kind),details:noteText(input.details)},issues:false});
  }
  async resume(input) {
    invariant(keysMatch(input,['id','reason','now'])&&idOK(input.id),'COMMAND_ID');
    const doc=await this.exportJournal(),{state}=await replay(doc,this.#walletId),marketReviewed=Object.values(state.positions).every(p=>this.#sessionQuotes.has(keyOf(p.instrument)));
    const answer=await this.#execute({type:'resume',id:input.id,at:this.#time(input.now),reviewed:marketReviewed,payload:{reason:scalar(input.reason)},issues:false});
    if(answer.approved&&!answer.duplicate)this.#armed=true;
    return {...answer,sessionReviewed:this.#armed};
  }
  strategyPort(strategyId) {
    invariant(idOK(strategyId),'STRATEGY_ID');return Object.freeze({submit:async(proposal,...extra)=>{
      invariant(extra.length===0,'STRATEGY_INPUT');
      let doc;try{doc=await this.exportJournal()}catch(error){if(error instanceof PaperError)throw error;this.#fault='PERSISTENCE_UNCONFIRMED';throw new PaperError('PERSISTENCE_UNCONFIRMED')}
      const {state,config}=await replay(doc,this.#walletId),i=proposal?.instrument,q=validInstrument(i,config.currency)?state.quotes[keyOf(i)]:null;
      const quote=q?{instrument:{...q.instrument},at:q.at,sequence:q.sequence,bid:publicCash(q.bid),ask:publicCash(q.ask),bidSize:publicQty(q.bidSize),askSize:publicQty(q.askSize),available:q.ready===true&&this.#sessionQuotes.has(keyOf(q.instrument))}:null;
      return this.submit({...proposal,strategyId},quote);
    }});
  }
  async exportJournal() {const doc=await this.#store.read(this.#walletId);await replay(doc,this.#walletId);return clone(doc);}
  async lookup(id) {const doc=await this.exportJournal();const {state}=await replay(doc,this.#walletId);return clone(state.processed['proposal:'+id]?.decision??null);}
  async snapshot({now}={}) {
    const at=this.#time(now),doc=await this.exportJournal(),{state:s,config}=await replay(doc,this.#walletId);invariant(at>=s.lastAt,'CLOCK_REGRESSION');
    const v=valuation(s,config,at);for(const p of Object.values(s.positions))if(!this.#sessionQuotes.has(keyOf(p.instrument))){v.stale.push(keyOf(p.instrument));v.illiquid.push(keyOf(p.instrument))}const d=s.day?{...s.day,loss:Math.max(0,s.day.startEquity-v.equity)}:null;
    const positions=Object.values(s.positions).map(p=>({...p,quantity:publicQty(p.quantity),entryPrice:publicCash(p.entryPrice),entryCost:publicCash(p.entryCost),stop:publicCash(p.stop),risk:publicCash(p.risk)}));
    const trades=s.trades.map(t=>({...t,quantity:publicQty(t.quantity),price:publicCash(t.price),gross:publicCash(t.gross),fees:publicCash(t.fees),net:publicCash(t.net),slippage:publicCash(t.slippage),pnl:publicCash(t.pnl)}));
    return {schema:SCHEMA,walletId:this.#walletId,version:doc.version,capacity:{used:doc.version,limit:MAX_EVENTS,remaining:MAX_EVENTS-doc.version},currency:config.currency,initialBalance:config.initialBalance,cash:publicCash(s.cash),equity:publicCash(v.equity),realized:publicCash(s.realized),unrealized:publicCash(v.unrealized),fees:publicCash(s.totalFees),slippage:publicCash(s.totalSlippage),positions,trades,sessionReviewed:this.#armed,halted:this.#fault||s.halted,valuationFresh:v.stale.length===0,liquidationExecutable:v.illiquid.length===0,staleInstruments:v.stale,day:d?{...d,startEquity:publicCash(d.startEquity),loss:publicCash(d.loss)}:null,config};
  }
}
