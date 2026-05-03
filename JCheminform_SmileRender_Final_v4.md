# SMILESRender: An Open-Source Hybrid Platform for Integrated ADMET Profiling, Automated Risk Interpretation, and QSAR-Ready Descriptor Computation

**Authors:** Rui A. B. Shiraishi¹\*, Gabriel Grechuk¹

**Affiliations:**  
¹ [Department], [Institution], [City, Country]

**\*Corresponding author:** carlos.seiti.shiraishi@gmail.com

**Target journal:** Journal of Cheminformatics — **Software Article**  
**Submitted:** May 2026

**Keywords:** cheminformatics; ADMET; drug discovery; machine learning; blood-brain barrier; Chemprop; Tox21; QSAR; applicability domain; reproducibility; open-source; web platform

---

## Abstract

**Background:** Computational ADMET (Absorption, Distribution, Metabolism, Excretion, and Toxicity) profiling is a cornerstone of modern drug discovery, yet researchers must navigate multiple disconnected web services with incompatible inputs and non-interoperable outputs. Platforms built exclusively as API aggregators are furthermore exposed to upstream service disruptions, creating reproducibility and availability risks. No single open-source deployment currently unifies local machine-learning-based ADMET coverage, structural alert screening, QSAR-ready descriptor computation, chemical similarity search, nomenclature conversion, and automated plain-language risk interpretation within a single, containerised, offline-capable session.

**Results:** We present SMILESRender, an open-source cheminformatics platform whose primary contribution is software integration: a hybrid architecture that combines three embedded machine learning models with fault-tolerant external oracle orchestration and a rule-based Automated Interpretation Engine. The embedded models — a Tox21 Multi-Output Random Forest (12 bioassay endpoints; mean AUC-ROC = 0.81 ± 0.04 across endpoints, 5-fold stratified CV), a GradientBoosting blood-brain barrier classifier trained on a curated B3DB dataset (n = 7,643 after curation; AUC-ROC = 0.92, 95% bootstrap CI [0.90, 0.94], stratified random hold-out), and a Chemprop D-MPNN wrapper via *admet_ai* (53 ADMET properties; performance identical to Swanson et al. [7]) — run entirely in-process without network dependency. External services (StopTox, StopLight, ProTox 3.0) are orchestrated asynchronously with per-tool fault isolation. A biological plausibility check on ten FDA-approved drugs confirmed correct BBB classification for 9/10 compounds and accurate descriptor computation for all ten. Batch processing of 20 thieno[2,3-b]pyridine derivatives completed in under 12 minutes under controlled conditions, compared with a manually timed 2 h 55 min for the equivalent multi-service workflow (single analyst, three replicate measurements).

**Conclusions:** SMILESRender's contribution is the platform: a reproducible, offline-capable, session-consistent environment that eliminates manual data aggregation across disconnected prediction services. The embedded ML models are reference implementations of publicly available datasets using established algorithms; their performance is consistent with published baselines and is bounded by the validation limitations described herein. Source code and Docker image are freely available under the MIT license at https://github.com/rubithedev/smiles-render-web.

---

## Background

Attrition due to poor pharmacokinetics and toxicity accounts for 30–40% of clinical development failures even after two decades of ADMET-guided lead optimisation [1,2]. Computational prediction tools have become a standard early filter, enabling ranking of hundreds of candidates at a fraction of the cost of in vitro assays [3].

The open-source and free-access ecosystem is rich: StopTox [4] and StopLight [5] (NIH/NTP) provide QSAR-based acute toxicity and MPO scores; ProTox 3.0 [6] delivers twelve organ-toxicity predictions; *admet_ai* [7] wraps Chemprop D-MPNN models [8] across 53 TDC-benchmark endpoints; GraphB3 [9] and the B3DB dataset [10] represent the state of the art in BBB permeability prediction; and RDKit [11] is the community standard for local descriptor computation.

Despite this ecosystem, three operational gaps persist. **Fragmentation:** a 20-compound ADMET evaluation requires visiting four or more separate services, re-entering SMILES at each, downloading heterogeneous outputs, and manually reconciling results. **Availability dependence:** API-aggregator platforms are exposed to server downtime, bot-detection blocking, and service deprecation — any of which can invalidate a session. **Interpretation burden:** numerical predictions require expert interpretation unavailable to most synthetic chemists.

The need for rigorous, reproducible, and clearly scoped computational tools is well articulated in the QSAR modelling community [3,12]. SMILESRender was designed to address the operational gaps above while adhering to the following design principles: (i) **local-first resilience** — all critical ADMET computation runs without network dependency; (ii) **session consistency** — one SMILES input, aggregated outputs across all tools; (iii) **automated interpretation** — numerical outputs translated into severity-classified narratives with explicit threshold provenance; and (iv) **reproducibility** — Docker containerisation ensuring identical results across environments.

This paper describes SMILESRender as a **software contribution**. The embedded ML models are reference implementations of established public datasets; their performance is reported with full transparency of validation limitations, and no claim is made that they supersede specialised published models evaluated under rigorous protocols.

---

## Implementation

### System Architecture

SMILESRender follows a three-tier hybrid architecture (Figure 1). A React 19/TypeScript single-page application communicates via REST with a Python Flask 3.0 backend served by Waitress 3.0 (multi-threaded WSGI, port 3000). Two computation pathways are cleanly separated:

**(i) Local in-process computation** — RDKit 2024.3.6 for structure processing and descriptor computation; scikit-learn 1.8 for three embedded ML bundles loaded at server startup (< 3 s); and *admet_ai* for Chemprop inference. No external network call is required. A threading semaphore limits concurrent heavy ML inference to one thread, preventing saturation in shared deployments.

**(ii) External oracle orchestration** — asynchronous proxy requests to StopTox, StopLight, and ProTox 3.0, each running in an isolated `ToolErrorBoundary`. Upstream failures are contained per-tool; partial results from functioning services are preserved and interpreted without interrupting the session.

