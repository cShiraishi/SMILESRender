"""Smoke tests for SmileRender API endpoints."""

import base64

import pytest

from conftest import ASPIRIN, BENZENE, CAFFEINE, INVALID_SMILES, QUERCETIN


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


class TestHealth:
    def test_ping(self, client):
        resp = client.get("/ping")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("status") == "ok"


class TestRendering:
    def test_render_valid_smiles(self, client):
        resp = client.get(f"/render/{ASPIRIN}")
        assert resp.status_code == 200
        assert resp.content_type == "image/png"
        assert len(resp.data) > 500  # non-empty PNG

    def test_render_caffeine(self, client):
        resp = client.get(f"/render/{CAFFEINE}")
        assert resp.status_code == 200

    def test_render_quercetin(self, client):
        resp = client.get(f"/render/{QUERCETIN}")
        assert resp.status_code == 200

    def test_render_invalid_smiles_returns_error(self, client):
        resp = client.get(f"/render/{INVALID_SMILES}")
        assert resp.status_code in (400, 422)

    def test_render_base64_valid(self, client):
        # /render/base64/ expects a base64-encoded SMILES
        resp = client.get(f"/render/base64/{_b64(BENZENE)}")
        assert resp.status_code == 200
        assert resp.content_type == "image/png"

    def test_render_post_batch(self, client):
        payload = {"smiles": [ASPIRIN, CAFFEINE, BENZENE], "format": "png"}
        resp = client.post("/render", json=payload)
        assert resp.status_code == 200


class TestDescriptors:
    def test_descriptors_aspirin(self, client):
        # route returns a single dict when given one SMILES
        resp = client.post("/descriptors", json={"smiles": ASPIRIN})
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data, dict)
        assert "MolecularWeight" in data or "MW" in data

    def test_descriptors_invalid(self, client):
        resp = client.post("/descriptors", json={"smiles": INVALID_SMILES})
        assert resp.status_code in (400, 422)

    def test_descriptors_missing_body(self, client):
        resp = client.post("/descriptors", json={})
        assert resp.status_code in (400, 422)


class TestSimilarity:
    def test_similarity_basic(self, client):
        # route fields: "reference" (query mol) + "smiles" (library list)
        payload = {
            "reference": ASPIRIN,
            "smiles": [CAFFEINE, BENZENE, QUERCETIN],
        }
        resp = client.post("/similarity", json=payload)
        assert resp.status_code == 200
        results = resp.get_json()
        assert isinstance(results, list)
        assert len(results) == 3

    def test_similarity_scores_range(self, client):
        payload = {"reference": ASPIRIN, "smiles": [ASPIRIN]}
        resp = client.post("/similarity", json=payload)
        assert resp.status_code == 200
        results = resp.get_json()
        score = results[0].get("score") or results[0].get("tanimoto")
        assert score is not None
        assert 0.0 <= float(score) <= 1.0

    def test_similarity_self_is_one(self, client):
        payload = {"reference": ASPIRIN, "smiles": [ASPIRIN]}
        resp = client.post("/similarity", json=payload)
        results = resp.get_json()
        score = results[0].get("score") or results[0].get("tanimoto")
        assert abs(float(score) - 1.0) < 1e-6


class TestRDKitFilters:
    def test_lipinski_aspirin(self, client):
        # route is /predict/rdkit-filters/base64/<base64-smiles>
        resp = client.get(f"/predict/rdkit-filters/base64/{_b64(ASPIRIN)}")
        assert resp.status_code == 200

    def test_lipinski_caffeine(self, client):
        resp = client.get(f"/predict/rdkit-filters/base64/{_b64(CAFFEINE)}")
        assert resp.status_code == 200
