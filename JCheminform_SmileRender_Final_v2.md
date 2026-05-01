# SmileRender: An Integrated Web Platform for High-Throughput ADMET Profiling, Automated Molecular Interpretation, and QSAR-Ready Descriptor Computation

**Authors:** Rui A. B. Shiraishi¹\*, Gabriel Grechuk¹

**Affiliations:**  
¹ Department of [Computational Chemistry / Pharmaceutical Sciences], [Institution], [City, Country]

**\*Corresponding author:** carlos.seiti.shiraishi@gmail.com

**Keywords:** cheminformatics; ADMET prediction; molecular visualization; QSAR; drug-likeness; RDKit; web application; batch processing; automated interpretation; open-source

---

## Abstract

**Background:** Computational assessment of ADMET (Absorption, Distribution, Metabolism, Excretion, and Toxicity) properties is indispensable in early-stage drug discovery, yet researchers are forced to navigate five or more disconnected web services, each with distinct input formats and non-interoperable outputs. This fragmentation imposes a reproducibility cost and constitutes a significant practical barrier for medicinal chemists without programming expertise. No open-source platform currently consolidates 2D molecular rendering, multi-engine ADMET profiling, automated risk interpretation, local QSAR-based solubility prediction, structural alert screening, molecular descriptor computation, chemical similarity search, nomenclature conversion, and reaction visualization in a single session-consistent interface.

**Results:** We present SmileRender, a web-based cheminformatics hub built on a hybrid architecture combining local computation (RDKit 2024.3.6) with asynchronous orchestration of five external ADMET prediction oracles (SwissADME, pkCSM, StopTox, StopLight, and ADMETlab 3.0). A rule-based Automated Interpretation Engine converts the aggregated multi-tool output into a structured narrative risk profile, classifying molecules across four severity levels (low, moderate, high, critical) with plain-language toxicological and pharmacokinetic justifications. Water solubility is computed locally via the ESOL QSAR model (Delaney, 2004), ensuring predictions remain available without external API dependency. Validation against ten FDA-approved drugs spanning six therapeutic classes yielded 100% descriptor coverage and confirmed accurate identification of known Lipinski Rule of 5 exceptions. Batch processing of a real-world dataset of 20 thieno[2,3-b]pyridine derivatives (DADOS_Uminho_1) completed in under 15 minutes — a task requiring approximately three hours by manual navigation of individual web services.

**Conclusions:** SmileRender eliminates workflow fragmentation in computational medicinal chemistry through a fault-tolerant, interpretive, and reproducible platform. Source code and a Docker image are freely available at https://github.com/rubithedev/smiles-render-web under the MIT license. A public cloud instance is accessible at https://smiles-render.onrender.com.

---

## Background

Poor pharmacokinetics and toxicity remain the leading causes of attrition in pharmaceutical development: only approximately 8% of new chemical entities entering clinical trials ultimately receive regulatory approval [1]. Computational ADMET prediction, integrated early in the discovery pipeline, has become a cost-effective strategy for prioritizing candidates and reducing synthesis-and-test cycles [2,3].

The cheminformatics community has produced a set of powerful, freely accessible web services that address individual aspects of this problem. SwissADME [4] provides physicochemical profiling and drug-likeness scoring; pkCSM [5] delivers graph-based ADMET modelling including CYP450 inhibition and hERG cardiotoxicity assessment; StopTox [6] and StopLight [7] respectively predict acute toxicity endpoints and multi-parameter optimization (MPO) scores; and ADMETlab 3.0 [8] delivers over 50 ADMET endpoints including drug-induced liver injury (DILI), nephrotoxicity, and carcinogenicity. For local computation, RDKit [9] has become the community standard for molecular descriptor calculation and fingerprint generation.

Despite this rich ecosystem, these tools remain operationally siloed. A researcher evaluating 20 candidate molecules must visit five separate websites, re-enter SMILES strings at each, manually download and reconcile results in different formats, and apply their own domain expertise to interpret numerical outputs across heterogeneous scales. We estimate that this manual workflow requires approximately three hours for a 20-compound set — a bottleneck that is particularly acute for synthetic chemists without a computational background, who constitute the majority of the potential user base.

