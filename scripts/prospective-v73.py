"""Real-time supervised runner. No fixtures, no strategy overrides, no retries.
TLS is checked by urllib using the managed environment CA/proxy. Not Safari.
"""
import argparse,functools,hashlib,http.server,json,pathlib,threading,time,urllib.request,urllib.error
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--minutes',type=int,choices=[60,120],default=60);parser.add_argument('--protocol',required=True,help='Frozen v7.6 protocol selected by the supervisor');parser.add_argument('--output',required=True,help='New capture JSON path; existing evidence is never overwritten');args=parser.parse_args()
protocol=json.loads((root/args.protocol).read_text());runtime_hashes=json.loads(__import__('subprocess').check_output(['node','scripts/write-build-manifest-v76.mjs'],cwd=root));
output=(root/args.output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
try:
 with output.open('x'):pass
except FileExistsError:parser.error('Output already exists; choose a new path. Original evidence was preserved.')
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}';manifest={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'paper').glob('*.js')}
requests=[];errors=[];data=None;started=time.time()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   url=r.request.url
   if 'api.exchange.coinbase.com' not in url:r.continue_();return
   entry={'url':url,'startedAt':int(time.time()*1000)};requests.append(entry)
   try:
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'RadarDeMercado/7.3 (+https://github.com/rvc3527-cell/radar-de-mercado)'}),timeout=4) as response:
     body=response.read(65537);assert len(body)<=65536;entry['http']=response.status
     r.fulfill(status=response.status,body=body,headers={'content-type':'application/json','access-control-allow-origin':'*'})
   except urllib.error.HTTPError as e:
    entry['http']=e.code;r.fulfill(status=e.code,body=e.read(65536),headers={'content-type':'application/json','access-control-allow-origin':'*',**({'retry-after':e.headers['Retry-After']} if e.headers.get('Retry-After') else {})})
   except Exception as e:entry['error']=str(e);r.abort()
   finally:entry['finishedAt']=int(time.time()*1000)
  context.route('**/*',route);page.goto(origin+'/paper/package.json');page.set_content('<h1>Ensaio real supervisionado</h1><button id="prepare">Verificar</button><button id="start">Ativar explicitamente</button><button id="end">Encerrar</button><pre id="state">Desativado</pre>')
  page.evaluate('(x)=>{window.trialProtocol=x.protocol;window.trialHashes=x.hashes}',{'protocol':protocol,'hashes':runtime_hashes});page.evaluate('''async()=>{
   await import('/indicators.js');const {IndexedDBPaperStore}=await import('/paper/store.js'),{CoinbasePaperFeed}=await import('/paper/market.js'),{SupervisedPaperSession}=await import('/paper/session.js');
   const s=window.supervised=new SupervisedPaperSession({store:new IndexedDBPaperStore({name:'isolated-v73-prospective'}),feed:new CoinbasePaperFeed(),origin:'prospective-real',runtimeManifest:async()=>window.trialHashes,onChange:v=>{window.currentView=v;document.getElementById('state').textContent=JSON.stringify({state:v.state,reason:v.reason,wallet:v.wallet&&{cash:v.wallet.cash,positions:v.wallet.positions.length}},null,2)}});
   await s.attachProtocol(window.trialProtocol);
   let timer;async function loop(){await s.tick();if(s.active)timer=setTimeout(loop,15000)}
   document.getElementById('prepare').onclick=()=>s.prepare().catch(e=>window.lastError=e.message);
   document.getElementById('start').onclick=async()=>{try{await s.start({confirmed:true,durationMinutes:window.trialMinutes});if(s.active)timer=setTimeout(loop,15000)}catch(e){window.lastError=e.message}};
   document.getElementById('end').onclick=async()=>{clearTimeout(timer);await s.end()};
   document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'){clearTimeout(timer);void s.interrupt('Página oculta no ensaio supervisionado.')}});
   window.addEventListener('offline',()=>{clearTimeout(timer);void s.interrupt('Rede interrompida no ensaio supervisionado.')});
  }''');page.evaluate('(m)=>window.trialMinutes=m',args.minutes);page.click('#prepare');page.wait_for_function("['Pronto para simulação','Pausado por falha'].includes(supervised.state)",timeout=20000)
  if page.evaluate('supervised.state')=='Pronto para simulação':page.click('#start');page.wait_for_function("supervised.state!=='Pronto para simulação'",timeout=20000)
  next_log=time.time()
  while page.evaluate('supervised.active'):
   page.wait_for_timeout(1000)
   if time.time()>=next_log:
    data=page.evaluate('supervised.export()');output.write_text(json.dumps({'mode':'real-prospective','transport':'urllib-tls-verified','browser':'Chromium','plannedMinutes':args.minutes,'loadedCodeSha256':manifest,'capturedAt':int(time.time()*1000),'runtimeState':page.evaluate('supervised.state'),'data':data,'httpRequests':requests,'pageErrors':errors},ensure_ascii=False,indent=2));print(json.dumps({'elapsedSeconds':round(time.time()-started),'state':page.evaluate('supervised.state'),'events':data['journal']['version'],'httpRequests':len(requests)}),flush=True);next_log=time.time()+60
   if time.time()-started>args.minutes*60+45:page.click('#end');break
  # Preserve paused state; do not convert failure into a normal completed session.
  try:data=page.evaluate('supervised.export()')
  except Exception:
   try:data={'journal':page.evaluate('supervised.engine.exportJournal()')}
   except Exception:data=None
  final={'mode':'real-prospective','transport':'urllib-tls-verified','browser':'Chromium','realSafari':False,'plannedMinutes':args.minutes,'wallSeconds':round(time.time()-started,3),'loadedCodeSha256':manifest,'capturedAt':int(time.time()*1000),'runtimeState':page.evaluate('supervised.state'),'reason':page.evaluate('supervised.reason'),'data':data,'httpRequests':requests,'pageErrors':errors};output.write_text(json.dumps(final,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in final.items() if k not in ['data','httpRequests','loadedCodeSha256']},ensure_ascii=False),flush=True);browser.close()
finally:server.shutdown()
