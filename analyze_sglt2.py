# -*- coding: utf-8 -*-
"""
Standalone SGLT2 approved-drug analysis using SMILESRender's local pipeline.
Produces: SGLT2_ADMET_Results.xlsx  +  console report for paper tables.
"""

import sys, os, pickle, warnings
warnings.filterwarnings("ignore")

# Add src to path so we can reuse internal helpers
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

import numpy as np
from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors, QED, FilterCatalog
from rdkit.Chem.FilterCatalog import FilterCatalogParams

# ── Compounds ────────────────────────────────────────────────────────────────
COMPOUNDS = [
    ("Canagliflozin",  "CC1=C(C=C(C=C1)[C@H]2[C@@H]([C@H]([C@@H]([C@H](O2)CO)O)O)O)CC3=CC=C(S3)C4=CC=C(C=C4)F"),
    ("Dapagliflozin",  "CCOC1=CC=C(C=C1)CC2=C(C=CC(=C2)[C@H]3[C@@H]([C@H]([C@@H]([C@H](O3)CO)O)O)O)Cl"),
    ("Tofogliflozin",  "CCC1=CC=C(C=C1)CC2=CC3=C(CO[C@@]34[C@@H]([C@H]([C@@H]([C@H](O4)CO)O)O)O)C=C2"),
    ("Ipragliflozin",  "C1=CC=C2C(=C1)C=C(S2)CC3=C(C=CC(=C3)[C@H]4[C@@H]([C@H]([C@@H]([C@H](O4)CO)O)O)O)F"),
    ("Empagliflozin",  "C1COC[C@H]1OC2=CC=C(C=C2)CC3=C(C=CC(=C3)[C@H]4[C@@H]([C@H]([C@@H]([C@H](O4)CO)O)O)O)Cl"),
    ("Sotagliflozin",  "CCOC1=CC=C(C=C1)CC2=C(C=CC(=C2)[C@H]3[C@@H]([C@H]([C@@H]([C@H](O3)SC)O)O)O)Cl"),
]

# ── Load models ──────────────────────────────────────────────────────────────
SRC = os.path.join(os.path.dirname(__file__), "src")

def load_pkl(name):
    p = os.path.join(SRC, name)
    if os.path.exists(p):
        with open(p, "rb") as f:
            return pickle.load(f)
    return None

BBB_BUNDLE  = load_pkl("bbb_model.pkl")
TOX21_MODEL = load_pkl("tox21_model.pkl")

print(f"BBB model  : {'loaded' if BBB_BUNDLE else 'MISSING'}")
print(f"Tox21 model: {'loaded' if TOX21_MODEL else 'MISSING'}")

# ── admet_ai (optional) ──────────────────────────────────────────────────────
try:
    from admet_ai import ADMETModel
    ADMET_MODEL = ADMETModel()
    print("admet_ai   : loaded")
except Exception as e:
    ADMET_MODEL = None
    print(f"admet_ai   : unavailable ({e})")

# ── Structural alerts ────────────────────────────────────────────────────────
def _build_catalog():
    params = FilterCatalogParams()
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_A)
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_B)
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_C)
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.BRENK)
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.NIH)
    return FilterCatalog.FilterCatalog(params)

ALERT_CATALOG = _build_catalog()

def check_alerts(mol):
    entries = ALERT_CATALOG.GetMatches(mol)
    pains  = [e for e in entries if "PAINS" in e.GetDescription().upper()]
    brenk  = [e for e in entries if "BRENK" in e.GetDescription().upper()]
    nih    = [e for e in entries if "NIH"   in e.GetDescription().upper()]
    return {
        "pains_count": len(pains),
        "pains_names": "; ".join(e.GetDescription() for e in pains) or "None",
        "brenk_count": len(brenk),
        "nih_count":   len(nih),
        "alert_total": len(entries),
    }