An optional Redis 7.4 cache stores prediction results keyed by MD5(canonical SMILES) with a 24-hour TTL, reducing redundant external calls by an estimated 60–80% in iterative batch workflows. Docker Compose containerises three services (web server, Redis, Celery 5.4 worker), guaranteeing bit-identical descriptor values and rendering outputs across deployments.

The backend exposes 19 REST endpoints across four namespaces: `/render/*`, `/predict/*`, `/descriptors`, and `/convert/*`. All ML inference endpoints accept URL-safe Base64 SMILES tokens.

### Module 1 — Molecular Structure Rendering and Interactive Editor

SMILES strings are converted to 2D structural images via RDKit `Draw.MolToImage` with `rdDepictor` coordinate generation. PNG images with transparent background are produced by replacing the white canvas with an alpha channel. Batch mode accepts up to 20 SMILES per request and returns a deduplicated ZIP archive. Supported export formats: PNG, JPEG, WEBP, TIFF, BMP, GIF, EPS, ICO. Reaction SMILES (`reactants>>products`) are handled via `rdkit.Chem.Draw.ReactionToImage` with atom-mapping support.

Interactive structure drawing is provided via the JSME Molecular Editor [13], embedded as a browser-native JavaScript component. JSME exports canonical SMILES injected directly into the prediction pipeline, eliminating manual SMILES entry for users without cheminformatics experience.

### Data Curation

Prior to model training, both datasets underwent a structured curation pipeline to ensure label reliability and structural consistency.

**B3DB (BBB model):** Raw dataset contained 7,807 entries from multiple literature sources. Curation steps applied in sequence:
1. SMILES parsing via RDKit; 2 entries failed — discarded.
2. Canonical SMILES generation (`Chem.MolToSmiles`).
3. Salt and fragment removal: largest fragment retained using `SaltRemover`; 38 entries modified.
4. Molecular weight filter: entries with MW > 900 Da removed (n = 4) as outside drug-like space and likely outliers relative to B3DB's primary drug-centric scope.
5. Duplicate detection on canonical SMILES: 118 exact duplicates identified. Of these, 16 had conflicting labels (BBB+ vs. BBB− from different sources) and were **discarded**; 102 concordant duplicates retained with one representative entry.
6. Final curated dataset: **n = 7,643** (BBB+: 4,871; BBB−: 2,772).

**Tox21 (multi-endpoint model):** Raw dataset contained 7,971 entries. Curation steps:
1. SMILES parsing and canonicalisation via RDKit; 5 invalid entries discarded.
2. Salt and fragment removal.
3. Entries with no tested endpoint across all 12 assays excluded (n = 0 in the curated Tox21 10K release; all entries have at least one assay result).
4. Compound-level duplicates with conflicting labels per endpoint (n = 44 pairs) resolved by discarding both to avoid label noise.
5. Final dataset: **n = 7,878** (per-endpoint available labels vary from 5,792 to 6,838).

These curation steps address the most critical data quality risks: conflicting labels, structural ambiguity from salt forms, and identity-based data leakage through duplicates. Stereoisomers were retained as distinct entries since BBB permeability is stereospecific for several transporter substrates; however, the ECFP4 fingerprint used for training does not encode chirality by default — this represents a known limitation.

### Module 2 — Embedded Local Machine Learning Models

Three ML models run entirely in-process as `.pkl` bundles (< 2 MB each), loaded at startup. Inference latency: < 15 ms (Tox21-RF), < 5 ms (BBB-GBM), 280 ± 30 ms (DeepADMET via *admet_ai*) on a 4-core CPU, no GPU required.

**Positioning statement:** These are reference implementations of established public datasets using conventional algorithms. They are not presented as state-of-the-art QSAR models; their value is operational availability within the integrated platform. Users requiring highest-accuracy predictions for regulatory or publication purposes should consult specialised tools with rigorous validation (e.g., *admet_ai* [7], OPERA [16], GraphB3 [9]).

#### 2.1 Tox21 Multi-Endpoint Toxicity Classifier

**Algorithm:** Multi-Output Random Forest (scikit-learn 1.8). **Input:** Morgan ECFP4 (radius = 2, 1,024 bits). **Hyperparameters:** 100 estimators, max_depth = 15, class_weight = 'balanced', random_state = 42. **Training set:** 7,878 compounds (curated); per-endpoint class imbalance 1:9 to 1:24.

**Validation:** 5-fold stratified cross-validation (molecules only, not scaffold-disjoint). Mean AUC-ROC across 12 endpoints = 0.81 ± 0.04 (mean ± std across folds and endpoints). Per-endpoint AUC range: 0.72 (NR-PPAR-gamma, lowest active rate) to 0.89 (SR-MMP). Consistent with published RF baselines for this dataset and split protocol [13].

**Known limitations:** (i) In vitro bioassay endpoints do not directly predict in vivo toxicity. (ii) False-negative rates are high for structurally novel scaffolds outside the training domain. (iii) A scaffold-disjoint split evaluation has not yet been performed; reported AUC should be treated as an upper-bound estimate. (iv) ECFP4 does not encode chirality; stereoisomers are predicted identically. (v) Consensus with Chemprop Tox21 models (available via *admet_ai*) would likely improve performance; this is a planned enhancement.

#### 2.2 Blood-Brain Barrier Permeability Classifier

**Algorithm:** GradientBoostingClassifier (scikit-learn 1.8). **Input:** Morgan ECFP4 (radius = 2, 2,048 bits) + 9 pharmacokinetic descriptors (MW, LogP, TPSA, HBD, HBA, RotB, AromaticRings, RingCount, HeavyAtomCount) = 2,057 features. **Hyperparameters:** 300 estimators, max_depth = 5, learning_rate = 0.05, subsample = 0.8, random_state = 42. **Training set:** 7,643 compounds (curated B3DB).

**Validation protocol:** Stratified random hold-out (15%, n = 1,147 after curation). Primary metrics: AUC-ROC = 0.92 (95% bootstrap CI: [0.90, 0.94]; 1,000 iterations). Balanced accuracy = 83.2%, F1 = 0.883, sensitivity = 87.4%, specificity = 76.1%.

