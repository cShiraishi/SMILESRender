
# Peptide specific utilities for SMILESRender
import math

# pKa values for amino acids (approximate, various sources)
PKA_VALUES = {
    "N-term": 9.6,
    "C-term": 2.1,
    "R": 12.48, # Arg
    "K": 10.53, # Lys
    "H": 6.0,   # His
    "D": 3.86,  # Asp
    "E": 4.25,  # Glu
    "C": 8.33,  # Cys
    "Y": 10.07  # Tyr
}

# Kyte-Doolittle Hydropathy values
HYDROPATHY = {
    'A': 1.8, 'R': -4.5, 'N': -3.5, 'D': -3.5, 'C': 2.5, 
    'Q': -3.5, 'E': -3.5, 'G': -0.4, 'H': -3.2, 'I': 4.5, 
    'L': 3.8, 'K': -3.9, 'M': 1.9, 'F': 2.8, 'P': -1.6, 
    'S': -0.8, 'T': -0.7, 'W': -0.9, 'Y': -1.3, 'V': 4.2
}

# Boman Index values (Solubility/Interaction potential)
BOMAN_VALUES = {
    'R': 6.58, 'K': 4.69, 'D': 3.66, 'E': 3.67, 'N': 2.05, 'Q': 1.75, 'P': 1.24,
    'H': 0.49, 'S': 0.46, 'T': 0.11, 'Y': -0.14, 'G': -0.94, 'C': -1.28, 'A': -1.81,
    'W': -2.33, 'M': -2.35, 'F': -2.98, 'V': -4.04, 'I': -4.92, 'L': -4.92
}

