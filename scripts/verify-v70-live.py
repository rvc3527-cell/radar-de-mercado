"""Verify published code byte-for-byte, then render actual current HTTP data.
TLS stays validated by curl. WebSocket transport is disabled only in this harness.
"""
import hashlib,json,pathlib,subprocess,time
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
origin='https://radar-de-mercado-preview.rvc3426.workers.dev';base='https://radar-cloud-collector-preview.rvc3426.workers.dev';cache={}
def fetch(url):
 if url not in cache:cache[url]=subprocess.check_output(['curl','--fail-with-body','-sS','--max-time','25',url])
 return cache[url]
assets={}
for f in ['index.html','engine.js','indicators.js','statistics.js','petroleo.css','dashboard.js','intelligence.js','digital.css','opportunity-engine.js','opportunities.js']:
 body=fetch(origin+'/'+f);assert body==(root/f).read_bytes(),f;assets[f]=hashlib.sha256(body).hexdigest()
health=json.loads(fetch(base+'/health'));assert health['version']=='5.7.2' and health['workerOk'];assert json.loads(fetch(base+'/probe'))['mode']=='stored'
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width in [1440,390]:
  ctx=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},device_scale_factor=1,is_mobile=width<600,has_touch=width<600,locale='pt-BR',reduced_motion='reduce')
  ctx.add_init_script('window.WebSocket=class{close(){}};')
  def route(r):
   url=r.request.url
   if not url.startswith('https://'):r.continue_();return
   assert 'api.exchange.coinbase.com' not in url
   body=fetch(url);kind='application/json' if 'collector-preview' in url or 'binance.vision' in url else 'text/css' if '.css' in url else 'application/javascript' if '.js' in url else 'text/html'
   r.fulfill(body=body,content_type=kind,headers={'access-control-allow-origin':origin})
  ctx.route('**/*',route);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin,wait_until='networkidle')
  page.wait_for_function('RadarV70.getAssessments().length===3');assert page.locator('.dashboard-nav a').count()==5;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  readings=page.evaluate('RadarV70.getAssessments()');assert any(x['features'] for x in readings),'No valid current Binance readings'
  assert all(not x['eligible'] for x in readings),'Fresh browser has no v7 cohort, cannot show favorable opportunity'
  page.screenshot(path=str(root/f'artifacts/v70-live-{width}.png'),full_page=False)
  page.locator('.dashboard-nav [data-route="graficos"]').click();assert page.locator('#chart canvas').count()>0;assert page.evaluate('closedCandles().length>=40');assert page.locator('#price').inner_text()!='—'
  page.locator('.dashboard-nav [data-route="observacoes"]').click();page.wait_for_function("!document.getElementById('hiRefresh').disabled && document.getElementById('hiStatistics').textContent.includes('n =')");assert page.locator('#hiHistory tbody tr').count()>0
  assert not errors,errors
  results.append({'width':width,'pageerrors':errors,'readings':readings,'price':page.locator('#price').inner_text(),'closedCandles':page.evaluate('closedCandles().length'),'historyRows':page.locator('#hiHistory tbody tr').count()});ctx.close()
 browser.close()
output={'at':int(time.time()*1000),'assetsSha256':assets,'health':health,'transport':'HTTPS via curl with TLS validation; no WebSocket certification','results':results}
(root/'artifacts/v70-live.json').write_text(json.dumps(output,ensure_ascii=False,indent=2));print(json.dumps({'assetsIdentical':len(assets),'collectorVersion':health['version'],'providerState':health['providerState'],'scheduleDelayed':health['scheduleDelayed'],'checks':[{'width':x['width'],'errors':x['pageerrors'],'closedCandles':x['closedCandles'],'historyRows':x['historyRows']} for x in results]},ensure_ascii=False,indent=2))
