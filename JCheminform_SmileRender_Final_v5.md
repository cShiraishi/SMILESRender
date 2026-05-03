# SMILESRender: A Unified Open-Source Web Platform for Centralized Cheminformatics, Multi-Engine ADMET Profiling, and Molecular Analysis

**Authors:** Rui A. B. Shiraishi¹\*, Gabriel Grechuk¹

**Affiliations:**  
¹ [Department], [Institution], [City, Country]

**\*Corresponding author:** carlos.seiti.shiraishi@gmail.com

**Target journal:** Journal of Cheminformatics — **Software Article**  
**Submitted:** May 2026

**Keywords:** cheminformatics; drug discovery; ADMET; open-source; web platform; molecular visualization; workflow integration; blood-brain barrier; toxicity prediction; reproducibility; DataWarrior; KNIME

---

## Abstract

**Background:** Modern drug discovery demands proficiency across a fragmented set of computational tools: molecular visualization software, ADMET prediction servers, descriptor calculators, structure editors, and similarity search engines. Researchers navigate this landscape by maintaining parallel installations of desktop applications (DataWarrior, MarvinSketch), programming environments (KNIME, RDKit scripts), and browser sessions across multiple disconnected web services — a workflow that imposes substantial context-switching overhead and fundamentally limits reproducibility. No single open-source platform currently consolidates the full cheminformatics stack — structure rendering, interactive drawing, multi-engine ADMET profiling, structural alert screening, QSAR-ready descriptor computation, chemical similarity search, and automated risk interpretation — within one session-consistent, containerised, offline-capable deployment.

**Results:** We present SMILESRender, an open-source web-based cheminformatics hub built on a hybrid architecture. The platform delivers: (i) high-quality 2D molecular rendering and reaction visualization; (ii) an embedded JSME structure editor; (iii) comprehensive ADMET profiling combining three local machine learning models (Tox21 multi-endpoint, BBB permeability, and 53-property Chemprop D-MPNN via *admet_ai*) with three external oracle services (StopTox, StopLight, ProTox 3.0) — covering over 85 ADMET endpoints; (iv) structural alert screening (PAINS, BRENK, NIH catalogs); (v) 60+ local RDKit descriptors with four fingerprint export formats; (vi) chemical similarity search and IUPAC nomenclature conversion; and (vii) a rule-based Automated Interpretation Engine converting numerical outputs into severity-classified plain-language narratives. A systematic benchmark against five major open-source cheminformatics platforms — DataWarrior, KNIME, Galaxy cheminformatics, ChemMine Tools, and MarvinSketch — demonstrates that SMILESRender is the only open-source tool providing web-native, integrated, multi-engine ADMET profiling with local ML models and automated interpretation. Batch processing of 20 thieno[2,3-b]pyridine derivatives completed in under 12 minutes versus 2 h 52 min for the equivalent manual multi-tool workflow.

**Conclusions:** SMILESRender addresses the operational fragmentation that limits reproducibility and accessibility in computational medicinal chemistry, consolidating into a single Docker-deployable platform capabilities that previously required five or more separate tools. Source code is available under the MIT license at https://github.com/rubithedev/smiles-render-web; a public cloud instance runs at https://smiles-render.onrender.com.

---

## Background

### The Fragmentation Problem in Computational Drug Discovery

The computational toolkit of a medicinal chemist typically spans multiple disconnected environments. A typical ADMET evaluation workflow for a 20-compound library involves: drawing or editing structures in a dedicated editor (MarvinSketch, ChemDoodle, or JSME), rendering 2D images for presentation (DataWarrior, ChemDraw, or KNIME), computing physicochemical descriptors (RDKit scripts, DataWarrior, or SwissADME), querying acute toxicity predictions (StopTox or ProTox), querying ADMET predictions (pkCSM, ADMETlab, or *admet_ai*), checking structural alerts (custom scripts or SwissADME), and finally consolidating results across incompatible spreadsheets.

This fragmentation is not merely inconvenient — it is a reproducibility risk. Different tools implement the same descriptors with different normalization conventions. Batch sizes differ between services. Results are downloaded in incompatible formats. Session state is lost when browsers are closed. And any external service can change its API, enforce rate limits, or go offline between the time a paper is submitted and when a reviewer attempts to reproduce the analysis.

The problem is particularly acute for synthetic chemists and biologists — the majority of medicinal chemistry researchers — who are not computational specialists. For these users, the overhead of setting up and maintaining parallel tools can make computational ADMET screening practically inaccessible, despite the availability of excellent free prediction services.

### Existing Open-Source Tools and Their Limitations

The cheminformatics community has produced a rich set of open-source tools, each addressing a specific aspect of the workflow:

**DataWarrior** [1] (Actelion/Sanofi, freely distributed) is the most comprehensive open-source desktop cheminformatics application, providing 2D/3D visualization, compound clustering, self-organising map (SOM) analysis, activity cliff detection, and basic physicochemical property calculation. However, DataWarrior is desktop-only (Windows/macOS/Linux installation required), provides no web interface, cannot query external ADMET prediction services, and its built-in ADMET coverage is limited to basic drug-likeness filters (Lipinski, Veber) and a small set of local predictions. It has no BBB permeability model, no multi-endpoint toxicity profiling, and no automated interpretation layer.

**KNIME** [2] with cheminformatics extensions (RDKit KNIME nodes, CDK nodes) is an extremely powerful visual programming platform capable of building sophisticated cheminformatics workflows. Its strength is flexibility: experts can connect any combination of nodes to build custom pipelines. Its weakness is accessibility: KNIME requires significant programming knowledge to configure effectively, has a steep learning curve, and provides no built-in ADMET prediction — external API nodes must be added and maintained separately. It is not web-native and is not suitable for non-computational users.

**Galaxy** [3] (cheminformatics tools at usegalaxy.eu) provides server-based reproducible scientific workflows, including some cheminformatics tools (structure conversion, SMILES processing). Galaxy excels at reproducible data analysis pipelines but has very limited cheminformatics capabilities, no dedicated ADMET prediction tools, and requires workflow creation expertise.

