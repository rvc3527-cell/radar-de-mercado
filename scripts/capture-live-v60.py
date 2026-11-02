"""Render published assets and current HTTP responses, TLS checked by curl.
The test transport disables WebSocket only in Chromium, without emitting an open event.
"""
import json,pathlib,subprocess,time
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
origin='https://radar-de-mercado-preview.rvc3426.workers.dev'
cache={}
def fetch(url):
 if url not in cache:cache[url]=subprocess.check_output(['curl','-sS','--fail-with-body','--max-time','25',url])
 return cache[url]
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390]:
  ctx=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},device_scale_factor=1,is_mobile=width<600,has_touch=width<600,reduced_motion='reduce')
  ctx.add_init_script('window.WebSocket=class{close(){}};')
  def route(r):
   url=r.request.url
   if not url.startswith('https://'):r.continue_();return
   body=fetch(url);kind='application/json' if '.workers.dev/' in url and 'collector-preview' in url or 'binance.vision' in url else 'text/css' if '.css' in url else 'application/javascript' if '.js' in url else 'text/html'
   r.fulfill(body=body,content_type=kind,headers={'access-control-allow-origin':origin})
  ctx.route('**/*',route);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin,wait_until='networkidle')
  page.locator('.dashboard-nav [data-route="observacoes"]').click();page.wait_for_function("document.getElementById('hiStatus').textContent.includes('Atualizado')")
  assert page.locator('#hiHistory tbody tr').count()>0;assert page.locator('#hiCharts svg').count()>0;assert page.locator('#chart canvas').count()>0;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.evaluate("document.getElementById('inteligencia').scrollIntoView({block:'start'})");page.screenshot(path=str(root/f'artifacts/live-intelligence-{width}.png'),full_page=False)
  assert not errors,errors
  results.append({'width':width,'pageerrors':errors,'historyRows':page.locator('#hiHistory tbody tr').count(),'chartCanvases':page.locator('#chart canvas').count(),'monitor':page.locator('#hiMonitorStatus').inner_text(),'status':page.locator('#hiStatus').inner_text()})
  ctx.close()
 browser.close()
(root/'artifacts/live-intelligence-browser.json').write_text(json.dumps({'at':int(time.time()*1000),'engine':'Chromium','transport':'HTTPS via curl, WebSocket disabled in harness','checks':results},ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
