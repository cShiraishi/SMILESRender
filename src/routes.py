from io import TextIOWrapper
from flask import Flask, render_template, request, send_file, jsonify
from converter import (
    convert_many_smiles_and_zip,
    convert_smiles,
)
from tools import read_csv
from base64 import b64decode
import urllib.request
import urllib.parse
import http.cookiejar
import re
import json
import threading
import hashlib
import os
import subprocess
from PepLink import aa_seqs_to_smiles, smiles_to_aa_seqs
from admet_interpreter import interpret, RISK_LABEL

# Limite de concorrência: apenas 1 processamento pesado por vez (Otimizado para Render Free)
processing_semaphore = threading.Semaphore(1)
pkcsm_lock = threading.Lock()
MAX_SMILES = 10

# Redis cache (opcional — fallback silencioso se indisponível)
try:
    import redis as _redis_lib
    _redis = _redis_lib.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), socket_connect_timeout=2)
    _redis.ping()
    _cache_ok = True
except Exception:
    _redis = None
    _cache_ok = False

def _cache_get(key: str):
    if _cache_ok:
        try: return _redis.get(key)
        except Exception: pass
    return None

def _cache_set(key: str, value: bytes, ttl: int = 86400):
    if _cache_ok:
        try: _redis.setex(key, ttl, value)
        except Exception: pass

import time
# Armazena openers pkCSM com cookies de sessão: smiles_hash -> {opener, time}
_pkcsm_openers = {}

def get_pkcsm_opener(hash_val):
    with pkcsm_lock:
        entry = _pkcsm_openers.get(hash_val)
        if entry and time.time() - entry['time'] < 1800:
            return entry['opener']
        if entry:
            del _pkcsm_openers[hash_val]
    return None

def set_pkcsm_opener(hash_val, opener):
    with pkcsm_lock:
        if len(_pkcsm_openers) > 500:
            now = time.time()
            to_del = [k for k, v in _pkcsm_openers.items() if now - v['time'] > 1800]
            for k in to_del:
                del _pkcsm_openers[k]
        _pkcsm_openers[hash_val] = {'opener': opener, 'time': time.time()}


from tasks import render_batch_task, predict_tool_task
from celery.result import AsyncResult
from admet_interpreter import interpret, RISK_LABEL, RISK_HEX

app = Flask(__name__)

@app.after_request
def set_security_headers(response):
    response.headers['Content-Security-Policy'] = (
        "default-src 'self' https://jsme-editor.github.io; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://jsme-editor.github.io; "
        "worker-src 'self' blob:; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://jsme-editor.github.io; "
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob: https://jsme-editor.github.io; "
        "connect-src 'self' https://jsme-editor.github.io; "
        "frame-src 'self' https://jsme-editor.github.io; "
        "object-src 'none'; "
        "base-uri 'self';"
    )
    response.headers['X-Frame-Options']        = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy']        = 'strict-origin-when-cross-origin'
    return response


@app.route("/ping")
def ping():
    return "pong", 200


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/download-example")
def download_example():
    # Caminho absoluto baseado na localização do routes.py
    base_dir = os.path.abspath(os.path.dirname(__file__))
    file_path = os.path.join(base_dir, "static", "example_molecules.csv")
    return send_file(file_path, as_attachment=True)


@app.route("/render", methods=["GET", "POST"])
def render_by_json():
    try:
        if request.method == "GET":
            smiles = request.args.get("smiles")
            format = request.args.get("format") or "png"
            if not smiles:
                return 'Missing "smiles" parameter', 400
            image = convert_smiles(smiles, format.lower())
            return send_file(image, f"image/{format}"), 200

        data = request.get_json()
        format: str = data["format"] if "format" in list(data) else "png"
        keep_duplicates: bool = (
            data["keep-duplicates"] if "keep-duplicates" in list(data) else False
        )
        smiles = data["smiles"] if "smiles" in list(data) else None

        if not smiles:
            return 'Invalid request! The payload should contain a "smiles" field!', 412

        elif type(smiles) == str:
            image = convert_smiles(smiles, format.lower())
            return send_file(image, f"image/{format}"), 200

        if type(smiles) == list:
            if len(smiles) > MAX_SMILES:
                return f"Exceeded the limit of {MAX_SMILES} SMILES per request!", 413

            ## If it is only a list of strings
            ## If it is only a list of strings
            smiles_to_convert: list[tuple[str, str, str]] = []
            registered_smiles: list[str] = []

            for item in smiles:
                if type(item) == str:
                    if not item in registered_smiles:
                        smiles_to_convert.append((item, "", format))
                        if not keep_duplicates:
                            registered_smiles.append(item)

                elif type(item) == dict:
                    if not item["smiles"]:
                        print("No smiles found... It will be ignored")
                        continue

                    smiles_to_convert.append(
                        (
                            item["smiles"],
                            item.get("name", ""),
                            item.get("format", format),
                        )
                    )

                else:
                    print("This item have a invalid type... It will be ignored")

            with processing_semaphore:
                zip_file = convert_many_smiles_and_zip(smiles_to_convert)
            
            return (
                send_file(
                    zip_file,
                    mimetype="application/zip",
                    as_attachment=True,
                    download_name="smiles_images.zip",
                ),
                200,
            )

        return "Ok", 200

    except Exception as err:
        print(err)
        return f'Could not convert smiles: "{err}"', 412


@app.route("/render/<string:smiles>", methods=["GET"])
def render_smiles(smiles: str):
    try:
        format = request.args.get("format") or "png"
        image = convert_smiles(smiles, format.lower())

        return send_file(image, f"image/{format}"), 200

    except Exception as err:
        print(err)
        return f'Could not convert smiles: "{err}"', 412


@app.route("/render/csv", methods=["POST"])
def render_by_csv():
    try:
        input = request.files["csv"]
        if not input or input.filename == "":
            return "No csv file in payload", 400

        smiles_column = request.form.get("smiles_column")
        names_column = request.form.get("names_column")
        delimiter = request.form.get("delimiter") or ","
        format = request.form.get("format") or "png"
        file = TextIOWrapper(input.stream, encoding="utf-8")

        if not smiles_column:
            return "Smiles column is not defined", 400

        data = list(
            map(
                lambda data: data + (format,),
                read_csv(
                    file=file,
                    smiles_column=smiles_column,
                    names_column=names_column,
                    delimiter=delimiter,
                ),
            )
        )

        if len(data) > MAX_SMILES:
            return f"Exceeded the limit of {MAX_SMILES} SMILES per request in CSV!", 413

        with processing_semaphore:
            zip_file = convert_many_smiles_and_zip(data)
        
        return (
            send_file(
                zip_file,
                mimetype="application/zip",
                as_attachment=True,
                download_name="smiles_images.zip",
            ),
            200,
        )

    except Exception as err:
        print(err)
        return f'Could not convert smiles: "{err}"', 412


@app.route("/render/base64/<string:smiles>", methods=["GET"])
def render_base64_smiles(smiles: str):
    try:
        decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
        format = request.args.get("format") or "png"
        image = convert_smiles(decoded_smiles, format.lower())

        return send_file(image, f"image/{format}"), 200

    except Exception as err:
        print(err)
        return f'Could not convert smiles: "{err}"', 412


PROTOX_MODELS = {
    'dili':     'Drug-Induced Liver Injury',
    'neuro':    'Neurotoxicity',
    'nephro':   'Nephrotoxicity',
    'respi':    'Respiratory Toxicity',
    'cardio':   'Cardiotoxicity',
    'carcino':  'Carcinogenicity',
    'immuno':   'Immunotoxicity',
    'mutagen':  'Mutagenicity',
    'cyto':     'Cytotoxicity',
    'bbb':      'Blood-Brain Barrier Permeability',
    'eco':      'Ecotoxicity',
    'clinical': 'Clinical Toxicity',
}