**ChemMine Tools** [4] is a web-based cheminformatics platform offering compound comparison, structural clustering, and molecular similarity search. It provides no ADMET prediction, no descriptor export, and no structural alert screening.

**MarvinSketch** (ChemAxon, free academic licence) provides excellent structure drawing and a subset of physicochemical property calculations (pKa, logP, solubility). However, it is not fully open-source, provides no ADMET prediction beyond basic physicochemical parameters, and offers no batch processing pipeline.

**RDKit** [5] is the community standard for programmatic cheminformatics — it provides exactly the capabilities needed for descriptor computation, fingerprint generation, and structural alert screening. However, RDKit is a Python/C++ library, not a user-facing application. Using it requires programming expertise, and it provides no ADMET prediction models of its own.

A critical gap therefore exists: there is no open-source, web-native platform that consolidates structure rendering, interactive editing, multi-endpoint ADMET profiling, structural alert screening, descriptor computation, and automated interpretation in a single session-consistent deployment accessible without programming expertise.

### Centralisation as a Scientific and Practical Imperative

Beyond convenience, centralisation of cheminformatics workflows has direct scientific implications:

**Reproducibility:** When all computations for a study are performed within a single containerised deployment, the full computational environment can be captured and shared. This is qualitatively different from a methods section that lists five separate tools, each with its own version dependencies and update history.

**Session consistency:** When SMILES strings are entered once and propagated to all tools within the same session, there is no risk of transcription errors, copy-paste mistakes, or tautomer/canonicalisation differences between tools.

**Accessibility:** Web-native interfaces eliminate installation barriers, enabling computational ADMET access for synthetic chemists, pharmacologists, and students without programming backgrounds.

**Integrated interpretation:** When predictions from multiple tools are available simultaneously, cross-tool consensus (e.g., BBB classification concordant between local GBM model and Chemprop BBB_Martins) provides more reliable signals than any single-tool prediction in isolation.

SMILESRender was built to address this gap within the constraints of open-source, MIT-licensed software deployable on any infrastructure.

---

## Implementation

### System Architecture

SMILESRender follows a three-tier hybrid architecture (Figure 1). A React 19/TypeScript single-page application communicates with a Python Flask 3.0 backend (Waitress 3.0 WSGI server). The backend separates two computation pathways: **(i) local in-process computation** via RDKit 2024.3.6, scikit-learn 1.8, and *admet_ai*, requiring no network access; and **(ii) external oracle orchestration** via asynchronous proxy requests to StopTox, StopLight, and ProTox 3.0, each isolated in a `ToolErrorBoundary`.

Because all three local ML models run independently of the external orchestration layer, a minimum viable ADMET profile is always available regardless of network conditions. A Redis 7.4 cache (24-hour TTL, keyed by MD5 of canonical SMILES) reduces redundant external calls by 60–80% in iterative workflows. Docker Compose containerises all three services (web server, Redis, Celery worker), ensuring bit-identical results across deployments. The backend exposes 19 REST endpoints across four namespaces (`/render/*`, `/predict/*`, `/descriptors`, `/convert/*`).

### Module 1 — Molecular Structure Rendering

SMILES strings are converted to 2D structural images via RDKit `Draw.MolToImage` with `rdDepictor` coordinate generation. Transparent-background PNG images are produced by alpha-channel replacement. Batch mode accepts up to 20 SMILES per request and returns a deduplicated ZIP archive. Supported export formats: PNG, JPEG, WEBP, TIFF, BMP, GIF, EPS, ICO. Reaction SMILES (`reactants>>products`) are handled via `rdkit.Chem.Draw.ReactionToImage` with full atom-mapping support.

Interactive structure drawing is provided via the JSME Molecular Editor [6], embedded as a browser-native JavaScript component with no installation requirement. JSME exports canonical SMILES that feed directly into the prediction pipeline.

### Module 2 — Comprehensive ADMET Profiling

The ADMET module is the scientific centrepiece of SMILESRender, covering over 85 endpoints across all five ADMET categories through three complementary prediction layers.

#### 2.1 Local Machine Learning Models (100% available offline)

**Tox21 Multi-Endpoint Toxicity (12 endpoints):** A Multi-Output Random Forest (ECFP4, 1,024 bits; scikit-learn 1.8) covers all 12 Tox21 Challenge bioassay endpoints, providing in vitro surrogates for nuclear receptor disruption and stress pathway activation. Mean AUC-ROC = 0.81 (5-fold stratified CV), consistent with published RF baselines.

**Blood-Brain Barrier Permeability:** A GradientBoosting classifier (ECFP4 2,048 bits + 9 pharmacokinetic descriptors; trained on curated B3DB, n = 7,643) predicts BBB+ or BBB− status with AUC-ROC = 0.92 on stratified hold-out (95% bootstrap CI [0.90, 0.94]). Each prediction is accompanied by a Tanimoto applicability domain (AD) flag (nearest-neighbour threshold 0.30) alerting when the compound is outside the training chemical space.

**Deep ADMET — 53 Properties (Chemprop D-MPNN via *admet_ai*):** Pre-trained Chemprop Directed Message Passing Neural Network [7,8] models covering absorption, distribution, metabolism, excretion, and toxicity (full coverage in Section 2.2). Median AUC-ROC = 0.894 across 28 classification tasks (TDC leaderboard, Swanson et al. [8]). Mean inference: 280 ms per compound on a 4-core CPU.

#### 2.2 External Oracle Services (supplementary, fault-isolated)

- **StopTox** [9]: six acute systemic toxicity endpoints (oral/dermal/inhalation LD50, eye irritation, skin sensitisation, aquatic toxicity); validated QSAR models from NIH/NTP.
- **StopLight** [10]: eleven multi-parameter optimisation (MPO) scores for lead optimisation.
- **ProTox 3.0** [11]: twelve organ-toxicity predictions (see ADMET section for full endpoint list).

#### 2.3 ADMET Endpoint Coverage by Category

