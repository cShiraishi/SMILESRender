from celery import Celery
import os
from converter import convert_many_smiles_and_zip, convert_smiles
import json
import urllib.request
import urllib.parse
from base64 import b64decode

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
app = Celery("smiles_tasks", broker=redis_url, backend=redis_url)

@app.task(name="render_batch")
def render_batch_task(smiles_data):
    """Render a batch of smiles and return the zip file as bytes (in-memory)."""
    # Note: Celery requires serializable data, so we pass and return base64 or bytes
    zip_buffer = convert_many_smiles_and_zip(smiles_data)
    return zip_buffer.getvalue().hex() # Return hex to be JSON serializable

@app.task(name="predict_tool")
def predict_tool_task(tool_name, smiles_b64):
    """Execute a tool prediction in the background."""
    decoded_smiles = b64decode(smiles_b64.encode("utf-8")).decode("utf-8")
    
    # Use the same logic from routes.py for each tool
    urls = {
        "stoptox": "https://stoptox.mml.unc.edu/predict?smiles={}".format(decoded_smiles),
    }
    
    try:
        if tool_name == "stoptox":
            return urllib.request.urlopen(urls["stoptox"], timeout=120).read().decode("utf-8")
        # Add other tools here...
        return {"error": "Tool not implemented in worker yet"}
    except Exception as e:
        return {"error": str(e)}

