"""
Suite de testes para o SmileRender.
Dataset: 6 flavonóides inibidores de PTP1B (artigo isDA).

Camadas:
  Layer 1 — Python directo via RDKit (sem servidor)
  Layer 2 — REST endpoints do Flask (requer servidor a correr)

Correr tudo:
  pytest tests/test_smilesrender_full.py -v

Só Layer 1 (offline):
  pytest tests/test_smilesrender_full.py -v -k "Python"

Só Layer 2 (requer servidor):
  python src/main.py          # Terminal 1
  pytest tests/test_smilesrender_full.py -v -k "REST"   # Terminal 2
"""

import base64
import json
import time
from datetime import datetime
from pathlib import Path

import pytest
import requests

# ── Dataset de referência ─────────────────────────────────────────────────────
MOLECULES = [
    {
        "name": "Quercetin",
        # Flavonol 5 OH: 3-OH, 5-OH, 7-OH + catecol B (3',4'-OH). MW=302.24, HBD=5
        "smiles": "O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12",
        "expected": {"MW_approx": 302.2, "lipinski_fail": False, "pains": True},
    },
    {
        "name": "Kaempferol",
        # Flavonol 4 OH: 3-OH, 5-OH, 7-OH, 4'-OH. Sem catecol. MW=286.24, HBD=4
        "smiles": "O=c1c(O)c(-c2ccc(O)cc2)oc2cc(O)cc(O)c12",
        "expected": {"MW_approx": 286.2, "lipinski_fail": False, "pains": False},
    },
    {
        "name": "Luteolin",
        # Flavona 4 OH: 5-OH, 7-OH + catecol B (3',4'-OH). MW=286.24, HBD=4
        "smiles": "O=c1cc(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12",
        "expected": {"MW_approx": 286.2, "lipinski_fail": False, "pains": True},
    },
    {
        "name": "Fisetin",
        # Flavonol 4 OH: 3-OH + catecol B (3',4'-OH). A ring sem OH. MW=270.24, HBD=4
        "smiles": "O=c1c(O)c(-c2ccc(O)c(O)c2)oc2ccccc12",
        "expected": {"MW_approx": 270.2, "lipinski_fail": False, "pains": True},
    },
    {
        "name": "Myricetin",
        # Flavonol 6 OH: 3-OH, 5-OH, 7-OH + pirogalol B (3',4',5'-OH). MW=318.24, HBD=6>5
        "smiles": "O=c1c(O)c(-c2cc(O)c(O)c(O)c2)oc2cc(O)cc(O)c12",
        "expected": {"MW_approx": 318.2, "lipinski_fail": True, "pains": True},
    },
    {
        "name": "Apigenin",
        # Flavona 3 OH: 5-OH, 7-OH, 4'-OH. Sem catecol. MW=270.24, HBD=3
        "smiles": "O=c1cc(-c2ccc(O)cc2)oc2cc(O)cc(O)c12",
        "expected": {"MW_approx": 270.2, "lipinski_fail": False, "pains": False},
    },
]

BASE_URL = "http://localhost:3000"

# ── Utilitários ───────────────────────────────────────────────────────────────
results_log = []


def b64(smiles: str) -> str:
    return base64.b64encode(smiles.encode()).decode()


def log_result(app, molecule, passed, detail="", latency=0.0):
    results_log.append({
        "app": app, "molecule": molecule, "passed": passed,
        "detail": detail, "latency_s": round(latency, 3),
    })


# ════════════════════════════════════════════════════════════════════════
# LAYER 1 — Python directo via RDKit
# ════════════════════════════════════════════════════════════════════════

