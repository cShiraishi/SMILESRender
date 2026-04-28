import urllib.request
import urllib.parse
import http.cookiejar

def test_stoptox_improved(smiles):
    try:
        ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
        headers = {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        }
        
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        
        print(f"--- Step 1: Visiting StopTox homepage ---")
        opener.open(urllib.request.Request("https://stoptox.mml.unc.edu/", headers=headers), timeout=30)
        
        print(f"--- Step 2: Requesting prediction for {smiles} ---")
        url = f"https://stoptox.mml.unc.edu/predict?smiles={urllib.parse.quote(smiles)}"
        req = urllib.request.Request(url, headers=headers)
        with opener.open(req, timeout=120) as response:
            content = response.read().decode('utf-8')
            if "tablePreview" in content:
                print("SUCCESS: Found results table in HTML.")
            else:
                print("FAILURE: Results table missing.")
                print(f"Content preview: {content[:1000]}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_stoptox_improved("C1CCCCC1")
