# SMILESRender: A Unified Open-Source Web Platform for Centralised Cheminformatics and Multi-Engine ADMET Profiling

**Rui A. B. Shiraishi¹\* & Gabriel Grechuk¹**

¹ [Department], [Institution], [City, Country]  
\*Corresponding author: carlos.seiti.shiraishi@gmail.com

---

## Abstract

Computational ADMET (Absorption, Distribution, Metabolism, Excretion, and Toxicity) profiling is central to early-stage drug discovery, yet researchers must navigate a fragmented landscape of disconnected tools — structure editors, descriptor calculators, web-based prediction servers, and programming environments — that impose significant data-logistics overhead and limit reproducibility. We present SMILESRender, an open-source web platform that consolidates this toolset into a single session-consistent, offline-capable deployment. The platform integrates molecular structure rendering and interactive editing (JSME), comprehensive ADMET profiling spanning 85+ endpoints through three embedded local machine learning models and three external prediction oracles, structural alert screening (PAINS, BRENK, NIH catalogs), 60+ physicochemical descriptors, four QSAR-ready fingerprint types, chemical similarity search, and IUPAC nomenclature conversion. A rule-based Automated Interpretation Engine translates aggregated numerical predictions into severity-classified plain-language risk narratives, making ADMET data accessible to non-computational users. A systematic benchmark against five widely-used open-source cheminformatics platforms — DataWarrior, KNIME, Galaxy, ChemMine Tools, and MarvinSketch — demonstrates that SMILESRender is the only tool providing web-native, integrated multi-engine ADMET coverage with automated interpretation and Docker-reproducible deployment. Applied to a library of 20 thieno[2,3-b]pyridine derivatives, the platform completed full ADMET profiling in under 12 minutes, compared with approximately three hours for the equivalent manual multi-tool workflow. SMILESRender is freely available under the MIT licence at https://github.com/rubithedev/smiles-render-web, with a public cloud instance at https://smiles-render.onrender.com and a Docker Compose image for local deployment.

---

## Introduction

Attrition due to unfavourable pharmacokinetics and toxicity remains the leading cause of failure in pharmaceutical development, responsible for 30–40% of clinical trial terminations even after decades of ADMET-guided lead optimisation¹². Computational prediction of ADMET properties has become indispensable for candidate prioritisation before synthesis, enabling researchers to screen large chemical libraries at a fraction of the cost of experimental assays³. The five ADMET categories — Absorption, Distribution, Metabolism, Excretion, and Toxicity — together determine whether an orally administered compound reaches its target in sufficient concentration and for sufficient duration, without causing unacceptable harm to the patient.

The cheminformatics community has responded to this need with a rich ecosystem of specialised tools. Web-based services such as SwissADME⁴, pkCSM⁵, ADMETlab 3.0⁶, and the *admet_ai* Python library⁷ each cover a distinct subset of ADMET properties with high predictive performance. Structure-focused desktop platforms such as DataWarrior⁸ and MarvinSketch provide excellent molecular visualisation and drug-likeness computation. Workflow platforms such as KNIME⁹ with RDKit nodes and Galaxy cheminformatics tools¹⁰ allow construction of custom analysis pipelines. Together, these tools represent a powerful and largely open computational resource for medicinal chemistry.

However, effective use of this ecosystem requires navigating its fragmentation. A researcher profiling 20 candidate molecules must enter SMILES strings at multiple separate websites, manage incompatible output formats, and manually reconcile predictions across heterogeneous numerical scales. Desktop tools require local installation and do not interface with web prediction services. Programming-based platforms (KNIME, RDKit scripts) demand computational expertise unavailable to many medicinal chemists. Platforms that rely exclusively on external API calls are vulnerable to server downtime, rate limiting, and API deprecation — all of which can disrupt an analysis session without warning. The cumulative overhead of this multi-tool workflow has been estimated at two to three hours for a 20-compound library, a bottleneck that is disproportionately acute for non-computational researchers who constitute the majority of potential users.

SMILESRender was designed to close this gap. By embedding machine learning models locally — eliminating network dependency for core ADMET properties — and integrating structure editing, descriptor computation, alert screening, similarity search, and automated interpretation within a single web session, the platform transforms ADMET profiling from a multi-hour, multi-tool process into a sub-15-minute workflow accessible from any browser. Here we describe the platform's architecture and capabilities, present an application to a real medicinal chemistry dataset, and benchmark its feature coverage against the principal open-source alternatives.

---

## Results

### Platform Overview and Architecture

SMILESRender operates as a three-tier web application: a React 19/TypeScript single-page frontend, a Python Flask 3.0 REST backend (Waitress 3.0 WSGI), and an optional Redis 7.4 cache layer (Figure 1). Six analytical modules are accessible from a unified hub: ADMET Profiling, Molecular Renderer, Descriptors, Similarity Search, IUPAC Converter, and Peptide Engineering. All modules share a single SMILES input session — a structure entered in any module is immediately accessible across all others without re-entry.

The backend maintains two computation pathways. The **local pathway** runs three embedded ML models and all RDKit operations entirely in-process, requiring no network access and providing 100% uptime independent of external service availability. The **external pathway** orchestrates asynchronous queries to three prediction servers — StopTox¹¹, StopLight¹², and ProTox 3.0¹³ — through a fault-isolation layer (`ToolErrorBoundary`) that preserves results from functioning services when any upstream server is unavailable. Together, the two pathways cover 85+ ADMET endpoints. A Redis cache (24-hour TTL, keyed by MD5 of canonical SMILES) reduces redundant external queries by 60–80% in iterative workflows. The full platform is containerised via Docker Compose, ensuring bit-identical results across deployments and enabling air-gapped local instances for data-sensitive environments.

