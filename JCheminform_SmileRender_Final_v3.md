# SMILESRender: A Hybrid Open-Source Platform for ADMET Profiling with Embedded Machine Learning Models, Automated Risk Interpretation, and QSAR-Ready Descriptor Computation

**Authors:** Rui A. B. Shiraishi¹\*, Gabriel Grechuk¹

**Affiliations:**  
¹ Department of Pharmaceutical Sciences / Computational Chemistry, [Institution], [City, Country]

**\*Corresponding author:** carlos.seiti.shiraishi@gmail.com

**Target journal:** Journal of Cheminformatics — Software Article  
**Submitted:** May 2026

**Keywords:** cheminformatics; ADMET prediction; machine learning; blood-brain barrier; Chemprop; Tox21; QSAR; drug discovery; batch processing; open-source; reproducibility; applicability domain

---

## Abstract

**Background:** Computational ADMET (Absorption, Distribution, Metabolism, Excretion, and Toxicity) profiling is central to modern drug discovery, yet the community's tooling landscape remains fragmented: available web services cover individual aspects of ADMET assessment but require separate logins, incompatible input formats, and manual result reconciliation. Platforms relying entirely on third-party prediction servers are also vulnerable to downstream service disruptions, raising practical reproducibility concerns. No open-source solution currently provides, within a single reproducible deployment, 2D rendering, local machine learning-based ADMET profiling, structural alert screening, QSAR-ready descriptor and fingerprint computation, chemical similarity search, nomenclature conversion, and automated plain-language risk interpretation.

**Results:** We present SMILESRender, a web-based cheminformatics hub built on a hybrid architecture combining three embedded machine learning models with optional external oracle orchestration. The local computation stack — running entirely in-process via RDKit 2024.3.6 and scikit-learn 1.8 — delivers: (i) Tox21 multi-endpoint toxicity profiling across 12 bioassay endpoints via a Multi-Output Random Forest; (ii) blood-brain barrier (BBB) permeability prediction via a GradientBoosting classifier trained on the B3DB dataset (n = 7,807; AUC-ROC = 0.92 on a stratified hold-out, 95% CI [0.90, 0.94]); and (iii) 53 ADMET properties via the *admet_ai* Chemprop Directed Message Passing Neural Network (D-MPNN). External oracle orchestration supplements local predictions with six acute toxicity endpoints (StopTox), eleven MPO optimization scores (StopLight), and twelve organ-toxicity estimates (ProTox 3.0), with full fault isolation ensuring a minimum viable profile remains available regardless of upstream service status. A rule-based Automated Interpretation Engine converts aggregated outputs into severity-classified narratives. Validation against a benchmark set of ten FDA-approved drugs confirmed 100% descriptor reproducibility and biologically correct BBB classification for nine of ten compounds. Batch processing of 20 thieno[2,3-b]pyridine derivatives completed in under 12 minutes — approximately 12-fold faster than the equivalent manual multi-service workflow.

**Conclusions:** SMILESRender reduces ADMET data collection from a multi-hour manual process to a single session, with all critical computations available offline. The platform is freely available at https://github.com/rubithedev/smiles-render-web under the MIT license. A public cloud instance is accessible at https://smiles-render.onrender.com. A Docker Compose image ensures identical results across deployments.

---

## Background

Attrition due to poor pharmacokinetics and toxicity accounts for approximately 30–40% of failures in clinical development, even after two decades of ADMET-aware lead optimization [1,2]. Computational prediction tools have become a standard first filter: they allow ranking hundreds of candidates on key ADMET properties before any compound is synthesized, at a fraction of the cost of in vitro assays [3].

The cheminformatics community has produced an ecosystem of specialized prediction servers. StopTox [4] and StopLight [5] (National Toxicology Program, NIH) provide quantitative structure–activity relationship (QSAR)-based acute toxicity predictions and multi-parameter optimization (MPO) scoring. ProTox 3.0 [6] (Charité Biomedical Informatics) delivers twelve organ toxicity endpoints including drug-induced liver injury (DILI) and cardiotoxicity. For deep ADMET coverage, the *admet_ai* Python library [7] wraps Chemprop D-MPNN models [8] trained on 53 curated endpoints from the Therapeutics Data Commons (TDC) benchmarks. For blood-brain barrier (BBB) permeability, graph convolutional approaches such as GraphB3 [9], trained on the B3DB classification dataset [10], have demonstrated competitive performance against earlier fingerprint-based QSAR models. RDKit [11] remains the community standard for local descriptor computation and fingerprint generation.

Despite this ecosystem, three practical gaps persist. **First, operational fragmentation**: a researcher evaluating 20 candidate molecules must query four or more separate services, re-enter SMILES at each, download heterogeneous outputs, and manually reconcile predictions across incompatible scales. **Second, availability dependence**: platforms built exclusively as API aggregators are exposed to upstream failures — server downtime, CORS restrictions, bot-detection blocking, or API deprecation — which can interrupt or invalidate a session mid-analysis. **Third, interpretation burden**: numerical predictions without domain-informed thresholds require expert interpretation that is unavailable to the majority of non-computational medicinal chemists.

SMILESRender was designed to close these gaps through four principles: (i) **local-first resilience** — all critical ADMET computations run as embedded ML models without network dependency; (ii) **session consistency** — one SMILES input, all tools, in a single web session; (iii) **automated interpretation** — numerical outputs translated into plain-language, severity-classified risk narratives; and (iv) **reproducibility** — Docker containerization ensuring identical results across environments and over time.

---

## Implementation

### System Architecture

SMILESRender follows a three-tier hybrid architecture (Figure 1). A React 19/TypeScript single-page application communicates via REST with a Python Flask 3.0 backend served by Waitress 3.0 (multi-threaded WSGI, port 3000). The backend separates two computation pathways:

**(i) Local in-process computation** — RDKit 2024.3.6 for structure processing and descriptor computation, scikit-learn 1.8 for three embedded ML model bundles loaded at server startup (typical startup time: < 3 s), and *admet_ai* for Chemprop inference. No external network call is required for any local prediction. A threading semaphore limits concurrent heavy ML inference to one thread, preventing server saturation in shared deployments.

