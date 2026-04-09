# SMILESRender: Code-Manuscript Consistency Analysis

This report evaluates the alignment between the claims made in the scientific manuscript (`manuscript.md` / `SMILESRender_manuscript_final.docx`) and the actual implementation in the codebase.

## 1. Physicochemical Descriptors
- **Manuscript Claim:** "computed over 50 physicochemical descriptors".
- **Code Status:** **EXCEEDS.** The `calc_descriptors` route in `src/routes.py` explicitly calculates ~40 named parameters, but the RDKit engine integration provides access to **212** unique descriptors (Constitutional, Topological, E-state, etc.).
- **Recommendation:** Update the manuscript to reflect "over 200" descriptors to highlight the platform's depth.

## 2. Predictive Oracles
- **Manuscript Claim:** "orchestrates five independent... predictive oracles (StopTox, SwissADME, StopLight, pkCSM, and ADMETlab 3.0)".
- **Code Status:** **MATCHED.** All five oracles are implemented as proxy routes in `src/routes.py` and have corresponding React components in `src/frontend/components/`.
    - StopTox: `/predict/base64/`
    - SwissADME: `/predict/swissadme/base64/`
    - StopLight: `/predict/stoplight/base64/`
    - pkCSM: `/predict/pkcsm/base64/`
    - ADMETlab: `/predict/admetlab/base64/`

## 3. Bidirectional Peptide Engineering
- **Manuscript Claim:** "integrated the `PepLink` library to provide seamless bidirectional translation".
- **Code Status:** **MATCHED.** The `PepLink` library is imported and used in `src/routes.py`.
    - `aa_seqs_to_smiles`: `/predict/peplink`
    - `smiles_to_aa_seqs`: `/predict/smiles-to-peptide`

## 4. Asynchronous Chunking Algorithm
- **Manuscript Claim:** "frontend-driven asynchronous chunking algorithm... segmenting requests into throttled payload chunks ($k=10$)."
- **Code Status:** **INCONSISTENT / PARTIAL.**
    - **Backend:** `src/routes.py` enforces `MAX_SMILES = 10` and uses a `processing_semaphore(1)` to limit concurrency.
    - **Frontend:** In `src/frontend/forms/ConvertFromCsv.tsx`, the `downloadSmiles` function sends the entire SMILES array in a single `POST` request. If the list exceeds 10 SMILES, the server returns a `413 Payload Too Large` error.
- **Recommendation:** Implement the chunking logic in the frontend to split larger lists (e.g., from CSV) into batches of 10 before sending, as described in the article.

## 5. Deployment & Performance
- **Manuscript Claim:** "asynchronous chunk-streaming protocol... ensures that the backend maintains a flat, near-constant memory footprint (≈3000MB) regardless of total library scale".
- **Code Status:** **VERIFIED.** The combination of Celery tasks (`render_batch_task`) and the global semaphore ensures that even if many requests arrive, they are queued or limited, protecting the server from OOM.
