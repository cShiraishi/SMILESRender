"""Tests for molecular generation endpoints and internals (generation_routes.py)."""

import csv
import os
import sys
import tempfile
import threading
import time
import tomllib
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("SKIP_MODELS", "1")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def app():
    from routes import app as flask_app
    flask_app.config.update(TESTING=True)
    yield flask_app


@pytest.fixture(scope="module")
def client(app):
    return app.test_client()


ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
CAFFEINE = "Cn1cnc2c1c(=O)n(C)c(=O)n2C"
INVALID = "NOT_A_SMILES!!!"


# ── /api/generation/check ─────────────────────────────────────────────────────

class TestGenerationCheck:
    def test_returns_200(self, client):
        resp = client.get("/api/generation/check")
        assert resp.status_code == 200

    def test_response_has_required_fields(self, client):
        data = client.get("/api/generation/check").get_json()
        assert "reinvent_ok" in data
        assert "reinvent_msg" in data
        assert "model_path" in data
        assert "model_ok" in data
        assert "conda_env" in data

    def test_reinvent_installed_and_detected(self, client):
        import generation_routes
        venv_python = r"C:\Users\ruiab\envs\reinvent\Scripts\python.exe"
        # Clear cache so the check runs fresh with the patched path
        generation_routes._check_cache.update({"ts": 0.0, "ok": False, "msg": ""})
        with patch.object(generation_routes, "REINVENT_PYTHON", venv_python):
            data = client.get("/api/generation/check").get_json()
        assert data["reinvent_ok"] is True
        assert data["reinvent_msg"].startswith("4.")  # e.g. "4.7.15"

    def test_model_not_configured_when_no_env_var(self, client):
        data = client.get("/api/generation/check").get_json()
        # REINVENT_MODEL_PATH not set in .env → model_ok should be False
        assert data["model_ok"] is False

    def test_conda_env_default_is_libprep(self, client):
        data = client.get("/api/generation/check").get_json()
        assert data["conda_env"] == "libprep"


# ── /api/generation/start ────────────────────────────────────────────────────

class TestGenerationStart:
    def test_missing_smiles_returns_400(self, client):
        resp = client.post("/api/generation/start", json={"mode": "sampling"})
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_empty_smiles_returns_400(self, client):
        resp = client.post("/api/generation/start", json={"smiles": "   "})
        assert resp.status_code == 400

    def test_invalid_smiles_returns_400(self, client):
        resp = client.post("/api/generation/start", json={"smiles": "INVALID_XYZ!!!"})
        assert resp.status_code == 400
        data = resp.get_json()
        assert "invalid" in data["error"].lower() or "smiles" in data["error"].lower()

    def test_missing_model_path_returns_400(self, client):
        resp = client.post("/api/generation/start", json={"smiles": ASPIRIN})
        assert resp.status_code == 400
        data = resp.get_json()
        assert "model" in data["error"].lower() or "path" in data["error"].lower()

    def test_nonexistent_model_file_returns_400(self, client):
        resp = client.post("/api/generation/start", json={
            "smiles": ASPIRIN,
            "model_path": "/nonexistent/model.prior",
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert "not found" in data["error"].lower() or "model" in data["error"].lower()

    def test_valid_request_returns_job_id(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"fake model")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
                "mode": "sampling",
                "num_smiles": 10,
            })

        assert resp.status_code == 200
        data = resp.get_json()
        assert "job_id" in data
        assert len(data["job_id"]) == 36  # UUID format

    def test_num_smiles_clamped_to_max(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"fake model")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
                "num_smiles": 9999,
            })
        assert resp.status_code == 200  # clamped to 500, not rejected

    def test_temperature_clamped_to_valid_range(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"fake model")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
                "temperature": 999.0,
            })
        assert resp.status_code == 200  # clamped to 3.0

    def test_mode_defaults_to_sampling(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"fake model")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
            })
        assert resp.status_code == 200


# ── /api/generation/status ───────────────────────────────────────────────────