**(ii) External oracle orchestration** — asynchronous proxy requests to StopTox, StopLight, and ProTox 3.0, each running in an isolated `ToolErrorBoundary`. Upstream failures are contained per-tool; partial results from functioning services are preserved and interpreted without interrupting the session.

An optional Redis 7.4 cache stores prediction results keyed by MD5(canonical SMILES) with a 24-hour TTL, reducing redundant external API calls by an estimated 60–80% in batch workflows. The full stack is containerized via Docker Compose with three services: web server, Redis, and Celery 5.4 worker for non-blocking batch rendering.

The backend exposes 19 REST endpoints in four namespaces: `/render/*` (structure images, batch ZIP, reactions), `/predict/*` (ADMET engines, interpreter, BBB, Tox21, DeepADMET), `/descriptors` (local computation pipeline), and `/convert/*` (nomenclature, similarity). All model inference endpoints use URL-safe Base64 SMILES tokens to avoid routing conflicts with structural characters.

### Module 1 — Molecular Structure Rendering and Interactive Editor

SMILES strings are converted to high-quality 2D structural images using RDKit's `Draw.MolToImage` API with Chem.rdDepictor coordinate generation. Transparent-background PNG images are produced by replacing the white background with an alpha channel. Batch mode accepts up to 20 SMILES per request and returns a deduplicated ZIP archive. Supported export formats: PNG, JPEG, WEBP, TIFF, BMP, GIF, EPS, ICO. Reaction SMILES (`reactants>>products`) are handled via `rdkit.Chem.Draw.ReactionToImage`, producing annotated reaction scheme images with atom-mapping support.

Interactive structure drawing is provided via the JSME Molecular Editor [12], embedded as a browser-native JavaScript component. JSME exports canonical SMILES that are injected directly into the prediction pipeline, eliminating manual SMILES entry for users without cheminformatics experience. A custom benzene-ring CSS cursor (base64-encoded SVG) is applied to all SMILES text input fields as a domain-context affordance.

### Module 2 — Embedded Local Machine Learning Models

Three ML models are embedded in the platform, serialized as lightweight `.pkl` bundles (< 2 MB each) and loaded at server startup. All three run entirely in-process with inference latency under 300 ms per compound on a standard 4-core CPU, and maintain 100% availability independent of network conditions.

#### 2.1 Tox21 Multi-Endpoint Toxicity Classifier

A Multi-Output Random Forest (scikit-learn 1.8) covers all 12 Tox21 Challenge toxicity bioassay endpoints [13]: NR-AR, NR-AR-LBD, NR-AhR, NR-Aromatase, NR-ER, NR-ER-LBD, NR-PPAR-gamma, SR-ARE, SR-ATAD5, SR-HSE, SR-MMP, and SR-p53. These endpoints capture nuclear receptor signalling disruption and stress response pathway activation — the principal mechanisms of concern for endocrine disruption and genotoxicity screening.

**Input features:** Morgan ECFP4 fingerprint (radius = 2, 1,024 bits). **Hyperparameters:** 100 estimators, max_depth = 15, class_weight = 'balanced' to address per-endpoint imbalance ratios ranging from 1:9 to 1:24, n_jobs = −1, random_state = 42. **Training set:** 7,971 compounds from the publicly available Tox21 10K dataset; compounds with no tested endpoint were excluded rather than imputed. **Note on validation:** per-endpoint AUC-ROC values from the original Tox21 challenge [13] are reported as the external benchmark; independent re-validation of the embedded model on a stratified hold-out (20%) yielded mean AUC = 0.81 across 12 endpoints (range: 0.72–0.89), consistent with published Random Forest baselines for this dataset. Users are encouraged to consult the reported endpoint-specific performance values when interpreting predictions for individual nuclear receptors.

**Limitation:** The Tox21 assays measure in vitro activity at defined concentrations; they do not directly predict in vivo toxicity. False-negative rates are non-trivial for structurally novel scaffolds outside the training chemical space.

#### 2.2 Blood-Brain Barrier Permeability Classifier

A GradientBoostingClassifier predicts BBB permeability status (BBB+ or BBB−), inspired by the architecture of the GraphB3 graph convolutional model [9] but adapted for deployment without PyTorch or torch_geometric dependencies.

**Training data:** B3DB classification dataset [10] (n = 7,807; 4,956 BBB+, 2,851 BBB−). **Input feature vector:** Morgan ECFP4 fingerprint (radius = 2, 2,048 bits) concatenated with nine pharmacokinetic descriptors — molecular weight, LogP, TPSA, hydrogen bond donors, hydrogen bond acceptors, rotatable bonds, aromatic ring count, ring count, heavy atom count — yielding 2,057 features total. **Hyperparameters:** 300 estimators, max_depth = 5, learning_rate = 0.05, subsample = 0.8, random_state = 42.

**Validation:** Performance was evaluated on a stratified random hold-out partition (15%, n = 1,171). AUC-ROC = 0.92 (95% bootstrap CI: [0.90, 0.94]; 1,000 iterations), accuracy = 84.7%, balanced accuracy = 83.2%, F1 = 0.883, sensitivity = 87.4%, specificity = 76.1%.

**Important limitation:** This hold-out is a stratified random split, not a scaffold-based split. Scaffold-disjoint evaluation — where all molecules sharing a Bemis-Murcko scaffold appear exclusively in either the training or test partition — is the appropriate benchmark for assessing generalisation to structurally novel chemotypes [14,15]. A scaffold-split evaluation using the Murcko scaffold implementation in RDKit is under preparation; users should treat the reported AUC as an optimistic upper bound. As a practical reference: published models evaluated with scaffold-split on B3DB typically report AUC-ROC in the range 0.87–0.93.

**Applicability Domain:** Each prediction is accompanied by a Tanimoto nearest-neighbour similarity score to the training set (computed via `DataStructs.BulkTanimotoSimilarity` on Morgan ECFP4 fingerprints). Predictions for compounds with a maximum training-set Tanimoto similarity < 0.30 are flagged as *outside applicability domain (AD)* in both the API response and the frontend badge, following the threshold approach used in OPERA QSAR models [16].

#### 2.3 Deep ADMET — Chemprop Directed Message Passing Neural Network

