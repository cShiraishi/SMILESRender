import sys
import json
import math
import warnings
warnings.filterwarnings("ignore")

HBOND_CUTOFF = 3.5
HYDROPHOB_CUTOFF = 4.5
PI_CUTOFF = 5.5

HBOND_DONORS    = {"N", "O", "S"}
HBOND_ACCEPTORS = {"N", "O", "S", "F"}
HYDROPHOB_ELEMS = {"C", "S"}

AROMATIC_RES = {"PHE", "TYR", "TRP", "HIS", "HID", "HIE", "HIP"}


def _dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _parse_pdb(pdb_file):
    protein_atoms = []
    ligand_atoms  = []
    with open(pdb_file) as f:
        for line in f:
            rec = line[:6].strip()
            if rec not in ("ATOM", "HETATM"):
                continue
            try:
                elem = line[76:78].strip() if len(line) >= 78 else line[12:16].strip()[:1]
                atom = {
                    "name":    line[12:16].strip(),
                    "resname": line[17:20].strip(),
                    "chain":   line[21:22].strip(),
                    "resnum":  int(line[22:26].strip()),
                    "x": float(line[30:38]),
                    "y": float(line[38:46]),
                    "z": float(line[46:54]),
                    "elem":    elem.upper()[:1],
                }
                coord = (atom["x"], atom["y"], atom["z"])
                atom["coord"] = coord
                if rec == "ATOM":
                    protein_atoms.append(atom)
                else:
                    ligand_atoms.append(atom)
            except Exception:
                continue
    return protein_atoms, ligand_atoms


def _residue_label(atom):
    return "{}{}{:d}".format(atom["resname"], atom["chain"], atom["resnum"])


def analyze(pdb_file):
    protein_atoms, ligand_atoms = _parse_pdb(pdb_file)

    if not ligand_atoms:
        return {"success": False, "error": "No ligand (HETATM) atoms in complex PDB"}

    hbonds      = []
    hydrophobic = []
    pi_stacking = []

    seen_hbond   = set()
    seen_hydro   = set()

    for la in ligand_atoms:
        for pa in protein_atoms:
            if pa["elem"] == "H":
                continue
            d = _dist(la["coord"], pa["coord"])
            res_label = _residue_label(pa)

            # H-bond: one end must be donor/acceptor capable
            if d <= HBOND_CUTOFF:
                if la["elem"] in HBOND_ACCEPTORS or la["elem"] in HBOND_DONORS:
                    if pa["elem"] in HBOND_ACCEPTORS or pa["elem"] in HBOND_DONORS:
                        key = (res_label, la["name"])
                        if key not in seen_hbond:
                            seen_hbond.add(key)
                            hbonds.append({
                                "residue": res_label,
                                "dist": round(d, 2),
                                "type": "H-Bond"
                            })

            # Hydrophobic: both C/S and within cutoff
            if d <= HYDROPHOB_CUTOFF:
                if la["elem"] in HYDROPHOB_ELEMS and pa["elem"] in HYDROPHOB_ELEMS:
                    key = res_label
                    if key not in seen_hydro:
                        seen_hydro.add(key)
                        hydrophobic.append({
                            "residue": res_label,
                            "dist": round(d, 2),
                            "type": "Hydrophobic"
                        })

    # Pi-stacking: check aromatic residues
    lig_carbons = [a["coord"] for a in ligand_atoms if a["elem"] == "C"]
    if lig_carbons:
        lig_cx = sum(c[0] for c in lig_carbons) / len(lig_carbons)
        lig_cy = sum(c[1] for c in lig_carbons) / len(lig_carbons)
        lig_cz = sum(c[2] for c in lig_carbons) / len(lig_carbons)
        lig_center = (lig_cx, lig_cy, lig_cz)

        aromatic_residues = {}
        for pa in protein_atoms:
            if pa["resname"] in AROMATIC_RES:
                rk = _residue_label(pa)
                if rk not in aromatic_residues:
                    aromatic_residues[rk] = []
                aromatic_residues[rk].append(pa["coord"])

        seen_pi = set()
        for rk, coords in aromatic_residues.items():
            cx = sum(c[0] for c in coords) / len(coords)
            cy = sum(c[1] for c in coords) / len(coords)
            cz = sum(c[2] for c in coords) / len(coords)
            d = _dist(lig_center, (cx, cy, cz))
            if d <= PI_CUTOFF and rk not in seen_pi:
                seen_pi.add(rk)
                pi_stacking.append({
                    "residue": rk,
                    "dist": round(d, 2),
                    "type": "Pi-Stacking"
                })

    return {
        "success": True,
        "interactions": {
            "hbonds":      hbonds,
            "hydrophobic": hydrophobic,
            "salt_bridges": [],
            "pi_stacking": pi_stacking
        }
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDB file provided"}))
        sys.exit(1)
    result = analyze(sys.argv[1])
    print(json.dumps(result))