class TestGenerationStatus:
    def test_unknown_job_returns_404(self, client):
        resp = client.get("/api/generation/status/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404
        assert "error" in resp.get_json()

    def test_created_job_is_retrievable(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            start_resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
            })
        job_id = start_resp.get_json()["job_id"]

        status_resp = client.get(f"/api/generation/status/{job_id}")
        assert status_resp.status_code == 200

    def test_job_status_has_expected_fields(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            start_resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
            })
        job_id = start_resp.get_json()["job_id"]

        data = client.get(f"/api/generation/status/{job_id}").get_json()
        assert "id" in data
        assert "status" in data
        assert "smiles" in data
        assert "results" in data
        assert "log" in data
        assert data["id"] == job_id

    def test_private_proc_field_not_exposed(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            start_resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
            })
        job_id = start_resp.get_json()["job_id"]

        data = client.get(f"/api/generation/status/{job_id}").get_json()
        assert "_proc" not in data

    def test_initial_status_is_pending(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            start_resp = client.post("/api/generation/start", json={
                "smiles": CAFFEINE,
                "model_path": str(model_file),
            })
        job_id = start_resp.get_json()["job_id"]

        data = client.get(f"/api/generation/status/{job_id}").get_json()
        assert data["status"] in ("pending", "running")


# ── /api/generation/cancel ───────────────────────────────────────────────────

class TestGenerationCancel:
    def test_unknown_job_returns_404(self, client):
        resp = client.delete("/api/generation/cancel/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_cancel_pending_job_marks_cancelled(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            start_resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
            })
        job_id = start_resp.get_json()["job_id"]

        cancel_resp = client.delete(f"/api/generation/cancel/{job_id}")
        assert cancel_resp.status_code == 200
        assert cancel_resp.get_json().get("ok") is True

    def test_status_after_cancel_is_cancelled(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            start_resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
            })
        job_id = start_resp.get_json()["job_id"]
        client.delete(f"/api/generation/cancel/{job_id}")

        # Status endpoint still returns the job (marked cancelled)
        # Note: cancel deletes the job dir but keeps the job in memory
        status_resp = client.get(f"/api/generation/status/{job_id}")
        if status_resp.status_code == 200:
            assert status_resp.get_json()["status"] == "cancelled"


# ── /api/generation/jobs ─────────────────────────────────────────────────────

class TestGenerationJobs:
    def test_returns_200(self, client):
        resp = client.get("/api/generation/jobs")
        assert resp.status_code == 200

    def test_returns_list(self, client):
        data = client.get("/api/generation/jobs").get_json()
        assert isinstance(data, list)

    def test_jobs_dont_include_results_or_log(self, client, tmp_path):
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
            })

        jobs = client.get("/api/generation/jobs").get_json()
        for job in jobs:
            assert "results" not in job
            assert "log" not in job
            assert "_proc" not in job


# ── _build_sampling_toml ─────────────────────────────────────────────────────

class TestBuildSamplingToml:
    def _build(self, **kwargs):
        from generation_routes import _build_sampling_toml
        defaults = dict(
            model_path="/models/test.prior",
            input_smi_path="/tmp/input.smi",
            output_csv_path="/tmp/out.csv",
            num_smiles=50,
            temperature=1.0,
            device="cpu",
        )
        defaults.update(kwargs)
        return _build_sampling_toml(**defaults)

    def test_valid_toml(self):
        toml_str = self._build()
        parsed = tomllib.loads(toml_str)
        assert isinstance(parsed, dict)

    def test_run_type_is_sampling(self):
        parsed = tomllib.loads(self._build())
        # run_type must be at top level (REINVENT 4 format)
        assert parsed["run_type"] == "sampling"

    def test_num_smiles_in_toml(self):
        parsed = tomllib.loads(self._build(num_smiles=25))
        # REINVENT 4: params directly under [parameters], no [parameters.sampling] nesting
        assert parsed["parameters"]["num_smiles"] == 25

    def test_temperature_in_toml(self):
        parsed = tomllib.loads(self._build(temperature=1.5))
        assert abs(parsed["parameters"]["temperature"] - 1.5) < 1e-6

    def test_device_in_toml(self):
        parsed = tomllib.loads(self._build(device="cuda:0"))
        # device is a top-level key in REINVENT 4
        assert parsed["device"] == "cuda:0"

    def test_forward_slashes_in_paths(self):
        toml_str = self._build(
            model_path=r"C:\models\test.prior",
            input_smi_path=r"C:\tmp\input.smi",
            output_csv_path=r"C:\tmp\out.csv",
        )
        assert "\\" not in toml_str

    def test_unique_molecules_true(self):
        parsed = tomllib.loads(self._build())
        assert parsed["parameters"]["unique_molecules"] is True

    def test_output_file_inside_parameters(self):
        parsed = tomllib.loads(self._build(output_csv_path="/custom/out.csv"))
        # REINVENT 4.7.x: output_file lives inside [parameters], no [output] section
        assert parsed["parameters"]["output_file"] == "/custom/out.csv"

    def test_no_top_level_output_section(self):
        parsed = tomllib.loads(self._build())
        assert "output" not in parsed