53 ADMET properties are predicted locally via the *admet_ai* library [7], which wraps pre-trained Chemprop D-MPNN models [8] trained on TDC benchmark datasets. Unlike fixed-fingerprint approaches, D-MPNN learns atom- and bond-level representations through iterative message-passing over the molecular graph, capturing long-range structural dependencies relevant to pharmacokinetic behaviour.

**Coverage:** Absorption — human intestinal absorption (HIA), Caco-2 permeability, PAMPA permeability, P-glycoprotein substrate/inhibitor, oral bioavailability (F20%, F30%). Distribution — BBB_Martins, plasma protein binding (PPBR), volume of distribution (VDss). Metabolism — five CYP isoform inhibition/substrate predictions (CYP1A2, CYP2C9, CYP2C19, CYP2D6, CYP3A4) plus half-life (T1/2). Excretion — hepatocyte and microsome clearance. Toxicity — hERG cardiotoxicity, DILI, AMES mutagenicity, carcinogenicity, ClinTox, LD50, and 12 Tox21 endpoints via deep models.

**Performance:** Because SMILESRender uses the *admet_ai* pre-trained weights without modification, the model performance is identical to that reported by Swanson et al. [7]: median AUC-ROC across 28 classification tasks = 0.894; mean RMSE across 25 regression tasks = 0.47 (in task-specific units). These figures are not re-reported as SMILESRender's own; they are cited as the upstream model's validated performance. **Mean inference time:** 280 ± 30 ms per compound on a 4-core Intel i7 CPU without GPU acceleration.

### Module 3 — External Oracle Orchestration

Three external prediction services are orchestrated as supplementary sources to extend endpoint coverage:

- **StopTox** [4]: six acute toxicity endpoints (oral LD50, dermal LD50, inhalation LC50, eye irritation, skin sensitization, aquatic toxicity) via GET requests. Mean response time: 17.8 s. Availability: ~95% over a 30-day monitoring period (May–June 2025).
- **StopLight** [5]: eleven MPO optimization scores via JSON POST. Mean response time: 3.0 s. Availability: ~97%.
- **ProTox 3.0** [6]: twelve organ-toxicity predictions (DILI, neurotoxicity, nephrotoxicity, cardiotoxicity, carcinogenicity, mutagenicity, immunotoxicity, cytotoxicity, BBB, respiratory toxicity, ecotoxicity, clinical toxicity) via form POST with automatic CSRF token extraction. Mean response time: 8–20 s. Availability: ~90%.

Each engine runs in a `ToolErrorBoundary` with a 45-second timeout. The session-dispatch architecture processes one molecule through all engines simultaneously; the next molecule is dispatched only after all engines for the current molecule resolve, preventing server-side saturation for batch queries. Because all three local ML models (Section 2.1–2.3) are independent of this orchestration layer, a minimum viable ADMET profile is always available.

### Module 4 — Automated Interpretation Engine

A rule-based engine (`admet_interpreter.py`) aggregates all tool outputs and generates structured per-molecule risk profiles. Each profile contains: (i) severity-classified flags across four levels (low/moderate/high/critical); (ii) an overall risk level; and (iii) a plain-language narrative paragraph.

**Threshold basis:** Flag thresholds are derived from established pharmacological and regulatory guidelines:
- Oral LD50: GHS classification (critical: < 50 mg/kg; high: 50–300 mg/kg; moderate: 300–2,000 mg/kg) [StopTox output]
- TPSA: absorption risk (high: > 140 Å²; moderate: 90–140 Å²) consistent with Veber criteria [17]
- hERG inhibition: ≥ 0.40 probability from Chemprop → flagged *high* (clinical QT prolongation risk, ICH E14 guidance)
- DILI: ≥ 0.50 probability from Chemprop → flagged *high*
- CYP polypharmacology: ≥ 3 of 5 isoforms with inhibition probability ≥ 0.50 → flagged *high* (drug interaction liability)
- BBB-: concordant non-permeability from both local GBM and Chemprop BBB_Martins → flagged as CNS-impermeable
- PAINS and BRENK structural alerts from RDKit → flagged *moderate*
- Lipinski/Veber violations → flagged *low*

### Module 5 — Interactive ADMET Dashboard

The dashboard aggregates all tool outputs into a visual summary updated in real-time as predictions complete (Figure 3). Panels include: (i) Summary metric cards (total molecules, mean MW, mean LogP, mean QED, mean oral bioavailability, Lipinski compliance rate); (ii) **Safety Flags** panel — proportion of molecules flagging hERG cardiotoxicity, DILI, PAINS, BRENK alerts, and BBB+ prediction, displayed as labelled progress bars; (iii) Global Toxicity Risk distribution (StopTox); (iv) ESOL Solubility distribution; (v) **Per-Molecule Risk Matrix** — tabular view with colour-coded Overall/hERG/DILI/ClinTox/BBB/QED indicators per molecule; (vi) **CYP Inhibition Heatmap** — probability matrix for five CYP isoforms × N molecules with three-tier colouring (green < 25%, amber 25–50%, red > 50%).

### Module 6 — Local Descriptor and ESOL Solubility Engine

Over 60 physicochemical and topological descriptors are computed locally via RDKit. Categories: constitutional (MW, FractionCSP3, Labute ASA, MolMR); drug-likeness filters — QED [18] and violation assessments for Lipinski [19], Ghose, Veber [17], Egan, and Muegge; topological indices (Balaban J, BertzCT, Kappa 1–3, Chi series); electronic/VSA descriptors (PEOE_VSA, SMR_VSA, SlogP_VSA); and structural alerts via PAINS (A/B/C), BRENK, and NIH filter catalogs from RDKit's FilterCatalog.

Aqueous solubility is predicted via the ESOL QSAR model [20]:

> **log S = 0.16 − 0.63·cLogP − 0.0062·MW + 0.066·RotB − 0.74·AP**

where AP is the fraction of aromatic atoms. The original model was trained on 1,144 compounds; Delaney reported RMSE = 0.97 log units (internal). Independent validation by Jain and Nicholls [21] on a structurally diverse test set yielded RMSE = 1.01 log units, implying an expected uncertainty of approximately ±1 order of magnitude. ESOL is appropriate as a rapid first-pass solubility screen; for lead optimization, users should prioritize experimental aqueous solubility or higher-accuracy models (e.g., AqSolDB-trained random forest models). Four solubility categories are reported: Insoluble (log S < −6), Poorly Soluble (−6 to −4), Moderately Soluble (−4 to −2), Soluble (> −2 mol/L).

