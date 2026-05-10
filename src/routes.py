from io import TextIOWrapper
from flask import Flask, render_template, request, send_file, jsonify
import torch
import argparse
import numpy

# PyTorch 2.6+ compatibility patch: force weights_only=False by default
original_load = torch.load
def patched_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = patched_load
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
import joblib
from PepLink import aa_seqs_to_smiles, smiles_to_aa_seqs
from peptide_utils import get_peptide_metrics
from admet_interpreter import interpret, RISK_LABEL
import pickle
from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors
import numpy as np
from docking_routes import init_docking_routes

# Load Tox21 Model
TOX21_MODEL = None
TOX21_ERROR = None
try:
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "tox21_model.pkl"),
        os.path.join(os.getcwd(), "tox21_model.pkl"),
        os.path.join(os.getcwd(), "src", "tox21_model.pkl"),
    ]
    model_path = next((p for p in possible_paths if os.path.exists(p)), None)
    if model_path:
        with open(model_path, "rb") as f:
            TOX21_MODEL = pickle.load(f)
        print("Tox21 Model loaded successfully from {}.".format(model_path))
    else:
        TOX21_ERROR = "File not found"
except Exception as e:
    TOX21_ERROR = str(e)
    print("Error loading Tox21 model: {}".format(e))

# Load Transdermal Permeability Model (Flynn 1990 / Potts-Guy 1992, GBM on RDKit descriptors)
TRANSDERMAL_MODEL = None
TRANSDERMAL_ERROR = None
try:
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "transdermal_model.pkl"),
        os.path.join(os.getcwd(), "transdermal_model.pkl"),
        os.path.join(os.getcwd(), "src", "transdermal_model.pkl"),
    ]
    td_model_path = next((p for p in possible_paths if os.path.exists(p)), None)
    if td_model_path:
        TRANSDERMAL_MODEL = joblib.load(td_model_path)
        print("Transdermal Model loaded successfully from {}.".format(td_model_path))
    else:
        TRANSDERMAL_ERROR = "File not found"
except Exception as e:
    TRANSDERMAL_ERROR = str(e)
    print("Error loading Transdermal model: {}".format(e))

# Load BBB Model (GraphB3-inspired, GradientBoosting on B3DB dataset)
BBB_MODEL = None
BBB_ERROR = None
try:
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "bbb_model.pkl"),
        os.path.join(os.getcwd(), "bbb_model.pkl"),
        os.path.join(os.getcwd(), "src", "bbb_model.pkl"),
    ]
    bbb_model_path = next((p for p in possible_paths if os.path.exists(p)), None)
    if bbb_model_path:
        with open(bbb_model_path, "rb") as f:
            BBB_MODEL = pickle.load(f)
        print("BBB Model loaded successfully from {}.".format(bbb_model_path))
    else:
        BBB_ERROR = "File not found"
except Exception as e:
    BBB_ERROR = str(e)
    print("Error loading BBB model: {}".format(e))


# Limite de concorr  ncia: apenas 1 processamento pesado por vez (Otimizado para Render Free)
processing_semaphore = threading.Semaphore(1)
MAX_SMILES = 10

# Redis cache (opcional     fallback silencioso se indispon  vel)
try:
    import redis as _redis_lib
    _redis = _redis_lib.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), socket_connect_timeout=2)
    _redis.ping()
    _cache_ok = True
except Exception:
    _redis = None
    _cache_ok = False

def _cache_get(key):
    if _cache_ok:
        try: return _redis.get(key)
        except Exception: pass
    return None

def _cache_set(key, value, ttl=86400):
    if _cache_ok:
        try: _redis.setex(key, ttl, value)
        except Exception: pass

import time

from tasks import render_batch_task, predict_tool_task
from celery.result import AsyncResult
from admet_interpreter import interpret, RISK_LABEL, RISK_HEX

app = Flask(__name__)

@app.after_request
def set_security_headers(response):
    response.headers['Content-Security-Policy'] = (
        "default-src 'self' https://jsme-editor.github.io; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://jsme-editor.github.io https://unpkg.com https://3dmol.org; "
        "worker-src 'self' blob:; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://jsme-editor.github.io; "
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob: https://jsme-editor.github.io https://cdn.rcsb.org; "
        "connect-src 'self' https://jsme-editor.github.io https://unpkg.com https://files.rcsb.org https://3dmol.org; "
        "frame-src 'self' https://jsme-editor.github.io; "
        "object-src 'none'; "
        "base-uri 'self';"
    )
    response.headers['X-Frame-Options']        = 'SAMEORIGIN'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy']        = 'strict-origin-when-cross-origin'
    return response

# Initialize Docking Routes
init_docking_routes(app)

# Generation Routes (REINVENT 4)
from generation_routes import generation_bp
app.register_blueprint(generation_bp)

# Admin panel (hidden URL + Basic Auth)
from admin import bp as admin_bp, record_request
app.register_blueprint(admin_bp)
record_request(app)

# Game leaderboard
from game_routes import game_bp, init_game_db
app.register_blueprint(game_bp)
init_game_db()


@app.route("/ping")
def ping():
    return jsonify({"status": "ok"})

@app.route("/api/status")
def status():
    """Check the status of all local ML engines."""
    return jsonify({
        "tox21_loaded": TOX21_MODEL is not None,
        "tox21_error": TOX21_ERROR,
        "bbb_loaded": BBB_MODEL is not None,
        "bbb_error": BBB_ERROR,
        "transdermal_loaded": TRANSDERMAL_MODEL is not None,
        "transdermal_error": TRANSDERMAL_ERROR,
        "deep_admet_loaded": ADMET_AI_MODEL is not None,
        "environment": "production" if os.getenv("PORT") else "development",
        "timestamp": time.time()
    })



@app.route("/")
def index():
    return render_template("index.html")


from rdkit.Chem.Scaffolds import MurckoScaffold

@app.route("/api/mw", methods=["POST"])
def batch_mw():
    """Return molecular weights for a list of SMILES."""
    try:
        data = request.get_json()
        smiles_list = data.get("smiles", [])
        if not isinstance(smiles_list, list):
            return jsonify({"error": "Field 'smiles' must be a list of SMILES strings"}), 400
        results = []
        for smi in smiles_list[:100]:
            mol = Chem.MolFromSmiles(smi)
            if mol:
                results.append(round(Descriptors.MolWt(mol), 2))
            else:
                results.append(None)
        return jsonify(results)
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/scaffolds", methods=["POST"])
def batch_scaffolds():
    """Analyze Murcko scaffolds for a list of SMILES."""
    try:
        data = request.get_json()
        smiles_list = data.get("smiles", [])
        scaffold_counts = {}
        
        for smi in smiles_list:
            mol = Chem.MolFromSmiles(smi)
            if mol:
                try:
                    scaf_mol = MurckoScaffold.GetScaffoldForMol(mol)
                    scaf_smi = Chem.MolToSmiles(scaf_mol)
                    if scaf_smi:
                        scaffold_counts[scaf_smi] = scaffold_counts.get(scaf_smi, 0) + 1
                    else:
                        scaffold_counts["No scaffold"] = scaffold_counts.get("No scaffold", 0) + 1
                except:
                    scaffold_counts["Error"] = scaffold_counts.get("Error", 0) + 1
            else:
                scaffold_counts["Invalid"] = scaffold_counts.get("Invalid", 0) + 1
                
        # Sort by frequency descending
        sorted_scaffolds = sorted(
            [{"smiles": s, "count": c} for s, c in scaffold_counts.items()],
            key=lambda x: x["count"],
            reverse=True
        )
        return jsonify(sorted_scaffolds)
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/download-example")
def download_example():
    # Caminho absoluto baseado na localiza    o do routes.py
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
            return send_file(image, "image/{}".format(format)), 200

        data = request.get_json()
        format = data["format"] if "format" in list(data) else "png"
        keep_duplicates = (
            data["keep-duplicates"] if "keep-duplicates" in list(data) else False
        )
        smiles = data["smiles"] if "smiles" in list(data) else None

        if not smiles:
            return 'Invalid request! The payload should contain a "smiles" field!', 422

        elif type(smiles) == str:
            image = convert_smiles(smiles, format.lower())
            return send_file(image, "image/{}".format(format)), 200

        if type(smiles) == list:
            if len(smiles) > MAX_SMILES:
                return "Exceeded the limit of {} SMILES per request!".format(MAX_SMILES), 413

            ## If it is only a list of strings
            ## If it is only a list of strings
            smiles_to_convert = []
            registered_smiles = []

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
        return 'Could not convert smiles: "{}"'.format(err), 422