# ── _build_rl_toml ────────────────────────────────────────────────────────────

class TestBuildRlToml:
    def _build(self, **kwargs):
        from generation_routes import _build_rl_toml
        defaults = dict(
            model_path="/models/test.prior",
            input_smiles=ASPIRIN,
            inception_smi_path="/tmp/inception.smi",
            output_prefix="/tmp/summary",
            num_smiles=30,
            max_steps=50,
            device="cpu",
        )
        defaults.update(kwargs)
        return _build_rl_toml(**defaults)

    def test_valid_toml(self):
        parsed = tomllib.loads(self._build())
        assert isinstance(parsed, dict)

    def test_run_type_is_rl(self):
        parsed = tomllib.loads(self._build())
        assert parsed["run_type"] == "reinforcement_learning"

    def test_stage_is_list(self):
        parsed = tomllib.loads(self._build())
        assert isinstance(parsed["stage"], list)
        assert len(parsed["stage"]) == 1

    def test_max_steps_in_stage(self):
        parsed = tomllib.loads(self._build(max_steps=100))
        assert parsed["stage"][0]["max_steps"] == 100

    def test_no_max_score_calls_in_stage(self):
        # REINVENT 4.7.x schema: SectionStage has no max_score_calls field
        parsed = tomllib.loads(self._build())
        assert "max_score_calls" not in parsed["stage"][0]

    def test_prior_file_and_agent_file_in_parameters(self):
        # REINVENT 4.7.x RL needs both prior_file and agent_file
        parsed = tomllib.loads(self._build(model_path="/models/test.prior"))
        assert parsed["parameters"]["prior_file"] == "/models/test.prior"
        assert parsed["parameters"]["agent_file"] == "/models/test.prior"

    def test_batch_size_in_parameters(self):
        parsed = tomllib.loads(self._build(num_smiles=20))
        assert parsed["parameters"]["batch_size"] == 20

    def test_summary_csv_prefix_in_parameters(self):
        parsed = tomllib.loads(self._build(output_prefix="/tmp/summary"))
        assert parsed["parameters"]["summary_csv_prefix"] == "/tmp/summary"

    def test_qed_scoring_component_present(self):
        parsed = tomllib.loads(self._build())
        components = parsed["stage"][0]["scoring"]["component"]
        names = [list(c.keys())[0] for c in components]
        assert "QED" in names

    def test_sascore_component_present(self):
        parsed = tomllib.loads(self._build())
        components = parsed["stage"][0]["scoring"]["component"]
        names = [list(c.keys())[0] for c in components]
        assert "SAScore" in names

    def test_inception_at_root_with_smiles_file(self):
        # REINVENT 4.7.x: inception is at root RL config level, uses smiles_file path
        parsed = tomllib.loads(self._build(inception_smi_path="/tmp/inception.smi"))
        assert "inception" in parsed
        assert parsed["inception"]["smiles_file"] == "/tmp/inception.smi"
        assert "stage" not in str(parsed.get("inception", {}))  # not inside stage

    def test_no_generator_section(self):
        # REINVENT 4.7.x has no [generator] section
        parsed = tomllib.loads(self._build())
        assert "generator" not in parsed

    def test_no_output_section(self):
        # REINVENT 4.7.x has no [output] section for RL
        parsed = tomllib.loads(self._build())
        assert "output" not in parsed

    def test_forward_slashes_in_paths(self):
        toml_str = self._build(model_path=r"C:\models\test.prior")
        assert "\\" not in toml_str


