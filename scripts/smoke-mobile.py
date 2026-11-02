"""Optional local UI check. Requires Playwright and a browser; no live API writes.
python scripts/smoke-mobile.py --browser chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/radar-playwright python scripts/smoke-mobile.py --browser webkit
Market data and chart library are isolated fixtures, so this is not a live market test.
"""
import argparse, functools, http.server, json, math, pathlib, threading
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser();parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium');args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
now=1800000010000;end=1800000000000
raw=[[end-(180-i)*60000,100,110,90,100+math.sin(i/4),1] for i in range(180)]
legacy={'symbol':'BTCUSDT','time':end-600000,'entry':100,'direction':1,'results':{'1':99,'3':99,'5':99}}
remote={'at':now,'methodologyReady':True,'observations':[{'symbol':'BTCUSD','time':end-60000,'horizon':1,'directional_pct':1,'methodology_version':None},{'symbol':'BTCUSD','time':end,'horizon':1,'directional_pct':10,'methodology_version':'v5.7'}]}
chart="window.LightweightCharts={createChart:()=>({addCandlestickSeries:()=>({setData(){},update(){}}),addLineSeries:()=>({setData(){}}),applyOptions(){},timeScale:()=>({fitContent(){}})})};"
try:
 with sync_playwright() as p:
  browser=getattr(p,args.browser).launch(**({'executable_path':'/usr/bin/chromium','args':['--no-sandbox']} if args.browser=='chromium' else {}))
  context=browser.new_context(**p.devices['iPhone 13'])
  context.add_init_script("Date.now=()=>1800000010000;window.WebSocket=class{constructor(){queueMicrotask(()=>this.onopen?.())}close(){}};localStorage.setItem('radar-observations-v1',"+json.dumps(json.dumps([legacy]))+");")
  def routes(route):
   url=route.request.url
   if 'unpkg.com' in url:route.fulfill(body=chart,content_type='application/javascript')
   elif 'binance.vision' in url:route.fulfill(json=raw)
   elif 'radar-cloud-collector-preview' in url:
    if any('/'+name in url for name in ['history','statistics','collector-history']):route.fulfill(status=503,json={'error':{'message':'Histórico indisponível no cenário legado'}})
    elif '/observations' in url:route.fulfill(json=remote)
    elif '/health' in url:route.fulfill(json={'last_run':{'started_at':now,'report':'[]'},'methodology_version':'v5.7','scheduleDelayed':False})
    else:route.fulfill(json={'checks':[]})
   else:route.continue_()
  context.route('**/*',routes);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle')
  page.wait_for_function("document.querySelector('#scanStatus').textContent.includes('concluída')")
  page.locator('.dashboard-nav [data-route="observacoes"]').tap()
  assert page.locator('#methodologyInfo').is_visible()
  assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Horizontal overflow'
  text=page.locator('#cloudHorizonResults').inner_text()
  assert 'Anterior — versão não comprovada' in text and 'v5.7' in text and '0.8000%' in text and '9.8000%' in text and 'amostra insuficiente' in text
  assert 'Consulta:' in page.locator('#cloudUpdated').inner_text()
  assert page.evaluate('typeof RadarIndicators.ema')=='function'
  data=json.loads(page.evaluate("localStorage.getItem('radar-observations-v1')"))
  assert next(x for x in data if x['time']==legacy['time'])==legacy
  assert any(x.get('methodology_version')=='v5.7' for x in data)
  page.locator('.settings-shortcut').tap();page.locator('#advancedToggle').tap();page.locator('.v7-tool-links [data-route="laboratorio"]').tap();assert page.locator('#laboratorio').is_visible()
  assert not errors,errors
  page.screenshot(path=f'/tmp/radar-v57-{args.browser}-mobile.png',full_page=True)
  print(json.dumps({'browser':args.browser,'device':'iPhone 13 emulation','checks':9,'passed':9,'failed':0,'page_errors':errors,'screenshot':f'/tmp/radar-v57-{args.browser}-mobile.png'},ensure_ascii=False))
  browser.close()
finally:server.shutdown()