Four molecular fingerprint protocols for downstream QSAR: RDKit (1,024 bits), Morgan/ECFP4 (2,048 bits, radius 2), MACCS keys (167 bits), Atom Pairs (2,048 bits).

### Module 7 — Batch Processing, Export, and Peptide Engineering

CSV files with Name and SMILES columns are accepted for batch input (up to 500 compounds per batch). Results are progressively appended to the session state as predictions complete. Export formats: (i) structured Excel workbook (`.xlsx`) with sheets for ADMET comparison, flat per-compound records, and fingerprint matrices formatted for direct scikit-learn/DeepChem ingestion; (ii) PDF clinical summary. Per-compound error isolation ensures that a malformed SMILES or a failed external query does not abort the batch.

Through the PepLink integration, bidirectional peptide-SMILES translation is available: amino acid sequences (e.g., ACDEFGH) are converted to canonical SMILES for standard small-molecule ADMET evaluation, and SMILES arrays are reverse-translated into amino acid sequences with automatic stereochemical disambiguation.

Chemical similarity is computed locally via Tanimoto coefficient on Morgan ECFP4 fingerprints, with configurable radius (1–4). Colour coding: green (Tc ≥ 0.70), amber (0.40–0.70), gray (< 0.40). SMILES-to-IUPAC conversion queries the PubChem PUG REST API, returning systematic name, InChI, InChIKey, and molecular formula.

---

## Results and Discussion

### Embedded ML Model Performance

**Tox21-RF:** On a stratified random 20% hold-out (n = 1,594), mean AUC-ROC across 12 endpoints = 0.81 (range: 0.72 for NR-PPAR-gamma to 0.89 for SR-MMP), consistent with published multi-output RF baselines [13]. Class imbalance (1:9 to 1:24 per endpoint) was addressed via `class_weight='balanced'`. Users should note that active rates for some Tox21 endpoints are very low (< 5%), making false-negative rates potentially high in prospective screening; the model is intended for initial filtering, not regulatory decision-making.

**BBB-GBM:** On a stratified random hold-out (15%, n = 1,171 from B3DB), AUC-ROC = 0.92 (95% bootstrap CI: [0.90, 0.94]), accuracy = 84.7%, balanced accuracy = 83.2%, F1 = 0.883 (Table 1). Applicability domain coverage at Tanimoto threshold 0.30: 94.2% of test compounds were within domain. The AD flag was triggered for 6.8% of test-set compounds (79/1,171), among whom accuracy dropped to 71.3%, confirming that out-of-domain predictions carry substantially higher uncertainty.

**Performance context:** Because the hold-out used stratified random splitting — not scaffold-based splitting — the reported AUC-ROC likely overestimates generalization to structurally novel chemotypes. Published models evaluated with scaffold-split on B3DB report AUC-ROC in the range 0.87–0.93 [9,10]. A rigorous scaffold-disjoint evaluation (Bemis-Murcko, implemented in RDKit) is underway and will be released in a subsequent version. In the interim, the AD flag serves as a practical surrogate: users receiving AD-flagged predictions are explicitly warned of reduced reliability.

**Table 1. BBB permeability model performance on a stratified 15% hold-out partition of B3DB (n = 1,171).**

| Metric | This work (stratified random split) | GraphB3 [9] (scaffold-split) | Typical RF/GBM scaffold-split range |
|--------|-------------------------------------|------------------------------|--------------------------------------|
| AUC-ROC | 0.92 (95% CI: 0.90–0.94) | 0.940 | 0.87–0.93 |
| Accuracy | 84.7% | 88.0% | 82–87% |
| F1 | 0.883 | 0.910 | 0.85–0.90 |
| Balanced Accuracy | 83.2% | — | — |
| Inference (CPU) | < 5 ms | N/A (GCN, GPU) | — |
| Applicability Domain | Tanimoto NN ≥ 0.30 | None reported | — |

*Note: Direct metric comparison between random-split and scaffold-split evaluations is not methodologically sound; this table is presented to contextualise the platform's model relative to the literature, with the caveat that our split protocol is less conservative than GraphB3's scaffold split. Values should not be interpreted as equivalent performance claims.*

**Deep ADMET (admet_ai/Chemprop):** Performance reported is that of the upstream *admet_ai* pre-trained models [7]: median AUC-ROC = 0.894 across 28 classification tasks (TDC leaderboard); mean RMSE = 0.47 across 25 regression tasks. SMILESRender uses these weights without modification; the platform contribution is integration, interface, and interpretation — not the D-MPNN training itself.

### Validation with Ten FDA-Approved Drugs

To confirm descriptor accuracy and BBB model biological plausibility, we assembled a structurally diverse benchmark of ten marketed drugs spanning six therapeutic classes (Table 2). This is an accuracy and plausibility check, not a statistical validation of ML performance (n = 10 is insufficient for the latter).

**Table 2. Physicochemical descriptors and ML-based ADMET predictions for ten FDA-approved drugs.**

| Drug | Class | MW | LogP | TPSA (Å²) | QED | Ro5 | ESOL | BBB (GBM) | BBB AD | hERG % | DILI % |
|------|-------|----|------|-----------|-----|-----|------|-----------|--------|--------|--------|
| Aspirin | Analgesic | 180.2 | 1.19 | 63.6 | 0.55 | Pass | Soluble | BBB+ | In | 5 | 32 |
| Ibuprofen | NSAID | 206.3 | 3.97 | 37.3 | 0.73 | Pass | Mod. | BBB+ | In | 3 | 21 |
| Acetaminophen | Analgesic | 151.2 | 0.46 | 49.3 | 0.59 | Pass | Soluble | BBB+ | In | 2 | 18 |
| Caffeine | CNS stim. | 194.2 | 0.16 | 61.4 | 0.56 | Pass | Soluble | BBB+ | In | 5 | 38 |
| Metformin | Antidiabetic | 129.2 | −1.43 | 88.5 | 0.30 | Pass | Soluble | BBB− | In | 1 | 12 |
| Atorvastatin | Statin | 558.6 | 5.67 | 111.8 | 0.34 | Fail* | Poorly | BBB− | In | 12 | 45 |
| Sildenafil | PDE5-i | 474.6 | 2.77 | 113.0 | 0.53 | Pass | Mod. | BBB− | In | 8 | 38 |
| Lisinopril | ACE-i | 405.5 | −0.09 | 138.9 | 0.29 | Pass | Soluble | BBB− | In | 3 | 22 |
| Tamoxifen | SERM | 371.5 | 6.30 | 41.6 | 0.44 | Fail‡ | Poorly | BBB+ | In | 11 | 55 |
| Ciprofloxacin | Antibiotic | 331.3 | 0.28 | 74.6 | 0.49 | Pass | Soluble | BBB− | In | 4 | 29 |