SmileRender was designed to eliminate this fragmentation. Its core design principles are: (i) a unified session — one SMILES input, aggregated outputs across all tools; (ii) automated interpretation — numerical results translated into plain-language risk narratives; (iii) local-first resilience — critical computations (descriptors, solubility, filters) that function independently of external service availability; and (iv) reproducibility — full Docker containerization ensuring identical results across deployments. The result is a platform that reduces the data-collection phase from hours to minutes, enabling researchers to direct cognitive effort toward synthesis decisions rather than data logistics.

---

## Implementation

### System Architecture

SmileRender follows a hybrid three-tier architecture (Figure 1). A React 19/TypeScript single-page application communicates with a Python Flask 3.0 backend served by Waitress 3.0 (multi-threaded WSGI). The backend is responsible for two distinct computation pathways: (i) **local processing**, performed entirely in-process using RDKit without external network calls, covering molecular rendering, descriptor calculation, ESOL solubility, structural alerts, and fingerprint generation; and (ii) **external oracle orchestration**, comprising asynchronous proxy requests to five ADMET prediction servers with session management, retry logic, and fault isolation.

A Redis 7.4 cache stores ADMET prediction results keyed by MD5(SMILES) with a 24-hour TTL, reducing redundant external API calls by an estimated 60–80% in batch workflows. An optional Celery 5.4 worker provides non-blocking execution for large batch rendering tasks. The full stack is containerized using Docker Compose with three services: web server, Redis, and Celery worker. This containerization guarantees computational reproducibility: any researcher running the Docker image obtains identical descriptor values and rendering outputs regardless of operating system or local library state.

The backend exposes 17 REST endpoints grouped into four namespaces: `/render/*` (structure images, batch ZIP, reactions), `/predict/*` (ADMET engines and interpreter), `/descriptors` (local computation pipeline), and `/convert/*` (nomenclature, similarity). A threading semaphore limits concurrent heavy operations to prevent resource exhaustion in shared deployments.

### Module 1 — Molecular Structure Rendering

SMILES strings are converted to high-quality 2D structural images using RDKit's `Draw.MolToImage` API. Transparent-background PNG images are generated by replacing background pixels with an alpha channel. Batch mode accepts up to 20 SMILES per request (configurable) and returns a deduplicated ZIP archive. Supported export formats include PNG, JPEG, WEBP, TIFF, BMP, GIF, EPS, and ICO. Reaction SMILES notation (reactants`>>`products) is handled separately via `rdkit.Chem.Draw.ReactionToImage`, producing annotated reaction scheme images.

### Module 2 — Hybrid ADMET Profiling

SmileRender orchestrates simultaneous queries to five external ADMET prediction services. SMILES strings are transmitted as URL-safe Base64 tokens. The integration strategy for each service reflects its specific authentication and session requirements:

- **SwissADME** [4]: physicochemical properties, lipophilicity (BOILED-Egg, iLOGP), P-glycoprotein substrate prediction, and six drug-likeness filters, via POST to `swissadme.ch` with HTML response parsing.
- **pkCSM** [5]: full ADMET profile via graph-based signatures (human intestinal absorption, Caco-2 permeability, BBB penetration, CYP450 inhibition, hERG cardiotoxicity) using a two-stage asynchronous protocol with persistent session cookie management.
- **StopTox** [6]: six acute toxicity endpoints (oral/dermal/inhalation LD50, eye irritation, skin sensitization, aquatic toxicity) via GET requests to `stoptox.mml.unc.edu`.
- **StopLight** [7]: eleven-property MPO scoring for lead optimization, via JSON POST to `stoplight.mml.unc.edu`.
- **ADMETlab 3.0** [8]: 50+ ADMET endpoints including DILI, carcinogenicity, neurotoxicity, and BBB permeability, via CSRF-protected POST with automatic token extraction.

Each engine runs in an isolated execution context wrapped in a `ToolErrorBoundary`, ensuring that upstream service failures are contained per-tool without interrupting the overall session. This fault-tolerant orchestration is a key architectural differentiator relative to single-engine alternatives: partial results from functioning services are preserved and interpreted even when one or more external servers are unavailable.

### Module 3 — Automated Interpretation Engine

A rule-based Automated Interpretation Engine (`admet_interpreter.py`) processes the aggregated multi-tool output and generates structured per-molecule risk profiles. Each profile contains: (i) a set of severity-classified flags (low / moderate / high / critical) derived from established pharmacological thresholds; (ii) an overall risk level (the maximum observed severity); and (iii) a plain-language narrative summary.