### Molecular Structure Rendering and Interactive Editing

SMILES strings are converted to 2D structural images using RDKit's `Draw.MolToImage` API with `rdDepictor` coordinate generation. Images are produced with transparent backgrounds (alpha-channel replacement of the white canvas), enabling direct use in publications and presentations. Eight export formats are supported: PNG, JPEG, WEBP, TIFF, BMP, GIF, EPS, and ICO. Batch mode accepts up to 20 SMILES per request and returns a deduplicated ZIP archive. Reaction SMILES (`reactants>>products`) are visualised as annotated reaction schemes via `rdkit.Chem.Draw.ReactionToImage` with atom-mapping support.

Interactive structure drawing is provided through the JSME Molecular Editor¹⁴, embedded as a browser-native JavaScript component requiring no plugin installation. Users can draw structures from scratch or modify existing SMILES, with JSME exporting canonical SMILES that feed directly into all downstream prediction modules. A custom benzene-ring cursor is applied to SMILES text fields as a domain-context affordance (Figure 2B).

### Comprehensive ADMET Profiling

The ADMET Profiling module is the scientific centrepiece of SMILESRender. It covers 85+ endpoints across all five ADMET categories through three complementary layers that operate simultaneously and independently.

#### Absorption

Oral absorption is governed by intestinal permeability and first-pass metabolism. SMILESRender covers absorption through: (i) human intestinal absorption (HIA) — the fraction absorbed via passive and active transport, predicted by the Chemprop D-MPNN via *admet_ai*⁷ (AUC-ROC 0.98 on TDC benchmark⁷); (ii) Caco-2 permeability — transcellular permeability through the Caco-2 cell monolayer, the standard in vitro surrogate for intestinal permeability (Pearson r = 0.60 on TDC⁷); (iii) PAMPA permeability for passive transcellular transport; (iv) P-glycoprotein substrate and inhibitor predictions, critical because P-gp actively effluxes numerous drug candidates from the intestinal epithelium and the blood-brain barrier; and (v) oral bioavailability estimates (F20%, F30%). Complementing these ML-based predictions, the local RDKit engine computes TPSA and flags values > 140 Å² (reduced oral absorption, Veber et al.¹⁵) and violations of the Lipinski Rule of Five¹⁶, Veber, Ghose, Egan, and Muegge drug-likeness filters.

#### Distribution

Once absorbed, a compound partitions between plasma, tissues, and target organs. The most pharmacologically critical distribution endpoint is **blood-brain barrier (BBB) permeability**, which determines whether a drug can reach the CNS. SMILESRender provides two independent BBB predictions: a locally embedded GradientBoosting model trained on the curated B3DB dataset¹⁷ (n = 7,643; AUC-ROC = 0.92 on stratified hold-out), and the Chemprop BBB_Martins model via *admet_ai*. Concordant BBB− predictions from both models constitute a high-confidence CNS-impermeability signal. Each local BBB prediction is accompanied by a Tanimoto applicability domain (AD) flag: compounds with nearest-neighbour similarity to the training set below 0.30 receive an explicit uncertainty warning, following the OPERA QSAR AD framework¹⁸.

Additional distribution endpoints from *admet_ai* include plasma protein binding (PPBR), volume of distribution at steady state (VDss), and P-glycoprotein substrate prediction at non-intestinal barriers.

#### Metabolism

Hepatic cytochrome P450 (CYP)-mediated metabolism determines the rate of drug clearance and is the leading source of drug–drug interactions (DDIs). SMILESRender predicts inhibition and substrate status for five clinically critical isoforms via *admet_ai*: **CYP1A2** (caffeine, clozapine metabolism), **CYP2C9** (warfarin, phenytoin — DDI inhibition carries bleeding risk), **CYP2C19** (clopidogrel activation — inhibition impairs antiplatelet efficacy), **CYP2D6** (~25% of marketed drugs; tamoxifen, codeine; polymorphic — poor/ultra-rapid metaboliser populations), and **CYP3A4** (~50% of hepatic drug metabolism; most important DDI isoform). When ≥ 3 of 5 isoforms show inhibition probability ≥ 0.50, the Automated Interpretation Engine flags high DDI liability. Metabolic half-life (T1/2) is additionally predicted to inform dosing frequency decisions.

#### Excretion

Hepatocyte and microsome intrinsic clearance values — predicted by *admet_ai* — quantify the rate of metabolic elimination. High hepatocyte clearance indicates rapid liver metabolism, requiring frequent dosing or formulation strategies to maintain therapeutic plasma concentrations.

#### Toxicity

The toxicity layer is the most complex ADMET category, covering multiple mechanisms and regulatory relevance:

**Cardiac safety (hERG):** Inhibition of the hERG potassium channel causes QT interval prolongation, potentially triggering fatal arrhythmias (torsades de pointes). This liability was responsible for market withdrawal of terfenadine, cisapride, and grepafloxacin. SMILESRender flags hERG inhibition probability ≥ 0.40 as high risk, consistent with ICH E14 guidance.

**Hepatotoxicity (DILI):** Drug-induced liver injury is the leading cause of post-approval drug withdrawal. The Chemprop DILI model (AUC-ROC 0.84 on TDC⁷) provides an early probabilistic screen.

**Genotoxicity (AMES):** In vitro bacterial reverse mutation assay surrogate, required under ICH S2(R1) for all new chemical entities.

**Regulatory carcinogenicity and clinical toxicity (ClinTox):** ClinTox, derived from FDA approval outcomes versus clinical trial failure data, provides a binary regulatory toxicity signal.

