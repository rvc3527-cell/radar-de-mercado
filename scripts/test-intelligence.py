"""Chromium integration, real captured market data + actual SQLite API handlers.
--origin validates a deployed Preview UI with the same deterministic fixtures.
Does not certify real Safari or a currently available market source.
"""
import argparse,functools,http.server,json,pathlib,subprocess,threading,time,urllib.request
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--origin');args=parser.parse_args()
snapshot=json.loads((root/'artifacts/market-snapshot.json').read_text())
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
api=subprocess.Popen(['node','scripts/serve-history-fixture.mjs'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE);assert b'8766' in api.stdout.readline()
origin=args.origin or f'http://127.0.0.1:{server.server_port}'
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,768,390,375]:
   ctx=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},device_scale_factor=1,is_mobile=width<600,has_touch=width<600,reduced_motion='reduce')
   ctx.add_init_script('Date.now=()=>'+str(snapshot['at'])+';window.WebSocket=class{constructor(){queueMicrotask(()=>this.onopen?.())}close(){}};')
   requests=[];mode={'error':False}
   def route(r):
    url=r.request.url
    if 'unpkg.com' in url:r.fulfill(body=(root/'artifacts/lightweight-charts.js').read_text(),content_type='application/javascript')
    elif 'binance.vision' in url:r.fulfill(json=snapshot['binance'][next((s for s in snapshot['binance'] if s in url),'BTCUSDT')])
    elif 'radar-cloud-collector-preview' in url:
     if any('/'+name in url for name in ['history','statistics','collector-history']):
      requests.append(url)
      if mode['error']:r.fulfill(status=503,json={'error':{'message':'Histórico indisponível. Tente novamente.'}})
      else:
       path=url.split('.workers.dev',1)[1]
       with urllib.request.urlopen('http://127.0.0.1:8766'+path) as response:r.fulfill(body=response.read(),content_type='application/json')
     else:r.fulfill(json=snapshot['health'] if '/health' in url else {'checks':[]} if '/probe' in url else snapshot['observations'])
    else:r.continue_()
   ctx.route('**/*',route);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   begin=time.monotonic();page.goto(origin,wait_until='networkidle');assert page.locator('#chart canvas').count()>0
   assert not requests,'API histórica deve carregar somente ao abrir a seção'
   page.locator('.dashboard-nav [data-route="observacoes"]').click();page.wait_for_function("!document.getElementById('hiRefresh').disabled && document.getElementById('hiStatistics').textContent.includes('n =')")
   assert 'Atualizado' in page.locator('#hiStatus').inner_text();assert page.locator('#hiHistory tbody tr').count()==25;assert page.locator('#hiCharts svg').count()>0
   assert page.locator('#hiMonitoring tbody tr').count()==3
   first=page.locator('#hiHistory tbody tr').first.inner_text();page.locator('#hiNext').click();page.wait_for_function("document.getElementById('hiPageStatus').textContent.includes('página 2')");assert first!=page.locator('#hiHistory tbody tr').first.inner_text()
   page.locator('#hiPrevious').click();page.wait_for_function("document.getElementById('hiPageStatus').textContent.includes('página 1')");assert first==page.locator('#hiHistory tbody tr').first.inner_text()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,'overflow')
   page.locator('#hiSymbol').select_option('ETHUSD');page.locator('#hiHorizon').select_option('3');page.locator('#hiCost').fill('0.3');page.locator('#hiRefresh').click();page.wait_for_function("!document.getElementById('hiRefresh').disabled");assert page.locator('#hiStatistics tbody tr').count()==1;assert '0,300%' in page.locator('#hiStatistics').inner_text()
   assert page.locator('#hiHistory tbody tr').count()>0;assert 'ETH/USD' in page.locator('#hiHistory').inner_text();assert '1 min:' not in page.locator('#hiHistory').inner_text()
   page.locator('#hiSymbol').select_option('');page.locator('#hiHorizon').select_option('');page.locator('#hiCost').fill('0.2');page.locator('#hiRefresh').click();page.wait_for_function("!document.getElementById('hiRefresh').disabled")
   page.evaluate("document.getElementById('inteligencia').scrollIntoView({block:'start'})");page.screenshot(path=str(root/f'artifacts/intelligence-{width}.png'),full_page=False)
   if width in [1440,390]:
    page.evaluate("document.getElementById('hiCharts').scrollIntoView({block:'start'})");page.screenshot(path=str(root/f'artifacts/intelligence-charts-{width}.png'),full_page=False)
   page.locator('#hiFrom').fill('2020-01-01');page.locator('#hiTo').fill('2020-01-02');page.locator('#hiRefresh').click();page.wait_for_function("!document.getElementById('hiRefresh').disabled");assert 'Não há registros' in page.locator('#hiStatistics').inner_text();assert not page.locator('#hiNext').is_enabled()
   mode['error']=True;page.locator('#hiRefresh').click();page.wait_for_function("!document.getElementById('hiRefresh').disabled");assert 'Atualização parcial' in page.locator('#hiStatus').inner_text();assert 'indisponíveis' in page.locator('#hiStatistics').inner_text();assert page.locator('#hiHistory tbody tr').count()==0
   for name in ['analises','laboratorio','educacao','overview']:
    page.locator('.dashboard-nav [data-route="'+name+'"]').click();assert page.locator('[data-view="'+name+'"]').is_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert page.locator('#chart canvas').count()>0;assert not errors,errors
   metrics=page.evaluate("({nodes:document.querySelectorAll('*').length,paint:performance.getEntriesByType('paint').map(x=>({name:x.name,ms:x.startTime})),transfer:performance.getEntriesByType('resource').reduce((s,x)=>s+x.transferSize,0)})")
   results.append({'width':width,'passed':True,'seconds':round(time.monotonic()-begin,2),'errors':errors,'historyRequests':len(requests),'metrics':metrics});ctx.close()
  browser.close()
 (root/'artifacts/intelligence-browser.json').write_text(json.dumps({'engine':'Chromium','snapshotAt':snapshot['at'],'origin':origin,'checks':results},ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
finally:api.terminate();api.wait();server.shutdown()