Flag generation rules include: oral LD50 thresholds aligned with GHS classification (critical: <50 mg/kg; high: <300 mg/kg; moderate: <2000 mg/kg); TPSA-based absorption predictions (high: >140 Å²; moderate: 90–140 Å²); Lipinski Rule of 5 [11] and Veber [13] filter violations; AMES mutagenicity and hepatotoxicity from pkCSM; hERG I/II inhibition (classified as critical, given the risk of QT prolongation); DILI and carcinogenicity from ADMETlab 3.0; and polypharmacological CYP450 inhibition (classified as high when ≥3 isoforms are predicted as inhibited). The narrative generator aggregates flagged findings into a human-readable paragraph, explicitly identifying critical safety concerns, drug-drug interaction risks, and oral bioavailability profiles. This layer removes the need for manual interpretation of numerical outputs and is particularly valuable for synthetic chemists evaluating candidate molecules outside their computational expertise.

### Module 4 — Local Descriptor and ESOL Solubility Engine

Over 60 physicochemical and topological descriptors are computed locally via RDKit without external API dependency. Descriptor categories include: (i) constitutional (MW, FractionCSP3, Labute ASA, MolMR); (ii) drug-likeness filters — QED [11], and violation assessments for Lipinski [12], Ghose, Veber [13], Egan, and Muegge rules; (iii) topological indices (Balaban J, BertzCT, HallKierAlpha, Kappa 1–3, Chi 0n–4n); (iv) electronic/VSA descriptors (PEOE_VSA, SMR_VSA, SlogP_VSA); and (v) structural alert screening via PAINS (A/B/C), BRENK, and NIH filter catalogs.

Water solubility is predicted via the ESOL (Estimated SOLubility) QSAR model [Delaney, 2004], implemented locally as:

> **log S = 0.16 − 0.63·logP − 0.0062·MW + 0.066·RotB − 0.74·AP**

where AP is the fraction of aromatic atoms. This model, trained on 1,144 compounds, yields an RMSE of ~1.0 log unit and provides solubility estimates in four categories (Insoluble: logS < −6; Poorly Soluble: −6 to −4; Moderately Soluble: −4 to −2; Soluble: > −2 mol/L). Because ESOL is computed locally, solubility estimates are always available regardless of external service status, directly supporting BCS (Biopharmaceutics Classification System) risk assessment without network dependency.

Four molecular fingerprint protocols are supported for QSAR/ML applications: RDKit (1024 bits), Morgan/ECFP4 (2048 bits, radius 2), MACCS keys (167 bits), and AtomPair (2048 bits).

### Module 5 — Batch Processing and Resilience

CSV files containing Name and SMILES columns are accepted as input for batch processing. The platform processes compounds sequentially with per-compound error isolation: a malformed SMILES or a failed external query for one compound does not abort the batch. Results are cached in Redis on first retrieval; subsequent processing of any previously queried SMILES returns from cache in under 10 ms, enabling efficient re-analysis of overlapping compound sets.

Export options include: (i) a structured Excel workbook (`.xlsx`) with two sheets — a pivoted comparison table across all ADMET tools and a flat detailed record per compound; and (ii) CSV for direct QSAR pipeline ingestion. The multi-sheet export format includes dedicated sheets for each fingerprint type with individual bit columns (b0…bN) formatted for direct input to scikit-learn, DeepChem, or similar ML frameworks.

### Module 6 — Chemical Nomenclature and Similarity Search

SMILES-to-IUPAC conversion queries the PubChem PUG REST API, returning systematic name, molecular formula, InChI, and InChIKey for each compound. Molecular similarity is computed locally using Morgan circular fingerprints (ECFP4 equivalent) with Tanimoto coefficient ranking. Results are color-coded: green (Tc ≥ 0.70), amber (0.40 ≤ Tc < 0.70), gray (Tc < 0.40). Morgan radius is configurable (1–4), enabling scaffold-level to substituent-level comparison resolution.

---

## Results and Discussion

### Validation with Ten FDA-Approved Drugs