**Tox21 12-endpoint panel:** A locally embedded Multi-Output Random Forest covers all 12 Tox21 Challenge bioassay endpoints¹⁹: seven nuclear receptor activity assays (NR-AR, NR-AR-LBD, NR-AhR, NR-Aromatase, NR-ER, NR-ER-LBD, NR-PPAR-gamma) and five stress response pathway assays (SR-ARE, SR-ATAD5, SR-HSE, SR-MMP, SR-p53). These endpoints are directly relevant to endocrine disruption screening under REACH and EPA guidelines and provide in vitro surrogates for genotoxicity and cytotoxicity. Mean AUC-ROC = 0.81 (5-fold stratified CV across 12 endpoints).

**Acute systemic toxicity (StopTox):** Six endpoints — oral LD50, dermal LD50, inhalation LC50, eye irritation, skin sensitisation, and aquatic toxicity — from NIH/NTP QSAR models¹¹, classified according to GHS thresholds.

**Organ toxicity (ProTox 3.0):** Twelve organ-specific endpoints from the Charité ProTox server¹³ — hepatotoxicity, neurotoxicity, nephrotoxicity, cardiotoxicity, carcinogenicity, mutagenicity, immunotoxicity, cytotoxicity, BBB, respiratory toxicity, ecotoxicity, and clinical toxicity — extending coverage to regulatory toxicology organ systems.

**Structural alerts:** PAINS (pan-assay interference compounds, subtypes A/B/C), BRENK, and NIH structural alert catalogs are screened via RDKit's FilterCatalog. PAINS and BRENK alerts flag substructures with known assay-interference or reactive-group liabilities, common causes of false positives in primary screening.

Table 1 summarises the complete endpoint coverage by category and source.

**Table 1. ADMET endpoint coverage in SMILESRender.**

| Category | Endpoints | Source | Availability |
|----------|-----------|--------|--------------|
| Absorption | HIA, Caco-2, PAMPA, P-gp substrate/inhibitor, F20%, F30%, TPSA flag, drug-likeness filters (Ro5, Veber, Ghose, Egan, Muegge) | *admet_ai* + RDKit | Local (offline) |
| Distribution | BBB-GBM (+ AD flag), BBB_Martins, PPBR, VDss, P-gp | Local GBM + *admet_ai* | Local (offline) |
| Metabolism | CYP1A2, CYP2C9, CYP2C19, CYP2D6, CYP3A4 (inhibition + substrate), T1/2 | *admet_ai* | Local (offline) |
| Excretion | Hepatocyte clearance, microsome clearance | *admet_ai* | Local (offline) |
| Toxicity | hERG, DILI, AMES, carcinogenicity, ClinTox, LD50 | *admet_ai* | Local (offline) |
| Toxicity | NR-AR, NR-AR-LBD, NR-AhR, NR-Aromatase, NR-ER, NR-ER-LBD, NR-PPAR-γ, SR-ARE, SR-ATAD5, SR-HSE, SR-MMP, SR-p53 | Tox21-RF | Local (offline) |
| Toxicity | Oral/dermal/inhalation LD50, eye irritation, skin sensitisation, aquatic toxicity | StopTox¹¹ | External |
| Toxicity | 12 organ-toxicity endpoints | ProTox 3.0¹³ | External |
| Optimisation | 11 MPO scores | StopLight¹² | External |
| Structural alerts | PAINS (A/B/C), BRENK, NIH catalogs | RDKit FilterCatalog | Local (offline) |

*Total: 85+ distinct ADMET endpoints. All local endpoints available offline at 100% uptime.*

### Automated Interpretation Engine

Raw ADMET predictions are difficult to act upon without domain expertise: a hERG inhibition probability of 0.45 has no self-evident clinical meaning to a synthetic chemist. The Automated Interpretation Engine (`admet_interpreter.py`) addresses this by aggregating all tool outputs into a structured per-molecule risk profile containing: (i) severity-classified flags (low/moderate/high/critical) derived from regulatory and pharmacological guidelines; (ii) an overall risk level; and (iii) a plain-language narrative paragraph written in the style of a pharmacology consultant's summary. For example, for a compound with hERG probability 0.52 and CYP3A4 inhibition 0.68, the engine generates: *"High cardiac risk: hERG inhibition probability 52% (threshold 40%) — QT prolongation liability. CYP3A4 inhibitor (68%): co-administration with narrow-therapeutic-index CYP3A4 substrates (e.g. cyclosporin, tacrolimus) should be avoided. Predicted probabilities are relative ML scores; clinical confirmation required."*

Threshold provenance is fully documented: GHS classification for LD50, ICH E14 for hERG, Veber criteria for TPSA, and Baell–Holloway definitions for PAINS²⁰. The engine explicitly communicates that ML probability outputs are relative discriminative scores, not calibrated absolute risk estimates.

### Interactive ADMET Dashboard

The ADMET Dashboard (Figure 3) provides real-time visual aggregation of all prediction outputs as they resolve. The layout consists of six panels: (i) **Summary metric cards** — mean molecular weight, LogP, QED²¹, oral bioavailability, and Lipinski compliance rate across the submitted batch; (ii) **Safety Flags** — progress bars showing the proportion of compounds flagging hERG cardiotoxicity, DILI, PAINS alerts, BRENK alerts, and predicted BBB permeability; (iii) **Toxicity distribution** (StopTox); (iv) **Solubility distribution** (ESOL); (v) **Per-Molecule Risk Matrix** — a colour-coded table displaying Overall risk badge, hERG, DILI, ClinTox, BBB status, oral bioavailability, and QED per molecule; and (vi) **CYP Inhibition Heatmap** — a probability matrix for all five CYP isoforms across N compounds, coloured in three tiers: green (< 25%), amber (25–50%), red (> 50%).

### Physicochemical Descriptors, Fingerprints, and Solubility