@app.route("/predict/protox/base64/<string:smiles>", methods=["GET"])
def predict_protox(smiles: str):
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem

        decoded = b64decode(smiles.encode()).decode()
        cache_key = f"smilerender:protox:{hashlib.md5(decoded.encode()).hexdigest()}"
        cached = _cache_get(cache_key)
        if cached:
            return cached, 200, {'Content-Type': 'application/json'}

        mol = Chem.MolFromSmiles(decoded)
        if mol is None:
            return jsonify({"error": "Invalid SMILES"}), 400
        AllChem.Compute2DCoords(mol)
        molblock = Chem.MolToMolBlock(mol)

        ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

        # Step 1: submit mol to get server_id
        params1 = urllib.parse.urlencode({'smilesString': molblock}).encode()
        req1 = urllib.request.Request(
            'https://tox.charite.de/protox3/index.php?site=compound_search_similarity',
            data=params1,
            headers={'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded'}
        )
        with opener.open(req1, timeout=20) as r:
            html = r.read().decode('utf-8', errors='replace')

        m = re.search(r"server_id='(\d+)'", html)
        if not m:
            return jsonify({"error": "ProTox did not return a server_id"}), 503
        server_id = m.group(1)

        # Step 2: run models
        model_str = ' '.join(PROTOX_MODELS.keys())
        params2 = urllib.parse.urlencode({
            'models': model_str, 'sdfile': 'empty',
            'mol': molblock, 'id': server_id,
        }).encode()
        req2 = urllib.request.Request(
            'https://tox.charite.de/protox3/src/run_models.php',
            data=params2,
            headers={
                'User-Agent': ua,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Referer': 'https://tox.charite.de/protox3/index.php?site=compound_search_similarity',
            }
        )
        with opener.open(req2, timeout=40) as r:
            raw = r.read().decode('utf-8', errors='replace')

        raw_json = json.loads(raw)

        # Normalise to {model_key: {label, active, probability}}
        results = {}
        for key, label in PROTOX_MODELS.items():
            if key not in raw_json:
                continue
            pred = raw_json[key].get('Prediction', '0.0')
            prob = float(raw_json[key].get('Probability', 0.0))
            active = float(pred) > 0
            results[key] = {'label': label, 'active': active, 'probability': round(prob, 4)}

        out = json.dumps(results).encode()
        _cache_set(cache_key, out)
        return out, 200, {'Content-Type': 'application/json'}

    except Exception as err:
        print(f"ProTox Error: {err}")
        return jsonify({"error": str(err)}), 500


@app.route("/predict/rdkit-filters/base64/<string:smiles>", methods=["GET"])
def rdkit_filters(smiles: str):
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors, rdMolDescriptors, Crippen, Lipinski
        from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams

        decoded = b64decode(smiles.encode()).decode()
        mol = Chem.MolFromSmiles(decoded)
        if mol is None:
            return jsonify({"error": "Invalid SMILES"}), 400

        # ── Structural alert catalogs ──────────────────────────────────────────
        pains_p = FilterCatalogParams()
        pains_p.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_A)
        pains_p.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_B)
        pains_p.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_C)
        pains_matches = list(FilterCatalog(pains_p).GetMatches(mol))

        brenk_p = FilterCatalogParams()
        brenk_p.AddCatalog(FilterCatalogParams.FilterCatalogs.BRENK)
        brenk_matches = list(FilterCatalog(brenk_p).GetMatches(mol))

        nih_p = FilterCatalogParams()
        nih_p.AddCatalog(FilterCatalogParams.FilterCatalogs.NIH)
        nih_matches = list(FilterCatalog(nih_p).GetMatches(mol))

        # ── Descriptors ────────────────────────────────────────────────────────
        mw   = round(Descriptors.MolWt(mol), 2)
        logp = round(Crippen.MolLogP(mol), 3)
        mr   = round(Crippen.MolMR(mol), 3)
        hbd  = Lipinski.NumHDonors(mol)
        hba  = Lipinski.NumHAcceptors(mol)
        tpsa = round(rdMolDescriptors.CalcTPSA(mol), 2)
        rotb = rdMolDescriptors.CalcNumRotatableBonds(mol)
        n_atoms = mol.GetNumHeavyAtoms()

        # ESOL calculation (Delaney 2004)
        # LogS = 0.16 - 0.63*LogP - 0.0062*MW + 0.066*RotB - 0.74*AP
        aromatic_atoms = sum(1 for a in mol.GetAtoms() if a.GetIsAromatic())
        ap = aromatic_atoms / n_atoms if n_atoms > 0 else 0
        logs = 0.16 - (0.63 * logp) - (0.0062 * mw) + (0.066 * rotb) - (0.74 * ap)
        sol_mgl = (10 ** logs) * mw * 1000 # Convert LogS (mol/L) to mg/L

        def viol(cond, msg): return [msg] if cond else []

        # Lipinski Ro5 (≤1 violation = pass)
        lip_v = (viol(mw   > 500,  f"MW {mw} Da > 500")
               + viol(logp > 5,    f"LogP {logp} > 5")
               + viol(hbd  > 5,    f"HBD {hbd} > 5")
               + viol(hba  > 10,   f"HBA {hba} > 10"))

        # Ghose (all must pass)
        ghose_v = (viol(not 160<=mw<=480,       f"MW {mw} not in [160–480]")
                 + viol(not -0.4<=logp<=5.6,    f"LogP {logp} not in [-0.4–5.6]")
                 + viol(not 40<=mr<=130,         f"MR {mr} not in [40–130]")
                 + viol(not 20<=n_atoms<=70,     f"Atoms {n_atoms} not in [20–70]"))

        # Veber (oral bioavailability)
        veber_v = (viol(rotb > 10,  f"RotBonds {rotb} > 10")
                 + viol(tpsa > 140, f"TPSA {tpsa} > 140 Å²"))

        # Egan (passive intestinal absorption)
        egan_v = (viol(logp > 5.88,  f"LogP {logp} > 5.88")
                + viol(tpsa > 131.6, f"TPSA {tpsa} > 131.6 Å²"))

        # Muegge (lead-like)
        muegge_v = (viol(not 200<=mw<=600,     f"MW {mw} not in [200–600]")
                  + viol(not -2<=logp<=5,       f"LogP {logp} not in [-2–5]")
                  + viol(tpsa > 150,            f"TPSA {tpsa} > 150 Å²")
                  + viol(rotb > 15,             f"RotBonds {rotb} > 15")
                  + viol(hbd > 5,               f"HBD {hbd} > 5")
                  + viol(hba > 10,              f"HBA {hba} > 10")
                  + viol(n_atoms < 10,          f"Heavy atoms {n_atoms} < 10"))

        return jsonify({
            "smiles": decoded,
            "pains":  {"pass": not pains_matches,
                       "alerts": [m.GetDescription() for m in pains_matches]},
            "brenk":  {"pass": not brenk_matches,
                       "alerts": [m.GetDescription() for m in brenk_matches]},
            "nih":    {"pass": not nih_matches,
                       "alerts": [m.GetDescription() for m in nih_matches]},
            "lipinski": {"pass": len(lip_v) <= 1, "violations": lip_v, "n": len(lip_v)},
            "ghose":    {"pass": not ghose_v,      "violations": ghose_v},
            "veber":    {"pass": not veber_v,      "violations": veber_v},
            "egan":     {"pass": not egan_v,       "violations": egan_v},
            "muegge":   {"pass": not muegge_v,     "violations": muegge_v},
            "values": {"mw": mw, "logp": logp, "mr": mr, "hbd": hbd,
                       "hba": hba, "tpsa": tpsa, "rotb": rotb, "n_atoms": n_atoms},
            "esol": {
                "logs": round(logs, 2),
                "sol_mgl": round(sol_mgl, 2),
                "category": "Insoluble" if logs < -6 else "Poorly" if logs < -4 else "Moderately" if logs < -2 else "Soluble"
            }
        })
    except Exception as err:
        print(f"RDKit Filters Error: {err}")
        return jsonify({"error": str(err)}), 500