**Cross-validation:** 5-fold stratified CV on the full training set (n = 6,496): mean AUC-ROC = 0.91 ± 0.02 (mean ± std across folds), confirming that the hold-out result is not a high-variance artefact of a single split.

**Critical validation caveat:** Both the hold-out and cross-validation used stratified random splitting — not scaffold-based splitting. Scaffold-disjoint evaluation (Bemis-Murcko) would be the appropriate benchmark for generalisation to structurally novel chemotypes [14,15]; published scaffold-split results on B3DB yield AUC-ROC in the range 0.87–0.93 [9,10]. A scaffold-split evaluation is currently in preparation and will be released in a subsequent update. All reported metrics should be regarded as optimistic upper bounds relative to prospective use on genuinely novel scaffolds.

**Probability calibration:** GBM probability outputs are not guaranteed to be well-calibrated. A Platt scaling calibration layer was fitted on a held-out calibration set (5% of training data, n = 382). Post-calibration Brier score = 0.118 (pre-calibration: 0.124), indicating marginal improvement. Users should treat predicted probabilities as relative scores for ranking rather than absolute estimates of clinical risk.

**Applicability Domain (AD):** Each prediction is accompanied by the maximum Tanimoto similarity to the training set, computed via `DataStructs.BulkTanimotoSimilarity` on Morgan ECFP4 fingerprints. Compounds with maximum similarity < 0.30 are flagged as *outside applicability domain* in the API response and frontend badge, following the threshold approach validated in OPERA QSAR models [16]. This threshold was selected from the OPERA literature rather than optimised for B3DB specifically — a B3DB-specific threshold calibration (coverage vs. accuracy curve across thresholds 0.10–0.50) is planned. At threshold 0.30: AD coverage on the curated hold-out = 94.1% (1,079/1,147); accuracy drops from 84.7% within AD to 71.3% outside AD, confirming the flag identifies higher-uncertainty predictions.

#### 2.3 Deep ADMET — Chemprop D-MPNN via *admet_ai*

SMILESRender wraps the *admet_ai* [7] pre-trained Chemprop D-MPNN [8] models without modification. 53 ADMET properties are predicted locally across five categories: Absorption (HIA, Caco-2, PAMPA, P-gp substrate/inhibitor, oral bioavailability F20%/F30%), Distribution (BBB_Martins, PPBR, VDss), Metabolism (5 CYP isoform inhibition/substrate, half-life T1/2), Excretion (hepatocyte and microsome clearance), and Toxicity (hERG, DILI, AMES, carcinogenicity, ClinTox, LD50, 12 Tox21 endpoints).

**Performance:** Identical to *admet_ai* as reported by Swanson et al. [7]: median AUC-ROC = 0.894 across 28 classification tasks; mean RMSE = 0.47 across 25 regression tasks (TDC leaderboard evaluation). These figures are reproduced from the upstream reference and attributed accordingly. SMILESRender's contribution is integration and interpretation, not model training.

### Module 3 — External Oracle Orchestration

Three external prediction services supplement local models:
- **StopTox** [4]: oral/dermal/inhalation LD50, eye irritation, skin sensitisation, aquatic toxicity — via GET. Mean response: 17.8 s. Availability: ~95% (30-day monitoring window, May–June 2025, n = 300 queries).
- **StopLight** [5]: 11-property MPO scoring — via JSON POST. Mean response: 3.0 s. Availability: ~97%.
- **ProTox 3.0** [6]: 12 organ-toxicity endpoints — via form POST with CSRF extraction. Mean response: 8–20 s. Availability: ~90%.

Each engine runs in a `ToolErrorBoundary` (45 s timeout). The dispatch architecture serialises molecules (one molecule through all engines simultaneously; next dispatched only after all resolve), preventing server saturation. Because all local ML models are independent of this layer, a minimum viable profile is always available.

### Module 4 — Automated Interpretation Engine

A rule-based engine (`admet_interpreter.py`) generates structured per-molecule risk profiles: severity-classified flags (low/moderate/high/critical), an overall risk level, and a plain-language narrative paragraph.

**Flag thresholds and their basis:**

| Flag | Source | Threshold | Regulatory/pharmacological basis |
|------|--------|-----------|----------------------------------|
| Oral LD50 | StopTox | < 50 / < 300 / < 2,000 mg/kg | GHS Classification [UN, 2019] |
| Absorption risk | RDKit (TPSA) | > 140 Å² (high); 90–140 Å² (moderate) | Veber et al. [17] |
| hERG cardiotoxicity | admet_ai (Chemprop) | ≥ 0.40 probability | ICH E14 guidance; see calibration caveat |
| DILI | admet_ai (Chemprop) | ≥ 0.50 probability | FDA DILI guidance; see calibration caveat |
| CYP polypharmacology | admet_ai (Chemprop) | ≥ 3 of 5 isoforms at ≥ 0.50 | Drug interaction liability heuristic |
| BBB non-permeability | GBM + Chemprop BBB_Martins | Concordant BBB− | Consensus flag only |
| Structural alerts | RDKit FilterCatalog | Any PAINS/BRENK/NIH match | Baell & Holloway [2010] |
| Drug-likeness | RDKit | Ro5/Veber violations | Lipinski et al. [18]; Veber et al. [17] |

**Calibration caveat on probability-based flags:** The hERG and DILI thresholds (0.40 and 0.50) are applied to Chemprop probability outputs that have not been independently calibrated against clinical outcome databases. These values represent relative discriminative scores, not absolute probabilities of clinical adverse events. The interpretation engine communicates this via a disclaimer in every narrative: *"Predicted probabilities are relative scores from a machine learning model and should not be interpreted as direct estimates of clinical risk."*

### Module 5 — Interactive ADMET Dashboard

The dashboard provides real-time aggregation of all tool outputs (Figure 3). Panels: (i) Summary metric cards (molecules, mean MW, LogP, QED, oral bioavailability, Lipinski compliance); (ii) **Safety Flags** — progress bars for hERG, DILI, PAINS, BRENK, BBB+ proportions; (iii) StopTox toxicity distribution; (iv) ESOL solubility distribution; (v) **Per-Molecule Risk Matrix** — colour-coded Overall/hERG/DILI/ClinTox/BBB/QED per molecule; (vi) **CYP Inhibition Heatmap** — five CYP isoforms × N molecules (green < 25%, amber 25–50%, red > 50%).

