"""
Rule-based ADMET interpretation engine.
Takes organised data (smiles → tool → category → rows) and returns
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
    flags: list[Flag] = field(default_factory=list)
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


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _find(tools: dict, tool: str, *keywords: str) -> str | None:
    """Return first Value whose Property contains ALL keywords (case-insensitive)."""
    for cat_rows in tools.get(tool, {}).values():
        for row in cat_rows:
            prop = row.get("Property", "").lower()
            if all(kw.lower() in prop for kw in keywords):
                return str(row.get("Value", "")).strip()
    return None


def _num(val: str | None) -> float | None:
    if val is None:
        return None
    import re
    m = re.search(r"[-+]?\d*\.?\d+", val.replace(",", "."))
    return float(m.group()) if m else None


def _yes(val: str | None) -> bool | None:
    if val is None:
        return None
    v = val.strip().lower()
    if v in ("yes", "true", "positive", "1", "active"):
        return True
    if v in ("no", "false", "negative", "0", "inactive"):
        return False
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Per-tool rule sets
# ──────────────────────────────────────────────────────────────────────────────

def _check_stoptox(tools: dict, p: MoleculeProfile):
    # StopTox stores data with Category = "Toxicity", Property = column header
    for cat_rows in tools.get("StopTox", {}).values():
        for row in cat_rows:
            prop = row.get("Property", "").lower()
            val  = str(row.get("Value", ""))
            n    = _num(val)

            if "oral" in prop and n is not None:
                if n < 50:
                    p.add(Flag("critical", "StopTox",
                               f"Oral LD50 {n} mg/kg — extremely/very toxic (GHS Class 1-2)"))
                elif n < 300:
                    p.add(Flag("high", "StopTox",
                               f"Oral LD50 {n} mg/kg — toxic (GHS Class 3)"))
                elif n < 2000:
                    p.add(Flag("medium", "StopTox",
                               f"Oral LD50 {n} mg/kg — harmful (GHS Class 4)"))
                else:
                    p.add(Flag("low", "StopTox",
                               f"Oral LD50 {n} mg/kg — low acute oral toxicity"))

            elif "dermal" in prop and n is not None:
                if n < 50:
                    p.add(Flag("critical", "StopTox",
                               f"Dermal LD50 {n} mg/kg — critically toxic via skin"))
                elif n < 300:
                    p.add(Flag("high", "StopTox",
                               f"Dermal LD50 {n} mg/kg — toxic via skin contact"))

            elif "inhal" in prop and n is not None:
                if n < 0.5:
                    p.add(Flag("critical", "StopTox",
                               f"Inhalation LC50 {n} mg/L — extremely toxic by inhalation"))
                elif n < 2:
                    p.add(Flag("high", "StopTox",
                               f"Inhalation LC50 {n} mg/L — toxic by inhalation"))


def _check_stoplight(tools: dict, p: MoleculeProfile):
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
            p.add(Flag("medium", "StopLight", f"MW {mw:.1f} Da > 500 Da (Lipinski violation)"))
        else:
            p.add(Flag("low", "StopLight", f"MW {mw:.1f} Da — within Lipinski range"))

    if logp is not None:
        if logp > 5:
            violations += 1
            p.add(Flag("medium", "StopLight", f"ALogP {logp:.2f} > 5 (Lipinski violation, lipophilicity concern)"))
        elif logp > 3.5:
            p.add(Flag("low", "StopLight", f"ALogP {logp:.2f} — acceptable lipophilicity"))
        else:
            p.add(Flag("low", "StopLight", f"ALogP {logp:.2f} — good lipophilicity"))

    if tpsa is not None:
        if tpsa > 140:
            p.add(Flag("high", "StopLight",
                       f"TPSA {tpsa:.1f} A2 > 140 A2 — poor oral absorption predicted"))
        elif tpsa > 90:
            p.add(Flag("medium", "StopLight",
                       f"TPSA {tpsa:.1f} A2 — moderate absorption (90-140 A2)"))
        else:
            p.add(Flag("low", "StopLight", f"TPSA {tpsa:.1f} A2 — good oral absorption profile"))

    if hbd is not None and hbd > 5:
        violations += 1
        p.add(Flag("medium", "StopLight", f"HBD {int(hbd)} > 5 (Lipinski violation)"))
    if hba is not None and hba > 10:
        violations += 1
        p.add(Flag("medium", "StopLight", f"HBA {int(hba)} > 10 (Lipinski violation)"))
    if rotb is not None and rotb > 10:
        p.add(Flag("medium", "StopLight",
                   f"{int(rotb)} rotatable bonds > 10 — reduced oral bioavailability (Veber)"))

    if sol is not None:
        if sol < 0.01:
            p.add(Flag("high", "StopLight", f"Water solubility {sol} mg/L — very low (BCS Class II/IV risk)"))
        elif sol < 1:
            p.add(Flag("medium", "StopLight", f"Water solubility {sol} mg/L — low solubility"))
        else:
            p.add(Flag("low", "StopLight", f"Water solubility {sol} mg/L — adequate"))

    if violations >= 2:
        p.add(Flag("high", "StopLight",
                   f"{violations} Lipinski Rule of 5 violations — poor oral drug-likeness likely"))
    elif violations == 1:
        p.add(Flag("medium", "StopLight",
                   f"1 Lipinski Rule of 5 violation — borderline oral drug-likeness"))
    elif violations == 0 and mw is not None:
        p.add(Flag("low", "StopLight", "Passes Lipinski Rule of 5 — good oral drug-likeness"))


def _check_protox(tools: dict, p: MoleculeProfile):
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


# ──────────────────────────────────────────────────────────────────────────────
# Narrative generator
# ──────────────────────────────────────────────────────────────────────────────

def _narrative(p: MoleculeProfile) -> str:
    reds    = p.red_flags()
    yellows = p.yellow_flags()

    parts = []

    if not p.flags:
        return "Insufficient data to generate an interpretation. Ensure all tools completed successfully."

    if p.overall == "critical":
        parts.append(
            f"This molecule presents critical safety concerns that warrant immediate attention. "
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
        parts.append(f"Critical findings include: {issues}. ")

    # High flags (non-critical)
    high_only = [f for f in reds if f.level == "high"]
    if high_only:
        tops = "; ".join(f.text for f in high_only[:3])
        parts.append(f"Notable high-risk findings: {tops}. ")

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


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def interpret(smiles: str, tools: dict) -> MoleculeProfile:
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