# ── RDKit descriptors ────────────────────────────────────────────────────────
def calc_descriptors(mol):
    mw   = round(Descriptors.MolWt(mol), 2)
    logp = round(Descriptors.MolLogP(mol), 2)
    tpsa = round(Descriptors.TPSA(mol), 1)
    hbd  = rdMolDescriptors.CalcNumHBD(mol)
    hba  = rdMolDescriptors.CalcNumHBA(mol)
    rotb = rdMolDescriptors.CalcNumRotatableBonds(mol)
    arom = rdMolDescriptors.CalcNumAromaticRings(mol)
    qed  = round(QED.qed(mol), 3)

    ro5_viols = sum([
        mw  > 500,
        logp > 5,
        hbd  > 5,
        hba  > 10,
    ])
    ro5 = "Pass" if ro5_viols == 0 else f"Fail ({ro5_viols} viol.)"

    # ESOL: Delaney 2004
    heavy = mol.GetNumHeavyAtoms()
    ar_atoms = sum(1 for a in mol.GetAtoms() if a.GetIsAromatic())
    ap = ar_atoms / heavy if heavy else 0
    logs = round(0.16 - 0.63 * logp - 0.0062 * mw + 0.066 * rotb - 0.74 * ap, 2)
    if   logs >= -1: sol_class = "Highly soluble"
    elif logs >= -2: sol_class = "Soluble"
    elif logs >= -4: sol_class = "Moderately soluble"
    else:            sol_class = "Poorly soluble"

    return {
        "MW":       mw,
        "LogP":     logp,
        "TPSA":     tpsa,
        "HBD":      hbd,
        "HBA":      hba,
        "RotB":     rotb,
        "ArRings":  arom,
        "QED":      qed,
        "Ro5":      ro5,
        "ESOL_logS":logs,
        "Solubility":sol_class,
    }

# ── BBB prediction ───────────────────────────────────────────────────────────
def predict_bbb(mol):
    if BBB_BUNDLE is None:
        return {"BBB": "N/A", "BBB_prob": None, "BBB_AD": "N/A"}
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)
    fp_arr = np.zeros(2048, dtype=np.float32)
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
    feat = np.concatenate([fp_arr, desc]).reshape(1, -1)

    model = BBB_BUNDLE["model"]
    pred  = model.predict(feat)[0]
    prob  = float(model.predict_proba(feat)[0][1])
    label = "BBB+" if pred == 1 else "BBB-"

    # Applicability Domain
    ad_flag = "In AD"
    if "train_fps" in BBB_BUNDLE and "ad_threshold" in BBB_BUNDLE:
        test_fp  = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)
        sims = DataStructs.BulkTanimotoSimilarity(test_fp, BBB_BUNDLE["train_fps"])
        nn_sim = max(sims) if sims else 0.0
        if nn_sim < BBB_BUNDLE["ad_threshold"]:
            ad_flag = f"Outside AD (NN={nn_sim:.2f})"
        else:
            ad_flag = f"In AD (NN={nn_sim:.2f})"

    return {"BBB": label, "BBB_prob": round(prob, 3), "BBB_AD": ad_flag}

# ── Tox21 prediction ─────────────────────────────────────────────────────────
TOX21_ENDPOINTS = [
    "NR-AR", "NR-AR-LBD", "NR-AhR", "NR-Aromatase",
    "NR-ER", "NR-ER-LBD", "NR-PPAR-gamma",
    "SR-ARE", "SR-ATAD5", "SR-HSE", "SR-MMP", "SR-p53",
]

def predict_tox21(mol):
    if TOX21_MODEL is None:
        return {ep: None for ep in TOX21_ENDPOINTS}
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=1024)
    arr = np.zeros(1024, dtype=np.float32)
    DataStructs.ConvertToNumpyArray(fp, arr)

    # Model is stored as a dict bundle {"model": ..., "tasks": [...]}
    model = TOX21_MODEL["model"] if isinstance(TOX21_MODEL, dict) else TOX21_MODEL
    tasks = TOX21_MODEL.get("tasks", TOX21_ENDPOINTS) if isinstance(TOX21_MODEL, dict) else TOX21_ENDPOINTS

    results = {ep: None for ep in TOX21_ENDPOINTS}
    feat = arr.reshape(1, -1)

    if hasattr(model, "estimators_"):
        # MultiOutputClassifier — predict_proba returns list of arrays
        probs = model.predict_proba(feat)
        for i, ep in enumerate(tasks):
            if i >= len(probs):
                break
            p = probs[i]
            if hasattr(p, "__len__") and p.shape[1] > 1:
                results[ep] = round(float(p[0][1]), 3)
    else:
        preds = model.predict(feat)[0]
        for i, ep in enumerate(tasks):
            results[ep] = int(preds[i]) if i < len(preds) else None
    return results