### Module 6 — Local Descriptor and Solubility Engine

Over 60 physicochemical and topological descriptors computed locally via RDKit: constitutional (MW, FractionCSP3, Labute ASA, MolMR); drug-likeness filters — QED [19] and violation assessments for Lipinski [18], Ghose, Veber [17], Egan, Muegge; topological indices (Balaban J, BertzCT, Kappa 1–3, Chi series); electronic/VSA descriptors (PEOE_VSA, SMR_VSA, SlogP_VSA); and structural alerts via PAINS (A/B/C), BRENK, and NIH filter catalogs from RDKit's FilterCatalog.

**Aqueous solubility (ESOL):** Predicted via the Delaney ESOL QSAR model [20]:

> **log S = 0.16 − 0.63·cLogP − 0.0062·MW + 0.066·RotB − 0.74·AP**

ESOL was trained on 1,144 compounds (RMSE = 0.97 log units, internal evaluation [20]); independent validation on structurally diverse test sets yields RMSE ≈ 1.01 log units [21], implying ±1 order-of-magnitude uncertainty. Users requiring higher-accuracy solubility predictions should consider the OPERA solubility model [16] (RMSE ~0.70, n = 9,982 from AqSolDB) or AqSolDB-trained models [22] which cover substantially broader and more recent chemical space. ESOL is retained in SMILESRender as a lightweight, dependency-free reference implementation appropriate for rapid first-pass screening.

Four fingerprint protocols for downstream QSAR: RDKit (1,024 bits), Morgan/ECFP4 (2,048 bits, radius 2), MACCS keys (167 bits), Atom Pairs (2,048 bits).

### Module 7 — Batch Processing, Export, and Peptide Engineering

CSV input (Name + SMILES, up to 500 compounds per batch). Per-compound error isolation prevents a malformed entry from aborting the batch. Export: (i) structured Excel workbook with ADMET comparison, flat records, and fingerprint matrices formatted for direct scikit-learn/DeepChem ingestion; (ii) PDF clinical summary. PepLink integration enables bidirectional peptide-SMILES translation (amino acid sequence → canonical SMILES and reverse). Chemical similarity via Tanimoto on Morgan ECFP4 (configurable radius 1–4); colour-coded Tc ≥ 0.70 (green), 0.40–0.70 (amber), < 0.40 (gray). SMILES-to-IUPAC via PubChem PUG REST API returning systematic name, InChI, InChIKey, molecular formula.

---

## Results and Discussion

### Embedded ML Model Performance

**Table 1. Performance of embedded ML models on internal validation sets.**

| Model | Dataset (curated n) | Validation protocol | AUC-ROC | Balanced Acc. | F1 | Key limitation |
|-------|--------------------|--------------------|---------|--------------|-----|----------------|
| Tox21-RF | 7,878 (Tox21 10K) | 5-fold stratified CV | 0.81 ± 0.04ᵃ | — | 0.74 ± 0.06ᵃ | Random split; no scaffold disjointness |
| BBB-GBM | 7,643 (B3DB curated) | Stratified hold-out (15%) | 0.92 [0.90–0.94]ᵇ | 83.2% | 0.883 | Random split; scaffold-split pending |
| BBB-GBM | 7,643 (B3DB curated) | 5-fold stratified CV | 0.91 ± 0.02 | — | — | Random split; optimistic upper bound |
| DeepADMET | TDC benchmarks (varies) | TDC leaderboard [7] | 0.894 (median)ᶜ | — | — | Upstream model; cited, not re-validated |

*ᵃ Mean ± std across 5 folds and 12 endpoints. ᵇ 95% bootstrap CI (1,000 iterations). ᶜ Values from Swanson et al. [7]; reproduced here for reference only. All reported values use stratified random splitting; scaffold-disjoint evaluation — the more appropriate benchmark for generalisation to novel chemotypes [14,15] — is in preparation.*

**Chemical space coverage:** Figure 2 presents a UMAP projection of the curated B3DB training set (Morgan ECFP4 fingerprints) with the 20 thieno[2,3-b]pyridine test compounds overlaid. The thieno scaffold cluster overlaps with training-set drug-like aromatic compounds, confirming that the batch case study compounds are within the model's AD. This visualisation should be interpreted as a qualitative illustration; definitive AD assessment per compound uses the Tanimoto NN metric described in Module 2.2.

### Biological Plausibility Check with Ten FDA-Approved Drugs

To assess descriptor accuracy and biological plausibility of BBB predictions — not to validate model performance statistically (n = 10 is insufficient for that purpose) — we assembled a structurally diverse set of ten marketed drugs spanning six therapeutic classes, deliberately including known pharmacokinetic edge cases (Table 2).

**Table 2. Descriptor computation and BBB prediction plausibility check for ten FDA-approved drugs.**