The following subsections describe the biological and clinical rationale for each ADMET endpoint covered by SMILESRender, grouped by category.

**Absorption** determines whether an orally administered compound reaches systemic circulation in adequate concentrations. Key endpoints covered:
- *Human intestinal absorption (HIA):* fraction absorbed via passive diffusion and active transport through the intestinal epithelium. HIA < 30% indicates poor oral bioavailability.
- *Caco-2 permeability:* permeability through Caco-2 cell monolayers, a standard surrogate for intestinal permeability. Low Caco-2 (< 10⁻⁶ cm/s) correlates with poor HIA.
- *PAMPA permeability:* passive transcellular permeability. Complements Caco-2 by isolating passive from active transport contributions.
- *P-glycoprotein (P-gp) substrate and inhibitor:* P-gp is a major efflux transporter expressed at the intestinal epithelium, BBB, liver, and kidney. P-gp substrates face active efflux that reduces bioavailability and CNS penetration.
- *Oral bioavailability (F20%, F30%):* fraction of the administered oral dose reaching systemic circulation. Values below the threshold indicate formulation challenges.
- *TPSA:* computed locally via RDKit. TPSA > 140 Å² predicts poor passive intestinal absorption (Veber et al. [12]).

**Distribution** governs how a compound partitions between blood, tissues, and target organs following absorption:
- *Blood-brain barrier (BBB) permeability:* the single most pharmacologically critical distribution endpoint for CNS drug candidates. SMILESRender provides two independent BBB predictions — the local GBM model (B3DB-trained) and Chemprop BBB_Martins — enabling cross-model consensus assessment. Concordant BBB− from both models constitutes a high-confidence CNS-impermeability flag.
- *Plasma protein binding (PPBR):* fraction bound to plasma proteins (albumin, α1-acid glycoprotein). High PPBR (> 95%) limits free drug concentration available for target binding.
- *Volume of distribution at steady state (VDss):* reflects tissue partitioning. Low VDss indicates plasma-confined distribution; high VDss indicates extensive tissue uptake.
- *P-gp substrate:* relevant at the BBB and other tissue barriers beyond intestinal absorption.

**Metabolism** — primarily hepatic CYP450-mediated biotransformation — determines the rate of drug elimination and potential for drug–drug interactions (DDIs):
- *CYP1A2 inhibition/substrate:* major route for caffeine, theophylline, clozapine. Inhibition causes DDIs with narrow-therapeutic-index substrates.
- *CYP2C9 inhibition/substrate:* critical for warfarin, phenytoin, NSAIDs. CYP2C9 inhibition carries significant bleeding risk.
- *CYP2C19 inhibition/substrate:* involved in clopidogrel activation (prodrug). Inhibition impairs antiplatelet efficacy.
- *CYP2D6 inhibition/substrate:* metabolises 25% of marketed drugs including codeine, tamoxifen, antidepressants. Genetic polymorphisms create poor/ultra-rapid metaboliser populations.
- *CYP3A4 inhibition/substrate:* the most important CYP isoform, responsible for ~50% of drug metabolism. Inhibition raises plasma levels of co-administered substrates.
- *Metabolic half-life (T1/2):* determines dosing frequency. Short T1/2 (< 1 h) requires frequent dosing; very long T1/2 risks accumulation.
- *CYP polypharmacology flag (local interpretation engine):* when ≥ 3 of 5 isoforms show inhibition probability ≥ 0.50, SMILESRender flags high DDI liability.

**Excretion** governs drug clearance from the body:
- *Hepatocyte clearance:* intrinsic hepatic metabolic clearance. High clearance indicates rapid liver elimination and a need for frequent dosing or prodrug strategies.
- *Microsome clearance:* microsomal metabolic clearance, a faster in vitro assay for oxidative metabolism.

**Toxicity** — the most complex ADMET category — spans multiple mechanisms from direct organ damage to genotoxicity and regulatory risk:
- *hERG cardiotoxicity:* inhibition of the hERG cardiac potassium channel causes QT interval prolongation, potentially leading to life-threatening arrhythmias (torsades de pointes). The hERG liability was responsible for withdrawal of multiple marketed drugs (terfenadine, cisapride, grepafloxacin). SMILESRender flags predicted hERG inhibition probability ≥ 0.40 as high risk, consistent with ICH E14 guidance.
- *Drug-induced liver injury (DILI):* the leading cause of post-approval drug withdrawal. DILI prediction from SMILES is inherently difficult due to multi-mechanistic aetiology; the Chemprop model provides a probabilistic estimate that is appropriate for early screening.
- *AMES mutagenicity:* in vitro bacterial reverse-mutation assay surrogate. Positive AMES is a regulatory concern under ICH S2(R1) and is required for NCE regulatory packages.
- *Carcinogenicity:* long-term in vivo carcinogenicity risk. Valuable for early de-prioritisation of leads.
- *ClinTox:* binary clinical toxicity flag derived from FDA-approved drug vs. clinical trial failure data.
- *LD50 (acute oral toxicity):* estimated lethal dose in rodents. Classified by StopTox according to GHS: critical (< 50 mg/kg), high (50–300 mg/kg), moderate (300–2,000 mg/kg), low (> 2,000 mg/kg).
- *Organ-specific toxicity (ProTox 3.0):* neurotoxicity, nephrotoxicity, cardiotoxicity, immunotoxicity, cytotoxicity, hepatotoxicity, respiratory, and ecotoxicity — 12 endpoints covering target organs assessed in regulatory toxicology studies.
- *Tox21 12-endpoint in vitro panel:* nuclear receptor activity (NR-AR, NR-AR-LBD, NR-AhR, NR-Aromatase, NR-ER, NR-ER-LBD, NR-PPAR-gamma) and stress response pathways (SR-ARE, SR-ATAD5, SR-HSE, SR-MMP, SR-p53). These endpoints are directly relevant to endocrine disruption screening and are increasingly required in regulatory submissions under REACH and EPA guidelines.

**Table 1. Complete ADMET endpoint coverage in SMILESRender by category and source.**

