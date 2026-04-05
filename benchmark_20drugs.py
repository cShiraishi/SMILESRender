"""
SmileRender — Case Study: 20 FDA/EMA Approved Drugs
=====================================================
Therapeutic diversity: cardiovascular, CNS, oncology, anti-infective,
endocrinology, respiratory, and GI classes.

Outputs:
  benchmark_20drugs.txt   — human-readable report
  benchmark_20drugs.json  — machine-readable full results
"""

import urllib.request
import urllib.parse
import json
import time
import sys
import statistics
from base64 import b64encode
from datetime import datetime

BASE_URL = "http://localhost:3000"

# ── 20 FDA/EMA approved drugs — diverse therapeutic classes ──
DRUGS = {
    # Analgesic / Anti-inflammatory
    "Aspirin":         {"smiles": "CC(=O)Oc1ccccc1C(=O)O",               "class": "Analgesic/NSAID",           "approval": "FDA/EMA"},
    "Ibuprofen":       {"smiles": "CC(C)Cc1ccc(cc1)C(C)C(=O)O",          "class": "NSAID",                     "approval": "FDA/EMA"},
    "Paracetamol":     {"smiles": "CC(=O)Nc1ccc(O)cc1",                   "class": "Analgesic",                 "approval": "FDA/EMA"},
    "Celecoxib":       {"smiles": "CC1=CC=C(C=C1)C1=CC(=NN1C1=CC=C(C=C1)S(N)(=O)=O)C(F)(F)F", "class": "COX-2 inhibitor", "approval": "FDA/EMA"},

    # Cardiovascular
    "Atorvastatin":    {"smiles": "CC(C)c1n(CC(O)CC(O)CC(=O)O)c(C(C)C)c(c1-c1ccc(F)cc1)c1ccccc1C(=O)Nc1ccc(cc1)F", "class": "Statin", "approval": "FDA/EMA"},
    "Amlodipine":      {"smiles": "CCOC(=O)C1=C(COCCN)NC(C)=C(C1c1ccccc1Cl)C(=O)OCC",           "class": "Ca2+ channel blocker", "approval": "FDA/EMA"},
    "Warfarin":        {"smiles": "CC(=O)CC1C(=O)c2ccccc2OC1c1ccccc1",    "class": "Anticoagulant",             "approval": "FDA/EMA"},
    "Metoprolol":      {"smiles": "COCCC(=O)NCCC1=CC=C(OCC(O)CNC(C)C)C=C1", "class": "Beta-blocker",           "approval": "FDA/EMA"},
    "Lisinopril":      {"smiles": "NCCCC(NC(CCc1ccccc1)C(=O)O)C(=O)N1CCCC1C(=O)O", "class": "ACE inhibitor",  "approval": "FDA/EMA"},

    # CNS / Psychiatry
    "Sertraline":      {"smiles": "CNC1CCC(c2ccc(Cl)c(Cl)c2)c2ccccc21",   "class": "SSRI antidepressant",       "approval": "FDA/EMA"},
    "Diazepam":        {"smiles": "CN1C(=O)CN=C(c2ccccc2)c2cc(Cl)ccc21",  "class": "Benzodiazepine",            "approval": "FDA/EMA"},
    "Caffeine":        {"smiles": "Cn1c(=O)c2c(ncn2C)n(c1=O)C",           "class": "CNS stimulant",             "approval": "FDA/EMA"},

    # Endocrinology / Metabolism
    "Metformin":       {"smiles": "CN(C)C(=N)NC(=N)N",                    "class": "Biguanide antidiabetic",    "approval": "FDA/EMA"},
    "Dexamethasone":   {"smiles": "CC1CC2C3CCC4=CC(=O)C=CC4(C)C3(F)C(O)CC2(C)C1(O)C(=O)CO", "class": "Corticosteroid", "approval": "FDA/EMA"},
    "Omeprazole":      {"smiles": "COc1ccc2nc(S(=O)Cc3ncc(C)c(OC)c3C)[nH]c2c1",             "class": "Proton pump inhibitor", "approval": "FDA/EMA"},

    # Anti-infective
    "Amoxicillin":     {"smiles": "CC1(C)SC2C(NC(=O)C(N)c3ccc(O)cc3)C(=O)N2C1C(=O)O",       "class": "Beta-lactam antibiotic",  "approval": "FDA/EMA"},
    "Ciprofloxacin":   {"smiles": "O=C(O)c1cn(C2CC2)c2cc(N3CCNCC3)c(F)cc2c1=O",              "class": "Fluoroquinolone antibiotic","approval": "FDA/EMA"},
    "Oseltamivir":     {"smiles": "CCOC(=O)C1=C(OC(CC)CC)CC(NC(C)=O)C(N)C1",                 "class": "Antiviral (neuraminidase)", "approval": "FDA/EMA"},

    # Oncology
    "Tamoxifen":       {"smiles": "CC(/C=C/c1ccc(OCCN(CC)CC)cc1)=C(\\c1ccccc1)c1ccccc1",     "class": "SERM / Breast cancer",    "approval": "FDA/EMA"},
    "Erlotinib":       {"smiles": "C#Cc1cccc(Nc2ncnc3cc(OCCOC)c(OCCOC)cc23)c1",               "class": "EGFR kinase inhibitor",   "approval": "FDA/EMA"},
}

