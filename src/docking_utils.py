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
    gql = (
        "{ entry(entry_id: \"%s\") { nonpolymer_entities { nonpolymer_comp { rcsb_id } "
        "rcsb_nonpolymer_entity_container_identifiers { auth_asym_ids } } } }"
    ) % pdb_id.upper()
    query = {"query": gql}
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
    url = "https://files.rcsb.org/download/{}.pdb".format(pdb_id.upper())
    try:
        resp = requests.get(url)
        if resp.ok:
            return resp.text
    except:
        pass
    return None

def auto_detect_pocket_from_inhibitor(pdb_content, pdb_id, ligand_id=None, chain_id=None):
    """
    Detects the binding pocket by finding the specified ligand or the largest co-crystallized inhibitor.
    Logic ported from pluginPBD.
    """
    try:
        target_lig = None
        
        if ligand_id:
            # If manual ligand is provided, use it
            target_lig = {"id": ligand_id.upper(), "chain": chain_id.upper() if chain_id else None}
        else:
            # 1. Get validated ligands from RCSB API
            valid_ligands = get_rcsb_ligands(pdb_id)
            if not valid_ligands:
                return {"success": False, "error": "No significant inhibitor found in RCSB metadata"}
            target_lig = valid_ligands[0]

        # 2. Extract coordinates for the target ligand
        coords = []
        
        for line in pdb_content.splitlines():
            if line.startswith(("HETATM", "ATOM")):
                res_name = line[17:20].strip()
                curr_chain = line[21:22].strip()
                
                match_id = (res_name == target_lig["id"])
                match_chain = True
                if target_lig["chain"]:
                    match_chain = (curr_chain == target_lig["chain"])
                
                if match_id and match_chain:
                    try:
                        x = float(line[30:38])
                        y = float(line[38:46])
                        z = float(line[46:54])
                        coords.append((x, y, z))
                    except: continue

        if not coords:
            msg = "Could not find coordinates for ligand {}".format(target_lig['id'])
            if target_lig['chain']: msg += " in chain {}".format(target_lig['chain'])
            return {"success": False, "error": msg}

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
            "chain": target_lig["chain"],
            "center": center,
            "size": size
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def clean_pdb_for_docking(pdb_content):
    """Keeps only protein ATOM records for receptor preparation."""
    lines = pdb_content.split('\n')
    cleaned_lines = []
    for line in lines:
        if line.startswith("ATOM") or line.startswith(("TER", "END")):
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