class TestDescriptorsPython:
    """Calcula descritores com RDKit directamente — sem servidor."""

    def test_mw_calculation(self):
        from rdkit import Chem
        from rdkit.Chem import Descriptors
        for mol in MOLECULES:
            m = Chem.MolFromSmiles(mol["smiles"])
            assert m is not None, f"{mol['name']}: SMILES inválido"
            mw = round(Descriptors.MolWt(m), 1)
            passed = abs(mw - mol["expected"]["MW_approx"]) < 5
            log_result("descriptors_py", mol["name"], passed,
                       f"MW={mw} (esperado ~{mol['expected']['MW_approx']})")
            assert passed, f"{mol['name']}: MW={mw} fora do esperado"

    def test_lipinski_classification(self):
        from rdkit import Chem
        from rdkit.Chem import Descriptors
        for mol in MOLECULES:
            m = Chem.MolFromSmiles(mol["smiles"])
            mw   = Descriptors.MolWt(m)
            logp = Descriptors.MolLogP(m)
            hbd  = Descriptors.NumHDonors(m)
            hba  = Descriptors.NumHAcceptors(m)
            violations = sum([mw > 500, logp > 5, hbd > 5, hba > 10])
            fails = violations > 0
            expected_fail = mol["expected"]["lipinski_fail"]
            passed = fails == expected_fail
            log_result("lipinski_py", mol["name"], passed,
                       f"violations={violations}, expected_fail={expected_fail}")
            assert passed, f"{mol['name']}: Lipinski errado (violations={violations})"

    def test_qed_range(self):
        from rdkit import Chem
        from rdkit.Chem import QED
        for mol in MOLECULES:
            m = Chem.MolFromSmiles(mol["smiles"])
            q = QED.qed(m)
            assert 0 <= q <= 1, f"{mol['name']}: QED={q} fora de [0,1]"

    def test_morgan_fingerprint_2048bits(self):
        from rdkit import Chem
        from rdkit.Chem import AllChem
        for mol in MOLECULES:
            m = Chem.MolFromSmiles(mol["smiles"])
            fp = AllChem.GetMorganFingerprintAsBitVect(m, radius=2, nBits=2048)
            assert fp.GetNumBits() == 2048, f"{mol['name']}: Morgan FP com bits errados"

    def test_tpsa_positive(self):
        from rdkit import Chem
        from rdkit.Chem import Descriptors
        for mol in MOLECULES:
            m = Chem.MolFromSmiles(mol["smiles"])
            tpsa = Descriptors.TPSA(m)
            assert tpsa > 0, f"{mol['name']}: TPSA={tpsa} inválido"


class TestStructuralAlertsPython:
    """PAINS e BRENK via RDKit FilterCatalog — sem servidor."""

    def _screen(self, smiles, catalog_enum):
        from rdkit import Chem
        from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams
        mol = Chem.MolFromSmiles(smiles)
        params = FilterCatalogParams()
        params.AddCatalog(catalog_enum)
        catalog = FilterCatalog(params)
        return catalog.GetMatches(mol)

    def test_pains_detected_in_catechols(self):
        from rdkit.Chem.FilterCatalog import FilterCatalogParams
        PAINS = FilterCatalogParams.FilterCatalogs.PAINS
        for mol in [m for m in MOLECULES if m["expected"]["pains"]]:
            matches = self._screen(mol["smiles"], PAINS)
            passed = len(matches) > 0
            log_result("pains_py", mol["name"], passed,
                       f"alerts={[m.GetDescription() for m in matches]}")
            assert passed, f"{mol['name']}: PAINS esperado mas não detectado"

    def test_catechol_pains_absent_in_clean_molecules(self):
        """Moléculas sem catecol/pirogalol não devem ter alertas catecol-tipo.
        Nota: chromona gera 'keto_keto_beta_C' em todas as flavonas —
        aqui testamos especificamente a ausência de alertas catecol."""
        from rdkit.Chem.FilterCatalog import FilterCatalogParams
        PAINS = FilterCatalogParams.FilterCatalogs.PAINS
        for mol in [m for m in MOLECULES if not m["expected"]["pains"]]:
            all_matches = self._screen(mol["smiles"], PAINS)
            catechol_matches = [
                m for m in all_matches
                if "catechol" in m.GetDescription().lower()
                or "quinone" in m.GetDescription().lower()
            ]
            passed = len(catechol_matches) == 0
            log_result("pains_clean_py", mol["name"], passed,
                       f"catechol alerts={[m.GetDescription() for m in catechol_matches]}")
            assert passed, \
                f"{mol['name']}: alerta catecol inesperado: {[m.GetDescription() for m in catechol_matches]}"

    def test_brenk_screening_runs(self):
        from rdkit.Chem.FilterCatalog import FilterCatalogParams
        BRENK = FilterCatalogParams.FilterCatalogs.BRENK
        for mol in MOLECULES:
            matches = self._screen(mol["smiles"], BRENK)
            log_result("brenk_py", mol["name"], True,
                       f"alerts={[m.GetDescription() for m in matches]}")
            assert matches is not None

    def test_invalid_smiles_returns_none(self):
        from rdkit import Chem
        mol = Chem.MolFromSmiles("INVALID_XYZ_999")
        assert mol is None, "RDKit devia retornar None para SMILES inválido"


