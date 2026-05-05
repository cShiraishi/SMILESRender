import sys
import json
from plip.structure.preparation import PDBComplex

def run_plip(pdb_file):
    try:
        my_mol = PDBComplex()
        my_mol.load_pdb(pdb_file)
        # Select first ligand
        for ligand in my_mol.ligands:
            my_mol.characterize_complex(ligand)
            
        # Extract interactions
        interactions = {
            "hbonds": [],
            "hydrophobic": [],
            "salt_bridges": [],
            "pi_stacking": []
        }
        
        # This is a simplified extraction for the UI
        for key in my_mol.interaction_sets:
            is_set = my_mol.interaction_sets[key]
            # Map PLIP objects to serializable dicts
            for hbond in is_set.hbonds:
                interactions["hbonds"].append({
                    "residue": f"{hbond.resname}{hbond.resnr}",
                    "dist": round(hbond.distance_ad, 2),
                    "type": "H-Bond"
                })
            for hydro in is_set.hydrophobic_contacts:
                interactions["hydrophobic"].append({
                    "residue": f"{hydro.resname}{hydro.resnr}",
                    "dist": round(hydro.distance, 2),
                    "type": "Hydrophobic"
                })
            # Add more if needed
            
        return {"success": True, "interactions": interactions}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDB file provided"}))
        sys.exit(1)
    
    result = run_plip(sys.argv[1])
    print(json.dumps(result))