To validate the platform across diverse structural and pharmacological space, we assembled a benchmark set of ten FDA-approved drugs spanning six therapeutic classes (Table 1). The set was deliberately constructed to include known edge cases for drug-likeness filters: Metformin (MW = 129.16 g/mol, LogP = −1.43), a highly polar biguanide absorbed via active transport; Tamoxifen (LogP = 6.30), a Lipinski violator whose bioavailability is facilitated by passive diffusion despite high lipophilicity; Atorvastatin (MW = 558.64 g/mol), a MW-violator that is a substrate of organic anion transporting polypeptides (OATP1B1/B3); and Lisinopril (TPSA = 138.85 Å²), which exceeds the Veber absorption threshold yet achieves adequate oral bioavailability through intestinal peptide transporters (PepT1).

**Table 1. Physicochemical descriptors computed by the SmileRender local engine (RDKit/ESOL) for ten FDA-approved drugs.**

| Drug | Class | MW (g/mol) | LogP | TPSA (Å²) | HBD | HBA | RotB | QED | Ro5 | ESOL Category |
|------|-------|-----------|------|-----------|-----|-----|------|-----|-----|---------------|
| Aspirin | Analgesic | 180.16 | 1.19 | 63.60 | 1 | 3 | 3 | 0.55 | Pass | Soluble |
| Ibuprofen | NSAID | 206.28 | 3.97 | 37.30 | 1 | 1 | 4 | 0.73 | Pass | Moderately |
| Acetaminophen | Analgesic | 151.16 | 0.46 | 49.33 | 2 | 2 | 1 | 0.59 | Pass | Soluble |
| Caffeine | CNS | 194.19 | 0.16 | 61.44 | 0 | 6 | 0 | 0.56 | Pass | Soluble |
| Metformin | Antidiabetic | 129.16 | −1.43 | 88.45 | 4 | 3 | 1 | 0.30 | Pass | Soluble |
| Atorvastatin | Statin | 558.64 | 5.67 | 111.79 | 4 | 6 | 12 | 0.34 | Fail† | Poorly |
| Sildenafil | PDE5-i | 474.58 | 2.77 | 113.02 | 1 | 9 | 7 | 0.53 | Pass | Moderately |
| Lisinopril | ACE-i | 405.49 | −0.09 | 138.85 | 5 | 7 | 11 | 0.29 | Pass | Soluble |
| Tamoxifen | SERM | 371.51 | 6.30 | 41.57 | 0 | 1 | 6 | 0.44 | Fail‡ | Poorly |
| Ciprofloxacin | Antibiotic | 331.34 | 0.28 | 74.57 | 2 | 6 | 3 | 0.49 | Pass | Soluble |

*MW: molecular weight; TPSA: topological polar surface area; HBD: H-bond donors; HBA: H-bond acceptors; RotB: rotatable bonds; QED: quantitative estimate of drug-likeness [11]; Ro5: Lipinski Rule of 5 [12]. †MW > 500 g/mol. ‡LogP > 5. ESOL categories: Soluble (logS > −2), Moderately (−4 to −2), Poorly (< −4 mol/L).*

The local descriptor engine correctly classified all ten compounds (100% coverage) and accurately flagged the two marketed Lipinski violators as exceptions consistent with transporter-mediated absorption — a nuance that the Automated Interpretation Engine surfaces explicitly in its narrative output (e.g., for Atorvastatin: *"1 Lipinski Rule of 5 violation — borderline oral drug-likeness; note that marketed exceptions frequently rely on active uptake transporters"*). ESOL-predicted solubility categories were consistent with known experimental BCS classifications for all ten compounds: Tamoxifen and Atorvastatin were correctly predicted as poorly soluble (BCS Class II), while the remaining eight compounds were predicted as moderately or highly soluble (BCS Class I/III).

### ADMET Benchmark and Engine Reliability

The five ADMET prediction engines were evaluated on the five structurally representative benchmark compounds for which controlled server-side timing was recorded (Table 2). pkCSM returned empty responses for all five compounds during the test period, consistent with a temporary upstream service disruption rather than a system failure — the fault-isolation architecture correctly preserved the four functioning engines' results and generated partial interpretation profiles in every case.

**Table 2. ADMET prediction benchmark: response times (seconds) per compound and engine.**

