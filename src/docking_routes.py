import os
import hashlib
import json
import subprocess
import threading
from flask import request, jsonify, send_file
from docking_utils import get_pdb_from_rcsb, auto_detect_pocket_from_inhibitor, clean_pdb_for_docking, prepare_ligand_pdbqt
from rdkit import Chem

# Limit concurrent docking simulations to prevent RAM/CPU exhaustion on VPS
DOCKING_LOCK = threading.Semaphore(1)

# Use a session-based workspace for docking files
DOCKING_WORKSPACE = os.path.join(os.getcwd(), "tmp", "docking_sessions")
os.makedirs(DOCKING_WORKSPACE, exist_ok=True)

def init_docking_routes(app):
    
    @app.route("/api/docking/receptor/load-pdb-id", methods=["POST"])
    def load_receptor_by_id():
        """Downloads PDB by ID, cleans it, and auto-detects the pocket."""
        try:
            data = request.get_json()
            pdb_id = data.get("pdbId", "").upper()
            if not pdb_id or len(pdb_id) != 4:
                return jsonify({"error": "Invalid PDB ID"}), 400
                
            pdb_content = get_pdb_from_rcsb(pdb_id)
            if not pdb_content:
                return jsonify({"error": f"Could not find PDB {pdb_id} on RCSB"}), 404
                
            # Auto-detect pocket based on inhibitor (Plugin logic)
            pocket_data = auto_detect_pocket_from_inhibitor(pdb_content, pdb_id)
            
            # Clean PDB for simulation
            cleaned_pdb = clean_pdb_for_docking(pdb_content)
            
            # Save cleaned PDB to session workspace
            session_id = hashlib.md5(pdb_id.encode()).hexdigest()
            session_dir = os.path.join(DOCKING_WORKSPACE, session_id)
            os.makedirs(session_dir, exist_ok=True)
            
            pdb_path = os.path.join(session_dir, f"{pdb_id}_cleaned.pdb")
            with open(pdb_path, "w") as f:
                f.write(cleaned_pdb)
                
            return jsonify({
                "success": True,
                "pdbId": pdb_id,
                "pocket": pocket_data,
                "pdbPath": pdb_path,
                "pdbContent": cleaned_pdb
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/docking/run", methods=["POST"])
    def run_docking():
        try:
            with DOCKING_LOCK:
                data = request.get_json()
                receptor_path = data.get("receptorPath")
            ligand_smiles = data.get("smiles")
            center = data.get("center")
            size = data.get("size")
            
            if not all([receptor_path, ligand_smiles, center, size]):
                return jsonify({"error": "Missing parameters"}), 400
            
            pdbqt_ligand, err = prepare_ligand_pdbqt(ligand_smiles)
            if err: return jsonify({"error": f"Ligand prep failed: {err}"}), 500
                
            session_dir = os.path.dirname(receptor_path)
            ligand_path = os.path.join(session_dir, "ligand.pdbqt")
            with open(ligand_path, "w") as f: f.write(pdbqt_ligand)
                
            receptor_pdbqt_path = receptor_path.replace(".pdb", ".pdbqt")
            try:
                subprocess.run(["obabel", "-ipdb", receptor_path, "-opdbqt", "-O", receptor_pdbqt_path, "-xr", "-h"], check=True)
            except:
                return jsonify({"error": "Failed to convert receptor to PDBQT"}), 500
            
            output_path = os.path.join(session_dir, "output.pdbqt")
            log_path = os.path.join(session_dir, "docking.log")
            
            vina_cmd = [
                "vina", "--receptor", receptor_pdbqt_path, "--ligand", ligand_path,
                "--center_x", str(center['x']), "--center_y", str(center['y']), "--center_z", str(center['z']),
                "--size_x", str(size['x']), "--size_y", str(size['y']), "--size_z", str(size['z']),
                "--out", output_path, "--log", log_path, "--exhaustiveness", "8"
            ]
            
            try:
                subprocess.run(vina_cmd, check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as e:
                return jsonify({"error": f"Vina failed: {e.stderr}"}), 500
            except FileNotFoundError:
                return jsonify({"error": "Vina executable not found"}), 500
                
            scores = []
            if os.path.exists(log_path):
                with open(log_path, "r") as f:
                    lines = f.readlines()
                    capture = False
                    for line in lines:
                        if "mode |   affinity | dist from rmsd" in line: capture = True; continue
                        if capture and (line.startswith("----") or line.strip() == ""):
                            if line.strip() == "" and len(scores) > 0: break
                            continue
                        if capture:
                            parts = line.split()
                            if len(parts) >= 2:
                                scores.append({"mode": parts[0], "affinity": parts[1]})

            complex_path = os.path.join(session_dir, "complex.pdb")
            best_pose_pdbqt = ""
            if os.path.exists(output_path):
                with open(output_path, "r") as f:
                    for line in f:
                        best_pose_pdbqt += line
                        if line.startswith("ENDMDL"): break
            
            from docking_utils import merge_receptor_ligand, calculate_ligand_efficiency, generate_2d_interaction_diagram
            merge_receptor_ligand(receptor_path, best_pose_pdbqt, complex_path)
            
            # Calculate LE
            le = calculate_ligand_efficiency(scores[0]['affinity'], ligand_smiles) if scores else 0
            
            return jsonify({
                "success": True,
                "scores": scores,
                "le": le,
                "outputPdbqt": output_path,
                "complexPath": complex_path,
                "logPath": log_path,
                "sessionId": os.path.basename(session_dir)
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/docking/analyze", methods=["POST"])
    def analyze_interactions():
        try:
            data = request.get_json()
            complex_path = data.get("complexPath")
            if not complex_path or not os.path.exists(complex_path):
                return jsonify({"error": "Complex file not found"}), 404
            
            plip_script = os.path.join(os.getcwd(), "plataformadocking2", "plataformadocking2", "plip_runner.py")
            cmd = ["python", plip_script, complex_path]
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                return jsonify({"error": f"PLIP failed: {result.stderr}"}), 500
                
            plip_data = json.loads(result.stdout)
            
            # Generate 2D Diagram
            # We need the SMILES from the session (ligand.pdbqt or just store it)
            # For now, let's try to get it from the session directory if we had it, 
            # but better yet, let's assume we can regenerate it or pass it.
            # In this simple version, we'll just return the diagram if we can find the ligand info.
            from docking_utils import generate_2d_interaction_diagram
            # We'll need to pass the SMILES here. Let's assume the frontend sends it or we fetch it.
            ligand_smiles = data.get("smiles", "")
            diagram_svg = generate_2d_interaction_diagram(ligand_smiles, plip_data) if ligand_smiles else None
            
            return jsonify({**plip_data, "diagram": diagram_svg})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/docking/download", methods=["GET"])
    def download_docking_results():
        session_id = request.args.get("session")
        session_dir = os.path.join(DOCKING_WORKSPACE, session_id)
        if not os.path.exists(session_dir): return "Session not found", 404
        
        import zipfile
        zip_path = os.path.join(DOCKING_WORKSPACE, f"results_{session_id}.zip")
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, dirs, files in os.walk(session_dir):
                for file in files:
                    zipf.write(os.path.join(root, file), file)
        return send_file(zip_path, as_attachment=True, download_name=f"docking_results_{session_id}.zip")