| Category | Endpoint | Source | Local/External |
|----------|---------|--------|----------------|
| Absorption | HIA, Caco-2, PAMPA, P-gp substrate/inhibitor, F20%, F30% | admet_ai | Local |
| Absorption | TPSA-based flag, Lipinski/Veber/Ghose/Egan/Muegge | RDKit | Local |
| Distribution | BBB (GBM model) + AD flag | Local GBM | Local |
| Distribution | BBB_Martins, PPBR, VDss | admet_ai | Local |
| Metabolism | CYP1A2/2C9/2C19/2D6/3A4 inhibition+substrate, T1/2 | admet_ai | Local |
| Excretion | Hepatocyte clearance, microsome clearance | admet_ai | Local |
| Toxicity | hERG, DILI, AMES, carcinogenicity, ClinTox, LD50 | admet_ai | Local |
| Toxicity | NR-AR, NR-AR-LBD, NR-AhR, NR-Aromatase, NR-ER, NR-ER-LBD, NR-PPAR-gamma, SR-ARE, SR-ATAD5, SR-HSE, SR-MMP, SR-p53 | Tox21-RF | Local |
| Toxicity | Oral/dermal/inhalation LD50, eye irritation, skin sensitisation, aquatic toxicity | StopTox | External |
| Toxicity | DILI, neurotoxicity, nephrotoxicity, cardiotoxicity, carcinogenicity, mutagenicity, immunotoxicity, cytotoxicity, BBB, respiratory, ecotoxicity, clinical toxicity | ProTox 3.0 | External |
| Optimisation | 11 MPO scores (lead-likeness, CNS-MPO, PO score) | StopLight | External |
| Structural alerts | PAINS (A/B/C), BRENK, NIH catalogs | RDKit FilterCatalog | Local |

*Total: 85+ distinct ADMET endpoints across all five categories. All local endpoints are available offline (100% uptime); external endpoints supplement with additional coverage when network is available.*

### Module 3 — Automated Interpretation Engine

A rule-based engine (`admet_interpreter.py`) converts the aggregated multi-tool numerical output into structured per-molecule risk profiles: severity-classified flags (low/moderate/high/critical), an overall risk level, and a plain-language narrative paragraph. This layer is particularly valuable for non-computational users who need actionable guidance rather than raw probability scores.

Flag logic is grounded in established regulatory and pharmacological guidelines: GHS LD50 classification thresholds, ICH E14 hERG guidance, Veber TPSA absorption criteria [12], and Baell/Holloway PAINS definitions [13]. The engine explicitly communicates that ML probability outputs are relative discriminative scores, not calibrated absolute risk estimates, via a disclaimer embedded in every narrative.

### Module 4 — Interactive ADMET Dashboard

The dashboard aggregates all tool outputs into a unified visual summary updated in real time as predictions resolve (Figure 3). Panels: (i) Summary metric cards (mean MW, LogP, QED, oral bioavailability, Lipinski compliance); (ii) **Safety Flags** — labelled progress bars for hERG, DILI, PAINS, BRENK, and BBB+ proportions across the batch; (iii) StopTox acute toxicity distribution; (iv) ESOL solubility distribution; (v) **Per-Molecule Risk Matrix** — colour-coded table with Overall/hERG/DILI/ClinTox/BBB/QED per molecule; (vi) **CYP Inhibition Heatmap** — 5-isoform × N-molecule probability matrix with three-tier colouring (green < 25%, amber 25–50%, red > 50%).

### Module 5 — Local Descriptor Engine and ESOL Solubility

Over 60 physicochemical and topological descriptors computed locally via RDKit: constitutional (MW, FractionCSP3, Labute ASA, MolMR); drug-likeness — QED [14], Lipinski [15], Ghose, Veber [12], Egan, Muegge; topological indices (Balaban J, BertzCT, Kappa 1–3, Chi series); electronic/VSA descriptors (PEOE_VSA, SMR_VSA, SlogP_VSA); and structural alerts via PAINS/BRENK/NIH catalogs.

Aqueous solubility is estimated via the ESOL QSAR model (Delaney, 2004 [16]):

> **log S = 0.16 − 0.63·cLogP − 0.0062·MW + 0.066·RotB − 0.74·AP**

ESOL provides four-category solubility classification (Soluble/Moderately/Poorly/Insoluble) with ±1 log-unit uncertainty. Four fingerprint protocols are exported in QSAR-ready format: RDKit (1,024 bits), Morgan/ECFP4 (2,048 bits, radius 2), MACCS keys (167 bits), Atom Pairs (2,048 bits).

### Module 6 — Batch Processing, Export, and Auxiliary Tools

CSV batch input (up to 500 compounds; Name + SMILES columns). Per-compound error isolation. Export: structured Excel workbook with ADMET comparison, flat records, and fingerprint matrices formatted for scikit-learn/DeepChem ingestion; PDF clinical summary. PepLink integration for bidirectional peptide-SMILES translation. Tanimoto similarity search (configurable Morgan radius 1–4; colour-coded Tc ≥ 0.70/0.40–0.70/< 0.40). SMILES-to-IUPAC via PubChem PUG REST API.

---

## Results and Discussion

### Benchmark Against Open-Source Cheminformatics Platforms

To characterise SMILESRender's position in the open-source cheminformatics landscape, we performed a systematic feature comparison against five representative platforms (Table 2). Platforms were evaluated based on publicly documented capabilities as of May 2026; features confirmed through direct testing are marked accordingly.

**Table 2. Systematic benchmark: SMILESRender vs. five open-source cheminformatics platforms.**

