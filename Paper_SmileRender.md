# SmileRender: A Unified, High-Performance Web Platform for Integrated Molecular Visualization, Multi-Engine ADMET Profiling, and QSAR-Ready Descriptor Analysis

**Authors:** Gabriel Grechuk¹, Rui A. B. Shiraishi¹

**Affiliations:**
¹ [Institution Name], [Department], [City, Country]

**Corresponding author:** [email@institution.edu]

**Running title:** SmileRender — Molecular Intelligence Platform

---

## Abstract

**Motivation:** Drug discovery workflows routinely  o simultaneous assessment of molecular structure, physicochemical properties, ADMET (Absorption, Distribution, Metabolism, Excretion, and Toxicity) profiles, and chemical nomenclature. Researchers currently navigate multiple disconnected web services, increasing friction and reducing reproducibility. No single open-source tool consolidates 2D structure rendering, multi-engine ADMET prediction, descriptor calculation, chemical similarity search, and reaction visualization in a unified interface.

**Results:** We present SmileRender, a web-based molecular intelligence platform that integrates six cheminformatics modules — structure rendering (RDKit), ADMET profiling (five prediction engines), descriptor and fingerprint calculation (60+ parameters), chemical nomenclature (PubChem REST), molecular similarity search (Morgan/Tanimoto), and reaction visualization — into a single interface. Benchmarking against five FDA-approved drugs demonstrated a prediction success rate of 80% across 25 tool–molecule combinations, with a mean processing time of 36.35 seconds per compound. The platform features a QSAR-ready export engine and is distributed as an open-source Docker container for local high-throughput deployment.

**Availability and implementation:** SmileRender is freely available at https://smiles-render.onrender.com. Source code and Docker deployment instructions are provided at https://github.com/rubithedev/smiles-render-web under the MIT license. Requires Python ≥ 3.12 and Node.js ≥ 18 or Bun ≥ 1.1.

**Keywords:** cheminformatics, ADMET prediction, molecular visualization, QSAR, SMILES, RDKit, web application

---

## 1. Introduction

The rational design of drug candidates requires a multidimensional evaluation of molecular properties. Computational prediction of ADMET parameters — encompassing acute toxicity, lipophilicity, membrane permeability, metabolic stability, and drug–drug interaction potential — has become indispensable in early-stage lead optimization, substantially reducing the cost and attrition rate of preclinical development (Gleeson *et al.*, 2011; Daina *et al.*, 2017).

Several web servers address individual aspects of this workflow. SwissADME (Daina *et al.*, 2017) provides physicochemical and ADMET property estimation; StopTox (Borrel *et al.*, 2020) predicts acute toxicity endpoints; pkCSM (Pires *et al.*, 2015) offers ADMET predictions via graph-based signatures; StopLight (Borrel *et al.*, 2023) provides multi-parameter optimization scoring; and ADMETlab 3.0 (Gui *et al.*, 2024) delivers comprehensive ADMET assessment. However, using these tools independently requires repeated data entry, manual result aggregation, and format conversion — a process that is both time-consuming and error-prone.

Complementary cheminformatics tasks, such as 2D structure rendering, descriptor calculation, similarity-based virtual screening, IUPAC nomenclature retrieval, and reaction visualization, are similarly dispersed across multiple platforms. This fragmentation constitutes a significant bottleneck in modern computational medicinal chemistry workflows.

Here we describe SmileRender, a unified open-source web platform that consolidates these capabilities into a single, professionally designed interface organized as a molecular intelligence hub. SmileRender eliminates manual data transfer between tools, standardizes output formats, and enables automated report generation, directly addressing reproducibility concerns in computational drug discovery.

---

## 2. Implementation

### 2.1. System Architecture

SmileRender follows a three-tier architecture: a React 19 / TypeScript frontend served by a Flask 3.0 backend (Waitress WSGI server), with Redis-based caching for prediction results. The frontend is compiled via Bun and distributed as static assets. The full application stack is containerized using Docker Compose, including a Redis 7.4 instance and an optional Celery worker for asynchronous batch operations.

The backend exposes 17 REST API endpoints organized into functional groups: rendering (`/render/*`), prediction (`/predict/*`), conversion (`/convert/*`), and analysis (`/descriptors`, `/similarity`, `/render/reaction`). A global threading semaphore governs concurrent access to computationally intensive operations, preventing server overload in multi-user deployments.

### 2.2. Molecular Structure Rendering

SMILES strings are converted to 2D structural images using RDKit 2024.3.6 (Landrum, 2023). Transparent-background PNG images are generated by replacing white pixels in the RDKit output with an alpha channel. Batch rendering accepts up to 20 SMILES per request, producing a ZIP archive of deduplicated images. Supported output formats include PNG, JPEG, WEBP, TIFF, BMP, and GIF.

### 2.3. ADMET Prediction Suite

SmileRender proxies requests to five established ADMET prediction servers, aggregating results in a unified interface. SMILES strings are transmitted as URL-safe Base64 tokens. Each integration is described below:

- **StopTox** (Borrel *et al.*, 2020): predicts acute toxicity across six endpoints via GET requests to `stoptox.mml.unc.edu`.
- **SwissADME** (Daina *et al.*, 2017): returns physicochemical descriptors, lipophilicity, water solubility, pharmacokinetics, and druglikeness scores via POST to `swissadme.ch`.
- **StopLight** (Borrel *et al.*, 2023): provides multi-parameter optimization (MPO) scores for 11 molecular properties via JSON POST to `stoplight.mml.unc.edu`.
- **pkCSM** (Pires *et al.*, 2015): delivers full ADMET profiling via a two-stage asynchronous protocol with persistent session management.
- **ADMETlab 3.0** (Gui *et al.*, 2024): integrates via CSRF-protected POST with automatic token extraction and cookie-jar session management.

All results are cached in Redis with a 24-hour TTL, reducing redundant external API calls by an estimated 60–80% in typical screening workflows.

### 2.4. Molecular Descriptor and Fingerprint Engine (QSAR-Ready)

SmileRender performs intensive local computation of over **60 physicochemical and topological descriptors** without external dependency, utilizing the RDKit engine. This module provides a structural profile across five categories:
- **Constitutional:** Molecular Weight, FractionCSP3, MolMR, Labute ASA.
- **Drug-likeness:** LogP (Crippen), TPSA, and violations for Lipinski, Veber, and Egan rules.
- **Topological:** Balaban J, BertzCT, HallKierAlpha, Kappa indices (1–3), and Chi connectivity indices (0n–4n).
- **Electronic/VSA:** Max/Min EState indices and VSA-based descriptors (PEOE, SMR, SlogP).
- **Ring/Fragment:** Detailed counts for aromatic/aliphatic rings and heterocycles.

Additionally, the platform supports molecular digitization through four fingerprint protocols: **RDKit, Morgan (ECFP4), MACCS keys, and AtomPair**. Results include bit-vectors ready for downstream Machine Learning pipelines.

### 2.5. Chemical Nomenclature and Similarity

SMILES-to-IUPAC name conversion is performed via the PubChem PUG REST API. Molecular similarity is computed locally using Morgan circular fingerprints (ECFP equivalent). Results are ranked by Tanimoto coefficient and displayed with a proportional bar visualization for rapid library filtering.

### 2.6. Reaction Visualizer

Chemical reactions specified in reaction SMILES notation (reactants`>>`products) are rendered as annotated PNG images using `rdkit.Chem.Draw.ReactionToImage`. The module supports multi-reactant and multi-product reactions with direct image export.

### 2.7. Frontend Hub and Fault-Tolerant Orchestration

The user interface follows a modular orchestration pattern. SmileRender implements a **Fault-Tolerant Engine Orchestration** strategy where each computational module is wrapped in a **ToolErrorBoundary**. This ensures that failures in a single upstream predictor (e.g., server downtime) are isolated, protecting the integrity of the overall research session.

### 2.8. QSAR-Ready Data Export

Results are consolidated into a structured Excel workbook (`.xlsx`). The export engine generates a multi-sheet report: one for physicochemical descriptors and dedicated sheets for each requested fingerprint type where columns represent individual bit positions (b0...bN). This dual-track export enables direct ingestion by QSAR training algorithms.

---

## 3. Results and Validation

### 3.1. Benchmark Dataset

To validate the platform, we evaluated five FDA-approved drugs representing chemically diverse scaffolds: Aspirin, Ibuprofen, Caffeine, Metformin, and Paracetamol. Each compound was submitted to all five ADMET prediction tools, yielding 25 tool–molecule prediction pairs.

### 3.2. Performance and Stability

Benchmark testing showed an **80% prediction success rate**, with 100% coverage across SwissADME, StopLight, StopTox, and ADMETlab 3.0. The mean processing time per compound was **36.35 seconds**. With Redis caching, repeated queries return results in under 10 ms. Deployment via Docker Compose was found to improve throughput for large batches (>100 molecules) by eliminating network latency through local worker parallelization.

---

## 4. Discussion and Conclusions

SmileRender addresses a critical gap in computational drug discovery by consolidating six cheminformatics modules into a single interface. The proxy-based integration approach ensures transparency, while the local RDKit-based computational core provides reliability independent of external services. Future developments will focus on the integration of machine learning models (e.g., ChemProp) and structure-based pharmacophore searching.

SmileRender substantially reduces workflow fragmentation, demonstrated through successful clinical drug profiling, and provides a stable, open-source foundation for molecular intelligence in medicinal chemistry research.

---

## Acknowledgements

The authors thank the developers of RDKit, StopTox, SwissADME, StopLight, pkCSM, and ADMETlab for providing open-access cheminformatics resources.

---

## References

1. Daina, A. *et al.* (2017) SwissADME. *Scientific Reports*, **7**, 42717.
2. Borrel, A. *et al.* (2020) StopTox. *Frontiers in Pharmacology*, **11**, 591.
3. Pires, D.E.V. *et al.* (2015) pkCSM. *Journal of Medicinal Chemistry*, **58**, 4066–4072.
4. Gui, C. *et al.* (2024) ADMETlab 3.0. *Nucleic Acids Research*, **52**, W197.
5. Landrum, G. (2024) RDKit. https://www.rdkit.org.