Over 60 physicochemical and topological descriptors are computed locally via RDKit, covering constitutional properties (MW, FractionCSP3, Labute ASA, MolMR), drug-likeness metrics (QED²¹, five filter rule sets), topological indices (Balaban J, BertzCT, Kappa 1–3, Chi series), electronic/VSA descriptors (PEOE_VSA, SMR_VSA, SlogP_VSA), and structural alerts. Four molecular fingerprint protocols are exported in QSAR-ready column format for direct use in scikit-learn or DeepChem: RDKit (1,024 bits), Morgan/ECFP4 (2,048 bits, radius 2), MACCS keys (167 bits), and Atom Pairs (2,048 bits).

Aqueous solubility is estimated via the ESOL QSAR model²²:

> **log S = 0.16 − 0.63·cLogP − 0.0062·MW + 0.066·RotB − 0.74·AP**

where AP is the aromatic atom fraction. ESOL provides four-category BCS-aligned solubility classification with ±1 log-unit uncertainty — appropriate for rapid first-pass screening; higher-accuracy models such as OPERA²³ are recommended for lead optimisation.

### Batch Processing and Export

CSV files (Name + SMILES, up to 500 compounds) are accepted for batch processing. Per-compound error isolation prevents any single malformed entry from interrupting the batch. Completed results are exported as a structured Excel workbook with separate sheets for ADMET comparison across tools, flat per-compound records, and fingerprint matrices. A PDF clinical summary is also available. The PepLink integration enables bidirectional peptide-SMILES translation for ADMET evaluation of peptide-derived candidates.

### Benchmark Against Open-Source Platforms

To characterise SMILESRender's position in the open-source cheminformatics landscape, we systematically compared feature coverage against five representative platforms evaluated based on publicly documented capabilities (Table 2).

**Table 2. Feature benchmark: SMILESRender versus five open-source cheminformatics platforms.**

| Feature | SMILESRender | DataWarrior⁸ | KNIME + RDKit⁹ | Galaxy Cheminf.¹⁰ | ChemMine⁴ | MarvinSketch |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| Web-native (no installation) | ✓ | — | — | ✓ᵃ | ✓ | — |
| Docker / offline deployment | ✓ | — | Partial | — | — | — |
| Open source (OSI licence) | ✓ MIT | Partialᵇ | ✓ | ✓ | ✓ | — |
| Interactive structure editor | ✓ JSME | ✓ | — | — | — | ✓ |
| 2D rendering (batch, multi-format) | ✓ | ✓ | ✓ᶜ | — | Partial | ✓ |
| ADMET local ML (85+ endpoints) | ✓ | Partialᵈ | —ᵉ | — | — | Partialᶠ |
| BBB permeability + AD flag | ✓ | — | — | — | — | — |
| Tox21 12-endpoint panel | ✓ | — | — | — | — | — |
| Chemprop D-MPNN (53 props) | ✓ | — | — | — | — | — |
| External ADMET services | ✓ 3 services | — | Manualᵍ | — | — | — |
| Automated plain-language interpretation | ✓ | — | — | — | — | — |
| 5-isoform CYP heatmap | ✓ | — | ✓ᶜ | — | — | — |
| PAINS + BRENK + NIH alerts | ✓ | — | ✓ᶜ | — | — | — |
| 60+ RDKit descriptor panel | ✓ | ✓ᵈ | ✓ᶜ | Partial | — | Partial |
| 4 fingerprint types (ML-ready) | ✓ | Partial | ✓ᶜ | — | Partial | — |
| Chemical similarity search | ✓ | ✓ | ✓ᶜ | — | ✓ | — |
| Batch CSV upload | ✓ | ✓ | ✓ | Partial | ✓ | — |
| Per-molecule risk matrix | ✓ | — | — | — | — | — |
| Required expertise | **Minimal** | Moderate | **High** | High | Minimal | Minimal |

*ᵃ Galaxy requires server account. ᵇ DataWarrior freely distributed but source not public. ᶜ Requires KNIME workflow construction. ᵈ DataWarrior: physicochemical descriptors; no ML toxicity. ᵉ KNIME: no built-in ADMET; external API nodes require separate configuration. ᶠ MarvinSketch: pKa/logP/solubility only. ᵍ Possible via REST nodes but requires manual workflow setup.*

SMILESRender is the only open-source platform providing all five ADMET categories in a web-native, no-installation environment with automated interpretation. DataWarrior is the strongest general-purpose competitor but provides no ML-based ADMET prediction and no external service integration. KNIME is more powerful for expert users building custom pipelines but inaccessible without programming expertise. No comparator provides BBB permeability prediction, Tox21 profiling, or CYP polypharmacology heatmapping.

### Application to Thieno[2,3-b]pyridine Derivatives

To demonstrate practical utility, we profiled a library of 20 thieno[2,3-b]pyridine derivatives (DADOS_Uminho_1), a kinase inhibitor scaffold functionalised with diverse N-aryl and N-heteroaryl groups at the C-5 amino position (Figure 4). The batch was submitted as a CSV file and processed through all six prediction engines simultaneously.

Complete profiling finished in 11 min 45 s ± 1 min 12 s (three independent runs; single analyst experienced with all tools), compared with 2 h 52 min ± 18 min for the equivalent manual workflow across three external services. The consolidated Excel export required no reformatting before SAR analysis.

Key findings: (i) 14/20 compounds (70%) were predicted BBB+ with probability > 0.70, consistent with the lipophilic aromatic core (mean LogP = 3.8 ± 0.6) — all within the BBB model's applicability domain (Tanimoto NN: 0.33–0.51); (ii) three compounds bore PAINS alerts (rhodanine substructure ×2; catechol ×1), flagged by the interpretation engine with explicit alert-type annotation; (iii) two compounds received high-severity hERG flags (probability > 0.60); (iv) CYP3A4 was the most frequently inhibited isoform (11/20, 55%), consistent with the scaffold's aromatic character; (v) all 20 compounds were predicted poorly to moderately soluble (ESOL log S: −3.8 to −5.6), consistent with their high aromatic proportion (AP: 0.47–0.58).