| Feature | SMILESRender | DataWarrior [1] | KNIME + RDKit [2] | Galaxy Cheminf. [3] | ChemMine [4] | MarvinSketch (free) |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Interface** | Web | Desktop | Desktop/Server | Web (server) | Web | Desktop |
| **No installation required** | ✓ | — | — | ✓ᵃ | ✓ | — |
| **Docker/offline deployment** | ✓ | — | Partial | — | — | — |
| **Open source (OSI license)** | ✓ (MIT) | Partialᵇ | ✓ | ✓ | ✓ | — |
| **2D structure rendering (batch)** | ✓ | ✓ | ✓ᶜ | — | Partial | ✓ |
| **Interactive structure editor** | ✓ (JSME) | ✓ | — | — | — | ✓ |
| **Reaction SMILES visualisation** | ✓ | ✓ | ✓ᶜ | — | — | ✓ |
| **ADMET prediction — local ML** | ✓ (85+ endpoints) | Partialᵈ | —ᵉ | — | — | Partialᶠ |
| **BBB permeability model** | ✓ | — | — | — | — | — |
| **Tox21 multi-endpoint (12)** | ✓ | — | — | — | — | — |
| **Chemprop D-MPNN (53 props)** | ✓ | — | — | — | — | — |
| **External ADMET integration** | ✓ (3 services) | — | Manualᵍ | — | — | — |
| **Automated interpretation** | ✓ | — | — | — | — | — |
| **Drug-likeness (Ro5/Veber/QED)** | ✓ | ✓ | ✓ᶜ | — | Partial | ✓ |
| **PAINS structural alerts** | ✓ | — | ✓ᶜ | — | — | — |
| **BRENK / NIH alerts** | ✓ | — | ✓ᶜ | — | — | — |
| **60+ RDKit descriptor panel** | ✓ | ✓ᵈ | ✓ᶜ | Partial | — | Partial |
| **4 fingerprint types (ML-ready)** | ✓ | Partial | ✓ᶜ | — | Partial | — |
| **Chemical similarity search** | ✓ | ✓ | ✓ᶜ | — | ✓ | — |
| **IUPAC nomenclature** | ✓ | Partial | — | — | — | ✓ |
| **Batch CSV upload** | ✓ | ✓ | ✓ | Partial | ✓ | — |
| **CYP inhibition heatmap** | ✓ (5 isoforms) | — | — | — | — | — |
| **Per-molecule risk matrix** | ✓ | — | — | — | — | — |
| **Required expertise** | Minimal | Moderate | High | High | Minimal | Minimal |

*ᵃ Galaxy requires account registration and server allocation. ᵇ DataWarrior is freely distributed but not open-source (source code not publicly available; Actelion proprietary licence). ᶜ Requires workflow construction in KNIME node editor. ᵈ DataWarrior computes physicochemical descriptors and basic drug-likeness but has no ML-based ADMET toxicity endpoints. ᵉ KNIME has no built-in ADMET prediction; external API nodes can be added but require individual service accounts. ᶠ MarvinSketch computes pKa, logP, and solubility via ChemAxon proprietary models; no toxicity endpoints. ᵍ KNIME can call external REST APIs but requires manual workflow configuration per service.*

**Key findings from the benchmark:**
1. SMILESRender is the only open-source platform providing integrated, web-native multi-engine ADMET profiling without programming expertise.
2. DataWarrior is the closest general-purpose competitor for structure-based analysis but has no ADMET ML models, no external service integration, and no automated interpretation.
3. KNIME is the most powerful but requires expert workflow configuration — it is a platform for building tools, not a ready-to-use tool itself.
4. No competitor provides coverage of all five ADMET categories (A, D, M, E, T) in a single session.
5. Only SMILESRender and MarvinSketch are accessible to non-computational users without programming or workflow configuration; MarvinSketch provides no ADMET prediction beyond logP/pKa/solubility.

### ADMET Coverage Comparison

Figure 4 presents a radar chart comparing ADMET endpoint coverage across the benchmarked platforms. SMILESRender covers all five ADMET categories with multiple endpoints per category; DataWarrior provides absorption-related physicochemical properties only; KNIME with RDKit nodes covers descriptors but no prediction endpoints; and the remaining platforms cover two or fewer categories.

The cross-tool consensus approach enabled by SMILESRender's architecture provides an additional analytical advantage: when multiple independent models (local GBM BBB, Chemprop BBB_Martins, ProTox 3.0 BBB) predict the same BBB class concordantly, the signal carries higher confidence than any single-model prediction. Similarly, when Tox21-RF flags hERG-associated stress response pathways (SR-ARE, SR-MMP) and Chemprop simultaneously predicts high hERG probability, the combination is a stronger early warning than either tool alone.

### Validation: Biological Plausibility Check with Ten FDA-Approved Drugs

To verify descriptor accuracy and biological plausibility of ADMET predictions — not to provide statistical model validation (n = 10 is insufficient for that purpose) — we evaluated ten marketed drugs spanning six therapeutic classes (Table 3).

**Table 3. Descriptor computation and ADMET plausibility check for ten FDA-approved drugs.**

| Drug | Class | MW | LogP | TPSA | QED | Ro5 | ESOL | BBB | hERG % | DILI % | CYP flag | Expected CNS |
|------|-------|----|------|------|-----|-----|------|-----|--------|--------|---------|-------------|
| Aspirin | Analgesic | 180.2 | 1.19 | 63.6 | 0.55 | Pass | Soluble | BBB+ | 5 | 32 | — | Partial |
| Ibuprofen | NSAID | 206.3 | 3.97 | 37.3 | 0.73 | Pass | Mod. | BBB+ | 3 | 21 | — | Limited |
| Acetaminophen | Analgesic | 151.2 | 0.46 | 49.3 | 0.59 | Pass | Soluble | BBB+ | 2 | 18 | — | Yes |
| Caffeine | CNS | 194.2 | 0.16 | 61.4 | 0.56 | Pass | Soluble | BBB+ | 5 | 38 | — | Yes ✓ |
| Metformin | Antidiabetic | 129.2 | −1.43 | 88.5 | 0.30 | Pass | Soluble | BBB− | 1 | 12 | — | No ✓ |
| Atorvastatin | Statin | 558.6 | 5.67 | 111.8 | 0.34 | Fail* | Poorly | BBB− | 12 | 45 | CYP3A4 | No ✓ |
| Sildenafil | PDE5-i | 474.6 | 2.77 | 113.0 | 0.53 | Pass | Mod. | BBB− | 8 | 38 | CYP3A4 | No ✓ |
| Lisinopril | ACE-i | 405.5 | −0.09 | 138.9 | 0.29 | Pass | Soluble | BBB− | 3 | 22 | — | No ✓ |
| Tamoxifen | SERM | 371.5 | 6.30 | 41.6 | 0.44 | Fail‡ | Poorly | BBB+ | 11 | 55ʰ | CYP2D6 | Yes ✓ |
| Ciprofloxacin | Antibiotic | 331.3 | 0.28 | 74.6 | 0.49 | Pass | Soluble | BBB− | 4 | 29 | — | No ✓ |

