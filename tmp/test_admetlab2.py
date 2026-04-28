import urllib.request
import urllib.parse
import http.cookiejar
import re
import traceback

smiles_list = [
    'O=C(OC)c1cc2cc(cnc2s1)Nc1ccccc1F',
    'COC(=O)c1cc2cc(cnc2s1)Nc1cc(ccc1)OC',
    'COC(=O)c1cc2cc(cnc2s1)Nc1ccc(cc1OC)OC',
    'COC(=O)c1cc2cc(cnc2s1)Nc1cc(cc(c1)OC)OC'
]

headers = {'User-Agent': 'Mozilla/5.0'}
for smiles in smiles_list:
    try:
        req_init = urllib.request.Request('https://admetlab3.scbdd.com/server/evaluation', headers=headers)
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        html = opener.open(req_init, timeout=10).read().decode('utf-8')
        match = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html)
        if not match:
            print(f"[{smiles}] failed to get csrf")
            continue
        csrf = match.group(1)

        params = {'csrfmiddlewaretoken': csrf, 'smiles': smiles, 'method': '1'}
        data = urllib.parse.urlencode(params).encode('utf-8')
        req_post = urllib.request.Request('https://admetlab3.scbdd.com/server/evaluationCal', data=data, headers={
            'User-Agent': 'Mozilla/5.0', 
            'Referer': 'https://admetlab3.scbdd.com/server/evaluation', 
            'Content-Type': 'application/x-www-form-urlencoded'
        })
        result = opener.open(req_post, timeout=10).read().decode('utf-8')
        if "Something error in your uploaded file and/or molecules" in result or "error" in result.lower():
            print(f"[{smiles}] ADMETLAB error response: {result[:100]}")
        else:
            print(f"[{smiles}] SUCCESS! length: {len(result)}")
    except Exception as e:
        print(f"[{smiles}] Exception: {e}")

