import sys
sys.path.insert(0, 'src')
import urllib.request, urllib.parse, http.cookiejar, re
from rdkit import Chem
from rdkit.Chem import AllChem

smiles = 'c1ccccc1O'

# Try different mol format (V2000 vs V3000, with/without Hs)
mol = Chem.MolFromSmiles(smiles)
AllChem.Compute2DCoords(mol)
molblock_v2 = Chem.MolToMolBlock(mol)  # V2000

# Also try SDF format
from io import StringIO
from rdkit.Chem import SDWriter
sio = StringIO()
w = SDWriter(sio)
w.write(mol)
w.flush()
sdf = sio.getvalue()

print('=== MOL V2000 first 3 lines ===')
for line in molblock_v2.split('\n')[:5]:
    print(repr(line))

# POST to get server_id
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
params1 = urllib.parse.urlencode({'smilesString': smiles}).encode()
req1 = urllib.request.Request(
    'https://tox.charite.de/protox3/index.php?site=compound_search_similarity',
    data=params1,
    headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded'}
)
with opener.open(req1, timeout=20) as r:
    html = r.read().decode('utf-8', errors='replace')
server_id = re.search(r\"server_id='(\d+)'\", html).group(1)
print('Server ID:', server_id)

# Try SDF format
params2 = urllib.parse.urlencode({
    'models': 'dili carcino immuno mutagen',
    'sdfile': sdf,
    'mol': smiles,
    'id': server_id
}).encode()
req2 = urllib.request.Request(
    'https://tox.charite.de/protox3/src/run_models.php',
    data=params2,
    headers={'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest',
             'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
             'Referer': 'https://tox.charite.de/protox3/index.php?site=compound_search_similarity'}
)
try:
    with opener.open(req2, timeout=30) as r:
        result = r.read().decode('utf-8', errors='replace')
        print('HTTP:', r.getcode())
        print(result[:1000])
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')
    print('HTTPError', e.code, ':', body[:500])
