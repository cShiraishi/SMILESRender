# SMILESRender: A comprehensive browser-based orchestration platform for cheminformatics profiling and bidirectional peptide engineering

**Authors:** Rui Shiraishi [1,*], [Nome dos Coautores]  
**Target Journal:** Journal of Cheminformatics  
**Article Type:** Software Article  

---

## Abstract

**Background:** The *in silico* evaluation of absorption, distribution, metabolism, excretion, and toxicity (ADMET) alongside structural conversions is a critical phase in modern hit-to-lead optimization pipelines. However, the current landscape of cheminformatics web tools is highly fragmented, forcing researchers to navigate multiple disjointed server portals to aggregate predictive models. Furthermore, novel computational libraries for specialized tasks, such as bidirectional peptide-SMILES translations, often lack accessible graphical user interfaces (GUIs), limiting their adoption by structural biologists and medicinal chemists without advanced programming expertise.

**Results:** We present SMILESRender, an open-source, web-based platform that unifies disparate computational chemistry toolsets into a single, high-performance interface. The platform orchestrates four independent, state-of-the-art predictive oracles (StopTox [1], StopLight [2], pkCSM [3], and ADMETlab 3.0 [4]) via a secure, asynchronous local reverse-proxy. Concurrently, it computes 212 physicochemical descriptors (see Table S1) and multiple structural fingerprints (Morgan ECFP4, MACCS, and Atom Pairs) locally using RDKit. We also integrated the `PepLink` library to provide seamless bidirectional translation between canonical amino acid sequences and molecular SMILES. To ensure robust deployment on low-resource cloud infrastructures, SMILESRender implements a frontend-driven asynchronous chunking algorithm that prevents server-side Out-Of-Memory (OOM) crashes during bulk dataset processing by segmenting requests into throttled payload chunks ($k=10$).

**Conclusions:** SMILESRender bridges the gap between advanced predictive cheminformatics algorithms and accessible web design. By consolidating diverse endpoints and structural analyses into a highly reactive dashboard natively deployable via Docker, it significantly lowers the barrier to entry for bulk chemical space profiling, dataset preparation for machine learning, and peptide drug exploration.

---

## 1. Background

The early-stage identification of drug-like candidates relies heavily on the computational modeling of physicochemical properties and ADMET profiles. The scientific community has historically relied on a suite of renowned, independent web servers such as pkCSM and ADMETlab 3.0 for these models. While highly accurate, performing high-throughput comparative benchmarking across these platforms is notoriously inefficient. Researchers are typically forced to submit queries manually, scrape the heterogeneous outputs, and compile data into spreadsheets—a process vulnerable to human error and severely lacking in automation.

Simultaneously, the computational engineering of peptide therapeutics is gaining unprecedented momentum. Converting canonical amino acid sequences to their Simplified Molecular-Input Line-Entry System (SMILES) representations—and crucially, reverse-engineering chemical SMILES back into biological sequences—remains an informatics bottleneck. Modern Python libraries like `PepLink` execute these tasks programmatically, yet they lack integrated web frameworks to serve the broader life sciences community.

To resolve these fragmentation bottlenecks, we introduce SMILESRender. Unlike existing siloed tools, SMILESRender was engineered as a decentralized orchestrating dashboard, aggregating ADMET predictions and deep structural computations into a unified, high-performance web interface.

## 2. Implementation

SMILESRender is built upon a decoupled client-server architecture designed for extreme frontend responsiveness and strict memory efficiency.

### 2.1. Software Architecture and Interactive Design
The graphical interface leverages **React (Vite/TypeScript)** and a custom user interface design system to render complex chemical data tables, interactive radar charts, and chemical space scatter plots locally on the client's browser (via `Chart.js`). This rich client-side interactivity shifts visualization computation away from the server.

The backend is built with **Python (Flask)**, utilizing `Waitress` as a production-grade WSGI server. The backend fulfills two primary orchestration roles:
1. **Local Computations:** Utilizing the open-source `RDKit` cheminformatics toolkit for 2D molecular drawing, smart canonicalization, and computation of 212 constitutional, topological, and E-state descriptors (Supplementary Table S1).
2. **Reverse Proxy Orchestration:** Serving as a secure intermediary to fetch and parse external APIs (StopTox, StopLight, ADMETlab), effectively bypassing Cross-Origin Resource Sharing (CORS) limits while consolidating XML/HTML payload parsing into standardized JSON objects.