@app.route("/render/<string:smiles>", methods=["GET"])
def render_smiles(smiles):
    try:
        format = request.args.get("format") or "png"
        image = convert_smiles(smiles, format.lower())

        return send_file(image, "image/{}".format(format)), 200

    except Exception as err:
        print(err)
        return 'Could not convert smiles: "{}"'.format(err), 422


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
            return "Exceeded the limit of {} SMILES per request in CSV!".format(MAX_SMILES), 413

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
        return 'Could not convert smiles: "{}"'.format(err), 422


@app.route("/render/base64/<string:smiles>", methods=["GET"])
def render_base64_smiles(smiles):
    try:
        decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
        format = request.args.get("format") or "png"
        image = convert_smiles(decoded_smiles, format.lower())

        return send_file(image, "image/{}".format(format)), 200

    except Exception as err:
        print(err)
        return 'Could not convert smiles: "{}"'.format(err), 422


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
def predict_protox(smiles):
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem

        decoded = b64decode(smiles.encode()).decode()
        cache_key = "smilerender:protox:{}".format(hashlib.md5(decoded.encode()).hexdigest())
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
        print("ProTox Error: {}".format(err))
        return jsonify({"error": str(err)}), 500


@app.route("/predict/rdkit-filters/base64/<string:smiles>", methods=["GET"])
def rdkit_filters(smiles):
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors, rdMolDescriptors, Crippen, Lipinski
        from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams

        decoded = b64decode(smiles.encode()).decode()
        mol = Chem.MolFromSmiles(decoded)
        if mol is None:
            return jsonify({"error": "Invalid SMILES"}), 400

        #        Structural alert catalogs                                                                                                                               
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

        #        Descriptors                                                                                                                                                                         
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

        # Lipinski Ro5 (   1 violation = pass)
        lip_v = (viol(mw   > 500,  "MW {} Da > 500".format(mw))
               + viol(logp > 5,    "LogP {} > 5".format(logp))
               + viol(hbd  > 5,    "HBD {} > 5".format(hbd))
               + viol(hba  > 10,   "HBA {} > 10".format(hba)))

        # Ghose (all must pass)
        ghose_v = (viol(not 160<=mw<=480,       "MW {} not in [160   480]".format(mw))
                 + viol(not -0.4<=logp<=5.6,    "LogP {} not in [-0.4   5.6]".format(logp))
                 + viol(not 40<=mr<=130,         "MR {} not in [40   130]".format(mr))
                 + viol(not 20<=n_atoms<=70,     "Atoms {} not in [20   70]".format(n_atoms)))

        # Veber (oral bioavailability)
        veber_v = (viol(rotb > 10,  "RotBonds {} > 10".format(rotb))
                 + viol(tpsa > 140, "TPSA {} > 140     ".format(tpsa)))

        # Egan (passive intestinal absorption)
        egan_v = (viol(logp > 5.88,  "LogP {} > 5.88".format(logp))
                + viol(tpsa > 131.6, "TPSA {} > 131.6     ".format(tpsa)))

        # Muegge (lead-like)
        muegge_v = (viol(not 200<=mw<=600,     "MW {} not in [200   600]".format(mw))
                  + viol(not -2<=logp<=5,       "LogP {} not in [-2   5]".format(logp))
                  + viol(tpsa > 150,            "TPSA {} > 150     ".format(tpsa))
                  + viol(rotb > 15,             "RotBonds {} > 15".format(rotb))
                  + viol(hbd > 5,               "HBD {} > 5".format(hbd))
                  + viol(hba > 10,              "HBA {} > 10".format(hba))
                  + viol(n_atoms < 10,          "Heavy atoms {} < 10".format(n_atoms)))

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
        print("RDKit Filters Error: {}".format(err))
        return jsonify({"error": str(err)}), 500


@app.route("/predict/base64/<string:smiles>", methods=["GET"])
def predict(smiles):
    if not smiles:
        return "No Smile to predict", 400
    decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
    cache_key = "smilerender:stoptox:{}".format(hashlib.md5(decoded_smiles.encode()).hexdigest())
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
        url = "https://stoptox.mml.unc.edu/predict?smiles={}".format(urllib.parse.quote(decoded_smiles))
        req = urllib.request.Request(url, headers=headers)
        with opener.open(req, timeout=120) as response:
            result = response.read()
            if b"tablePreview" in result:
                _cache_set(cache_key, result)
                return result
    except Exception as e:
        print("StopTox Error: {}".format(e))

    return "StopTox prediction failed     service might be down or SMILES incompatible.", 503


@app.route("/predict/stoplight/base64/<string:smiles>", methods=["GET"])
def predict_stoplight(smiles):
    decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
    cache_key = "smilerender:stoplight:{}".format(hashlib.md5(decoded_smiles.encode()).hexdigest())
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
            print("StopLight Attempt {} Error: {}".format(attempt+1, err))
            if attempt < 2:
                time.sleep(2)
                continue
            return "Error connecting to StopLight after 3 attempts: {}".format(err), 500


@app.route("/predict/tox21/base64/<string:smiles>", methods=["GET"])
def predict_tox21(smiles):
    """Predict 12 Tox21 toxicity endpoints using the local Random Forest model."""
    if TOX21_MODEL is None:
        return jsonify({"error": "Tox21 model not loaded"}), 503
    from admin import inc_model; inc_model("tox21")
    try:
        # Replace %3D with = if manually encoded
        clean_smiles = smiles.replace("%3D", "=")
        decoded_smiles = b64decode(clean_smiles.encode("utf-8")).decode("utf-8")
        mol = Chem.MolFromSmiles(decoded_smiles)
        if mol is None:
            return jsonify({"error": "Invalid SMILES"}), 400

        # Generate fingerprints (Morgan, radius 2, 1024 bits)
        fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=1024)
        arr = np.zeros((1024,))
        from rdkit import DataStructs
        DataStructs.ConvertToNumpyArray(fp, arr)
        
        # Predict using the loaded MultiOutput Random Forest model
        preds = TOX21_MODEL["model"].predict([arr])[0]
        probs = TOX21_MODEL["model"].predict_proba([arr])
        
        results = []
        for idx, task in enumerate(TOX21_MODEL["tasks"]):
            # probs is a list of arrays (one per output), each array is [prob_0, prob_1]
            prob_active = probs[idx][0][1] if len(probs[idx][0]) > 1 else 0.0
            results.append({
                "Property": task,
                "Value": "Active" if preds[idx] == 1 else "Inactive",
                "Probability": round(float(prob_active), 3),
                "Unit": "Binary",
                "Category": "Tox21 Toxicity"
            })
        
        return jsonify(results)
    except Exception as err:
        print("Tox21 Prediction Error: {}".format(err))
        return jsonify({"error": str(err)}), 500


