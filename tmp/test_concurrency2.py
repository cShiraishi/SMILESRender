import urllib.request
import urllib.parse
import threading
import http.cookiejar
import re

def _fetch(i):
    print(f"[{i}] Starting ADMETlab")
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        req_init = urllib.request.Request("https://admetlab3.scbdd.com/server/evaluation", headers=headers)
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        with opener.open(req_init, timeout=10) as response:
            html_init = response.read().decode('utf-8')
            match = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html_init)
            csrf = match.group(1) if match else "none"
        print(f"[{i}] CSRF OK, sending POST...")
        params = {"csrfmiddlewaretoken": csrf, "smiles": "CCCCCC", "method": "1"}
        data = urllib.parse.urlencode(params).encode("utf-8")
        req_post = urllib.request.Request("https://admetlab3.scbdd.com/server/evaluationCal", data=data, headers={
            'User-Agent': 'Mozilla/5.0', 'Referer': 'https://admetlab3.scbdd.com/server/evaluation', 'Content-Type': 'application/x-www-form-urlencoded'
        })
        with opener.open(req_post, timeout=10) as response:
            res = response.read()
            print(f"[{i}] Success: len={len(res)}")
    except Exception as e:
        print(f"[{i}] Error: {e}")

threads = []
for i in range(5):
    t = threading.Thread(target=_fetch, args=(i,))
    t.start()
    threads.append(t)

for t in threads:
    t.join()
