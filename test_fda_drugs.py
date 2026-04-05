"""
SmileRender - FDA-Approved Drug Benchmark Test
================================================
This script tests the SmileRender platform with 5 FDA-approved drugs,
measuring response times and documenting the results for the article.
"""

import urllib.request
import urllib.parse
import json
import time
import sys
from base64 import b64encode

BASE_URL = "http://localhost:3000"

# 5 FDA-Approved drugs with known ADMET profiles
FDA_DRUGS = {
    "Aspirin": "CC(=O)Oc1ccccc1C(=O)O",
    "Ibuprofen": "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
    "Caffeine": "Cn1c(=O)c2c(ncn2C)n(c1=O)C",
    "Metformin": "CN(C)C(=N)NC(=N)N",
    "Paracetamol": "CC(=O)Nc1ccc(O)cc1",
}

TOOLS = [
    ("StopTox", "/predict/base64/{smiles_b64}"),
    ("SwissADME", "/predict/swissadme/base64/{smiles_b64}"),
    ("StopLight", "/predict/stoplight/base64/{smiles_b64}"),
    ("pkCSM", "/predict/pkcsm/base64/{smiles_b64}"),
    ("ADMETlab 3.0", "/predict/admetlab/base64/{smiles_b64}"),
]

def test_tool(tool_name, endpoint_template, smiles, smiles_b64):
    """Test a single tool and return timing + status."""
    url = BASE_URL + endpoint_template.format(smiles_b64=smiles_b64)
    
    start = time.time()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'SmileRender-Test/1.0'})
        with urllib.request.urlopen(req, timeout=120) as response:
            data = response.read()
            elapsed = time.time() - start
            data_size = len(data)
            
            # Check if response has meaningful content
            has_content = data_size > 100
            
            return {
                "status": "OK" if has_content else "EMPTY",
                "time_seconds": round(elapsed, 2),
                "response_size_bytes": data_size,
                "response_size_kb": round(data_size / 1024, 1),
            }
    except Exception as e:
        elapsed = time.time() - start
        return {
            "status": f"ERROR: {str(e)[:80]}",
            "time_seconds": round(elapsed, 2),
            "response_size_bytes": 0,
            "response_size_kb": 0,
        }

def main():
    print("=" * 80)
    print("SmileRender - FDA-Approved Drug Benchmark Test")
    print("=" * 80)
    print(f"Test started at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Server: {BASE_URL}")
    print(f"Number of compounds: {len(FDA_DRUGS)}")
    print(f"Number of tools: {len(TOOLS)}")
    print(f"Total predictions: {len(FDA_DRUGS) * len(TOOLS)}")
    print()
    
    # Check server is running
    try:
        urllib.request.urlopen(f"{BASE_URL}/ping", timeout=5)
        print("[OK] Server is responding")
    except:
        print("[FAIL] Server is not responding at", BASE_URL)
        sys.exit(1)
    
    print()
    
    all_results = {}
    total_start = time.time()
    
    for drug_name, smiles in FDA_DRUGS.items():
        smiles_b64 = urllib.parse.quote(b64encode(smiles.encode()).decode())
        print(f"--- {drug_name} ({smiles}) ---")
        drug_results = {}
        drug_start = time.time()
        
        for tool_name, endpoint in TOOLS:
            result = test_tool(tool_name, endpoint, smiles, smiles_b64)
            drug_results[tool_name] = result
            status_icon = "OK" if "OK" in result["status"] else "!!"
            print(f"  [{status_icon}] {tool_name:15s} | {result['time_seconds']:6.2f}s | {result['response_size_kb']:7.1f} KB | {result['status']}")
        
        drug_elapsed = time.time() - drug_start
        print(f"  Total for {drug_name}: {drug_elapsed:.2f}s")
        print()
        all_results[drug_name] = drug_results
    
    total_elapsed = time.time() - total_start
    
    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total elapsed time: {total_elapsed:.2f} seconds ({total_elapsed/60:.1f} minutes)")
    print(f"Average per compound: {total_elapsed/len(FDA_DRUGS):.2f} seconds")
    print()
    
    # Success rate
    total_ok = sum(1 for d in all_results.values() for t in d.values() if "OK" in t["status"])
    total_tests = len(FDA_DRUGS) * len(TOOLS)
    print(f"Success rate: {total_ok}/{total_tests} ({100*total_ok/total_tests:.1f}%)")
    print()
    
    # Timing table
    print("Response times (seconds):")
    print(f"{'Drug':15s} | {'StopTox':>8s} | {'SwissADME':>10s} | {'StopLight':>10s} | {'pkCSM':>8s} | {'ADMETlab':>10s} | {'Total':>8s}")
    print("-" * 85)
    for drug_name, results in all_results.items():
        times = [results[t]["time_seconds"] for t in ["StopTox", "SwissADME", "StopLight", "pkCSM", "ADMETlab 3.0"]]
        total = sum(times)
        print(f"{drug_name:15s} | {times[0]:8.2f} | {times[1]:10.2f} | {times[2]:10.2f} | {times[3]:8.2f} | {times[4]:10.2f} | {total:8.2f}")
    
    print()
    
    # Average times per tool
    print("Average response time per tool:")
    for tool_name, _ in TOOLS:
        avg = sum(all_results[d][tool_name]["time_seconds"] for d in all_results) / len(all_results)
        print(f"  {tool_name:15s}: {avg:.2f}s")
    
    print()
    print(f"Test completed at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)

if __name__ == "__main__":
    main()
