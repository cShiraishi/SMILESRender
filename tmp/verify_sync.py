from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

def check_descriptors(smi):
    mol = Chem.MolFromSmiles(smi)
    if not mol: return "Invalid"
    
    # Logic extracted from routes.py
    aromatic_atoms = sum(1 for atom in mol.GetAtoms() if atom.GetIsAromatic())
    saturated_rings = rdMolDescriptors.CalcNumSaturatedRings(mol)
    
    return {
        "AromaticAtoms": aromatic_atoms,
        "SaturatedRings": saturated_rings
    }

test_smi = "c1ccccc1C(=O)O" # Benzoic acid
print(f"Results for {test_smi}: {check_descriptors(test_smi)}")
smi2 = "C1CCCCC1" # Cyclohexane
print(f"Results for {smi2}: {check_descriptors(smi2)}")
