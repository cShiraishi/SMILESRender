# SmileRender

**Unified open-source cheminformatics platform for drug discovery research.**

[![CI](https://github.com/shiraishicarlos/smilesrender/actions/workflows/ci.yml/badge.svg)](https://github.com/shiraishicarlos/smilesrender/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://python.org)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker)](docker-compose.yaml)
[![Docs](https://img.shields.io/badge/docs-mkdocs-success)](https://shiraishicarlos.github.io/smilesrender)

SmileRender consolidates five independent prediction tools into a single web interface — eliminating the friction of switching between services in high-throughput screening workflows.

**Live instance:** https://smiles-render.onrender.com *(free tier — max 20 molecules/batch)*

---

## Features

| Tool | Input | Output |
|---|---|---|
| **Structure Rendering** | SMILES | 2D molecular images (PNG, SVG, PDF, 5 more) |
| **ADMET Profiling** | SMILES | Risk dashboard from 5 prediction engines |
| **Molecular Descriptors** | SMILES | 16 physicochemical properties + Lipinski Ro5 + QED |
| **Similarity Search** | Query vs library | Tanimoto-ranked results (Morgan fingerprints) |
| **IUPAC Nomenclature** | SMILES | IUPAC name, InChI, InChIKey |
| **Reaction Visualization** | Reaction SMILES | Annotated reaction diagram |
| **Peptide Engineering** | Amino acid sequence | SMILES + physicochemical metrics |
| **Molecular Docking** | PDB protein + SMILES | Docked poses + PLIP interaction analysis |

**ADMET engines integrated:** StopTox · SwissADME · StopLight · pkCSM · ADMETlab 3.0

---

## Quickstart

### Docker (recommended)

```bash
git clone https://github.com/shiraishicarlos/smilesrender.git
cd smilesrender
docker compose up
```

Open http://localhost:3000 — no further configuration needed.

### Local development

**Prerequisites:** Python ≥ 3.12, Bun ≥ 1.1, Git

```bash
git clone https://github.com/shiraishicarlos/smilesrender.git
cd smilesrender

# Python environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Frontend
bun install

# Environment (optional — defaults work for local dev)
cp .env.example .env

# Start
bun run start:dev
```

Health check: `curl http://localhost:3000/ping`

### API usage (Python)

```python
import httpx

base = "http://localhost:3000"

# Render a molecule
img = httpx.get(f"{base}/render/CC(=O)Oc1ccccc1C(=O)O").content
with open("aspirin.png", "wb") as f:
    f.write(img)

# Molecular descriptors
props = httpx.post(f"{base}/descriptors", json={"smiles": "c1ccccc1"}).json()
print(props)

# Batch similarity search
results = httpx.post(f"{base}/similarity", json={
    "query": "CC(=O)Oc1ccccc1C(=O)O",
    "library": ["c1ccccc1", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"],
}).json()
```

---

## Architecture

```
SmileRender
├── Backend  — Flask 3 + Waitress (Python 3.12)
│   ├── 40+ REST endpoints
│   ├── Celery + Redis (async batch jobs)
│   └── RDKit, PyTorch, scikit-learn
└── Frontend — React 19 + TypeScript (Bun)
    ├── 10 tool pages (hash router)
    ├── 30+ reusable components
    └── Web Workers for client-side parallelism
```

**Deployment options:**

| Option | Command | URL |
|---|---|---|
| Docker Compose | `docker compose up` | localhost:3000 |
| Render.com (free) | deploy button | smiles-render.onrender.com |
| Hostinger VPS | `./deploy_hostinger.sh` | your domain |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

**Quick path:**

1. [Search open issues](../../issues) or open a [bug report](../../issues/new?template=bug_report.yml) / [feature request](../../issues/new?template=feature_request.yml)
2. Fork → branch → PR against `develop`
3. CI must pass (`ruff` + `pytest` + frontend build)

---

## Citation

If you use SmileRender in your research, please cite:

```bibtex
@software{shiraishicarlos_smilesrender_2025,
  author    = {Shiraishi, Carlos Seiti},
  title     = {{SmileRender}: A Unified Open-Source Cheminformatics Platform},
  year      = {2025},
  url       = {https://github.com/shiraishicarlos/smilesrender},
  license   = {MIT}
}
```

See [CITATION.cff](CITATION.cff) for more formats.

---

## License

[MIT](LICENSE) © Carlos Seiti Shiraishi