# ── admet_ai properties ──────────────────────────────────────────────────────
ADMET_PROPS = [
    "hERG", "DILI", "AMES", "ClinTox",
    "HIA_Hou", "Caco2_Wang", "BBB_Martins",
    "Bioavailability_Ma", "PAMPA_NCATS",
    "CYP1A2_Veith", "CYP2C9_Veith", "CYP2C19_Veith",
    "CYP2D6_Veith", "CYP3A4_Veith",
    "CYP2C9_Substrate_CarbonMangels", "CYP2D6_Substrate_CarbonMangels",
    "CYP3A4_Substrate_CarbonMangels",
    "PPBR_AZ", "VDss_Lombardo",
    "Clearance_Hepatocyte_AZ", "Half_Life_Obach",
    "Pgp_Broccatelli", "Skin_Reaction",
    "Carcinogens_Lagunin", "LD50_Zhu",
]

def predict_admet_ai(smiles):
    if ADMET_MODEL is None:
        return {p: None for p in ADMET_PROPS}
    try:
        df = ADMET_MODEL.predict(smiles=[smiles])
        row = df.iloc[0]
        results = {}
        for p in ADMET_PROPS:
            if p in row.index:
                v = row[p]
                results[p] = round(float(v), 3) if v == v else None  # nan check
            else:
                results[p] = None
        return results
    except Exception as e:
        return {p: None for p in ADMET_PROPS}

# ── Main analysis loop ───────────────────────────────────────────────────────
print("\n" + "="*70)
print("SGLT2 Approved Inhibitors — Full ADMET Analysis")
print("="*70)

results = []

for name, smi in COMPOUNDS:
    mol = Chem.MolFromSmiles(smi)
    if mol is None:
        print(f"[ERROR] Invalid SMILES for {name}")
        continue

    canon = Chem.MolToSmiles(mol)
    desc  = calc_descriptors(mol)
    bbb   = predict_bbb(mol)
    tox21 = predict_tox21(mol)
    alerts = check_alerts(mol)
    admet = predict_admet_ai(canon)

    row = {"Name": name, "SMILES": canon}
    row.update(desc)
    row.update(bbb)
    row.update(tox21)
    row.update(alerts)
    row.update({f"AI_{k}": v for k, v in admet.items()})
    results.append(row)

    # Console summary
    print(f"\n{'-'*60}")
    print(f"  {name}")
    print(f"{'-'*60}")
    print(f"  MW={desc['MW']}  LogP={desc['LogP']}  TPSA={desc['TPSA']}  HBD={desc['HBD']}  HBA={desc['HBA']}")
    print(f"  QED={desc['QED']}  Ro5={desc['Ro5']}")
    print(f"  ESOL logS={desc['ESOL_logS']} -> {desc['Solubility']}")
    print(f"  BBB: {bbb['BBB']} (prob={bbb['BBB_prob']})  AD: {bbb['BBB_AD']}")

    tox_active = [ep for ep, v in tox21.items() if v is not None and v >= 0.5]
    tox_str = ", ".join(tox_active) if tox_active else "None active"
    print(f"  Tox21 active (>=0.5): {tox_str}")
    print(f"  Alerts: PAINS={alerts['pains_count']}, BRENK={alerts['brenk_count']}, NIH={alerts['nih_count']}")

    if ADMET_MODEL:
        herg  = admet.get("hERG")
        dili  = admet.get("DILI")
        hia   = admet.get("HIA_Hou")
        cyp3a = admet.get("CYP3A4_Inhibitor")
        cyp3a = admet.get("CYP3A4_Veith")
        cyp3a_s = admet.get("CYP3A4_Substrate_CarbonMangels")
        ppbr = admet.get("PPBR_AZ")
        vdss = admet.get("VDss_Lombardo")
        bav  = admet.get("Bioavailability_Ma")
        print(f"  admet_ai  hERG={herg}  DILI={dili}  HIA={hia}  CYP3A4_inh={cyp3a}  CYP3A4_sub={cyp3a_s}  PPBR={ppbr}%  VDss={vdss}  F_oral={bav}")

# ── Export to Excel ──────────────────────────────────────────────────────────
import pandas as pd

df = pd.DataFrame(results)
out_path = os.path.join(os.path.dirname(__file__), "SGLT2_ADMET_Results.xlsx")

