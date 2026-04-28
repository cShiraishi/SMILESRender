import urllib.request
import urllib.parse
import http.cookiejar
import re

smiles = 'O=C(OC)c1cc2cc(cnc2s1)Nc1ccccc1'
headers = {'User-Agent': 'Mozilla/5.0'}
req_init = urllib.request.Request('https://admetlab3.scbdd.com/server/evaluation', headers=headers)
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
html = opener.open(req_init).read().decode('utf-8')
csrf = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html).group(1)

params = {'csrfmiddlewaretoken': csrf, 'smiles': smiles, 'method': '1'}
data = urllib.parse.urlencode(params).encode('utf-8')
req_post = urllib.request.Request('https://admetlab3.scbdd.com/server/evaluationCal', data=data, headers={
    'User-Agent': 'Mozilla/5.0', 
    'Referer': 'https://admetlab3.scbdd.com/server/evaluation', 
    'Content-Type': 'application/x-www-form-urlencoded'
})
result = opener.open(req_post).read().decode('utf-8')
print("ADMETLab3 result string:")
print(result[:500])

data_pkcsm = urllib.parse.urlencode({'smiles_str': smiles, 'pred_type': 'adme'}).encode('utf-8')
req_pkcsm = urllib.request.Request('https://biosig.lab.uq.edu.au/pkcsm/admet_prediction', data=data_pkcsm, headers={'User-Agent': 'Mozilla/5.0'})
result2_url = urllib.request.urlopen(req_pkcsm).geturl()
print("pkCSM URL:", result2_url)