# Instability Index Dipeptide Weight Matrix (Guruprasad et al., 1990)
DIID_MATRIX = {
    'A': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': -7.49, 'C': 44.67, 'Q': 1.0, 'E': 1.0, 'G': 1.0, 'H': -7.49, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': 1.0, 'P': 20.26, 'S': 1.0, 'T': 1.0, 'W': 1.0, 'Y': 1.0, 'V': 1.0},
    'R': {'A': 1.0, 'R': 58.74, 'N': 1.0, 'D': 1.0, 'C': 1.0, 'Q': 1.0, 'E': 1.0, 'G': 1.0, 'H': 20.26, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': 1.0, 'P': 20.26, 'S': 1.0, 'T': 1.0, 'W': 58.74, 'Y': 1.0, 'V': 1.0},
    'N': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': 1.0, 'C': -1.37, 'Q': 1.0, 'E': 1.0, 'G': -7.49, 'H': 1.0, 'I': 44.67, 'L': 1.0, 'K': 24.68, 'M': 1.0, 'F': -14.03, 'P': -1.37, 'S': 1.0, 'T': 1.0, 'W': -14.03, 'Y': 1.0, 'V': 1.0},
    'D': {'A': 1.0, 'R': -7.49, 'N': 1.0, 'D': 1.0, 'C': 1.0, 'Q': 1.0, 'E': 1.0, 'G': 1.0, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': -7.49, 'M': 1.0, 'F': 1.0, 'P': 1.0, 'S': 20.26, 'T': 1.0, 'W': 1.0, 'Y': 1.0, 'V': 1.0},
    'C': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': 20.26, 'C': 1.0, 'Q': -6.54, 'E': 1.0, 'G': 1.0, 'H': 33.75, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 33.75, 'F': 1.0, 'P': 20.26, 'S': 1.0, 'T': 33.75, 'W': 24.68, 'Y': 1.0, 'V': -6.54},
    'Q': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': 1.0, 'C': -6.54, 'Q': 1.0, 'E': 20.26, 'G': 1.0, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': -6.54, 'P': 20.26, 'S': 1.0, 'T': 1.0, 'W': 1.0, 'Y': -6.54, 'V': -6.54},
    'E': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': 20.26, 'C': 44.67, 'Q': 20.26, 'E': 1.0, 'G': 1.0, 'H': -7.49, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': 1.0, 'P': 20.26, 'S': 20.26, 'T': 1.0, 'W': -14.03, 'Y': 1.0, 'V': 1.0},
    'G': {'A': -7.49, 'R': 1.0, 'N': -7.49, 'D': 1.0, 'C': 1.0, 'Q': 1.0, 'E': -7.49, 'G': 1.0, 'H': 1.0, 'I': -7.49, 'L': 1.0, 'K': -7.49, 'M': 1.0, 'F': 1.0, 'P': 1.0, 'S': 1.0, 'T': 1.0, 'W': 13.77, 'Y': -7.49, 'V': 1.0},
    'H': {'A': 1.0, 'R': 1.0, 'N': 24.68, 'D': 1.0, 'C': 1.0, 'Q': 1.0, 'E': 1.0, 'G': -9.22, 'H': 1.0, 'I': 44.67, 'L': 1.0, 'K': 24.68, 'M': 1.0, 'F': -9.22, 'P': -1.37, 'S': 1.0, 'T': -6.54, 'W': -1.37, 'Y': 44.67, 'V': 1.0},
    'I': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': 1.0, 'C': 1.0, 'Q': 1.0, 'E': 44.67, 'G': 1.0, 'H': 13.77, 'I': 1.0, 'L': 1.0, 'K': -7.49, 'M': 1.0, 'F': 1.0, 'P': -1.37, 'S': 1.0, 'T': 1.0, 'W': 1.0, 'Y': 1.0, 'V': -7.49},
    'L': {'A': 1.0, 'R': 20.26, 'N': 1.0, 'D': 1.0, 'C': 1.0, 'Q': 33.75, 'E': 1.0, 'G': 1.0, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': -7.49, 'M': 1.0, 'F': 1.0, 'P': 20.26, 'S': 1.0, 'T': 1.0, 'W': 24.68, 'Y': 1.0, 'V': 1.0},
    'K': {'A': 1.0, 'R': 33.75, 'N': 1.0, 'D': 1.0, 'C': 1.0, 'Q': 24.68, 'E': 1.0, 'G': -7.49, 'H': 1.0, 'I': -7.49, 'L': -7.49, 'K': 1.0, 'M': 33.75, 'F': 1.0, 'P': -6.54, 'S': 1.0, 'T': 1.0, 'W': 1.0, 'Y': 1.0, 'V': -7.49},
    'M': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': 1.0, 'C': 1.0, 'Q': -6.54, 'E': 1.0, 'G': 1.0, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': 1.0, 'P': 1.0, 'S': 1.0, 'T': 1.0, 'W': 1.0, 'Y': 24.68, 'V': 1.0},
    'F': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': 1.0, 'C': 1.0, 'Q': 1.0, 'E': 1.0, 'G': 1.0, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': 1.0, 'P': 20.26, 'S': 1.0, 'T': 1.0, 'W': 1.0, 'Y': 33.75, 'V': 1.0},
    'P': {'A': 20.26, 'R': -6.54, 'N': -1.37, 'D': -6.54, 'C': -6.54, 'Q': 20.26, 'E': 20.26, 'G': -6.54, 'H': 1.0, 'I': -1.37, 'L': 1.0, 'K': 1.0, 'M': -1.37, 'F': 20.26, 'S': 20.26, 'T': 1.0, 'W': -1.37, 'Y': 20.26, 'V': 20.26},
    'S': {'A': 1.0, 'R': 20.26, 'N': 1.0, 'D': 1.0, 'C': 33.75, 'Q': 1.0, 'E': 20.26, 'G': 1.0, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': 1.0, 'P': 44.67, 'S': 20.26, 'T': 1.0, 'W': 1.0, 'Y': 1.0, 'V': 1.0},
    'T': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': 1.0, 'C': 1.0, 'Q': 1.0, 'E': 20.26, 'G': 1.0, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': 13.77, 'P': 20.26, 'S': 1.0, 'T': 1.0, 'W': -14.03, 'Y': 1.0, 'V': 1.0},
    'W': {'A': -14.03, 'R': 1.0, 'N': 13.77, 'D': 1.0, 'C': 1.0, 'Q': 1.0, 'E': 1.0, 'G': -9.22, 'H': 24.68, 'I': 1.0, 'L': 13.77, 'K': 1.0, 'M': 24.68, 'F': 1.0, 'P': 1.0, 'S': 1.0, 'T': -14.03, 'W': 1.0, 'Y': 1.0, 'V': -14.03},
    'Y': {'A': 24.68, 'R': -6.54, 'N': 1.0, 'D': 24.68, 'C': 1.0, 'Q': 1.0, 'E': -6.54, 'G': -7.49, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': 1.0, 'M': 1.0, 'F': 1.0, 'P': 13.77, 'S': 1.0, 'T': 1.0, 'W': -14.03, 'Y': 13.77, 'V': 1.0},
    'V': {'A': 1.0, 'R': 1.0, 'N': 1.0, 'D': -7.49, 'C': 1.0, 'Q': 1.0, 'E': 1.0, 'G': -7.49, 'H': 1.0, 'I': 1.0, 'L': 1.0, 'K': -7.49, 'M': 1.0, 'F': 1.0, 'P': 20.26, 'S': 1.0, 'T': 1.0, 'W': 1.0, 'Y': -6.54, 'V': 1.0}
}