@app.route("/predict/base64/<string:smiles>", methods=["GET"])
def predict(smiles: str):
    if not smiles:
        return "No Smile to predict", 400
    decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
    cache_key = f"smilerender:stoptox:{hashlib.md5(decoded_smiles.encode()).hexdigest()}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    
    # StopTox logic
    ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    headers = {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    }
    
    try:
        # Step 1: Visit homepage to get potential session cookies/set up environment
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        opener.open(urllib.request.Request("https://stoptox.mml.unc.edu/", headers=headers), timeout=30)
        
        # Step 2: GET request for prediction
        url = f"https://stoptox.mml.unc.edu/predict?smiles={urllib.parse.quote(decoded_smiles)}"
        req = urllib.request.Request(url, headers=headers)
        with opener.open(req, timeout=120) as response:
            result = response.read()
            if b"tablePreview" in result:
                _cache_set(cache_key, result)
                return result
    except Exception as e:
        print(f"StopTox Error: {e}")

    return "StopTox prediction failed – service might be down or SMILES incompatible.", 503


@app.route("/predict/stoplight/base64/<string:smiles>", methods=["GET"])
def predict_stoplight(smiles: str):
    decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
    cache_key = f"smilerender:stoplight:{hashlib.md5(decoded_smiles.encode()).hexdigest()}"
    cached = _cache_get(cache_key)
    if cached: return cached

    for attempt in range(3):
        try:
            # O StopLight agora exige JSON e um objeto 'options'
            payload = {
                "smiles": decoded_smiles,
                "options": {
                    "ALogP": True, "FSP3": True, "HBA": True, "HBD": True,
                    "Molecular Weight": True, "Num Heavy Atoms": True,
                    "Num Saturated Quaternary Carbons": True, "Number of Rings": True,
                    "Number of Rotatable Bonds": True, "Polar Surface Area": True,
                    "Solubility in Water (mg/L)": True, "precision": "2"
                }
            }
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                "https://stoplight.mml.unc.edu/smiles", 
                data=data,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Content-Type': 'application/json'
                }
            )

            with urllib.request.urlopen(req, timeout=120) as response:
                result = response.read()
                if not result: raise Exception("Empty result from StopLight")
                
            _cache_set(cache_key, result)
            return result
        except Exception as err:
            print(f"StopLight Attempt {attempt+1} Error: {err}")
            if attempt < 2:
                time.sleep(2)
                continue
            return f"Error connecting to StopLight after 3 attempts: {err}", 500

@app.route("/predict/pkcsm/base64/<string:smiles>", methods=["GET"])
def predict_pkcsm_init(smiles: str):
    decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
    smiles_hash = hashlib.md5(decoded_smiles.encode()).hexdigest()

    for attempt in range(3):
        try:
            cj = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
            params = {"smiles_str": decoded_smiles, "pred_type": "adme"}
            data = urllib.parse.urlencode(params).encode("utf-8")
            req = urllib.request.Request(
                "https://biosig.lab.uq.edu.au/pkcsm/admet_prediction",
                data=data,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )

            with opener.open(req, timeout=300) as response:
                final_url = response.geturl()
            
            set_pkcsm_opener(smiles_hash, opener)
            return jsonify({"result_url": final_url, "smiles_hash": smiles_hash})
        except Exception as err:
            import traceback
            error_details = traceback.format_exc()
            print(f"!!! pkCSM FAILURE for {decoded_smiles} (Attempt {attempt+1}):\n{error_details}")
            if attempt < 2:
                time.sleep(3)
                continue
            return f"pkCSM failed after 3 attempts. Possible causes: Invalid SMILES or External Server Down. Error: {err}", 500


@app.route("/predict/pkcsm/fetch", methods=["POST"])
def predict_pkcsm_fetch():
    try:
        req_data = request.get_json()
        target_url = req_data.get('url')
        smiles_hash = req_data.get('smiles_hash', '')

        if not target_url:
            return "No URL provided", 400

        req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
        opener = get_pkcsm_opener(smiles_hash)

        if opener:
            with opener.open(req, timeout=300) as response:
                return response.read()
        else:
            with urllib.request.urlopen(req, timeout=120) as response:
                return response.read()
    except Exception as err:
        print(f"pkCSM Fetch Error: {err}")
        return f"Error fetching pkCSM results: {err}", 500

