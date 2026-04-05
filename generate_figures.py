"""
Generate publication-ready figures for SmileRender manuscript.
Outputs: figures/figure1_architecture.png, figure2_hub.png, figure3_benchmark.png
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.patheffects as pe
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np
import os

os.makedirs('figures', exist_ok=True)

NAVY   = '#0d1f3c'
BLUE   = '#005eb8'
TEAL   = '#007a6e'
PURPLE = '#7c3aed'
CYAN   = '#0891b2'
AMBER  = '#d97706'
PINK   = '#be185d'
GRAY   = '#64748b'
BG     = '#f4f6f9'
WHITE  = '#ffffff'
GREEN  = '#059669'
RED    = '#dc2626'

# ─────────────────────────────────────────────────────────────
# FIGURE 1 — System Architecture
# ─────────────────────────────────────────────────────────────
fig1, ax1 = plt.subplots(figsize=(14, 9))
ax1.set_xlim(0, 14)
ax1.set_ylim(0, 9)
ax1.axis('off')
fig1.patch.set_facecolor(WHITE)

def box(ax, x, y, w, h, color, label, sublabel=None, fontsize=10, radius=0.3):
    rect = FancyBboxPatch((x, y), w, h,
                          boxstyle=f"round,pad=0.05,rounding_size={radius}",
                          facecolor=color + '18', edgecolor=color, linewidth=1.5)
    ax.add_patch(rect)
    cy = y + h / 2 + (0.15 if sublabel else 0)
    ax.text(x + w/2, cy, label, ha='center', va='center',
            fontsize=fontsize, fontweight='bold', color=color)
    if sublabel:
        ax.text(x + w/2, cy - 0.32, sublabel, ha='center', va='center',
                fontsize=7.5, color=GRAY)

def arrow(ax, x1, y1, x2, y2, color=GRAY):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color, lw=1.4))

# Title
ax1.text(7, 8.6, 'SmileRender — System Architecture',
         ha='center', va='center', fontsize=14, fontweight='bold', color=NAVY)

# ── FRONTEND ──
box(ax1, 0.4, 6.2, 13.2, 1.8, BLUE, 'React 19 / TypeScript Frontend', 'Hub · 6 Tool Pages · Hash Routing · Error Boundaries', fontsize=11)
ax1.text(0.7, 7.85, 'FRONTEND', fontsize=7, color=BLUE, fontweight='bold', alpha=0.7)

# ── FLASK BACKEND ──
box(ax1, 0.4, 3.8, 5.8, 1.9, NAVY, 'Flask 3.0 Backend (Waitress)', '17 REST endpoints · Semaphore(2) · Security Headers', fontsize=10)
ax1.text(0.7, 5.55, 'BACKEND', fontsize=7, color=NAVY, fontweight='bold', alpha=0.7)

# ── REDIS CACHE ──
box(ax1, 6.8, 3.8, 2.8, 1.9, TEAL, 'Redis 7.4', 'Result Cache · 24h TTL\nMD5 keyed by SMILES', fontsize=9.5)

# ── CELERY WORKER ──
box(ax1, 10.2, 3.8, 3.4, 1.9, PURPLE, 'Celery Worker', 'Async batch rendering\nTask queue (optional)', fontsize=9.5)

# ── LOCAL TOOLS ──
box(ax1, 0.4, 1.1, 2.5, 2.2, CYAN, 'RDKit 2024.3', 'Rendering · Descriptors\nSimilarity · Reactions', fontsize=9)
box(ax1, 3.2, 1.1, 2.8, 2.2, AMBER, 'PubChem API', 'IUPAC · InChI\nInChIKey · MW', fontsize=9)

# ── EXTERNAL ADMET ──
external_tools = [
    (6.3, 'StopTox', 'UNC Chapel Hill'),
    (7.8, 'SwissADME', 'SIB Lausanne'),
    (9.3, 'StopLight', 'UNC Chapel Hill'),
    (10.8, 'pkCSM', 'Univ. Queensland'),
    (12.3, 'ADMETlab 3.0', 'SCBDD'),
]
for xi, name, inst in external_tools:
    box(ax1, xi, 1.1, 1.4, 2.2, PINK, name, inst, fontsize=8, radius=0.2)

ax1.text(9.8, 0.75, 'EXTERNAL ADMET SERVERS', fontsize=7.5, color=PINK,
         fontweight='bold', alpha=0.8, ha='center')
ax1.text(1.65, 0.75, 'LOCAL COMPUTATION', fontsize=7.5, color=CYAN,
         fontweight='bold', alpha=0.8, ha='center')

# Arrows: Frontend → Backend
arrow(ax1, 4.0, 6.2, 4.0, 5.7, BLUE)
ax1.text(4.3, 5.95, 'REST / Fetch', fontsize=7.5, color=BLUE)

# Backend → Redis
arrow(ax1, 6.2, 4.75, 6.8, 4.75, TEAL)
ax1.text(6.25, 4.95, 'cache', fontsize=7.5, color=TEAL)

# Backend → Celery
arrow(ax1, 6.2, 4.4, 10.2, 4.4, PURPLE)
ax1.text(7.8, 4.55, 'async tasks', fontsize=7.5, color=PURPLE)

# Backend → RDKit
arrow(ax1, 1.65, 3.8, 1.65, 3.3, CYAN)

# Backend → PubChem
arrow(ax1, 3.5, 3.8, 3.8, 3.3, AMBER)

# Backend → External ADMET
for xi, _, _ in external_tools:
    arrow(ax1, 5.5, 4.0, xi + 0.7, 3.3, PINK)

# Docker brace
rect_docker = FancyBboxPatch((0.2, 0.3), 13.6, 8.1,
                              boxstyle="round,pad=0.05,rounding_size=0.4",
                              facecolor='none', edgecolor='#ccddee',
                              linewidth=1.2, linestyle='--')
ax1.add_patch(rect_docker)
ax1.text(13.5, 8.2, 'Docker Compose', fontsize=8, color='#4a8abf',
         ha='right', va='bottom', style='italic')

plt.tight_layout(pad=0.2)
fig1.savefig('figures/figure1_architecture.png', dpi=300, bbox_inches='tight',
             facecolor=WHITE)
plt.close(fig1)
print('Figure 1 saved.')


# ─────────────────────────────────────────────────────────────
# FIGURE 2 — Hub Interface Mockup
# ─────────────────────────────────────────────────────────────
fig2, ax2 = plt.subplots(figsize=(14, 9))
ax2.set_xlim(0, 14)
ax2.set_ylim(0, 9)
ax2.axis('off')
fig2.patch.set_facecolor(BG)

# Header bar
header = FancyBboxPatch((0, 8.3), 14, 0.7,
                         boxstyle="round,pad=0,rounding_size=0",
                         facecolor=NAVY, edgecolor='none')
ax2.add_patch(header)
ax2.text(0.4, 8.65, 'SmileRender', fontsize=13, fontweight='bold',
         color=WHITE, va='center')
ax2.text(3.0, 8.65, 'Molecular Intelligence Platform',
         fontsize=8, color='#94a8c9', va='center')
for i, lbl in enumerate(['Structure Rendering', 'ADMET Prediction', 'Nomenclature']):
    ax2.text(6.5 + i*2.1, 8.65, lbl, fontsize=8, color='#94a8c9', va='center')

# Hero section
hero = FancyBboxPatch((0, 6.6), 14, 1.6,
                       boxstyle="round,pad=0,rounding_size=0",
                       facecolor=NAVY, edgecolor='none', zorder=1)
ax2.add_patch(hero)
ax2.text(7, 7.7, 'Molecular Intelligence Suite',
         ha='center', fontsize=16, fontweight='bold', color=WHITE, zorder=2)
ax2.text(7, 7.2, 'A unified platform for pharmaceutical research — structure visualization,\nADMET profiling, and chemical analysis in a single interface.',
         ha='center', fontsize=9, color='#94a8c9', va='center', zorder=2)

# Stats bar
stats_bg = FancyBboxPatch((0, 6.0), 14, 0.55,
                            boxstyle="round,pad=0,rounding_size=0",
                            facecolor=WHITE, edgecolor='#dde3ec', linewidth=0.8)
ax2.add_patch(stats_bg)
stats = [('5', 'Prediction Engines'), ('13+', 'Image Formats'),
         ('≤20', 'Batch Size'), ('XLSX · ZIP', 'Export Formats')]
for i, (val, lbl) in enumerate(stats):
    cx = 1.75 + i * 3.5
    ax2.text(cx, 6.37, val, ha='center', fontsize=12, fontweight='bold', color=BLUE)
    ax2.text(cx, 6.1, lbl, ha='center', fontsize=7.5, color=GRAY)

# Tool cards (2 rows x 3 cols)
tools = [
    ('A', 'Structure Rendering',    'RDKit · PNG/SVG · Batch CSV',  BLUE,   'bi-diagram-2'),
    ('B', 'ADMET Profiling',        'StopTox · SwissADME · pkCSM\nStopLight · ADMETlab 3.0', TEAL, 'bi-activity'),
    ('C', 'Chemical Nomenclature',  'IUPAC · InChI · InChIKey\nPubChem REST API', PURPLE, 'bi-tag'),
    ('D', 'Descriptor Calculator',  'MW · LogP · TPSA · QED\nLipinski Ro5 · 16 descriptors', CYAN, 'bi-grid-3x3'),
    ('E', 'Similarity Search',      'Morgan Fingerprints\nTanimoto · ECFP · Ranked', AMBER, 'bi-intersect'),
    ('F', 'Reaction Visualizer',    'SMILES R>>P format\nMulti-step · PNG export', PINK, 'bi-arrow-left-right'),
]

cols, rows = 3, 2
card_w, card_h = 4.2, 2.0
start_x, start_y = 0.4, 0.5
gap_x, gap_y = 0.45, 0.35

for idx, (letter, title, desc, color, _) in enumerate(tools):
    col = idx % cols
    row = idx // cols
    x = start_x + col * (card_w + gap_x)
    y = start_y + (rows - 1 - row) * (card_h + gap_y)

    card = FancyBboxPatch((x, y), card_w, card_h,
                           boxstyle="round,pad=0.05,rounding_size=0.2",
                           facecolor=WHITE, edgecolor='#dde3ec', linewidth=1.0)
    ax2.add_patch(card)

    # Color accent bar
    accent = FancyBboxPatch((x, y + card_h - 0.06), card_w, 0.06,
                             boxstyle="round,pad=0,rounding_size=0",
                             facecolor=color, edgecolor='none')
    ax2.add_patch(accent)

    # Icon circle
    circle = plt.Circle((x + 0.38, y + card_h - 0.45), 0.22,
                         color=color + '20', zorder=3)
    ax2.add_patch(circle)
    ax2.text(x + 0.38, y + card_h - 0.45, letter,
             ha='center', va='center', fontsize=9,
             fontweight='bold', color=color, zorder=4)

    ax2.text(x + 0.75, y + card_h - 0.42, title,
             fontsize=9.5, fontweight='bold', color=NAVY, va='center')
    ax2.text(x + 0.18, y + 0.55, desc,
             fontsize=8, color=GRAY, va='center', linespacing=1.5)
    ax2.text(x + card_w - 0.18, y + 0.22, 'Open tool →',
             fontsize=7.5, color=color, ha='right', fontweight='bold')

plt.tight_layout(pad=0)
fig2.savefig('figures/figure2_hub.png', dpi=300, bbox_inches='tight',
             facecolor=BG)
plt.close(fig2)
print('Figure 2 saved.')


# ─────────────────────────────────────────────────────────────
# FIGURE 3 — Benchmark Results
# ─────────────────────────────────────────────────────────────
drugs   = ['Aspirin', 'Ibuprofen', 'Caffeine', 'Metformin', 'Paracetamol']
tools_b = ['StopTox', 'SwissADME', 'StopLight', 'ADMETlab 3.0']
colors_b = [NAVY, BLUE, TEAL, AMBER]

data = {
    'StopTox':      [16.93, 16.17, 21.96, 15.20, 18.82],
    'SwissADME':    [5.81,  5.30,  5.19,  5.24,  4.54],
    'StopLight':    [3.00,  2.97,  2.98,  2.97,  2.97],
    'ADMETlab 3.0': [5.24,  4.60,  8.38,  4.47,  4.92],
}

fig3, axes = plt.subplots(1, 2, figsize=(14, 6),
                           gridspec_kw={'width_ratios': [2, 1]})
fig3.patch.set_facecolor(WHITE)

# ── Left panel: grouped bar chart per compound ──
ax3a = axes[0]
ax3a.set_facecolor(WHITE)
n_drugs, n_tools = len(drugs), len(tools_b)
x = np.arange(n_drugs)
width = 0.18
offsets = np.linspace(-(n_tools-1)/2, (n_tools-1)/2, n_tools) * width

for i, (tool, col) in enumerate(zip(tools_b, colors_b)):
    vals = data[tool]
    bars = ax3a.bar(x + offsets[i], vals, width,
                    label=tool, color=col, alpha=0.88,
                    edgecolor='white', linewidth=0.5)
    for bar, v in zip(bars, vals):
        ax3a.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.25,
                  f'{v:.1f}', ha='center', va='bottom',
                  fontsize=6.5, color=col, fontweight='bold')

ax3a.set_xticks(x)
ax3a.set_xticklabels(drugs, fontsize=10)
ax3a.set_ylabel('Response Time (seconds)', fontsize=11, color=GRAY)
ax3a.set_title('A   Response Time per Compound and Tool', fontsize=12,
               fontweight='bold', color=NAVY, loc='left', pad=10)
ax3a.legend(frameon=False, fontsize=9, loc='upper right')
ax3a.spines['top'].set_visible(False)
ax3a.spines['right'].set_visible(False)
ax3a.spines['left'].set_color('#dde3ec')
ax3a.spines['bottom'].set_color('#dde3ec')
ax3a.tick_params(colors=GRAY)
ax3a.yaxis.label.set_color(GRAY)
ax3a.set_ylim(0, 27)
ax3a.axhline(y=0, color='#dde3ec', linewidth=0.8)

# Means annotation
means = [np.mean(data[t]) for t in tools_b]
for i, (t, m, c) in enumerate(zip(tools_b, means, colors_b)):
    ax3a.axhline(y=m, color=c, linewidth=0.8, linestyle='--', alpha=0.45)

# ── Right panel: summary ──
ax3b = axes[1]
ax3b.set_facecolor(WHITE)
ax3b.spines['top'].set_visible(False)
ax3b.spines['right'].set_visible(False)
ax3b.spines['left'].set_color('#dde3ec')
ax3b.spines['bottom'].set_color('#dde3ec')

means_all   = [np.mean(data[t]) for t in tools_b]
stds_all    = [np.std(data[t])  for t in tools_b]
y_pos = np.arange(len(tools_b))

bars2 = ax3b.barh(y_pos, means_all, xerr=stds_all,
                   color=colors_b, alpha=0.88, height=0.55,
                   edgecolor='white', linewidth=0.5,
                   error_kw=dict(ecolor=GRAY, capsize=4, linewidth=1.2))

for i, (m, s) in enumerate(zip(means_all, stds_all)):
    ax3b.text(m + s + 0.3, i, f'{m:.2f} ± {s:.2f} s',
              va='center', fontsize=9, color=colors_b[i], fontweight='bold')

ax3b.set_yticks(y_pos)
ax3b.set_yticklabels(tools_b, fontsize=10)
ax3b.set_xlabel('Mean Response Time (s)', fontsize=10, color=GRAY)
ax3b.set_title('B   Mean ± SD per Tool', fontsize=12,
               fontweight='bold', color=NAVY, loc='left', pad=10)
ax3b.tick_params(colors=GRAY)
ax3b.set_xlim(0, 30)

# Inset: success rate pie
ax_inset = fig3.add_axes([0.72, 0.12, 0.18, 0.28])
ax_inset.pie([20, 5], labels=['Success\n20/25', 'Failed\n5/25'],
             colors=[GREEN, RED], startangle=90,
             textprops={'fontsize': 7.5, 'color': GRAY},
             wedgeprops={'linewidth': 1.5, 'edgecolor': WHITE})
ax_inset.set_title('Success Rate', fontsize=8, color=NAVY, fontweight='bold', pad=4)

fig3.suptitle('SmileRender Benchmark — 5 FDA-Approved Drugs × 5 ADMET Tools',
              fontsize=13, fontweight='bold', color=NAVY, y=1.01)
fig3.text(0.5, -0.02,
          'pkCSM excluded (empty responses in test environment; resolved in current release via session persistence fix)',
          ha='center', fontsize=8, color=GRAY, style='italic')

plt.tight_layout(pad=1.5)
fig3.savefig('figures/figure3_benchmark.png', dpi=300, bbox_inches='tight',
             facecolor=WHITE)
plt.close(fig3)
print('Figure 3 saved.')

print('\nAll figures saved to ./figures/')