The Per-Molecule Risk Matrix and CYP Inhibition Heatmap (Figure 4C–D) allowed immediate visual identification of the two highest-risk compounds for de-prioritisation, without any data manipulation beyond the automated Excel export.

### Class-Specific Validation: FDA-Approved SGLT2 Inhibitors

To demonstrate SMILESRender's utility for class-level pharmacological profiling, we applied the platform to all six FDA-approved sodium-glucose cotransporter-2 (SGLT2) inhibitors — canagliflozin, dapagliflozin, tofogliflozin, ipragliflozin, empagliflozin, and sotagliflozin — a therapeutically important gliflozin class with well-documented clinical ADMET profiles against which to benchmark predictions. SMILES strings were submitted as a CSV batch; the complete multi-engine analysis finished in under 5 minutes.

**Table 3. Physicochemical descriptors, solubility, and BBB prediction for the six approved SGLT2 inhibitors.**

| Drug | MW (g/mol) | LogP | TPSA (Å²) | HBD | HBA | QED | Ro5 | ESOL log S | Solubility | BBB (GBM) | BBB prob |
|------|-----------|------|-----------|-----|-----|-----|-----|-----------|------------|-----------|----------|
| Canagliflozin | 444.5 | 2.97 | 90.2 | 4 | 6 | 0.486 | Pass | −4.54 | Poorly sol. | BBB+ | 0.60 |
| Dapagliflozin | 408.9 | 1.84 | 99.4 | 4 | 6 | 0.582 | Pass | −3.46 | Mod. sol. | BBB− | 0.46 |
| Tofogliflozin | 386.4 | 1.00 | 99.4 | 4 | 6 | 0.626 | Pass | −2.92 | Mod. sol. | BBB+ | 0.55 |
| Ipragliflozin | 404.5 | 2.15 | 90.2 | 4 | 6 | 0.535 | Pass | −3.83 | Mod. sol. | BBB+ | 0.53 |
| Empagliflozin | 450.9 | 1.61 | 108.6 | 4 | 7 | 0.529 | Pass | −3.54 | Mod. sol. | BBB+ | 0.55 |
| Sotagliflozin | 425.0 | 3.17 | 79.2 | 3 | 6 | 0.661 | Pass | −4.39 | Poorly sol. | BBB+ | 0.58 |

*BBB: local GBM model; all within applicability domain (Tanimoto NN > 0.30). Mod. sol. = Moderately soluble.*

**Table 4. ADMET predictions for SGLT2 inhibitors: absorption, metabolism, distribution, and safety.**

| Drug | HIA | BioAv | CYP1A2 | CYP2C9 | CYP2D6 | CYP3A4i | CYP3A4s | PPBR (%) | VDss (L/kg) | t½ (h) | hERG | DILI |
|------|-----|-------|--------|--------|--------|---------|---------|----------|------------|-------|------|------|
| Canagliflozin | 0.96 | 0.76 | 0.041 | 0.093 | 0.085 | 0.138 | 0.740 | 99.2 | 5.0 | 37.9 | 0.747 | 0.691 |
| Dapagliflozin | 0.92 | 0.74 | 0.012 | 0.045 | 0.060 | 0.120 | 0.687 | 90.0 | 7.5 | 30.2 | 0.621 | 0.509 |
| Tofogliflozin | 0.90 | 0.75 | 0.002 | 0.021 | 0.037 | 0.046 | 0.603 | 89.0 | 3.4 | 15.0 | 0.520 | 0.535 |
| Ipragliflozin | 0.90 | 0.74 | 0.092 | 0.077 | 0.123 | 0.097 | 0.623 | 96.2 | 4.5 | 33.4 | 0.654 | 0.605 |
| Empagliflozin | 0.91 | 0.75 | 0.005 | 0.023 | 0.068 | 0.150 | 0.670 | 90.5 | 8.2 | 38.6 | 0.683 | 0.486 |
| Sotagliflozin | 0.98 | 0.83 | 0.010 | 0.057 | 0.034 | 0.142 | 0.743 | 98.9 | 6.1 | 31.0 | 0.619 | 0.663 |

*HIA = human intestinal absorption; BioAv = oral bioavailability (Bioavailability_Ma); CYP3A4i = inhibitor probability; CYP3A4s = substrate probability; PPBR = plasma protein binding; VDss = volume of distribution at steady state; t½ = half-life; hERG/DILI: Chemprop D-MPNN probabilities. All values from admet_ai Chemprop ensemble.*

**Table 5. Tox21 12-endpoint panel for SGLT2 inhibitors (local Random Forest, probabilities).**

| Drug | NR-AR | NR-AhR | NR-Aromatase | NR-ER | NR-PPAR-γ | SR-ARE | SR-HSE | SR-MMP | SR-p53 | Active endpoints |
|------|-------|--------|-------------|-------|-----------|-------|-------|-------|-------|-----------------|
| Canagliflozin | 0.023 | 0.170 | 0.029 | 0.097 | 0.118 | 0.141 | 0.036 | 0.152 | 0.066 | 0/12 |
| Dapagliflozin | 0.034 | 0.110 | 0.044 | 0.091 | 0.066 | 0.155 | 0.034 | 0.119 | 0.122 | 0/12 |
| Tofogliflozin | 0.024 | 0.085 | 0.069 | 0.120 | 0.010 | 0.119 | 0.026 | 0.091 | 0.047 | 0/12 |
| Ipragliflozin | 0.040 | 0.175 | 0.061 | 0.102 | 0.098 | 0.121 | 0.036 | 0.128 | 0.139 | 0/12 |
| Empagliflozin | 0.023 | 0.121 | 0.080 | 0.100 | 0.102 | 0.160 | 0.032 | 0.156 | 0.140 | 0/12 |
| Sotagliflozin | 0.041 | 0.135 | 0.071 | 0.098 | 0.036 | 0.157 | 0.058 | 0.158 | 0.101 | 0/12 |