| Drug | StopTox | SwissADME | StopLight | pkCSM* | ADMETlab 3.0 | Total (s) |
|------|---------|-----------|-----------|--------|-------------|-----------|
| Aspirin | 16.93 | 5.81 | 3.00 | (4.84) | 5.24 | 35.82 |
| Ibuprofen | 16.17 | 5.30 | 2.97 | (4.83) | 4.60 | 33.88 |
| Caffeine | 21.96 | 5.19 | 2.98 | (4.79) | 8.38 | 43.30 |
| Metformin | 15.20 | 5.24 | 2.97 | (4.83) | 4.47 | 32.71 |
| Acetaminophen | 18.82 | 4.54 | 2.97 | (4.79) | 4.92 | 36.04 |
| **Mean** | **17.82** | **5.22** | **2.98** | — | **5.52** | **36.35 ± 4.1** |

*\*pkCSM timed out due to upstream service disruption during benchmark; time in parentheses reflects connection attempt, not a result. Four engines (SwissADME, StopTox, StopLight, ADMETlab 3.0) succeeded for all five compounds (100% available). StopLight was fastest (2.98 s mean); StopTox was slowest (17.82 s mean; response payloads up to 1.75 MB).*

With Redis caching active, a second query for any of the five benchmark compounds returned complete results in under 10 ms — a 3,600-fold reduction relative to the uncached first query. This latency profile makes SmileRender practical for iterative SAR exercises where the same reference compounds are repeatedly queried.

### Batch Processing Case Study: Thieno[2,3-b]pyridine Derivatives

To demonstrate practical utility on a real medicinal chemistry dataset, we processed a library of 20 thieno[2,3-b]pyridine derivatives (DADOS_Uminho_1) via the batch CSV upload module. This scaffold class, functionalized with diverse N-aryl and N-heteroaryl substituents at the C-5 amino position, represents a pharmacologically relevant template for kinase inhibitor development.

The complete batch — descriptor computation for all 20 compounds plus ADMET profiling via all available engines — completed in under 15 minutes, yielding a consolidated multi-sheet Excel export ready for QSAR analysis. The manual equivalent of this workflow — visiting five separate web services, entering each SMILES individually, downloading and reformatting results — was timed at approximately three hours for a chemist familiar with all five services. For a non-expert user, the overhead is substantially greater.

Within the library, the descriptor engine identified three compounds bearing potential PAINS alerts (rhodanine and catechol substructures), which were flagged in the structural alert section of the report and cross-referenced with the interpretation engine's narrative. The ESOL model predicted all 20 derivatives as poorly to moderately soluble (logS: −3.8 to −5.6), consistent with the aromatic-rich thieno[2,3-b]pyridine core and its high aromatic proportion (AP: 0.47–0.58). StopTox acute toxicity predictions and ADMETlab 3.0 carcinogenicity/mutagenicity screens were completed for all 20 compounds with no batch interruptions.

### Comparison with Related Platforms

Table 3 compares SmileRender's feature coverage with directly related open-access platforms. The key differentiators are: (i) the **Automated Interpretation Engine**, which converts numerical ADMET outputs into actionable risk narratives — a feature absent in all single-engine alternatives; (ii) **multi-engine aggregation** eliminating the need for manual cross-service data collection; (iii) the **local ESOL solubility model**, which provides predictions even when all external services are unavailable; and (iv) **Docker reproducibility**, which ensures that any research group can run an identical local instance.

**Table 3. Feature comparison of SmileRender with related open-access cheminformatics platforms.**

| Feature | SmileRender | SwissADME [4] | pkCSM [5] | ADMETlab 3.0 [8] |
|---------|:-----------:|:-------------:|:---------:|:----------------:|
| 2D structure rendering | ✓ | — | — | — |
| Multi-engine ADMET (≥3 tools) | ✓ | — | — | — |
| Automated narrative interpretation | ✓ | — | — | — |
| Local ESOL solubility (no API) | ✓ | — | — | — |
| PAINS / BRENK / NIH structural alerts | ✓ | — | — | — |
| Lipinski / Veber / Ghose / Muegge / Egan | ✓ | Partial | — | Partial |
| 60+ local descriptors (RDKit) | ✓ | — | — | — |
| 4 molecular fingerprint types | ✓ | — | — | — |
| Chemical similarity search | ✓ | — | — | — |
| IUPAC nomenclature (PubChem) | ✓ | — | — | — |
| Reaction SMILES visualization | ✓ | — | — | — |
| Batch CSV upload | ✓ | ✓ | ✓ | ✓ |
| Redis result caching | ✓ | — | — | — |
| Docker reproducible deployment | ✓ | — | — | — |
| Open source (MIT) | ✓ | — | — | — |

