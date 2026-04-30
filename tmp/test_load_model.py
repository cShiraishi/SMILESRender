import pickle
import os
import sys

try:
    model_path = "src/tox21_model.pkl"
    if os.path.exists(model_path):
        with open(model_path, "rb") as f:
            data = pickle.load(f)
        print("Model loaded successfully.")
        print(f"Tasks: {data['tasks']}")
    else:
        print(f"Model file not found at {model_path}")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
