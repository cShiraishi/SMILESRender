import os
import sys

try:
    from admet_ai import ADMETModel
    print("ADMET-AI imported successfully.")
    
    print("Initializing ADMETModel (this may download weights on first run)...")
    # Using a subset of properties or just initializing to check
    model = ADMETModel()
    print("Model initialized.")
    
    smiles = "c1ccccc1" # Benzene
    print(f"Predicting for {smiles}...")
    preds = model.predict(smiles)
    print("Prediction successful!")
    print(f"Number of properties predicted: {len(preds)}")
    
    # Check a few specific ones
    if "HIA" in preds:
        print(f"HIA (Human Intestinal Absorption): {preds['HIA']}")
    if "BBB" in preds:
        print(f"BBB (Blood-Brain Barrier): {preds['BBB']}")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