*MW in g/mol; TPSA in Å²; QED: quantitative estimate of drug-likeness [18]; Ro5: Lipinski Rule of 5 [19]; ESOL categories: Soluble (log S > −2), Moderately Soluble (−4 to −2), Poorly Soluble (< −4 mol/L); BBB AD: in-domain flag (Tanimoto NN ≥ 0.30); hERG/DILI: Chemprop D-MPNN probability (%); \*MW > 500 g/mol; ‡LogP > 5.*

The BBB model correctly classified 9 of 10 compounds against their known clinical CNS profiles. CNS-active drugs — Caffeine (adenosine receptor antagonist with documented brain distribution) and Tamoxifen (crosses BBB, documented in breast cancer brain metastasis trials) — were correctly predicted BBB+. Non-CNS drugs with high TPSA (Lisinopril: 138.9 Å², consistent with P-gp efflux and low passive permeability) and high polarity (Metformin: LogP = −1.43) were correctly predicted BBB−. Atorvastatin (BBB−) is correctly classified: despite high LogP, its documented P-gp efflux and large MW limit CNS penetration. Sildenafil (BBB−) was correctly classified — consistent with its lack of significant CNS activity at therapeutic doses. All ten compounds were within the BBB model applicability domain (Tanimoto NN ≥ 0.30).

The hERG probability of 55% for Tamoxifen (flagged high by the interpretation engine) is consistent with documented QT-prolonging potential at high doses reported in post-marketing surveillance. Caffeine DILI = 38% is classified *moderate*, not *high* — which is appropriate: caffeine is not a clinically recognised hepatotoxin at therapeutic doses, though hepatotoxicity has been observed in overdose contexts. Atorvastatin DILI = 45% is correctly in the moderate-high range, consistent with its black-box warning for myopathy and rare hepatotoxicity.

ESOL-predicted solubility categories were concordant with known BCS classifications: Tamoxifen and Atorvastatin (BCS Class II) predicted poorly soluble; all eight others predicted moderately or highly soluble (BCS Class I/III).

### ADMET Engine Benchmark — Response Times and Availability

**Table 3. ADMET engine performance benchmark.**

| Engine | Type | Mean Response | Availability | Endpoints covered |
|--------|------|--------------|--------------|-------------------|
| Tox21-RF | Local ML | 12 ms | 100% | 12 (in vitro bioassays) |
| BBB-GBM | Local ML | 4 ms | 100% | 1 (BBB permeability) |
| DeepADMET (admet_ai) | Local ML | 280 ms | 100% | 53 (full ADMET) |
| StopTox | External API | 17.8 s | ~95% | 6 (acute toxicity) |
| StopLight | External API | 3.0 s | ~97% | 11 (MPO scoring) |
| ProTox 3.0 | External API | 8–20 s | ~90% | 12 (organ toxicity) |

*Local ML availability is 100% by design (in-process). External API availability estimated over a 30-day monitoring window (May–June 2025, n = 300 queries per service). Response times for external engines are wall-clock and exclude network latency variation. With Redis caching active, a second query for any previously queried SMILES returns in under 10 ms (> 3,600-fold speedup versus uncached external query).*

### Batch Processing Case Study: Thieno[2,3-b]pyridine Derivatives

A library of 20 thieno[2,3-b]pyridine derivatives (DADOS_Uminho_1), a pharmacologically relevant kinase inhibitor scaffold functionalized at the C-5 amino position with diverse N-aryl and N-heteroaryl groups, was processed via batch CSV upload. Complete profiling — local ML (Tox21-RF, BBB-GBM, DeepADMET) plus all available external engine queries — completed in under 12 minutes, yielding a consolidated multi-sheet Excel export (Figure 4).

Key findings: (i) Three compounds bore PAINS alerts (rhodanine substructure, 2 compounds; catechol, 1 compound) — flagged moderate by the interpretation engine with explicit structural alert annotation. (ii) The BBB model predicted 14 of 20 derivatives (70%) as BBB+ with high confidence (probability > 0.70), consistent with the lipophilic aromatic core (mean LogP = 3.8 ± 0.6). (iii) The DeepADMET engine flagged two compounds with hERG inhibition probability > 0.60, triggering high-severity flags in the interpretation narrative. (iv) ESOL predicted all 20 derivatives as poorly to moderately soluble (log S: −3.8 to −5.6), consistent with the high aromatic proportion (AP: 0.47–0.58). No batch interruptions occurred for any engine.

The manual equivalent of this workflow — querying four separate web services, entering 20 SMILES strings individually at each, downloading heterogeneous output formats, and consolidating results — was independently timed at 2 h 55 min by a medicinal chemist familiar with all services. The automated batch export was available in 11 min 40 s, a 15-fold reduction. For non-expert users, the overhead would be substantially greater.

### Feature Comparison with Related Platforms

**Table 4. Feature comparison of SMILESRender with related open-access cheminformatics platforms.**

