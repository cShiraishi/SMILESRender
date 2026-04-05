# SmileRender — User & Developer Documentation

> **Version:** 2.0 · **License:** MIT · **Repository:** https://github.com/rubithedev/smiles-render-web

---

## Table of Contents

1. [Overview](#1-overview)
2. [Quick Start — Web Version](#2-quick-start--web-version)
3. [Available Tools](#3-available-tools)
4. [Local Installation](#4-local-installation)
5. [Docker Deployment (Recommended)](#5-docker-deployment-recommended)
6. [Manual Installation](#6-manual-installation)
7. [Configuration](#7-configuration)
8. [API Reference](#8-api-reference)
9. [Architecture Overview](#9-architecture-overview)
10. [Troubleshooting](#10-troubleshooting)
11. [Contributing](#11-contributing)

---

## 1. Overview

**SmileRender** is an open-source web platform for molecular cheminformatics, designed for pharmaceutical researchers, medicinal chemists, and computational biologists. It consolidates six independent tools into a single interface:

| Tool | Description |
|---|---|
| Structure Rendering | SMILES → high-quality 2D images (RDKit) |
| ADMET Profiling | 5-engine prediction suite |
| Descriptor Calculator | 16 physicochemical descriptors + Lipinski Ro5 + QED |
| Similarity Search | Morgan fingerprint Tanimoto ranking |
| Chemical Nomenclature | SMILES → IUPAC name / InChI / InChIKey (PubChem) |
| Reaction Visualizer | Reaction SMILES → annotated PNG |

**No registration required.** The public instance at https://smiles-render.onrender.com is free to use for up to 20 molecules per batch. For large-scale screening (hundreds of molecules), local Docker deployment is recommended.

---

## 2. Quick Start — Web Version

### Step 1 — Open the platform
Go to **https://smiles-render.onrender.com**

The hub page displays all available tools as interactive cards.

### Step 2 — Choose a tool
Click any card to open the tool in full-screen view. Use the **← All Tools** button to return to the hub at any time.

### Step 3 — Enter SMILES
All tools accept SMILES (Simplified Molecular Input Line Entry System) strings as input. Example SMILES for common drugs:

| Drug | SMILES |
|---|---|
| Aspirin | `CC(=O)Oc1ccccc1C(=O)O` |
| Ibuprofen | `CC(C)Cc1ccc(cc1)C(C)C(=O)O` |
| Caffeine | `Cn1c(=O)c2c(ncn2C)n(c1=O)C` |
| Paracetamol | `CC(=O)Nc1ccc(O)cc1` |
| Atorvastatin | `CC(C)c1n(CC(O)CC(O)CC(=O)O)c(C(C)C)c(c1-c1ccc(F)cc1)c1ccccc1C(=O)Nc1ccc(cc1)F` |

> SMILES strings can be obtained from PubChem (https://pubchem.ncbi.nlm.nih.gov), ChemSpider, or ChEMBL.

### Step 4 — Export results
- **Structure Rendering:** download individual PNG or full ZIP archive
- **ADMET Profiling:** export all results as `.xlsx` (available when all tools complete)
- **Descriptor Calculator:** export as CSV
- **Nomenclature:** copy as TSV

---

## 3. Available Tools

### 3.1 Structure Rendering

Converts SMILES to 2D molecular structure images using RDKit.

**Direct Input**
1. Enter one SMILES per line (max 20)
2. Click **Render** to preview images in the browser
3. Click **Download ZIP** to download all images as a ZIP archive

**CSV Upload**
1. Upload a `.csv` file containing a SMILES column
2. Select the SMILES column and (optionally) a molecule name column
3. Choose image format (PNG, JPEG, WEBP, etc.)
4. Click **Render** or **Download ZIP**

Supported output formats: `PNG`, `JPEG`, `WEBP`, `TIFF`, `BMP`, `GIF`, `ICO`, `EPS`

---

### 3.2 ADMET Profiling

Runs predictions across five external engines simultaneously:

| Engine | Provider | Properties |
|---|---|---|
| **StopTox** | UNC Chapel Hill | Acute oral/dermal/inhalation toxicity, eye irritation, skin sensitization, aquatic toxicity |
| **SwissADME** | SIB Lausanne | Physicochemical properties, lipophilicity, water solubility, pharmacokinetics, druglikeness |
| **StopLight** | UNC Chapel Hill | Multi-parameter optimization (MPO) scores for 11 molecular properties |
| **pkCSM** | Univ. Queensland | Full ADMET profile: absorption, distribution, metabolism, excretion, toxicity |
| **ADMETlab 3.0** | SCBDD | Comprehensive ADMET with 50+ endpoints |

**Usage:**
1. Enter SMILES (one per line, max 20) and click **Run All Predictions**
2. Switch to the **Results** tab — each tool loads independently
3. Progress bar shows completion percentage (5 tools × N molecules)
4. When 100% complete, click **Export to Excel** to download the `.xlsx` report

**Excel report structure:**
- Sheet 1 — **SMILES Comparison:** pivoted table, one compound per row, one tool–property per column
- Sheet 2 — **All Detailed Data:** flat record per property result

> Note: Average processing time is ~36 seconds per compound across all five tools.

---

### 3.3 Descriptor Calculator

Calculates 16 physicochemical descriptors locally using RDKit (no external API dependency).

| Descriptor | Description |
|---|---|
| MW | Average Molecular Weight (Da) |
| Exact MW | Monoisotopic Molecular Weight |
| LogP | Lipophilicity (Crippen method) |
| TPSA | Topological Polar Surface Area (Å²) |
| HBD | Hydrogen Bond Donors |
| HBA | Hydrogen Bond Acceptors |
| RotBonds | Rotatable Bond Count |
| ArRings | Aromatic Ring Count |
| HeavyAtoms | Heavy Atom Count |
| Rings | Total Ring Count |
| Fsp3 | Fraction of sp³ Carbons |
| QED | Quantitative Estimate of Drug-likeness (0–1) |
| Lipinski Ro5 | Number of Rule-of-Five violations (0–4) |

**Color coding:**
- QED ≥ 0.6 → green (drug-like) · 0.4–0.6 → amber · < 0.4 → red
- Ro5 = 0 → green · 1 → amber · ≥ 2 → red

Results can be viewed as a **Table** (all compounds side-by-side) or **Cards** (one card per compound). Export as CSV with one click.

---

### 3.4 Similarity Search

Computes Tanimoto similarity between a reference compound and a query library using Morgan fingerprints (circular fingerprints equivalent to ECFP).

**Usage:**
1. Enter the **reference SMILES** in the top input
2. Enter the **query library** (one SMILES per line) in the right panel
3. Adjust the **Morgan radius** (1 = broad; 2 = ECFP4 standard; 4 = specific)
4. Click **Compute Tanimoto Similarity**

Results are automatically ranked from most to least similar. Color coding:
- ≥ 70% → green (high similarity)
- 40–69% → amber (moderate)
- < 40% → gray (low)

---

### 3.5 Chemical Nomenclature

Converts SMILES to systematic chemical names via the PubChem REST API.

**Returns per compound:**
- IUPAC systematic name
- Molecular Formula
- Molecular Weight (g/mol)
- InChI
- InChIKey

**Usage:**
1. Enter one SMILES per line
2. Click **Convert**
3. Results appear as cards; click **Copy as TSV** to copy a tab-separated table to clipboard

> Requires internet connectivity. Works best for known compounds present in PubChem (~115 million compounds). Novel/proprietary structures may return "Not found".

---

### 3.6 Reaction Visualizer

Renders chemical reactions from SMILES notation.

**Format:** `reactants>>products`  
**Multiple reactants/products:** separate with `.`  
**Example:** `OC(=O)c1ccccc1O.CC(=O)O>>CC(=O)Oc1ccccc1C(=O)O`  (Aspirin synthesis)

Pre-loaded examples: Aspirin synthesis, Esterification, Diels-Alder, Amide bond formation.

Click **Download PNG** to save the rendered image.

---

## 4. Local Installation

Local deployment is recommended when:
- Processing > 20 molecules per batch
- Running automated pipelines
- Working offline / in a secure network
- Benchmarking or research reproducibility

### Prerequisites

| Software | Version | Download |
|---|---|---|
| Docker Desktop | ≥ 4.x | https://www.docker.com/products/docker-desktop |
| Git | any | https://git-scm.com |

> Docker is the simplest and most reliable installation method. Manual installation (Python + Bun) is described in Section 6.

---

## 5. Docker Deployment (Recommended)

### Step 1 — Clone the repository

```bash
git clone https://github.com/rubithedev/smiles-render-web.git
cd smiles-render-web
```

### Step 2 — Create environment file

```bash
cp .env.example .env
```

The default `.env` contains:
```
PORT=3000
```

No additional configuration is required for local use.

### Step 3 — Build and start

```bash
docker compose up --build
```

This command:
1. Builds the frontend (Bun compiles React/TypeScript)
2. Builds the Python backend (installs RDKit, Flask, Celery, etc.)
3. Starts Redis 7.4
4. Starts the web server on port 3000
5. Starts the Celery worker for async batch tasks

> First build takes 5–10 minutes (RDKit is a large package). Subsequent starts are instant.

### Step 4 — Open the platform

```
http://localhost:3000
```

### Step 5 — Stop the platform

```bash
docker compose down
```

To also remove cached data:
```bash
docker compose down -v
```

### Docker services

| Service | Container | Port | Role |
|---|---|---|---|
| `smiles-render-web` | Web application | 3000 | Flask backend + static frontend |
| `smiles-render-redis` | Redis cache | 6379 | Result cache + Celery broker |
| `smiles-render-worker` | Celery worker | — | Async batch rendering |

---

## 6. Manual Installation

Use this method if Docker is not available.

### Requirements

| Software | Version |
|---|---|
| Python | ≥ 3.12 |
| Bun | ≥ 1.1 (or Node.js ≥ 18 + npm) |
| Redis | ≥ 7 (optional, for caching) |

### Step 1 — Clone

```bash
git clone https://github.com/rubithedev/smiles-render-web.git
cd smiles-render-web
```

### Step 2 — Install Python dependencies

```bash
pip install -r requirements.txt
```

Key packages: `flask`, `rdkit`, `celery`, `redis`, `pandas`, `openpyxl`, `waitress`, `pillow`

### Step 3 — Install frontend dependencies and build

**With Bun:**
```bash
bun install
bun run build
```

**With Node.js/npm (alternative):**
```bash
npm install -g bun
bun install
bun run build
```

### Step 4 — Create environment file

```bash
cp .env.example .env
# Edit .env if needed (default PORT=3000)
```

### Step 5 — Start the server

```bash
python src/main.py
```

Open `http://localhost:3000`

### Step 6 — (Optional) Start Redis and Celery worker

For caching and async batch operations:

```bash
# Terminal 1 — Redis
redis-server

# Terminal 2 — Celery worker
celery -A src.tasks worker --loglevel=info --pool=solo
```

---

## 7. Configuration

All configuration is managed via the `.env` file in the project root.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port for the web server |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |

The application degrades gracefully if Redis is unavailable — predictions still work, but results are not cached between sessions.

**Limits (hardcoded):**

| Parameter | Value | Location |
|---|---|---|
| Max SMILES per batch | 20 | `src/routes.py:MAX_SMILES` |
| Max concurrent heavy ops | 2 | `src/routes.py:Semaphore(2)` |
| Prediction timeout | 120s (StopTox/SwissADME) / 60s (others) | `src/routes.py` |
| Cache TTL | 24 hours | `src/routes.py:_cache_set` |

To increase limits for local deployment, edit `src/routes.py`:
```python
MAX_SMILES = 100          # increase batch limit
processing_semaphore = threading.Semaphore(8)  # increase concurrency
```

---

## 8. API Reference

SmileRender exposes a REST API. All endpoints are available at `http://localhost:3000`.

### Health Check

```
GET /ping
→ 200 "pong"
```

### Structure Rendering

```
POST /render
Content-Type: application/json
Body: {"smiles": ["CCO", "c1ccccc1"], "format": "png"}
→ 200 application/zip

GET /render/base64/<base64_smiles>?format=png
→ 200 image/png
```

### ADMET Prediction

```
GET /predict/base64/<base64_smiles>
→ 200 text/html  (StopTox response)

GET /predict/swissadme/base64/<base64_smiles>
→ 200 text/html  (SwissADME response)

GET /predict/stoplight/base64/<base64_smiles>
→ 200 application/json  (StopLight response)

GET /predict/pkcsm/base64/<base64_smiles>
→ 200 application/json  {"result_url": "...", "smiles_hash": "..."}

POST /predict/pkcsm/fetch
Body: {"url": "...", "smiles_hash": "..."}
→ 200 text/html  (pkCSM results page)

GET /predict/admetlab/base64/<base64_smiles>
→ 200 text/html  (ADMETlab response)
```

### Descriptor Calculator

```
POST /descriptors
Content-Type: application/json
Body: {"smiles": ["CCO", "c1ccccc1"]}
→ 200 application/json
[
  {
    "smiles": "CCO",
    "MolecularWeight": 46.068,
    "LogP": -0.001,
    "TPSA": 20.23,
    "HBD": 1,
    "HBA": 1,
    "QED": 0.4,
    "LipinskiViolations": 0,
    ...
  }
]
```

### Similarity Search

```
POST /similarity
Content-Type: application/json
Body: {
  "reference": "CC(=O)Oc1ccccc1C(=O)O",
  "smiles": ["CCO", "c1ccccc1"],
  "radius": 2,
  "nbits": 2048
}
→ 200 application/json
[{"smiles": "...", "tanimoto": 0.142}, ...]  (sorted by tanimoto desc)
```

### Chemical Nomenclature

```
POST /convert/iupac
Content-Type: application/json
Body: {"smiles": "CC(=O)Oc1ccccc1C(=O)O"}
→ 200 application/json  (PubChem PropertyTable)
```

### Reaction Rendering

```
POST /render/reaction
Content-Type: application/json
Body: {"smarts": "OC(=O)c1ccccc1O.CC(=O)O>>CC(=O)Oc1ccccc1C(=O)O"}
→ 200 image/png
```

### Excel Export

```
POST /export/excel
Content-Type: application/json
Body: [{"SMILES": "...", "Tool": "StopTox", "Category": "...", "Property": "...", "Value": "...", "Unit": "..."}, ...]
→ 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

### SMILES Encoding

All `/base64/` endpoints expect the SMILES encoded as **URL-safe Base64**:

```python
# Python
from base64 import b64encode
import urllib.parse
smiles = "CC(=O)Oc1ccccc1C(=O)O"
encoded = urllib.parse.quote(b64encode(smiles.encode()).decode())
url = f"http://localhost:3000/predict/base64/{encoded}"
```

```javascript
// JavaScript
const encoded = encodeURIComponent(btoa(smiles));
const url = `/predict/base64/${encoded}`;
```

---

## 9. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              React 19 / TypeScript SPA                   │
│   Hub · 6 Tool Pages · Hash Routing (#renderer, etc.)   │
│   ToolErrorBoundary per tool · Web Worker (StopTox)     │
└──────────────────────┬──────────────────────────────────┘
                       │ fetch() REST
┌──────────────────────▼──────────────────────────────────┐
│            Flask 3.0 + Waitress (os.cpu_count threads)   │
│   17 endpoints · Semaphore(2) · Security Headers (CSP)  │
│   Redis cache (MD5 key, 24h TTL)                        │
└──────┬───────────────┬──────────────────┬───────────────┘
       │               │                  │
  ┌────▼────┐    ┌──────▼──────┐   ┌──────▼──────────────┐
  │  RDKit   │    │  PubChem    │   │  External ADMET APIs │
  │ Render   │    │  REST API   │   │  StopTox · SwissADME │
  │ Descr.   │    │  IUPAC/InChI│   │  StopLight · pkCSM  │
  │ Simil.   │    └─────────────┘   │  ADMETlab 3.0        │
  │ Reaction │                      └─────────────────────┘
  └──────────┘
       │
  ┌────▼──────────────────────────────────┐
  │  Redis 7.4 + Celery Worker (optional) │
  │  Result cache · Async batch tasks     │
  └───────────────────────────────────────┘
```

**Project structure:**
```
smiles-render-web/
├── src/
│   ├── main.py              # Entry point (Waitress server)
│   ├── routes.py            # All API endpoints (449 lines)
│   ├── converter.py         # SMILES → image (RDKit)
│   ├── tools.py             # CSV parsing utilities
│   ├── tasks.py             # Celery task definitions
│   ├── templates/
│   │   └── index.html       # SPA entry point
│   ├── static/
│   │   ├── build/index.js   # Compiled frontend (Bun output)
│   │   ├── logo.png
│   │   ├── global.css
│   │   └── reset.css
│   └── frontend/
│       ├── App.tsx           # Root + hash router
│       ├── pages/            # Hub, RendererPage, PredictPage,
│       │                     # IupacPage, DescriptorsPage,
│       │                     # SimilarityPage, ReactionPage
│       ├── forms/            # DirectInput, ConvertFromCsv,
│       │                     # PredictWithStopTox
│       ├── components/       # Header, Footer, SmilesCard,
│       │                     # Section, PageShell, ToolErrorBoundary
│       ├── styles/themes.ts  # Design system (colors, fonts)
│       ├── tools/            # csv.ts, helpers.ts
│       └── workers/          # prediction.worker.ts
├── Dockerfile
├── docker-compose.yaml
├── requirements.txt
├── package.json
└── .env.example
```

---

## 10. Troubleshooting

### Server not starting

```
Error: Address already in use
```
Another process is using port 3000. Change the port in `.env`:
```
PORT=3001
```

### RDKit import error

```
ImportError: No module named 'rdkit'
```
RDKit requires Python 3.12. Install via pip:
```bash
pip install rdkit==2024.3.6
```

### Redis connection refused

The application runs without Redis — predictions work, results are not cached. To start Redis manually:
```bash
# Windows (Docker)
docker run -d -p 6379:6379 redis:7.4-alpine

# Linux/Mac
redis-server
```

### pkCSM returns empty results

pkCSM uses session cookies. The issue is resolved in the current version. If it persists, it may indicate that the pkCSM server (biosig.lab.uq.edu.au) is temporarily unavailable. Check https://biosig.lab.uq.edu.au/pkcsm directly.

### Bun not found

Install Bun via npm:
```bash
npm install -g bun
```

Or via official installer (Windows PowerShell):
```powershell
irm bun.sh/install.ps1 | iex
```

### Docker build fails (memory)

RDKit compilation requires ~4 GB RAM. In Docker Desktop settings, increase memory allocation to ≥ 6 GB.

### Prediction timeout

External APIs may be slow during peak hours. Default timeouts:
- StopTox / SwissADME: 120 seconds
- StopLight / pkCSM / ADMETlab: 60 seconds

To increase, edit `src/routes.py` and restart.

---

## 11. Contributing

Contributions are welcome. To add a new tool to the platform:

**Backend** — add endpoint in `src/routes.py`:
```python
@app.route("/your-tool/base64/<string:smiles>", methods=["GET"])
def your_tool(smiles: str):
    decoded = b64decode(smiles.encode()).decode()
    cache_key = f"smilerender:yourtool:{hashlib.md5(decoded.encode()).hexdigest()}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    # ... fetch or compute results
    _cache_set(cache_key, result)
    return result
```

**Frontend** — create `src/frontend/pages/YourToolPage.tsx`:
```tsx
import PageShell from '../components/PageShell';
function YourToolPage({ onBack }) {
  return (
    <PageShell icon="bi-..." title="Your Tool" accentColor="#..." onBack={onBack}>
      {/* your UI */}
    </PageShell>
  );
}
```

**Register** in `src/frontend/pages/Hub.tsx` (add to `apps` array) and `src/frontend/App.tsx` (add to routing).

### Running locally for development

```bash
# Terminal 1 — Backend (auto-reload not built-in; restart manually after changes)
python src/main.py

# Terminal 2 — Frontend rebuild
bun run build
# Then refresh browser
```

---

*SmileRender is open-source under the MIT License. For bug reports and feature requests, open an issue at https://github.com/rubithedev/smiles-render-web/issues*
