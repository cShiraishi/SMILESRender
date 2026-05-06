from waitress import serve
from dotenv import load_dotenv
from routes import app
import os
from os import getenv
import torch
import argparse

# PyTorch 2.6+ security patch for loading older model checkpoints
try:
    if hasattr(torch.serialization, 'add_safe_globals'):
        torch.serialization.add_safe_globals([argparse.Namespace])
except:
    pass


load_dotenv()


def main():
    host = "0.0.0.0"
    port = int(getenv("PORT") or 3000)
    threads = int(getenv("THREADS") or 4)
    print("smiles-render-web running at {}:{} with {} threads (Render Free Optimized)".format(host, port, threads))
    # Optimized for long-running docking simulations (10 min timeout)
    serve(
        app, 
        host=host, 
        port=port, 
        threads=threads, 
        connection_limit=1000, 
        channel_timeout=600,
        ident="SmileRender-Waitress"
    )


if __name__ == "__main__":
    main()

