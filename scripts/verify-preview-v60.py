"""Read-only public verification. TLS verified by curl. No Coinbase/probe active calls."""
import json,pathlib,subprocess,time,urllib.parse,statistics,math,hashlib
root=pathlib.Path(__file__).resolve().parent.parent
site='https://radar-de-mercado-preview.rvc3426.workers.dev';collector='https://radar-cloud-collector-preview.rvc3426.workers.dev'
def fetch(url):return subprocess.check_output(['curl','--fail-with-body','-sS','--max-time','25',url])
def get(path,params=None):return json.loads(fetch(collector+path+('?' + urllib.parse.urlencode(params) if params else '')))
assets={}
for f in ['index.html','indicators.js','statistics.js','engine.js','dashboard.js','intelligence.js','petroleo.css']:
 remote=fetch(site+'/'+f);local=(root/f).read_bytes();assert remote==local,f;assets[f]=hashlib.sha256(remote).hexdigest()
now=int(time.time()*1000);params={'from':now-7*86400000,'to':now-30*60000,'methodology':'v5.7','limit':25}
items=[];cursor=None;pages=0
while True:
 d=get('/history',{**params,**({'cursor':cursor} if cursor else {})});items.extend(d['items']);pages+=1;cursor=d['next_cursor'];assert pages<100
 if not cursor:break
assert len(items)==d['total'];assert len({(x['time'],x['symbol']) for x in items})==len(items)
s=get('/statistics',params);assert s['totals']['observations']==len(items)
for g in s['groups']:
 rows=sorted([x for x in items if x['symbol']==g['symbol']],key=lambda x:x['time']);selected=[];end=-math.inf
 for x in rows:
  if x['time']>=end:selected.append(x);end=x['time']+g['horizon']*60000
 values=[x['results'][str(g['horizon'])] for x in selected if str(g['horizon']) in x['results']]
 assert g['evaluated']==len(values);assert g['pending']==len(selected)-len(values)
 if values:
  assert abs(g['mean_gross']-statistics.mean(values))<1e-10
  assert abs(g['median_gross']-statistics.median(values))<1e-10
  assert abs(g['mean_net']-(statistics.mean(values)-.2))<1e-10
  assert g['favorable']==sum(v>0 for v in values)
health=get('/health');probe=get('/probe');assert health['version']=='5.7.2';assert probe['mode']=='stored';assert health['workerOk']
monitor=get('/collector-history',{'from':now-86400000,'to':now});assert len(monitor['assets'])==3
output={'verifiedAt':now,'assetsSha256':assets,'history':{'observations':len(items),'pages':pages,'methodology':'v5.7','range':params},'statistics':'Compared with independent Python mean/median/counts for all asset/horizon groups','health':health,'monitoring':monitor,'probeMode':probe['mode']}
(root/'artifacts/live-intelligence.json').write_text(json.dumps(output,ensure_ascii=False,indent=2));print(json.dumps({'assetsIdentical':len(assets),'historyCount':len(items),'pages':pages,'provider':health['providerState'],'scheduleDelayed':health['scheduleDelayed'],'lastRun':health['last_run']['started_at'],'monitorExpected':monitor['expected_slots']},ensure_ascii=False,indent=2))
