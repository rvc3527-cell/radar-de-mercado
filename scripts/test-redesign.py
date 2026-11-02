"""Responsive integration test using a captured REAL market snapshot and real chart library.
No production writes. Requires local Playwright/Chromium. Not a Safari certification.
"""
import functools,http.server,json,pathlib,threading,argparse,time
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--origin');parser.add_argument('--no-screenshots',action='store_true');parser.add_argument('--snapshot',default=str(root/'artifacts/market-snapshot.json'));args=parser.parse_args()
snapshot=json.loads(pathlib.Path(args.snapshot).read_text())
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=args.origin or f'http://127.0.0.1:{server.server_port}'
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,768,390,375]:
   context=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},device_scale_factor=1,is_mobile=width<600,has_touch=width<600,reduced_motion='reduce')
   context.add_init_script('Date.now=()=>'+str(snapshot['at'])+';window.WebSocket=class{constructor(){queueMicrotask(()=>this.onopen?.())}close(){}};')
   def route(r):
    url=r.request.url
    if 'unpkg.com' in url:r.fulfill(body=(root/'artifacts/lightweight-charts.js').read_text(),content_type='application/javascript')
    elif 'binance.vision' in url:
     symbol=next((s for s in snapshot['binance'] if s in url),'BTCUSDT');r.fulfill(json=snapshot['binance'][symbol])
    elif 'radar-cloud-collector-preview' in url:
     if any('/'+name in url for name in ['history','statistics','collector-history']):
      r.fulfill(status=503,json={'error':{'message':'Histórico indisponível no cenário de compatibilidade'}});return
     key='health' if '/health' in url else 'observations';r.fulfill(json=snapshot[key] if '/probe' not in url else {'checks':[]})
    else:r.continue_()
   context.route('**/*',route);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   begin=time.monotonic();page.goto(origin,wait_until='networkidle');elapsed=time.monotonic()-begin
   page.wait_for_function("document.querySelectorAll('.market-card strong').length===3 && !document.querySelector('.market-card strong').textContent.includes('—')")
   assert page.locator('#chart canvas').count()>0
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,'overflow overview')
   assert page.locator('#readingTrend').inner_text() in ['Alta','Baixa','Neutra']
   assert page.locator('.market-card').first.inner_text().find('USDT')>=0
   if not args.no_screenshots:page.screenshot(path=str(root/f'artifacts/overview-{width}.png'),full_page=True)
   page.locator('.market-card').nth(1).click();assert page.locator('#symbol').input_value()=='ETHUSDT'
   for name in ['analises','observacoes','laboratorio','educacao','configuracoes','overview']:
    if name=='configuracoes' and width<600:page.locator('.settings-shortcut').click()
    else:page.locator('.dashboard-nav [data-route="'+name+'"]').click()
    assert page.locator('[data-view="'+name+'"]').is_visible(),(width,name)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,name,'overflow')
    if name=='observacoes':
     assert 'v5.7' in page.locator('#cloudHorizonResults').inner_text();assert 'direcionais positivos' in page.locator('#cloudHorizonResults').inner_text()
     page.locator('.scanner-details summary').click();assert page.locator('#scanJournal').is_visible()
     if width in [1440,390] and not args.no_screenshots:page.screenshot(path=str(root/f'artifacts/observations-{width}.png'),full_page=True)
    if name=='educacao':
     before=page.locator('#lessonTitle').inner_text();page.locator('#lessonNext').click();assert before!=page.locator('#lessonTitle').inner_text()
     page.locator('#riskMove').fill('2');page.locator('#riskMove').dispatch_event('input');assert '2,0%' in page.locator('#riskMoveLabel').inner_text()
     page.evaluate("setDemoQuote($('symbol').value,200)");page.locator('#demoBuy').click();assert 'Nenhuma' not in page.locator('#demoPosition').inner_text()
     page.locator('#demoSell').click();assert page.locator('#demoPosition').inner_text()=='Nenhuma'
    if name=='configuracoes':
     page.locator('#advancedToggle').click();assert page.locator('#advancedToggle').get_attribute('aria-expanded')=='true'
     page.locator('#cloudAuto').uncheck();assert not page.locator('#cloudAuto').is_checked()
   page.reload(wait_until='networkidle');assert page.locator('[data-view="overview"]').is_visible()
   page.locator('.dashboard-nav [data-route="laboratorio"]').click();page.locator('#runHistory').click();page.wait_for_function("!document.querySelector('#runHistory').disabled")
   assert not errors,errors
   metrics=page.evaluate("({dom:document.querySelectorAll('*').length,transfer:performance.getEntriesByType('resource').reduce((s,x)=>s+x.transferSize,0),paint:performance.getEntriesByType('paint').map(x=>({name:x.name,ms:x.startTime}))})")
   results.append({'width':width,'passed':True,'loadSeconds':round(elapsed,3),'consoleErrors':errors,'metrics':metrics})
   context.close()
  browser.close()
 print(json.dumps(results,ensure_ascii=False,indent=2));(root/('artifacts/compat-browser-results.json' if args.no_screenshots else 'artifacts/browser-results.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2))
finally:server.shutdown()
