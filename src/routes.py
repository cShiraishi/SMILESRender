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
from PepLink import aa_seqs_to_smiles, smiles_to_aa_seqs

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

app = Flask(__name__)

@app.after_request
def set_security_headers(response):
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "frame-src 'none'; "
        "object-src 'none'; "
        "base-uri 'self';"
    )
    response.headers['X-Frame-Options']        = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy']        = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy']     = 'geolocation=(), microphone=(), camera=()'
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


@app.route("/predict/base64/<string:smiles>", methods=["GET"])
def predict(smiles: str):
    if not smiles:
        return "No Smile to predict", 400
    decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
    cache_key = f"smilerender:stoptox:{hashlib.md5(decoded_smiles.encode()).hexdigest()}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    result = urllib.request.urlopen(
        f"https://stoptox.mml.unc.edu/predict?smiles={decoded_smiles}", timeout=120
    ).read()
    _cache_set(cache_key, result)
    return result


@app.route("/predict/swissadme/base64/<string:smiles>", methods=["GET"])
def predict_swissadme(smiles: str):
    if not smiles:
        return "No Smile to predict", 400
    decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
    cache_key = f"smilerender:swissadme:{hashlib.md5(decoded_smiles.encode()).hexdigest()}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    data = urllib.parse.urlencode({"smiles": decoded_smiles}).encode("utf-8")
    req = urllib.request.Request("https://www.swissadme.ch/index.php", data=data)
    with urllib.request.urlopen(req, timeout=120) as response:
        result = response.read()
    _cache_set(cache_key, result)
    return result


@app.route("/predict/stoplight/base64/<string:smiles>", methods=["GET"])
def predict_stoplight(smiles: str):
    try:
        if not smiles:
            return f"No Smile to predict"
        else:
            decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")

            # O StopLight agora exige JSON e um objeto 'options'
            payload = {
                "smiles": decoded_smiles,
                "options": {
                    "ALogP": True,
                    "FSP3": True,
                    "HBA": True,
                    "HBD": True,
                    "Molecular Weight": True,
                    "Num Heavy Atoms": True,
                    "Num Saturated Quaternary Carbons": True,
                    "Number of Rings": True,
                    "Number of Rotatable Bonds": True,
                    "Polar Surface Area": True,
                    "Solubility in Water (mg/L)": True,
                    "precision": "2"
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

            cache_key = f"smilerender:stoplight:{hashlib.md5(decoded_smiles.encode()).hexdigest()}"
            cached = _cache_get(cache_key)
            if cached:
                return cached
            with urllib.request.urlopen(req, timeout=120) as response:
                result = response.read()
            _cache_set(cache_key, result)
            return result
    except Exception as err:
        print(f"StopLight Error: {err}")
        return f"Error connecting to StopLight: {err}", 500

@app.route("/predict/pkcsm/base64/<string:smiles>", methods=["GET"])
def predict_pkcsm_init(smiles: str):
    try:
        decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
        smiles_hash = hashlib.md5(decoded_smiles.encode()).hexdigest()

        # Usar CookieJar para manter sessão entre init e fetch
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

        params = {"smiles_str": decoded_smiles, "pred_type": "adme"}
        data = urllib.parse.urlencode(params).encode("utf-8")
        req = urllib.request.Request(
            "https://biosig.lab.uq.edu.au/pkcsm/admet_prediction",
            data=data,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )

        with opener.open(req, timeout=60) as response:
            final_url = response.geturl()

        # Guardar opener para reutilizar cookies nos polls seguintes
        set_pkcsm_opener(smiles_hash, opener)
        return jsonify({"result_url": final_url, "smiles_hash": smiles_hash})

    except Exception as err:
        print(f"pkCSM Init Error: {err}")
        return f"Error starting pkCSM: {err}", 500

@app.route("/predict/admetlab/base64/<string:smiles>", methods=["GET"])
def predict_admetlab(smiles: str):
    try:
        decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
        
        cache_key = f"smilerender:admetlab:{hashlib.md5(decoded_smiles.encode()).hexdigest()}"
        cached = _cache_get(cache_key)
        if cached:
            return cached

        # 1. Obter a página inicial para pegar o CSRF token e cookie
        headers = {'User-Agent': 'Mozilla/5.0'}
        req_init = urllib.request.Request("https://admetlab3.scbdd.com/server/evaluation", headers=headers)

        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

        csrf_token = ""
        with opener.open(req_init, timeout=30) as response:
            html_init = response.read().decode('utf-8')
            match = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html_init)
            if match:
                csrf_token = match.group(1)

        if not csrf_token:
             return "Could not find CSRF token", 500

        # 2. Fazer o POST com o SMILES
        params = {
            "csrfmiddlewaretoken": csrf_token,
            "smiles": decoded_smiles,
            "method": "1"
        }
        data = urllib.parse.urlencode(params).encode("utf-8")
        
        req_post = urllib.request.Request(
            "https://admetlab3.scbdd.com/server/evaluationCal",
            data=data,
            headers={
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://admetlab3.scbdd.com/server/evaluation',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        )
        
        with opener.open(req_post, timeout=60) as response:
            result = response.read()
        _cache_set(cache_key, result)
        return result

    except Exception as err:
        print(f"ADMETlab Error: {err}")
        return f"Error connecting to ADMETlab: {err}", 500

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
            with opener.open(req, timeout=60) as response:
                return response.read()
        else:
            with urllib.request.urlopen(req, timeout=60) as response:
                return response.read()
    except Exception as err:
        print(f"pkCSM Fetch Error: {err}")
        return f"Error fetching pkCSM results: {err}", 500

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
        for col in ["SMILES", "Tool", "Category", "Property", "Value", "Unit"]:
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
        
        if not smiles:
            return "No SMILES provided", 400
            
        buf = create_mols_grid(smiles, labels, mols_per_row)
        return send_file(buf, mimetype="image/png", as_attachment=True, download_name="molecules_grid.png")
    except Exception as err:
        print(f"Grid Export Error: {err}")
        return str(err), 500