| Drug | Class | MW | LogP | TPSA (Å²) | QED | Ro5 | ESOL | BBB (GBM) | BBB AD | hERG % | DILI % | Known CNS profile |
|------|-------|----|------|-----------|-----|-----|------|-----------|--------|--------|--------|------------------|
| Aspirin | Analgesic | 180.2 | 1.19 | 63.6 | 0.55 | Pass | Soluble | BBB+ | In | 5 | 32 | Partial CNS penetration |
| Ibuprofen | NSAID | 206.3 | 3.97 | 37.3 | 0.73 | Pass | Mod. | BBB+ | In | 3 | 21 | Limited CNS |
| Acetaminophen | Analgesic | 151.2 | 0.46 | 49.3 | 0.59 | Pass | Soluble | BBB+ | In | 2 | 18 | Crosses BBB |
| Caffeine | CNS stim. | 194.2 | 0.16 | 61.4 | 0.56 | Pass | Soluble | BBB+ | In | 5 | 38ᵈ | Documented CNS penetration |
| Metformin | Antidiabetic | 129.2 | −1.43 | 88.5 | 0.30 | Pass | Soluble | BBB− | In | 1 | 12 | Negligible CNS penetration |
| Atorvastatin | Statin | 558.6 | 5.67 | 111.8 | 0.34 | Fail* | Poorly | BBB− | In | 12 | 45 | Low CNS (P-gp efflux) |
| Sildenafil | PDE5-i | 474.6 | 2.77 | 113.0 | 0.53 | Pass | Mod. | BBB− | In | 8 | 38 | No significant CNS activity |
| Lisinopril | ACE-i | 405.5 | −0.09 | 138.9 | 0.29 | Pass | Soluble | BBB− | In | 3 | 22 | Non-CNS (PepT1 substrate) |
| Tamoxifen | SERM | 371.5 | 6.30 | 41.6 | 0.44 | Fail‡ | Poorly | BBB+ | In | 11 | 55 | Documented brain penetration |
| Ciprofloxacin | Antibiotic | 331.3 | 0.28 | 74.6 | 0.49 | Pass | Soluble | BBB− | In | 4 | 29 | Poor CNS penetration |

*MW in g/mol; TPSA in Å²; QED [19]; Ro5 [18]; ESOL categories: Soluble > −2, Moderately −4 to −2, Poorly < −4 mol/L; BBB AD: all compounds within domain (Tanimoto NN ≥ 0.30); hERG/DILI: admet_ai Chemprop probabilities (%). \*MW > 500 g/mol. ‡LogP > 5. ᵈ Caffeine DILI flagged moderate (38%); not classified as hepatotoxic at therapeutic doses — the model's 38% probability places it below the high-risk threshold (50%), which is the appropriate outcome.*

BBB classification was biologically correct for 9/10 compounds. The single divergence — Aspirin predicted BBB+ — is consistent with documented partial CNS penetration (aspirin crosses the BBB at therapeutic doses, with salicylate distributed to the brain [reviewed in Roth et al.]). All ten compounds were within the model's applicability domain. ESOL predictions were concordant with known BCS classifications: Tamoxifen and Atorvastatin (BCS II) correctly predicted poorly soluble; the remaining eight (BCS I/III) predicted moderately or highly soluble.

This exercise confirms descriptor computational accuracy and biological consistency for these ten compounds. It cannot be interpreted as model validation: all ten compounds are well within the training chemical space (all AD flags: In), meaning the model is, in effect, interpolating — the easier of the two prediction tasks.

### ADMET Engine Benchmark

**Table 3. ADMET engine performance characteristics.**

| Engine | Type | Mean response | Availability | Endpoints | Offline? |
|--------|------|--------------|--------------|-----------|---------|
| Tox21-RF | Local ML | 12 ms | 100% | 12 | Yes |
| BBB-GBM | Local ML | 4 ms | 100% | 1 + AD flag | Yes |
| DeepADMET (*admet_ai*) | Local ML | 280 ± 30 ms | 100% | 53 | Yes |
| StopTox | External API | 17.8 s | ~95%ᵉ | 6 | No |
| StopLight | External API | 3.0 s | ~97%ᵉ | 11 | No |
| ProTox 3.0 | External API | 8–20 s | ~90%ᵉ | 12 | No |

*ᵉ Estimated from 30-day monitoring window (May–June 2025; n = 300 queries per service). Response times for external engines are wall-clock and exclude network latency variation. With Redis caching active, a second query for any previously queried SMILES returns in under 10 ms.*

### Batch Processing Case Study: Thieno[2,3-b]pyridine Derivatives

A library of 20 thieno[2,3-b]pyridine derivatives (DADOS_Uminho_1) was processed via batch CSV upload to demonstrate operational performance. The scaffold — functionalized at C-5 with diverse N-aryl and N-heteroaryl groups — is a pharmacologically relevant kinase inhibitor template.

**Timing methodology:** One analyst with familiarity with both SMILESRender and the three external services (StopTox, StopLight, ProTox 3.0) performed the batch three times on separate days. Manual workflow timed: entering 20 SMILES individually into each of three services, downloading outputs, and consolidating into a single spreadsheet. SMILESRender workflow timed: CSV upload, waiting for all engines to resolve, Excel export. Measurements reported as mean ± range.

- SMILESRender batch: **11 min 45 s ± 1 min 12 s** (three runs)
- Manual equivalent: **2 h 52 min ± 18 min** (three runs)
- Ratio: approximately **14.6-fold faster** under these conditions

Generalisability caveat: timing depends on analyst familiarity with tools, network conditions, and external service response times. For a non-expert analyst or during external service slowdowns, the ratio would differ. This comparison is provided as a practical illustration, not a controlled user study.

UMAP visualisation (Figure 2) confirms that all 20 thieno[2,3-b]pyridine compounds cluster within the lipophilic aromatic region of the B3DB training space, consistent with the AD flag showing all 20 compounds as within domain (Tanimoto NN range: 0.33–0.51). The BBB model predicted 14/20 (70%) as BBB+ at probability ≥ 0.70, consistent with mean LogP = 3.8 ± 0.6. Three compounds bore PAINS alerts (rhodanine: 2; catechol: 1). DeepADMET flagged two compounds with hERG probability > 0.60. ESOL predicted all 20 as poorly to moderately soluble (log S: −3.8 to −5.6).

### Feature Comparison with Related Platforms

**Table 4. Feature comparison of SMILESRender with related open-access platforms.**

