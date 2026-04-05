# SmileRender: A Unified High-Throughput Platform for Molecular Rendering and ADMET Profiling

## Abstract
Recent advances in computational cheminformatics have led to a proliferation of predictive tools for ADMET (Absorption, Distribution, Metabolism, Excretion, and Toxicity) and physicochemical profiling. However, researchers often face challenges in aggregating results from multiple platforms with disparate interfaces and data formats. We present **SmileRender**, a unified, web-based platform that integrates five state-of-the-art predictive engines (StopTox, SwissADME, StopLight, pkCSM, and ADMETlab 3.0) into a single, high-performance interface. SmileRender enables rapid 2D molecular rendering using RDKit and provides comprehensive ADMET profiling with automated report generation. The platform is designed for both individual compound analysis and high-throughput screening via CSV processing.

## 1. Introduction
The early-stage drug discovery process relies heavily on *in silico* tools to filter out compounds with poor pharmacokinetic profiles or potential toxicity...

## 2. Implementation
SmileRender is built using a modern full-stack architecture. The backend is implemented in Python using the Flask framework, served by the high-concurrency Waitress production server. The frontend utilizes React and TypeScript, optimized with the Bun runtime for fast delivery and response times...

### 2.1. Integrated Tools
- **StopTox**: Acute and categorical toxicity predictions.
- **SwissADME**: Physicochemical properties and drug-likeness.
- **StopLight**: Multi-parameter optimization.
- **pkCSM**: Comprehensive ADMET profiling.
- **ADMETlab 3.0**: Precise ADMET measurements.

### 2.2. Rendering Engine
The platform leverages the RDKit library for robust SMILES-to-2D image conversion, supporting various formats and batch processing...

## 3. Results and Benchmarks
To validate the platform's performance and stability, we conducted a benchmark test using five FDA-approved drugs (Aspirin, Ibuprofen, Caffeine, Metformin, and Paracetamol). Results showed an average success rate of 80% across all external prediction tools, with a mean processing time of 36.35 seconds per clinical compound for a full profiling run.

## 4. Scalability and Usage Limits
To ensure equitable resource allocation and platform stability on the public web instance, the following processing limits have been implemented:
- **Batch Limit**: A maximum of **20 molecules** can be processed in a single batch via CSV or multiple SMILES input.
- **Concurrency**: The server utilizes a queuing system that processes a maximum of **two simultaneous requests** per time window.

> [!IMPORTANT]
> **Local Deployment for Large Datasets**: For researchers requiring the analysis of large chemical libraries (thousands of molecules) or high-throughput screening without submission limits, it is highly recommended to **deploy SmileRender locally**. Local installation instructions are provided in the supplementary material and the project's repository.

## 5. Conclusion
SmileRender provides a much-needed consolidation of disparate ADMET tools, offering a premium user experience and automated reporting...

## Availability and Requirements
- **Project name**: SmileRender
- **Operating system(s)**: Platform independent (Web), Windows/Linux/macOS (Local)
- **Programming language**: Python, TypeScript
- **License**: MIT
- **Code repository**: https://github.com/Gabriel-Grechuk/smiles-render-web
- **Live instance**: https://smiles-render.onrender.com/