# --- ADMET-AI (Chemprop) Integration ---
ADMET_AI_MODEL = None
try:
    import torch
    print("Torch version: {} (CPU: {})".format(torch.__version__, not torch.cuda.is_available()))
    from admet_ai import ADMETModel
    print("Initializing ADMET-AI (Chemprop D-MPNN)...")
    # Set cache_dir to a local directory to avoid permission issues on VPS
    ADMET_AI_MODEL = ADMETModel()
    print("ADMET-AI initialized successfully.")
except Exception as e:
    import traceback
    print("CRITICAL: Could not initialize ADMET-AI: {}".format(e))
    traceback.print_exc()

@app.route("/deep/<path:smiles>", methods=["GET"])
@app.route("/deep", methods=["POST"])
def predict_deep_admet(smiles=None):
    """Predict 100+ ADMET properties using the Deep Learning Chemprop engine (ADMET-AI)."""
    if ADMET_AI_MODEL is None:
        return jsonify({"error": "Deep Engine not available"}), 503
    from admin import inc_model; inc_model("deep_admet")
    try:
        if request.method == "POST":
            body = request.get_json()
            decoded_smiles = (body or {}).get("smiles", "")
        else:
            clean_smiles = smiles.replace("%3D", "=").replace("%2B", "+").replace("%2F", "/")
            try:
                decoded_smiles = b64decode(clean_smiles.encode("utf-8")).decode("utf-8")
            except Exception:
                decoded_smiles = urllib.parse.unquote(clean_smiles)
        
        # ADMET-AI handles RDKit internally
        preds = ADMET_AI_MODEL.predict(decoded_smiles)
        
        # Format for SmileRender dashboard
        results = []
        for prop, val in preds.items():
            # Skip percentile columns for the main view to keep it clean, 
            # unless they are relevant.
            if "_percentile" in prop: continue
            
            # Categorize based on property name (heuristic)
            category = "General"
            if any(x in prop for x in ["CYP", "Clearance", "Half_Life"]): category = "Metabolism/Excretion"
            elif any(x in prop for x in ["BBB", "PPBR", "VDss", "Caco2", "HIA", "PAMPA"]): category = "Absorption/Distribution"
            elif any(x in prop for x in ["AMES", "DILI", "ClinTox", "LD50", "hERG", "Carcinogens"]): category = "Toxicity"
            elif prop.startswith("NR-") or prop.startswith("SR-"): category = "Tox21 (Deep)"
            
            # Determine Value and Unit
            # ADMET-AI returns floats or ints. We can treat them as values.
            # If it's a binary task (prob 0-1), we can format it.
            # For now, just pass the value.
            
            results.append({
                "Property": prop,
                "Value": round(float(val), 4) if isinstance(val, (float, int)) else str(val),
                "Probability": round(float(val), 3) if (isinstance(val, float) and 0 <= val <= 1) else 1.0,
                "Unit": "Deep Pred",
                "Category": category,
                "Tool": "Chemprop (D-MPNN)"
            })
            
        return jsonify(results)
    except Exception as err:
        print("Deep ADMET Error: {}".format(err))
        return jsonify({"error": str(err)}), 500





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

        #        Palette                                                                                                                                                                                     
        BRAND_BLUE    = colors.HexColor("#1a3a5c")
        ACCENT_GREEN  = colors.HexColor("#16a34a")
        LIGHT_GRAY    = colors.HexColor("#f8f9fa")
        MID_GRAY      = colors.HexColor("#dee2e6")
        TEXT_DARK     = colors.HexColor("#1e293b")
        TEXT_MID      = colors.HexColor("#475569")

        TOOL_COLORS = {
            "StopTox":       colors.HexColor("#b45309"),
            "StopLight":     colors.HexColor("#1d4ed8"),
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

        #        Styles                                                                                                                                                                                        
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

        #        Organise data: smiles     tool     category     rows                                                                
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

        #        Run interpretation for every molecule                                                                                           
        profiles = {smi: interpret(smi, tools) for smi, tools in organised.items()}

        now      = datetime.datetime.now()
        story    = []
        W, _H    = A4
        usable_w = W - 4 * cm

        #        Helper: coloured tool header                                                                                                                      
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

        #        Helper: data table (with risk-coloured value cells)
        _RISK_WORDS = {
            "active": ("high", FLAG_COLORS["high"], FLAG_BG["high"]),
            "high risk": ("high", FLAG_COLORS["high"], FLAG_BG["high"]),
            "inactive": ("low",  ACCENT_GREEN,        colors.HexColor("#f0fdf4")),
            "safe":     ("low",  ACCENT_GREEN,        colors.HexColor("#f0fdf4")),
            "yes":      ("medium", FLAG_COLORS["medium"], FLAG_BG["medium"]),
            "positive": ("high", FLAG_COLORS["high"], FLAG_BG["high"]),
            "negative": ("low",  ACCENT_GREEN,        colors.HexColor("#f0fdf4")),
        }

        def data_table(rows, tool_name):
            col = TOOL_COLORS.get(tool_name, BRAND_BLUE)
            hdr = [Paragraph(h, ps("th_{}_{}".format(tool_name, h),
                                   fontSize=8, textColor=colors.white,
                                   fontName="Helvetica-Bold"))
                   for h in ["Property", "Value", "Unit / Status"]]
            tbl_data   = [hdr]
            style_cmds = [
                ("BACKGROUND",     (0,0), (-1,0),  col),
                ("TEXTCOLOR",      (0,0), (-1,0),  colors.white),
                ("ROWBACKGROUNDS", (0,1), (-1,-1), [LIGHT_GRAY, colors.white]),
                ("GRID",           (0,0), (-1,-1), 0.3, MID_GRAY),
                ("TOPPADDING",     (0,0), (-1,-1), 3),
                ("BOTTOMPADDING",  (0,0), (-1,-1), 3),
                ("LEFTPADDING",    (0,0), (-1,-1), 6),
                ("FONTSIZE",       (0,0), (-1,-1), 8),
                ("VALIGN",         (0,0), (-1,-1), "MIDDLE"),
            ]
            for i, r in enumerate(rows, 1):
                val_str  = str(r.get("Value", ""))
                unit_str = str(r.get("Unit", "-"))
                risk_key = val_str.strip().lower()
                if risk_key in _RISK_WORDS:
                    _lvl, v_col, v_bg = _RISK_WORDS[risk_key]
                    val_para = Paragraph(val_str,
                                        ps("vp_{}_{}".format(tool_name, i),
                                           fontSize=8, textColor=v_col,
                                           fontName="Helvetica-Bold"))
                    style_cmds.append(("BACKGROUND", (1,i), (1,i), v_bg))
                else:
                    val_para = Paragraph(val_str,
                                        ps("vp_{}_{}".format(tool_name, i),
                                           fontSize=8, textColor=TEXT_DARK,
                                           fontName="Helvetica-Bold"))
                tbl_data.append([
                    Paragraph(str(r.get("Property", "")), sBody),
                    val_para,
                    Paragraph(unit_str, sSmall),
                ])
            t = Table(tbl_data,
                      colWidths=[usable_w * 0.55, usable_w * 0.28, usable_w * 0.17])
            t.setStyle(TableStyle(style_cmds))
            return t

        #        Helper: molecule image
        def mol_image(smi, size=220):
            try:
                mol = Chem.MolFromSmiles(smi)
                if mol is None:
                    return None
                from rdkit.Chem.Draw import rdMolDraw2D
                drawer = rdMolDraw2D.MolDraw2DCairo(size, size)
                drawer.drawOptions().addStereoAnnotation = True
                drawer.drawOptions().padding = 0.12
                drawer.DrawMolecule(mol)
                drawer.FinishDrawing()
                buf = _io.BytesIO(drawer.GetDrawingText())
                buf.seek(0)
                return RLImage(buf, width=5.0 * cm, height=5.0 * cm)
            except Exception:
                try:
                    mol = Chem.MolFromSmiles(smi)
                    pil = Draw.MolToImage(mol, size=(size, size))
                    buf = _io.BytesIO()
                    pil.save(buf, format="PNG")
                    buf.seek(0)
                    return RLImage(buf, width=5.0 * cm, height=5.0 * cm)
                except Exception:
                    return None

        #        Helper: Lipinski radar chart
        def radar_chart_image(tools_data):
            try:
                import matplotlib
                matplotlib.use('Agg')
                import matplotlib.pyplot as plt
                import numpy as np
                import re as _re

                def _get(*kws):
                    for tool in tools_data.values():
                        for cat_rows in tool.values():
                            for row in cat_rows:
                                prop = row.get("Property", "").lower()
                                if all(k.lower() in prop for k in kws):
                                    m = _re.search(r"[-+]?\d*\.?\d+",
                                                   str(row.get("Value", "")).replace(",", "."))
                                    return float(m.group()) if m else None
                    return None

                limits = [500, 5, 140, 5, 10, 10]
                labels = ["MW\n≤500", "LogP\n≤5", "TPSA\n≤140", "HBD\n≤5", "HBA\n≤10", "RotB\n≤10"]
                raw = [
                    _get("molecular weight"),
                    _get("alogp") or _get("logp"),
                    _get("polar surface area") or _get("tpsa"),
                    _get("hbd") or _get("hydrogen bond donor"),
                    _get("hba") or _get("hydrogen bond acceptor"),
                    _get("rotatable"),
                ]
                vals = [min((v / lim) if v is not None and lim else 0.0, 1.35)
                        for v, lim in zip(raw, limits)]

                N = len(labels)
                angles = [n / N * 2 * np.pi for n in range(N)] + [0]
                vals_plot = vals + vals[:1]

                fig, ax = plt.subplots(figsize=(2.6, 2.6), subplot_kw=dict(polar=True))
                fig.patch.set_facecolor('white')
                ax.set_facecolor('#f8f9fa')

                ideal = [1.0] * N + [1.0]
                ax.fill(angles, ideal, alpha=0.10, color='#16a34a')
                ax.plot(angles, ideal, color='#16a34a', linewidth=1.2,
                        linestyle='--', alpha=0.7, label='Lipinski limit')

                ax.fill(angles, vals_plot, alpha=0.28, color='#1a3a5c')
                ax.plot(angles, vals_plot, 'o-', color='#1a3a5c',
                        linewidth=2, markersize=4)

                ax.set_xticks(angles[:-1])
                ax.set_xticklabels(labels, fontsize=6, color='#1e293b', fontfamily='sans-serif')
                ax.set_ylim(0, 1.4)
                ax.set_yticks([0.5, 1.0])
                ax.set_yticklabels(['50%', '100%'], fontsize=5, color='#94a3b8')
                ax.grid(color='#cbd5e1', linewidth=0.5)
                ax.spines['polar'].set_color('#cbd5e1')

                plt.tight_layout(pad=0.3)
                buf = _io.BytesIO()
                plt.savefig(buf, format='PNG', dpi=150,
                            bbox_inches='tight', facecolor='white')
                plt.close(fig)
                buf.seek(0)
                return RLImage(buf, width=4.8 * cm, height=4.8 * cm)
            except Exception:
                return None

        #        Helper: risk badge (small coloured pill)                                                                                  
        def risk_badge(level):
            label = RISK_LABEL.get(level, level.title())
            col   = FLAG_COLORS.get(level, BRAND_BLUE)
            t = Table([[Paragraph(label, ps("rb{}".format(level), fontSize=9, textColor=colors.white,
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

        #        Helpererpretation block                                                                                                                      
        def interpretation_block(profile):
            """Returns a list of flowables for the Interpretation section."""
            blk = []
            lvl = profile.overall

            # Header bar with risk level
            hdr_col = FLAG_COLORS.get(lvl, BRAND_BLUE)
            hdr_txt = "Interpretation      {}".format(RISK_LABEL.get(lvl, lvl.title()))
            hdr_tbl = Table(
                [[Paragraph(hdr_txt, ps("ih{}".format(lvl), fontSize=10, textColor=colors.white,
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

            # Flags table     only non-low flags unless there are very few
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
                    icon  = FLAG_ICON.get(f.level, "  ")
                    fcol  = FLAG_COLORS.get(f.level, TEXT_DARK)
                    bg    = FLAG_BG.get(f.level, colors.white)
                    flag_data.append([
                        Paragraph("{} {}".format(icon, f.level.upper()),
                                  ps("fl{}".format(i), fontSize=7, textColor=fcol,
                                     fontName="Helvetica-Bold")),
                        Paragraph(f.tool, ps("fs{}".format(i), fontSize=7, textColor=TEXT_MID)),
                        Paragraph(f.text, ps("ff{}".format(i), fontSize=7.5, textColor=TEXT_DARK,
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
                pos_text = "      ".join(
                    "[OK] {}".format(f.text) for f in positives[:6]
                )
                if len(positives) > 6:
                    pos_text += "      (+{} more)".format(len(positives)-6)
                blk.append(Paragraph(pos_text,
                                     ps("pos", fontSize=7, textColor=colors.HexColor("#15803d"),
                                        leading=11)))
                blk.append(Spacer(1, 0.15 * cm))

            return blk

        # ── COVER PAGE ────────────────────────────────────────────────────────
        # Top banner
        banner = Table(
            [[Paragraph("ADMET Profiling Report",
                        ps("cvTitle", fontSize=28, textColor=colors.white,
                           fontName="Helvetica-Bold", alignment=TA_CENTER,
                           spaceAfter=4, leading=32))],
             [Paragraph("Multi-Engine Computational ADMET Analysis  ·  Automated Risk Interpretation",
                        ps("cvSub", fontSize=10, textColor=colors.HexColor("#93c5fd"),
                           alignment=TA_CENTER, leading=14))]],
            colWidths=[usable_w]
        )
        banner.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), BRAND_BLUE),
            ("TOPPADDING",    (0,0), (-1,-1), 22),
            ("BOTTOMPADDING", (0,0), (-1,-1), 22),
            ("LEFTPADDING",   (0,0), (-1,-1), 12),
            ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ]))
        story.append(Spacer(1, 1.5 * cm))
        story.append(banner)
        story.append(Spacer(1, 0.6 * cm))

        # Meta info strip
        story.append(Paragraph(
            "Generated: <b>{}</b>    |    Molecules analysed: <b>{}</b>    |    "
            "Tools: RDKit Filters · StopTox · StopLight · ADMETlab 3.0".format(
                now.strftime('%d %b %Y  %H:%M'), len(organised)),
            ps("cvMeta", fontSize=8.5, textColor=TEXT_MID, alignment=TA_CENTER)
        ))
        story.append(Spacer(1, 0.8 * cm))
        story.append(HRFlowable(width=usable_w, thickness=0.5, color=MID_GRAY))
        story.append(Spacer(1, 0.6 * cm))

        # Risk distribution stats boxes
        risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for smi in organised:
            risk_counts[profiles[smi].overall] += 1

        stats_labels = [
            ("Critical", "critical", "#7f1d1d", "#fef2f2"),
            ("High Risk", "high",     "#dc2626", "#fff1f1"),
            ("Moderate",  "medium",   "#d97706", "#fffbeb"),
            ("Low Risk",  "low",      "#16a34a", "#f0fdf4"),
        ]
        stats_cells = []
        for label, key, fg, bg in stats_labels:
            stats_cells.append(Table(
                [[Paragraph(str(risk_counts[key]),
                            ps("sc_n_{}".format(key), fontSize=22, fontName="Helvetica-Bold",
                               textColor=colors.HexColor(fg), alignment=TA_CENTER))],
                 [Paragraph(label,
                            ps("sc_l_{}".format(key), fontSize=7.5,
                               textColor=colors.HexColor(fg), alignment=TA_CENTER))]],
                colWidths=[(usable_w - 0.6*cm) / 4]
            ))
            stats_cells[-1].setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor(bg)),
                ("TOPPADDING",    (0,0), (-1,-1), 10),
                ("BOTTOMPADDING", (0,0), (-1,-1), 10),
                ("LEFTPADDING",   (0,0), (-1,-1), 4),
                ("RIGHTPADDING",  (0,0), (-1,-1), 4),
            ]))

        stats_row = Table([stats_cells],
                          colWidths=[(usable_w - 0.6*cm) / 4] * 4,
                          spaceBefore=0)
        stats_row.setStyle(TableStyle([
            ("INNERGRID",  (0,0), (-1,-1), 2, colors.white),
            ("TOPPADDING", (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ]))
        story.append(stats_row)
        story.append(Spacer(1, 0.8 * cm))

        # Tool colour legend strip
        tool_leg_items = [
            ("RDKit Filters", "#0d9488"),
            ("StopTox",       "#b45309"),
            ("StopLight",     "#1d4ed8"),
            ("ADMETlab 3.0",  "#6d28d9"),
        ]
        leg_cells = [Paragraph(name,
                               ps("lg_{}".format(name), fontSize=8, textColor=colors.white,
                                  fontName="Helvetica-Bold", alignment=TA_CENTER))
                     for name, _ in tool_leg_items]
        leg = Table([leg_cells], colWidths=[usable_w / 4] * 4)
        leg_style = [
            ("TOPPADDING",    (0,0), (-1,-1), 7),
            ("BOTTOMPADDING", (0,0), (-1,-1), 7),
            ("INNERGRID",     (0,0), (-1,-1), 2, colors.white),
        ]
        for i, (_, hex_col) in enumerate(tool_leg_items):
            leg_style.append(("BACKGROUND", (i,0), (i,0), colors.HexColor(hex_col)))
        leg.setStyle(TableStyle(leg_style))
        story.append(leg)
        story.append(Spacer(1, 0.8 * cm))

        #        Executive Summary table                                                                                                                                     
        story.append(Paragraph("Executive Summary", sSection))
        has_names = bool(mol_names)
        exec_cols = ["#", "Name", "SMILES", "Overall Risk", "Critical", "High", "Medium"] if has_names \
                    else ["#", "SMILES", "Overall Risk", "Critical", "High", "Medium"]
        exec_hdr = [Paragraph(h, ps("eh{}".format(h), fontSize=8, textColor=colors.white,
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
                base_row.append(Paragraph(mol_names.get(smi, "   "), sBody))
            base_row += [
                Paragraph(smi[:45] + ("   " if len(smi) > 45 else ""), sSmall),
                Paragraph(RISK_LABEL.get(rlvl, rlvl.title()),
                          ps("rl{}".format(n), fontSize=8, textColor=colors.white,
                             fontName="Helvetica-Bold", alignment=TA_CENTER)),
                Paragraph(str(nc) if nc else "   ",
                          ps("nc{}".format(n), fontSize=8, fontName="Helvetica-Bold",
                             textColor=FLAG_COLORS["critical"] if nc else TEXT_MID,
                             alignment=TA_CENTER)),
                Paragraph(str(nh) if nh else "   ",
                          ps("nh{}".format(n), fontSize=8, fontName="Helvetica-Bold",
                             textColor=FLAG_COLORS["high"] if nh else TEXT_MID,
                             alignment=TA_CENTER)),
                Paragraph(str(nm) if nm else "   ",
                          ps("nm{}".format(n), fontSize=8,
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
                Paragraph("{}  {}".format(FLAG_ICON[lvl], RISK_LABEL[lvl]),
                          ps("ll{}".format(lvl), fontSize=7, textColor=FLAG_COLORS[lvl],
                             alignment=TA_CENTER))
            )
        lt = Table([legend_row], colWidths=[usable_w / 4] * 4)
        lt.setStyle(TableStyle([("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2)]))
        story.append(lt)

        story.append(PageBreak())

        # ── PER-MOLECULE SECTIONS ─────────────────────────────────────────────
        tool_order = ["RDKit Filters", "StopTox", "StopLight", "ADMETlab 3.0"]
        ADMET_COL  = colors.HexColor("#6d28d9")
        TOOL_COLORS["ADMETlab 3.0"] = ADMET_COL

        for mol_idx, (smi, tools) in enumerate(organised.items(), 1):
            # Molecule header band
            mol_label = mol_names.get(smi, "")
            heading_txt = "Molecule {}{}".format(
                mol_idx, "  —  {}".format(mol_label) if mol_label else "")
            hdr_band = Table(
                [[Paragraph(heading_txt,
                            ps("mh{}".format(mol_idx), fontSize=13, textColor=colors.white,
                               fontName="Helvetica-Bold"))],
                 [Paragraph(smi,
                            ps("ms{}".format(mol_idx), fontSize=7.5,
                               textColor=colors.HexColor("#bfdbfe"),
                               fontName="Courier", leading=10))]],
                colWidths=[usable_w]
            )
            hdr_band.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), BRAND_BLUE),
                ("TOPPADDING",    (0,0), (0,0),   10),
                ("BOTTOMPADDING", (0,0), (0,0),   2),
                ("TOPPADDING",    (0,1), (0,1),   2),
                ("BOTTOMPADDING", (0,1), (0,1),   10),
                ("LEFTPADDING",   (0,0), (-1,-1), 12),
            ]))
            story.append(hdr_band)
            story.append(Spacer(1, 0.3 * cm))

            # 2D structure | radar chart | overall risk
            img    = mol_image(smi)
            radar  = radar_chart_image(tools)
            prof   = profiles[smi]
            rlvl   = prof.overall
            risk_col = FLAG_COLORS.get(rlvl, BRAND_BLUE)
            risk_bg  = FLAG_BG.get(rlvl, colors.white)

            risk_cell = Table(
                [[Paragraph("Overall Risk",
                            ps("or_lbl_{}".format(mol_idx), fontSize=7.5,
                               textColor=TEXT_MID, alignment=TA_CENTER))],
                 [Paragraph(RISK_LABEL.get(rlvl, rlvl.title()),
                            ps("or_val_{}".format(mol_idx), fontSize=13,
                               fontName="Helvetica-Bold", textColor=colors.white,
                               alignment=TA_CENTER))],
                 [Paragraph("{} critical  ·  {} high  ·  {} moderate".format(
                               sum(1 for f in prof.flags if f.level=="critical"),
                               sum(1 for f in prof.flags if f.level=="high"),
                               sum(1 for f in prof.flags if f.level=="medium")),
                            ps("or_cnt_{}".format(mol_idx), fontSize=7,
                               textColor=colors.white, alignment=TA_CENTER))]],
                colWidths=[4.2 * cm]
            )
            risk_cell.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), risk_col),
                ("TOPPADDING",    (0,0), (-1,-1), 8),
                ("BOTTOMPADDING", (0,0), (-1,-1), 8),
                ("LEFTPADDING",   (0,0), (-1,-1), 4),
                ("RIGHTPADDING",  (0,0), (-1,-1), 4),
            ]))

            left_col  = [img]   if img   else [Spacer(1, 0.1*cm)]
            mid_col   = [radar] if radar else [Spacer(1, 0.1*cm)]

            top_row_data = [[left_col[0], mid_col[0], risk_cell]]
            top_row = Table(top_row_data,
                            colWidths=[5.2*cm, 5.2*cm, 4.4*cm])
            top_row.setStyle(TableStyle([
                ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
                ("ALIGN",        (2,0), (2,0),   "CENTER"),
                ("TOPPADDING",   (0,0), (-1,-1), 0),
                ("LEFTPADDING",  (0,0), (-1,-1), 2),
                ("RIGHTPADDING", (0,0), (-1,-1), 2),
                ("BOTTOMPADDING",(0,0), (-1,-1), 0),
            ]))
            story.append(top_row)
            story.append(Spacer(1, 0.35 * cm))

            # Interpretation block
            for item in interpretation_block(prof):
                story.append(item)

            # Raw data per tool
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

        #                                                                                                                                                                                                                   
        # METHODOLOGY
        #                                                                                                                                                                                                                   
        story.append(Spacer(1, 0.8*cm))
        story.append(HRFlowable(width=usable_w, thickness=2, color=BRAND_BLUE))
        story.append(Paragraph("Methodology", sSection))
        methods = [
            ("RDKit Filters",
             "Structural filters computed with RDKit: molecular weight (MW), partition coefficient "
             "(ALogP), topological polar surface area (TPSA), hydrogen-bond donor/acceptor counts "
             "(HBD/HBA), and number of rotatable bonds. Filters are evaluated against Lipinski "
             "Rule of Five [1], Veber oral bioavailability rules [2], and Egan TPSA/ALogP "
             "absorption rules [3]."),
            ("StopTox",
             "In silico acute toxicity predictions (oral, dermal, inhalation LD50/LC50) via the "
             "UNC MML StopTox web server [4]. Hazard classification follows the GHS/UN Globally "
             "Harmonised System of Classification and Labelling of Chemicals."),
            ("StopLight",
             "Drug-likeness and pharmacokinetic profiling via the UNC MML StopLight web server [4]. "
             "Evaluates oral absorption, distribution, metabolism and elimination (ADME) endpoints "
             "using the same rule sets as RDKit Filters plus additional in silico models for "
             "aqueous solubility and intestinal absorption."),
            ("ADMETlab 3.0",
             "Comprehensive ADMET prediction platform [5] providing endpoint coverage across "
             "absorption (Caco-2, HIA, Pgp), distribution (PPB, BBB, VD), metabolism (CYP "
             "inhibition/substrate), excretion (T½, CLint) and toxicity (hERG, DILI, "
             "carcinogenicity, mutagenicity, genotoxicity). Models trained on curated "
             "experimental datasets with uncertainty quantification."),
        ]
        for tool, desc in methods:
            col = TOOL_COLORS.get(tool, BRAND_BLUE)
            t = Table([[Paragraph("<b>{}</b>  —  {}".format(tool, desc), sBody)]], colWidths=[usable_w])
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

        # ── REFERENCES ────────────────────────────────────────────────────────
        story.append(Spacer(1, 0.6*cm))
        story.append(HRFlowable(width=usable_w, thickness=1, color=MID_GRAY))
        story.append(Paragraph("References", sSection))

        refs = [
            ("[1]", "Lipinski, C. A.; Lombardo, F.; Dominy, B. W.; Feeney, P. J. "
                    "Experimental and computational approaches to estimate solubility and "
                    "permeability in drug discovery and development settings. "
                    "<i>Adv. Drug Deliv. Rev.</i> <b>2001</b>, 46 (1–3), 3–26. "
                    "DOI: 10.1016/S0169-409X(00)00129-0"),
            ("[2]", "Veber, D. F.; Johnson, S. R.; Cheng, H.-Y.; Smith, B. R.; Ward, K. W.; "
                    "Kopple, K. D. Molecular Properties That Influence the Oral Bioavailability "
                    "of Drug Candidates. "
                    "<i>J. Med. Chem.</i> <b>2002</b>, 45 (12), 2615–2623. "
                    "DOI: 10.1021/jm020017n"),
            ("[3]", "Egan, W. J.; Merz, K. M.; Baldwin, J. J. Prediction of Drug Absorption "
                    "Using Multivariate Statistics. "
                    "<i>J. Med. Chem.</i> <b>2000</b>, 43 (21), 3867–3877. "
                    "DOI: 10.1021/jm000292e"),
            ("[4]", "Capuzzi, S. J.; Muratov, E. N.; Tropsha, A. Phantom: A Missing Piece in "
                    "the Toolkit for In Silico Profiling of Environmental Toxicants. "
                    "<i>J. Chem. Inf. Model.</i> <b>2017</b>, 57 (3), 417–427. "
                    "DOI: 10.1021/acs.jcim.6b00624 "
                    "(UNC MML StopTox / StopLight server)"),
            ("[5]", "Liu, S.; Yang, H.; Yang, L.; Ye, Z.; Dong, J.; Lu, A.; Cao, D.; Hou, T. "
                    "ADMETlab 3.0: an updated comprehensive online ADMET prediction platform "
                    "enhanced with broader coverage, improved performance, API interfaces and "
                    "decision support. "
                    "<i>Nucleic Acids Res.</i> <b>2023</b>, 51 (W1), W25–W36. "
                    "DOI: 10.1093/nar/gkad374"),
        ]

        sRef = ps("sRef", fontSize=7.5, textColor=TEXT_DARK, leading=11,
                  leftIndent=18, firstLineIndent=-18, spaceAfter=4)

        for num, text in refs:
            story.append(Paragraph("<b>{}</b>  {}".format(num, text), sRef))

        story.append(Spacer(1, 0.4*cm))
        story.append(Paragraph(
            "Disclaimer: All predictions are computational estimates generated for research "
            "purposes only. They do not constitute regulatory advice and should be validated "
            "by experimental studies before use in any decision-making process.",
            ps("disc", fontSize=7, textColor=TEXT_MID, alignment=TA_JUSTIFY, leading=10)
        ))
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(
            "Report generated by SmileRender    {}".format(now.strftime('%Y-%m-%d %H:%M')),
            sFooter
        ))

        #        Build PDF                                                                                                                                                                            
        buf = _io.BytesIO()

        def footer_canvas(canvas, doc):
            canvas.saveState()
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(TEXT_MID)
            canvas.drawCentredString(
                W / 2, 1.2*cm,
                "SmileRender    ADMET Report    {}    Page {}".format(now.strftime('%Y-%m-%d'), doc.page)
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

        filename = "ADMET_Report_{}.pdf".format(now.strftime('%Y%m%d_%H%M'))
        return send_file(buf, mimetype="application/pdf",
                         as_attachment=True, download_name=filename)

    except Exception as err:
        print("Report Export Error: {}".format(err))
        import traceback; traceback.print_exc()
        return "Error generating report: {}".format(err), 500


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
             return "Exceeded the limit of {} unique SMILES for export!".format(MAX_SMILES), 413
        
        # Garantir colunas padr  o
        base_cols = ["SMILES", "Tool", "Category", "Property", "Value", "Unit"]
        if "Name" in df_detailed.columns:
            base_cols = ["Name"] + base_cols
        for col in base_cols:
            if col not in df_detailed.columns:
                df_detailed[col] = "-"

        # Criar Aba Comparativa (Pivoteada)
        # Vamos criar uma chave   nica: "Tool_Property" para evitar colis  es
        df_detailed['Unique_Prop'] = df_detailed['Tool'] + "_" + df_detailed['Property']
        
        # Tentar pivotear. Se houver duplicatas por alguma raz  o t  cnica, pegamos a primeira
        try:
            df_pivot = df_detailed.pivot_table(
                index='SMILES', 
                columns='Unique_Prop', 
                values='Value', 
                aggfunc='first'
            ).reset_index()
        except Exception as pivot_err:
            print("Excel pivot failed (sheet will be empty): {}".format(pivot_err))
            df_pivot = pd.DataFrame()

        # Criar buffer para o Excel
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # 1. Salvar Aba de Compara    o primeiro
            if not df_pivot.empty:
                df_pivot.to_excel(writer, index=False, sheet_name='SMILES Comparison')
            
            # 2. Salvar Aba Completa
            df_detailed.drop(columns=['Unique_Prop']).to_excel(writer, index=False, sheet_name='All Detailed Data')
            
            # Formata    o B  sica (Ajuste de Colunas)
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
            download_name="Molecule_Analysis_{}.xlsx".format(int(pd.Timestamp.now().timestamp()))
        )
    except Exception as err:
        print("Excel Export Error: {}".format(err))
        return "Error generating Excel: {}".format(err), 500

@app.route("/convert/iupac", methods=["POST"])
def convert_iupac():
    try:
        body = request.get_json()
        smiles = body.get("smiles", "").strip()
        if not smiles:
            return jsonify({"error": "No SMILES provided"}), 400

        cache_key = "smilerender:iupac:{}".format(hashlib.md5(smiles.encode()).hexdigest())
        cached = _cache_get(cache_key)
        if cached:
            return cached, 200, {'Content-Type': 'application/json'}

        encoded = urllib.parse.quote(smiles, safe='')
        url = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/{}/property/IUPACName,InChI,InChIKey,MolecularFormula,MolecularWeight/JSON".format(encoded)
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
        return jsonify({"error": "PubChem error: {}".format(e.code)}), 500
    except Exception as err:
        print("IUPAC Convert Error: {}".format(err))
        return jsonify({"error": str(err)}), 500


@app.route("/descriptors", methods=["POST"])
def calc_descriptors():
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors, rdMolDescriptors, Crippen, Lipinski, QED
        body = request.get_json()
        smiles_list = body.get("smiles", [])
        if isinstance(smiles_list, str):
            smiles_list = [smiles_list]
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

        if len(smiles_list) == 1:
            single = results[0] if results else {"error": "No result"}
            if "error" in single:
                return jsonify(single), 422
            return jsonify(single)
        return jsonify(results)
    except Exception as err:
        print("Descriptors Error: {}".format(err))
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

        # fp_bit_keys  = full bit-vector columns (fp_X_bits)      separate sheets
        # phys_keys    = everything else except "error"           Descriptors sheet
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
                        row["b{}".format(i)] = int(b)
                    rows_fp.append(row)
                if rows_fp:
                    pd.DataFrame(rows_fp).to_excel(writer, index=False, sheet_name="FP_{}".format(fp_name))

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
            download_name="descriptors_qsar.xlsx"
        )
    except Exception as err:
        print("Descriptors Excel Error: {}".format(err))
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
        print("Similarity Error: {}".format(err))
        return jsonify({"error": str(err)}), 500


@app.route("/render/reaction", methods=["POST"])
def render_reaction():
    try:
        from rdkit.Chem import AllChem, Draw
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
        print("Reaction Render Error: {}".format(err))
        return "Error rendering reaction: {}".format(err), 500


@app.route("/task/status/<string:task_id>", methods=["GET"])
def get_task_status(task_id):
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
             
        metrics = get_peptide_metrics(sequence)
        return jsonify({
            "smiles": smiles,
            "metrics": metrics
        })
        
    except Exception as err:
        print("PepLink Error: {}".format(err))
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
            metrics = get_peptide_metrics(result.sequence)
            return jsonify({
                "sequence": result.sequence,
                "is_cyclic": result.is_cyclic,
                "cyclization": result.cyclization,
                "metrics": metrics
            })
        else:
            return jsonify({"error": result.unsupported_reason or "Conversion failed"}), 422
        
    except Exception as err:
        print("PepLink Reverse Error: {}".format(err))
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
        return send_file(buf, mimetype="image/{}".format(fmt.lower()), as_attachment=True, download_name="molecules_grid.{}".format(ext))
    except Exception as err:
        print("Grid Export Error: {}".format(err))
        return str(err), 500
@app.route("/export/excel", methods=["POST"])
def export_excel_all():
    """Export any list of results to Excel."""
    try:
        import pandas as pd
        import io
        data = request.get_json()
        print("DEBUG: Exporting Excel with {} rows".format(len(data) if data else 0))
        if not data: return "No data provided", 400
        
        df = pd.DataFrame(data)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="ADMET Results")
        output.seek(0)
        return send_file(output, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", as_attachment=True, download_name="ADMET_Analysis.xlsx")
    except Exception as err:
        print("CRITICAL: Excel Export Error: {}".format(err))
        import traceback
        traceback.print_exc()
        return str(err), 500

# Removed duplicate /export/report fpdf route — superseded by the ReportLab version above.


def _bbb_featurize(mol):
    """Morgan ECFP4 (2048 bits) + 9 pharmacokinetic descriptors."""
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)
    fp_arr = np.zeros(2048, dtype=np.float32)
    DataStructs.ConvertToNumpyArray(fp, fp_arr)
    desc = np.array([
        Descriptors.MolWt(mol),
        Descriptors.MolLogP(mol),
        Descriptors.TPSA(mol),
        rdMolDescriptors.CalcNumHBD(mol),
        rdMolDescriptors.CalcNumHBA(mol),
        rdMolDescriptors.CalcNumRotatableBonds(mol),
        rdMolDescriptors.CalcNumAromaticRings(mol),
        Descriptors.RingCount(mol),
        Descriptors.HeavyAtomCount(mol),
    ], dtype=np.float32)
    return np.concatenate([fp_arr, desc])


@app.route("/api/reload-bbb", methods=["POST"])
def reload_bbb():
    """Hot-reload the BBB model without restarting the server."""
    global BBB_MODEL, BBB_ERROR
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "bbb_model.pkl"),
        os.path.join(os.getcwd(), "bbb_model.pkl"),
        os.path.join(os.getcwd(), "src", "bbb_model.pkl"),
    ]
    path = next((p for p in possible_paths if os.path.exists(p)), None)
    if not path:
        BBB_ERROR = "File not found"
        return jsonify({"ok": False, "error": BBB_ERROR}), 404
    try:
        with open(path, "rb") as f:
            BBB_MODEL = pickle.load(f)
        BBB_ERROR = None
        return jsonify({"ok": True, "path": path, "auc": BBB_MODEL.get("validation", {}).get("auc")})
    except Exception as e:
        BBB_ERROR = str(e)
        BBB_MODEL = None
        return jsonify({"ok": False, "error": BBB_ERROR}), 500


@app.route("/predict/bbb/base64/<path:smiles>", methods=["GET"])
def predict_bbb(smiles):
    """Predict Blood-Brain Barrier permeability using local GradientBoosting model (B3DB dataset)."""
    if BBB_MODEL is None:
        return jsonify({"error": "BBB model not loaded"}), 503
    from admin import inc_model; inc_model("bbb")
    try:
        clean = smiles.replace("%3D", "=")
        decoded = b64decode(clean.encode("utf-8")).decode("utf-8")
        mol = Chem.MolFromSmiles(decoded)
        if mol is None:
            return jsonify({"error": "Invalid SMILES"}), 400

        feat = _bbb_featurize(mol)
        pred = BBB_MODEL["model"].predict([feat])[0]
        prob = BBB_MODEL["model"].predict_proba([feat])[0]

        label = BBB_MODEL["label_map"][int(pred)]
        prob_positive = float(prob[1])

        return jsonify({
            "status": label,
            "probability": round(prob_positive, 4),
            "permeable": bool(pred == 1),
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500

def _transdermal_featurize(mol):
    """7 RDKit physico-chemical descriptors for transdermal permeation model."""
    from rdkit.Chem import Crippen, Descriptors, rdMolDescriptors
    return [
        Descriptors.MolLogP(mol),
        Descriptors.ExactMolWt(mol),
        rdMolDescriptors.CalcTPSA(mol),
        rdMolDescriptors.CalcNumHBD(mol),
        rdMolDescriptors.CalcNumHBA(mol),
        rdMolDescriptors.CalcNumRotatableBonds(mol),
        Crippen.MolMR(mol),
    ]


@app.route("/predict/transdermal/base64/<path:smiles>", methods=["GET"])
def predict_transdermal(smiles):
    """Predict skin permeability logKp (log10 cm/s) using Flynn (1990) / Potts-Guy (1992) GBM model."""
    if TRANSDERMAL_MODEL is None:
        return jsonify({"error": "Transdermal model not loaded", "detail": TRANSDERMAL_ERROR}), 503
    try:
        clean = smiles.replace("%3D", "=")
        decoded = b64decode(clean.encode("utf-8")).decode("utf-8")
        mol = Chem.MolFromSmiles(decoded)
        if mol is None:
            return jsonify({"error": "Invalid SMILES"}), 400

        feat = _transdermal_featurize(mol)
        logkp = float(TRANSDERMAL_MODEL["model"].predict([feat])[0])

        # GHS-inspired classification based on logKp thresholds
        if logkp >= -2:
            classification = "high"       # Kp > 10⁻² cm/s — easily penetrates skin
        elif logkp >= -3:
            classification = "moderate"   # 10⁻³–10⁻² cm/s
        elif logkp >= -5:
            classification = "low"        # 10⁻⁵–10⁻³ cm/s
        else:
            classification = "very_low"   # < 10⁻⁵ cm/s — poor skin penetration

        return jsonify({
            "logKp": round(logkp, 3),
            "kp_cm_s": float(f"{10**logkp:.2e}"),
            "classification": classification,
            "model": "GBM/Flynn-1990",
            "loo_r2": TRANSDERMAL_MODEL.get("loo_r2"),
            "n_train": TRANSDERMAL_MODEL.get("n_train"),
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500


# --- LibPrep Integration ---
from libprep_engine import (
    standardize_mol, compute_descriptors, generate_3d_block, create_export_zip
)

@app.route("/api/libprep/load", methods=["POST"])
def libprep_load():
    try:
        data = request.get_json()
        text = data.get("text", "")
        method = data.get("method", "smiles")
        
        entries = []
        if method == "smiles":
            for i, line in enumerate(text.strip().splitlines()):
                line = line.strip()
                if not line or line.startswith("#"): continue
                parts = line.split(None, 1)
                smiles = parts[0]
                name = parts[1].strip() if len(parts) > 1 else "mol_{}".format(i+1)
                mol = Chem.MolFromSmiles(smiles)
                if mol:
                    entries.append({"name": name, "smiles": Chem.MolToSmiles(mol), "status": "pending"})
                else:
                    entries.append({"name": name, "smiles": smiles, "status": "invalid", "error": "Invalid SMILES"})
        
        return jsonify(entries)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/libprep/prepare", methods=["POST"])
def libprep_prepare():
    try:
        data = request.get_json()
        entries = data.get("entries", [])
        config = data.get("config", {})
        
        remove_salts = config.get("remove_salts", True)
        neutralize = config.get("neutralize", True)
        canon_tautomer = config.get("canon_tautomer", False)
        ff = config.get("f", "MMFF94")
        max_iters = config.get("max_iters", 2000)
        
        for e in entries:
            if e['status'] == "invalid": continue
            
            mol = Chem.MolFromSmiles(e['smiles'])
            if not mol:
                e['status'] = "invalid"
                e['error'] = "Invalid SMILES"
                continue
                
            mol_std = standardize_mol(mol, remove_salts, neutralize, canon_tautomer)
            if not mol_std:
                e['status'] = "invalid"
                e['error'] = "Standardization failed"
                continue
            
            e['smiles'] = Chem.MolToSmiles(mol_std)
            e['props'] = compute_descriptors(mol_std)
            
            sdf, energy, err = generate_3d_block(e['smiles'], ff=ff, max_iters=max_iters)
            if sdf:
                e['sdf_3d'] = sdf
                e['energy'] = round(energy, 3) if energy is not None else None
                e['ff_used'] = ff
                e['status'] = "ok"
            else:
                e['status'] = "failed"
                e['error'] = err
        
        return jsonify(entries)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/libprep/export", methods=["POST"])
def libprep_export():
    try:
        data = request.get_json()
        entries = data.get("entries", [])
        fmt = data.get("format", "pdbqt")
        
        zip_data = create_export_zip(entries, format=fmt)
        
        import io
        return send_file(
            io.BytesIO(zip_data),
            mimetype="application/zip",
            as_attachment=True,
            download_name="libprep_export_{}.zip".format(fmt)
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/pubchem/name-to-smiles", methods=["POST"])
def pubchem_name_to_smiles():
    try:
        body = request.get_json()
        name = (body or {}).get("name", "").strip()
        if not name:
            return jsonify({"error": "No name provided"}), 400

        cache_key = "pubchem_name:{}".format(hashlib.md5(name.lower().encode()).hexdigest())
        if _cache_ok:
            cached = _redis.get(cache_key)
            if cached:
                return cached, 200, {'Content-Type': 'application/json'}

        encoded = urllib.parse.quote(name, safe='')
        url = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{}/property/IsomericSMILES,IUPACName,MolecularWeight/JSON".format(encoded)
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={"User-Agent": "SmileRender/1.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            raw = json.loads(resp.read())

        props = raw["PropertyTable"]["Properties"][0]
        result = json.dumps({
            "smiles": props.get("IsomericSMILES") or props.get("CanonicalSMILES") or props.get("SMILES", ""),
            "iupac": props.get("IUPACName", name),
            "mw": props.get("MolecularWeight", ""),
            "cid": props.get("CID", ""),
        })
        if _cache_ok:
            _redis.setex(cache_key, 86400, result)
        return result, 200, {'Content-Type': 'application/json'}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return jsonify({"error": "Compound '{}' not found in PubChem".format(name)}), 404
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