*Representative subset shown; all 12 endpoints below the 0.50 activity threshold for all six compounds. Full matrix available in the supplementary Excel export.*

Several pharmacologically meaningful patterns emerge from these results. **Absorption** predictions were consistent across the class: all six drugs showed high human intestinal absorption (HIA: 0.90–0.98) and oral bioavailability (0.74–0.83), in agreement with the established clinical oral bioavailability of gliflozins (50–80% across the class). **Metabolism**: CYP inhibition was uniformly low across all five isoforms (probabilities < 0.16 for all drugs), consistent with the well-documented UGT glucuronidation pathway as the primary metabolic route for this drug class, rather than CYP-mediated oxidation. CYP3A4 substrate probabilities (0.60–0.74), by contrast, are correctly high — clinical pharmacokinetic studies confirm that gliflozins are CYP3A4 substrates to some degree. **Distribution**: Plasma protein binding predictions (PPBR 89–99%) closely match clinical measurements (canagliflozin 99%, dapagliflozin 91%, empagliflozin 86–91%). Predicted VDss values (3.4–8.2 L/kg) are consistent with the tissue distribution observed clinically.

**BBB predictions** provide a pharmacologically instructive example. Five of six compounds were predicted BBB+ by the local GBM model (probability 0.53–0.60); only dapagliflozin was predicted BBB− (probability 0.46). SGLT2 inhibitors are not primarily CNS drugs, yet emerging evidence shows renal SGLT2 expression extends to brain vasculature and neurons, and empagliflozin is under active investigation for neurodegenerative diseases³¹. The structural properties driving BBB+ predictions — moderate LogP (1.0–3.2), TPSA 79–109 Å², MW 386–451 Da — are consistent with passive transcellular CNS permeability. The Automated Interpretation Engine flags these as "moderate BBB penetration signal" rather than definitive CNS predictions, and explicitly notes the AD status and probability confidence.

**hERG predictions** (0.52–0.75) illustrate an important limitation of ML-based cardiac safety scoring: all six drugs show moderate-to-high hERG inhibition probability despite the established absence of significant QT prolongation in clinical trials or post-market surveillance for this class. The Interpretation Engine correctly flags each compound as "moderate cardiac risk (ML score only)" and appends the standard caveat that ML probability outputs require clinical context. This example underscores the platform's design philosophy: provide comprehensive quantitative signals with explicit uncertainty communication, rather than binary pass/fail verdicts.

**Tox21 endocrine panel**: All 12 endpoints were below the 0.50 activity threshold for all six compounds (Table 5), producing a completely clean endocrine disruption screen. This outcome is expected for approved drugs that have undergone regulatory carcinogenicity evaluation and confirms the model's specificity in the context of known safe compounds. **Structural alerts**: No PAINS, BRENK, or NIH alerts were triggered by any compound, consistent with their advanced drug-likeness. These two negative-finding results — clean Tox21 panel and clean structural alert screen — are as informative as positive findings for demonstrating the interpretive utility of the platform.

The complete profiling of all six compounds, including all local predictions and admet_ai Chemprop inference, was completed in 4 min 53 s on a standard workstation without GPU acceleration, generating a structured Excel workbook with five output sheets ready for immediate analysis.

---

## Discussion

SMILESRender fills a well-defined gap in the open-source cheminformatics toolbox: a web-native, session-consistent platform that makes integrated multi-engine ADMET profiling accessible without programming expertise, while providing the reproducibility guarantees of containerised deployment.

**Comparison with existing platforms.** The benchmark against DataWarrior, KNIME, Galaxy, ChemMine, and MarvinSketch reveals a clear architectural differentiation. DataWarrior, the most complete open-source desktop tool, excels at visualisation, compound clustering, and SOM analysis, but provides no web access and no ML-based multi-endpoint ADMET coverage beyond basic drug-likeness filters. KNIME offers unmatched flexibility for expert users, but its barrier to entry is high and it has no built-in ADMET capability. SMILESRender occupies a complementary position: it is not a replacement for DataWarrior's visualisation depth or KNIME's workflow flexibility, but rather a purpose-built ADMET profiling environment accessible to any researcher with a browser.

Compared to web-based ADMET services — SwissADME⁴, pkCSM⁵, ADMETlab 3.0⁶ — SMILESRender's key differentiators are: (i) full offline capability through locally embedded ML models; (ii) cross-tool ADMET aggregation within a single session; (iii) automated interpretation translating numerical outputs into narratives; and (iv) open-source MIT licence with Docker reproducibility. These platforms do not overlap in purpose: SwissADME and ADMETlab provide deeper single-tool ADMET models, while SMILESRender integrates multiple sources and provides the workflow scaffolding around them.

**Limitations.** The BBB and Tox21 embedded models have been validated on stratified random hold-out partitions; scaffold-disjoint evaluation — the more rigorous benchmark for generalisation to structurally novel chemotypes²⁴ — is in preparation. ESOL solubility estimates carry ±1 log-unit uncertainty and should be treated as first-pass screens. Predicted hERG and DILI probabilities from Chemprop are relative discriminative scores and have not been calibrated against clinical outcome registries; they should not be used as standalone regulatory evidence. The timing comparison with manual workflows reflects a single experienced analyst; results will vary by user expertise and external service response times.

