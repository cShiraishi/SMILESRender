# Changelog

All notable changes to SmileRender are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- `pyproject.toml` with Hatchling build backend, Ruff linter, and pytest configuration
- `.pre-commit-config.yaml` with Ruff, mypy, and Commitizen hooks
- GitHub Actions CI pipeline (lint → test → frontend build → Docker)
- GitHub release workflow with GHCR Docker image publishing
- Issue templates: Bug Report and Feature Request (YAML-based forms)
- Pull Request template
- `CONTRIBUTING.md` with full development guide
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- `CITATION.cff` for academic citation
- `mkdocs.yml` with Material theme for documentation site
- Initial test suite: `tests/test_api.py`, `tests/test_converter.py`

---

## [2.0.0] — 2025-01-01

### Added
- Molecular Docking suite (AutoDock Vina + PLIP + MEEKO)
- Peptide Engineering page (PepLink integration)
- ADMETlab 3.0 integration
- Web Workers for client-side parallelism
- Celery + Redis async task queue for batch jobs
- Admin panel with telemetry and request stats
- Blood-Brain Barrier (BBB) prediction model
- Tox21 toxicity model (local PyTorch)

### Changed
- Frontend migrated to React 19 + TypeScript
- Build system migrated from Webpack to Bun
- Server migrated from Flask dev server to Waitress (production-grade)

---

## [1.0.0] — 2024-01-01

### Added
- Structure rendering (SMILES → PNG, 8 formats)
- ADMET profiling: StopTox, SwissADME, StopLight, pkCSM
- Molecular descriptors (16 properties + Lipinski Ro5)
- Similarity search (Morgan fingerprints, Tanimoto)
- IUPAC nomenclature converter (PubChem API)
- Reaction SMILES visualization
- CSV batch processing with ZIP/XLSX export
- Docker Compose deployment
- Render.com public instance

[Unreleased]: https://github.com/shiraishicarlos/smilesrender/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/shiraishicarlos/smilesrender/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/shiraishicarlos/smilesrender/releases/tag/v1.0.0
