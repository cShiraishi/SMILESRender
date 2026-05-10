import os
import csv
import json
import uuid
import shutil
import subprocess
import threading
import time
import glob
from flask import Blueprint, request, jsonify

generation_bp = Blueprint("generation", __name__)

GENERATION_WORKSPACE = os.path.join(os.getcwd(), "tmp", "generation_jobs")
os.makedirs(GENERATION_WORKSPACE, exist_ok=True)

REINVENT_CONDA_ENV = os.getenv("REINVENT_CONDA_ENV", "libprep")
REINVENT_MODEL_PATH = os.getenv("REINVENT_MODEL_PATH", "")
# Optional: path to a Python executable that has reinvent4 installed
# e.g. REINVENT_PYTHON=C:/envs/reinvent/python.exe
REINVENT_PYTHON = os.getenv("REINVENT_PYTHON", "")

_jobs: dict = {}
_jobs_lock = threading.Lock()

# Limit concurrent generation jobs (heavy GPU/CPU)
_generation_semaphore = threading.Semaphore(1)

_check_cache: dict = {"ts": 0.0, "ok": False, "msg": ""}
_CHECK_TTL = 300  # seconds; avoid running conda subprocess on every page load

_JOB_TTL_SECONDS = 7200  # 2 hours; evict finished/errored jobs from memory

_CONDA_CANDIDATES = [
    r"C:\ProgramData\miniconda3\Scripts\conda.exe",
    r"C:\ProgramData\miniconda3\condabin\conda.bat",
    r"C:\Users\ruiab\miniconda3\Scripts\conda.exe",
    r"C:\Users\ruiab\AppData\Local\miniconda3\Scripts\conda.exe",
    r"C:\Users\ruiab\AppData\Local\Miniforge3\Scripts\conda.exe",
    os.path.expanduser("~/miniconda3/Scripts/conda.exe"),
    os.path.expanduser("~/miniconda3/bin/conda"),
    os.path.expanduser("~/anaconda3/bin/conda"),
    "/opt/conda/bin/conda",
    "conda",
]


def _find_conda():
    for c in _CONDA_CANDIDATES:
        if os.path.isfile(c) or shutil.which(c):
            return c
    return None


def _build_reinvent_cmd(config_path):
    """Build the command to run REINVENT 4. Tries: custom Python > conda env > direct 'reinvent'."""
    # 1. Explicit Python path via env var
    if REINVENT_PYTHON and os.path.isfile(REINVENT_PYTHON):
        return [REINVENT_PYTHON, "-m", "reinvent", config_path]

    # 2. Conda environment
    conda = _find_conda()
    if conda:
        return [conda, "run", "--no-capture-output", "-n", REINVENT_CONDA_ENV,
                "reinvent", config_path]

    # 3. Fallback: reinvent directly in PATH
    return ["reinvent", config_path]


