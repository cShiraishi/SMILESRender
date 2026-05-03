import pandas as pd
import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem
from sklearn.ensemble import RandomForestClassifier
from sklearn.multioutput import MultiOutputClassifier
import urllib.request
import pickle
import os

print("Downloading Tox21 dataset...")
url = "https://deepchemdata.s3-us-west-1.amazonaws.com/datasets/tox21.csv.gz"
urllib.request.urlretrieve(url, "tox21.csv.gz")

print("Loading dataset...")
df = pd.read_csv("tox21.csv.gz")

# Endpoints
tasks = ['NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase', 'NR-ER', 'NR-ER-LBD', 
         'NR-PPAR-gamma', 'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53']

print("Generating Morgan fingerprints...")
X = []
valid_indices = []
for i, smiles in enumerate(df['smiles']):
    mol = Chem.MolFromSmiles(smiles)
    if mol is not None:
        fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=1024)
        arr = np.zeros((1,))
        from rdkit import DataStructs
        DataStructs.ConvertToNumpyArray(fp, arr)
        X.append(arr)
        valid_indices.append(i)

X = np.array(X)
df_valid = df.iloc[valid_indices].copy()

# Fill missing values with -1 or 0 (we will treat missing as negative for simplicity, or drop them per task)
# For MultiOutputClassifier with RF, we can't easily handle missing labels. We will fill NaNs with 0 (inactive) 
# since most compounds are inactive and it's a conservative assumption.
Y = df_valid[tasks].fillna(0).values

print("Training Multi-Output Random Forest...")
base_rf = RandomForestClassifier(n_estimators=100, max_depth=15, n_jobs=-1, random_state=42)
multi_target_rf = MultiOutputClassifier(base_rf, n_jobs=-1)
multi_target_rf.fit(X, Y)

print("Saving model to tox21_model.pkl...")
output_pkl = os.path.join(os.path.dirname(__file__), "tox21_model.pkl")
with open(output_pkl, "wb") as f:
    pickle.dump({
        "model": multi_target_rf,
        "tasks": tasks
    }, f)

print("Done! Model saved successfully.")