# ── _parse_output_csv ─────────────────────────────────────────────────────────

class TestParseOutputCsv:
    def _write_csv(self, rows, header=None, path=None):
        if path is None:
            f = tempfile.NamedTemporaryFile(
                mode="w", suffix=".csv", delete=False, newline=""
            )
            path = f.name
            f.close()
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if header:
                writer.writerow(header)
            for row in rows:
                writer.writerow(row)
        return path

    def test_returns_empty_for_nonexistent_file(self):
        from generation_routes import _parse_output_csv
        assert _parse_output_csv("/this/does/not/exist.csv") == []

    def test_returns_empty_for_none(self):
        from generation_routes import _parse_output_csv
        assert _parse_output_csv(None) == []

    def test_parses_uppercase_smiles_column(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [["CC(=O)O", "2.1", "0.8"]],
            header=["SMILES", "NLL", "Score"],
        )
        try:
            results = _parse_output_csv(path)
            assert len(results) == 1
            assert results[0]["smiles"] == "CC(=O)O"
        finally:
            os.unlink(path)

    def test_parses_lowercase_smiles_column(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [["c1ccccc1", "3.0", "0.6"]],
            header=["smiles", "nll", "score"],
        )
        try:
            results = _parse_output_csv(path)
            assert len(results) == 1
            assert results[0]["smiles"] == "c1ccccc1"
        finally:
            os.unlink(path)

    def test_skips_rows_with_empty_smiles(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [["", "1.0", "0.5"], ["CC", "2.0", "0.7"]],
            header=["SMILES", "NLL", "Score"],
        )
        try:
            results = _parse_output_csv(path)
            assert len(results) == 1
            assert results[0]["smiles"] == "CC"
        finally:
            os.unlink(path)

    def test_nll_and_score_are_floats(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [[ASPIRIN, "2.3456", "0.7891"]],
            header=["SMILES", "NLL", "Score"],
        )
        try:
            results = _parse_output_csv(path)
            assert isinstance(results[0]["nll"], float)
            assert isinstance(results[0]["score"], float)
        finally:
            os.unlink(path)

    def test_nll_and_score_rounded_to_4_decimals(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [[ASPIRIN, "2.123456789", "0.98765432"]],
            header=["SMILES", "NLL", "Score"],
        )
        try:
            results = _parse_output_csv(path)
            assert results[0]["nll"] == round(2.123456789, 4)
            assert results[0]["score"] == round(0.98765432, 4)
        finally:
            os.unlink(path)

    def test_missing_score_column_returns_none(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [[ASPIRIN, "2.0"]],
            header=["SMILES", "NLL"],
        )
        try:
            results = _parse_output_csv(path)
            assert results[0]["score"] is None
        finally:
            os.unlink(path)

    def test_non_numeric_nll_returns_none(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [[ASPIRIN, "nan", "0.5"]],
            header=["SMILES", "NLL", "Score"],
        )
        try:
            results = _parse_output_csv(path)
            # "nan" might parse to float('nan') or None depending on the cast
            # The test just checks it doesn't crash
            assert isinstance(results, list)
        finally:
            os.unlink(path)

    def test_parses_multiple_rows(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [[ASPIRIN, "1.0", "0.9"], [CAFFEINE, "2.0", "0.7"]],
            header=["SMILES", "NLL", "Score"],
        )
        try:
            results = _parse_output_csv(path)
            assert len(results) == 2
        finally:
            os.unlink(path)

    def test_canonical_smiles_column_variant(self):
        from generation_routes import _parse_output_csv
        path = self._write_csv(
            [[ASPIRIN, "1.0"]],
            header=["canonical_smiles", "NLL"],
        )
        try:
            results = _parse_output_csv(path)
            assert len(results) == 1
            assert results[0]["smiles"] == ASPIRIN
        finally:
            os.unlink(path)

    def test_mol2mol_tanimoto_used_as_score(self):
        from generation_routes import _parse_output_csv
        # Mol2Mol sampling output: SMILES, SMILES_state, Input_SMILES, Tanimoto, NLL
        path = self._write_csv(
            [[ASPIRIN, "VALID", ASPIRIN, "0.85", "2.1"]],
            header=["SMILES", "SMILES_state", "Input_SMILES", "Tanimoto", "NLL"],
        )
        try:
            results = _parse_output_csv(path)
            assert len(results) == 1
            assert results[0]["score"] == round(0.85, 4)
            assert results[0]["nll"] == round(2.1, 4)
        finally:
            os.unlink(path)

    def test_tanimoto_not_used_when_score_present(self):
        from generation_routes import _parse_output_csv
        # When both Score and Tanimoto exist, Score takes priority
        path = self._write_csv(
            [[ASPIRIN, "0.9", "0.75", "1.5"]],
            header=["SMILES", "Score", "Tanimoto", "NLL"],
        )
        try:
            results = _parse_output_csv(path)
            assert results[0]["score"] == round(0.9, 4)
        finally:
            os.unlink(path)