@app.route("/export/report", methods=["POST"])
def export_report():
    """Generate a professional enterprise-grade ADMET PDF report with automated interpretation."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            HRFlowable, KeepTogether, Image as RLImage, PageBreak,
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
        from rdkit import Chem
        from rdkit.Chem import Draw
        import io as _io
        import datetime
        from collections import OrderedDict

        raw = request.get_json()
        if not raw:
            return "No data provided", 400

        # ── Palette ────────────────────────────────────────────────────────────
        BRAND_BLUE    = colors.HexColor("#1a3a5c")
        ACCENT_GREEN  = colors.HexColor("#16a34a")
        LIGHT_GRAY    = colors.HexColor("#f8f9fa")
        MID_GRAY      = colors.HexColor("#dee2e6")
        TEXT_DARK     = colors.HexColor("#1e293b")
        TEXT_MID      = colors.HexColor("#475569")

        TOOL_COLORS = {
            "StopTox":      colors.HexColor("#b45309"),
            "StopLight":    colors.HexColor("#1d4ed8"),
            "pkCSM":        ACCENT_GREEN,
            "RDKit Filters": colors.HexColor("#0d9488"),
        }
        FLAG_COLORS = {
            "critical": colors.HexColor("#7f1d1d"),
            "high":     colors.HexColor("#dc2626"),
            "medium":   colors.HexColor("#d97706"),
            "low":      colors.HexColor("#16a34a"),
        }
        FLAG_BG = {
            "critical": colors.HexColor("#fef2f2"),
            "high":     colors.HexColor("#fff1f1"),
            "medium":   colors.HexColor("#fffbeb"),
            "low":      colors.HexColor("#f0fdf4"),
        }
        FLAG_ICON = {"critical": "[!!]", "high": "[!]", "medium": "[~]", "low": "[ok]"}

        # ── Styles ─────────────────────────────────────────────────────────────
        base = getSampleStyleSheet()

        def ps(name, parent="Normal", **kw):
            return ParagraphStyle(name, parent=base[parent], **kw)

        sTitle      = ps("sTitle",    "Title", fontSize=26, textColor=BRAND_BLUE,
                         spaceAfter=4, leading=30, alignment=TA_CENTER)
        sSubtitle   = ps("sSubtitle", fontSize=11, textColor=TEXT_MID,
                         alignment=TA_CENTER, spaceAfter=2)
        sMeta       = ps("sMeta",     fontSize=9, textColor=TEXT_MID,
                         alignment=TA_CENTER, spaceAfter=6)
        sSection    = ps("sSection",  "Heading1", fontSize=13, textColor=BRAND_BLUE,
                         spaceBefore=14, spaceAfter=4, leading=16)
        sTool       = ps("sTool",     "Heading2", fontSize=11, textColor=colors.white,
                         spaceBefore=8, spaceAfter=4, leading=14)
        sCategory   = ps("sCategory", "Heading3", fontSize=9, textColor=BRAND_BLUE,
                         spaceBefore=6, spaceAfter=2, leading=12, fontName="Helvetica-Bold")
        sBody       = ps("sBody",     fontSize=8, textColor=TEXT_DARK, leading=11)
        sBodyJ      = ps("sBodyJ",    fontSize=8, textColor=TEXT_DARK, leading=12,
                         alignment=TA_JUSTIFY)
        sSmall      = ps("sSmall",    fontSize=7, textColor=TEXT_MID, leading=9)
        sFooter     = ps("sFooter",   fontSize=7, textColor=TEXT_MID, alignment=TA_CENTER)
        sNarrative  = ps("sNarr",     fontSize=8.5, textColor=TEXT_DARK, leading=13,
                         alignment=TA_JUSTIFY, spaceBefore=4, spaceAfter=4,
                         leftIndent=6, rightIndent=6)
        sInterpHdr  = ps("sIntHdr",   fontSize=10, textColor=BRAND_BLUE,
                         fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=4)
        sFlag       = ps("sFlag",     fontSize=8, textColor=TEXT_DARK, leading=11)

        # ── Organise data: smiles → tool → category → rows ─────────────────────
        organised  = OrderedDict()
        mol_names  = {}   # {smiles: display_name}
        for row in raw:
            smi  = row.get("SMILES", "")
            tool = row.get("Tool", "Unknown")
            cat  = row.get("Category", "General")
            name = row.get("Name", "").strip()
            if smi not in organised:
                organised[smi] = OrderedDict()
            if tool not in organised[smi]:
                organised[smi][tool] = OrderedDict()
            if cat not in organised[smi][tool]:
                organised[smi][tool][cat] = []
            organised[smi][tool][cat].append(row)
            if name and smi not in mol_names:
                mol_names[smi] = name

        # ── Run interpretation for every molecule ──────────────────────────────
        profiles = {smi: interpret(smi, tools) for smi, tools in organised.items()}

        now      = datetime.datetime.now()
        story    = []
        W, _H    = A4
        usable_w = W - 4 * cm

        # ── Helper: coloured tool header ───────────────────────────────────────
        def tool_header(tool_name):
            col = TOOL_COLORS.get(tool_name, BRAND_BLUE)
            t = Table([[Paragraph(tool_name, sTool)]], colWidths=[usable_w])
            t.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), col),
                ("TOPPADDING",    (0,0), (-1,-1), 5),
                ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ]))
            return t

        # ── Helper: data table ─────────────────────────────────────────────────
        def data_table(rows, tool_name):
            col = TOOL_COLORS.get(tool_name, BRAND_BLUE)
            hdr = [Paragraph(h, ps(f"th{tool_name}", fontSize=8, textColor=colors.white,
                                   fontName="Helvetica-Bold"))
                   for h in ["Property", "Value", "Unit"]]
            data = [hdr]
            for r in rows:
                data.append([
                    Paragraph(str(r.get("Property", "")), sBody),
                    Paragraph(str(r.get("Value", "")),
                              ps(f"tv{tool_name}", fontSize=8, textColor=TEXT_DARK,
                                 fontName="Helvetica-Bold")),
                    Paragraph(str(r.get("Unit", "-")), sSmall),
                ])
            t = Table(data, colWidths=[usable_w * 0.55, usable_w * 0.30, usable_w * 0.15])
            t.setStyle(TableStyle([
                ("BACKGROUND",     (0,0), (-1,0),  col),
                ("TEXTCOLOR",      (0,0), (-1,0),  colors.white),
                ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_GRAY, colors.white]),
                ("GRID",           (0,0), (-1,-1), 0.3, MID_GRAY),
                ("TOPPADDING",     (0,0), (-1,-1), 3),
                ("BOTTOMPADDING",  (0,0), (-1,-1), 3),
                ("LEFTPADDING",    (0,0), (-1,-1), 6),
                ("FONTSIZE",       (0,0), (-1,-1), 8),
            ]))
            return t

        # ── Helper: molecule image ─────────────────────────────────────────────
        def mol_image(smi, size=160):
            try:
                mol = Chem.MolFromSmiles(smi)
                if mol is None:
                    return None
                pil = Draw.MolToImage(mol, size=(size, size))
                buf = _io.BytesIO()
                pil.save(buf, format="PNG")
                buf.seek(0)
                return RLImage(buf, width=size * 0.4, height=size * 0.4)
            except Exception:
                return None

        # ── Helper: risk badge (small coloured pill) ───────────────────────────
        def risk_badge(level: str):
            label = RISK_LABEL.get(level, level.title())
            col   = FLAG_COLORS.get(level, BRAND_BLUE)
            t = Table([[Paragraph(label, ps(f"rb{level}", fontSize=9, textColor=colors.white,
                                            fontName="Helvetica-Bold", alignment=TA_CENTER))]],
                      colWidths=[3.5 * cm])
            t.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), col),
                ("TOPPADDING",    (0,0), (-1,-1), 4),
                ("BOTTOMPADDING", (0,0), (-1,-1), 4),
                ("LEFTPADDING",   (0,0), (-1,-1), 8),
                ("RIGHTPADDING",  (0,0), (-1,-1), 8),
            ]))
            return t

        # ── Helper: interpretation block ───────────────────────────────────────
        def interpretation_block(profile):
            """Returns a list of flowables for the Interpretation section."""
            blk = []
            lvl = profile.overall

            # Header bar with risk level
            hdr_col = FLAG_COLORS.get(lvl, BRAND_BLUE)
            hdr_txt = f"Interpretation  ·  {RISK_LABEL.get(lvl, lvl.title())}"
            hdr_tbl = Table(
                [[Paragraph(hdr_txt, ps(f"ih{lvl}", fontSize=10, textColor=colors.white,
                                        fontName="Helvetica-Bold"))],],
                colWidths=[usable_w]
            )
            hdr_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), hdr_col),
                ("TOPPADDING",    (0,0), (-1,-1), 6),
                ("BOTTOMPADDING", (0,0), (-1,-1), 6),
                ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ]))
            blk.append(hdr_tbl)

            # Narrative paragraph
            blk.append(Spacer(1, 0.2 * cm))
            blk.append(Paragraph(profile.narrative, sNarrative))
            blk.append(Spacer(1, 0.25 * cm))

            # Flags table — only non-low flags unless there are very few
            show_flags = [f for f in profile.flags if f.level != "low"]
            positives  = [f for f in profile.flags if f.level == "low"]

            if show_flags:
                flag_data = [[
                    Paragraph("Risk", ps("fh1", fontSize=8, textColor=colors.white,
                                         fontName="Helvetica-Bold")),
                    Paragraph("Source", ps("fh2", fontSize=8, textColor=colors.white,
                                           fontName="Helvetica-Bold")),
                    Paragraph("Finding", ps("fh3", fontSize=8, textColor=colors.white,
                                            fontName="Helvetica-Bold")),
                ]]
                style_cmds = [
                    ("BACKGROUND",    (0,0), (-1,0),  BRAND_BLUE),
                    ("GRID",          (0,0), (-1,-1), 0.3, MID_GRAY),
                    ("TOPPADDING",    (0,0), (-1,-1), 3),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 3),
                    ("LEFTPADDING",   (0,0), (-1,-1), 6),
                    ("VALIGN",        (0,0), (-1,-1), "TOP"),
                ]
                for i, f in enumerate(show_flags, 1):
                    icon  = FLAG_ICON.get(f.level, "·")
                    fcol  = FLAG_COLORS.get(f.level, TEXT_DARK)
                    bg    = FLAG_BG.get(f.level, colors.white)
                    flag_data.append([
                        Paragraph(f"{icon} {f.level.upper()}",
                                  ps(f"fl{i}", fontSize=7, textColor=fcol,
                                     fontName="Helvetica-Bold")),
                        Paragraph(f.tool, ps(f"fs{i}", fontSize=7, textColor=TEXT_MID)),
                        Paragraph(f.text, ps(f"ff{i}", fontSize=7.5, textColor=TEXT_DARK,
                                             leading=10)),
                    ])
                    style_cmds.append(("BACKGROUND", (0,i), (-1,i), bg))

                ft = Table(flag_data,
                           colWidths=[usable_w * 0.13, usable_w * 0.17, usable_w * 0.70])
                ft.setStyle(TableStyle(style_cmds))
                blk.append(ft)
                blk.append(Spacer(1, 0.15 * cm))

            # Positive findings summary (condensed)
            if positives:
                pos_text = "  ·  ".join(
                    f"🟢 {f.text}" for f in positives[:6]
                )
                if len(positives) > 6:
                    pos_text += f"  ·  … +{len(positives)-6} more"
                blk.append(Paragraph(pos_text,
                                     ps("posf", fontSize=7, textColor=colors.HexColor("#15803d"),
                                        leading=11)))
                blk.append(Spacer(1, 0.15 * cm))

            return blk

        # ══════════════════════════════════════════════════════════════════════
        # COVER PAGE
        # ══════════════════════════════════════════════════════════════════════
        story.append(Spacer(1, 2.5 * cm))
        story.append(Paragraph("ADMET Profiling Report", sTitle))
        story.append(Paragraph("Multi-Engine Computational ADMET Analysis with Automated Interpretation", sSubtitle))
        story.append(Spacer(1, 0.4 * cm))
        story.append(HRFlowable(width=usable_w, thickness=2, color=BRAND_BLUE))
        story.append(Spacer(1, 0.4 * cm))
        story.append(Paragraph(
            f"Generated: {now.strftime('%B %d, %Y  |  %H:%M')}  ·  "
            f"Molecules: {len(organised)}  ·  "
            "Tools: RDKit Filters · StopTox · StopLight · pkCSM",
            sMeta
        ))
        story.append(Spacer(1, 1.2 * cm))

        # Tool legend
        leg_data = [[Paragraph(t, ps(f"leg{t}", fontSize=9, textColor=colors.white,
                                      alignment=TA_CENTER, fontName="Helvetica-Bold"))
                     for t in ["RDKit Filters", "StopTox", "StopLight", "pkCSM"]]]
        leg = Table(leg_data, colWidths=[usable_w / 4] * 4)
        leg.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (0,0), colors.HexColor("#0d9488")),
            ("BACKGROUND",    (1,0), (1,0), TOOL_COLORS["StopTox"]),
            ("BACKGROUND",    (2,0), (2,0), TOOL_COLORS["StopLight"]),
            ("BACKGROUND",    (3,0), (3,0), TOOL_COLORS["pkCSM"]),
            ("TOPPADDING",    (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("INNERGRID",     (0,0), (-1,-1), 1, colors.white),
        ]))
        story.append(leg)
        story.append(Spacer(1, 0.8 * cm))

        # ── Executive Summary table ────────────────────────────────────────────
        story.append(Paragraph("Executive Summary", sSection))
        has_names = bool(mol_names)
        exec_cols = ["#", "Name", "SMILES", "Overall Risk", "Critical", "High", "Medium"] if has_names \
                    else ["#", "SMILES", "Overall Risk", "Critical", "High", "Medium"]
        exec_hdr = [Paragraph(h, ps(f"eh{h}", fontSize=8, textColor=colors.white,
                                     fontName="Helvetica-Bold"))
                    for h in exec_cols]
        exec_rows = [exec_hdr]
        for n, (smi, _) in enumerate(organised.items(), 1):
            prof  = profiles[smi]
            rlvl  = prof.overall
            rcol  = FLAG_COLORS.get(rlvl, BRAND_BLUE)
            rbg   = FLAG_BG.get(rlvl, colors.white)
            nc    = sum(1 for f in prof.flags if f.level == "critical")
            nh    = sum(1 for f in prof.flags if f.level == "high")
            nm    = sum(1 for f in prof.flags if f.level == "medium")
            base_row = [Paragraph(str(n), sBody)]
            if has_names:
                base_row.append(Paragraph(mol_names.get(smi, "—"), sBody))
            base_row += [
                Paragraph(smi[:45] + ("…" if len(smi) > 45 else ""), sSmall),
                Paragraph(RISK_LABEL.get(rlvl, rlvl.title()),
                          ps(f"rl{n}", fontSize=8, textColor=colors.white,
                             fontName="Helvetica-Bold", alignment=TA_CENTER)),
                Paragraph(str(nc) if nc else "—",
                          ps(f"nc{n}", fontSize=8, fontName="Helvetica-Bold",
                             textColor=FLAG_COLORS["critical"] if nc else TEXT_MID,
                             alignment=TA_CENTER)),
                Paragraph(str(nh) if nh else "—",
                          ps(f"nh{n}", fontSize=8, fontName="Helvetica-Bold",
                             textColor=FLAG_COLORS["high"] if nh else TEXT_MID,
                             alignment=TA_CENTER)),
                Paragraph(str(nm) if nm else "—",
                          ps(f"nm{n}", fontSize=8,
                             textColor=FLAG_COLORS["medium"] if nm else TEXT_MID,
                             alignment=TA_CENTER)),
            ]
            exec_rows.append(base_row)

        exec_style = [
            ("BACKGROUND",    (0,0), (-1,0), BRAND_BLUE),
            ("GRID",          (0,0), (-1,-1), 0.3, MID_GRAY),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]
        for n, (smi, _) in enumerate(organised.items(), 1):
            rlvl = profiles[smi].overall
            rcol = FLAG_COLORS.get(rlvl, BRAND_BLUE)
            rbg  = FLAG_BG.get(rlvl, colors.white)
            exec_style.append(("BACKGROUND", (2, n), (2, n), rcol))
            exec_style.append(("ROWBACKGROUNDS", (0, n), (1, n), [
                LIGHT_GRAY if n % 2 == 0 else colors.white]))

        if has_names:
            exec_col_w = [0.8*cm, usable_w*0.20, usable_w*0.32, usable_w*0.16,
                          usable_w*0.10, usable_w*0.10, usable_w*0.10]
        else:
            exec_col_w = [0.8*cm, usable_w*0.50, usable_w*0.18,
                          usable_w*0.10, usable_w*0.10, usable_w*0.10]
        et = Table(exec_rows, colWidths=exec_col_w)
        et.setStyle(TableStyle(exec_style))
        story.append(et)
        story.append(Spacer(1, 0.3 * cm))

        # Risk legend
        legend_row = []
        for lvl in ("critical", "high", "medium", "low"):
            legend_row.append(
                Paragraph(f"{FLAG_ICON[lvl]}  {RISK_LABEL[lvl]}",
                          ps(f"ll{lvl}", fontSize=7, textColor=FLAG_COLORS[lvl],
                             alignment=TA_CENTER))
            )
        lt = Table([legend_row], colWidths=[usable_w / 4] * 4)
        lt.setStyle(TableStyle([("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2)]))
        story.append(lt)

        story.append(PageBreak())

        # ══════════════════════════════════════════════════════════════════════
        # PER-MOLECULE SECTIONS
        # ══════════════════════════════════════════════════════════════════════
        tool_order = ["RDKit Filters", "StopTox", "StopLight", "pkCSM"]

        for mol_idx, (smi, tools) in enumerate(organised.items(), 1):
            story.append(HRFlowable(width=usable_w, thickness=1.5, color=BRAND_BLUE))

            # Molecule heading + 2D structure
            img = mol_image(smi)
            mol_label = mol_names.get(smi, "")
            heading_title = f"Molecule {mol_idx}" + (f"  —  {mol_label}" if mol_label else "")
            heading_paras = [
                Paragraph(heading_title, sSection),
                Paragraph(smi, ps("smilesCode", fontSize=8.5, textColor=TEXT_MID,
                                  fontName="Courier", leading=12)),
            ]
            if img:
                mol_tbl = Table(
                    [[heading_paras, img]],
                    colWidths=[usable_w - 6.5*cm, 6.5*cm]
                )
                mol_tbl.setStyle(TableStyle([
                    ("VALIGN",       (0,0), (-1,-1), "TOP"),
                    ("TOPPADDING",   (0,0), (-1,-1), 0),
                    ("LEFTPADDING",  (0,0), (-1,-1), 0),
                    ("RIGHTPADDING", (0,0), (-1,-1), 0),
                ]))
                story.append(mol_tbl)
            else:
                for para in heading_paras:
                    story.append(para)

            # ── Interpretation ────────────────────────────────────────────────
            story.append(Spacer(1, 0.3 * cm))
            for item in interpretation_block(profiles[smi]):
                story.append(item)

            # ── Raw data per tool ─────────────────────────────────────────────
            for tool in tool_order:
                if tool not in tools:
                    continue
                cats = tools[tool]
                block = [Spacer(1, 0.3*cm), tool_header(tool)]
                for cat, rows in cats.items():
                    block.append(Paragraph(cat, sCategory))
                    block.append(data_table(rows, tool))
                    block.append(Spacer(1, 0.2*cm))
                story.append(KeepTogether(block[:6]))
                for item in block[6:]:
                    story.append(item)

            if mol_idx < len(organised):
                story.append(PageBreak())

        # ══════════════════════════════════════════════════════════════════════
        # METHODOLOGY
        # ══════════════════════════════════════════════════════════════════════
        story.append(Spacer(1, 0.8*cm))
        story.append(HRFlowable(width=usable_w, thickness=2, color=BRAND_BLUE))
        story.append(Paragraph("Methodology", sSection))
        methods = [
            ("StopTox",      "In silico acute toxicity predictions (oral, dermal, inhalation LD50/LC50) via the UNC MML StopTox server. GHS hazard classification applied."),
            ("StopLight",    "Drug-likeness and pharmacokinetic profiling via the UNC MML StopLight server. Lipinski Rule of 5, Veber and Egan rules evaluated."),
            ("pkCSM",        "Comprehensive ADME + toxicity predictions (absorption, distribution, metabolism, excretion, AMES, hERG, hepatotoxicity) via the pkCSM server (University of Queensland)."),
            ("ProTox-3.0",   "Toxicity prediction across 12 endpoints (DILI, neurotoxicity, nephrotoxicity, carcinogenicity, mutagenicity, BBB permeability, etc.) via the ProTox-3.0 server (Charité Berlin)."),
        ]
        for tool, desc in methods:
            col = TOOL_COLORS.get(tool, BRAND_BLUE)
            t = Table([[Paragraph(f"<b>{tool}</b> — {desc}", sBody)]], colWidths=[usable_w])
            t.setStyle(TableStyle([
                ("LEFTBORDERPADDING", (0,0), (-1,-1), 4),
                ("LEFTPADDING",       (0,0), (-1,-1), 8),
                ("TOPPADDING",        (0,0), (-1,-1), 4),
                ("BOTTOMPADDING",     (0,0), (-1,-1), 4),
                ("LINEAFTER",         (0,0), (0,-1),  0, colors.white),
                ("LINEBEFORE",        (0,0), (0,-1),  3, col),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.15*cm))

        story.append(Spacer(1, 0.4*cm))
        story.append(Paragraph(
            "Disclaimer: All predictions are computational estimates generated for research "
            "purposes only. They do not constitute regulatory advice and should be validated "
            "by experimental studies before use in any decision-making process.",
            ps("disc", fontSize=7, textColor=TEXT_MID, alignment=TA_JUSTIFY, leading=10)
        ))
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(
            f"Report generated by SmileRender · {now.strftime('%Y-%m-%d %H:%M')}",
            sFooter
        ))

        # ── Build PDF ─────────────────────────────────────────────────────────
        buf = _io.BytesIO()

        def footer_canvas(canvas, doc):
            canvas.saveState()
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(TEXT_MID)
            canvas.drawCentredString(
                W / 2, 1.2*cm,
                f"SmileRender · ADMET Report · {now.strftime('%Y-%m-%d')} · Page {doc.page}"
            )
            canvas.restoreState()

        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            leftMargin=2*cm, rightMargin=2*cm,
            topMargin=2.2*cm, bottomMargin=2.2*cm,
            title="ADMET Profiling Report",
            author="SmileRender",
        )
        doc.build(story, onFirstPage=footer_canvas, onLaterPages=footer_canvas)
        buf.seek(0)

        filename = f"ADMET_Report_{now.strftime('%Y%m%d_%H%M')}.pdf"
        return send_file(buf, mimetype="application/pdf",
                         as_attachment=True, download_name=filename)

    except Exception as err:
        print(f"Report Export Error: {err}")
        import traceback; traceback.print_exc()
        return f"Error generating report: {err}", 500


@app.route("/export/excel", methods=["POST"])
def export_excel():
    try:
        import pandas as pd
        import io
        from flask import send_file

        data = request.get_json()
        if not data:
            return "No data provided", 400

        # DataFrame principal (Dados Detalhados)
        df_detailed = pd.DataFrame(data)

        if len(df_detailed["SMILES"].unique()) > MAX_SMILES:
             return f"Exceeded the limit of {MAX_SMILES} unique SMILES for export!", 413
        
        # Garantir colunas padrão
        base_cols = ["SMILES", "Tool", "Category", "Property", "Value", "Unit"]
        if "Name" in df_detailed.columns:
            base_cols = ["Name"] + base_cols
        for col in base_cols:
            if col not in df_detailed.columns:
                df_detailed[col] = "-"

        # Criar Aba Comparativa (Pivoteada)
        # Vamos criar uma chave única: "Tool_Property" para evitar colisões
        df_detailed['Unique_Prop'] = df_detailed['Tool'] + "_" + df_detailed['Property']
        
        # Tentar pivotear. Se houver duplicatas por alguma razão técnica, pegamos a primeira
        try:
            df_pivot = df_detailed.pivot_table(
                index='SMILES', 
                columns='Unique_Prop', 
                values='Value', 
                aggfunc='first'
            ).reset_index()
        except Exception as pivot_err:
            print(f"Excel pivot failed (sheet will be empty): {pivot_err}")
            df_pivot = pd.DataFrame()

        # Criar buffer para o Excel
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # 1. Salvar Aba de Comparação primeiro
            if not df_pivot.empty:
                df_pivot.to_excel(writer, index=False, sheet_name='SMILES Comparison')
            
            # 2. Salvar Aba Completa
            df_detailed.drop(columns=['Unique_Prop']).to_excel(writer, index=False, sheet_name='All Detailed Data')
            
            # Formatação Básica (Ajuste de Colunas)
            for sheetname in writer.sheets:
                worksheet = writer.sheets[sheetname]
                for col in worksheet.columns:
                    max_length = 0
                    column = col[0].column_letter # Get the column name
                    for cell in col:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except: pass
                    adjusted_width = (max_length + 2)
                    worksheet.column_dimensions[column].width = min(adjusted_width, 50) # Limitar a 50

        output.seek(0)
        
        return send_file(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=f"Molecule_Analysis_{int(pd.Timestamp.now().timestamp())}.xlsx"
        )
    except Exception as err:
        print(f"Excel Export Error: {err}")
        return f"Error generating Excel: {err}", 500

@app.route("/convert/iupac", methods=["POST"])
def convert_iupac():
    try:
        body = request.get_json()
        smiles = body.get("smiles", "").strip()
        if not smiles:
            return jsonify({"error": "No SMILES provided"}), 400

        cache_key = f"smilerender:iupac:{hashlib.md5(smiles.encode()).hexdigest()}"
        cached = _cache_get(cache_key)
        if cached:
            return cached, 200, {'Content-Type': 'application/json'}

        encoded = urllib.parse.quote(smiles, safe='')
        url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/{encoded}/property/IUPACName,InChI,InChIKey,MolecularFormula,MolecularWeight/JSON"
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={'User-Agent': 'SmileRender/1.0'})

        with urllib.request.urlopen(req, timeout=15, context=ctx) as response:
            result = response.read()

        _cache_set(cache_key, result)
        return result, 200, {'Content-Type': 'application/json'}

    except urllib.error.HTTPError as e:
        if e.code == 404:
            return jsonify({"error": "Compound not found in PubChem"}), 404
        return jsonify({"error": f"PubChem error: {e.code}"}), 500
    except Exception as err:
        print(f"IUPAC Convert Error: {err}")
        return jsonify({"error": str(err)}), 500


@app.route("/descriptors", methods=["POST"])
def calc_descriptors():
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors, rdMolDescriptors, Crippen, Lipinski, QED
        body = request.get_json()
        smiles_list = body.get("smiles", [])
        if not smiles_list:
            return jsonify({"error": "No SMILES provided"}), 400

        results = []
        for smi in smiles_list[:MAX_SMILES]:
            mol = Chem.MolFromSmiles(smi)
            if mol is None:
                results.append({"smiles": smi, "error": "Invalid SMILES"})
                continue

            mw   = Descriptors.MolWt(mol)
            logp = Crippen.MolLogP(mol)
            hbd  = Lipinski.NumHDonors(mol)
            hba  = Lipinski.NumHAcceptors(mol)
            tpsa = rdMolDescriptors.CalcTPSA(mol)
            rotb = rdMolDescriptors.CalcNumRotatableBonds(mol)

            results.append({
                "smiles": smi,
                # --- Constitutional ---
                "MolecularWeight":          round(mw, 3),
                "ExactMolWt":               round(Descriptors.ExactMolWt(mol), 5),
                "HeavyAtoms":               mol.GetNumHeavyAtoms(),
                "NumHeteroatoms":           rdMolDescriptors.CalcNumHeteroatoms(mol),
                "NHOH":                     Lipinski.NHOHCount(mol),
                "NO":                       Lipinski.NOCount(mol),
                "FractionCSP3":             round(rdMolDescriptors.CalcFractionCSP3(mol), 4),
                "MolMR":                    round(Crippen.MolMR(mol), 3),
                "LabuteASA":                round(rdMolDescriptors.CalcLabuteASA(mol), 3),
                # --- Drug-likeness ---
                "LogP":                     round(logp, 3),
                "TPSA":                     round(tpsa, 2),
                "HBD":                      hbd,
                "HBA":                      hba,
                "RotatableBonds":           rotb,
                "QED":                      round(QED.qed(mol), 4),
                "LipinskiViolations":       int(sum([mw > 500, logp > 5, hbd > 5, hba > 10])),
                "VerberViolations":         int(sum([rotb > 10, tpsa > 140])),
                "EganViolations":           int(sum([logp > 5.88, tpsa > 131.6])),
                # --- Topological ---
                "BalabanJ":                 round(Descriptors.BalabanJ(mol), 4),
                "BertzCT":                  round(Descriptors.BertzCT(mol), 3),
                "HallKierAlpha":            round(Descriptors.HallKierAlpha(mol), 4),
                "Kappa1":                   round(rdMolDescriptors.CalcKappa1(mol), 4),
                "Kappa2":                   round(rdMolDescriptors.CalcKappa2(mol), 4),
                "Kappa3":                   round(rdMolDescriptors.CalcKappa3(mol), 4),
                "Chi0n":                    round(rdMolDescriptors.CalcChi0n(mol), 4),
                "Chi1n":                    round(rdMolDescriptors.CalcChi1n(mol), 4),
                "Chi2n":                    round(rdMolDescriptors.CalcChi2n(mol), 4),
                "Chi3n":                    round(rdMolDescriptors.CalcChi3n(mol), 4),
                "Chi4n":                    round(rdMolDescriptors.CalcChi4n(mol), 4),
                "Ipc":                      round(Descriptors.Ipc(mol), 4),
                # --- Electronic / VSA ---
                "MaxEStateIndex":           round(Descriptors.MaxEStateIndex(mol), 4),
                "MinEStateIndex":           round(Descriptors.MinEStateIndex(mol), 4),
                "MaxAbsEStateIndex":        round(Descriptors.MaxAbsEStateIndex(mol), 4),
                "MinAbsEStateIndex":        round(Descriptors.MinAbsEStateIndex(mol), 4),
                "PEOE_VSA1":               round(Descriptors.PEOE_VSA1(mol), 3),
                "PEOE_VSA2":               round(Descriptors.PEOE_VSA2(mol), 3),
                "SMR_VSA1":                round(Descriptors.SMR_VSA1(mol), 3),
                "SMR_VSA2":                round(Descriptors.SMR_VSA2(mol), 3),
                "SlogP_VSA1":              round(Descriptors.SlogP_VSA1(mol), 3),
                "SlogP_VSA2":              round(Descriptors.SlogP_VSA2(mol), 3),
                # --- Ring & Fragment ---
                "Rings":                    rdMolDescriptors.CalcNumRings(mol),
                "AromaticRings":            rdMolDescriptors.CalcNumAromaticRings(mol),
                "AliphaticRings":           rdMolDescriptors.CalcNumAliphaticRings(mol),
                "AromaticCarbocycles":      rdMolDescriptors.CalcNumAromaticCarbocycles(mol),
                "AromaticHeterocycles":     rdMolDescriptors.CalcNumAromaticHeterocycles(mol),
                "SaturatedCarbocycles":     rdMolDescriptors.CalcNumSaturatedCarbocycles(mol),
                "SaturatedHeterocycles":    rdMolDescriptors.CalcNumSaturatedHeterocycles(mol),
                "AliphaticCarbocycles":     rdMolDescriptors.CalcNumAliphaticCarbocycles(mol),
                "AliphaticHeterocycles":    rdMolDescriptors.CalcNumAliphaticHeterocycles(mol),
                "NumAromaticAtoms":         sum(1 for atom in mol.GetAtoms() if atom.GetIsAromatic()),
                "NumSaturatedRings":        rdMolDescriptors.CalcNumSaturatedRings(mol),
            })

            # --- Optional fingerprints ---
            fps_requested = body.get("fingerprints", [])
            entry = results[-1]
            if "rdkit" in fps_requested:
                fp = Chem.RDKFingerprint(mol, fpSize=1024)
                bits = fp.ToBitString()
                entry["fp_rdkit_bits"] = bits
                entry["fp_rdkit_onbits"] = bits.count("1")
            if "morgan" in fps_requested:
                from rdkit.Chem import AllChem
                fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius=2, nBits=2048)
                bits = fp.ToBitString()
                entry["fp_morgan_bits"] = bits
                entry["fp_morgan_onbits"] = bits.count("1")
            if "maccs" in fps_requested:
                from rdkit.Chem.MACCSkeys import GenMACCSKeys
                fp = GenMACCSKeys(mol)
                bits = fp.ToBitString()
                entry["fp_maccs_bits"] = bits
                entry["fp_maccs_onbits"] = bits.count("1")
            if "atompair" in fps_requested:
                fp = rdMolDescriptors.GetHashedAtomPairFingerprintAsBitVect(mol, nBits=2048)
                bits = fp.ToBitString()
                entry["fp_atompair_bits"] = bits
                entry["fp_atompair_onbits"] = bits.count("1")

        return jsonify(results)
    except Exception as err:
        print(f"Descriptors Error: {err}")
        return jsonify({"error": str(err)}), 500


@app.route("/descriptors/excel", methods=["POST"])
def descriptors_excel():
    """Export descriptor results (already computed) as .xlsx"""
    try:
        import pandas as pd
        import io
        data = request.get_json()
        if not data or not isinstance(data, list):
            return "No data provided", 400

        # fp_bit_keys  = full bit-vector columns (fp_X_bits)  → separate sheets
        # phys_keys    = everything else except "error"       → Descriptors sheet
        #                (includes fp_X_onbits scalar counts)
        fp_bit_keys = [k for k in data[0].keys() if k.startswith("fp_") and k.endswith("_bits")]
        phys_keys   = [k for k in data[0].keys()
                       if k != "error" and not (k.startswith("fp_") and k.endswith("_bits"))]

        # --- Sheet 1: Physicochemical descriptors (wide format) ---
        df_phys = pd.DataFrame([{k: r.get(k, "") for k in phys_keys} for r in data if not r.get("error")])

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df_phys.to_excel(writer, index=False, sheet_name="Descriptors")

            # --- Sheet 2+: One sheet per fingerprint type ---
            for fp_key in fp_bit_keys:
                fp_name = fp_key.replace("fp_", "").replace("_bits", "").upper()
                rows_fp = []
                for r in data:
                    if r.get("error"):
                        continue
                    bits = r.get(fp_key, "")
                    row = {"SMILES": r.get("smiles", "")}
                    for i, b in enumerate(bits):
                        row[f"b{i}"] = int(b)
                    rows_fp.append(row)
                if rows_fp:
                    pd.DataFrame(rows_fp).to_excel(writer, index=False, sheet_name=f"FP_{fp_name[:25]}")

            # Auto-width for Descriptors sheet
            ws = writer.sheets["Descriptors"]
            for col in ws.columns:
                max_len = max((len(str(c.value or "")) for c in col), default=0)
                ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)

        output.seek(0)
        return send_file(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=f"descriptors_qsar.xlsx"
        )
    except Exception as err:
        print(f"Descriptors Excel Error: {err}")
        return str(err), 500


@app.route("/similarity", methods=["POST"])
def calc_similarity():
    try:
        from rdkit import Chem, DataStructs
        from rdkit.Chem import AllChem
        body = request.get_json()
        ref_smi   = body.get("reference", "")
        query_list = body.get("smiles", [])
        radius_fp  = int(body.get("radius", 2))
        nbits      = int(body.get("nbits", 2048))

        ref_mol = Chem.MolFromSmiles(ref_smi)
        if ref_mol is None:
            return jsonify({"error": "Invalid reference SMILES"}), 400
        ref_fp = AllChem.GetMorganFingerprintAsBitVect(ref_mol, radius_fp, nBits=nbits)

        results = []
        for smi in query_list[:MAX_SMILES]:
            mol = Chem.MolFromSmiles(smi)
            if mol is None:
                results.append({"smiles": smi, "tanimoto": None, "error": "Invalid SMILES"})
                continue
            fp = AllChem.GetMorganFingerprintAsBitVect(mol, radius_fp, nBits=nbits)
            tanimoto = round(DataStructs.TanimotoSimilarity(ref_fp, fp), 4)
            results.append({"smiles": smi, "tanimoto": tanimoto})

        results.sort(key=lambda x: x["tanimoto"] if x["tanimoto"] is not None else -1, reverse=True)
        return jsonify(results)
    except Exception as err:
        print(f"Similarity Error: {err}")
        return jsonify({"error": str(err)}), 500


@app.route("/render/reaction", methods=["POST"])
def render_reaction():
    try:
        from rdkit.Chem import AllChem, Draw, rdChemReactions
        from PIL import Image
        import io as _io
        body   = request.get_json()
        rxn_smi = body.get("smarts", "")
        if not rxn_smi:
            return "No reaction SMILES provided", 400

        rxn = AllChem.ReactionFromSmarts(rxn_smi, useSmiles=True)
        if rxn is None:
            return "Invalid reaction SMILES", 400

        img = Draw.ReactionToImage(rxn, subImgSize=(300, 250))
        buf = _io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return send_file(buf, mimetype="image/png")
    except Exception as err:
        print(f"Reaction Render Error: {err}")
        return f"Error rendering reaction: {err}", 500


@app.route("/task/status/<string:task_id>", methods=["GET"])
def get_task_status(task_id: str):
    """Check the status of a background task."""
    result = AsyncResult(task_id)
    return jsonify({
        "id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None
    })

@app.route("/render/async", methods=["POST"])
def render_async():
    """Start a background rendering task for large batches."""
    try:
        data = request.get_json()
        smiles = data.get("smiles")
        if not smiles or len(smiles) > 100: 
             return "Batch too large or missing", 400
             
        task = render_batch_task.delay(smiles)
        return jsonify({"task_id": task.id}), 202
    except Exception as err:
        return str(err), 500

@app.route("/predict/peplink", methods=["POST"])
def predict_peplink():
    """Convert peptide sequence to SMILES using PepLink."""
    try:
        data = request.get_json()
        sequence = data.get("sequence", "").strip().replace("-", "")
        if not sequence:
            return jsonify({"error": "No peptide sequence provided"}), 400
            
        # PepLink takes a sequence string
        smiles = aa_seqs_to_smiles(sequence)
        if not smiles:
             return jsonify({"error": "Conversion failed"}), 500
             
        return jsonify({"smiles": smiles})
        
    except Exception as err:
        print(f"PepLink Error: {err}")
        return jsonify({"error": str(err)}), 500

@app.route("/predict/smiles-to-peptide", methods=["POST"])
def predict_smiles_to_peptide():
    """Convert SMILES to peptide sequence using PepLink."""
    try:
        data = request.get_json()
        smiles = data.get("smiles", "").strip()
        if not smiles:
            return jsonify({"error": "No SMILES provided"}), 400
            
        result = smiles_to_aa_seqs(smiles)
        if result.sequence:
            return jsonify({
                "sequence": result.sequence,
                "is_cyclic": result.is_cyclic,
                "cyclization": result.cyclization
            })
        else:
            return jsonify({"error": result.unsupported_reason or "Conversion failed"}), 422
        
    except Exception as err:
        print(f"PepLink Reverse Error: {err}")
        return jsonify({"error": str(err)}), 500
@app.route("/export/grid", methods=["POST"])
def export_grid():
    """Generate a high-quality grid image of multiple molecules."""
    try:
        from converter import create_mols_grid
        data = request.get_json()
        smiles = data.get("smiles", [])
        labels = data.get("labels", [])
        mols_per_row = int(data.get("mols_per_row", 3))
        fmt = data.get("format", "PNG").upper()
        
        if not smiles:
            return "No SMILES provided", 400
            
        buf = create_mols_grid(smiles, labels, mols_per_row, format=fmt)
        ext = "jpg" if fmt == "JPEG" else "png"
        return send_file(buf, mimetype=f"image/{fmt.lower()}", as_attachment=True, download_name=f"molecules_grid.{ext}")
    except Exception as err:
        print(f"Grid Export Error: {err}")
        return str(err), 500
