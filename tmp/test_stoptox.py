import urllib.request
import urllib.parse

def test_stoptox(smiles):
    try:
        url = f"https://stoptox.mml.unc.edu/predict?smiles={urllib.parse.quote(smiles)}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        
        print(f"Testing StopTox with: {smiles}")
        with urllib.request.urlopen(req, timeout=30) as response:
            code = response.getcode()
            content = response.read().decode('utf-8')
            print(f"Status: {code}")
            
            if "tablePreview" in content:
                print("Success: Found 'tablePreview' in response HTML")
                # Save first table content
                with open("tmp/stoptox_success.html", "w", encoding="utf-8") as f:
                    f.write(content)
            else:
                print("Failure: Results table not found in HTML.")
                with open("tmp/stoptox_fail.html", "w", encoding="utf-8") as f:
                    f.write(content[:5000])
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_stoptox("C1CCCCC1")