TOOLS = [
    ("StopTox",      "/predict/base64/{b64}",             "GET"),
    ("SwissADME",    "/predict/swissadme/base64/{b64}",   "GET"),
    ("StopLight",    "/predict/stoplight/base64/{b64}",   "GET"),
    ("pkCSM",        "/predict/pkcsm/base64/{b64}",       "GET"),
    ("ADMETlab 3.0", "/predict/admetlab/base64/{b64}",    "GET"),
]

LIPINSKI = {
    "Aspirin":      {"MW": 180.16, "LogP": 1.19, "HBD": 1, "HBA": 4},
    "Ibuprofen":    {"MW": 206.28, "LogP": 3.97, "HBD": 1, "HBA": 2},
    "Paracetamol":  {"MW": 151.16, "LogP": 0.46, "HBD": 2, "HBA": 3},
    "Celecoxib":    {"MW": 381.37, "LogP": 3.59, "HBD": 1, "HBA": 4},
    "Atorvastatin": {"MW": 558.64, "LogP": 4.46, "HBD": 4, "HBA": 9},
    "Amlodipine":   {"MW": 408.88, "LogP": 3.00, "HBD": 3, "HBA": 8},
    "Warfarin":     {"MW": 308.33, "LogP": 2.70, "HBD": 1, "HBA": 4},
    "Metoprolol":   {"MW": 267.36, "LogP": 1.88, "HBD": 3, "HBA": 5},
    "Lisinopril":   {"MW": 405.49, "LogP": -1.54,"HBD": 5, "HBA": 8},
    "Sertraline":   {"MW": 306.23, "LogP": 4.73, "HBD": 1, "HBA": 2},
    "Diazepam":     {"MW": 284.74, "LogP": 2.82, "HBD": 0, "HBA": 3},
    "Caffeine":     {"MW": 194.19, "LogP": -0.07,"HBD": 0, "HBA": 6},
    "Metformin":    {"MW": 129.16, "LogP": -1.43,"HBD": 4, "HBA": 4},
    "Dexamethasone":{"MW": 392.46, "LogP": 1.83, "HBD": 2, "HBA": 7},
    "Omeprazole":   {"MW": 345.42, "LogP": 2.23, "HBD": 1, "HBA": 7},
    "Amoxicillin":  {"MW": 365.40, "LogP": 0.87, "HBD": 4, "HBA": 8},
    "Ciprofloxacin":{"MW": 331.34, "LogP": 0.28, "HBD": 2, "HBA": 7},
    "Oseltamivir":  {"MW": 312.40, "LogP": 0.35, "HBD": 2, "HBA": 6},
    "Tamoxifen":    {"MW": 371.51, "LogP": 6.30, "HBD": 0, "HBA": 2},
    "Erlotinib":    {"MW": 393.44, "LogP": 2.70, "HBD": 1, "HBA": 8},
}

