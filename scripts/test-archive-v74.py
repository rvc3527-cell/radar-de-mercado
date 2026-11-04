"""Browser archive QA, isolated wallets, recorded real trace only. No live session.
Chromium emulation is not physical iPhone/Safari validation.
"""
import os,argparse,functools,http.server,json,pathlib,threading,urllib.request,urllib.parse
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--origin');parser.add_argument('--artifact-prefix',default='v74');args=parser.parse_args()
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
origin=args.origin or f'http://127.0.0.1:{server.server_port}'
source=root/'artifacts/v73-prospective.json';journal=json.loads(source.read_text())['data']['journal'];checks=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**({'executable_path':os.environ['RADAR_CHROMIUM']} if os.environ.get('RADAR_CHROMIUM') else {'executable_path':'/usr/bin/chromium'} if pathlib.Path('/usr/bin/chromium').exists() else {}),args=['--no-sandbox'])
  for width in [1440,768,390,375]:
   ctx=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,has_touch=width<600,locale='pt-BR',accept_downloads=True)
   ctx.add_init_script('window.WebSocket=class{close(){}};');page=ctx.new_page();errors=[];market=[];page.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    url=r.request.url
    if 'unpkg.com' in url:r.fulfill(body=(root/'artifacts/lightweight-charts.js').read_bytes(),content_type='application/javascript')
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
   def choose(body,name='archive.json'):
    page.locator('#paperArchiveFile').set_input_files({'name':name,'mimeType':'application/json','buffer':body})
    page.wait_for_function("document.getElementById('paperArchiveConfirm').disabled===false")
   def restore():
    assert page.locator('#paperArchiveImport').is_disabled();page.locator('#paperArchiveConfirm').check();page.locator('#paperArchiveImport').click();page.wait_for_function("document.getElementById('paperArchiveFile').disabled===false")
    assert page.locator('#paperState').inner_text()=='Desativado';assert page.locator('#paperStart').is_disabled()
   choose(source.read_bytes(),'v73-original.json');restore();assert page.locator('#paperCash').inner_text()!='Não carregado'
   page.locator('#paperArchivePrepare').click();page.wait_for_function("document.getElementById('paperArchiveSave').disabled===false")
   assert 'Isso não libera espaço' in page.locator('#paperArchiveStatus').inner_text()
   with page.expect_download() as download:page.locator('#paperArchiveSave').click()
   exported=pathlib.Path(download.value.path()).read_bytes();a=json.loads(exported);assert a['journal']==journal;assert a['manifest']['eventCount']==journal['version']
   assert 'não consegue confirmar' in page.locator('#paperArchiveStatus').inner_text()
   choose(exported);restore();assert 'nenhum evento ou saldo foi duplicado' in page.locator('#paperArchiveStatus').inner_text()
   page.locator('#paperArchiveFile').set_input_files({'name':'incomplete.json','mimeType':'application/json','buffer':exported[:-24]});page.wait_for_function("document.getElementById('paperArchiveStatus').textContent.includes('incompleto')")
   assert page.locator('#paperArchiveImport').is_disabled();assert page.locator('#paperArchiveConfirm').is_disabled()
   # Actual browser transaction abort must not leave a partial extension.
   native=page.evaluate('''async j=>{const {IndexedDBPaperStore,MemoryPaperStore}=await import('/paper/store.js');const {PaperTradingEngine}=await import('/paper/engine.js');const {createArchive,inspectArchive,restoreArchive}=await import('/paper/archive.js');const dbName='v74-native-'+crypto.randomUUID(),s=new IndexedDBPaperStore({name:dbName}),old=await inspectArchive(await createArchive(j));await restoreArchive(s,old,{confirmed:true});const mem=new MemoryPaperStore(JSON.stringify([[j.walletId,j]])),e=await PaperTradingEngine.open({walletId:j.walletId,store:mem});await e.recordNote({id:'qa-extension',kind:'SESSION_END',details:'{}'});const latest=await inspectArchive(await createArchive(await e.exportJournal()));const put=IDBObjectStore.prototype.put;let caught;try{IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);this.transaction.abort();return r};await restoreArchive(s,latest,{confirmed:true})}catch(error){caught=error.code}finally{IDBObjectStore.prototype.put=put}if(caught!=='ARCHIVE_WRITE_UNCONFIRMED')throw Error('abort not blocked '+caught);if(JSON.stringify(await s.read(j.walletId))!==JSON.stringify(j))throw Error('partial import');await restoreArchive(s,latest,{confirmed:true});const result=await restoreArchive(s,latest,{confirmed:true});await s.close();indexedDB.deleteDatabase(dbName);return {abortPreserved:true,retryIdempotent:result.status==='unchanged'}}''',journal)
   assert native['retryIdempotent']
   # Recreate a fresh, empty browser wallet and restore the full downloaded archive.
   page.evaluate('''async()=>{const {IndexedDBPaperStore}=await import('/paper/store.js');const s=new IndexedDBPaperStore();const db=await s.database();await new Promise((resolve,reject)=>{const tx=db.transaction('wallets','readwrite');tx.objectStore('wallets').clear();tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});await s.close()}''')
   # QA isolation only: clears this newly-created test profile, never a user wallet.
   page.reload(wait_until='networkidle');choose(exported);restore()
   actual=page.evaluate('''async()=>{const {IndexedDBPaperStore}=await import('/paper/store.js');const s=new IndexedDBPaperStore(),j=await s.read('supervised-btc-usd-v72');await s.close();return j}''');assert actual==journal
   page.locator('#paperArchivePrepare').click();page.wait_for_function("document.getElementById('paperArchiveSave').disabled===false")
   # Canceled native share keeps the verified prepared file; call stays in tap gesture.
   page.evaluate("Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{window.shareGesture=navigator.userActivation.isActive;throw new DOMException('cancel','AbortError')}})")
   page.locator('#paperArchiveSave').click();page.wait_for_function("document.getElementById('paperArchiveStatus').textContent.includes('cancelado')");assert page.evaluate('window.shareGesture') is True;assert page.locator('#paperArchiveSave').is_enabled()
   page.screenshot(path=str(root/('artifacts/'+args.artifact_prefix+'-archive-'+str(width)+('-preview.png' if args.origin else '.png'))))
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert len(market)==count;assert not errors,errors
   checks.append({'width':width,'passed':True,'originalJournalChecksum':journal['checksum'],'events':journal['version'],'liveMarketCallsFromArchive':len(market)-count,'incompleteRejected':True,'restoredOff':True,'duplicateUnchanged':True,'nativeIDB':native,'shareCanceledGesture':True,'pageErrors':errors});ctx.close()
  browser.close()
 result={'browser':'Chromium','realSafari':False,'mode':'read-only recorded v7.3 evidence, no prospective run','origin':origin,'checks':checks}
 (root/('artifacts/'+args.artifact_prefix+'-archive-preview.json' if args.origin else 'artifacts/'+args.artifact_prefix+'-archive-browser.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
finally:server.shutdown()