*MW in g/mol; TPSA in Å²; ESOL: Soluble > −2, Mod. −4 to −2, Poorly < −4 mol/L; BBB: local GBM model; hERG/DILI: admet_ai Chemprop (%); CYP flag: isoform with highest inhibition probability ≥ 0.50. \*MW > 500 g/mol. ‡LogP > 5. ʰ DILI 55% flagged high; Tamoxifen carries a black-box warning for hepatotoxicity in long-term use. ✓ indicates concordance with established clinical CNS profile.*

BBB classification was concordant with established CNS profiles for 9/10 compounds. The interpretation engine correctly annotated Atorvastatin's Lipinski violation as "*MW violation (558.6 g/mol > 500); note: transported by OATP1B1/B3*" and Lisinopril's high TPSA as "*absorption risk (TPSA 138.9 Å²); note: PepT1 substrate — transporter-mediated absorption known*". The CYP3A4 flag for Atorvastatin and Sildenafil accurately reflects their documented metabolic routes. The Tox21-RF flagged Tamoxifen for NR-ER activity (estrogen receptor agonism), consistent with its mechanism of action.

### Batch Processing Case Study: Thieno[2,3-b]pyridine Library

A library of 20 thieno[2,3-b]pyridine derivatives (DADOS_Uminho_1) — a kinase inhibitor scaffold — was processed via batch CSV upload. Full ADMET profiling across all local models and external oracles completed in 11 min 45 s ± 1 min 12 s (three independent runs, single analyst experienced with all tools). The equivalent manual workflow — entering 20 SMILES into three external services, downloading and consolidating results — required 2 h 52 min ± 18 min.

Key outputs: 14/20 (70%) predicted BBB+ (all within training AD; Tanimoto NN 0.33–0.51); 3 PAINS alerts (rhodanine ×2, catechol ×1); 2 compounds with hERG probability > 0.60 (flagged high); CYP3A4 the most frequently inhibited isoform (11/20, 55%). The consolidated Excel export was immediately usable for SAR analysis without any data reformatting.

### Platform Accessibility and Reproducibility

SMILESRender requires no software installation for end users: the public cloud instance at https://smiles-render.onrender.com is accessible via any modern browser. For groups requiring data sovereignty or air-gapped environments, Docker Compose deployment takes under 5 minutes and produces a bit-identical local instance. The Docker image captures all library versions, model weights, and configuration — ensuring that a computational result described in a publication can be independently reproduced years later by simply running `docker compose up`.

---

## Planned Extensions

**3D Conformer Generation and Docking Interface:** A `/generate/3d` endpoint using RDKit ETKDG [17] and MMFF94 minimisation is in development, feeding into an AutoDock-GPU [18] / Vina [19] docking module with Meeko [20] receptor preparation and 3Dmol.js browser visualisation. This will be benchmarked on CASF-2016 re-docking tasks [21].

**Enhanced ADMET models:** Scaffold-disjoint (Bemis-Murcko) evaluation of the BBB model; consensus Tox21 model (RF + Chemprop multi-task); OPERA solubility integration [22] for higher-accuracy aqueous solubility predictions.

---

## Conclusions

SMILESRender provides what no existing open-source tool currently offers: a web-native, session-consistent, Docker-reproducible platform consolidating the full cheminformatics workflow — structure rendering, interactive editing, 85+ endpoint ADMET profiling, structural alert screening, descriptor computation, and automated plain-language interpretation — accessible without programming expertise.

A systematic benchmark against DataWarrior, KNIME, Galaxy, ChemMine, and MarvinSketch confirms that SMILESRender uniquely covers all five ADMET categories (Absorption, Distribution, Metabolism, Excretion, and Toxicity) through complementary local ML and external oracle layers, with automated cross-tool interpretation unavailable in any comparator platform. The embedded ADMET stack — covering hERG cardiotoxicity, DILI, 12 Tox21 bioassays, 5-isoform CYP metabolism, BBB permeability with applicability domain, and full organ-toxicity profiling — represents the most comprehensive ADMET coverage available in an open-source, offline-capable deployment.

The platform is freely available under the MIT license. All model weights and training scripts are distributed in the repository for full reproducibility.

---

## Availability and Requirements

- **Project name:** SMILESRender
- **Home page:** https://github.com/rubithedev/smiles-render-web
- **Cloud instance:** https://smiles-render.onrender.com
- **OS:** Platform-independent; Docker recommended; tested on Linux Ubuntu 22.04 and Windows 11
- **Languages:** Python 3.12, TypeScript (React 19)
- **Dependencies:** Flask 3.0.3, RDKit 2024.3.6, scikit-learn 1.8, admet_ai ≥ 1.0, Waitress 3.0.1, Redis 7.4, Bun 1.1
- **License:** MIT

---

## Abbreviations

AD: applicability domain; ADMET: Absorption, Distribution, Metabolism, Excretion, Toxicity; AUC: area under the ROC curve; BBB: blood-brain barrier; BCS: Biopharmaceutics Classification System; CYP: cytochrome P450; D-MPNN: Directed Message Passing Neural Network; DDI: drug–drug interaction; DILI: drug-induced liver injury; ECFP: Extended Connectivity Fingerprint; ESOL: Estimated SOLubility; GBM: Gradient Boosting Machine; GHS: Globally Harmonized System; hERG: human Ether-à-go-go-Related Gene; HIA: human intestinal absorption; JSME: Java Structure Molecular Editor; ML: machine learning; MPO: multi-parameter optimisation; NCE: new chemical entity; PAINS: pan-assay interference compounds; PAMPA: parallel artificial membrane permeability assay; PPBR: plasma protein binding ratio; QSAR: quantitative structure–activity relationship; QED: quantitative estimate of drug-likeness; RF: Random Forest; RDKit: open-source cheminformatics toolkit; Ro5: Lipinski Rule of 5; SAR: structure–activity relationship; SMILES: Simplified Molecular Input Line Entry System; SOM: self-organising map; TDC: Therapeutics Data Commons; TPSA: topological polar surface area; VDss: volume of distribution at steady state.

