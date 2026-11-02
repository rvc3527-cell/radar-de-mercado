import {PaperTradingEngine} from './engine.js';
import {STRATEGY,POLICY,decide} from './strategy.js';
import {invariant} from './money.js';
export const SESSION_CONFIG=Object.freeze({currency:'USD',initialBalance:10000,maxRiskBps:100,dailyLossBps:300,maxPositions:1,maxAssetExposureBps:1000,feeBps:10,slippageBps:5,maxSpreadBps:20,maxQuoteAgeMs:10000});
export const STATES=Object.freeze({OFF:'Desativado',WAIT:'Aguardando dados',READY:'Pronto para simulação',RUN:'Simulando',RISK:'Pausado por risco',FAIL:'Pausado por falha',END:'Encerrado'});
export const SESSION_BUDGET=1000,RESERVE=200;
export function capacitySafe(capacity,used=0){return capacity.remaining>=RESERVE+5&&used<SESSION_BUDGET-5}
// Origin-scoped ownership. Browsers without Web Locks cannot activate this runner.
export async function browserLease(name,locks=globalThis.navigator?.locks){
  invariant(locks&&typeof locks.request==='function','WEB_LOCKS_REQUIRED');
  return new Promise((resolve,reject)=>{let release;
    locks.request(name,{ifAvailable:true},async lock=>{if(!lock){reject(Error('SESSION_BUSY'));return}await new Promise(done=>{release=done;resolve(()=>release())})}).catch(reject);
  });
}
export class SupervisedPaperSession {
  constructor({store,feed,clock=()=>Date.now(),lease=browserLease,estimate=()=>globalThis.navigator?.storage?.estimate?.(),indicators=globalThis.RadarIndicators,walletId='supervised-btc-usd-v72',onChange=()=>{},id=()=>crypto.randomUUID()}={}){
    Object.assign(this,{store,feed,clock,lease,estimate,indicators,walletId,onChange,id});this.state=STATES.OFF;this.reason='Somente dinheiro fictício. Nenhuma sessão iniciada.';this.engine=null;this.wallet=null;this.sample=null;this.sessionId=null;this.release=null;this.active=false;this.blocked=true;this.lastTick=0;this.tail=Promise.resolve();this.source='Não consultada';this.lastDecision=null;this.generation=0;
  }
  view(){return {state:this.state,reason:this.reason,wallet:this.wallet,source:this.source,quote:this.sample?.quote??null,sessionId:this.sessionId,startedAt:this.startedAt??null,endsAt:this.endsAt??null,lastDecision:this.lastDecision,active:this.active,unprotected:!this.active&&!!this.wallet?.positions.length}}
  emit(){this.onChange(this.view())}
  serial(fn){const task=this.tail.then(fn);this.tail=task.catch(()=>{});return task}
  async note(kind,data,suffix){const d=await this.engine.recordNote({id:this.sessionId+':'+suffix,kind,details:JSON.stringify(data)});invariant(d.approved,d.code);return d}
  async refresh(){if(this.engine)this.wallet=await this.engine.snapshot();this.emit()}
  async restore(){return this.serial(async()=>{invariant(!this.active,'SESSION_ACTIVE');this.engine=await PaperTradingEngine.open({walletId:this.walletId,store:this.store,clock:this.clock});await this.refresh();return this.view()})}
  async prepare({initialBalance=10000}={}){return this.serial(async()=>{
    invariant(!this.active,'SESSION_ACTIVE');this.blocked=true;this.state=STATES.WAIT;this.reason='Validando fonte, armazenamento e diário…';this.emit();
    try{
      if(!this.release)this.release=await this.lease('radar-paper:'+this.walletId);
      const quota=await this.estimate();invariant(quota&&Number.isFinite(quota.quota)&&Number.isFinite(quota.usage)&&quota.quota-quota.usage>=20000000,'STORAGE_RESERVE');
      const existing=await this.store.read(this.walletId);
      this.engine=await PaperTradingEngine.open({walletId:this.walletId,store:this.store,clock:this.clock,...(existing===null?{config:{...SESSION_CONFIG,initialBalance}}:{})});
      this.wallet=await this.engine.snapshot();for(const [k,v] of Object.entries(SESSION_CONFIG))if(k!=='initialBalance')invariant(this.wallet.config[k]===v,'SESSION_CONFIG_MISMATCH');
      invariant(this.wallet.capacity.remaining>=SESSION_BUDGET+RESERVE,'SESSION_CAPACITY');
      invariant(this.wallet.positions.every(p=>p.strategyId===STRATEGY&&p.instrument.symbol==='BTC-USD'),'FOREIGN_POSITION');
      this.sessionId='s72:'+this.id();this.baseVersion=this.wallet.version;
      this.lastDecisionTime=null;
      await this.note('SESSION_CHECK',{config:this.wallet.config,at:this.clock(),mode:'supervised',budget:SESSION_BUDGET,reserve:RESERVE},'check');
      this.sample=await this.feed.sample();this.source='Coinbase Exchange · BTC/USD · validada';this.state=STATES.READY;this.reason='Fonte e diário verificados. Ative explicitamente para iniciar.';await this.refresh();return this.view();
    }catch(error){await this.fail(error,false);throw error}
  })}
  async start({confirmed=false,durationMinutes=60}={}){return this.serial(async()=>{
    invariant(confirmed===true&&[60,120].includes(durationMinutes),'EXPLICIT_ACTIVATION');invariant(this.state===STATES.READY&&this.engine,'PREPARE_REQUIRED');
    const generation=this.generation;
    try{
      if(this.clock()-this.sample.quote.at>5000)this.sample=await this.feed.sample();
      invariant(this.clock()-this.sample.quote.at<=5000,'PREPARED_QUOTE_STALE');
      invariant(generation===this.generation,'SESSION_INTERRUPTED');
      const check=await this.engine.snapshot();invariant(check.capacity.remaining>=SESSION_BUDGET+RESERVE,'SESSION_CAPACITY');
      this.startedAt=this.clock();this.endsAt=this.startedAt+durationMinutes*60000;
      await this.note('SESSION_START',{at:this.startedAt,endsAt:this.endsAt,config:check.config,policy:POLICY,mode:'supervised'},'start');
      invariant(generation===this.generation,'SESSION_INTERRUPTED');
      const quoted=await this.engine.onQuote({id:this.sessionId+':initial-quote',quote:this.sample.quote});invariant(quoted.approved,quoted.code);
      invariant(generation===this.generation,'SESSION_INTERRUPTED');
      const reviewed=await this.engine.resume({id:this.sessionId+':review',reason:'User explicitly activated supervised fictitious session'});invariant(reviewed.approved,reviewed.code);
      invariant(generation===this.generation,'SESSION_INTERRUPTED');
      this.active=true;this.blocked=false;this.state=STATES.RUN;this.reason='Sessão supervisionada ativa. Estratégia pode aguardar sem operar.';this.lastTick=this.clock();await this.evaluate();await this.refresh();return this.view();
    }catch(error){await this.fail(error,true);throw error}
  })}
  async evaluate(){
    if(this.blocked||!this.active)return;
    const snapshot=await this.engine.snapshot();
    if(snapshot.halted||snapshot.day?.locked){await this.fail(Error(snapshot.halted||'DAILY_LOSS'),false,true);return}
    const decision=decide({...this.sample,snapshot,now:this.clock(),indicators:this.indicators});
    const action=decision.proposal?.action||'wait';
    if(decision.time===this.lastDecisionTime&&(action!=='close'||this.lastDecisionAction==='close'))return;this.lastDecisionTime=decision.time;this.lastDecisionAction=action;this.lastDecision=decision;this.reason=decision.reason;
    await this.note('STRATEGY_DECISION',{at:this.clock(),...decision},'decision:'+decision.time+':'+action);
    if(decision.proposal&&!this.blocked){const result=await this.engine.strategyPort(STRATEGY).submit(decision.proposal);this.lastDecision={...decision,result};this.reason=decision.reason+' Resultado: '+result.code;if(!result.approved)await this.fail(Error(result.code),true,true)}
    const next=await this.engine.snapshot();if(next.halted||next.day?.locked)await this.fail(Error(next.halted||'DAILY_LOSS'),false,true);
  }
  async tick(){return this.serial(async()=>{
    if(!this.active||this.blocked)return this.view();
    try{
      const now=this.clock();if(now>=this.endsAt)return this.finish('Duração supervisionada concluída.');
      if(now-this.lastTick>30000)throw Error('SUPERVISION_INTERRUPTED');
      if(now-this.lastTick<15000)return this.view();
      this.wallet=await this.engine.snapshot();if(!capacitySafe(this.wallet.capacity,this.wallet.version-this.baseVersion))return this.finish('Orçamento do diário atingido; exporte o histórico antes de outra sessão.');
      const sample=await this.feed.sample();if(this.blocked||!this.active)return this.view();
      invariant(this.clock()<this.endsAt,'SESSION_EXPIRED');this.sample=sample;
      const result=await this.engine.onQuote({id:this.sessionId+':q:'+sample.quote.sequence,quote:sample.quote});invariant(result.approved,result.code);
      this.lastTick=this.clock();this.source='Coinbase Exchange · BTC/USD · validada';await this.evaluate();await this.refresh();return this.view();
    }catch(error){await this.fail(error,true);return this.view()}
  })}
  async fail(error,persist=true,risk=false){
    this.blocked=true;this.active=false;this.state=risk?STATES.RISK:STATES.FAIL;this.reason=String(error.code||error.message||error);this.source='Sem autorização para executar; verifique a fonte.';
    if(persist&&this.engine)try{await this.engine.reportFailure({id:this.sessionId+':failure:'+this.id(),code:'DATA'});await this.note('SESSION_PAUSE',{at:this.clock(),reason:this.reason},'pause:'+this.id())}catch(_) {this.reason+=' · Registro de falha não confirmado; exporte/verifique após recuperação.'}
    try{if(this.engine)this.wallet=await this.engine.snapshot()}catch(_){this.reason+=' · Diário indisponível; estado persistido não confirmado.'}
    this.release?.();this.release=null;this.emit();
  }
  interrupt(reason='A página perdeu supervisão.'){this.blocked=true;this.generation++;return this.serial(()=>this.active?this.fail(Error(reason),true):undefined)}
  async finish(reason){
    this.blocked=true;this.active=false;this.state=STATES.END;this.reason=reason;
    try{if(this.engine){await this.note('SESSION_END',{at:this.clock(),reason,closePositions:false},'end');await this.refresh()}}
    catch(error){await this.fail(error,false)}finally{this.release?.();this.release=null;this.emit()}
    return this.view();
  }
  end(){this.blocked=true;this.generation++;return this.serial(()=>this.finish('Sessão encerrada pelo usuário. Posições fictícias não foram fechadas automaticamente.'))}
  async export(){invariant(this.engine,'NO_WALLET');return {format:'radar-supervised-export-v72',exportedAt:this.clock(),warning:'Local fictitious data is not a permanent backup or market performance proof.',journal:await this.engine.exportJournal()}}
}
