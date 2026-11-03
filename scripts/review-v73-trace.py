"""Read-only UI review of the recorded real prospect. No market calls or new trades.
The trace is inserted only into an isolated QA browser profile, never a user wallet.
"""
import argparse,urllib.request,urllib.parse,functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
parser=argparse.ArgumentParser();parser.add_argument('--origin');parser.add_argument('--artifact-prefix',default='v73');args=parser.parse_args()
origin=args.origin or f'http://127.0.0.1:{server.server_port}';journal=json.loads((root/'artifacts/v73-prospective.json').read_text())['data']['journal'];checks=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,390]:
   ctx=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,has_touch=width<600,locale='pt-BR');ctx.add_init_script('window.WebSocket=class{close(){}};');page=ctx.new_page();errors=[];market=[];page.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    if 'unpkg.com' in r.request.url:r.fulfill(body=(root/'artifacts/lightweight-charts.js').read_text(),content_type='application/javascript')
    elif not r.request.url.startswith(origin):market.append(r.request.url);r.fulfill(status=503,json={'message':'No market access in read-only QA'})
    elif args.origin:
     with urllib.request.urlopen(urllib.request.Request(r.request.url,headers={'User-Agent':'RadarDeMercado/7.3 (+https://github.com/rvc3527-cell/radar-de-mercado)'}),timeout=8) as response:
      body=response.read();relative=urllib.parse.urlsplit(r.request.url).path.lstrip('/') or 'index.html';local=root/relative
      if not local.is_file():local=root/'index.html'
      assert body==local.read_bytes(),relative
      r.fulfill(body=body,headers={'content-type':response.headers.get('Content-Type','text/plain')})
    else:r.continue_()
   ctx.route('**/*',route);page.goto(origin+'/#simulacao',wait_until='networkidle');page.wait_for_selector('#paperRestore');count=len(market)
   page.evaluate('''async j=>{const {IndexedDBPaperStore}=await import('/paper/store.js');const store=new IndexedDBPaperStore(),db=await store.database();await new Promise((resolve,reject)=>{const tx=db.transaction('wallets','readwrite');tx.objectStore('wallets').put(j,j.walletId);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});await store.close()}''',journal)
   page.locator('#paperRestore').click();page.wait_for_selector('#paperSessionResults article');text=page.locator('#paperSessionResults').inner_text();assert 'Prospectivo real' in text;assert 'Amostra insuficiente' in text;assert 'NO_EXIT_LIQUIDITY' not in page.locator('#paperReason').inner_text();assert 'Entradas 1 · saídas 1 · posições residuais 0' in text;assert '0,99' in text
   assert page.locator('#paperState').inner_text()=='Desativado';assert page.locator('#paperStart').is_disabled();assert len(market)==count;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.locator('#paperSessionResults').scroll_into_view_if_needed();page.screenshot(path=str(root/(f'artifacts/{args.artifact_prefix}-results-{width}'+('-preview.png' if args.origin else '.png'))));details=page.locator('#paperSessionResults details').first;details.evaluate('(el)=>el.open=true');page.wait_for_timeout(1200);assert details.evaluate('(el)=>el.open'),'clock must not collapse report';assert 'cinco minutos' in details.inner_text();assert not errors,errors
   checks.append({'width':width,'origin':origin,'passed':True,'source':'review of verified real prospect, no new market data','journalChecksum':journal['checksum'],'pageErrors':errors});ctx.close()
  browser.close()
 (root/(f'artifacts/{args.artifact_prefix}-results-preview.json' if args.origin else f'artifacts/{args.artifact_prefix}-results-browser.json')).write_text(json.dumps(checks,ensure_ascii=False,indent=2));print(json.dumps(checks,ensure_ascii=False,indent=2))
finally:server.shutdown()