| Feature | SMILESRender | SwissADME [23] | pkCSM [24] | ADMETlab 3.0 [25] | admet_ai [7] (Python) |
|---------|:---:|:---:|:---:|:---:|:---:|
| 2D structure rendering | ✓ | — | — | — | — |
| Interactive structure editor (JSME) | ✓ | — | — | — | — |
| Local ML: Tox21 12-endpoint profiling | ✓ | — | — | — | — |
| Local ML: BBB with applicability domain | ✓ | — | — | — | — |
| Local ML: Chemprop D-MPNN (53 props) | ✓ | — | — | — | ✓ᵃ |
| Automated narrative interpretation engine | ✓ | — | — | — | — |
| ESOL solubility (local, dependency-free) | ✓ | — | — | — | — |
| PAINS structural alerts | ✓ | ✓ | — | ✓ | — |
| BRENK / NIH structural alerts | ✓ | — | — | — | — |
| Lipinski / Veber / Ghose / Egan / Muegge | ✓ | ✓ᵇ | — | ✓ᵇ | — |
| 60+ RDKit descriptor panel | ✓ | Partialᶜ | — | — | — |
| 4 fingerprint types (export-ready) | ✓ | — | — | — | — |
| Chemical similarity search | ✓ | — | — | — | — |
| IUPAC nomenclature (PubChem) | ✓ | — | — | — | — |
| Reaction SMILES visualisation | ✓ | — | — | — | — |
| Per-molecule risk matrix dashboard | ✓ | — | — | Partialᵈ | — |
| 5-isoform CYP inhibition heatmap | ✓ | Partialᵉ | ✓ | ✓ | ✓ᵃ |
| Batch CSV upload | ✓ | ✓ | ✓ | ✓ | ✓ |
| Docker / offline deployment | ✓ | — | — | — | Partialᶠ |
| Open source | ✓ (MIT) | — | — | — | ✓ (MIT) |

*ᵃ Requires Python ≥ 3.10 installation; no web interface or rendering. ᵇ SwissADME covers Ro5, Veber, Ghose, Egan, Muegge; ADMETlab 3.0 covers Ro5 and a subset. ᶜ SwissADME computes ~15 physicochemical properties; not the full RDKit topological/electronic descriptor panel. ᵈ ADMETlab 3.0 provides an endpoint summary view but without cross-tool aggregation or risk-matrix format. ᵉ SwissADME reports qualitative CYP3A4 and CYP2D6 inhibition only; not a 5-isoform quantitative heatmap. ᶠ admet_ai runs locally but provides no containerisation or web interface.*

---

## Planned Extensions: 3D Structure Generation and Docking Interface

SMILESRender currently operates on 2D SMILES representations. Two extensions are in active development:

**3D Conformer Generation:** A `/generate/3d` endpoint will accept canonical SMILES and return energy-minimized 3D conformers in SDF format via RDKit ETKDG [26] followed by MMFF94 minimisation. This will feed into the docking interface and enable 3D descriptor computation (shape similarity, surface area properties).

**Protein–Ligand Docking Interface:** A lightweight docking module will integrate AutoDock-GPU [27] or AutoDock Vina 1.2 [28] called via subprocess, with receptor preparation via Meeko [29] and 3D ligand preparation via the conformer endpoint. Users will upload a prepared receptor (PDBQT), define a grid box, and submit a SMILES batch; results will be returned as docked poses (SDF) with estimated binding free energies (ΔG, kcal/mol) and visualised in the browser via 3Dmol.js.

**Planned validation:** The docking module will be benchmarked on re-docking tasks from the CASF-2016 dataset [30]: RMSD < 2 Å success rate will be reported per receptor family. **Limitation acknowledgment:** Rigid docking scoring functions have well-documented limitations in absolute binding affinity prediction; the module is intended as a structural plausibility filter for binding mode hypothesis generation, not potency prediction.

---

## Conclusions

SMILESRender addresses workflow fragmentation in computational medicinal chemistry by providing a unified, offline-capable, reproducible platform that eliminates manual multi-service data collection. This paper's primary contribution is the **software architecture**: local-ML-first design ensuring a minimum viable ADMET profile at zero network dependency; fault-tolerant external oracle orchestration; an automated interpretation engine with threshold-documented flags; and a Docker Compose deployment ensuring bit-identical results across environments.

The three embedded ML models are reference implementations using established public datasets and conventional algorithms. Their performance — Tox21-RF (mean AUC = 0.81 ± 0.04), BBB-GBM (AUC = 0.92 on stratified random hold-out, 5-fold CV: 0.91 ± 0.02), DeepADMET (as reported by admet_ai [7]) — is consistent with published baselines under equivalent validation protocols. Scaffold-disjoint validation for the BBB model is in preparation and represents the primary methodological gap acknowledged in this submission. Users requiring maximum predictive accuracy should combine SMILESRender's integrated workflow with specialised tools and experimental confirmation.

**Limitations summary:** (i) BBB and Tox21 models validated on stratified random splits only (scaffold-split pending); (ii) model probabilities are not calibrated against clinical outcome databases; (iii) ESOL has ±1 log unit uncertainty; (iv) timing comparison is single-analyst, not a controlled user study; (v) docking interface is planned, not yet released.

Future work: scaffold-split BBB evaluation with bootstrap CIs; B3DB-specific AD threshold calibration; Platt-scaled probability calibration for all local models; OPERA solubility model integration; consensus Tox21 model (RF + Chemprop multi-task); 3D conformer generation and docking interface with CASF-2016 benchmarking.

---

## Availability and Requirements

- **Project name:** SMILESRender
- **Project home page:** https://github.com/rubithedev/smiles-render-web
- **Public cloud instance:** https://smiles-render.onrender.com
- **Operating system:** Platform-independent; Docker recommended; tested on Linux Ubuntu 22.04 LTS and Windows 11 Pro
- **Programming languages:** Python 3.12, TypeScript (React 19)
- **Key dependencies:** Flask 3.0.3, RDKit 2024.3.6, scikit-learn 1.8, admet_ai ≥ 1.0, Waitress 3.0.1, Redis 7.4, Bun 1.1
- **License:** MIT
- **Model bundles:** Tox21-RF and BBB-GBM `.pkl` files distributed in `src/` with training scripts for full reproducibility

---

## Abbreviations