def generate_2d_interaction_diagram(ligand_smiles, plip_data):
    """
    LigPlot-style SVG: ligand in center, protein residues as labeled boxes
    arranged radially, connected by colored dashed lines by interaction type.
    """
    import math
    try:
        from rdkit.Chem.Draw import rdMolDraw2D

        mol = Chem.MolFromSmiles(ligand_smiles)
        if not mol:
            return None
        AllChem.Compute2DCoords(mol)

        # --- collect interactions ---
        ITYPE_STYLE = {
            "hbonds":      {"color": "#16a34a", "label": "H-Bond",      "dash": "6,3"},
            "hydrophobic": {"color": "#2563eb", "label": "Hydrophobic", "dash": "4,4"},
            "pi_stacking": {"color": "#9333ea", "label": "π-Stack",  "dash": "8,3"},
            "salt_bridges":{"color": "#dc2626", "label": "Salt Bridge", "dash": "3,3"},
        }

        interactions = plip_data.get("interactions", {})
        entries = []  # list of (residue_label, itype, color, dash)
        for itype, style in ITYPE_STYLE.items():
            for item in interactions.get(itype, []):
                res = item.get("residue", "UNK")
                entries.append((res, itype, style["color"], style["dash"], style["label"]))

        # --- canvas dimensions ---
        W, H = 700, 680
        MOL_SIZE = 260
        CX, CY = W // 2, H // 2 - 20   # molecule center

        # draw ligand SVG (smaller canvas, we'll embed it)
        drawer = rdMolDraw2D.MolDraw2DSVG(MOL_SIZE, MOL_SIZE)
        opts = drawer.drawOptions()
        opts.addAtomIndices = False
        opts.padding = 0.15
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        mol_svg_inner = drawer.GetDrawingText()
        # strip outer <svg> tags to embed inline
        import re
        mol_inner = re.sub(r"<\?xml[^>]*\?>", "", mol_svg_inner)
        mol_inner = re.sub(r"<svg[^>]*>", "", mol_inner, count=1)
        mol_inner = re.sub(r"</svg>", "", mol_inner, count=1)

        # --- radial layout for residue boxes ---
        BOX_W, BOX_H = 86, 28
        RADIUS = 240
        N = max(len(entries), 1)
        angle_step = 2 * math.pi / N

        # build SVG parts
        lines_svg = []
        boxes_svg = []

        for i, (res, itype, color, dash, type_label) in enumerate(entries):
            angle = -math.pi / 2 + i * angle_step
            bx = CX + RADIUS * math.cos(angle)
            by = CY + RADIUS * math.sin(angle)

            # connection line: from molecule center to box edge
            # find point on box nearest to molecule center
            dx, dy = CX - bx, CY - by
            dist = math.sqrt(dx*dx + dy*dy) or 1
            # box edge intercept
            tx = bx + (BOX_W / 2) * (dx / abs(dx) if abs(dx) > abs(dy) * (BOX_W / BOX_H) else dx / dist * BOX_W / 2)
            ty = by + (BOX_H / 2) * (dy / abs(dy) if abs(dy) >= abs(dx) * (BOX_H / BOX_W) else dy / dist * BOX_H / 2)
            # line endpoint on molecule edge (MOL_SIZE/2 radius)
            mol_r = MOL_SIZE / 2 - 10
            ex = CX - mol_r * dx / dist
            ey = CY - mol_r * dy / dist

            lines_svg.append(
                '<line x1="{:.1f}" y1="{:.1f}" x2="{:.1f}" y2="{:.1f}" '
                'stroke="{}" stroke-width="2" stroke-dasharray="{}" opacity="0.85"/>'.format(
                    ex, ey, tx, ty, color, dash
                )
            )

            # residue box
            rx, ry = bx - BOX_W / 2, by - BOX_H / 2
            boxes_svg.append(
                '<rect x="{:.1f}" y="{:.1f}" width="{}" height="{}" rx="5" ry="5" '
                'fill="white" stroke="{}" stroke-width="2"/>'.format(rx, ry, BOX_W, BOX_H, color)
            )
            boxes_svg.append(
                '<text x="{:.1f}" y="{:.1f}" text-anchor="middle" dominant-baseline="middle" '
                'font-family="monospace" font-size="11" font-weight="bold" fill="{}">{}</text>'.format(
                    bx, by - 4, color, res[:12]
                )
            )
            boxes_svg.append(
                '<text x="{:.1f}" y="{:.1f}" text-anchor="middle" dominant-baseline="middle" '
                'font-family="sans-serif" font-size="8" fill="#64748b">{}</text>'.format(
                    bx, by + 8, type_label
                )
            )

        # --- legend ---
        legend_y = H - 50
        lx = 20
        legend_items = [(s["color"], s["dash"], s["label"])
                        for k, s in ITYPE_STYLE.items()
                        if interactions.get(k)]
        for color, dash, label in legend_items:
            legend_items_svg = (
                '<line x1="{}" y1="{}" x2="{}" y2="{}" stroke="{}" stroke-width="2" stroke-dasharray="{}"/>'
                '<text x="{}" y="{}" font-family="sans-serif" font-size="11" fill="#334155" '
                'dominant-baseline="middle">{}</text>'.format(
                    lx, legend_y, lx + 24, legend_y, color, dash,
                    lx + 30, legend_y, label
                )
            )
            boxes_svg.append(legend_items_svg)
            lx += 115

        # --- assemble final SVG ---
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="{}" height="{}" '
            'viewBox="0 0 {} {}" '
            'style="background:white;font-family:sans-serif;max-width:100%;height:auto;">'.format(W, H, W, H)
        )
        svg += '<rect width="{}" height="{}" fill="white"/>'.format(W, H)
        # embed molecule
        svg += '<g transform="translate({},{})">'.format(CX - MOL_SIZE // 2, CY - MOL_SIZE // 2)
        svg += mol_inner
        svg += '</g>'
        # interaction lines (under boxes)
        svg += "".join(lines_svg)
        # residue boxes and labels
        svg += "".join(boxes_svg)
        svg += '</svg>'

        return svg
    except Exception:
        return None

def extract_inhibitor_smiles(pdb_content, pdb_id, res_name, chain_id):
    """Extracts a ligand from PDB and converts to SMILES for redocking."""
    try:
        # Save temp pdb of just the ligand
        temp_ligand_pdb = "tmp_lig_{}_{}.pdb".format(pdb_id, res_name)
        with open(temp_ligand_pdb, "w") as f:
            for line in pdb_content.splitlines():
                if line.startswith(("HETATM", "ATOM")):
                    rn = line[17:20].strip()
                    cid = line[21:22].strip()
                    if rn == res_name and cid == chain_id:
                        f.write(line + "\n")
        
        # Convert PDB to SMILES using OpenBabel
        result = subprocess.run(["obabel", "-ipdb", temp_ligand_pdb, "-osmi"], capture_output=True, text=True)
        if os.path.exists(temp_ligand_pdb): os.remove(temp_ligand_pdb)
        
        smiles = result.stdout.split()[0] if result.stdout else None
        return smiles
    except:
        return None

def _pdbqt_to_hetatm_lines(pdbqt_content, res_name="LIG", chain="Z"):
    """Converts PDBQT atom records to PDB HETATM lines (no obabel needed)."""
    lines = []
    serial = 1
    for line in pdbqt_content.splitlines():
        if not (line.startswith("ATOM") or line.startswith("HETATM")):
            continue
        try:
            # PDBQT format:
            # 0-6   Record
            # 12-16 Atom Name
            # 30-38 X
            # 38-46 Y
            # 46-54 Z
            # 77-79 Element
            atom_name = line[12:16].strip()
            if not atom_name: atom_name = "UNK"
            
            x_str = line[30:38].strip()
            y_str = line[38:46].strip()
            z_str = line[46:54].strip()
            
            x, y, z = float(x_str), float(y_str), float(z_str)
            
            element = ""
            if len(line) >= 79:
                element = line[76:78].strip()
            if not element:
                element = atom_name[0] if atom_name else "C"
                
            pdb_line = "HETATM{:5d} {:<4s} {:3s} {:1s}{:4d}    {:8.3f}{:8.3f}{:8.3f}  1.00  0.00          {:>2s}\n".format(
                serial % 100000, atom_name[:4], res_name[:3], chain[:1], 1, x, y, z, element[:2]
            )
            lines.append(pdb_line)
            serial += 1
        except Exception:
            continue
    return lines

def merge_receptor_ligand(receptor_pdb_path, ligand_pdbqt_content, output_pdb_path):
    """Merges receptor PDB and docked ligand PDBQT into a single PDB for PLIP."""
    try:
        with open(receptor_pdb_path, "r") as f:
            receptor_lines = [l for l in f if l.startswith(("ATOM", "TER"))]
        ligand_lines = _pdbqt_to_hetatm_lines(ligand_pdbqt_content)
        if not ligand_lines:
            return False, "No ligand atoms parsed from PDBQT"
        with open(output_pdb_path, "w") as f:
            f.writelines(receptor_lines)
            f.write("TER\n")
            f.writelines(ligand_lines)
            f.write("END\n")
        return True, None
    except Exception as e:
        return False, str(e)

def calculate_rmsd(ref_pdb_path, docked_pdbqt_path):
    """Calculates RMSD between co-crystallized and docked pose (simplified)."""
    # This would require atom mapping, for now return a placeholder or 
    # implement a simple distance-based RMSD if atoms match.
    return 0.0

def calculate_ligand_efficiency(affinity_kcal, smiles):
    """Calculates LE = -affinity / heavy_atom_count."""
    try:
        mol = Chem.MolFromSmiles(smiles)
        if not mol: return 0
        hac = mol.GetNumHeavyAtoms()
        if hac == 0: return 0
        return round(-float(affinity_kcal) / hac, 3)
    except:
        return 0

