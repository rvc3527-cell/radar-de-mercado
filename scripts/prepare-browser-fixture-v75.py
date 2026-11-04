"""QA only. Fetch the already-used pinned chart library, never market data."""
import hashlib,pathlib,urllib.request
url='https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js'
with urllib.request.urlopen(url,timeout=30) as response:data=response.read(1048576)
assert hashlib.sha256(data).hexdigest()=='c7dda807d662a95b3d257119ed315cec669e3bdf5aaece75c480a39307f23540','Unexpected chart library bytes'
pathlib.Path('artifacts').mkdir(exist_ok=True)
pathlib.Path('artifacts/lightweight-charts.js').write_bytes(data)
print('Pinned existing chart library verified. No market data requested.')