AA_NAMES = {
    'A': 'Alanine', 'R': 'Arginine', 'N': 'Asparagine', 'D': 'Aspartic Acid', 'C': 'Cysteine',
    'Q': 'Glutamine', 'E': 'Glutamic Acid', 'G': 'Glycine', 'H': 'Histidine', 'I': 'Isoleucine',
    'L': 'Leucine', 'K': 'Lysine', 'M': 'Methionine', 'F': 'Phenylalanine', 'P': 'Proline',
    'S': 'Serine', 'T': 'Threonine', 'W': 'Tryptophan', 'Y': 'Tyrosine', 'V': 'Valine'
}

def calculate_net_charge(sequence, ph):
    """Calculate net charge at a given pH."""
    charge = 0.0
    charge += 1.0 / (1.0 + 10**(ph - PKA_VALUES["N-term"]))
    charge -= 1.0 / (1.0 + 10**(PKA_VALUES["C-term"] - ph))
    for aa in sequence.upper():
        if aa in ["R", "K", "H"]: # Positive groups
            charge += 1.0 / (1.0 + 10**(ph - PKA_VALUES.get(aa, 7.0)))
        elif aa in ["D", "E", "C", "Y"]: # Negative groups
            charge -= 1.0 / (1.0 + 10**(PKA_VALUES.get(aa, 7.0) - ph))
    return charge

def calculate_pi(sequence):
    """Calculate isoelectric point (pI)."""
    low, high = 0.0, 14.0
    for _ in range(20):
        mid = (low + high) / 2
        if calculate_net_charge(sequence, mid) > 0: low = mid
        else: high = mid
    return round((low + high) / 2, 2)

def calculate_gravy(sequence):
    """Calculate Grand Average of Hydropathy."""
    vals = [HYDROPATHY.get(aa, 0) for aa in sequence.upper()]
    return round(sum(vals) / float(len(vals)), 2) if vals else 0.0

def calculate_boman(sequence):
    """Calculate Boman Index (potential protein-protein interaction)."""
    vals = [BOMAN_VALUES.get(aa, 0) for aa in sequence.upper()]
    return round(sum(vals) / float(len(vals)), 2) if vals else 0.0

def calculate_instability(sequence):
    """Calculate Instability Index (Guruprasad et al., 1990)."""
    seq = sequence.upper()
    if len(seq) < 2: return 0.0
    score = 0.0
    for i in range(len(seq) - 1):
        aa1, aa2 = seq[i], seq[i+1]
        score += DIID_MATRIX.get(aa1, {}).get(aa2, 1.0)
    return round((10.0 / float(len(seq))) * score, 2)

def calculate_aliphatic(sequence):
    """Calculate Aliphatic Index."""
    seq = sequence.upper()
    count = {aa: seq.count(aa) for aa in ['A', 'V', 'I', 'L']}
    total = len(seq)
    if total == 0: return 0.0
    idx = (count['A'] + 2.9 * count['V'] + 3.9 * (count['I'] + count['L'])) / float(total)
    return round(idx * 100, 2)

