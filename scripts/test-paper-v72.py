"""Native Chromium E2E. Synthetic fixtures test execution; --live uses real public Coinbase.
Never treats fixture PnL as market performance. No financial account APIs.
"""
import argparse,datetime,functools,http.server,json,math,os,pathlib,threading,time,urllib.request
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true');parser.add_argument('--origin');parser.add_argument('--tls-helper',action='store_true');args=parser.parse_args()
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
origin=args.origin or f'http://127.0.0.1:{server.server_port}';snapshot=json.loads((root/'artifacts/market-snapshot.json').read_text());checks=[]
try:
 with sync_playwright() as p:
  opts={'executable_path':'/usr/bin/chromium','args':['--no-sandbox']}
  if args.live and not args.tls_helper:opts['proxy']={'server':os.environ.get('HTTPS_PROXY','http://proxy:8080'),'bypass':'127.0.0.1,localhost'}
  browser=p.chromium.launch(**opts)
  for width in ([390] if args.live else [1440,768,390,375]):
   context=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,has_touch=width<600,locale='pt-BR',accept_downloads=True)
   if not args.live:context.add_init_script("window.__paperNow=Number(localStorage.getItem('v72-clock')||1793620810000);Date.now=()=>window.__paperNow;const nativeTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===15000?100:ms,...args);")
   context.add_init_script('window.WebSocket=class{constructor(){}close(){}};')
   now=[1793620810000];mode={'offline':False,'quota':False};market=[];errors=[];failures=[];console=[]
   def route(r):
    url=r.request.url
    if 'unpkg.com' in url:r.fulfill(body=(root/'artifacts/lightweight-charts.js').read_text(),content_type='application/javascript')
    elif 'binance.vision' in url:r.fulfill(json=snapshot['binance']['BTCUSDT'])
    elif 'radar-cloud-collector-preview' in url:r.fulfill(json=snapshot['health'] if '/health' in url else {'checks':[]} if '/probe' in url else snapshot['observations'])
    elif 'api.exchange.coinbase.com' in url:
     market.append(url)
     if args.live:
      if not args.tls_helper:r.continue_();return
      # Uses the managed CA/proxy with TLS verification. Payload is not modified.
      try:
       with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'RadarDeMercado/7.2 (+https://github.com/rvc3527-cell/radar-de-mercado)'}),timeout=5) as response:
        body=response.read(65537);assert len(body)<=65536
        assert response.headers.get('Access-Control-Allow-Origin')=='*'
        r.fulfill(status=response.status,body=body,headers={'content-type':'application/json','access-control-allow-origin':'*'})
      except urllib.error.HTTPError as error:r.fulfill(status=error.code,body=error.read(65536),headers={'content-type':'application/json','access-control-allow-origin':'*',**({'retry-after':error.headers['Retry-After']} if error.headers.get('Retry-After') else {})})
      return
     if mode['offline']:r.abort();return
     if '/candles?' in url:
      end=(now[0]-5000)//60000*60
      data=[]
      for i in range(60):
       c=100+i*.005+math.sin((i+5)*math.pi/4)*.04;data.append([end-(60-i)*60,c-.02,c+.02,c,c,1])
      r.fulfill(json=data[::-1])
     else:r.fulfill(json={'bids':[['100.3','100',1]],'asks':[['100.31','100',1]],'auction_mode':False,'auction':None,'sequence':now[0],'time':datetime.datetime.fromtimestamp((now[0]-500)/1000,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')})
    else:r.continue_()
   context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('requestfailed',lambda r:failures.append({'url':r.url,'failure':r.failure}));page.on('console',lambda m:console.append(m.text) if m.type=='error' else None);page.goto(origin+'/#simulacao',wait_until='networkidle');page.wait_for_selector('#paperPrepare')
   assert page.locator('#paperState').inner_text()=='Desativado';assert not market;assert page.locator('#paperStart').is_disabled()
   page.locator('#paperPrepare').click();page.wait_for_function("['Pronto para simulação','Pausado por falha'].includes(document.getElementById('paperState').textContent)",timeout=20000)
   if page.locator('#paperState').inner_text()!='Pronto para simulação':
    checks.append({'width':width,'live':args.live,'ready':False,'reason':page.locator('#paperReason').inner_text(),'marketRequests':market,'errors':errors,'requestFailures':failures,'console':console});context.close();continue
   assert len(market)==2;assert page.locator('#paperStart').is_disabled();page.locator('#paperConsent').check();page.locator('#paperStart').click();page.wait_for_function("['Simulando','Pausado por risco','Pausado por falha'].includes(document.getElementById('paperState').textContent)")
   state=page.locator('#paperState').inner_text();assert state=='Simulando',(state,page.locator('#paperReason').inner_text())
   if not args.live:page.wait_for_function("document.getElementById('paperOpen').textContent==='1'")
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(root/('artifacts/v72-paper-'+str(width)+('-live.png' if args.live else '.png'))))
   if args.live:
    # Observe separately: no forced entry, no fabricated performance.
    time.sleep(16);page.wait_for_timeout(2000)
   else:
    now[0]+=15000;page.evaluate('(n)=>{window.__paperNow=n;localStorage.setItem("v72-clock",String(n))}',now[0]);page.wait_for_function("document.getElementById('paperCapacity').textContent.startsWith('7 /')||Number(document.getElementById('paperCapacity').textContent.split(' /')[0])>=7")
   with page.expect_download() as download:page.locator('#paperExport').click()
   data=json.loads(pathlib.Path(download.value.path()).read_text());assert data['journal']['events'];assert data['journal']['checksum'];assert any(e['command'].get('payload',{}).get('kind')=='STRATEGY_DECISION' for e in data['journal']['events'])
   if args.live:(root/'artifacts/v72-live-paper-journal.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
   initial_trades=len([e for e in data['journal']['events'] if e['decision']['code']=='OPENED']);page.locator('#paperEnd').click();page.wait_for_function("document.getElementById('paperState').textContent==='Encerrado'")
   if not args.live:assert 'posições fictícias abertas' in page.locator('#paperResidual').inner_text()
   old=len(market);page.reload(wait_until='networkidle');assert page.locator('#paperState').inner_text()=='Desativado';assert len(market)==old
   page.locator('#paperRestore').click();page.wait_for_function("document.getElementById('paperCash').textContent!=='Não carregado'")
   assert page.locator('#paperState').inner_text()=='Desativado';assert len(market)==old;assert not errors,errors
   if not args.live:
    assert page.locator('#paperOpen').inner_text()=='1'
    # A new explicit session with an unavailable source must not execute.
    mode['offline']=True;now[0]+=15000;page.evaluate('(n)=>{window.__paperNow=n;localStorage.setItem("v72-clock",String(n))}',now[0]);page.locator('#paperPrepare').click();page.wait_for_function("document.getElementById('paperState').textContent==='Pausado por falha'");assert page.locator('#paperOpen').inner_text()=='1'
   checks.append({'width':width,'live':args.live,'ready':True,'passed':True,'prospectiveOpened':initial_trades if args.live else None,'fixtureOpened':initial_trades if not args.live else None,'marketRequests':market,'errors':errors});context.close()
  browser.close()
 report={'browser':'Chromium','realSafari':False,'live':args.live,'transport':'urllib-tls-verified' if args.tls_helper else 'browser-native','checks':checks};out=root/('artifacts/v72-paper-live.json' if args.live else 'artifacts/v72-paper-browser.json');out.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
 if not args.live:assert all(x.get('passed') for x in checks),checks
finally:server.shutdown()