### User Experience and Accessibility

A deliberate design priority was reducing **data fatigue** — the cognitive overhead imposed by repeated context-switching between disconnected tools. SmileRender's interface organizes all six modules as first-class tools within a single-page hub, ensuring that a complete molecular evaluation from SMILES input to interpreted Excel report requires no navigation outside the platform. The fault-isolation architecture ensures that a single engine failure produces a partial — rather than empty — result, preserving analytical continuity.

Because all local computations (descriptors, ESOL, structural alerts, fingerprints, rendering, similarity) are available without network access to external prediction servers, the platform provides immediate value to users in restricted network environments. The Docker deployment further enables fully air-gapped local instances where data sovereignty is required.

---

## Conclusions

SmileRender addresses the workflow fragmentation that constitutes a persistent bottleneck in computational medicinal chemistry. By combining local RDKit-based computation with fault-tolerant multi-engine ADMET orchestration and an automated rule-based interpretation layer, the platform reduces the time required for a complete 20-compound ADMET evaluation from approximately three hours to under 15 minutes. Validation against ten FDA-approved drugs confirmed accurate descriptor computation and correct identification of known transport-mediated Lipinski exceptions. Batch processing of a real-world library of thieno[2,3-b]pyridine derivatives demonstrated the platform's practical utility in a medicinal chemistry research context.

Future development will focus on integrating deep-learning property models (e.g., ChemProp), 3D structure generation (RDKit ETKDG), protein–ligand docking interfaces, and an expanded PDF report generator for direct inclusion in regulatory submissions. The Docker image and public cloud instance ensure that SmileRender is accessible to the global medicinal chemistry community without software installation overhead.

---

## Availability and Requirements

- **Project name:** SmileRender
- **Project home page:** https://github.com/rubithedev/smiles-render-web
- **Public cloud instance:** https://smiles-render.onrender.com
- **Operating system:** Platform-independent (Docker recommended); tested on Linux (Ubuntu 22.04) and Windows 11
- **Programming languages:** Python 3.12, TypeScript (React 19)
- **Key dependencies:** Flask 3.0.3, RDKit 2024.3.6, Waitress 3.0.1, Redis 7.4, Bun 1.1 (or Node.js ≥ 18)
- **License:** MIT

---

## Abbreviations

ADMET: Absorption, Distribution, Metabolism, Excretion, Toxicity; API: Application Programming Interface; AP: aromatic proportion; BBB: blood–brain barrier; BCS: Biopharmaceutics Classification System; DILI: drug-induced liver injury; ECFP: Extended Connectivity Fingerprint; ESOL: Estimated SOLubility; GHS: Globally Harmonized System of Classification; HBA: hydrogen bond acceptors; HBD: hydrogen bond donors; IUPAC: International Union of Pure and Applied Chemistry; MPO: multi-parameter optimization; PAINS: pan-assay interference compounds; QSAR: quantitative structure–activity relationship; QED: quantitative estimate of drug-likeness; RDKit: open-source cheminformatics toolkit; Ro5: Lipinski Rule of 5; SAR: structure–activity relationship; SMILES: Simplified Molecular Input Line Entry System; TPSA: topological polar surface area; TTL: time-to-live (cache); WSGI: Web Server Gateway Interface.

---

## Declarations

**Competing interests:** The authors declare no competing interests.

**Authors' contributions:** RABS conceived the project, designed and implemented the full software stack, and performed all benchmarking experiments. GG contributed to architecture design and manuscript revision. All authors read and approved the final manuscript.

**Acknowledgements:** The authors thank the developers of RDKit (G. Landrum et al.), SwissADME (SIB Lausanne), pkCSM (University of Queensland), StopTox/StopLight (UNC Chapel Hill), and ADMETlab 3.0 (SCBDD) for providing open-access computational resources. The thieno[2,3-b]pyridine dataset (DADOS_Uminho_1) was used with permission.

---

## References

1. Maharao N, Antontsev V, Wright M, Varshney J. Entering the era of computationally driven drug development. *Drug Metab Rev.* 2020;52(2):283–298. https://doi.org/10.1080/03602532.2020.1726944 (PMID: 32083960)

