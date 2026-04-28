import urllib.request
import urllib.parse
import threading

def worker(i):
    print(f"[{i}] Starting")
    try:
        data = urllib.parse.urlencode({'smiles_str': 'CCCCCC', 'pred_type': 'adme'}).encode('utf-8')
        req = urllib.request.Request('https://biosig.lab.uq.edu.au/pkcsm/admet_prediction', data=data, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            print(f"[{i}] Success: {r.getcode()}")
    except Exception as e:
        print(f"[{i}] Error: {e}")

threads = []
for i in range(5):
    t = threading.Thread(target=worker, args=(i,))
    t.start()
    threads.append(t)

for t in threads:
    t.join()