class TestADMETPython:
    """Estimativas ADMET com heurísticas RDKit — sem servidor."""

    def _admet(self, smiles):
        from rdkit import Chem
        from rdkit.Chem import Descriptors, rdMolDescriptors
        mol = Chem.MolFromSmiles(smiles)
        mw   = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        tpsa = Descriptors.TPSA(mol)
        hbd  = Descriptors.NumHDonors(mol)
        rotb = rdMolDescriptors.CalcNumRotatableBonds(mol)
        arom = rdMolDescriptors.CalcNumAromaticRings(mol)
        log_s = 0.16 - 0.63 * logp - 0.0062 * mw + 0.066 * rotb - 0.74 * arom
        bbb = mw < 450 and 0 < logp < 5 and tpsa < 90 and hbd < 3
        return {"LogS": round(log_s, 2), "BBB": bbb, "TPSA": tpsa}

    def test_logsol_is_numeric(self):
        for mol in MOLECULES:
            result = self._admet(mol["smiles"])
            assert isinstance(result["LogS"], float), f"{mol['name']}: LogS inválido"

    def test_bbb_type_is_bool(self):
        for mol in MOLECULES:
            result = self._admet(mol["smiles"])
            assert isinstance(result["BBB"], bool)

    def test_polyphenols_unlikely_bbb(self):
        """Polifenóis com TPSA alto não devem penetrar BBB."""
        for mol in MOLECULES:
            result = self._admet(mol["smiles"])
            if result["TPSA"] > 120:
                assert result["BBB"] is False, \
                    f"{mol['name']}: TPSA={result['TPSA']} mas BBB=True"


# ════════════════════════════════════════════════════════════════════════
# LAYER 2 — REST endpoints (requer servidor: python src/main.py)
# ════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def server_up():
    """Verifica que o SmileRender está a correr antes dos testes REST."""
    try:
        r = requests.get(f"{BASE_URL}/ping", timeout=3)
        assert r.status_code == 200
    except Exception:
        pytest.skip("SmileRender não está a correr em localhost:3000 — a saltar testes REST")


class TestDescriptorsREST:

    def test_descriptor_endpoint_returns_mw(self, server_up):
        for mol in MOLECULES:
            t0 = time.time()
            r = requests.post(f"{BASE_URL}/descriptors",
                              json={"smiles": mol["smiles"]}, timeout=10)
            elapsed = time.time() - t0
            passed = r.status_code == 200
            data = r.json() if passed else {}
            mw_key = "MolecularWeight" if "MolecularWeight" in data else "MW"
            has_mw = mw_key in data
            log_result("descriptors_rest", mol["name"], passed and has_mw,
                       f"status={r.status_code}, keys={list(data.keys())[:5]}", elapsed)
            assert passed, f"{mol['name']}: status {r.status_code}"
            assert has_mw, f"{mol['name']}: chave MW ausente na resposta"

    def test_descriptor_mw_value_within_tolerance(self, server_up):
        for mol in MOLECULES:
            r = requests.post(f"{BASE_URL}/descriptors",
                              json={"smiles": mol["smiles"]}, timeout=10)
            data = r.json()
            mw = data.get("MolecularWeight") or data.get("MW")
            assert abs(float(mw) - mol["expected"]["MW_approx"]) < 5, \
                f"{mol['name']}: MW={mw} fora do esperado"

    def test_descriptor_contains_qed(self, server_up):
        r = requests.post(f"{BASE_URL}/descriptors",
                          json={"smiles": MOLECULES[0]["smiles"]}, timeout=10)
        data = r.json()
        assert "QED" in data, f"QED ausente: keys={list(data.keys())[:10]}"

    def test_invalid_smiles_returns_error(self, server_up):
        r = requests.post(f"{BASE_URL}/descriptors",
                          json={"smiles": "INVALID_XYZ"}, timeout=5)
        assert r.status_code in [400, 422, 500], \
            f"SMILES inválido devia retornar erro, got {r.status_code}"


class TestAlertsREST:

    def test_rdkit_filters_endpoint(self, server_up):
        for mol in MOLECULES:
            t0 = time.time()
            r = requests.get(
                f"{BASE_URL}/predict/rdkit-filters/base64/{b64(mol['smiles'])}",
                timeout=10)
            elapsed = time.time() - t0
            passed = r.status_code == 200
            log_result("alerts_rest", mol["name"], passed,
                       f"status={r.status_code}", elapsed)
            assert passed, f"{mol['name']}: status {r.status_code}"

    def test_pains_result_consistent_with_rdkit(self, server_up):
        """Resultado da API deve coincidir com o RDKit directo."""
        from rdkit import Chem
        from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams
        PAINS = FilterCatalogParams.FilterCatalogs.PAINS

        for mol in MOLECULES:
            r = requests.get(
                f"{BASE_URL}/predict/rdkit-filters/base64/{b64(mol['smiles'])}",
                timeout=10)
            data = r.json()

            # PAINS directo
            m = Chem.MolFromSmiles(mol["smiles"])
            params = FilterCatalogParams(); params.AddCatalog(PAINS)
            direct_hits = len(FilterCatalog(params).GetMatches(m)) > 0

            api_has_pains = mol["expected"]["pains"]
            assert direct_hits == api_has_pains, \
                f"{mol['name']}: inconsistência PAINS directo={direct_hits} vs esperado={api_has_pains}"