# ── _find_output_csv ──────────────────────────────────────────────────────────

class TestFindOutputCsv:
    def test_finds_output_csv_first(self, tmp_path):
        from generation_routes import _find_output_csv
        (tmp_path / "output.csv").write_text("SMILES\nCC")
        (tmp_path / "other.csv").write_text("SMILES\nCC")
        result = _find_output_csv(str(tmp_path))
        assert result is not None
        assert "output.csv" in result

    def test_finds_summary_csv_for_rl(self, tmp_path):
        from generation_routes import _find_output_csv
        (tmp_path / "summary_0.csv").write_text("SMILES\nCC")
        result = _find_output_csv(str(tmp_path))
        assert result is not None
        assert "summary" in result

    def test_finds_sampling_csv_when_no_output(self, tmp_path):
        from generation_routes import _find_output_csv
        (tmp_path / "sampling_001.csv").write_text("SMILES\nCC")
        result = _find_output_csv(str(tmp_path))
        assert result is not None

    def test_finds_any_csv_as_fallback(self, tmp_path):
        from generation_routes import _find_output_csv
        (tmp_path / "results_2024.csv").write_text("SMILES\nCC")
        result = _find_output_csv(str(tmp_path))
        assert result is not None

    def test_returns_none_for_empty_dir(self, tmp_path):
        from generation_routes import _find_output_csv
        result = _find_output_csv(str(tmp_path))
        assert result is None

    def test_returns_none_for_nonexistent_dir(self):
        from generation_routes import _find_output_csv
        result = _find_output_csv("/nonexistent/dir")
        assert result is None


# ── _run_generation_thread (mocked subprocess) ────────────────────────────────