with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
    # Sheet 1: core physicochemical + BBB
    core_cols = ["Name", "SMILES", "MW", "LogP", "TPSA", "HBD", "HBA", "RotB",
                 "ArRings", "QED", "Ro5", "ESOL_logS", "Solubility",
                 "BBB", "BBB_prob", "BBB_AD"]
    df[core_cols].to_excel(writer, sheet_name="Descriptors_BBB", index=False)

    # Sheet 2: Tox21
    tox_cols = ["Name"] + TOX21_ENDPOINTS
    df[[c for c in tox_cols if c in df.columns]].to_excel(writer, sheet_name="Tox21", index=False)

    # Sheet 3: Structural alerts
    alert_cols = ["Name", "pains_count", "pains_names", "brenk_count", "nih_count", "alert_total"]
    df[[c for c in alert_cols if c in df.columns]].to_excel(writer, sheet_name="Alerts", index=False)

    # Sheet 4: admet_ai (if available)
    if ADMET_MODEL:
        ai_cols = ["Name"] + [f"AI_{p}" for p in ADMET_PROPS if f"AI_{p}" in df.columns]
        df[ai_cols].to_excel(writer, sheet_name="ADMET_AI", index=False)

    # Sheet 5: Full flat
    df.to_excel(writer, sheet_name="Full", index=False)

print(f"\n\nSaved: {out_path}")

# ── Paper-ready summary tables ───────────────────────────────────────────────
print("\n\n" + "="*70)
print("PAPER TABLE: Physicochemical + BBB + Solubility")
print("="*70)
header = f"{'Drug':<20} {'MW':>6} {'LogP':>6} {'TPSA':>6} {'QED':>5} {'Ro5':<14} {'ESOL logS':>9} {'Solubility':<20} {'BBB':>5} {'BBB prob':>8} {'AD'}"
print(header)
print("-" * len(header))
for r in results:
    print(f"{r['Name']:<20} {r['MW']:>6} {r['LogP']:>6} {r['TPSA']:>6} {r['QED']:>5} {r['Ro5']:<14} {r['ESOL_logS']:>9} {r['Solubility']:<20} {r['BBB']:>5} {str(r['BBB_prob']):>8}  {r['BBB_AD']}")

print("\n\n" + "="*70)
print("PAPER TABLE: Tox21 12-endpoint panel (probability or 0/1)")
print("="*70)
ep_short = [e.replace("NR-","").replace("SR-","") for e in TOX21_ENDPOINTS]
print(f"{'Drug':<20} " + " ".join(f"{s:>8}" for s in ep_short))
print("-" * (20 + 9*12))
for r in results:
    vals = " ".join(f"{str(r.get(ep,'?')):>8}" for ep in TOX21_ENDPOINTS)
    print(f"{r['Name']:<20} {vals}")

print("\n\n" + "="*70)
print("PAPER TABLE: Structural Alerts")
print("="*70)
print(f"{'Drug':<20} {'PAINS':>6} {'BRENK':>6} {'NIH':>5} {'Alert names'}")
print("-"*70)
for r in results:
    print(f"{r['Name']:<20} {r['pains_count']:>6} {r['brenk_count']:>6} {r['nih_count']:>5}  {r['pains_names']}")

if ADMET_MODEL:
    print("\n\n" + "="*70)
    print("PAPER TABLE: admet_ai key endpoints")
    print("="*70)
    print(f"{'Drug':<20} {'hERG':>6} {'DILI':>6} {'HIA':>6} {'BioAv':>6} "
          f"{'CYP1A2':>7} {'CYP2C9':>7} {'CYP2D6':>7} {'CYP3A4':>7} "
          f"{'3A4sub':>7} {'PPBR%':>6} {'VDss':>6} {'t1/2h':>6}")
    print("-"*100)
    for r in results:
        print(f"{r['Name']:<20}"
              f" {str(r.get('AI_hERG','-')):>6}"
              f" {str(r.get('AI_DILI','-')):>6}"
              f" {str(r.get('AI_HIA_Hou','-')):>6}"
              f" {str(r.get('AI_Bioavailability_Ma','-')):>6}"
              f" {str(r.get('AI_CYP1A2_Veith','-')):>7}"
              f" {str(r.get('AI_CYP2C9_Veith','-')):>7}"
              f" {str(r.get('AI_CYP2D6_Veith','-')):>7}"
              f" {str(r.get('AI_CYP3A4_Veith','-')):>7}"
              f" {str(r.get('AI_CYP3A4_Substrate_CarbonMangels','-')):>7}"
              f" {str(r.get('AI_PPBR_AZ','-')):>6}"
              f" {str(r.get('AI_VDss_Lombardo','-')):>6}"
              f" {str(r.get('AI_Half_Life_Obach','-')):>6}")

print("\nDone.")
