"""Actual native IndexedDB integration, isolated browser profiles and synthetic paper quotes.
No market calls, AI, D1 or financial broker. Chromium is not a Safari certificate.
"""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}';results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,390]:
   context=browser.new_context(viewport={'width':width,'height':844},is_mobile=width<600,has_touch=width<600);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   context.route('**/paper-test',lambda r:r.fulfill(body='<!doctype html><title>Isolated paper test</title>',content_type='text/html'))
   page.goto(origin+'/paper-test')
   first=page.evaluate('''async()=>{
    const {PaperTradingEngine:E}=await import('/paper/engine.js'),{IndexedDBPaperStore:S}=await import('/paper/store.js');
    window.fetch=()=>{throw Error('Market network is forbidden in paper engine')};
    const now=Date.UTC(2026,10,2,12),store=new S({name:'isolated-paper-v71'}),engine=await E.open({walletId:'wallet',store,clock:()=>now,config:{feeBps:0,slippageBps:0,maxPositions:2}});
    await engine.resume({id:'review',reason:'Initial explicit review'});
    const instrument={provider:'binance',market:'spot',base:'BTC',quote:'USDT',symbol:'BTCUSDT'},quote={instrument,at:now,sequence:1,bid:100,ask:100,bidSize:100,askSize:100,available:true};
    const result=await engine.submit({id:'entry',strategyId:'test',action:'open',instrument,quantity:1,stopPrice:95},quote);const view=await engine.snapshot();await store.close();return {approved:result.approved,cash:view.cash,positions:view.positions.length,trades:view.trades.length};
   }''')
   assert first=={'approved':True,'cash':9900,'positions':1,'trades':1}
   page.reload()
   after=page.evaluate('''async()=>{
    const {PaperTradingEngine:E}=await import('/paper/engine.js'),{IndexedDBPaperStore:S}=await import('/paper/store.js');window.fetch=()=>{throw Error('No network')};
    const now=Date.UTC(2026,10,2,12),store=new S({name:'isolated-paper-v71'}),e=await E.open({walletId:'wallet',store,clock:()=>now});
    const instrument={provider:'binance',market:'spot',base:'BTC',quote:'USDT',symbol:'BTCUSDT'},q={instrument,at:now,sequence:1,bid:100,ask:100,bidSize:100,askSize:100,available:true};
    const open=id=>({id,strategyId:'test',action:'open',instrument,quantity:1,stopPrice:95});const restored=await e.snapshot();
    const duplicate=await e.submit(open('entry'),q),blocked=await e.submit(open('unreviewed'),q);await e.onQuote({id:'fresh-after-reload',quote:q});await e.resume({id:'restart-review',reason:'Reviewed restored journal'});
    const secondStore=new S({name:'isolated-paper-v71'}),other=await E.open({walletId:'wallet',store:secondStore,clock:()=>now});await other.onQuote({id:'other-new-feed',quote:q});await other.resume({id:'other-review',reason:'Concurrent owner reviewed'});
    const outcomes=await Promise.all([e.submit(open('one'),q),other.submit(open('two'),q)]);const view=await e.snapshot();await store.close();await secondStore.close();
    return {restoredCash:restored.cash,restoredPositions:restored.positions.length,armed:restored.sessionReviewed,cachedExecutable:restored.liquidationExecutable,duplicate:duplicate.duplicate,blocked:blocked.code,concurrentApproved:outcomes.filter(x=>x.approved).length,positions:view.positions.length,trades:view.trades.length};
   }''')
   assert after=={'restoredCash':9900,'restoredPositions':1,'armed':False,'cachedExecutable':False,'duplicate':True,'blocked':'SESSION_REVIEW_REQUIRED','concurrentApproved':1,'positions':2,'trades':2},after
   assert not errors,errors;results.append({'width':width,'beforeReload':first,'afterReload':after,'pageerrors':errors});context.close()
  browser.close()
 print(json.dumps(results,indent=2));(root/'artifacts/paper-v71-browser.json').write_text(json.dumps({'engine':'Chromium','syntheticQuotes':True,'checks':results},indent=2))
finally:server.shutdown()