| Feature | SMILESRender | SwissADME [22] | pkCSM [23] | ADMETlab 3.0 [24] | admet_ai [7] (Python lib.) |
|---------|:---:|:---:|:---:|:---:|:---:|
| 2D structure rendering | ✓ | — | — | — | — |
| Interactive structure editor (JSME) | ✓ | — | — | — | — |
| Multi-engine ADMET (≥ 3 tools) | ✓ | — | — | — | — |
| Local ML: Tox21 (12 endpoints) | ✓ | — | — | — | — |
| Local ML: BBB + applicability domain | ✓ | — | — | — | — |
| Local ML: Chemprop D-MPNN (53 props) | ✓ | — | — | — | ✓ᵃ |
| Automated narrative interpretation | ✓ | — | — | — | — |
| ESOL solubility (local, no API) | ✓ | — | — | — | — |
| PAINS / BRENK structural alerts | ✓ | PAINSᵇ | — | PAINSᵇ | — |
| Lipinski / Veber / Ghose / Egan | ✓ | ✓ | — | ✓ | — |
| 60+ RDKit local descriptors | ✓ | Partialᶜ | — | — | — |
| 4 fingerprint types (export-ready) | ✓ | — | — | — | — |
| Chemical similarity search | ✓ | — | — | — | — |
| IUPAC nomenclature (PubChem) | ✓ | — | — | — | — |
| Reaction SMILES visualization | ✓ | — | — | — | — |
| Batch CSV upload | ✓ | ✓ | ✓ | ✓ | ✓ |
| Per-molecule risk matrix dashboard | ✓ | — | — | Partialᵈ | — |
| CYP inhibition heatmap | ✓ | Partialᵉ | ✓ | ✓ | ✓ᵃ |
| Docker / offline deployment | ✓ | — | — | — | Partialᶠ |
| Open source (MIT) | ✓ | — | — | — | ✓ |

*ᵃ admet_ai requires Python ≥ 3.10 installation; no web interface is provided. ᵇ SwissADME and ADMETlab 3.0 report PAINS alerts but not BRENK or NIH catalogs. ᶜ SwissADME provides ~15 physicochemical descriptors; not the full RDKit topological/electronic descriptor set. ᵈ ADMETlab 3.0 provides a dashboard but without per-molecule risk matrix or cross-tool aggregation. ᵉ SwissADME reports qualitative CYP inhibition for CYP3A4 and CYP2D6 only; not a quantitative 5-isoform heatmap. ᶠ admet_ai can be run locally but provides no containerisation or web interface.*

*Key differentiators of SMILESRender: (1) All critical ADMET computation is local-ML-first, not API-dependent; (2) Applicability domain flag on BBB model; (3) Automated interpretation engine converting outputs to structured narratives; (4) JSME interactive editor; (5) Docker reproducibility for identical results across deployments.*

---

## Planned Extensions: 3D Generation and Docking Interface

The current platform operates exclusively on 2D SMILES representations. Two extensions are in active development:

**3D Conformer Generation:** RDKit's ETKDG algorithm [25] will be integrated as a backend endpoint (`/generate/3d`) accepting canonical SMILES and returning an SDF file with an energy-minimized 3D conformer (MMFF94 force field). This will feed directly into the docking interface and will also enable 3D descriptor computation (surface area, shape similarity).

**Protein–Ligand Docking Interface:** A lightweight docking module is planned using AutoDock-GPU [26] or Vina [27] called via subprocess, with receptor preparation via Meeko [28]. The intended workflow: user uploads a PDB receptor file, selects a binding site (grid box definition), and submits a SMILES batch. Results are returned as docked poses (SDF) with ΔG binding scores and visualized in the browser via 3Dmol.js. This extension will be validated on a set of benchmark protein-ligand complexes from the PDBbind database [29] using re-docking RMSD as the primary metric.

**Limitation acknowledgment:** Rigid docking scores are not sufficient for reliable potency ranking, and their correlation with experimental IC50 is inherently limited by solvation and entropic terms. The docking module will be presented as a structural plausibility filter — a complement to, not a replacement for, ADMET profiling.

---

## Conclusions

SMILESRender addresses the workflow fragmentation that constitutes a persistent bottleneck in computational medicinal chemistry. By embedding three state-of-the-art machine learning models — a Tox21 Multi-Output Random Forest, a GraphB3-inspired GradientBoosting BBB classifier trained on B3DB (AUC-ROC = 0.92, 95% CI [0.90, 0.94], on stratified hold-out), and a Chemprop D-MPNN delivering 53 ADMET properties via admet_ai — alongside fault-tolerant external oracle orchestration, the platform ensures a minimum viable profile is available regardless of upstream service status.

The shift from pure API aggregation to a local-ML-first design represents a substantive improvement in reproducibility, availability, and data governance. Validation against ten FDA-approved drugs confirmed biologically correct BBB classification for 9/10 compounds and accurate descriptor computation across all structural categories. The automated interpretation engine surfaces clinically relevant signals — hERG cardiotoxicity, DILI, CYP polypharmacology, CNS permeability status — in plain-language narratives, reducing the interpretation burden for non-computational users.

**Limitations and future work:** The BBB model has been evaluated using stratified random splitting; scaffold-disjoint evaluation will be reported in a future release. ESOL solubility predictions carry ±1 order-of-magnitude uncertainty. External oracle response times are network-dependent and subject to upstream service changes. Future development targets: scaffold-split BBB validation with bootstrap confidence intervals; applicability domain for the Tox21 model; 3D conformer generation and lightweight protein–ligand docking interface; and an expanded panel of local environmental fate/ecotoxicity models.

---

## Availability and Requirements

- **Project name:** SMILESRender
- **Project home page:** https://github.com/rubithedev/smiles-render-web
- **Public cloud instance:** https://smiles-render.onrender.com
- **Operating system:** Platform-independent (Docker recommended); tested on Linux Ubuntu 22.04 LTS and Windows 11 Pro
- **Programming languages:** Python 3.12, TypeScript (React 19)
- **Key dependencies:** Flask 3.0.3, RDKit 2024.3.6, scikit-learn 1.8, admet_ai 1.x, Waitress 3.0.1, Redis 7.4, Bun 1.1
- **License:** MIT
- **Model files:** Tox21 and BBB model `.pkl` bundles distributed in the repository under `src/`

---

## Abbreviations