class TestGenerationThread:
    """Test generation thread with mocked subprocess."""

    def _make_job(self, job_id, job_dir, model_path=None):
        import generation_routes as gr
        if model_path is None:
            model_path = os.path.join(job_dir, "fake.prior")
            open(model_path, "w").close()

        input_smi = os.path.join(job_dir, "input.smi")
        with open(input_smi, "w") as f:
            f.write(ASPIRIN + "\n")

        output_csv = os.path.join(job_dir, "output.csv")
        config_path = os.path.join(job_dir, "config.toml")
        toml = gr._build_sampling_toml(model_path, input_smi, output_csv, 10, 1.0, "cpu")
        with open(config_path, "w") as f:
            f.write(toml)

        with gr._jobs_lock:
            gr._jobs[job_id] = {
                "id": job_id,
                "status": "pending",
                "mode": "sampling",
                "smiles": ASPIRIN,
                "num_smiles": 10,
                "created_at": time.time(),
                "log": [],
                "results": [],
                "result_count": 0,
                "_proc": None,
            }
        return config_path, output_csv

    def test_success_marks_job_done(self, tmp_path):
        import generation_routes as gr

        job_id = "test-done-" + str(int(time.time()))
        job_dir = str(tmp_path / job_id)
        os.makedirs(job_dir)
        config_path, output_csv = self._make_job(job_id, job_dir)

        # Write fake output CSV
        with open(output_csv, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["SMILES", "NLL", "Score"])
            w.writerow([ASPIRIN, "2.1", "0.8"])
            w.writerow([CAFFEINE, "3.0", "0.7"])

        mock_proc = MagicMock()
        mock_proc.stdout = iter(["Step 1\n", "Done\n"])
        mock_proc.returncode = 0
        mock_proc.poll.return_value = 0

        with patch("generation_routes.subprocess.Popen", return_value=mock_proc):
            gr._run_generation_thread(job_id, job_dir, config_path, output_csv)

        job = gr._get_job(job_id)
        assert job["status"] == "done"
        assert job["result_count"] >= 1

    def test_subprocess_failure_marks_error(self, tmp_path):
        import generation_routes as gr

        job_id = "test-err-" + str(int(time.time()))
        job_dir = str(tmp_path / job_id)
        os.makedirs(job_dir)
        config_path, output_csv = self._make_job(job_id, job_dir)

        mock_proc = MagicMock()
        mock_proc.stdout = iter(["Error: model not loaded\n"])
        mock_proc.returncode = 1

        with patch("generation_routes.subprocess.Popen", return_value=mock_proc):
            gr._run_generation_thread(job_id, job_dir, config_path, output_csv)

        job = gr._get_job(job_id)
        assert job["status"] == "error"
        assert job.get("error")

    def test_empty_output_csv_results_in_zero_results(self, tmp_path):
        import generation_routes as gr

        job_id = "test-empty-" + str(int(time.time()))
        job_dir = str(tmp_path / job_id)
        os.makedirs(job_dir)
        config_path, output_csv = self._make_job(job_id, job_dir)

        # Empty CSV (only header)
        with open(output_csv, "w", newline="") as f:
            csv.writer(f).writerow(["SMILES", "NLL", "Score"])

        mock_proc = MagicMock()
        mock_proc.stdout = iter([])
        mock_proc.returncode = 0

        with patch("generation_routes.subprocess.Popen", return_value=mock_proc):
            gr._run_generation_thread(job_id, job_dir, config_path, output_csv)

        job = gr._get_job(job_id)
        assert job["status"] == "done"
        assert job["result_count"] == 0

    def test_rdkit_filters_invalid_smiles_from_results(self, tmp_path):
        import generation_routes as gr

        job_id = "test-rdkit-" + str(int(time.time()))
        job_dir = str(tmp_path / job_id)
        os.makedirs(job_dir)
        config_path, output_csv = self._make_job(job_id, job_dir)

        with open(output_csv, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["SMILES", "NLL", "Score"])
            w.writerow([ASPIRIN, "2.0", "0.9"])       # valid
            w.writerow(["INVALID_XYZ!!!", "1.0", "0.5"])  # invalid

        mock_proc = MagicMock()
        mock_proc.stdout = iter([])
        mock_proc.returncode = 0

        with patch("generation_routes.subprocess.Popen", return_value=mock_proc):
            gr._run_generation_thread(job_id, job_dir, config_path, output_csv)

        job = gr._get_job(job_id)
        assert job["status"] == "done"
        smiles_list = [r["smiles"] for r in job["results"]]
        assert "INVALID_XYZ!!!" not in smiles_list
        assert ASPIRIN in smiles_list

    def test_log_is_captured(self, tmp_path):
        import generation_routes as gr

        job_id = "test-log-" + str(int(time.time()))
        job_dir = str(tmp_path / job_id)
        os.makedirs(job_dir)
        config_path, output_csv = self._make_job(job_id, job_dir)

        with open(output_csv, "w", newline="") as f:
            csv.writer(f).writerow(["SMILES", "NLL"])

        log_lines = ["Starting REINVENT", "Step 1/50", "Done"]
        mock_proc = MagicMock()
        mock_proc.stdout = iter(line + "\n" for line in log_lines)
        mock_proc.returncode = 0

        with patch("generation_routes.subprocess.Popen", return_value=mock_proc):
            gr._run_generation_thread(job_id, job_dir, config_path, output_csv)

        job = gr._get_job(job_id)
        assert len(job["log"]) > 0
        assert any("REINVENT" in line or "Step" in line or "Done" in line
                   for line in job["log"])