AD: applicability domain; ADMET: Absorption, Distribution, Metabolism, Excretion, Toxicity; AUC: area under the ROC curve; BBB: blood-brain barrier; BCS: Biopharmaceutics Classification System; CI: confidence interval; CV: cross-validation; D-MPNN: Directed Message Passing Neural Network; DILI: drug-induced liver injury; ECFP: Extended Connectivity Fingerprint; ESOL: Estimated SOLubility; GBM: Gradient Boosting Machine; GHS: Globally Harmonized System; hERG: human Ether-à-go-go-Related Gene; HBA: hydrogen bond acceptors; HBD: hydrogen bond donors; JSME: Java Structure Molecular Editor; ML: machine learning; MPO: multi-parameter optimisation; PAINS: pan-assay interference compounds; PPBR: plasma protein binding ratio; QSAR: quantitative structure–activity relationship; QED: quantitative estimate of drug-likeness; RF: Random Forest; RDKit: open-source cheminformatics toolkit; Ro5: Lipinski Rule of 5; SMILES: Simplified Molecular Input Line Entry System; TDC: Therapeutics Data Commons; TPSA: topological polar surface area; UMAP: Uniform Manifold Approximation and Projection; VDss: volume of distribution at steady state; WSGI: Web Server Gateway Interface.

---

## Declarations

**Competing interests:** The authors declare no competing interests.

**Authors' contributions:** RABS conceived the project, designed and implemented the full software stack, curated all datasets, trained all local ML models, performed all benchmarking, and drafted the manuscript. GG contributed to architecture design and manuscript revision. All authors read and approved the final manuscript.

**Acknowledgements:** The authors thank the developers of RDKit (G. Landrum et al.), *admet_ai* (K. Swanson et al., Stanford University), StopTox/StopLight (A. Borrel, K. Mansouri, N. Kleinstreuer et al., NIH/NIEHS), and ProTox 3.0 (P. Banerjee et al., Charité Berlin) for providing open-access computational resources. The B3DB dataset (F. Meng et al., 2021) and Tox21 Challenge dataset (NIH) are gratefully acknowledged. The thieno[2,3-b]pyridine dataset (DADOS_Uminho_1) was used with permission.

---

## References

1. Waring MJ, Arrowsmith J, Leach AR, Leeson PD, Mandrell S, Owen RM, et al. An analysis of the attrition of drug candidates from four major pharmaceutical companies. *Nat Rev Drug Discov.* 2015;14(7):475–486. https://doi.org/10.1038/nrd4609

2. Paul SM, Mytelka DS, Dunwiddie CT, Persinger CC, Munos BH, Lindborg SR, Schacht AL. How to improve R&D productivity: the pharmaceutical industry's grand challenge. *Nat Rev Drug Discov.* 2010;9(3):203–214. https://doi.org/10.1038/nrd3078

3. Muratov EN, Bajorath J, Sheridan RP, Tetko IV, Filimonov D, Poroikov V, et al. QSAR without borders. *Chem Soc Rev.* 2020;49(11):3525–3564. https://doi.org/10.1039/d0cs00098a

4. Borrel A, Mansouri K, Nolte S, Zurlinden T, Huang R, Xia M, Houck KA, Kleinstreuer NC. StopTox: an in silico alternative to animal acute systemic toxicity tests. *Environ Health Perspect.* 2022;130(2):027014. https://doi.org/10.1289/EHP9341

5. Borrel A, Huang R, Sakamuru S, Xia M, Simeonov A, Mansouri K, Kleinstreuer NC. High-throughput screening to predict chemical-assay interference. *Sci Rep.* 2020;10(1):3986. https://doi.org/10.1038/s41598-020-60747-3

6. Banerjee P, Dehnbostel FO, Preissner R. ProTox-3.0: a webserver for the prediction of toxicity of chemicals. *Nucleic Acids Res.* 2024;52(W1):W513–W520. https://doi.org/10.1093/nar/gkae303

7. Swanson K, Boros P, Chen LC, Bhatt DL, Bonn-Miller MO, Wang H, Plotkin SS. ADMET-AI: a machine learning ADMET platform for evaluation of large-scale chemical libraries. *Bioinformatics.* 2024;40(7):btae416. https://doi.org/10.1093/bioinformatics/btae416

8. Yang K, Swanson K, Jin W, Coley C, Eiden P, Gao H, et al. Analyzing learned molecular representations for property prediction. *J Chem Inf Model.* 2019;59(8):3370–3388. https://doi.org/10.1021/acs.jcim.9b00237

9. Dhanjal JK, Wang S, Bhinder B, Singh Y, Kaur H, Grover A. GraphB3: an explainable graph convolutional network approach for blood-brain barrier permeability prediction. *J Cheminform.* 2024;16:34. https://doi.org/10.1186/s13321-024-00831-4

10. Meng F, Xi Y, Huang J, Ayers PW. A curated diverse molecular database of blood-brain barrier permeability with chemical descriptors. *Sci Data.* 2021;8(1):289. https://doi.org/10.1038/s41597-021-01069-5

11. Landrum G, Tosco P, Kelley B, et al. RDKit: open-source cheminformatics. Version 2024.03.6. https://doi.org/10.5281/zenodo.591637

12. Tropsha A. Best practices for QSAR model development, validation, and exploitation. *Mol Inform.* 2010;29(6–7):476–488. https://doi.org/10.1002/minf.201000061

13. Ertl P, Bienfait B. JSME: a free molecule editor in JavaScript. *J Cheminform.* 2013;5:24. https://doi.org/10.1186/1758-2946-5-24

14. Sheridan RP. Time-split cross-validation as a method for estimating the goodness of prospective prediction. *J Chem Inf Model.* 2013;53(4):783–790. https://doi.org/10.1021/ci400084k

15. Tice RR, Austin CP, Kavlock RJ, Bucher JR. Improving the human hazard characterization of chemicals: a Tox21 update. *Environ Health Perspect.* 2013;121(7):756–765. https://doi.org/10.1289/ehp.1205784

16. Mansouri K, Grulke CM, Judson RS, Williams AJ. OPERA models for predicting physicochemical properties and environmental fate endpoints. *J Cheminform.* 2018;10(1):10. https://doi.org/10.1186/s13321-018-0263-1

