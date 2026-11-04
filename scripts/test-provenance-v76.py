"""Synthetic UI E2E, isolated wallets, no real market calls and no physical iPhone."""
import argparse,datetime,functools,hashlib,http.server,json,math,os,pathlib,subprocess,threading
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
manifest=json.loads(subprocess.check_output(['node','scripts/write-build-manifest-v76.mjs'],cwd=root))
# QA replacements are declared and hashed, never presented as prospectively real.
panel=(root/'paper/panel.js').read_text().replace("origin:'prospective-real'","origin:'synthetic'")
lab=(root/'lab/panel.js').read_text().replace("protocolId:'v76:'","origin:'synthetic',protocolId:'v76:'")
manifest['paper/panel.js']=hashlib.sha256(panel.encode()).hexdigest();manifest['lab/panel.js']=hashlib.sha256(lab.encode()).hexdigest()
T=1793793600000;checks=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**({'executable_path':os.environ['RADAR_CHROMIUM']} if os.environ.get('RADAR_CHROMIUM') else {'executable_path':'/usr/bin/chromium'} if pathlib.Path('/usr/bin/chromium').exists() else {}),args=['--no-sandbox'])
  for width in [1440,768,390,375]:
   context=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,has_touch=width<600,locale='pt-BR',timezone_id='UTC',accept_downloads=True)
   context.add_init_script('window.__qaNow=Number(localStorage.getItem("qa-v76-clock")||'+str(T)+');Date.now=()=>window.__qaNow;window.WebSocket=class{close(){}};');page=context.new_page();errors=[];market=[];page.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    url=r.request.url
    if 'unpkg.com' in url:r.fulfill(body=(root/'artifacts/lightweight-charts.js').read_bytes(),content_type='application/javascript')
    elif url.endswith('/paper/panel.js'):r.fulfill(body=panel,content_type='application/javascript')
    elif url.endswith('/lab/panel.js'):r.fulfill(body=lab,content_type='application/javascript')
    elif url.endswith('/lab/build.json'):r.fulfill(json=manifest)
    elif 'api.exchange.coinbase.com' in url:
     market.append(url);now=page.evaluate('Date.now()')
     if '/book?' in url:r.fulfill(json={'auction_mode':False,'auction':None,'sequence':now,'time':datetime.datetime.fromtimestamp((now-500)/1000,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),'bids':[['100.3','100',1]],'asks':[['100.31','100',1]]})
     else:
      end=(now-5000)//60000*60;rows=[]
      for i in range(60):
       c=100+i*.005+math.sin((i+5)*math.pi/4)*.04;rows.append([end-(60-i)*60,c-.02,c+.02,c,c,1])
      r.fulfill(json=rows[::-1])
    elif not url.startswith(origin):r.fulfill(status=503,json={'message':'QA no external market'})
    else:r.continue_()
   context.route('**/*',route);page.goto(origin+'/#laboratorio',wait_until='networkidle');page.wait_for_selector('#labPrepareProtocol')
   assert not market;assert page.locator('#paperState').inner_text()=='Desativado'
   planned=T+60000;start=datetime.datetime.fromtimestamp(planned/1000,datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M');page.locator('#labStart').fill(start);page.locator('#labPrepareProtocol').click();page.wait_for_function("!document.getElementById('labSaveProtocol').disabled")
   with page.expect_download() as download:page.locator('#labSaveProtocol').click()
   protocol=pathlib.Path(download.value.path()).read_bytes();parsed=json.loads(protocol);assert parsed['format']=='radar-protocol-v76';assert parsed['origin']=='synthetic'
   page.evaluate("location.hash='simulacao';showDashboardRoute('simulacao')");page.locator('#paperProtocolFile').set_input_files({'name':'protocol.json','mimeType':'application/json','buffer':protocol});page.wait_for_function("document.getElementById('paperProtocolStatus').textContent.includes('selecionado')")
   assert not market;assert page.locator('#paperState').inner_text()=='Desativado';page.evaluate('(n)=>{window.__qaNow=n;localStorage.setItem("qa-v76-clock",String(n))}',planned);page.locator('#paperPrepare').click();page.wait_for_function("document.getElementById('paperState').textContent==='Pronto para simulação'")
   assert page.locator('#paperStart').is_disabled();page.locator('#paperConsent').check();page.locator('#paperStart').click();page.wait_for_function("document.getElementById('paperState').textContent==='Simulando'")
   page.locator('#paperEnd').click();page.wait_for_function("document.getElementById('paperState').textContent==='Encerrado'")
   with page.expect_download() as download:page.locator('#paperExport').click()
   data=json.loads(pathlib.Path(download.value.path()).read_text());j=data['journal'];note=next(json.loads(e['command']['payload']['details']) for e in j['events'] if e['command']['payload'].get('kind')=='SESSION_START');b=note['provenance'];assert b['manifestSha256']==parsed['seal'];assert b['protocolId']==parsed['protocolId'];assert b['executedCodeHashes']==manifest;assert b['independentAnteriority'] is False;assert note['origin']=='synthetic';assert b['window']==parsed['windows']['final'];assert note['endsAt']==parsed['windows']['final'][1]
   calls=len(market);page.reload(wait_until='networkidle');page.locator('#paperRestore').click();page.wait_for_function("document.getElementById('paperCash').textContent!=='Não carregado'");assert page.locator('#paperState').inner_text()=='Desativado';assert len(market)==calls
   if any(e['decision'].get('accounting',{}).get('executions') for e in j['events']):assert 'posições fictícias abertas' in page.locator('#paperResidual').inner_text()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors;page.locator('#paperProtocolFile').scroll_into_view_if_needed();page.screenshot(path=str(root/f'artifacts/v76-provenance-{width}.png'))
   checks.append({'width':width,'passed':True,'fixtureOrigin':'synthetic','protocolLinked':True,'clientClockNotIndependent':True,'scheduledWindowUnchanged':True,'reloadOff':True,'marketCallsMocked':calls,'pageErrors':errors});context.close()
  browser.close()
 (root/'artifacts/v76-provenance-browser.json').write_text(json.dumps({'browser':'Chromium','physicalIPhone':False,'checks':checks},ensure_ascii=False,indent=2));print(json.dumps(checks,ensure_ascii=False,indent=2))
finally:server.shutdown()