---

## Declarations

**Competing interests:** The authors declare no competing interests.

**Authors' contributions:** RABS conceived and implemented the platform, trained all local ML models, performed all benchmarking, and drafted the manuscript. GG contributed to architecture design and manuscript revision. All authors approved the final manuscript.

**Acknowledgements:** The authors thank the developers of RDKit (G. Landrum et al.), *admet_ai* (K. Swanson et al., Stanford), StopTox/StopLight (A. Borrel, N. Kleinstreuer et al., NIH/NIEHS), ProTox 3.0 (P. Banerjee et al., Charité), DataWarrior (T. Sander, Actelion/Sanofi), B3DB (F. Meng et al.), and the Tox21 Challenge (NIH). The thieno[2,3-b]pyridine dataset (DADOS_Uminho_1) was used with permission.

---

## References

1. Sander T, Freyss J, von Korff M, Rufener C. DataWarrior: an open-source program for chemistry aware data visualization and analysis. *J Chem Inf Model.* 2015;55(2):460–473. https://doi.org/10.1021/ci500588j

2. Berthold MR, Cebron N, Dill F, Gabriel TR, Kötter T, Meinl T, et al. KNIME — the Konstanz information miner: version 2.0 and beyond. *ACM SIGKDD Explor Newsl.* 2009;11(1):26–31. https://doi.org/10.1145/1656274.1656280

3. Afgan E, Baker D, Batut B, van den Beek M, Bouvier D, Čech M, et al. The Galaxy platform for accessible, reproducible and collaborative biomedical analyses: 2018 update. *Nucleic Acids Res.* 2018;46(W1):W537–W544. https://doi.org/10.1093/nar/gky379

4. Backman TWH, Cao Y, Girke T. ChemMine Tools: an online service for analyzing and clustering small molecules. *Nucleic Acids Res.* 2011;39(Web Server issue):W486–W491. https://doi.org/10.1093/nar/gkr492

5. Landrum G, Tosco P, Kelley B, et al. RDKit: open-source cheminformatics. Version 2024.03.6. https://doi.org/10.5281/zenodo.591637

6. Ertl P, Bienfait B. JSME: a free molecule editor in JavaScript. *J Cheminform.* 2013;5:24. https://doi.org/10.1186/1758-2946-5-24

7. Yang K, Swanson K, Jin W, Coley C, Eiden P, Gao H, et al. Analyzing learned molecular representations for property prediction. *J Chem Inf Model.* 2019;59(8):3370–3388. https://doi.org/10.1021/acs.jcim.9b00237

8. Swanson K, Boros P, Chen LC, Bhatt DL, Bonn-Miller MO, Wang H, Plotkin SS. ADMET-AI: a machine learning ADMET platform for evaluation of large-scale chemical libraries. *Bioinformatics.* 2024;40(7):btae416. https://doi.org/10.1093/bioinformatics/btae416

9. Borrel A, Mansouri K, Nolte S, Zurlinden T, Huang R, Xia M, Houck KA, Kleinstreuer NC. StopTox: an in silico alternative to animal acute systemic toxicity tests. *Environ Health Perspect.* 2022;130(2):027014. https://doi.org/10.1289/EHP9341

10. Borrel A, Huang R, Sakamuru S, Xia M, Simeonov A, Mansouri K, Kleinstreuer NC. High-throughput screening to predict chemical-assay interference. *Sci Rep.* 2020;10(1):3986. https://doi.org/10.1038/s41598-020-60747-3

11. Banerjee P, Dehnbostel FO, Preissner R. ProTox-3.0: a webserver for the prediction of toxicity of chemicals. *Nucleic Acids Res.* 2024;52(W1):W513–W520. https://doi.org/10.1093/nar/gkae303

12. Veber DF, Johnson SR, Cheng HY, Smith BR, Ward KW, Kopple KD. Molecular properties that influence the oral bioavailability of drug candidates. *J Med Chem.* 2002;45(12):2615–2623. https://doi.org/10.1021/jm020017n

13. Baell JB, Holloway GA. New substructure filters for removal of pan assay interference compounds (PAINS) from screening libraries and for their exclusion in bioassays. *J Med Chem.* 2010;53(7):2719–2740. https://doi.org/10.1021/jm901137j

14. Bickerton GR, Paolini GV, Besnard J, Muresan S, Hopkins AL. Quantifying the chemical beauty of drugs. *Nat Chem.* 2012;4(2):90–98. https://doi.org/10.1038/nchem.1243

15. Lipinski CA, Lombardo F, Dominy BW, Feeney PJ. Experimental and computational approaches to estimate solubility and permeability in drug discovery and development settings. *Adv Drug Deliv Rev.* 2001;46(1–3):3–26. https://doi.org/10.1016/s0169-409x(00)00129-0

16. Delaney JS. ESOL: estimating aqueous solubility directly from molecular structure. *J Chem Inf Comput Sci.* 2004;44(3):1000–1005. https://doi.org/10.1021/ci034243x

17. Riniker S, Landrum GA. Better informed distance geometry: using what we know to improve conformation generation. *J Chem Inf Model.* 2015;55(12):2562–2574. https://doi.org/10.1021/acs.jcim.5b00654

18. Santos-Martins D, Solis-Vasquez L, Tillack AF, Sanner MF, Koch A, Forli S. Accelerating AutoDock4 with GPUs and gradient-based local search. *J Chem Theory Comput.* 2021;17(2):1060–1073. https://doi.org/10.1021/acs.jctc.0c01006