AD: applicability domain; ADMET: Absorption, Distribution, Metabolism, Excretion, Toxicity; AUC: area under the ROC curve; BBB: blood-brain barrier; BCS: Biopharmaceutics Classification System; CI: confidence interval; D-MPNN: Directed Message Passing Neural Network; DILI: drug-induced liver injury; ECFP: Extended Connectivity Fingerprint; ESOL: Estimated SOLubility; GBM: Gradient Boosting Machine; GHS: Globally Harmonized System; hERG: human Ether-à-go-go-Related Gene; JSME: Java Structure Molecular Editor; ML: machine learning; MPO: multi-parameter optimisation; PAINS: pan-assay interference compounds; QSAR: quantitative structure–activity relationship; QED: quantitative estimate of drug-likeness; RF: Random Forest; RDKit: open-source cheminformatics toolkit; Ro5: Lipinski Rule of 5; SMILES: Simplified Molecular Input Line Entry System; TDC: Therapeutics Data Commons; TPSA: topological polar surface area; WSGI: Web Server Gateway Interface.

---

## Declarations

**Competing interests:** The authors declare no competing interests.

**Authors' contributions:** RABS conceived the project, designed and implemented the full software stack, trained all local ML models, and performed all benchmarking experiments. GG contributed to architecture design and manuscript revision. All authors read and approved the final manuscript.

**Acknowledgements:** The authors thank the developers of RDKit (G. Landrum et al.), admet_ai (K. Swanson et al., Stanford), StopTox/StopLight (A. Borrel, K. Mansouri et al., NIH/NIEHS), and ProTox 3.0 (P. Banerjee et al., Charité Berlin) for providing open-access computational resources. The B3DB dataset (F. Meng et al., 2021) and Tox21 Challenge dataset are gratefully acknowledged. The thieno[2,3-b]pyridine dataset (DADOS_Uminho_1) was used with permission.

---

## References

1. Waring MJ, Arrowsmith J, Leach AR, Leeson PD, Mandrell S, Owen RM, et al. An analysis of the attrition of drug candidates from four major pharmaceutical companies. *Nat Rev Drug Discov.* 2015;14(7):475–486. https://doi.org/10.1038/nrd4609 (PMID: 26091267)

2. Paul SM, Mytelka DS, Dunwiddie CT, Persinger CC, Munos BH, Lindborg SR, Schacht AL. How to improve R&D productivity: the pharmaceutical industry's grand challenge. *Nat Rev Drug Discov.* 2010;9(3):203–214. https://doi.org/10.1038/nrd3078 (PMID: 20168317)

3. Muratov EN, Bajorath J, Sheridan RP, Tetko IV, Filimonov D, Poroikov V, et al. QSAR without borders. *Chem Soc Rev.* 2020;49(11):3525–3564. https://doi.org/10.1039/d0cs00098a (PMID: 32356548)

4. Borrel A, Mansouri K, Nolte S, Zurlinden T, Huang R, Xia M, Houck KA, Kleinstreuer NC. StopTox: an in silico alternative to animal acute systemic toxicity tests. *Environ Health Perspect.* 2022;130(2):027014. https://doi.org/10.1289/EHP9341 (PMID: 35138948)

5. Borrel A, Huang R, Sakamuru S, Xia M, Simeonov A, Mansouri K, Kleinstreuer NC. High-throughput screening to predict chemical-assay interference. *Sci Rep.* 2020;10(1):3986. https://doi.org/10.1038/s41598-020-60747-3 (PMID: 32127574)

6. Banerjee P, Dehnbostel FO, Preissner R. ProTox-3.0: a webserver for the prediction of toxicity of chemicals. *Nucleic Acids Res.* 2024;52(W1):W513–W520. https://doi.org/10.1093/nar/gkae303 (PMID: 38619038)

7. Swanson K, Boros P, Chen LC, Bhatt DL, Bonn-Miller MO, Wang H, Plotkin SS. ADMET-AI: a machine learning ADMET platform for evaluation of large-scale chemical libraries. *Bioinformatics.* 2024;40(7):btae416. https://doi.org/10.1093/bioinformatics/btae416 (PMID: 38942598)

8. Yang K, Swanson K, Jin W, Coley C, Eiden P, Gao H, et al. Analyzing learned molecular representations for property prediction. *J Chem Inf Model.* 2019;59(8):3370–3388. https://doi.org/10.1021/acs.jcim.9b00237 (PMID: 31361484)

9. Dhanjal JK, Wang S, Bhinder B, Singh Y, Kaur H, Grover A. GraphB3: an explainable graph convolutional network approach for blood-brain barrier permeability prediction. *J Cheminform.* 2024;16:34. https://doi.org/10.1186/s13321-024-00831-4

10. Meng F, Xi Y, Huang J, Ayers PW. A curated diverse molecular database of blood-brain barrier permeability with chemical descriptors. *Sci Data.* 2021;8(1):289. https://doi.org/10.1038/s41597-021-01069-5 (PMID: 34702863)

11. Landrum G, Tosco P, Kelley B, Rodriguez R, Cosgrove D, Vianello R, et al. RDKit: open-source cheminformatics. Version 2024.03.6. https://www.rdkit.org. Accessed May 2026. https://doi.org/10.5281/zenodo.591637

12. Ertl P, Bienfait B. JSME: a free molecule editor in JavaScript. *J Cheminform.* 2013;5:24. https://doi.org/10.1186/1758-2946-5-24 (PMID: 23681985)

13. Tice RR, Austin CP, Kavlock RJ, Bucher JR. Improving the human hazard characterization of chemicals: a Tox21 update. *Environ Health Perspect.* 2013;121(7):756–765. https://doi.org/10.1289/ehp.1205784 (PMID: 23603828)

14. Sheridan RP. Time-split cross-validation as a method for estimating the goodness of prospective prediction. *J Chem Inf Model.* 2013;53(4):783–790. https://doi.org/10.1021/ci400084k (PMID: 23521722)

15. Chen B, Sheridan RP, Hornak V, Voigt JH. Comparison of random forest and pipeline pilot naive Bayes in prospective QSAR predictions. *J Chem Inf Model.* 2012;52(3):792–803. https://doi.org/10.1021/ci200615h (PMID: 22280566)

16. Mansouri K, Grulke CM, Judson RS, Williams AJ. OPERA models for predicting physicochemical properties and environmental fate endpoints. *J Cheminform.* 2018;10(1):10. https://doi.org/10.1186/s13321-018-0263-1 (PMID: 29525896)

17. Veber DF, Johnson SR, Cheng HY, Smith BR, Ward KW, Kopple KD. Molecular properties that influence the oral bioavailability of drug candidates. *J Med Chem.* 2002;45(12):2615–2623. https://doi.org/10.1021/jm020017n (PMID: 12036371)

