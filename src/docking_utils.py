import os
import requests
import json
import subprocess
import urllib.request
from rdkit import Chem
from rdkit.Chem import AllChem

def get_rcsb_ligands(pdb_id):
    """
    Queries RCSB GraphQL API to get a list of non-polymer entities (ligands).
    This replicates the discovery logic of the PDB plugin.
    """
    url = "https://data.rcsb.org/graphql"
    query = {
        "query": f"""
        {{
          entry(entry_id: "{pdb_id.upper()}") {{
            nonpolymer_entities {{
              nonpolymer_comp {{
                rcsb_id
              }}
              rcsb_nonpolymer_entity_container_identifiers {{
                auth_asym_ids
              }}
            }}
          }}
        }}
        """
    }
    try:
        resp = requests.post(url, json=query)
        if resp.ok:
            data = resp.json()
            entities = data.get("data", {}).get("entry", {}).get("nonpolymer_entities", [])
            ligands = []
            # Exclusion list for common non-inhibitor entities (plugin logic)
            exclude = ["HOH", "DOD", "CL", "NA", "SO4", "PO4", "MG", "ZN", "CA", "EDO", "GOL", "PEG", "DMS"]
            
            for entity in entities:
                lig_id = entity.get("nonpolymer_comp", {}).get("rcsb_id")
                if lig_id and lig_id not in exclude:
                    asym_ids = entity.get("rcsb_nonpolymer_entity_container_identifiers", {}).get("auth_asym_ids", [])
                    for aid in asym_ids:
                        ligands.append({"id": lig_id, "chain": aid})
            return ligands
    except:
        pass
    return []

def get_pdb_from_rcsb(pdb_id):
    """Fetches PDB file content from RCSB."""
    url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
    try:
        resp = requests.get(url)
        if resp.ok:
            return resp.text
    except:
        pass
    return None

def auto_detect_pocket_from_inhibitor(pdb_content, pdb_id):
    """
    Detects the binding pocket by finding the largest co-crystallized inhibitor.
    Logic ported from pluginPBD.
    """
    try:
        # 1. Get validated ligands from RCSB API
        valid_ligands = get_rcsb_ligands(pdb_id)
        if not valid_ligands:
            return {"success": False, "error": "No significant inhibitor found in RCSB metadata"}

        # 2. Extract coordinates for the first valid ligand
        target_lig = valid_ligands[0]
        coords = []
        
        for line in pdb_content.splitlines():
            if line.startswith(("HETATM", "ATOM")):
                res_name = line[17:20].strip()
                chain_id = line[21:22].strip()
                if res_name == target_lig["id"] and chain_id == target_lig["chain"]:
                    try:
                        x = float(line[30:38])
                        y = float(line[38:46])
                        z = float(line[46:54])
                        coords.append((x, y, z))
                    except: continue

        if not coords:
            return {"success": False, "error": f"Could not find coordinates for ligand {target_lig['id']}"}

        # 3. Calculate Centroid (Arithmetic Mean)
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        zs = [c[2] for c in coords]
        
        center = {
            "x": round(sum(xs) / len(xs), 3),
            "y": round(sum(ys) / len(ys), 3),
            "z": round(sum(zs) / len(zs), 3)
        }

        # 4. Calculate Sizing (Max-Min + 10A buffer)
        size = {
            "x": round((max(xs) - min(xs)) + 10, 1),
            "y": round((max(ys) - min(ys)) + 10, 1),
            "z": round((max(zs) - min(zs)) + 10, 1)
        }

        return {
            "success": True,
            "inhibitor": target_lig["id"],
            "center": center,
            "size": size
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def clean_pdb_for_docking(pdb_content):
    """Removes solvent and ions for simulation."""
    ignore_list = ["HOH", "DOD", "WAT", "NA", "CL", "K", "MG", "CA", "ZN", "CU", "FE", "MN", "CO", "NI", "I", "BR", "SO4", "PO4"]
    lines = pdb_content.split('\n')
    cleaned_lines = []
    for line in lines:
        if line.startswith("ATOM"):
            cleaned_lines.append(line)
        elif line.startswith("HETATM"):
            res_name = line[17:20].strip().upper()
            if res_name not in ignore_list:
                cleaned_lines.append(line)
        elif line.startswith(("CONECT", "TER", "END")):
            cleaned_lines.append(line)
    return '\n'.join(cleaned_lines)

def prepare_ligand_pdbqt(smiles):
    """Converts SMILES to PDBQT using RDKit and Meeko."""
    try:
        from meeko import MoleculePreparation
        mol = Chem.MolFromSmiles(smiles)
        if not mol: return None, "Invalid SMILES"
        mol = Chem.AddHs(mol)
        AllChem.EmbedMolecule(mol, AllChem.ETKDG())
        AllChem.MMFFOptimizeMolecule(mol)
        preparator = MoleculePreparation()
        preparator.prepare(mol)
        return preparator.write_pdbqt_string(), None
    except Exception as e:
        return None, str(e)

def merge_receptor_ligand(receptor_pdb_path, ligand_pdbqt_content, output_pdb_path):
    """Merges receptor and ligand for interaction analysis."""
    try:
        lig_pdbqt_path = output_pdb_path + ".lig.pdbqt"
        with open(lig_pdbqt_path, "w") as f: f.write(ligand_pdbqt_content)
        lig_pdb_path = output_pdb_path + ".lig.pdb"
        subprocess.run(["obabel", "-ipdbqt", lig_pdbqt_path, "-opdb", "-O", lig_pdb_path], check=True)
        subprocess.run(["obabel", receptor_pdb_path, lig_pdb_path, "-opdb", "-O", output_pdb_path], check=True)
        if os.path.exists(lig_pdbqt_path): os.remove(lig_pdbqt_path)
        if os.path.exists(lig_pdb_path): os.remove(lig_pdb_path)
        return True, None
    except Exception as e:
        return False, str(e)