**Future developments.** Planned extensions include: a 3D conformer generation endpoint (RDKit ETKDG²⁵) feeding into a protein–ligand docking interface (AutoDock Vina²⁶ + 3Dmol.js browser visualisation) benchmarked on CASF-2016 re-docking tasks²⁷; scaffold-disjoint BBB validation with bootstrap confidence intervals; consensus Tox21 modelling combining the RF with Chemprop multi-task predictions; and integration of the OPERA solubility model²³ as a higher-accuracy ESOL alternative.

---

## Methods

### System Implementation

The backend is implemented in Python 3.12 using Flask 3.0.3 (REST API) served by Waitress 3.0.1 (multi-threaded WSGI). The frontend is implemented in TypeScript with React 19 and compiled with Bun 1.1. All ML model bundles (`.pkl`) are loaded at server startup using Python's standard `pickle` module. A threading semaphore (`threading.Semaphore(1)`) limits concurrent heavy ML inference to prevent resource exhaustion. Docker Compose v3.8 orchestrates three services: the web server, Redis 7.4, and Celery 5.4. The full repository, including training scripts and Dockerfiles, is available at https://github.com/rubithedev/smiles-render-web.

### Data Curation

**B3DB (BBB model):** The raw B3DB classification dataset²⁸ (n = 7,807) was curated as follows: invalid SMILES removed (n = 2); canonical SMILES generated via RDKit; salts and fragments stripped using RDKit `SaltRemover` (n = 38 modified); MW > 900 Da entries removed (n = 4); exact duplicates with conflicting BBB labels discarded (n = 16 pairs); concordant duplicates deduplicated (n = 102, one representative retained). Final curated dataset: n = 7,643 (BBB+: 4,871; BBB−: 2,772).

**Tox21 10K:** Salt stripping and SMILES canonicalisation applied; compound-level duplicates with conflicting per-endpoint labels discarded (n = 44 pairs). Final dataset: n = 7,878 (per-endpoint available labels: 5,792–6,838).

### BBB GradientBoosting Model

**Input features:** Morgan ECFP4 fingerprint (radius = 2, 2,048 bits, RDKit `GetMorganFingerprintAsBitVect`) concatenated with nine pharmacokinetic descriptors (MW, cLogP, TPSA, HBD, HBA, RotB, AromaticRings, RingCount, HeavyAtomCount), yielding 2,057 features. **Algorithm:** `sklearn.ensemble.GradientBoostingClassifier` (n_estimators = 300, max_depth = 5, learning_rate = 0.05, subsample = 0.8, random_state = 42). **Validation:** stratified random hold-out (15%, n = 1,147); 5-fold stratified CV (AUC = 0.91 ± 0.02). AUC-ROC = 0.92, 95% bootstrap CI [0.90, 0.94] (1,000 iterations). Scaffold-disjoint evaluation in preparation. **Applicability domain:** maximum Tanimoto similarity to training set via `DataStructs.BulkTanimotoSimilarity`; threshold 0.30 (OPERA framework¹⁸); coverage at threshold: 94.1% of hold-out.

### Tox21 Multi-Output Random Forest

**Input:** Morgan ECFP4 (radius = 2, 1,024 bits). **Algorithm:** `sklearn.ensemble.RandomForestClassifier` with `MultiOutputClassifier` wrapper (n_estimators = 100, max_depth = 15, class_weight = 'balanced', random_state = 42). **Validation:** 5-fold stratified CV; mean AUC-ROC = 0.81 ± 0.04 across 12 endpoints (range 0.72–0.89).

### Deep ADMET (*admet_ai* / Chemprop D-MPNN)

SMILESRender integrates *admet_ai* ≥ 1.0⁷ using pre-trained Chemprop Directed Message Passing Neural Network weights⁸ trained on TDC benchmark datasets. No model retraining or fine-tuning is performed. Performance is as reported by Swanson et al.⁷: median AUC-ROC = 0.894 (28 classification tasks), mean RMSE = 0.47 (25 regression tasks). Mean inference: 280 ± 30 ms per compound on a 4-core Intel i7 CPU without GPU acceleration.

### ESOL Solubility

Implemented as a local function applying the Delaney equation²²: log S = 0.16 − 0.63·cLogP − 0.0062·MW + 0.066·RotB − 0.74·AP. cLogP computed via RDKit `Descriptors.MolLogP`; AP (aromatic proportion) = aromatic heavy atoms / total heavy atoms.

### Structural Alert Screening

PAINS (A, B, C subtypes), BRENK, and NIH structural alert catalogs are screened using RDKit's `FilterCatalog` with `FilterCatalogParams.FilterCatalogs.PAINS`, `BRENK`, and `NIH` respectively. Any match triggers a moderate-severity flag in the interpretation engine.

### Automated Interpretation Engine

The interpretation engine (`admet_interpreter.py`) implements a priority-ordered rule evaluation against aggregated tool outputs. Rules are hard-coded to established regulatory thresholds (see Results, Table 1 notes). The narrative generator uses Python f-string templates that embed compound-specific values, predicted classes, and threshold references into natural-language sentences. All narratives conclude with a standardised disclaimer: *"Predicted probabilities are relative ML scores; clinical confirmation required."*

---

## Data Availability

The full source code, Docker Compose configuration, ML model training scripts, and `.pkl` model bundles are available at https://github.com/rubithedev/smiles-render-web (MIT licence). The B3DB dataset used for BBB model training is available from Meng et al.²⁸. The Tox21 10K dataset is available from the NIH National Center for Advancing Translational Sciences (https://tripod.nih.gov/tox21). The SGLT2 inhibitor SMILES used in the class-level validation (SGLT2_approved.xlsx) are included in the repository supplementary data.

---

## References

