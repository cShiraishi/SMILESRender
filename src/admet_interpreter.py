"""
Rule-based ADMET interpretation engine.
Takes organised data (smiles     tool     category     rows) and returns
a structured risk profile per molecule.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

RiskLevel = Literal["low", "medium", "high", "critical"]

RISK_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}
RISK_LABEL = {
    "low":      "Low Risk",
    "medium":   "Moderate Risk",
    "high":     "High Risk",
    "critical": "Critical Risk",
}
RISK_HEX = {
    "low":      "#16a34a",
    "medium":   "#d97706",
    "high":     "#dc2626",
    "critical": "#7f1d1d",
}


@dataclass
class Flag:
    level: RiskLevel
    tool: str
    text: str


@dataclass
class MoleculeProfile:
    smiles: str
    flags: list = field(default_factory=list)
    overall: RiskLevel = "low"
    narrative: str = ""

    def add(self, flag: Flag):
        self.flags.append(flag)
        if RISK_RANK[flag.level] > RISK_RANK[self.overall]:
            self.overall = flag.level

    def red_flags(self):
        return [f for f in self.flags if f.level in ("high", "critical")]

    def yellow_flags(self):
        return [f for f in self.flags if f.level == "medium"]

    def green_flags(self):
        return [f for f in self.flags if f.level == "low"]


#                                                                                                                                                                                                                                           
# Helpers
#                                                                                                                                                                                                                                           

def _find(tools, tool, *keywords):
    """Return first Value whose Property contains ALL keywords (case-insensitive)."""
    for cat_rows in tools.get(tool, {}).values():
        for row in cat_rows:
            prop = row.get("Property", "").lower()
            if all(kw.lower() in prop for kw in keywords):
                return str(row.get("Value", "")).strip()
    return None


def _num(val=None):
    if val is None:
        return None
    import re
    m = re.search(r"[-+]?\d*\.?\d+", val.replace(",", "."))
    return float(m.group()) if m else None


def _yes(val=None):
    if val is None:
        return None
    v = val.strip().lower()
    if v in ("yes", "true", "positive", "1", "active"):
        return True
    if v in ("no", "false", "negative", "0", "inactive"):
        return False
    return None


#                                                                                                                                                                                                                                           
# Per-tool rule sets
#                                                                                                                                                                                                                                           

def _check_stoptox(tools, p: MoleculeProfile):
    # StopTox stores data with Category = "Toxicity", Property = column header
    for cat_rows in tools.get("StopTox", {}).values():
        for row in cat_rows:
            prop = row.get("Property", "").lower()
            val  = str(row.get("Value", ""))
            n    = _num(val)

            if "oral" in prop and n is not None:
                if n < 50:
                    p.add(Flag("critical", "StopTox",
                               "Oral LD50 {} mg/kg     extremely/very toxic (GHS Class 1-2)".format(n)))
                elif n < 300:
                    p.add(Flag("high", "StopTox",
                               "Oral LD50 {} mg/kg     toxic (GHS Class 3)".format(n)))
                elif n < 2000:
                    p.add(Flag("medium", "StopTox",
                               "Oral LD50 {} mg/kg     harmful (GHS Class 4)".format(n)))
                else:
                    p.add(Flag("low", "StopTox",
                               "Oral LD50 {} mg/kg     low acute oral toxicity".format(n)))

            elif "dermal" in prop and n is not None:
                if n < 50:
                    p.add(Flag("critical", "StopTox",
                               "Dermal LD50 {} mg/kg     critically toxic via skin".format(n)))
                elif n < 300:
                    p.add(Flag("high", "StopTox",
                               "Dermal LD50 {} mg/kg     toxic via skin contact".format(n)))

            elif "inhal" in prop and n is not None:
                if n < 0.5:
                    p.add(Flag("critical", "StopTox",
                               "Inhalation LC50 {} mg/L     extremely toxic by inhalation".format(n)))
                elif n < 2:
                    p.add(Flag("high", "StopTox",
                               "Inhalation LC50 {} mg/L     toxic by inhalation".format(n)))


def _check_stoplight(tools, p: MoleculeProfile):
    tsl = tools.get("StopLight", {})

    def slv(*kws):
        return _find({"StopLight": tsl}, "StopLight", *kws)

    mw   = _num(slv("molecular weight"))
    logp = _num(slv("alogp")) or _num(slv("logp"))
    tpsa = _num(slv("polar surface area")) or _num(slv("tpsa"))
    hbd  = _num(slv("hbd")) or _num(slv("hydrogen bond donor"))
    hba  = _num(slv("hba")) or _num(slv("hydrogen bond acceptor"))
    rotb = _num(slv("rotatable"))
    sol  = _num(slv("solubility"))

    violations = 0

    if mw is not None:
        if mw > 500:
            violations += 1
            p.add(Flag("medium", "StopLight", "MW {} Da > 500 Da (Lipinski violation)".format(mw)))
        else:
            p.add(Flag("low", "StopLight", "MW {} Da     within Lipinski range".format(mw)))

    if logp is not None:
        if logp > 5:
            violations += 1
            p.add(Flag("medium", "StopLight", "ALogP {} > 5 (Lipinski violation, lipophilicity concern)".format(logp)))
        elif logp > 3.5:
            p.add(Flag("low", "StopLight", "ALogP {}     acceptable lipophilicity".format(logp)))
        else:
            p.add(Flag("low", "StopLight", "ALogP {}     good lipophilicity".format(logp)))

    if tpsa is not None:
        if tpsa > 140:
            p.add(Flag("high", "StopLight",
                       "TPSA {} A2 > 140 A2     poor oral absorption predicted".format(tpsa)))
        elif tpsa > 90:
            p.add(Flag("medium", "StopLight",
                       "TPSA {} A2     moderate absorption (90-140 A2)".format(tpsa)))
        else:
            p.add(Flag("low", "StopLight", "TPSA {} A2     good oral absorption profile".format(tpsa)))

    if hbd is not None and hbd > 5:
        violations += 1
        p.add(Flag("medium", "StopLight", "HBD {} > 5 (Lipinski violation)".format(int(hbd))))
    if hba is not None and hba > 10:
        violations += 1
        p.add(Flag("medium", "StopLight", "HBA {} > 10 (Lipinski violation)".format(int(hba))))
    if rotb is not None and rotb > 10:
        p.add(Flag("medium", "StopLight",
                   "{} rotatable bonds > 10     reduced oral bioavailability (Veber)".format(int(rotb))))

    if sol is not None:
        if sol < 0.01:
            p.add(Flag("high", "StopLight", "Water solubility {} mg/L     very low (BCS Class II/IV risk)".format(sol)))
        elif sol < 1:
            p.add(Flag("medium", "StopLight", "Water solubility {} mg/L     low solubility".format(sol)))
        else:
            p.add(Flag("low", "StopLight", "Water solubility {} mg/L     adequate".format(sol)))

    if violations >= 2:
        p.add(Flag("high", "StopLight",
                   "{} Lipinski Rule of 5 violations     poor oral drug-likeness likely".format(violations)))
    elif violations == 1:
        p.add(Flag("medium", "StopLight",
                   "1 Lipinski Rule of 5 violation     borderline oral drug-likeness"))
    elif violations == 0 and mw is not None:
        p.add(Flag("low", "StopLight", "Passes Lipinski Rule of 5     good oral drug-likeness"))


def _check_protox(tools, p: MoleculeProfile):
    pt = tools.get("ADMETlab 3.0", {})

    def ptv(*kws):
        return _find({"ADMETlab 3.0": pt}, "ADMETlab 3.0", *kws)

    for endpoint, level, msg in [
        ("Carcinogenicity",              "critical", "Carcinogenicity predicted active"),
        ("Mutagenicity",                 "critical", "Mutagenicity predicted active"),
        ("Drug-Induced Liver Injury",    "high",     "DILI predicted active"),
        ("Neurotoxicity",                "high",     "Neurotoxicity predicted active"),
        ("Nephrotoxicity",               "high",     "Nephrotoxicity predicted active"),
        ("Cardiotoxicity",               "high",     "Cardiotoxicity predicted active"),
        ("Immunotoxicity",               "medium",   "Immunotoxicity predicted active"),
        ("Cytotoxicity",                 "medium",   "Cytotoxicity predicted active"),
        ("Clinical Toxicity",            "medium",   "Clinical toxicity predicted active"),
    ]:
        val = ptv(endpoint.lower())
        if val and val.lower() == "active":
            p.add(Flag(level, "ADMETlab 3.0", msg))


#                                                                                                                                                                                                                                           
# Narrative generator
#                                                                                                                                                                                                                                           

def _narrative(p: MoleculeProfile) :
    reds    = p.red_flags()
    yellows = p.yellow_flags()

    parts = []

    if not p.flags:
        return "Insufficient data to generate an interpretation. Ensure all tools completed successfully."

    if p.overall == "critical":
        parts.append(
            "This molecule presents critical safety concerns that warrant immediate attention. "
        )
    elif p.overall == "high":
        parts.append("This molecule raises significant safety and/or pharmacokinetic concerns. ")
    elif p.overall == "medium":
        parts.append("This molecule shows moderate risk factors that require careful evaluation. ")
    else:
        parts.append("This molecule demonstrates a generally favourable overall ADMET profile. ")

    # Critical flags
    critical = [f for f in reds if f.level == "critical"]
    if critical:
        issues = "; ".join(f.text for f in critical[:3])
        parts.append("Critical findings include: {}. ".format(issues))

    # High flags (non-critical)
    high_only = [f for f in reds if f.level == "high"]
    if high_only:
        tops = "; ".join(f.text for f in high_only[:3])
        parts.append("Notable high-risk findings: {}. ".format(tops))

    # Metabolism / DDI
    cyp_flags = [f for f in p.flags if "CYP" in f.text or "drug-drug" in f.text.lower()]
    if cyp_flags:
        parts.append(
            "Drug-drug interaction potential should be assessed prior to co-administration with CYP450 substrates. "
        )

    # Oral drug-likeness summary
    lipinski_flags = [f for f in p.flags if "Lipinski" in f.text]
    viol_flags = [f for f in lipinski_flags if "violation" in f.text.lower()]
    if not viol_flags and not any("MW" in f.text or "logp" in f.text.lower() for f in reds):
        parts.append("Physicochemical properties are consistent with oral drug-likeness. ")
    elif len(viol_flags) >= 2:
        parts.append(
            "Multiple physicochemical rule violations suggest poor oral bioavailability; "
            "alternative formulation or administration routes may be required. "
        )

    # Closing
    if p.overall in ("low", "medium"):
        parts.append(
            "Further in vitro and in vivo studies are recommended to confirm these computational predictions."
        )
    else:
        parts.append(
            "These computational predictions indicate that significant optimisation or "
            "further safety characterisation is required before advancing this compound."
        )

    return "".join(parts)


#                                                                                                                                                                                                                                           
# Public API
#                                                                                                                                                                                                                                           

def interpret(smiles, tools) :
    """
    smiles : SMILES string
    tools  : {tool_name: {category: [row_dicts]}}
    """
    p = MoleculeProfile(smiles=smiles)
    _check_stoptox(tools, p)
    _check_stoplight(tools, p)
    _check_protox(tools, p)  # Checks ADMETlab 3.0
    p.narrative = _narrative(p)
    return p

