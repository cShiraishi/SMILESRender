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
import json


app = Flask(__name__)


@app.route("/ping")
def ping():
    return "pong", 200


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/render", methods=["POST"])
def render_by_json():
    try:
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
        return f"No Smile to predic"
    else:
        decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")

        return urllib.request.urlopen(
            f"https://stoptox.mml.unc.edu/predict?smiles={decoded_smiles}", timeout=120
        ).read()


@app.route("/predict/swissadme/base64/<string:smiles>", methods=["GET"])
def predict_swissadme(smiles: str):
    if not smiles:
        return f"No Smile to predict"
    else:
        decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")

        data = urllib.parse.urlencode({"smiles": decoded_smiles}).encode("utf-8")
        req = urllib.request.Request("https://www.swissadme.ch/index.php", data=data)

        with urllib.request.urlopen(req, timeout=120) as response:
            return response.read()


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

            with urllib.request.urlopen(req, timeout=120) as response:
                return response.read()
    except Exception as err:
        print(f"StopLight Error: {err}")
        return f"Error connecting to StopLight: {err}", 500

@app.route("/predict/pkcsm/base64/<string:smiles>", methods=["GET"])
def predict_pkcsm_init(smiles: str):
    try:
        decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
        
        # O pkCSM exige smiles_str e pred_type
        params = {
            "smiles_str": decoded_smiles,
            "pred_type": "adme"
        }
        data = urllib.parse.urlencode(params).encode("utf-8")
        
        req = urllib.request.Request(
            "https://biosig.lab.uq.edu.au/pkcsm/admet_prediction",
            data=data,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        
        with urllib.request.urlopen(req, timeout=60) as response:
            # Pegar a URL final após os redirecionamentos
            final_url = response.geturl()
            return jsonify({"result_url": final_url})
            
    except Exception as err:
        print(f"pkCSM Init Error: {err}")
        return f"Error starting pkCSM: {err}", 500

@app.route("/predict/admetlab/base64/<string:smiles>", methods=["GET"])
def predict_admetlab(smiles: str):
    try:
        decoded_smiles = b64decode(smiles.encode("utf-8")).decode("utf-8")
        
        # 1. Obter a página inicial para pegar o CSRF token e cookie
        headers = {'User-Agent': 'Mozilla/5.0'}
        req_init = urllib.request.Request("https://admetlab3.scbdd.com/server/evaluation", headers=headers)
        
        # Usar cookiejar para gerenciar os cookies automaticamente
        import http.cookiejar
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        
        csrf_token = ""
        with opener.open(req_init, timeout=30) as response:
            html_init = response.read().decode('utf-8')
            # Procurar pelo campo <input type="hidden" name="csrfmiddlewaretoken" value="...">
            import re
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
            return response.read()

    except Exception as err:
        print(f"ADMETlab Error: {err}")
        return f"Error connecting to ADMETlab: {err}", 500

@app.route("/predict/pkcsm/fetch", methods=["POST"])
def predict_pkcsm_fetch():
    try:
        req_data = request.get_json()
        target_url = req_data.get('url')
        
        if not target_url:
            return "No URL provided", 400
            
        req = urllib.request.Request(
            target_url,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        
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
        except:
            df_pivot = pd.DataFrame() # Fallback se falhar

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