def encode(smiles: str) -> str:
    return urllib.parse.quote(b64encode(smiles.encode()).decode())

def test_tool(name, tpl, smiles_b64):
    url = BASE_URL + tpl.format(b64=smiles_b64)
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SmileRender-Benchmark/2.0"})
        with urllib.request.urlopen(req, timeout=180) as r:
            data = r.read()
            elapsed = round(time.time() - t0, 2)
            kb = round(len(data) / 1024, 1)
            ok = len(data) > 200
            return {"status": "OK" if ok else "EMPTY", "time": elapsed, "kb": kb}
    except Exception as e:
        return {"status": f"ERROR: {str(e)[:60]}", "time": round(time.time()-t0, 2), "kb": 0}

def lipinski_check(name):
    if name not in LIPINSKI:
        return "N/A"
    p = LIPINSKI[name]
    violations = sum([p["MW"] > 500, p["LogP"] > 5, p["HBD"] > 5, p["HBA"] > 10])
    return f"{'PASS' if violations <= 1 else 'FAIL'} ({violations} viol.)"

def main():
    sep = "=" * 90
    print(sep)
    print("  SmileRender — Case Study: 20 FDA/EMA Approved Drugs")
    print(sep)
    print(f"  Started : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Server  : {BASE_URL}")
    print(f"  Drugs   : {len(DRUGS)}  |  Tools: {len(TOOLS)}  |  Total: {len(DRUGS)*len(TOOLS)}")
    print(sep)

    try:
        urllib.request.urlopen(f"{BASE_URL}/ping", timeout=5)
        print("  [OK] Server responding\n")
    except Exception as e:
        print(f"  [FAIL] Server not responding: {e}")
        sys.exit(1)

    results = {}
    t_total = time.time()

    for drug, meta in DRUGS.items():
        smiles = meta["smiles"]
        b64 = encode(smiles)
        ro5 = lipinski_check(drug)
        print(f"  +- {drug} ({meta['class']})  Ro5: {ro5}")
        print(f"  |  SMILES: {smiles}")
        drug_res = {}
        t_drug = time.time()
        for tool, tpl, _ in TOOLS:
            r = test_tool(tool, tpl, b64)
            drug_res[tool] = r
            icon = "OK" if r["status"] == "OK" else "!!"
            print(f"  |  [{icon}] {tool:15s}  {r['time']:6.2f}s  {r['kb']:7.1f} KB  {r['status']}")
        drug_total = round(time.time() - t_drug, 2)
        print(f"  +- Subtotal: {drug_total:.2f}s\n")
        results[drug] = {"meta": meta, "ro5": ro5, "results": drug_res, "total": drug_total}

    elapsed = round(time.time() - t_total, 2)

    # ── Statistics ──
    ok_count = sum(1 for d in results.values()
                   for t in d["results"].values() if t["status"] == "OK")
    total_tests = len(DRUGS) * len(TOOLS)

    tool_times  = {t[0]: [] for t in TOOLS}
    tool_ok     = {t[0]: 0  for t in TOOLS}
    class_ok    = {}
    class_total = {}

    for drug, data in results.items():
        cls = data["meta"]["class"]
        class_total[cls] = class_total.get(cls, 0) + len(TOOLS)
        class_ok[cls]    = class_ok.get(cls, 0)
        for tool, r in data["results"].items():
            if r["status"] == "OK":
                tool_times[tool].append(r["time"])
                tool_ok[tool] += 1
                class_ok[cls] += 1

    print(sep)
    print("  SUMMARY")
    print(sep)
    print(f"  Total elapsed  : {elapsed:.2f}s  ({elapsed/60:.1f} min)")
    print(f"  Per compound   : {elapsed/len(DRUGS):.2f}s average")
    print(f"  Success rate   : {ok_count}/{total_tests}  ({100*ok_count/total_tests:.1f}%)")
    print()

    print(f"  {'Tool':<18} {'Success':>10} {'Mean (s)':>10} {'SD (s)':>8} {'Min (s)':>8} {'Max (s)':>8}")
    print("  " + "-"*66)
    for tool, _ in TOOLS:
        times = tool_times[tool]
        s_ok  = tool_ok[tool]
        if times:
            mean = statistics.mean(times)
            sd   = statistics.stdev(times) if len(times) > 1 else 0
            mn, mx = min(times), max(times)
            print(f"  {tool:<18} {s_ok:>4}/{len(DRUGS):<5} {mean:>10.2f} {sd:>8.2f} {mn:>8.2f} {mx:>8.2f}")
        else:
            print(f"  {tool:<18} {s_ok:>4}/{len(DRUGS):<5} {'N/A':>10}")
    print()

    print("  Success by therapeutic class:")
    print(f"  {'Class':<32} {'OK/Total':>10} {'Rate':>8}")
    print("  " + "-"*54)
    for cls in sorted(class_total):
        n_ok = class_ok.get(cls, 0)
        n_t  = class_total[cls]
        print(f"  {cls:<32} {n_ok:>4}/{n_t:<5} {100*n_ok/n_t:>7.1f}%")
    print()

    print("  Timing table (seconds):")
    header = f"  {'Drug':<16}" + "".join(f"{t[0]:>13}" for t in TOOLS) + f"{'Total':>10}"
    print(header)
    print("  " + "-" * (16 + 13*len(TOOLS) + 10))
    for drug, data in results.items():
        row = f"  {drug:<16}"
        tot = 0
        for tool, _, _ in TOOLS:
            t_val = data["results"][tool]["time"]
            row += f"{t_val:>13.2f}"
            tot += t_val
        row += f"{tot:>10.2f}"
        print(row)

    print()
    print(f"  Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(sep)

    # ── Save outputs ──
    report_lines = []  # rebuild as string for file
    for drug, data in results.items():
        report_lines.append(f"{drug} | {data['meta']['class']} | Ro5: {data['ro5']} | Total: {data['total']:.2f}s")
        for tool, r in data["results"].items():
            report_lines.append(f"  {tool}: {r['status']} {r['time']}s {r['kb']}KB")

    with open("benchmark_20drugs.txt", "w", encoding="utf-8") as f:
        f.write(f"SmileRender Benchmark — 20 FDA/EMA Drugs\n")
        f.write(f"Date: {datetime.now().isoformat()}\n")
        f.write(f"Success: {ok_count}/{total_tests} ({100*ok_count/total_tests:.1f}%)\n")
        f.write(f"Elapsed: {elapsed:.2f}s\n\n")
        f.write("\n".join(report_lines))

    json_out = {
        "meta": {
            "date": datetime.now().isoformat(),
            "server": BASE_URL,
            "n_drugs": len(DRUGS),
            "n_tools": len(TOOLS),
            "total_tests": total_tests,
            "success": ok_count,
            "success_rate": round(100*ok_count/total_tests, 1),
            "elapsed_seconds": elapsed,
        },
        "tool_stats": {
            tool: {
                "success": tool_ok[tool],
                "mean_time": round(statistics.mean(tool_times[tool]), 3) if tool_times[tool] else None,
                "sd_time":   round(statistics.stdev(tool_times[tool]), 3) if len(tool_times[tool])>1 else 0,
                "min_time":  min(tool_times[tool]) if tool_times[tool] else None,
                "max_time":  max(tool_times[tool]) if tool_times[tool] else None,
            } for tool, _ in [(t[0], None) for t in TOOLS]
        },
        "results": {
            drug: {
                "smiles":   data["meta"]["smiles"],
                "class":    data["meta"]["class"],
                "approval": data["meta"]["approval"],
                "ro5":      data["ro5"],
                "total_s":  data["total"],
                "tools":    data["results"],
            } for drug, data in results.items()
        },
    }

    with open("benchmark_20drugs.json", "w", encoding="utf-8") as f:
        json.dump(json_out, f, indent=2, ensure_ascii=False)

    print(f"\n  Results saved → benchmark_20drugs.txt  |  benchmark_20drugs.json")

if __name__ == "__main__":
    main()