def generate_helical_wheel(sequence):
    """Generate Interactive SVG helical wheel projection."""
    seq = sequence.upper()[:18] 
    colors_map = {
        'R': '#ef4444', 'K': '#ef4444', 'H': '#ef4444', # Positive
        'D': '#3b82f6', 'E': '#3b82f6', # Negative
        'S': '#10b981', 'T': '#10b981', 'N': '#10b981', 'Q': '#10b981', 'Y': '#10b981', 'C': '#10b981', # Polar
    }
    
    svg = ['<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="animation: spinIn 1.5s cubic-bezier(0.34, 1.56, 0.64, 1);">']
    svg.append('<style>@keyframes spinIn { from { transform: rotate(-180deg) scale(0.5); opacity: 0; } to { transform: rotate(0) scale(1); opacity: 1; } } .node:hover { transform: scale(1.2); filter: drop-shadow(0 2px 5px rgba(0,0,0,0.2)); transition: 0.2s; cursor: pointer; }</style>')
    svg.append('<circle cx="100" cy="100" r="80" fill="none" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4"/>')
    
    positions = []
    for i, aa in enumerate(seq):
        angle = (i * 100) * (math.pi / 180.0)
        r = 65
        cx = 100 + r * math.sin(angle)
        cy = 100 - r * math.cos(angle)
        positions.append((cx, cy))

    # Draw connection lines first (so they stay behind circles)
    for i in range(len(positions) - 1):
        x1, y1 = positions[i]
        x2, y2 = positions[i+1]
        svg.append('<line x1="{0}" y1="{1}" x2="{2}" y2="{3}" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round"/>'.format(x1, y1, x2, y2))

    # Draw circles and text
    for i, aa in enumerate(seq):
        cx, cy = positions[i]
        color = colors_map.get(aa, '#64748b')
        name = AA_NAMES.get(aa, aa)
        
        svg.append('<g class="node" transform-origin="{0} {1}">'.format(cx, cy))
        svg.append('<title>{0} ({1})</title>'.format(name, i+1))
        svg.append('<circle cx="{0}" cy="{1}" r="12" fill="{2}" stroke="white" stroke-width="2"/>'.format(cx, cy, color))
        svg.append('<text x="{0}" y="{1}" dy=".3em" text-anchor="middle" fill="white" font-family="Arial" font-weight="bold" font-size="10">{2}</text>'.format(cx, cy, aa))
        svg.append('</g>')
        svg.append('<text x="{0}" y="{1}" text-anchor="middle" fill="{2}" font-family="Arial" font-size="5" font-weight="bold">{3}</text>'.format(cx, cy+18, color, i+1))

    svg.append('</svg>')
    return "".join(svg)

def analyze_stability(sequence):
    seq = sequence.upper()
    sites = []
    for i in range(len(seq) - 1):
        if seq[i] in ['K', 'R'] and seq[i+1] != 'P': sites.append({"pos": i+1, "residue": seq[i], "protease": "Trypsin"})
        if seq[i] in ['F', 'Y', 'W'] and seq[i+1] != 'P': sites.append({"pos": i+1, "residue": seq[i], "protease": "Chymotrypsin"})
    for i in range(len(seq)):
        if seq[i] in ['F', 'L', 'W', 'Y']: sites.append({"pos": i+1, "residue": seq[i], "protease": "Pepsin"})
    return sites

def get_peptide_metrics(sequence):
    if not sequence: return {}
    return {
        "pi": calculate_pi(sequence),
        "charge_74": round(calculate_net_charge(sequence, 7.4), 2),
        "charge_55": round(calculate_net_charge(sequence, 5.5), 2),
        "gravy": calculate_gravy(sequence),
        "boman": calculate_boman(sequence),
        "instability": calculate_instability(sequence),
        "aliphatic": calculate_aliphatic(sequence),
        "helical_wheel": generate_helical_wheel(sequence),
        "cleavage_sites": analyze_stability(sequence)
    }