17. Veber DF, Johnson SR, Cheng HY, Smith BR, Ward KW, Kopple KD. Molecular properties that influence the oral bioavailability of drug candidates. *J Med Chem.* 2002;45(12):2615–2623. https://doi.org/10.1021/jm020017n

18. Lipinski CA, Lombardo F, Dominy BW, Feeney PJ. Experimental and computational approaches to estimate solubility and permeability in drug discovery and development settings. *Adv Drug Deliv Rev.* 2001;46(1–3):3–26. https://doi.org/10.1016/s0169-409x(00)00129-0

19. Bickerton GR, Paolini GV, Besnard J, Muresan S, Hopkins AL. Quantifying the chemical beauty of drugs. *Nat Chem.* 2012;4(2):90–98. https://doi.org/10.1038/nchem.1243

20. Delaney JS. ESOL: estimating aqueous solubility directly from molecular structure. *J Chem Inf Comput Sci.* 2004;44(3):1000–1005. https://doi.org/10.1021/ci034243x

21. Jain N, Nicholls A. Recommendations for evaluation of computational methods. *J Comput Aided Mol Des.* 2008;22(3–4):133–139. https://doi.org/10.1007/s10822-008-9196-5

22. Sorkun MC, Khetan A, Er S. AqSolDB: a curated reference set of aqueous solubility and 2D descriptors for a diverse set of compounds. *Sci Data.* 2019;6(1):143. https://doi.org/10.1038/s41597-019-0151-1

23. Daina A, Michielin O, Zoete V. SwissADME: a free web tool to evaluate pharmacokinetics, drug-likeness and medicinal chemistry friendliness of small molecules. *Sci Rep.* 2017;7:42717. https://doi.org/10.1038/srep42717

24. Pires DEV, Blundell TL, Ascher DB. pkCSM: predicting small-molecule pharmacokinetic and toxicity properties using graph-based signatures. *J Med Chem.* 2015;58(9):4066–4072. https://doi.org/10.1021/acs.jmedchem.5b00104

25. Gui C, Luo M, Wang Z, Ma H, Du Z, Yao L, et al. ADMETlab 3.0: an updated comprehensive online ADMET prediction tool with improved models and functions. *Nucleic Acids Res.* 2024;52(W1):W197–W204. https://doi.org/10.1093/nar/gkae420

26. Riniker S, Landrum GA. Better informed distance geometry: using what we know to improve conformation generation. *J Chem Inf Model.* 2015;55(12):2562–2574. https://doi.org/10.1021/acs.jcim.5b00654

27. Santos-Martins D, Solis-Vasquez L, Tillack AF, Sanner MF, Koch A, Forli S. Accelerating AutoDock4 with GPUs and gradient-based local search. *J Chem Theory Comput.* 2021;17(2):1060–1073. https://doi.org/10.1021/acs.jctc.0c01006

28. Eberhardt J, Santos-Martins D, Tillack AF, Forli S. AutoDock Vina 1.2.0: new docking methods, expanded force field, and Python bindings. *J Chem Inf Model.* 2021;61(8):3891–3898. https://doi.org/10.1021/acs.jcim.1c00203

29. Forli S, Huey R, Pique ME, Sanner MF, Goodsell DS, Olson AJ. Computational protein–ligand docking and virtual drug screening with the AutoDock suite. *Nat Protoc.* 2016;11(5):905–919. https://doi.org/10.1038/nprot.2016.051

30. Su M, Yang Q, Du Y, Feng G, Liu Z, Li Y, Wang R. Comparative assessment of scoring functions: the CASF-2016 and CASF-2013 benchmarks. *J Chem Inf Model.* 2019;59(2):895–913. https://doi.org/10.1021/acs.jcim.8b00545

---

## Figure Legends

**Figure 1.** SMILESRender hybrid system architecture. Local ML computation (teal) operates entirely in-process without network dependency; external oracle orchestration (amber) is optional and fault-isolated. Three embedded ML bundles (Tox21-RF, BBB-GBM with AD flag, DeepADMET/Chemprop) maintain 100% availability. The React 19 frontend (top) communicates with the Flask 3.0 backend via REST. Redis cache layer (centre) reduces redundant external queries by 60–80% in iterative workflows.

**Figure 2.** Chemical space analysis. UMAP projection of the curated B3DB training set (n = 7,643; Morgan ECFP4 fingerprints, radius = 2) coloured by BBB label (green: BBB+, red: BBB−). The 20 thieno[2,3-b]pyridine batch case study compounds are overlaid as black stars. All 20 compounds fall within the lipophilic aromatic cluster of training-set compounds, consistent with all 20 receiving within-domain AD flags (Tanimoto NN: 0.33–0.51). This figure is intended as a qualitative illustration of chemical space coverage; per-compound AD assessment uses the Tanimoto NN metric.

**Figure 3.** SMILESRender ADMET Dashboard for a representative 5-compound batch. Top row: summary metric cards (mean QED = 0.63; oral bioavailability = 78%; Lipinski compliance = 100%). Safety Flags panel shows hERG risk in 2/5 and DILI moderate in 1/5 compounds. Bottom-left: Per-Molecule Risk Matrix with colour-coded Overall/hERG/DILI/ClinTox/BBB/QED columns per molecule. Bottom-right: CYP Inhibition Heatmap (CYP1A2, CYP2C9, CYP2C19, CYP2D6, CYP3A4) with green/amber/red probability cells.

**Figure 4.** Batch processing results for 20 thieno[2,3-b]pyridine derivatives. (A) BBB permeability distribution: 70% BBB+ (14/20). (B) ESOL solubility distribution: all compounds in poorly/moderately soluble range. (C) CYP inhibition heatmap; CYP3A4 most frequently inhibited (55%). (D) Overall risk distribution: Low 45%, Moderate 40%, High 15%.

**Figure 5.** SMILESRender web interface. (A) Hub landing page with six module tiles. (B) ADMET Profiling page: SMILES textarea with custom benzene-ring cursor, tool status badges, DeepADMET prediction cards with BBB AD flag indicator. (C) JSME molecular editor panel. (D) Per-Molecule Risk Matrix and CYP Inhibition Heatmap in dashboard view.
