import urllib.request
import urllib.parse
import http.cookiejar

def test_swissadme_final(smiles_smi):
    try:
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        
        # Exact headers from modern browser
        ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
        
        headers = {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6,nl;q=0.5',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Connection': 'keep-alive',
        }
        
        # 1. Start session by visiting index
        print("--- Step 1: Getting session cookies from index.php ---")
        req_index = urllib.request.Request("https://www.swissadme.ch/index.php", headers=headers)
        with opener.open(req_index, timeout=30) as resp:
            print(f"Index access: {resp.getcode()}")
        
        # 2. Extract cookies for logging
        for cookie in cj:
            print(f"Cookie: {cookie.name}={cookie.value}")
        
        # 3. Submit SMILES
        print(f"\n--- Step 2: Submitting SMILES: {smiles_smi} ---")
        payload = {
            "smiles": smiles_smi
        }
        data = urllib.parse.urlencode(payload).encode("utf-8")
        
        post_headers = headers.copy()
        post_headers.update({
            'Origin': 'https://www.swissadme.ch',
            'Referer': 'https://www.swissadme.ch/index.php',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Sec-Fetch-Site': 'same-origin',
        })
        
        req_post = urllib.request.Request(
            "https://www.swissadme.ch/index.php", 
            data=data,
            headers=post_headers,
            method="POST"
        )
        
        with opener.open(req_post, timeout=30) as response:
            final_url = response.geturl()
            print(f"Final URL: {final_url}")
            content = response.read().decode('utf-8')
            
            if "Molecular Weight" in content:
                print("SUCCESS: Results found in HTML.")
            elif "/results/" in final_url:
                print("SUCCESS: Redirected to results.")
            else:
                print("FAILURE: Results still missing.")
                # Look for specific string that might indicate blocking
                if "matomo.js" in content and "smiles" in content:
                     print("- Notice: Content looks like index page again.")
                
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_swissadme_final("C1CCCCC1")
