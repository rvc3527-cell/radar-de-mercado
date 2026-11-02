"""V7 UI integration: real captured candles, actual F6 SQLite handlers, no live Coinbase.
Chromium emulation is not a real Safari certification. --origin supports the Preview.
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
origin=args.origin or f'http://127.0.0.1:{server.server_port}';results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width in [1440,768,390,375]:
   ctx=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},device_scale_factor=1,is_mobile=width<600,has_touch=width<600,locale='pt-BR',reduced_motion='reduce')
   ctx.add_init_script('window.__v7Now='+str(snapshot['at'])+';Date.now=()=>window.__v7Now;window.WebSocket=class{constructor(){queueMicrotask(()=>this.onopen?.())}close(){}};')
   modes={'offline':False,'history':False};requests=[]
   def route(r):
    url=r.request.url;requests.append(url)
    if 'unpkg.com' in url:r.fulfill(body=(root/'artifacts/lightweight-charts.js').read_text(),content_type='application/javascript')
    elif 'binance.vision' in url:
     if modes['offline']:r.fulfill(status=503,json={'message':'Fixture: API unavailable'})
     else:r.fulfill(json=snapshot['binance'][next((s for s in snapshot['binance'] if s in url),'BTCUSDT')])
    elif 'radar-cloud-collector-preview' in url:
     if any('/'+name in url for name in ['history','statistics','collector-history']):
      if modes['history']:r.fulfill(status=503,json={'error':{'message':'Histórico indisponível'}})
      else:
       with urllib.request.urlopen('http://127.0.0.1:8766'+url.split('.workers.dev',1)[1]) as response:r.fulfill(body=response.read(),content_type='application/json')
     else:r.fulfill(json=snapshot['health'] if '/health' in url else {'checks':[]} if '/probe' in url else snapshot['observations'])
    elif 'api.exchange.coinbase.com' in url:raise AssertionError('Browser must not query Coinbase')
    else:r.continue_()
   ctx.route('**/*',route);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));start=time.monotonic();page.goto(origin,wait_until='networkidle')
   page.wait_for_function('RadarV70.getAssessments().length===3')
   assert page.locator('[data-view="overview"]').is_visible();assert page.locator('.dashboard-nav a').count()==5
   assert 'Nenhuma oportunidade suficientemente confirmada' in page.locator('#v7HeroReason').inner_text()
   assert page.locator('#v7Watchlist .v7-watch-row').count()==3;assert 'USDT' in page.locator('#v7Watchlist').inner_text()
   assert page.evaluate('RadarV70.getAssessments().some(x=>x.features!==null)')
   assert 'Tempo de operação ainda não validado.' in page.locator('#v7Plan').inner_text()
   assert not page.locator('#v7Technical').evaluate('(x)=>x.open')
   text=page.locator('[data-view="overview"]').inner_text();assert 'RSI 14:' not in text and 'EMA 9:' not in text and 'ENTRAR AGORA' not in text
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
   assert not any('/statistics?' in u for u in requests),'F6 should remain lazy'
   page.screenshot(path=str(root/f'artifacts/v70-opportunities-{width}.png'),full_page=False)
   if width in [1440,390]:
    page.locator('.v7-secondary-grid').scroll_into_view_if_needed();page.screenshot(path=str(root/f'artifacts/v70-analysis-{width}.png'),full_page=False)
   page.locator('#v7Understand').click();assert page.locator('#v7Technical').evaluate('(x)=>x.open');assert 'v7.0-observe-1' in page.locator('#v7Technical').inner_text()
   # The first 30 seconds of a closed minute make the record prospective for every horizon.
   ref=page.evaluate('Math.max(...RadarV70.getAssessments().map(x=>x.reference_time||0))')
   page.evaluate(f'window.__v7Now={ref}+10000;RadarV70.refresh()')
   old=page.evaluate("localStorage.getItem('radar-observations-v1')")
   if page.locator('#v7Record').is_enabled():
    page.locator('#v7Record').click();page.locator('#v7Record').click();assert page.evaluate('RadarV70.getRecords().length')==1
    assert page.evaluate("localStorage.getItem('radar-observations-v1')")==old
    with page.expect_download() as download:page.locator('#v7Export').click()
    data=json.loads(download.value.path().read_text());assert data['policy']=='v7.0-observe-1';assert len(data['records'])==1
   for name in ['analises','graficos','observacoes','educacao','overview']:
    page.locator('.dashboard-nav [data-route="'+name+'"]').click();assert page.locator('[data-view="'+name+'"]').is_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,name)
    if name=='graficos':assert page.locator('#chart canvas').count()>0;assert page.locator('#ema9').inner_text()!='—'
    if name=='observacoes':
     page.wait_for_function("!document.getElementById('hiRefresh').disabled && document.getElementById('hiStatistics').textContent.includes('n =')")
     assert page.locator('#hiHistory tbody tr').count()==25;assert 'Coinbase' in page.locator('#hiHistory').inner_text()
    if name=='educacao':
     before=page.locator('#lessonTitle').inner_text();page.locator('#lessonNext').click();assert before!=page.locator('#lessonTitle').inner_text()
     page.evaluate("setDemoQuote($('symbol').value,200)");page.locator('#demoBuy').click();page.locator('#demoSell').click();assert page.locator('#demoPosition').inner_text()=='Nenhuma'
   page.locator('.settings-shortcut').click();assert page.locator('#cloud-monitor').is_visible();page.locator('.v7-tool-links [data-route="laboratorio"]').click();assert page.locator('#laboratorio').is_visible()
   page.locator('.dashboard-nav [data-route="overview"]').click()
   # Repaint from the same cache ages into a hard data block without another request.
   n=len(requests);page.evaluate('window.__v7Now+=180000;RadarV70.refresh()');assert page.evaluate('RadarV70.getAssessments().every(x=>!x.eligible)');assert 'DADOS INSUFICIENTES' in page.locator('#v7Status').inner_text();assert len(requests)==n
   modes['offline']=True;page.locator('#v7Refresh').click();page.wait_for_function("!document.getElementById('v7Refresh').disabled");assert page.evaluate('RadarV70.getAssessments().every(x=>!x.eligible)')
   assert not errors,errors
   metrics=page.evaluate("({nodes:document.querySelectorAll('*').length,paint:performance.getEntriesByType('paint').map(x=>({name:x.name,ms:x.startTime})),transfer:performance.getEntriesByType('resource').reduce((s,x)=>s+x.transferSize,0)})")
   results.append({'width':width,'passed':True,'seconds':round(time.monotonic()-start,2),'pageerrors':errors,'coinbaseBrowserRequests':sum('api.exchange.coinbase.com' in u for u in requests),'metrics':metrics});ctx.close()
  browser.close()
 (root/'artifacts/v70-browser.json').write_text(json.dumps({'engine':'Chromium','origin':origin,'snapshotAt':snapshot['at'],'results':results},ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
finally:api.terminate();api.wait();server.shutdown()
