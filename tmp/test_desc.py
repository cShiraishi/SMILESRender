from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

def check():
    smi = "C1CCCCC1"
    mol = Chem.MolFromSmiles(smi)
    if not mol: return "Invalid"
    aro = sum(1 for atom in mol.GetAtoms() if atom.GetIsAromatic())
    sat = rdMolDescriptors.CalcNumSaturatedRings(mol)
    print(f"SMILES: {smi}")
    print(f"Aromatic Atoms: {aro}")
    print(f"Saturated Rings: {sat}")

if __name__ == "__main__":
    check()
