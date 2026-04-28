import urllib.request
import urllib.parse
import http.cookiejar

def test_swissadme_with_session(smiles_smi):
    try:
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        # 1. Visit index to get cookies
        print("Step 1: Visiting index page...")
        req_index = urllib.request.Request("https://www.swissadme.ch/index.php", headers=headers)
        opener.open(req_index, timeout=30)
        
        # 2. POST submission
        print(f"Step 2: Submitting SMILES: {smiles_smi}")
        payload = {
            "smiles": smiles_smi,
            "ioi": "",
            "organism": "Homo_sapiens"
        }
        data = urllib.parse.urlencode(payload).encode("utf-8")
        
        headers.update({
            'Origin': 'https://www.swissadme.ch',
            'Referer': 'https://www.swissadme.ch/index.php',
            'Content-Type': 'application/x-www-form-urlencoded',
        })
        
        req_post = urllib.request.Request(
            "https://www.swissadme.ch/index.php", 
            data=data,
            headers=headers,
            method="POST"
        )
        
        with opener.open(req_post, timeout=30) as response:
            final_url = response.geturl()
            code = response.getcode()
            content = response.read().decode('utf-8')
            print(f"Final URL: {final_url}")
            print(f"Status: {code}")
            
            if "Molecular Weight" in content:
                print("Success: Results found in HTML!")
            elif "/results/" in final_url:
                print("Success: Redirected to results!")
            else:
                print("Failure: Results still not found.")
                with open("tmp/swissadme_fail_v3.html", "w", encoding="utf-8") as f:
                    f.write(content[:10000])
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_swissadme_with_session("C1CCCCC1")