18. Bickerton GR, Paolini GV, Besnard J, Muresan S, Hopkins AL. Quantifying the chemical beauty of drugs. *Nat Chem.* 2012;4(2):90–98. https://doi.org/10.1038/nchem.1243 (PMID: 22270643)

19. Lipinski CA, Lombardo F, Dominy BW, Feeney PJ. Experimental and computational approaches to estimate solubility and permeability in drug discovery and development settings. *Adv Drug Deliv Rev.* 2001;46(1–3):3–26. https://doi.org/10.1016/s0169-409x(00)00129-0 (PMID: 11259830)

20. Delaney JS. ESOL: estimating aqueous solubility directly from molecular structure. *J Chem Inf Comput Sci.* 2004;44(3):1000–1005. https://doi.org/10.1021/ci034243x (PMID: 15154768)

21. Jain N, Nicholls A. Recommendations for evaluation of computational methods. *J Comput Aided Mol Des.* 2008;22(3–4):133–139. https://doi.org/10.1007/s10822-008-9196-5 (PMID: 18338228)

22. Daina A, Michielin O, Zoete V. SwissADME: a free web tool to evaluate pharmacokinetics, drug-likeness and medicinal chemistry friendliness of small molecules. *Sci Rep.* 2017;7:42717. https://doi.org/10.1038/srep42717 (PMID: 28256516)

23. Pires DEV, Blundell TL, Ascher DB. pkCSM: predicting small-molecule pharmacokinetic and toxicity properties using graph-based signatures. *J Med Chem.* 2015;58(9):4066–4072. https://doi.org/10.1021/acs.jmedchem.5b00104 (PMID: 25860834)

24. Gui C, Luo M, Wang Z, Ma H, Du Z, Yao L, et al. ADMETlab 3.0: an updated comprehensive online ADMET prediction tool with improved models and functions. *Nucleic Acids Res.* 2024;52(W1):W197–W204. https://doi.org/10.1093/nar/gkae420 (PMID: 38783180)

25. Riniker S, Landrum GA. Better informed distance geometry: using what we know to improve conformation generation. *J Chem Inf Model.* 2015;55(12):2562–2574. https://doi.org/10.1021/acs.jcim.5b00654 (PMID: 26575474)

26. Santos-Martins D, Solis-Vasquez L, Tillack AF, Sanner MF, Koch A, Forli S. Accelerating AutoDock4 with GPUs and gradient-based local search. *J Chem Theory Comput.* 2021;17(2):1060–1073. https://doi.org/10.1021/acs.jctc.0c01006 (PMID: 33403848)

27. Eberhardt J, Santos-Martins D, Tillack AF, Forli S. AutoDock Vina 1.2.0: new docking methods, expanded force field, and Python bindings. *J Chem Inf Model.* 2021;61(8):3891–3898. https://doi.org/10.1021/acs.jcim.1c00203 (PMID: 34278794)

28. Forli S, Huey R, Pique ME, Sanner MF, Goodsell DS, Olson AJ. Computational protein–ligand docking and virtual drug screening with the AutoDock suite. *Nat Protoc.* 2016;11(5):905–919. https://doi.org/10.1038/nprot.2016.051 (PMID: 27077332)

29. Su M, Yang Q, Du Y, Feng G, Liu Z, Li Y, Wang R. Comparative assessment of scoring functions: the CASF-2016 and CASF-2013 benchmarks. *J Chem Inf Model.* 2019;59(2):895–913. https://doi.org/10.1021/acs.jcim.8b00545 (PMID: 30481020)

---

## Figure Legends

**Figure 1.** SMILESRender hybrid system architecture. The three-tier design separates local ML computation (teal; zero network dependency) from external oracle orchestration (amber; optional, fault-isolated) and the React frontend (top). Three embedded ML model bundles (Tox21-RF, BBB-GBM, DeepADMET/Chemprop) serve predictions without any external API call. Dashed arrows represent optional external API calls subject to upstream availability. The Redis cache layer reduces redundant external queries by an estimated 60–80% in batch workflows.

**Figure 2.** BBB permeability model validation. (A) ROC curve on the stratified 15% hold-out partition of B3DB (n = 1,171), AUC-ROC = 0.92 with 95% bootstrap CI shaded. (B) Confusion matrix (threshold = 0.50). (C) Top-15 feature importances from the GradientBoosting model: LogP, TPSA, and aromatic ring count are the top physiochemical contributors, alongside specific ECFP4 bits associated with polar and aromatic fragments. (D) Applicability domain scatter plot showing Tanimoto nearest-neighbour similarity to training set for all test-set compounds; the AD threshold (0.30) is indicated by a dashed vertical line; the 79 out-of-domain compounds are highlighted in red.

**Figure 3.** SMILESRender ADMET Dashboard for a representative 5-compound batch. Top row: summary metric cards (mean QED = 0.63; mean oral bioavailability = 78%; Lipinski compliance = 100%). Middle-left: Safety Flags panel showing hERG risk in 2/5 and DILI in 1/5 compounds. Middle-right: StopTox toxicity distribution and ESOL solubility stacked bar. Bottom-left: Per-Molecule Risk Matrix table with colour-coded Overall/hERG/DILI/ClinTox/BBB/QED columns. Bottom-right: CYP Inhibition Heatmap (CYP1A2, CYP2C9, CYP2C19, CYP2D6, CYP3A4) with green/amber/red cell colouring by probability range.

**Figure 4.** Batch processing results for 20 thieno[2,3-b]pyridine derivatives. (A) BBB permeability distribution: BBB+ 70% (14/20). (B) ESOL solubility distribution: all compounds in poorly/moderately soluble range (log S −3.8 to −5.6). (C) CYP inhibition heatmap across all 20 compounds; CYP3A4 is the most frequently inhibited isoform (55%). (D) Overall risk classification: Low 45%, Moderate 40%, High 15%.

**Figure 5.** SMILESRender web interface. (A) Hub landing page with six module tiles. (B) ADMET Profiling page showing SMILES input with benzene-ring cursor, tool status badges, and DeepADMET prediction cards. (C) JSME interactive molecular editor. (D) Per-Molecule Risk Matrix and CYP Inhibition Heatmap in the Dashboard view.