### 2.2. Bidirectional Peptide Engineering via PepLink
Bridging computational chemistry and structural biology, SMILESRender integrates the `PepLink` (v0.1.0) dependency. Through a dedicated *Peptide Engineering* module, the platform allows users to:
* Convert generic single-letter sequence strings (e.g., `ACDEFGH`) into explicit atom-level canonical SMILES, preparing them for traditional small-molecule ADMET models.
* Reverse-translate complex SMILES arrays back into naturally occurring or synthetic amino acid strings, automatically navigating stereochemical ambiguities.

### 2.3. Algorithmic Memory Management (Asynchronous Chunking)
Processing thousands of molecular structures simultaneously introduces severe memory overhead required by `RDKit`’s underlying C++ bindings. In resource-constrained environments (e.g., free-tier cloud containers capped at 0.1 CPU and 512MB RAM), parallel processing leads to immediate Out-of-Memory (OOM) host terminations or severe CPU throttling.
To circumvent this, we engineered an asynchronous **chunk-streaming protocol** enforced strictly by the React frontend. Bulk requests arrays (e.g., *n*=1,000 SMILES) are programmatically segmented into throttled payload chunks ($k=10$). These chunks are iteratively dispatched, resolved by the Flask backend, and progressively appended to the graphical UI state. Furthermore, the backend is strictly optimized to allocate a maximum of 4 WSGI worker threads and utilizes a strict semaphore (limited to 1 concurrent heavy computation) to prevent total CPU saturation. This architectural paradigm guarantees that the backend maintains a flat, near-constant memory footprint (≈300MB) regardless of the total library scale requested by the user.

### 2.4. Scalable Networking and Session Management
To maintain high availability under heavy traffic, SMILESRender utilizes a non-blocking networking strategy for its reverse-proxy modules. Unlike local computational tasks which are governed by a global CPU semaphore to prevent system exhaustion, external API calls to third-party ADMET oracles are executed independently with explicit request timeouts. To guarantee process integrity during simultaneous multi-user access, shared runtime dictionaries (e.g., parsing instances for `pkCSM`) are isolated via process thread-locking (`threading.Lock`), ensuring thread-safe data retrieval and preventing critical race conditions. Furthermore, the platform implements a Time-To-Live (TTL) predicated cleanup logic for session-persistent objects (e.g., `pkCSM` cookie-handlers), automatically purging stale memory entries older than 30 minutes to ensure indefinite server uptime without progressive memory degradation.

## 3. Results and Application

### 3.1. High-Throughput Benchmarking and Exportation
SMILESRender natively exports the calculated chemical space and ADMET parameters into annotated `.xlsx` spreadsheets using the `pandas` and `openpyxl` engines. The platform generates individual sheets for calculated topological descriptors alongside one-hot encoded fingerprint representations (Morgan radius 2, MACCS keys, and Atom Pairs). These standardized outputs serve perfectly as immediate inputs for downstream Quantitative Structure-Activity Relationship (QSAR) training subsets. 

### 3.2. Platform Portability and Containerization
Acknowledging the difficulties of deploying complex Python science stacks, SMILESRender ships natively with a multi-stage `Dockerfile`. It independently compiles the Bun-based TypeScript frontend and subsequently bundles the static assets alongside the necessary compiled Python dependencies (RDKit, Flask) into a reproducible alpine-based Linux container. This effectively enables isolated, 1-click cloud deployments without local configurations.

## 4. Conclusion
SMILESRender successfully demonstrates that the aggressive consolidation of decentralized external predictive oracles and local RDKit capabilities can exist harmoniously within a lightweight framework. The implementation of progressive chunking memory management, paired with the pioneering integration of bidirectional `PepLink` computations, provides a uniquely optimized environment for pedagogical exploration and early-stage professional drug discovery benchmarking. By removing the silos dividing computational chemistry web services, SMILESRender aims to accelerate hit-to-lead iteration limits globally.

---

## 5. Availability and Requirements
* **Project Name:** SMILESRender
* **Project Home Page:** https://github.com/cShiraishi/SMILESRender
* **Operating System(s):** Platform independent (Web browser) / Docker
* **Programming Languages:** TypeScript (React), Python 3.12+
* **Other Requirements:** Docker, or local installation using Bun v1.0+ and `python-dotenv`.
* **License:** MIT License.

## 6. Abbreviations
**ADMET:** Absorption, Distribution, Metabolism, Excretion, and Toxicity; **CORS:** Cross-Origin Resource Sharing; **GUI:** Graphical User Interface; **OOM:** Out of Memory; **QSAR:** Quantitative Structure-Activity Relationship; **SMILES:** Simplified Molecular-Input Line-Entry System; **WSGI:** Web Server Gateway Interface.

## 7. References
1. *Placeholder for StopTox reference.*
2. *Placeholder for StopLight reference.*
3. *Placeholder for pkCSM reference.*
4. *Placeholder for ADMETlab 3.0 reference.*
