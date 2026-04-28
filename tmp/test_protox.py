import sys
sys.path.insert(0, 'src')
import urllib.request, urllib.parse, http.cookiejar, re
from rdkit import Chem
from rdkit.Chem import AllChem

smiles = 'c1ccccc1O'

# Generate mol file from SMILES using RDKit
mol = Chem.MolFromSmiles(smiles)
AllChem.Compute2DCoords(mol)
molblock = Chem.MolToMolBlock(mol)

# Step 1: POST to compound_search_similarity
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

params1 = urllib.parse.urlencode({'smilesString': smiles}).encode()
req1 = urllib.request.Request(
    'https://tox.charite.de/protox3/index.php?site=compound_search_similarity',
    data=params1,
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
             'Content-Type': 'application/x-www-form-urlencoded'}
)
with opener.open(req1, timeout=20) as r:
    html = r.read().decode('utf-8', errors='replace')

server_id = re.search(r"server_id='(\d+)'", html)
server_id = server_id.group(1) if server_id else ''
print('Server ID:', server_id)

if not server_id:
    print('ERROR: No server_id found')
    sys.exit(1)

# Step 2: Call run_models.php with mol file
models = 'dili carcino immuno mutagen cyto neuro nephro cardio'
params2 = urllib.parse.urlencode({
    'models': models,
    'sdfile': 'empty',
    'mol': molblock,
    'id': server_id
}).encode()

req2 = urllib.request.Request(
    'https://tox.charite.de/protox3/src/run_models.php',
    data=params2,
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://tox.charite.de/protox3/index.php?site=compound_search_similarity'
    }
)
try:
    with opener.open(req2, timeout=30) as r:
        result = r.read().decode('utf-8', errors='replace')
        print('run_models HTTP:', r.getcode())
        print('Result (first 2000):')
        print(result[:2000])
except Exception as e:
    print('run_models error:', e)
