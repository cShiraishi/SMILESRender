import json
from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors, Lipinski, Crippen, QED

def get_descriptors_info():
    descriptors = []
    
    # 1. From Descriptors._descList
    for name, func in Descriptors._descList:
        doc = func.__doc__ if func.__doc__ else ""
        short_def = doc.strip().split('\n')[0] if doc else "No definition available"
        func_name = f"Descriptors.{name}"
        descriptors.append({
            "Nome": name,
            "Definição": short_def,
            "Função RDKit": func_name
        })
        
    # 2. Add some from Lipinski
    lipinski_descriptors = [
        ("NOCount", Lipinski.NOCount, "Lipinski.NOCount"),
        ("NHOHCount", Lipinski.NHOHCount, "Lipinski.NHOHCount"),
        ("NumHAcceptors", Lipinski.NumHAcceptors, "Lipinski.NumHAcceptors"),
        ("NumHDonors", Lipinski.NumHDonors, "Lipinski.NumHDonors"),
    ]
    
    existing_names = [d["Nome"] for d in descriptors]
    for name, func, func_full_name in lipinski_descriptors:
        if name not in existing_names:
            doc = func.__doc__ if func.__doc__ else ""
            short_def = doc.strip().split('\n')[0] if doc else "No definition available"
            descriptors.append({
                "Nome": name,
                "Definição": short_def,
                "Função RDKit": func_full_name
            })
            existing_names.append(name)

    # 3. Add from rdMolDescriptors
    rd_mol_descriptors = [
        ("TPSA", rdMolDescriptors.CalcTPSA, "rdMolDescriptors.CalcTPSA"),
        ("LabuteASA", rdMolDescriptors.CalcLabuteASA, "rdMolDescriptors.CalcLabuteASA"),
        ("NumRotatableBonds", rdMolDescriptors.CalcNumRotatableBonds, "rdMolDescriptors.CalcNumRotatableBonds"),
        ("NumRings", rdMolDescriptors.CalcNumRings, "rdMolDescriptors.CalcNumRings"),
        ("NumAromaticRings", rdMolDescriptors.CalcNumAromaticRings, "rdMolDescriptors.CalcNumAromaticRings"),
        ("NumSaturatedRings", rdMolDescriptors.CalcNumSaturatedRings, "rdMolDescriptors.CalcNumSaturatedRings"),
        ("NumAliphaticRings", rdMolDescriptors.CalcNumAliphaticRings, "rdMolDescriptors.CalcNumAliphaticRings"),
        ("NumAromaticCarbocycles", rdMolDescriptors.CalcNumAromaticCarbocycles, "rdMolDescriptors.CalcNumAromaticCarbocycles"),
        ("NumAromaticHeterocycles", rdMolDescriptors.CalcNumAromaticHeterocycles, "rdMolDescriptors.CalcNumAromaticHeterocycles"),
        ("NumSaturatedCarbocycles", rdMolDescriptors.CalcNumSaturatedCarbocycles, "rdMolDescriptors.CalcNumSaturatedCarbocycles"),
        ("NumSaturatedHeterocycles", rdMolDescriptors.CalcNumSaturatedHeterocycles, "rdMolDescriptors.CalcNumSaturatedHeterocycles"),
        ("NumAliphaticCarbocycles", rdMolDescriptors.CalcNumAliphaticCarbocycles, "rdMolDescriptors.CalcNumAliphaticCarbocycles"),
        ("NumAliphaticHeterocycles", rdMolDescriptors.CalcNumAliphaticHeterocycles, "rdMolDescriptors.CalcAliphaticHeterocycles"),
        ("FractionCSP3", rdMolDescriptors.CalcFractionCSP3, "rdMolDescriptors.CalcFractionCSP3"),
    ]

    for name, func, func_full_name in rd_mol_descriptors:
        if name not in existing_names:
            doc = func.__doc__ if func.__doc__ else ""
            short_def = doc.strip().split('\n')[0] if doc else "No definition available"
            descriptors.append({
                "Nome": name,
                "Definição": short_def,
                "Função RDKit": func_full_name
            })
            existing_names.append(name)

    # 4. QED
    if "QED" not in existing_names:
        descriptors.append({
            "Nome": "QED",
            "Definição": "Quantitative Estimation of Drug-likeness",
            "Função RDKit": "QED.qed"
        })

    return descriptors

if __name__ == "__main__":
    data = get_descriptors_info()
    data.sort(key=lambda x: x["Nome"])
    with open("tmp/descriptors_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