1. Waring MJ, et al. An analysis of the attrition of drug candidates from four major pharmaceutical companies. *Nat Rev Drug Discov.* 2015;14:475–486.
2. Paul SM, et al. How to improve R&D productivity: the pharmaceutical industry's grand challenge. *Nat Rev Drug Discov.* 2010;9:203–214.
3. Muratov EN, et al. QSAR without borders. *Chem Soc Rev.* 2020;49:3525–3564.
4. Daina A, Michielin O, Zoete V. SwissADME: a free web tool to evaluate pharmacokinetics, drug-likeness and medicinal chemistry friendliness of small molecules. *Sci Rep.* 2017;7:42717.
5. Pires DEV, Blundell TL, Ascher DB. pkCSM: predicting small-molecule pharmacokinetic and toxicity properties using graph-based signatures. *J Med Chem.* 2015;58:4066–4072.
6. Gui C, et al. ADMETlab 3.0: an updated comprehensive online ADMET prediction tool. *Nucleic Acids Res.* 2024;52:W197–W204.
7. Swanson K, et al. ADMET-AI: a machine learning ADMET platform for evaluation of large-scale chemical libraries. *Bioinformatics.* 2024;40:btae416.
8. Yang K, et al. Analyzing learned molecular representations for property prediction. *J Chem Inf Model.* 2019;59:3370–3388.
9. Berthold MR, et al. KNIME — the Konstanz information miner. *ACM SIGKDD Explor Newsl.* 2009;11:26–31.
10. Afgan E, et al. The Galaxy platform for accessible, reproducible and collaborative biomedical analyses: 2018 update. *Nucleic Acids Res.* 2018;46:W537–W544.
11. Borrel A, et al. StopTox: an in silico alternative to animal acute systemic toxicity tests. *Environ Health Perspect.* 2022;130:027014.
12. Borrel A, et al. High-throughput screening to predict chemical-assay interference. *Sci Rep.* 2020;10:3986.
13. Banerjee P, Dehnbostel FO, Preissner R. ProTox-3.0: a webserver for the prediction of toxicity of chemicals. *Nucleic Acids Res.* 2024;52:W513–W520.
14. Ertl P, Bienfait B. JSME: a free molecule editor in JavaScript. *J Cheminform.* 2013;5:24.
15. Veber DF, et al. Molecular properties that influence the oral bioavailability of drug candidates. *J Med Chem.* 2002;45:2615–2623.
16. Lipinski CA, et al. Experimental and computational approaches to estimate solubility and permeability in drug discovery. *Adv Drug Deliv Rev.* 2001;46:3–26.
17. Meng F, et al. A curated diverse molecular database of blood-brain barrier permeability. *Sci Data.* 2021;8:289.
18. Mansouri K, et al. OPERA models for predicting physicochemical properties and environmental fate endpoints. *J Cheminform.* 2018;10:10.
19. Tice RR, et al. Improving the human hazard characterization of chemicals: a Tox21 update. *Environ Health Perspect.* 2013;121:756–765.
20. Baell JB, Holloway GA. New substructure filters for removal of pan assay interference compounds (PAINS). *J Med Chem.* 2010;53:2719–2740.
21. Bickerton GR, et al. Quantifying the chemical beauty of drugs. *Nat Chem.* 2012;4:90–98.
22. Delaney JS. ESOL: estimating aqueous solubility directly from molecular structure. *J Chem Inf Comput Sci.* 2004;44:1000–1005.
23. Mansouri K, et al. OPERA models for predicting physicochemical properties. *J Cheminform.* 2018;10:10.
24. Muratov EN, et al. QSAR without borders. *Chem Soc Rev.* 2020;49:3525–3564.
25. Riniker S, Landrum GA. Better informed distance geometry: using what we know to improve conformation generation. *J Chem Inf Model.* 2015;55:2562–2574.
26. Eberhardt J, et al. AutoDock Vina 1.2.0. *J Chem Inf Model.* 2021;61:3891–3898.
27. Su M, et al. Comparative assessment of scoring functions: the CASF-2016 benchmark. *J Chem Inf Model.* 2019;59:895–913.
28. Meng F, et al. B3DB: a multitasking dataset for blood-brain barrier permeability. *Sci Data.* 2021;8:289.
29. Sander T, et al. DataWarrior: an open-source program for chemistry aware data visualization. *J Chem Inf Model.* 2015;55:460–473.
30. Dhanjal JK, et al. GraphB3: an explainable GCN approach for BBB permeability prediction. *J Cheminform.* 2024;16:34.
31. Hierro-Bujalance C, et al. Empagliflozin reduces vascular damage and cognitive impairment in a mixed murine model of Alzheimer's disease and type 2 diabetes. *Alzheimers Res Ther.* 2020;12:40.

---

## Acknowledgements

The authors thank the developers of RDKit (G. Landrum et al.), *admet_ai* (K. Swanson et al., Stanford), StopTox/StopLight (A. Borrel, N. Kleinstreuer et al., NIH/NIEHS), ProTox 3.0 (P. Banerjee et al., Charité Berlin), DataWarrior (T. Sander, Sanofi), B3DB (F. Meng et al.), and the Tox21 Challenge (NIH NCATS). The thieno[2,3-b]pyridine dataset (DADOS_Uminho_1) was used with permission.

## Author Contributions

R.A.B.S. conceived the project, designed and implemented the platform, curated datasets, trained all local ML models, performed benchmarking experiments, and wrote the manuscript. G.G. contributed to architecture design and manuscript revision. All authors reviewed and approved the final manuscript.

## Competing Interests

The authors declare no competing interests.

## Additional Information

**Correspondence** and requests for materials should be addressed to R.A.B.S. (carlos.seiti.shiraishi@gmail.com).