def _check_reinvent():
    # 1. Custom Python path
    if REINVENT_PYTHON and os.path.isfile(REINVENT_PYTHON):
        try:
            result = subprocess.run(
                [REINVENT_PYTHON, "-c", "import reinvent; print(reinvent.__version__)"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0:
                return True, result.stdout.strip()
            return False, result.stderr.strip()[:400]
        except Exception as e:
            return False, str(e)

    # 2. Conda environment
    conda = _find_conda()
    if conda:
        try:
            result = subprocess.run(
                [conda, "run", "-n", REINVENT_CONDA_ENV, "--no-capture-output",
                 "python", "-c", "import reinvent; print(reinvent.__version__)"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0:
                return True, result.stdout.strip()
            return False, (result.stderr or result.stdout).strip()[:400]
        except subprocess.TimeoutExpired:
            return False, "timeout checking reinvent installation"
        except Exception as e:
            return False, str(e)

    # 3. reinvent directly in PATH
    reinvent_exe = shutil.which("reinvent")
    if reinvent_exe:
        try:
            result = subprocess.run([reinvent_exe, "--version"], capture_output=True, text=True, timeout=10)
            return True, result.stdout.strip() or "reinvent found in PATH"
        except Exception:
            pass

    return False, (
        "REINVENT 4 not found. Options:\n"
        "1. conda install: conda activate libprep && pip install reinvent4\n"
        "2. pip install in venv: pip install reinvent4  then set REINVENT_PYTHON=<path/to/python.exe>\n"
        "3. Set REINVENT_PYTHON=<python.exe with reinvent4 installed>"
    )


def _update_job(job_id, **kwargs):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(kwargs)


def _get_job(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        copy = {k: v for k, v in job.items() if k != "_proc"}
        return copy


def _find_output_csv(job_dir):
    """Find the CSV written by REINVENT. Sampling writes output.csv; RL writes summary_*.csv."""
    for pattern in ["output.csv", "summary*.csv", "sampling*.csv", "*.csv"]:
        matches = glob.glob(os.path.join(job_dir, pattern))
        if matches:
            return matches[0]
    return None


def _parse_output_csv(csv_path):
    results = []
    if not csv_path or not os.path.exists(csv_path):
        return results
    try:
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                smiles = (
                    row.get("SMILES") or row.get("smiles") or
                    row.get("Smiles") or row.get("canonical_smiles") or ""
                ).strip()
                if not smiles:
                    continue
                nll = _safe_float(row.get("NLL") or row.get("nll") or row.get("Loss"))
                # Mol2Mol sampling outputs Tanimoto; RL outputs Score/total_score
                score = _safe_float(
                    row.get("Score") or row.get("score") or row.get("total_score") or
                    row.get("Tanimoto") or row.get("tanimoto")
                )
                results.append({"smiles": smiles, "nll": nll, "score": score})
    except Exception:
        pass
    return results


def _safe_float(val):
    try:
        return round(float(val), 4) if val is not None else None
    except (TypeError, ValueError):
        return None


def _build_sampling_toml(model_path, input_smi_path, output_csv_path, num_smiles, temperature, device):
    model_fwd = model_path.replace("\\", "/")
    input_fwd = input_smi_path.replace("\\", "/")
    output_fwd = output_csv_path.replace("\\", "/")
    return f"""run_type = "sampling"
device = "{device}"

[parameters]
model_file = "{model_fwd}"
smiles_file = "{input_fwd}"
num_smiles = {num_smiles}
unique_molecules = true
randomize_smiles = true
temperature = {temperature}
output_file = "{output_fwd}"
"""


def _build_rl_toml(model_path, input_smiles, inception_smi_path, output_prefix, num_smiles, max_steps, device):
    model_fwd = model_path.replace("\\", "/")
    inception_fwd = inception_smi_path.replace("\\", "/")
    output_prefix_fwd = output_prefix.replace("\\", "/")
    return f"""run_type = "reinforcement_learning"
device = "{device}"

[parameters]
prior_file = "{model_fwd}"
agent_file = "{model_fwd}"
summary_csv_prefix = "{output_prefix_fwd}"
batch_size = {num_smiles}
randomize_smiles = true
temperature = 1.0

[[stage]]
max_steps = {max_steps}

[stage.scoring]
type = "custom_product"

[[stage.scoring.component]]
[stage.scoring.component.QED]
[[stage.scoring.component.QED.endpoint]]
name = "QED drug-likeness"
weight = 0.6

[[stage.scoring.component]]
[stage.scoring.component.SAScore]
[[stage.scoring.component.SAScore.endpoint]]
name = "SA Score"
weight = 0.4
high = 3.0
low = 1.0
k = 0.5

[stage.diversity_filter]
type = "IdenticalMurckoScaffold"
bucket_size = 25
minscore = 0.4
minsimilarity = 0.4

[inception]
smiles_file = "{inception_fwd}"
memory_size = 50
sample_size = 10
"""


def _run_generation_thread(job_id, job_dir, config_path, output_csv):
    acquired = _generation_semaphore.acquire(blocking=True, timeout=600)
    if not acquired:
        _update_job(job_id, status="error", error="Server busy with another generation job. Try again shortly.")
        return

    try:
        _update_job(job_id, status="running", started_at=time.time())

        cmd = _build_reinvent_cmd(config_path)

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=job_dir,
        )

        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]["_proc"] = proc

        log_lines = []
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                log_lines.append(line)
                with _jobs_lock:
                    if job_id in _jobs:
                        _jobs[job_id]["log"] = log_lines[-60:]

        proc.wait()

        # Check if cancelled
        with _jobs_lock:
            if job_id in _jobs and _jobs[job_id]["status"] == "cancelled":
                return

        if proc.returncode != 0:
            _update_job(job_id, status="error",
                        error="\n".join(log_lines[-15:]) or "REINVENT exited with code {}".format(proc.returncode))
            return

        # Try to find and parse output
        found_csv = _find_output_csv(job_dir)
        results = _parse_output_csv(found_csv or output_csv)

        # Validate SMILES with RDKit (filter invalid)
        try:
            from rdkit import Chem
            valid = []
            for r in results:
                mol = Chem.MolFromSmiles(r["smiles"])
                if mol:
                    valid.append(r)
            results = valid
        except ImportError:
            pass

        _update_job(job_id, status="done", results=results,
                    finished_at=time.time(), result_count=len(results))

        # Free disk space — results are now in memory
        try:
            if os.path.isdir(job_dir):
                shutil.rmtree(job_dir, ignore_errors=True)
        except Exception:
            pass

    except Exception as e:
        _update_job(job_id, status="error", error=str(e))
    finally:
        _generation_semaphore.release()


def _evict_old_jobs():
    cutoff = time.time() - _JOB_TTL_SECONDS
    with _jobs_lock:
        to_del = [jid for jid, j in _jobs.items()
                  if j.get("created_at", 0) < cutoff
                  and j["status"] in ("done", "error", "cancelled")]
        for jid in to_del:
            del _jobs[jid]


@generation_bp.route("/api/generation/check", methods=["GET"])
def check_reinvent_endpoint():
    now = time.time()
    if _check_cache["msg"] and now - _check_cache["ts"] < _CHECK_TTL:
        ok, msg = _check_cache["ok"], _check_cache["msg"]
    else:
        ok, msg = _check_reinvent()
        _check_cache.update({"ts": now, "ok": ok, "msg": msg})
    model_path = REINVENT_MODEL_PATH
    model_ok = bool(model_path and os.path.isfile(model_path))
    return jsonify({
        "reinvent_ok": ok,
        "reinvent_msg": msg,
        "model_path": model_path,
        "model_ok": model_ok,
        "conda_env": REINVENT_CONDA_ENV,
    })


@generation_bp.route("/api/generation/start", methods=["POST"])
def start_generation():
    _evict_old_jobs()
    data = request.get_json() or {}
    smiles = (data.get("smiles") or "").strip()
    mode = data.get("mode", "sampling")
    num_smiles = max(1, min(int(data.get("num_smiles", 50)), 500))
    temperature = max(0.1, min(float(data.get("temperature", 1.0)), 3.0))
    max_steps = max(10, min(int(data.get("max_steps", 50)), 200))
    device = data.get("device", "cpu")
    model_path = (data.get("model_path") or REINVENT_MODEL_PATH or "").strip()

    if not smiles:
        return jsonify({"error": "SMILES is required"}), 400

    try:
        from rdkit import Chem
        if Chem.MolFromSmiles(smiles) is None:
            return jsonify({"error": "Invalid SMILES: {}".format(smiles)}), 400
    except ImportError:
        pass

    if not model_path:
        return jsonify({"error": "Model path not configured. Set REINVENT_MODEL_PATH in .env or provide model_path."}), 400
    if not os.path.isfile(model_path):
        return jsonify({"error": "Model file not found: {}".format(model_path)}), 400

    job_id = str(uuid.uuid4())
    job_dir = os.path.join(GENERATION_WORKSPACE, job_id)
    os.makedirs(job_dir, exist_ok=True)

    input_smi = os.path.join(job_dir, "input.smi")
    with open(input_smi, "w", encoding="utf-8") as f:
        f.write(smiles + "\n")

    output_csv = os.path.join(job_dir, "output.csv")
    config_path = os.path.join(job_dir, "config.toml")

    if mode == "rl":
        inception_smi = os.path.join(job_dir, "inception.smi")
        with open(inception_smi, "w", encoding="utf-8") as f:
            f.write(smiles + "\n")
        output_prefix = os.path.join(job_dir, "summary")
        toml_content = _build_rl_toml(model_path, smiles, inception_smi, output_prefix, num_smiles, max_steps, device)
    else:
        toml_content = _build_sampling_toml(model_path, input_smi, output_csv, num_smiles, temperature, device)

    with open(config_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(toml_content)

    with _jobs_lock:
        _jobs[job_id] = {
            "id": job_id,
            "status": "pending",
            "mode": mode,
            "smiles": smiles,
            "num_smiles": num_smiles,
            "created_at": time.time(),
            "log": [],
            "results": [],
            "result_count": 0,
            "_proc": None,
        }

    thread = threading.Thread(
        target=_run_generation_thread,
        args=(job_id, job_dir, config_path, output_csv),
        daemon=True,
    )
    thread.start()

    return jsonify({"job_id": job_id})


@generation_bp.route("/api/generation/status/<job_id>", methods=["GET"])
def job_status(job_id):
    job = _get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@generation_bp.route("/api/generation/cancel/<job_id>", methods=["DELETE"])
def cancel_job(job_id):
    proc_to_kill = None
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404
        if job["status"] == "running":
            proc_to_kill = job.get("_proc")
        job["status"] = "cancelled"

    if proc_to_kill:
        try:
            proc_to_kill.terminate()
            time.sleep(0.5)
            if proc_to_kill.poll() is None:
                proc_to_kill.kill()
        except Exception:
            pass

    # Clean up workspace for this job
    job_dir = os.path.join(GENERATION_WORKSPACE, job_id)
    try:
        if os.path.isdir(job_dir):
            shutil.rmtree(job_dir, ignore_errors=True)
    except Exception:
        pass

    return jsonify({"ok": True})


@generation_bp.route("/api/generation/jobs", methods=["GET"])
def list_jobs():
    with _jobs_lock:
        jobs = [
            {k: v for k, v in job.items() if k not in ("_proc", "results", "log")}
            for job in _jobs.values()
        ]
    jobs.sort(key=lambda j: j.get("created_at", 0), reverse=True)
    return jsonify(jobs[:20])
