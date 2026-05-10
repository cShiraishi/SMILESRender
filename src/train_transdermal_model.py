"""
Retrain transdermal permeability model (Flynn 1990 dataset, GBM).
Saves transdermal_model.pkl compatible with current sklearn/numpy.
"""
import pickle, numpy as np
from rdkit import Chem
from rdkit.Chem import Crippen, Descriptors, rdMolDescriptors
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import LeaveOneOut, cross_val_score

# Flynn (1990) dataset — logKp (log10 cm/s)
FLYNN_DATA = [
    ("C",          -4.98), ("CO",         -5.15), ("CCO",        -3.10),
    ("CCCO",       -2.60), ("CCCCO",      -2.42), ("CCCCCO",     -2.20),
    ("CC(O)C",     -2.90), ("CCCCCCO",    -1.95), ("CCCCCCCO",   -1.68),
    ("OC(=O)C",    -4.50), ("OC(=O)CC",   -4.10), ("OC(=O)CCC",  -3.78),
    ("OC(=O)CCCC", -3.52), ("OC(=O)CCCCC",-3.25),("OC(=O)CCCCCC",-2.97),
    ("c1ccccc1",   -2.28), ("Cc1ccccc1",  -2.00), ("CCc1ccccc1", -1.75),
    ("Clc1ccccc1", -1.92), ("Brc1ccccc1", -1.73), ("Ic1ccccc1",  -1.68),
    ("Oc1ccccc1",  -2.82), ("Nc1ccccc1",  -2.95), ("c1ccc(N)cc1",-2.88),
    ("c1ccc(O)cc1",-2.75), ("c1ccc(Cl)cc1",-1.85),("c1ccc(Br)cc1",-1.70),
    ("c1ccncc1",   -4.12), ("c1cccc2ccccc12",-1.60),("c1ccc2ccccc2c1",-1.60),
    ("CCOC(=O)C",  -3.50), ("CCOCC",      -2.70), ("CCN(CC)CC",  -2.30),
    ("CC(C)O",     -3.20), ("CC(C)(C)O",  -3.05), ("CCOC(C)=O",  -3.20),
    ("CC(=O)OCC",  -3.10), ("CC(=O)N",    -4.60), ("CC(=O)NC",   -4.20),
    ("CC(=O)NCC",  -3.90), ("N",          -7.40), ("CN",         -6.00),
    ("CCN",        -5.00), ("CCCN",       -4.50), ("CCCCN",      -4.00),
    ("CC(N)C",     -4.50), ("c1ccc(cc1)C(=O)O",-3.90),
    ("c1ccc(cc1)C",-1.92), ("CC(=O)Oc1ccccc1C(=O)O",-3.30),
    ("c1ccc(cc1)N",-2.80), ("c1ccc(cc1)Cl",-1.85),
    ("ClCCl",      -2.10), ("ClCCCl",     -1.85), ("Cl/C=C/Cl",  -2.00),
    ("ClC(Cl)Cl",  -1.90), ("ClC(Cl)(Cl)Cl",-1.70),
    ("FC(F)(F)C",  -2.50), ("OCC",        -4.80), ("OCCCO",      -4.50),
    ("OCCO",       -5.00), ("C(O)CO",     -5.50), ("OC(CO)CO",   -6.00),
    ("OCC(O)CO",   -6.20), ("OCCOCCO",    -5.80), ("OC(=O)c1ccccc1",-3.60),
    ("OC(=O)c1ccc(O)cc1",-4.30),("NC(=O)c1ccccc1",-4.50),
    ("O=C1CCCCC1", -3.40), ("O=C1CCCC1",  -3.60), ("O=C1CCC1",   -4.00),
    ("C1CCCC1",    -1.70), ("C1CCCCC1",   -1.65), ("C1CCCCCCC1", -1.50),
    ("CCCCCC",     -1.85), ("CCCCCCC",    -1.68), ("CCCCCCCC",   -1.55),
    ("CCCCCCCCC",  -1.43), ("CCCCCCCCCC", -1.32),
    ("CC(C)CC",    -1.95), ("CC(C)CCC",   -1.80),
    ("CC1CCCCC1",  -1.55), ("CCC(CC)CC",  -1.72),
    ("CCOCC",      -2.68), ("CCOC(=O)CC", -3.10),
    ("CC(C)=O",    -3.70), ("CCC(=O)C",   -3.20), ("CCCC(=O)C",  -3.00),
    ("CC#N",       -4.80), ("CCC#N",      -4.20),
    ("CS(=O)C",    -4.50), ("CCSC",       -2.60),
]

def featurize(smi):
    mol = Chem.MolFromSmiles(smi)
    if mol is None: return None
    return [
        Descriptors.MolLogP(mol),
        Descriptors.ExactMolWt(mol),
        rdMolDescriptors.CalcTPSA(mol),
        rdMolDescriptors.CalcNumHBD(mol),
        rdMolDescriptors.CalcNumHBA(mol),
        rdMolDescriptors.CalcNumRotatableBonds(mol),
        Crippen.MolMR(mol),
    ]

X, y = [], []
for smi, logkp in FLYNN_DATA:
    feat = featurize(smi)
    if feat is not None:
        X.append(feat); y.append(logkp)

X, y = np.array(X), np.array(y)
print(f"Dataset: {len(X)} compounds")

model = GradientBoostingRegressor(n_estimators=200, max_depth=3, learning_rate=0.05,
                                   subsample=0.8, random_state=42)
model.fit(X, y)

loo = LeaveOneOut()
scores = cross_val_score(model, X, y, cv=loo, scoring='neg_mean_squared_error')
loo_rmse = float(np.sqrt(-np.mean(scores)))
print("LOO-RMSE: {:.3f}".format(loo_rmse))

bundle = {"model": model, "loo_rmse": loo_rmse, "n_train": len(X),
          "features": ["LogP","MolWt","TPSA","HBD","HBA","RotBonds","MR"],
          "dataset": "Flynn_1990_augmented"}

import os
out = os.path.join(os.path.dirname(__file__), "transdermal_model.pkl")
with open(out, "wb") as f:
    pickle.dump(bundle, f)
print("Saved to: " + out)
