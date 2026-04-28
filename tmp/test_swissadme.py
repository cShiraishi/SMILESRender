import urllib.request
import urllib.parse
from base64 import b64decode

def test_swissadme(smiles_smi):
    try:
        data = urllib.parse.urlencode({"smiles": smiles_smi}).encode("utf-8")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://www.swissadme.ch',
            'Referer': 'https://www.swissadme.ch/index.php'
        }
        req = urllib.request.Request(
            "https://www.swissadme.ch/index.php", 
            data=data,
            headers=headers
        )
        print(f"Testing SwissADME with: {smiles_smi}")
        with urllib.request.urlopen(req, timeout=30) as response:
            code = response.getcode()
            content = response.read().decode('utf-8')
            print(f"Status: {code}")
            if "Molecular Weight" in content:
                print("Success: Found 'Molecular Weight' in response")
            else:
                print("Failure: Results not found in HTML")
                # Save part of HTML for inspection
                with open("tmp/swissadme_fail.html", "w", encoding="utf-8") as f:
                    f.write(content[:5000])
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_swissadme("C1CCCCC1")
