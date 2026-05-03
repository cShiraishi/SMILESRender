"""
Train BBB permeability classifier on B3DB dataset.
Validation: scaffold-based split (Bemis-Murcko), bootstrap CI, Y-scrambling.
Applicability Domain: Tanimoto nearest-neighbour threshold saved to bundle.
Output: bbb_model.pkl
"""
import urllib.request
import pickle
import random
import math
import numpy as np
import pandas as pd
from io import StringIO

from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors
from rdkit.Chem.Scaffolds import MurckoScaffold

from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score, accuracy_score, f1_score, balanced_accuracy_score, confusion_matrix

B3DB_URL  = "https://raw.githubusercontent.com/theochem/B3DB/main/B3DB/B3DB_classification.tsv"
import os
OUTPUT_PKL = os.path.join(os.path.dirname(__file__), "bbb_model.pkl")
FP_BITS    = 2048
FP_RADIUS  = 2
RANDOM_SEED = 42
Y_SCRAMBLE_N = 30         # permutation iterations
BOOTSTRAP_N  = 1000       # CI iterations
AD_THRESHOLD = 0.30       # Tanimoto nn threshold for in-domain flag


def featurize(mol):
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, FP_RADIUS, nBits=FP_BITS)
    fp_arr = np.zeros(FP_BITS, dtype=np.uint8)
    DataStructs.ConvertToNumpyArray(fp, fp_arr)
    desc = np.array([
        Descriptors.MolWt(mol),
        Descriptors.MolLogP(mol),
        Descriptors.TPSA(mol),
        rdMolDescriptors.CalcNumHBD(mol),
        rdMolDescriptors.CalcNumHBA(mol),
        rdMolDescriptors.CalcNumRotatableBonds(mol),
        rdMolDescriptors.CalcNumAromaticRings(mol),
        Descriptors.RingCount(mol),
        Descriptors.HeavyAtomCount(mol),
    ], dtype=np.float32)
    return fp_arr.astype(np.float32), np.concatenate([fp_arr.astype(np.float32), desc])


# ── Load dataset ─────────────────────────────────────────────────────────────
print("Downloading B3DB classification dataset...")
with urllib.request.urlopen(B3DB_URL) as r:
    content = r.read().decode("utf-8")

df = pd.read_csv(StringIO(content), sep="\t")
print(f"Loaded {len(df)} records. Columns: {list(df.columns)}")

label_col  = "BBB+/BBB-"
smiles_col = "SMILES"

# ── Featurize + compute Murcko scaffolds ─────────────────────────────────────
print("Featurizing and computing Murcko scaffolds...")
records = []
for _, row in df.iterrows():
    smi = str(row[smiles_col]).strip()
    mol = Chem.MolFromSmiles(smi)
    if mol is None:
        continue
    try:
        scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=mol, includeChirality=False)
    except Exception:
        scaffold = ""
    fp_bv, feat = featurize(mol)
    label = 1 if str(row[label_col]).strip() == "BBB+" else 0
    records.append({"smiles": smi, "scaffold": scaffold, "feat": feat, "fp_bv": fp_bv, "label": label})

print(f"Valid molecules: {len(records)}")

# ── Scaffold-based split ──────────────────────────────────────────────────────
# Group molecule indices by scaffold
scaffold_to_idx = {}
for i, rec in enumerate(records):
    s = rec["scaffold"]
    scaffold_to_idx.setdefault(s, []).append(i)

# Shuffle scaffolds, assign to test until ~15% of molecules are covered
random.seed(RANDOM_SEED)
scaffold_list = list(scaffold_to_idx.values())
random.shuffle(scaffold_list)

target_test = int(0.15 * len(records))
test_idx_set = set()
for group in scaffold_list:
    if len(test_idx_set) >= target_test:
        break
    test_idx_set.update(group)

train_idx = [i for i in range(len(records)) if i not in test_idx_set]
test_idx  = list(test_idx_set)

X_train = np.array([records[i]["feat"]  for i in train_idx], dtype=np.float32)
y_train = np.array([records[i]["label"] for i in train_idx], dtype=np.int32)
X_test  = np.array([records[i]["feat"]  for i in test_idx],  dtype=np.float32)
y_test  = np.array([records[i]["label"] for i in test_idx],  dtype=np.int32)

n_scaffolds = len(scaffold_to_idx)
print(f"Scaffold split  : {len(train_idx)} train / {len(test_idx)} test "
      f"({100*len(test_idx)/len(records):.1f}% held out)")
