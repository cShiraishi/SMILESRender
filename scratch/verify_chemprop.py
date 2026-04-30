try:
    import torch
    print(f"Torch version: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    
    import chemprop
    print(f"Chemprop version: {chemprop.__version__}")
    
    # Try importing admet-ai if installed
    try:
        import admet_ai
        print("ADMET-AI installed successfully.")
    except ImportError:
        print("ADMET-AI not installed yet.")

except Exception as e:
    print(f"Error during verification: {e}")
