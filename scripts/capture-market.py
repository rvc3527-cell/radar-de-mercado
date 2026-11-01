"""Capture read-only market responses for reproducible browser checks (curl validates TLS)."""
import pathlib,subprocess,json,time
root=pathlib.Path(__file__).resolve().parent.parent;directory=root/'artifacts';directory.mkdir(exist_ok=True)
def fetch(url):return subprocess.check_output(['curl','-fsS','--max-time','25',url])
data={'at':int(time.time()*1000),'binance':{}}
for symbol in ['BTCUSDT','ETHUSDT','SOLUSDT']:data['binance'][symbol]=json.loads(fetch('https://data-api.binance.vision/api/v3/klines?symbol='+symbol+'&interval=1m&limit=120'))
for path in ['health','observations']:data[path]=json.loads(fetch('https://radar-cloud-collector-preview.rvc3426.workers.dev/'+path))
(directory/'market-snapshot.json').write_text(json.dumps(data))
(directory/'lightweight-charts.js').write_bytes(fetch('https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js'))
print('Market snapshot captured:',data['at'])
