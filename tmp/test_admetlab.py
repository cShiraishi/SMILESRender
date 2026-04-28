import urllib.request
import re
import http.cookiejar

try:
    headers = {'User-Agent': 'Mozilla/5.0'}
    req_init = urllib.request.Request("https://admetlab3.scbdd.com/server/evaluation", headers=headers)

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    csrf_token = ""
    with opener.open(req_init, timeout=30) as response:
        html_init = response.read().decode('utf-8')
        match = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html_init)
        if match:
            csrf_token = match.group(1)
        
    print(f"Token: {csrf_token}")
except Exception as e:
    print(f"Error: {e}")
