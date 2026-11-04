"""Browser archive QA, isolated wallets, recorded real trace only. No live session.
Chromium emulation is not physical iPhone/Safari validation.
"""
import subprocess,os,argparse,functools,http.server,json,pathlib,threading,urllib.request,urllib.parse
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--origin');parser.add_argument('--artifact-prefix',default='v74');args=parser.parse_args()
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
origin=args.origin or f'http://127.0.0.1:{server.server_port}'
manifest=json.loads(subprocess.check_output(['node','scripts/write-build-manifest-v76.mjs'],cwd=root));source=root/'artifacts/v73-prospective.json';journal=json.loads(source.read_text())['data']['journal'];checks=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**({'executable_path':os.environ['RADAR_CHROMIUM']} if os.environ.get('RADAR_CHROMIUM') else {'executable_path':'/usr/bin/chromium'} if pathlib.Path('/usr/bin/chromium').exists() else {}),args=['--no-sandbox'])
  for width in [1440,768,390,375]:
   ctx=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,has_touch=width<600,locale='pt-BR',accept_downloads=True)
   ctx.add_init_script('window.WebSocket=class{close(){}};');page=ctx.new_page();errors=[];market=[];page.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    url=r.request.url
    if 'unpkg.com' in url:r.fulfill(body=(root/'artifacts/lightweight-charts.js').read_bytes(),content_type='application/javascript')
    elif url.endswith('/lab/build.json') and not args.origin:
     r.fulfill(json=manifest)
    elif not url.startswith(origin):
     if 'api.exchange.coinbase.com' in url:market.append(url)
     r.fulfill(status=503,json={'message':'No live market in archive QA'})
    elif args.origin:
     with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'RadarDeMercado/7.4 (+https://github.com/rvc3527-cell/radar-de-mercado)'}),timeout=12) as response:
      body=response.read();relative=urllib.parse.urlsplit(url).path.lstrip('/') or 'index.html';local=root/relative
      if not local.is_file():local=root/'index.html'
      assert body==local.read_bytes(),relative
      r.fulfill(body=body,headers={'content-type':response.headers.get('Content-Type','text/plain')})
    else:r.continue_()
   ctx.route('**/*',route);page.goto(origin+'/#simulacao',wait_until='networkidle');page.wait_for_selector('#paperArchiveFile');count=len(market)
   assert page.locator('#paperState').inner_text()=='Desativado';assert page.locator('#paperArchivePrepare').is_disabled()
   page.locator('.settings-shortcut').click();page.locator('.v7-tool-links [data-route="laboratorio"]').click();page.wait_for_selector('#strategy-lab')
   assert 'não ativa a simulação' in page.locator('#strategy-lab').inner_text();assert page.locator('#labCandidates p').count()==5
   page.locator('#labArchive').set_input_files({'name':'original.json','mimeType':'application/json','buffer':source.read_bytes()});page.wait_for_function("document.getElementById('labResult').textContent.includes('Checksum')");text=page.locator('#labResult').inner_text();assert '1 operações completas' in text;assert 'insuficiente' in text
   page.locator('#labArchive').set_input_files({'name':'broken.json','mimeType':'application/json','buffer':b'{'});page.wait_for_function("document.getElementById('labResult').textContent.includes('bloqueada')")
   page.locator('#labStart').fill('2099-01-01T12:00');page.locator('#labPrepareProtocol').click();page.wait_for_function("document.getElementById('labSaveProtocol').disabled===false")
   with page.expect_download() as download:page.locator('#labSaveProtocol').click()
   data=json.loads(pathlib.Path(download.value.path()).read_text());assert data['strategy']=='ema-observe-v72';assert data['config']['currency']=='USD';assert data['execution']=='supervised-manual-only';assert data['seal']
   assert page.locator('#paperState').inner_text()=='Desativado';assert len(market)==count;assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.locator('#strategy-lab').scroll_into_view_if_needed();page.screenshot(path=str(root/('artifacts/v76-lab-'+str(width)+('-preview.png' if args.origin else '.png'))))
   checks.append({'width':width,'passed':True,'readOnly':True,'codeManifestBound':True,'simulationOff':True,'consoleErrors':errors,'marketCalls':len(market)-count});ctx.close()
  browser.close()
 result={'browser':'Chromium','realIPhone':False,'origin':origin,'checks':checks}
 (root/('artifacts/v76-lab-preview.json' if args.origin else 'artifacts/v76-lab-browser.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
finally:server.shutdown()