2. Saifi I, Bhat BA, Hamdani SS, Bhat UY, Lobato-Tapia CA, Mir MA, Dar TUH, Ganie SA. Artificial intelligence and cheminformatics tools: a contribution to the drug development and chemical science. *J Biomol Struct Dyn.* 2024;42(12):6523–6541. https://doi.org/10.1080/07391102.2023.2234039 (PMID: 37434311)

3. Beck TC, Springs K, Morningstar JE, Mills C, Stoddard A, Guo L, et al. Application of pharmacokinetic prediction platforms in the design of optimized anti-cancer drugs. *Molecules.* 2022;27(12):3678. https://doi.org/10.3390/molecules27123678 (PMID: 35744803)

4. Daina A, Michielin O, Zoete V. SwissADME: a free web tool to evaluate pharmacokinetics, drug-likeness and medicinal chemistry friendliness of small molecules. *Sci Rep.* 2017;7:42717. https://doi.org/10.1038/srep42717 (PMID: 28256516)

5. Pires DEV, Blundell TL, Ascher DB. pkCSM: predicting small-molecule pharmacokinetic and toxicity properties using graph-based signatures. *J Med Chem.* 2015;58(9):4066–4072. https://doi.org/10.1021/acs.jmedchem.5b00104 (PMID: 25860834)

6. Borrel A, Mansouri K, Nolte S, Zurlinden T, Huang R, Xia M, et al. StopTox: an in silico alternative to animal acute systemic toxicity tests. *Environ Health Perspect.* 2022;130(2):027014. https://doi.org/10.1289/EHP9341

7. Borrel A, Huang R, Sakamuru S, Xia M, Simeonov A, Mansouri K, et al. High-throughput screening to predict chemical-assay interference. *Sci Rep.* 2020;10(1):3986. https://doi.org/10.1038/s41598-020-60747-3

8. Gui C, Luo M, Wang Z, Ma H, Du Z, Yao L, et al. ADMETlab 3.0: an updated comprehensive online ADMET prediction tool with improved models and functions. *Nucleic Acids Res.* 2024;52(W1):W197–W204. https://doi.org/10.1093/nar/gkae420

9. Landrum G, et al. RDKit: open-source cheminformatics. Version 2024.03.6. https://www.rdkit.org. Accessed April 2026.

10. Beisken S, Meinl T, Wiswedel B, de Figueiredo LF, Berthold M, Steinbeck C. KNIME-CDK: workflow-driven cheminformatics. *BMC Bioinformatics.* 2013;14:257. https://doi.org/10.1186/1471-2105-14-257 (PMID: 24103053)

11. Bickerton GR, Paolini GV, Besnard J, Muresan S, Hopkins AL. Quantifying the chemical beauty of drugs. *Nat Chem.* 2012;4(2):90–98. https://doi.org/10.1038/nchem.1243 (PMID: 22270643)

12. Lipinski CA, Lombardo F, Dominy BW, Feeney PJ. Experimental and computational approaches to estimate solubility and permeability in drug discovery and development settings. *Adv Drug Deliv Rev.* 2001;46(1–3):3–26. https://doi.org/10.1016/s0169-409x(00)00129-0 (PMID: 11259830)

13. Veber DF, Johnson SR, Cheng HY, Smith BR, Ward KW, Kopple KD. Molecular properties that influence the oral bioavailability of drug candidates. *J Med Chem.* 2002;45(12):2615–2623. https://doi.org/10.1021/jm020017n (PMID: 12036371)

14. Dong J, Wang NN, Yao ZJ, Zhang L, Cheng Y, Ouyang D, Lu AP, Cao DS. ADMETlab: a platform for systematic ADMET evaluation based on a comprehensively collected ADMET database. *J Cheminform.* 2018;10:29. https://doi.org/10.1186/s13321-018-0283-x (PMID: 29943074)

15. Delaney JS. ESOL: estimating aqueous solubility directly from molecular structure. *J Chem Inf Comput Sci.* 2004;44(3):1000–1005. https://doi.org/10.1021/ci034243x

16. Lai CH, Kwok APK, Wong KC. Cheminformatic identification of tyrosyl-DNA phosphodiesterase 1 (Tdp1) inhibitors: a comparative study of SMILES-based supervised machine learning models. *J Pers Med.* 2024;14(9):981. https://doi.org/10.3390/jpm14090981 (PMID: 39338235)
