# Contributing to SmileRender

Thank you for your interest in contributing! SmileRender is an open-source cheminformatics platform built by and for researchers. Every contribution — code, docs, bug reports, or new molecules for testing — helps the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Commit Style](#commit-style)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

---

## Ways to Contribute

| Type | How |
|---|---|
| **Bug report** | [Open a Bug Report issue](../../issues/new?template=bug_report.yml) |
| **Feature request** | [Open a Feature Request issue](../../issues/new?template=feature_request.yml) |
| **Fix a bug** | Comment on the issue, fork the repo, open a PR |
| **Add a prediction engine** | Discuss in Issues first, then implement |
| **Improve docs** | Edit files in `docs/` or fix docstrings in `src/` |
| **Add test molecules** | Add to `tests/fixtures/` with expected output |

---

## Development Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | ≥ 3.12 | [python.org](https://python.org) |
| Bun | ≥ 1.1 | `curl -fsSL https://bun.sh/install \| bash` |
| Docker | ≥ 24 | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Git | any | [git-scm.com](https://git-scm.com) |

### 1 — Clone and install

```bash
git clone https://github.com/shiraishicarlos/smilesrender.git
cd smilesrender

# Python environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Core + dev dependencies (no heavy ML by default)
pip install -e ".[dev]"

# Frontend
bun install

# Pre-commit hooks
pre-commit install
pre-commit install --hook-type commit-msg
```

### 2 — Environment

```bash
cp .env.example .env
# Edit .env — all fields are optional for local dev
```

### 3 — Run

```bash
# Full stack (recommended)
docker compose up

# Dev mode — hot-reload frontend + Python server
bun run start:dev

# Backend only
python src/main.py
```

Health check: `curl http://localhost:3000/ping`

---

## Project Structure

```
smilesrender/
├── src/
│   ├── main.py               # Entry point (Waitress WSGI)
│   ├── routes.py             # Flask app + all API endpoints
│   ├── converter.py          # SMILES → image (RDKit)
│   ├── admet_interpreter.py  # ADMET risk profiler
│   ├── tasks.py              # Celery async workers
│   ├── docking_*.py          # Docking suite (AutoDock Vina)
│   ├── frontend/             # React 19 + TypeScript source
│   │   ├── pages/            # 10 tool pages
│   │   ├── components/       # 30+ reusable components
│   │   └── workers/          # Web Workers for parallelism
│   ├── static/build/         # Compiled frontend (Bun output)
│   └── templates/index.html  # Flask HTML template
├── tests/
│   ├── conftest.py           # pytest fixtures (Flask test client)
│   ├── test_api.py           # Endpoint smoke tests
│   ├── test_converter.py     # SMILES rendering unit tests
│   └── fixtures/             # Test molecules and expected outputs
├── docs/                     # MkDocs documentation source
├── .github/
│   ├── workflows/            # CI and release pipelines
│   └── ISSUE_TEMPLATE/       # Bug / feature templates
├── pyproject.toml            # Project metadata, ruff, pytest config
├── .pre-commit-config.yaml   # Pre-commit hooks
└── docker-compose.yaml       # Full stack orchestration
```

---

## Making Changes

1. **Pick an issue** — comment that you are working on it.
2. **Create a branch** from `develop`:
   ```bash
   git checkout develop
   git pull
   git checkout -b fix/your-branch-name   # or feat/
   ```
3. **Make your changes** — keep commits small and focused.
4. **Run quality checks** before pushing:
   ```bash
   ruff check src/ tests/
   ruff format src/ tests/
   pytest tests/ -v
   ```

### Adding a New API Endpoint

1. Add the route to `src/routes.py`.
2. Include a docstring with `summary`, `args`, and `returns`.
3. Add at least one test in `tests/test_api.py`.
4. Document in `docs/api.md`.

### Adding a New Frontend Page

1. Create `src/frontend/pages/YourPage.tsx`.
2. Register it in `src/frontend/App.tsx` (hash router + taskbar).
3. Add a card to `src/frontend/pages/Hub.tsx`.

---

## Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage report
pytest tests/ --cov=src --cov-report=term-missing

# Run a single test file
pytest tests/test_api.py -v

# Run tests that match a keyword
pytest tests/ -k "render" -v
```

Tests use a Flask test client and do **not** require Redis or Celery. ML models are skipped when `SKIP_MODELS=1` is set (default in CI).

---

## Submitting a Pull Request

1. Push your branch and open a PR against `develop`.
2. Fill in the PR template completely.
3. CI must pass (lint + tests + frontend build).
4. Request a review — maintainers aim to respond within 48 hours.
5. Squash-merge after approval.

---

## Commit Style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(renderer): add SVG export format
fix(admet): handle invalid SMILES gracefully
docs(contributing): update setup instructions
test(api): add coverage for /descriptors endpoint
chore(ci): bump ruff to v0.5
```

Commitizen is configured — running `cz commit` will guide you interactively.

---

## Questions?

Open a [Discussion](https://github.com/shiraishicarlos/smilesrender/discussions) or comment on the relevant issue. We're happy to help!
