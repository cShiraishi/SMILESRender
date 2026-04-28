import urllib.request, urllib.parse
import time

try:
    data = urllib.parse.urlencode({'smiles_str': 'CCCCCC', 'pred_type': 'adme'}).encode('utf-8')
    req = urllib.request.Request('https://biosig.lab.uq.edu.au/pkcsm/admet_prediction', data=data, headers={'User-Agent': 'Mozilla/5.0'})
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
    
    with opener.open(req, timeout=30) as res:
        url = res.geturl()
    
    print(f"Result URL: {url}")
    
    while True:
        with opener.open(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30) as r:
            html = r.read().decode('utf-8')
            if 'Running' not in html:
                print("Finished")
                # check if there's a table
                if 'table' in html:
                    print("Has table")
                else:
                    print("No table")
                with open("tmp/pkcsm_res.html", "w", encoding='utf-8') as f:
                    f.write(html)
                break
        print("Waiting...")
        time.sleep(2)
        
except Exception as e:
    print(f"Error: {e}")