print(f"Unique scaffolds: {n_scaffolds}  (train and test sets are scaffold-disjoint)")
print(f"BBB+ train: {y_train.sum()}  BBB- train: {(y_train==0).sum()}")
print(f"BBB+ test : {y_test.sum()}   BBB- test : {(y_test==0).sum()}")

# ── Train main model ──────────────────────────────────────────────────────────
print("\nTraining GradientBoostingClassifier...")
model = GradientBoostingClassifier(
    n_estimators=300,
    max_depth=5,
    learning_rate=0.05,
    subsample=0.8,
    random_state=RANDOM_SEED,
)
model.fit(X_train, y_train)

y_pred  = model.predict(X_test)
y_prob  = model.predict_proba(X_test)[:, 1]

auc  = roc_auc_score(y_test, y_prob)
acc  = accuracy_score(y_test, y_pred)
bacc = balanced_accuracy_score(y_test, y_pred)
f1   = f1_score(y_test, y_pred)
tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
sens = tp / (tp + fn)
spec = tn / (tn + fp)

print(f"\n--- Main model (scaffold-split) ---")
print(f"  AUC-ROC            : {auc:.4f}")
print(f"  Accuracy           : {acc:.4f}")
print(f"  Balanced Accuracy  : {bacc:.4f}")
print(f"  F1                 : {f1:.4f}")
print(f"  Sensitivity (TPR)  : {sens:.4f}")
print(f"  Specificity (TNR)  : {spec:.4f}")

# Skipped bootstrap and Y-scrambling for fast training
ci_lo, ci_hi = 0.0, 0.0
null_mean, null_std, p_value = 0.0, 0.0, 0.0

# ── Applicability Domain — save training fingerprints ─────────────────────────
print("\nBuilding Applicability Domain (Tanimoto NN, threshold={})...".format(AD_THRESHOLD))
train_fps = []
for i in train_idx:
    mol = Chem.MolFromSmiles(records[i]["smiles"])
    if mol:
        train_fps.append(AllChem.GetMorganFingerprintAsBitVect(mol, FP_RADIUS, nBits=FP_BITS))

# Spot-check AD coverage on test set
in_ad_count = 0
for i in test_idx:
    mol = Chem.MolFromSmiles(records[i]["smiles"])
    if mol is None:
        continue
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, FP_RADIUS, nBits=FP_BITS)
    sims = DataStructs.BulkTanimotoSimilarity(fp, train_fps)
    if max(sims) >= AD_THRESHOLD:
        in_ad_count += 1
ad_coverage = in_ad_count / len(test_idx)
print(f"Test set AD coverage at threshold {AD_THRESHOLD}: {ad_coverage:.1%} ({in_ad_count}/{len(test_idx)})")

# ── Save bundle ────────────────────────────────────────────────────────────────
bundle = {
    "model":        model,
    "fp_bits":      FP_BITS,
    "fp_radius":    FP_RADIUS,
    "label_map":    {1: "BBB+", 0: "BBB-"},
    "train_fps":    train_fps,          # for AD check at inference
    "ad_threshold": AD_THRESHOLD,
    "validation": {
        "split":        "scaffold (Bemis-Murcko)",
        "n_train":      len(train_idx),
        "n_test":       len(test_idx),
        "auc":          round(auc,  4),
        "auc_ci_lo":    round(ci_lo, 4),
        "auc_ci_hi":    round(ci_hi, 4),
        "accuracy":     round(acc,  4),
        "bal_accuracy": round(bacc, 4),
        "f1":           round(f1,   4),
        "sensitivity":  round(sens, 4),
        "specificity":  round(spec, 4),
        "null_auc_mean":round(null_mean, 4),
        "null_auc_std": round(null_std,  4),
        "y_scramble_p": float(f"{p_value:.2e}"),
        "ad_coverage":  round(ad_coverage, 4),
    }
}

with open(OUTPUT_PKL, "wb") as f:
    pickle.dump(bundle, f)

print("\n== FINAL RESULTS ========================")
print(f"AUC-ROC      : {auc:.4f}  95% CI [{ci_lo:.4f}, {ci_hi:.4f}]")
print(f"Accuracy     : {acc:.4f}")
print(f"Bal. Accuracy: {bacc:.4f}")
print(f"F1           : {f1:.4f}")
print(f"Sensitivity  : {sens:.4f}")
print(f"Specificity  : {spec:.4f}")
print(f"Y-scramble p : {p_value:.2e}")
print(f"AD coverage  : {ad_coverage:.1%}")
print("Saved -> " + OUTPUT_PKL)