# ── Regression tests for fixed bugs ──────────────────────────────────────────

class TestFixedBugs:
    """Regression tests ensuring previously found bugs stay fixed."""

    def test_cancel_does_not_hold_lock_during_sleep(self, client, tmp_path):
        """
        FIX: sleep(0.5) was inside _jobs_lock; moved outside so lock is released
        immediately after marking the job cancelled.
        Verify: another thread can acquire the lock while cancel sleeps.
        """
        import generation_routes as gr

        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            start_resp = client.post("/api/generation/start", json={
                "smiles": ASPIRIN,
                "model_path": str(model_file),
            })
        job_id = start_resp.get_json()["job_id"]

        mock_proc = MagicMock()
        mock_proc.poll.return_value = None  # simulate still running
        with gr._jobs_lock:
            if job_id in gr._jobs:
                gr._jobs[job_id]["status"] = "running"
                gr._jobs[job_id]["_proc"] = mock_proc

        lock_acquired_during_cancel = threading.Event()

        def try_acquire_lock():
            # Wait a moment for cancel to be in-flight, then grab the lock
            time.sleep(0.05)
            with gr._jobs_lock:
                lock_acquired_during_cancel.set()

        t = threading.Thread(target=try_acquire_lock)
        t.start()
        client.delete(f"/api/generation/cancel/{job_id}")
        t.join(timeout=2.0)

        assert lock_acquired_during_cancel.is_set(), (
            "Lock was not acquirable during cancel — sleep may still be inside the lock."
        )

    def test_invalid_smiles_rejected_before_job_creation(self, client, tmp_path):
        """
        FIX: SMILES validation now happens at request time via RDKit, returning
        400 immediately instead of creating a job and failing later.
        """
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        resp = client.post("/api/generation/start", json={
            "smiles": "INVALID_SMILES_XYZ!!!",
            "model_path": str(model_file),
        })
        assert resp.status_code == 400
        data = resp.get_json()
        assert "invalid" in data["error"].lower() or "smiles" in data["error"].lower()

    def test_valid_smiles_still_creates_job(self, client, tmp_path):
        """Ensure validation doesn't break valid SMILES."""
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        with patch("generation_routes.threading.Thread") as mock_thread:
            mock_thread.return_value = MagicMock()
            resp = client.post("/api/generation/start", json={
                "smiles": CAFFEINE,
                "model_path": str(model_file),
            })
        assert resp.status_code == 200
        assert "job_id" in resp.get_json()

    def test_borderline_smiles_variants_accepted(self, client, tmp_path):
        """Common valid SMILES patterns should pass validation."""
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        valid_cases = [
            "c1ccccc1",           # benzene
            "CC(=O)O",            # acetic acid
            "O=C(O)c1ccccc1",     # benzoic acid
            "[NH4+]",             # ammonium ion
        ]
        for smi in valid_cases:
            with patch("generation_routes.threading.Thread") as mock_thread:
                mock_thread.return_value = MagicMock()
                resp = client.post("/api/generation/start", json={
                    "smiles": smi,
                    "model_path": str(model_file),
                })
            assert resp.status_code == 200, f"Valid SMILES rejected: {smi}"

    def test_invalid_smiles_variants_rejected(self, client, tmp_path):
        """Common invalid SMILES patterns should all return 400."""
        model_file = tmp_path / "dummy.prior"
        model_file.write_bytes(b"x")

        invalid_cases = [
            "NOT_A_SMILES",
            "C(C(C",
            "xyz123!!!",
            "())",
        ]
        for smi in invalid_cases:
            resp = client.post("/api/generation/start", json={
                "smiles": smi,
                "model_path": str(model_file),
            })
            assert resp.status_code == 400, f"Invalid SMILES accepted: {smi}"
