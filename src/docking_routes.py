import os
import math
import shutil
import hashlib
import json
import subprocess
import threading
import itertools
import multiprocessing
import heapq
from contextlib import contextmanager
from flask import request, jsonify, send_file

# ── Docking scheduler ─────────────────────────────────────────────────────────
# Priority levels (lower = higher priority)
PRIORITY_INTERACTIVE = 0   # single manual docking — user is watching
PRIORITY_QUEUE       = 1   # single-target queue entries
PRIORITY_SCREENING   = 2   # multi-target batch screening
PRIORITY_BACKGROUND  = 3   # redocking reference (auto background)

_CPU_COUNT            = multiprocessing.cpu_count() or 4
N_CONCURRENT_DOCKING  = max(1, _CPU_COUNT // 4)   # 4 on 16-core
CPUS_PER_DOCKING_JOB  = max(1, _CPU_COUNT // N_CONCURRENT_DOCKING)  # 4 each
MAX_QUEUED_JOBS       = 60  # reject if more pending than this

class _DockingScheduler:
    """
    Priority-ordered, bounded concurrency gate for Vina jobs.
    High-priority jobs (interactive) jump ahead of batch/screening jobs.
    Rejects new work when the queue is full to prevent server overload.
    """

    def __init__(self, n_workers: int, max_total: int):
        self._n_workers = n_workers
        self._max_total = max_total
        self._cond      = threading.Condition(threading.Lock())
        self._heap: list = []          # (priority, seq, unique_id)
        self._active     = 0
        self._seq        = itertools.count()

    @contextmanager
    def slot(self, priority: int = PRIORITY_SCREENING):
        uid = object()  # unique per-call identity marker
        with self._cond:
            pending = len(self._heap) + self._active
            if pending >= self._max_total:
                raise RuntimeError(
                    f"Servidor sobrecarregado: {pending} jobs em fila. "
                    "Aguarde alguns instantes e tente novamente."
                )
            seq = next(self._seq)
            heapq.heappush(self._heap, (priority, seq, id(uid)))

            # Block until we're at the front AND a worker slot is free
            while not (
                self._heap
                and self._heap[0][2] == id(uid)
                and self._active < self._n_workers
            ):
                self._cond.wait()
            heapq.heappop(self._heap)
            self._active += 1

        try:
            yield
        finally:
            with self._cond:
                self._active -= 1
                self._cond.notify_all()

    @property
    def status(self) -> dict:
        with self._cond:
            return {
                "workers":     self._n_workers,
                "active":      self._active,
                "queued":      len(self._heap),
                "cpusPerJob":  CPUS_PER_DOCKING_JOB,
                "totalCpus":   _CPU_COUNT,
            }


DOCKING_SCHEDULER = _DockingScheduler(N_CONCURRENT_DOCKING, MAX_QUEUED_JOBS)

# Use a session-based workspace for docking files
DOCKING_WORKSPACE = os.path.join(os.getcwd(), "tmp", "docking_sessions")
if not os.path.exists(DOCKING_WORKSPACE):
    os.makedirs(DOCKING_WORKSPACE)

# Persistent redocking cache — computed once per target, reused forever
REDOCKING_CACHE_PATH = os.path.join(os.getcwd(), "tmp", "redocking_cache.json")
_redocking_cache_lock = threading.Lock()

def _load_redocking_cache():
    with _redocking_cache_lock:
        if os.path.exists(REDOCKING_CACHE_PATH):
            with open(REDOCKING_CACHE_PATH, "r") as f:
                return json.load(f)
        return {}

def _save_redocking_cache(cache):
    with _redocking_cache_lock:
        with open(REDOCKING_CACHE_PATH, "w") as f:
            json.dump(cache, f, indent=2)

_VINA_CANDIDATES = [
    "vina",
    r"C:\Program Files (x86)\The Scripps Research Institute\Vina\vina.exe",
    r"C:\Program Files\The Scripps Research Institute\Vina\vina.exe",
    "/usr/bin/vina",
    "/usr/local/bin/vina",
]

def _prepare_receptor_pdbqt(pdb_path: str, out_prefix: str) -> tuple[str, str | None]:
    """
    Converts a cleaned receptor PDB to PDBQT.
    - Tries mk_prepare_receptor with -p (partial charges); tolerates non-zero exit if PDBQT produced
    - Retries without -p for metal-containing structures (zinc, etc.) where -p fails
    - Falls back to obabel if both attempts fail to produce a file
    Returns (pdbqt_path, error_message_or_None).
    """
    pdbqt_path = out_prefix + ".pdbqt"
    mk_stderr_p = ""
    mk_stderr_2 = ""
    mk_missing = False

    # ── attempt 1: mk_prepare_receptor with partial charges ───────────────────
    try:
        proc = subprocess.run(
            ["mk_prepare_receptor", "--read_pdb", pdb_path,
             "-o", out_prefix, "--default_altloc", "A", "--allow_bad_res", "-p"],
            capture_output=True, text=True, timeout=120,
        )
        if os.path.exists(pdbqt_path) and os.path.getsize(pdbqt_path) > 50:
            return pdbqt_path, None
        mk_stderr_p = (proc.stderr or "").strip()[:600]
    except FileNotFoundError:
        mk_missing = True

    # ── attempt 2: mk_prepare_receptor without -p (for zinc/metalloproteins) ──
    if not mk_missing:
        if os.path.exists(pdbqt_path):
            os.remove(pdbqt_path)
        try:
            proc2 = subprocess.run(
                ["mk_prepare_receptor", "--read_pdb", pdb_path,
                 "-o", out_prefix, "--default_altloc", "A", "--allow_bad_res"],
                capture_output=True, text=True, timeout=120,
            )
            if os.path.exists(pdbqt_path) and os.path.getsize(pdbqt_path) > 50:
                return pdbqt_path, None
            mk_stderr_2 = (proc2.stderr or "").strip()[:600]
        except FileNotFoundError:
            mk_missing = True

    # ── attempt 3: obabel fallback ────────────────────────────────────────────
    try:
        subprocess.run(
            ["obabel", pdb_path, "-O", pdbqt_path, "-xr"],
            capture_output=True, text=True, timeout=60, check=False,
        )
        if os.path.exists(pdbqt_path) and os.path.getsize(pdbqt_path) > 50:
            return pdbqt_path, None
    except FileNotFoundError:
        pass  # obabel not installed

    if mk_missing:
        return "", "Falha ao converter receptor para PDBQT: mk_prepare_receptor não encontrado no PATH. Instale o pacote meeko no ambiente Docker."

    mk_stderr = mk_stderr_p or mk_stderr_2
    return "", (
        f"Falha ao converter receptor para PDBQT.\n"
        f"mk_prepare_receptor: {mk_stderr or '(sem saída)'}"
    )

def _find_vina():
    for candidate in _VINA_CANDIDATES:
        if shutil.which(candidate) or os.path.isfile(candidate):
            return candidate
    return None

VINA_EXE = _find_vina()

_DOCKING_ROUTES_INIT = False

def init_docking_routes(app):
    global _DOCKING_ROUTES_INIT
    if _DOCKING_ROUTES_INIT:
        return
    _DOCKING_ROUTES_INIT = True
    
    @app.route("/api/docking/receptor/load-pdb-id", methods=["POST"])
    def load_receptor_by_id_endpoint():
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

    @app.route("/api/docking/redocking/reference", methods=["POST"])
    def redocking_reference():
        """
        Returns the native-inhibitor redocking affinity for a given PDB target.
        Result is cached in tmp/redocking_cache.json — computed only once per target.
        """
        try:
            from docking_utils import (get_pdb_from_rcsb, auto_detect_pocket_from_inhibitor,
                                       extract_inhibitor_smiles, clean_pdb_for_docking, prepare_ligand_pdbqt)
            data = request.get_json()
            pdb_id   = (data.get("pdbId") or "").strip().upper()
            lig_id   = (data.get("ligandId") or "").strip().upper() or None
            chain_id = (data.get("chainId") or "").strip().upper() or None

            if not pdb_id or len(pdb_id) != 4:
                return jsonify({"error": "Invalid pdbId"}), 400

            cache_key = f"{pdb_id}_{lig_id}_{chain_id}"
            cache = _load_redocking_cache()
            if cache_key in cache:
                return jsonify({**cache[cache_key], "cached": True})

            # --- not cached: compute now ---
            with DOCKING_SCHEDULER.slot(PRIORITY_BACKGROUND):
                session_id  = hashlib.md5(pdb_id.encode()).hexdigest()
                session_dir = os.path.join(DOCKING_WORKSPACE, session_id)
                os.makedirs(session_dir, exist_ok=True)

                orig_path    = os.path.join(session_dir, f"{pdb_id}_original.pdb")
                cleaned_path = os.path.join(session_dir, f"{pdb_id}_cleaned.pdb")

                if os.path.exists(orig_path):
                    with open(orig_path) as f:
                        pdb_content = f.read()
                else:
                    pdb_content = get_pdb_from_rcsb(pdb_id)
                    if not pdb_content:
                        return jsonify({"error": f"PDB {pdb_id} not found on RCSB"}), 404
                    with open(orig_path, "w") as f:
                        f.write(pdb_content)

                pocket = auto_detect_pocket_from_inhibitor(pdb_content, pdb_id, lig_id, chain_id)
                if not pocket.get("success"):
                    return jsonify({"error": "Pocket detection failed", "details": pocket}), 400

                real_inhibitor = pocket.get("inhibitor") or lig_id
                real_chain     = pocket.get("chain") or chain_id

                smiles = extract_inhibitor_smiles(pdb_content, pdb_id, real_inhibitor, real_chain)
                if not smiles:
                    return jsonify({"error": f"Could not extract SMILES for {real_inhibitor}"}), 500

                # Prepare receptor PDBQT (reuse if already present)
                if not os.path.exists(cleaned_path):
                    with open(cleaned_path, "w") as f:
                        f.write(clean_pdb_for_docking(pdb_content))

                receptor_pdbqt = cleaned_path.replace(".pdb", ".pdbqt")
                if not os.path.exists(receptor_pdbqt) or os.path.getsize(receptor_pdbqt) < 50:
                    receptor_pdbqt, prep_err = _prepare_receptor_pdbqt(
                        cleaned_path, cleaned_path.replace(".pdb", "")
                    )
                    if prep_err:
                        return jsonify({"error": prep_err}), 500

                # Prepare native ligand PDBQT
                pdbqt_content, err = prepare_ligand_pdbqt(smiles)
                if err:
                    return jsonify({"error": f"Ligand prep failed: {err}"}), 500
                native_lig_path = os.path.join(session_dir, "native_ref_ligand.pdbqt")
                with open(native_lig_path, "w") as f:
                    f.write(pdbqt_content)

                if not VINA_EXE:
                    return jsonify({"error": "AutoDock Vina not found"}), 500

                center = pocket["center"]
                size   = pocket["size"]
                out_path = os.path.join(session_dir, "native_ref_out.pdbqt")

                vina_proc = subprocess.run(
                    [VINA_EXE,
                     "--receptor", receptor_pdbqt,
                     "--ligand", native_lig_path,
                     "--center_x", str(center["x"]),
                     "--center_y", str(center["y"]),
                     "--center_z", str(center["z"]),
                     "--size_x", str(size["x"]),
                     "--size_y", str(size["y"]),
                     "--size_z", str(size["z"]),
                     "--exhaustiveness", "4",
                     "--num_modes", "3",
                     "--cpu", str(CPUS_PER_DOCKING_JOB),
                     "--out", out_path],
                    capture_output=True, text=True, timeout=180
                )

                # Parse Vina score table
                scores = []
                capture = False
                for line in vina_proc.stdout.splitlines():
                    if "mode |   affinity" in line: capture = True; continue
                    if capture and line.startswith("-----"): continue
                    if capture and line.strip() == "" and scores: break
                    if capture:
                        parts = line.split()
                        if len(parts) >= 2 and parts[0].isdigit():
                            scores.append({"mode": parts[0], "affinity": float(parts[1])})

                if not scores:
                    return jsonify({"error": "Vina produced no output",
                                    "stdout": vina_proc.stdout, "stderr": vina_proc.stderr}), 500

                result = {
                    "pdbId": pdb_id,
                    "inhibitor": real_inhibitor,
                    "smiles": smiles,
                    "affinity": scores[0]["affinity"],
                }
                cache[cache_key] = result
                _save_redocking_cache(cache)

                return jsonify({**result, "cached": False})
        except Exception as e:
            import traceback
            return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

    @app.route("/api/docking/status", methods=["GET"])
    def docking_status():
        return jsonify(DOCKING_SCHEDULER.status)

    @app.route("/api/docking/run", methods=["POST"])
    def run_docking():
        try:
            from docking_utils import prepare_ligand_pdbqt, merge_receptor_ligand, calculate_ligand_efficiency
            data = request.get_json()
            # Priority: screening jobs send priority=2; single/queue send 0 or 1
            _priority = int(data.get("priority", PRIORITY_SCREENING)) if data else PRIORITY_SCREENING
            with DOCKING_SCHEDULER.slot(_priority):
                receptor_path = data.get("receptorPath")
                ligand_smiles = data.get("smiles")
                center = data.get("center")
                size = data.get("size")
                
                if not all([receptor_path, ligand_smiles, center, size]):
                    return jsonify({"error": "Missing parameters"}), 400
                
                session_dir = os.path.dirname(receptor_path)
                receptor_pdbqt_path = receptor_path.replace(".pdb", ".pdbqt")
                out_prefix = receptor_path.replace(".pdb", "")
                # Reuse cached PDBQT if already prepared (avoids re-running on every call)
                if not os.path.exists(receptor_pdbqt_path) or os.path.getsize(receptor_pdbqt_path) < 50:
                    receptor_pdbqt_path, prep_err = _prepare_receptor_pdbqt(receptor_path, out_prefix)
                    if prep_err:
                        return jsonify({"error": prep_err}), 500
                
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
                    "--num_modes", str(num_modes),
                    "--cpu", str(CPUS_PER_DOCKING_JOB),
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
                            
                            # Predicted Inhibition (Ki) calculation
                            # dG = RT ln Ki => Ki = exp(dG / RT)
                            # R = 1.987e-3 kcal/mol/K, T = 298.15 K => RT = 0.592
                            try:
                                dg = float(parts[1])
                                ki_val = math.exp(dg / 0.592)
                                if ki_val < 1e-6:
                                    ki_str = "{:.2f} nM".format(ki_val * 1e9)
                                elif ki_val < 1e-3:
                                    ki_str = "{:.2f} µM".format(ki_val * 1e6)
                                else:
                                    ki_str = "{:.2f} mM".format(ki_val * 1e3)
                            except:
                                ki_str = "N/A"

                            scores.append({
                                "mode": parts[0], 
                                "affinity": parts[1],
                                "rmsd": rmsd,
                                "ki": ki_str
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
        session_id = request.args.get("session", "")
        pose_idx = request.args.get("pose", "0")
        affinity = request.args.get("aff", "")

        # Build the complex PDB URL if a session is available
        complex_file = "complex.pdb" if pose_idx == "0" else ("complex_" + str(pose_idx) + ".pdb")
        complex_url = ("/api/docking/files/" + str(session_id) + "/" + complex_file) if session_id else ""

        return """<!DOCTYPE html>
<html>
<head>
    <script src="https://3dmol.org/build/3Dmol-min.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; background: #1a1a2e; font-family: -apple-system, sans-serif; }
        #v { width: 100vw; height: 100vh; }
        #err { display:none; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
               background:#fff3cd; border:1px solid #ffc107; padding:16px 24px;
               border-radius:8px; font-size:14px; color:#856404; text-align:center; }
        /* Badge: affinity top-left */
        #badge {
            display:none; position:absolute; top:10px; left:10px;
            background:rgba(0,0,0,0.75); color:#fff; border-radius:8px;
            padding:8px 14px; font-size:12px; line-height:1.6;
            backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,0.15);
        }
        /* Style toolbar: top-right */
        #toolbar {
            position:absolute; top:10px; right:10px;
            display:flex; flex-direction:column; gap:4px;
        }
        .tb-group {
            background:rgba(0,0,0,0.7); border-radius:8px; padding:6px 8px;
            backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,0.12);
        }
        .tb-label {
            font-size:9px; font-weight:700; color:rgba(255,255,255,0.5);
            text-transform:uppercase; letter-spacing:0.6px; margin-bottom:4px;
        }
        .tb-row { display:flex; gap:3px; }
        .tb-btn {
            padding:4px 8px; border:1px solid rgba(255,255,255,0.2); border-radius:5px;
            background:rgba(255,255,255,0.08); color:#fff; font-size:10px; font-weight:600;
            cursor:pointer; transition:all 0.15s; white-space:nowrap;
        }
        .tb-btn:hover { background:rgba(255,255,255,0.2); }
        .tb-btn.active { background:#6366f1; border-color:#818cf8; }
        /* Legend: bottom-left */
        #legend {
            position:absolute; bottom:10px; left:10px;
            background:rgba(0,0,0,0.65); color:#fff; border-radius:8px;
            padding:8px 12px; font-size:11px; line-height:1.9;
            backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,0.1);
        }
        .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; vertical-align:middle; }
    </style>
</head>
<body>
    <div id="v"></div>
    <div id="err"></div>
    <div id="badge"></div>
    <div id="toolbar"></div>
    <div id="legend"></div>
    <script>
        var pdbId = \"""" + str(pdb_id) + """\";
        var cx = parseFloat(\"""" + str(cx) + """\");
        var cy = parseFloat(\"""" + str(cy) + """\");
        var cz = parseFloat(\"""" + str(cz) + """\");
        var sx = parseFloat(\"""" + str(sx) + """\");
        var sy = parseFloat(\"""" + str(sy) + """\");
        var sz = parseFloat(\"""" + str(sz) + """\");
        var boxColor = \"""" + str(color) + """\";
        var complexUrl = \"""" + str(complex_url) + """\";
        var affinity = \"""" + str(affinity) + """\";
        var poseIdx = \"""" + str(pose_idx) + """\";

        var viewer = null;
        var hasLigand = false;
        var currentLigStyle = "ballstick";
        var currentRecStyle = "cartoon";
        var surfaceObj = null;
        var showSurface = false;
        var showBox = true;
        var boxObj = null;
        // model indices: 0 = receptor, 1 = ligand
        var REC = 0;
        var LIG = 1;

        var sessionId = complexUrl ? complexUrl.split("/")[3] : "";
        var ligandUrl = sessionId
            ? "/api/docking/ligand/" + sessionId + "?pose=" + poseIdx
            : "";

        function showErr(msg) {
            document.getElementById("err").textContent = msg;
            document.getElementById("err").style.display = "block";
        }

        // ── Ligand style definitions (model: LIG) ──────────────────
        var ligStyles = {
            ballstick: function() {
                viewer.setStyle({ model: LIG }, {
                    stick:  { colorscheme: "elementPlusCarbon", radius: 0.18 },
                    sphere: { colorscheme: "elementPlusCarbon", scale: 0.32 }
                });
            },
            stick: function() {
                viewer.setStyle({ model: LIG }, {
                    stick: { colorscheme: "elementPlusCarbon", radius: 0.22 }
                });
            },
            sphere: function() {
                viewer.setStyle({ model: LIG }, {
                    sphere: { colorscheme: "elementPlusCarbon" }
                });
            },
            line: function() {
                viewer.setStyle({ model: LIG }, {
                    line: { colorscheme: "elementPlusCarbon", linewidth: 4 }
                });
            },
            cross: function() {
                viewer.setStyle({ model: LIG }, {
                    cross: { colorscheme: "elementPlusCarbon", radius: 0.25 }
                });
            }
        };

        // ── Receptor style definitions (model: REC) ─────────────────
        var recStyles = {
            cartoon: function() {
                viewer.setStyle({ model: REC }, {
                    cartoon: { colorscheme: "spectrum", opacity: 0.85 }
                });
            },
            surface: function() {
                viewer.setStyle({ model: REC }, {
                    cartoon: { colorscheme: "spectrum", opacity: 0.12 }
                });
            },
            line: function() {
                viewer.setStyle({ model: REC }, {
                    line: { colorscheme: "spectrum", opacity: 0.7 }
                });
            },
            ribbon: function() {
                viewer.setStyle({ model: REC }, {
                    ribbon: { colorscheme: "spectrum", opacity: 0.85 }
                });
            }
        };

        function applyStyles() {
            // Reset each model separately
            viewer.setStyle({ model: REC }, {});
            if (hasLigand) viewer.setStyle({ model: LIG }, {});

            if (recStyles[currentRecStyle]) recStyles[currentRecStyle]();
            if (hasLigand && ligStyles[currentLigStyle]) ligStyles[currentLigStyle]();

            // Pocket surface
            if (surfaceObj !== null) { viewer.removeSurface(surfaceObj); surfaceObj = null; }
            if (showSurface && hasLigand) {
                surfaceObj = viewer.addSurface($3Dmol.SurfaceType.MS, {
                    opacity: currentRecStyle === "surface" ? 0.55 : 0.18,
                    colorscheme: { prop: "b", gradient: "sinebow" }
                }, { model: REC, within: { distance: 6, sel: { model: LIG } } });
            }
            viewer.render();
        }

        function addBox() {
            if (boxObj !== null) { try { viewer.removeShape(boxObj); } catch(e){} boxObj = null; }
            if (showBox) {
                boxObj = viewer.addBox({
                    center: { x: cx, y: cy, z: cz },
                    dimensions: { w: sx, h: sy, d: sz },
                    color: boxColor, wireframe: true, linewidth: 2, opacity: 0.9
                });
            }
            viewer.render();
        }

        function buildToolbar() {
            var tb = document.getElementById("toolbar");
            var ligRow = hasLigand
                ? "<div class='tb-group'>" +
                    "<div class='tb-label'>Ligante</div>" +
                    "<div class='tb-row'>" +
                      "<button class='tb-btn active' id='ls-ballstick' onclick='setLigStyle(\"ballstick\")'>Ball&amp;Stick</button>" +
                      "<button class='tb-btn' id='ls-stick'   onclick='setLigStyle(\"stick\")'>Stick</button>" +
                      "<button class='tb-btn' id='ls-sphere'  onclick='setLigStyle(\"sphere\")'>Sphere</button>" +
                      "<button class='tb-btn' id='ls-line'    onclick='setLigStyle(\"line\")'>Line</button>" +
                      "<button class='tb-btn' id='ls-cross'   onclick='setLigStyle(\"cross\")'>Cross</button>" +
                    "</div></div>"
                : "";
            tb.innerHTML = ligRow +
                "<div class='tb-group'>" +
                  "<div class='tb-label'>Receptor</div>" +
                  "<div class='tb-row'>" +
                    "<button class='tb-btn active' id='rs-cartoon' onclick='setRecStyle(\"cartoon\")'>Cartoon</button>" +
                    "<button class='tb-btn' id='rs-surface'  onclick='setRecStyle(\"surface\")'>Surface</button>" +
                    "<button class='tb-btn' id='rs-ribbon'   onclick='setRecStyle(\"ribbon\")'>Ribbon</button>" +
                    "<button class='tb-btn' id='rs-line'     onclick='setRecStyle(\"line\")'>Line</button>" +
                  "</div>" +
                "</div>" +
                "<div class='tb-group'>" +
                  "<div class='tb-label'>Extras</div>" +
                  "<div class='tb-row'>" +
                    (hasLigand ? "<button class='tb-btn' id='btn-surface' onclick='toggleSurface()'>Pocket Surface</button>" : "") +
                    "<button class='tb-btn active' id='btn-box' onclick='toggleBox()'>Grid Box</button>" +
                    (hasLigand ? "<button class='tb-btn' onclick='zoomLig()'>Zoom Ligante</button>" : "") +
                    "<button class='tb-btn' onclick='viewer.zoomTo({model:REC});viewer.render()'>Zoom Tudo</button>" +
                  "</div>" +
                "</div>";
        }

        function zoomLig() { viewer.zoomTo({ model: LIG }); viewer.render(); }

        function setLigStyle(s) {
            currentLigStyle = s;
            document.querySelectorAll("[id^='ls-']").forEach(function(b) { b.classList.remove("active"); });
            var el = document.getElementById("ls-" + s); if (el) el.classList.add("active");
            applyStyles();
        }
        function setRecStyle(s) {
            currentRecStyle = s;
            document.querySelectorAll("[id^='rs-']").forEach(function(b) { b.classList.remove("active"); });
            var el = document.getElementById("rs-" + s); if (el) el.classList.add("active");
            applyStyles();
        }
        function toggleSurface() {
            showSurface = !showSurface;
            var btn = document.getElementById("btn-surface");
            if (btn) btn.classList.toggle("active", showSurface);
            applyStyles();
        }
        function toggleBox() {
            showBox = !showBox;
            var btn = document.getElementById("btn-box");
            if (btn) btn.classList.toggle("active", showBox);
            addBox();
        }

        function finishScene() {
            addBox();
            if (hasLigand) {
                viewer.zoomTo({ model: LIG });
            } else {
                viewer.zoomTo({ model: REC });
            }
            applyStyles();
            buildToolbar();

            if (hasLigand && affinity) {
                var badge = document.getElementById("badge");
                badge.innerHTML = "<b>Pose " + (parseInt(poseIdx)+1) + "</b><br>\\u0394G: <b style='color:#f87171'>" + affinity + " kcal/mol</b>";
                badge.style.display = "block";
            }

            var leg = document.getElementById("legend");
            var html = hasLigand ? "<span class='dot' style='background:#ff6b6b'></span>Ligante<br>" : "";
            html += "<span class='dot' style='background:linear-gradient(90deg,#4ecdc4,#556b9e)'></span>Receptor<br>";
            html += "<span class='dot' style='background:transparent;border:2px solid " + boxColor + ";border-radius:2px'></span>Grid Box";
            leg.innerHTML = html;
        }

        if (!pdbId || pdbId.length !== 4) {
            showErr("No PDB ID provided.");
        } else {
            viewer = $3Dmol.createViewer(document.getElementById("v"), { backgroundColor: "#1a1a2e" });

            // Always load receptor from RCSB (model 0) — reliable cartoon rendering
            $3Dmol.download("pdb:" + pdbId, viewer, {}, function() {
                if (ligandUrl) {
                    // Load only ligand atoms as separate model (model 1)
                    fetch(ligandUrl)
                        .then(function(r) { return r.ok ? r.text() : Promise.reject(); })
                        .then(function(pdbText) {
                            viewer.addModel(pdbText, "pdb");
                            hasLigand = true;
                            finishScene();
                        })
                        .catch(function() {
                            hasLigand = false;
                            finishScene();
                        });
                } else {
                    hasLigand = false;
                    finishScene();
                }
            });

            viewer.resize();
            window.addEventListener("resize", function() { viewer.resize(); });
        }
    </script>
</body>
</html>"""

    @app.route("/api/docking/ligand/<session_id>")
    def serve_ligand_pdb(session_id):
        """Returns only the ligand atoms (HETATM) from the docked complex as a mini-PDB."""
        try:
            pose_idx = int(request.args.get("pose", "0"))
            session_dir = os.path.join(DOCKING_WORKSPACE, session_id)
            complex_file = "complex.pdb" if pose_idx == 0 else ("complex_" + str(pose_idx) + ".pdb")
            complex_path = os.path.join(session_dir, complex_file)
            if not os.path.exists(complex_path):
                return "Pose not found", 404
            lines = []
            with open(complex_path, "r") as f:
                for line in f:
                    if line.startswith("HETATM") or line.startswith("CONECT") or line.startswith("END"):
                        lines.append(line)
            from flask import Response
            return Response("\n".join(l.rstrip() for l in lines), mimetype="text/plain")
        except Exception as e:
            return str(e), 500

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
