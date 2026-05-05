from __future__ import annotations
import io
import csv
import os
import subprocess
import tempfile
import zipfile
import base64
from dataclasses import dataclass, field, asdict
from rdkit import Chem
from rdkit.Chem import AllChem, rdDepictor, Crippen, Descriptors, Lipinski, QED, rdMolDescriptors
from rdkit.Chem.MolStandardize import rdMolStandardize

# --- Global Standardizers ---
_LARGEST_FRAG = rdMolStandardize.LargestFragmentChooser()
_UNCHARGER    = rdMolStandardize.Uncharger()
_TAUT_ENUM    = rdMolStandardize.TautomerEnumerator()

@dataclass
class MolEntry:
    name
    smiles
    sdf_3d = ""
    energy|None = None
    ff_used = ""
    status = "pending"
    error = ""
    props = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)

def standardize_mol(mol, remove_salts=True, neutralize=True, canon_tautomer=False):
    try:
        if remove_salts: mol = _LARGEST_FRAG.choose(mol)
        if neutralize: mol = _UNCHARGER.uncharge(mol)
        if canon_tautomer: mol = _TAUT_ENUM.Canonicalize(mol)
        Chem.SanitizeMol(mol)
        return mol
    except: return None

def compute_descriptors(mol):
    if mol is None: return {}
    mw = Descriptors.ExactMolWt(mol)
    logp = Crippen.MolLogP(mol)
    tpsa = rdMolDescriptors.CalcTPSA(mol)
    hbd = Lipinski.NumHDonors(mol)
    hba = Lipinski.NumHAcceptors(mol)
    rotb = rdMolDescriptors.CalcNumRotatableBonds(mol)
    
    lip_viol = int(mw > 500) + int(logp > 5) + int(hbd > 5) + int(hba > 10)
    lip_ro5  = "Pass" if lip_viol == 0 else "Fail ({})".format(lip_viol)

    return {
        "ExactMW": round(mw, 3),
        "LogP": round(logp, 3),
        "TPSA": round(tpsa, 1),
        "HBD": hbd,
        "HBA": hba,
        "RotatableBonds": rotb,
        "QED": round(QED.qed(mol), 3),
        "Lipinski_Ro5": lip_ro5,
        "Lipinski_violations": lip_viol,
        "FractionCSP3": round(rdMolDescriptors.CalcFractionCSP3(mol), 3),
        "NumRings": rdMolDescriptors.CalcNumRings(mol),
    }

def generate_3d_block(smiles, ff="MMFF94", max_iters=2000):
    mol = Chem.MolFromSmiles(smiles)
    if not mol: return None, None, "Invalid SMILES"
    try:
        mol_h = Chem.AddHs(mol)
        params = AllChem.ETKDGv3()
        params.randomSeed = 42
        if AllChem.EmbedMolecule(mol_h, params) == -1:
            params.useRandomCoords = True
            if AllChem.EmbedMolecule(mol_h, params) == -1:
                return None, None, "3D embedding failed"
        
        energy = None
        if ff in ("MMFF94", "MMFF94s"):
            props = AllChem.MMFFGetMoleculeProperties(mol_h, mmffVariant=ff)
            if props:
                ff_obj = AllChem.MMFFGetMoleculeForceField(mol_h, props)
                if ff_obj:
                    ff_obj.Minimize(maxIts=max_iters)
                    energy = ff_obj.CalcEnergy()
        elif ff == "UFF":
            ff_obj = AllChem.UFFGetMoleculeForceField(mol_h)
            if ff_obj:
                ff_obj.Minimize(maxIts=max_iters)
                energy = ff_obj.CalcEnergy()
        
        return Chem.MolToMolBlock(mol_h), energy, ""
    except Exception as e:
        return None, None, str(e)

def convert_to_pdbqt(sdf_block, name):
    try:
        from meeko import MoleculePreparation, PDBQTWriterLegacy
        mol = Chem.MolFromMolBlock(sdf_block, removeHs=False)
        if not mol: return None
        preparator = MoleculePreparation()
        setups = preparator.prepare(mol)
        pdbqt, is_ok, err = PDBQTWriterLegacy.write_string(setups[0])
        if is_ok: return pdbqt
    except:
        # Fallback to obabel
        with tempfile.TemporaryDirectory() as tmp:
            sdf_p = os.path.join(tmp, "mol.sdf")
            qt_p = os.path.join(tmp, "mol.pdbqt")
            with open(sdf_p, "w") as f: f.write(sdf_block)
            res = subprocess.run(["obabel", sdf_p, "-O", qt_p, "--partialcharge", "gasteiger", "-h"], capture_output=True)
            if res.returncode == 0 and os.path.exists(qt_p):
                return open(qt_p).read()
    return None

def create_export_zip(entries, format="pdbqt"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if format == "pdbqt":
            for e in entries:
                if e.get('status') == "ok" and e.get('sdf_3d'):
                    pdbqt = convert_to_pdbqt(e['sdf_3d'], e['name'])
                    if pdbqt: zf.writestr("{}.pdbqt".format(e['name']), pdbqt)
        elif format == "sdf":
            sdf_all = ""
            for e in entries:
                if e.get('status') == "ok" and e.get('sdf_3d'):
                    mol = Chem.MolFromMolBlock(e['sdf_3d'], removeHs=False)
                    if mol:
                        mol.SetProp("_Name", e['name'])
                        for k, v in e.get('props', {}).items(): mol.SetProp(str(k), str(v))
                        sdf_all += Chem.MolToMolBlock(mol) + "$$$$\n"
            if sdf_all: zf.writestr("library_3d.sdf", sdf_all)
    buf.seek(0)
    return buf.read()
