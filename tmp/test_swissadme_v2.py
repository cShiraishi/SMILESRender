import urllib.request
import urllib.parse
from base64 import b64decode

def test_swissadme(smiles_smi):
    try:
        # Include hidden fields found by browser inspection
        payload = {
            "smiles": smiles_smi,
            "ioi": "",
            "organism": "Homo_sapiens"
        }
        data = urllib.parse.urlencode(payload).encode("utf-8")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://www.swissadme.ch',
            'Referer': 'https://www.swissadme.ch/index.php',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'max-age=0',
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        
        req = urllib.request.Request(
            "https://www.swissadme.ch/index.php", 
            data=data,
            headers=headers,
            method="POST"
        )
        
        print(f"Testing SwissADME with: {smiles_smi}")
        with urllib.request.urlopen(req, timeout=30) as response:
            final_url = response.geturl()
            code = response.getcode()
            content = response.read().decode('utf-8')
            print(f"Final URL: {final_url}")
            print(f"Status: {code}")
            
            if "/results/" in final_url or "Molecular Weight" in content:
                print("Success: Results found!")
            else:
                print("Failure: Still getting index page or block.")
                with open("tmp/swissadme_fail_v2.html", "w", encoding="utf-8") as f:
                    f.write(content[:10000])
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_swissadme("C1CCCCC1")
