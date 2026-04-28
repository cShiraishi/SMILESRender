import rdkit
from rdkit.Chem import Descriptors
print(f"RDKit Version: {rdkit.__version__}")
print(f"Descriptor Count: {len(Descriptors._descList)}")