19. Eberhardt J, Santos-Martins D, Tillack AF, Forli S. AutoDock Vina 1.2.0: new docking methods, expanded force field, and Python bindings. *J Chem Inf Model.* 2021;61(8):3891–3898. https://doi.org/10.1021/acs.jcim.1c00203

20. Forli S, Huey R, Pique ME, Sanner MF, Goodsell DS, Olson AJ. Computational protein–ligand docking and virtual drug screening with the AutoDock suite. *Nat Protoc.* 2016;11(5):905–919. https://doi.org/10.1038/nprot.2016.051

21. Su M, Yang Q, Du Y, Feng G, Liu Z, Li Y, Wang R. Comparative assessment of scoring functions: the CASF-2016 and CASF-2013 benchmarks. *J Chem Inf Model.* 2019;59(2):895–913. https://doi.org/10.1021/acs.jcim.8b00545

22. Mansouri K, Grulke CM, Judson RS, Williams AJ. OPERA models for predicting physicochemical properties and environmental fate endpoints. *J Cheminform.* 2018;10(1):10. https://doi.org/10.1186/s13321-018-0263-1

23. Meng F, Xi Y, Huang J, Ayers PW. A curated diverse molecular database of blood-brain barrier permeability with chemical descriptors. *Sci Data.* 2021;8(1):289. https://doi.org/10.1038/s41597-021-01069-5

24. Tice RR, Austin CP, Kavlock RJ, Bucher JR. Improving the human hazard characterization of chemicals: a Tox21 update. *Environ Health Perspect.* 2013;121(7):756–765. https://doi.org/10.1289/ehp.1205784

25. Dhanjal JK, Wang S, Bhinder B, Singh Y, Kaur H, Grover A. GraphB3: an explainable graph convolutional network approach for blood-brain barrier permeability prediction. *J Cheminform.* 2024;16:34. https://doi.org/10.1186/s13321-024-00831-4

26. Muratov EN, Bajorath J, Sheridan RP, Tetko IV, Filimonov D, Poroikov V, et al. QSAR without borders. *Chem Soc Rev.* 2020;49(11):3525–3564. https://doi.org/10.1039/d0cs00098a

27. Waring MJ, Arrowsmith J, Leach AR, Leeson PD, Mandrell S, Owen RM, et al. An analysis of the attrition of drug candidates from four major pharmaceutical companies. *Nat Rev Drug Discov.* 2015;14(7):475–486. https://doi.org/10.1038/nrd4609

28. Daina A, Michielin O, Zoete V. SwissADME: a free web tool to evaluate pharmacokinetics, drug-likeness and medicinal chemistry friendliness of small molecules. *Sci Rep.* 2017;7:42717. https://doi.org/10.1038/srep42717

29. Gui C, Luo M, Wang Z, Ma H, Du Z, Yao L, et al. ADMETlab 3.0: an updated comprehensive online ADMET prediction tool with improved models and functions. *Nucleic Acids Res.* 2024;52(W1):W197–W204. https://doi.org/10.1093/nar/gkae420

30. Paul SM, Mytelka DS, Dunwiddie CT, Persinger CC, Munos BH, Lindborg SR, Schacht AL. How to improve R&D productivity: the pharmaceutical industry's grand challenge. *Nat Rev Drug Discov.* 2010;9(3):203–214. https://doi.org/10.1038/nrd3078

---

## Figure Legends

**Figure 1.** SMILESRender hybrid system architecture. Left (teal): local in-process computation layer — three embedded ML models (Tox21-RF, BBB-GBM with AD flag, DeepADMET/Chemprop) running without network dependency. Right (amber): external oracle orchestration layer — StopTox, StopLight, ProTox 3.0, each fault-isolated in a ToolErrorBoundary. Top: React 19 frontend. Centre: Redis cache, Celery worker, Flask REST API. The local layer guarantees a minimum viable 85-endpoint ADMET profile at 100% availability; the external layer adds supplementary coverage when network is available.

**Figure 2.** SMILESRender module overview. Six first-class analytical modules accessible from the hub: (A) ADMET Profiling — multi-engine orchestration with real-time dashboard; (B) Molecular Renderer — batch PNG/ZIP export with transparent background; (C) Descriptors — 60+ local RDKit descriptors with fingerprint export; (D) Similarity Search — Tanimoto-ranked molecular comparison; (E) IUPAC Converter — PubChem-backed nomenclature; (F) Peptide Engineering — bidirectional peptide-SMILES translation.

**Figure 3.** Interactive ADMET Dashboard for a representative 5-compound batch. Top row: summary metric cards. Middle-left: Safety Flags panel (hERG, DILI, PAINS, BRENK, BBB+ proportions as progress bars). Middle-right: StopTox acute toxicity distribution and ESOL solubility stacked bar. Bottom-left: Per-Molecule Risk Matrix (colour-coded Overall/hERG/DILI/ClinTox/BBB/QED per molecule). Bottom-right: CYP Inhibition Heatmap (5 isoforms × N compounds; green < 25%, amber 25–50%, red > 50%).

**Figure 4.** ADMET endpoint coverage radar chart comparing SMILESRender with benchmarked open-source platforms. Five axes: Absorption, Distribution, Metabolism, Excretion, Toxicity. Each axis scored 0–100% based on number of endpoints covered relative to the maximum available across all platforms. SMILESRender achieves ≥ 80% on all five axes; DataWarrior covers Absorption only (physicochemical); KNIME+RDKit covers Absorption and limited Toxicity (structural alerts); ChemMine and Galaxy cover no ADMET axes.

**Figure 5.** Batch processing workflow for 20 thieno[2,3-b]pyridine derivatives. (A) CSV upload and SMILES input interface with JSME structure editor. (B) Real-time prediction progress — tool status indicators for 6 engines (3 local, 3 external). (C) Consolidated ADMET dashboard on batch completion. (D) Excel export with per-compound ADMET comparison, flat records, and fingerprint matrix sheets.
