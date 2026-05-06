import os
import shutil
import hashlib
import json
import subprocess
import threading
from flask import request, jsonify, send_file

# Limit concurrent docking simulations to prevent RAM/CPU exhaustion on VPS
DOCKING_LOCK = threading.Semaphore(1)

# Use a session-based workspace for docking files
DOCKING_WORKSPACE = os.path.join(os.getcwd(), "tmp", "docking_sessions")
if not os.path.exists(DOCKING_WORKSPACE):
    os.makedirs(DOCKING_WORKSPACE)

_VINA_CANDIDATES = [
    "vina",
    r"C:\Program Files (x86)\The Scripps Research Institute\Vina\vina.exe",
    r"C:\Program Files\The Scripps Research Institute\Vina\vina.exe",
    "/usr/bin/vina",
    "/usr/local/bin/vina",
]

def _find_vina():
    for candidate in _VINA_CANDIDATES:
        if shutil.which(candidate) or os.path.isfile(candidate):
            return candidate
    return None

VINA_EXE = _find_vina()

def init_docking_routes(app):
    
    @app.route("/api/docking/receptor/load-pdb-id", methods=["POST"])
    def load_receptor_by_id():
        """Downloads PDB by ID, cleans it, and auto-detects the pocket."""
        try:
            from docking_utils import get_pdb_from_rcsb, auto_detect_pocket_from_inhibitor, clean_pdb_for_docking, get_rcsb_ligands
            data = request.get_json()
            pdb_id = data.get("pdbId", "").upper()
            ligand_id = data.get("ligandId")
            chain_id = data.get("chainId")

            if not pdb_id or len(pdb_id) != 4:
                return jsonify({"error": "Invalid PDB ID"}), 400

            pdb_content = get_pdb_from_rcsb(pdb_id)
            if not pdb_content:
                return jsonify({"error": "Could not find PDB " + str(pdb_id) + " on RCSB"}), 404

            rcsb_ligands = get_rcsb_ligands(pdb_id)
            pocket_data = auto_detect_pocket_from_inhibitor(pdb_content, pdb_id, ligand_id, chain_id)
            cleaned_pdb = clean_pdb_for_docking(pdb_content)

            # Also save the original PDB for pocket detection queries
            session_id = hashlib.md5(pdb_id.encode()).hexdigest()
            session_dir = os.path.join(DOCKING_WORKSPACE, session_id)
            if not os.path.exists(session_dir):
                os.makedirs(session_dir)

            pdb_path = os.path.join(session_dir, str(pdb_id) + "_cleaned.pdb")
            orig_path = os.path.join(session_dir, str(pdb_id) + "_original.pdb")
            with open(pdb_path, "w") as f:
                f.write(cleaned_pdb)
            with open(orig_path, "w") as f:
                f.write(pdb_content)

            # --- Save Native Ligand PDBQT for Redocking Comparison ---
            if pocket_data.get("success") and pocket_data.get("inhibitor"):
                from docking_utils import extract_inhibitor_smiles
                res_name = pocket_data["inhibitor"]
                cid = pocket_data.get("chain")
                
                native_pdbqt_path = os.path.join(session_dir, "native.pdbqt")
                native_lines = []
                for line in pdb_content.splitlines():
                    if line.startswith(("HETATM", "ATOM")):
                        rn = line[17:20].strip()
                        curr_cid = line[21:22].strip()
                        if rn == res_name and (not cid or curr_cid == cid):
                            native_lines.append(line)
                if native_lines:
                    with open(native_pdbqt_path, "w") as f:
                        f.write("\n".join(native_lines))

            return jsonify({
                "success": True,
                "pdbId": pdb_id,
                "pocket": pocket_data,
                "pdbPath": pdb_path,
                "pdbContent": cleaned_pdb,
                "rcsbLigands": rcsb_ligands
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/docking/receptor/detect-pocket", methods=["POST"])
    def detect_pocket():
        """Re-detects the binding pocket from a specific ligand without re-preparing the receptor."""
        try:
            from docking_utils import auto_detect_pocket_from_inhibitor
            data = request.get_json()
            pdb_id = data.get("pdbId", "").upper()
            ligand_id = data.get("ligandId", "").strip().upper() or None
            chain_id = data.get("chainId", "").strip().upper() or None

            if not pdb_id:
                return jsonify({"error": "Missing pdbId"}), 400

            # Read original PDB from session (already downloaded)
            session_id = hashlib.md5(pdb_id.encode()).hexdigest()
            orig_path = os.path.join(DOCKING_WORKSPACE, session_id, str(pdb_id) + "_original.pdb")
            if os.path.exists(orig_path):
                with open(orig_path, "r") as f:
                    pdb_content = f.read()
            else:
                # Fallback: download again
                from docking_utils import get_pdb_from_rcsb
                pdb_content = get_pdb_from_rcsb(pdb_id)
                if not pdb_content:
                    return jsonify({"error": "Could not fetch PDB " + pdb_id}), 404

            pocket = auto_detect_pocket_from_inhibitor(pdb_content, pdb_id, ligand_id, chain_id)
            return jsonify(pocket)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/docking/receptor/extract-inhibitor", methods=["POST"])
    def extract_inhibitor():
        try:
            from docking_utils import get_pdb_from_rcsb, extract_inhibitor_smiles
            data = request.get_json()
            pdb_id = data.get("pdbId")
            res_name = data.get("resName")
            chain_id = data.get("chainId")
            
            pdb_content = get_pdb_from_rcsb(pdb_id)
            if not pdb_content: return jsonify({"error": "PDB not found"}), 404
            
            smiles = extract_inhibitor_smiles(pdb_content, pdb_id, res_name, chain_id)
            if not smiles: return jsonify({"error": "Failed to extract SMILES"}), 500
            
            return jsonify({"success": True, "smiles": smiles, "name": "Inhibitor_" + str(res_name)})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/docking/run", methods=["POST"])
    def run_docking():
        try:
            from docking_utils import prepare_ligand_pdbqt, merge_receptor_ligand, calculate_ligand_efficiency
            with DOCKING_LOCK:
                data = request.get_json()
                receptor_path = data.get("receptorPath")
                ligand_smiles = data.get("smiles")
                center = data.get("center")
                size = data.get("size")
                
                if not all([receptor_path, ligand_smiles, center, size]):
                    return jsonify({"error": "Missing parameters"}), 400
                
                session_dir = os.path.dirname(receptor_path)
                receptor_pdbqt_path = receptor_path.replace(".pdb", ".pdbqt")
                out_prefix = receptor_path.replace(".pdb", "")
                try:
                    subprocess.run(
                        ["mk_prepare_receptor", "--read_pdb", receptor_path,
                         "-o", out_prefix, "--default_altloc", "A", "--allow_bad_res", "-p"],
                        check=True, capture_output=True, text=True
                    )
                except Exception as e:
                    return jsonify({"error": "Failed to convert receptor to PDBQT: " + str(e)}), 500
                
                exhaustiveness = data.get("exhaustiveness", 8)
                num_modes = data.get("numModes", 9)
                
                ligand_path = os.path.join(session_dir, "ligand.pdbqt")
                pdbqt_content, err = prepare_ligand_pdbqt(ligand_smiles)
                if err: return jsonify({"error": "Ligand prep failed: " + str(err)}), 500
                with open(ligand_path, "w") as f: f.write(pdbqt_content)
                
                if not VINA_EXE:
                    return jsonify({"error": "AutoDock Vina not found. Please install it."}), 500

                output_path = os.path.join(session_dir, "output.pdbqt")
                vina_cmd = [
                    VINA_EXE, "--receptor", receptor_pdbqt_path, "--ligand", ligand_path,
                    "--center_x", str(center['x']), "--center_y", str(center['y']), "--center_z", str(center['z']),
                    "--size_x", str(size['x']), "--size_y", str(size['y']), "--size_z", str(size['z']),
                    "--out", output_path, "--exhaustiveness", str(exhaustiveness),
                    "--num_modes", str(num_modes)
                ]

                result_vina = subprocess.run(vina_cmd, check=True, capture_output=True, text=True)
                vina_output = result_vina.stdout
                
                from docking_utils import calculate_rmsd
                native_pdbqt = os.path.join(session_dir, "native.pdbqt")
                has_native = os.path.exists(native_pdbqt)

                scores = []
                vina_output_lines = vina_output.splitlines()
                capture = False
                for line in vina_output_lines:
                    if "mode |   affinity" in line: capture = True; continue
                    if capture and line.startswith("-----"): continue
                    if capture and line.strip() == "" and len(scores) > 0: break
                    if capture:
                        parts = line.split()
                        if len(parts) >= 4 and parts[0].isdigit():
                            mode_idx = int(parts[0]) - 1 # 0-indexed
                            # Extract this pose content for RMSD
                            pose_content = ""
                            curr_m = 0
                            with open(output_path, "r") as f:
                                cap_m = False
                                for pline in f:
                                    if pline.startswith("MODEL"):
                                        if curr_m == mode_idx: cap_m = True
                                    if cap_m: pose_content += pline
                                    if pline.startswith("ENDMDL"):
                                        if cap_m: break
                                        curr_m += 1
                            
                            rmsd = None
                            if has_native and pose_content:
                                rmsd = calculate_rmsd(native_pdbqt, pose_content)
                            
                            scores.append({
                                "mode": parts[0], 
                                "affinity": parts[1],
                                "rmsd": rmsd
                            })

                complex_path = os.path.join(session_dir, "complex.pdb")
                best_pose_pdbqt = ""
                if os.path.exists(output_path):
                    with open(output_path, "r") as f:
                        for line in f:
                            best_pose_pdbqt += line
                            if line.startswith("ENDMDL"): break
                
                merge_receptor_ligand(receptor_path, best_pose_pdbqt, complex_path)
                le = calculate_ligand_efficiency(scores[0]['affinity'], ligand_smiles) if scores else 0
                
                return jsonify({
                    "success": True,
                    "scores": scores,
                    "le": le,
                    "hasNative": has_native,
                    "outputPdbqt": output_path,
                    "complexPath": complex_path,
                    "sessionId": os.path.basename(session_dir)
                })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/docking/analyze", methods=["POST"])
    def analyze_interactions():
        """Runs PLIP analysis on a specific docking complex or pose."""
        try:
            from docking_utils import generate_2d_interaction_diagram, merge_receptor_ligand
            data = request.get_json()
            complex_path = data.get("complexPath")
            pose_idx = data.get("poseIdx", 0) # 0-indexed
            session_id = data.get("sessionId")
            
            if session_id and pose_idx > 0:
                # Need to extract specific pose from output.pdbqt
                session_dir = os.path.join(DOCKING_WORKSPACE, session_id)
                output_path = os.path.join(session_dir, "output.pdbqt")
                receptor_path = None
                # Find receptor path in session dir
                for f in os.listdir(session_dir):
                    if f.endswith("_cleaned.pdb"):
                        receptor_path = os.path.join(session_dir, f)
                        break
                
                if os.path.exists(output_path) and receptor_path:
                    pose_pdbqt = ""
                    curr_idx = 0
                    with open(output_path, "r") as f:
                        capturing = False
                        for line in f:
                            if line.startswith("MODEL"):
                                if curr_idx == pose_idx: capturing = True
                            if capturing:
                                pose_pdbqt += line
                                if line.startswith("ENDMDL"):
                                    capturing = False
                                    break
                            if line.startswith("ENDMDL"):
                                curr_idx += 1
                    
                    if pose_pdbqt:
                        complex_path = os.path.join(session_dir, "complex_" + str(pose_idx) + ".pdb")
                        ok, err = merge_receptor_ligand(receptor_path, pose_pdbqt, complex_path)
                        if not ok:
                            return jsonify({"error": "Failed to merge complex: " + str(err)}), 500
                    else:
                        return jsonify({"error": "Could not find pose " + str(pose_idx) + " in output"}), 404
                else:
                    return jsonify({"error": "Missing output.pdbqt or cleaned receptor"}), 404

            if not complex_path or not os.path.exists(complex_path):
                return jsonify({"error": "Complex file not found at " + str(complex_path)}), 404
            
            import sys as _sys
            _current = os.path.dirname(os.path.abspath(__file__))
            if _current not in _sys.path:
                _sys.path.insert(0, _current)
            import plip_runner
            import importlib
            importlib.reload(plip_runner)
            plip_data = plip_runner.analyze(complex_path)
            ligand_smiles = data.get("smiles", "")
            diagram_svg = generate_2d_interaction_diagram(ligand_smiles, plip_data) if ligand_smiles else None
            
            plip_data["diagram"] = diagram_svg
            plip_data["poseIdx"] = pose_idx
            return jsonify(plip_data)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/docking/viewer")
    def standalone_viewer():
        """Returns a standalone HTML page for 3D visualization using 3Dmol.js."""
        pdb_id = request.args.get("pdb")
        cx = request.args.get("cx", "0")
        cy = request.args.get("cy", "0")
        cz = request.args.get("cz", "0")
        sx = request.args.get("sx", "20")
        sy = request.args.get("sy", "20")
        sz = request.args.get("sz", "20")
        color = request.args.get("color", "blue")
        
        # Add a version comment to help debug if the server is updated
        # Version: 2026-05-06-B
        
        return """<!DOCTYPE html>
<html>
<head>
    <script src="https://3dmol.org/build/3Dmol-min.js"></script>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; background: white; }
        #v { width: 100vw; height: 100vh; position: relative; }
        #err { display:none; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
               background:#fff3cd; border:1px solid #ffc107; padding:16px 24px;
               border-radius:8px; font-family:sans-serif; font-size:14px; color:#856404; text-align:center; }
    </style>
</head>
<body>
    <div id="v"></div>
    <div id="err"></div>
    <script>
        var pdbId = \"""" + str(pdb_id) + """\";
        var cx = parseFloat(\"""" + str(cx) + """\");
        var cy = parseFloat(\"""" + str(cy) + """\");
        var cz = parseFloat(\"""" + str(cz) + """\");
        var sx = parseFloat(\"""" + str(sx) + """\");
        var sy = parseFloat(\"""" + str(sy) + """\");
        var sz = parseFloat(\"""" + str(sz) + """\");
        var boxColor = \"""" + str(color) + """\";

        function showErr(msg) {
            var el = document.getElementById("err");
            el.textContent = msg;
            el.style.display = "block";
        }

        if (!pdbId || pdbId.length !== 4) {
            showErr("No PDB ID provided.");
        } else {
            var viewer = $3Dmol.createViewer(document.getElementById("v"), { backgroundColor: "white" });
            $3Dmol.download("pdb:" + pdbId, viewer, {}, function() {
                viewer.setStyle({}, { cartoon: { colorscheme: "spectrum", opacity: 0.8 } });
                viewer.addBox({
                    center: { x: cx, y: cy, z: cz },
                    dimensions: { w: sx, h: sy, d: sz },
                    color: boxColor,
                    wireframe: true,
                    linewidth: 2
                });
                viewer.zoomTo();
                viewer.render();
            });
            viewer.resize();
            window.addEventListener("resize", function() { viewer.resize(); });
        }
    </script>
</body>
</html>"""

    @app.route("/api/docking/files/<session_id>/<filename>")
    def serve_docking_file(session_id, filename):
        try:
            safe_filename = os.path.basename(filename)
            path = os.path.join(DOCKING_WORKSPACE, session_id, safe_filename)
            if os.path.exists(path):
                return send_file(path)
            return "File not found", 404
        except:
            return "Error serving file", 500

    @app.route("/api/docking/download", methods=["GET"])
    def download_docking_results():
        session_id = request.args.get("session")
        session_dir = os.path.join(DOCKING_WORKSPACE, session_id)
        if not os.path.exists(session_dir): return "Session not found", 404
        
        import zipfile
        zip_path = os.path.join(DOCKING_WORKSPACE, "results_" + str(session_id) + ".zip")
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, dirs, files in os.walk(session_dir):
                for file in files:
                    zipf.write(os.path.join(root, file), file)
        return send_file(zip_path, as_attachment=True, download_name="docking_results_" + str(session_id) + ".zip")