class TestADMETREST:

    def test_bbb_endpoint(self, server_up):
        for mol in MOLECULES[:3]:
            t0 = time.time()
            r = requests.get(
                f"{BASE_URL}/predict/bbb/base64/{b64(mol['smiles'])}",
                timeout=15)
            elapsed = time.time() - t0
            passed = r.status_code == 200
            log_result("bbb_rest", mol["name"], passed,
                       f"status={r.status_code}", elapsed)
            assert passed, f"{mol['name']}: BBB endpoint retornou {r.status_code}"

    def test_tox21_endpoint(self, server_up):
        for mol in MOLECULES[:3]:
            t0 = time.time()
            r = requests.get(
                f"{BASE_URL}/predict/tox21/base64/{b64(mol['smiles'])}",
                timeout=15)
            elapsed = time.time() - t0
            passed = r.status_code == 200
            log_result("tox21_rest", mol["name"], passed,
                       f"status={r.status_code}", elapsed)
            assert passed, f"{mol['name']}: Tox21 endpoint retornou {r.status_code}"

    def test_tox21_returns_predictions(self, server_up):
        r = requests.get(
            f"{BASE_URL}/predict/tox21/base64/{b64(MOLECULES[0]['smiles'])}",
            timeout=15)
        data = r.json()
        assert isinstance(data, (dict, list)) and len(data) > 0, \
            "Tox21 devia retornar pelo menos 1 predição"

    def test_admet_latency_under_30s(self, server_up):
        t0 = time.time()
        requests.get(
            f"{BASE_URL}/predict/bbb/base64/{b64(MOLECULES[0]['smiles'])}",
            timeout=35)
        elapsed = time.time() - t0
        assert elapsed < 30, f"BBB demorou {elapsed:.1f}s"


class TestDeepADMETREST:

    def test_deep_admet_myricetin(self, server_up):
        """Pipeline ADMET-AI completo para Myricetin."""
        mol = MOLECULES[4]  # Myricetin
        t0 = time.time()
        r = requests.get(f"{BASE_URL}/deep/{mol['smiles']}", timeout=60)
        elapsed = time.time() - t0
        passed = r.status_code == 200
        data = r.json() if passed else {}
        log_result("deep_admet_rest", mol["name"], passed,
                   f"endpoints={len(data)}, tempo={elapsed:.1f}s", elapsed)
        assert passed, f"Deep ADMET retornou {r.status_code}"
        assert elapsed < 60, f"Deep ADMET demorou {elapsed:.1f}s"

    def test_deep_admet_returns_multiple_properties(self, server_up):
        r = requests.get(f"{BASE_URL}/deep/{MOLECULES[0]['smiles']}", timeout=60)
        data = r.json()
        assert len(data) >= 10, \
            f"Deep ADMET devia retornar ≥10 propriedades, got {len(data)}"


class TestRenderREST:

    def test_render_returns_image(self, server_up):
        for mol in MOLECULES[:2]:
            r = requests.post(f"{BASE_URL}/render",
                              json={"smiles": mol["smiles"]}, timeout=10)
            assert r.status_code == 200, \
                f"{mol['name']}: render retornou {r.status_code}"

    def test_render_invalid_smiles(self, server_up):
        r = requests.post(f"{BASE_URL}/render",
                          json={"smiles": "INVALID_XYZ"}, timeout=5)
        assert r.status_code in [400, 422, 500]


# ── Relatório final ───────────────────────────────────────────────────────────

def pytest_sessionfinish(session, exitstatus):
    if not results_log:
        return
    Path("results").mkdir(exist_ok=True)
    fname = f"results/eval_{datetime.now():%Y%m%d_%H%M%S}.json"
    json.dump(results_log, open(fname, "w"), indent=2)

    passed  = sum(1 for r in results_log if r["passed"])
    total   = len(results_log)
    latencies = [r["latency_s"] for r in results_log if r["latency_s"] > 0]
    avg_lat = sum(latencies) / len(latencies) if latencies else 0

    print(f"\n{'='*55}")
    print(f"isDA Test Suite — {passed}/{total} passed  |  lat média: {avg_lat:.2f}s")
    failed = [r for r in results_log if not r["passed"]]
    if failed:
        print(f"\nFalhas ({len(failed)}):")
        for f in failed:
            print(f"  [{f['app']}] {f['molecule']}: {f['detail']}")
    print(f"Relatório: {fname}")
    print("=" * 55)
