import React, { useEffect, useState } from 'react';

interface DeepResult {
  Property: string;
  Value: any;
  Probability: number;
  Unit: string;
  Category: string;
  Tool: string;
}

// ── references per endpoint ───────────────────────────────────────────────────

const REFS: Record<string, { short: string; full: string }> = {
  hERG:                          { short: 'Karim et al., JCIM 2023',       full: 'Karim A et al. Comprehensive Machine Learning-Based Prediction of hERG. J Chem Inf Model. 2023.' },
  DILI:                          { short: 'Xu et al., CRT 2015',            full: 'Xu Y et al. Deep Learning for Drug-Induced Liver Injury. Chem Res Toxicol. 2015.' },
  ClinTox:                       { short: 'MoleculeNet (Wu et al., 2018)',   full: 'Wu Z et al. MoleculeNet: a benchmark for molecular machine learning. Chem Sci. 2018.' },
  AMES:                          { short: 'Hansen et al., JCIM 2009',        full: 'Hansen K et al. Benchmark Data Set for in Silico Prediction of Ames Mutagenicity. J Chem Inf Model. 2009.' },
  BBB_Martins:                   { short: 'Martins et al., JCIM 2012',       full: 'Martins IF et al. A Bayesian Approach to in Silico Blood-Brain Barrier Penetration. J Chem Inf Model. 2012.' },
  Bioavailability_Ma:            { short: 'Ma et al., JCIM 2008',            full: 'Ma CY et al. Prediction Models of Human Plasma Protein Binding Rate and Oral Bioavailability. J Chem Inf Model. 2008.' },
  HIA_Hou:                       { short: 'Hou et al., JCIM 2007',           full: 'Hou T et al. ADME Evaluation in Drug Discovery. 7. Prediction of Oral Absorption by Correlation and Classification. J Chem Inf Model. 2007.' },
  Pgp_Broccatelli:               { short: 'Broccatelli et al., JMC 2011',    full: 'Broccatelli F et al. A Novel Approach for Predicting P-Glycoprotein (ABCB1) Inhibition Using Molecular Interaction Fields. J Med Chem. 2011.' },
  PAMPA_NCATS:                   { short: 'Siramshetty et al., JMC 2021',    full: 'Siramshetty VB et al. NCATS Inxight Drugs: A Comprehensive and Curated Portal for Translational Research. J Med Chem. 2021.' },
  Caco2_Wang:                    { short: 'Wang et al., JCIM 2016',          full: 'Wang NN et al. ADME Properties Evaluation in Drug Discovery: Prediction of Caco-2 Cell Permeability. J Chem Inf Model. 2016.' },
  PPBR_AZ:                       { short: 'AstraZeneca / TDC 2021',          full: 'Huang K et al. Therapeutics Data Commons (TDC). NeurIPS 2021. [AstraZeneca internal dataset via TDC].' },
  VDss_Lombardo:                 { short: 'Lombardo et al., JMC 2002',       full: 'Lombardo F et al. In Silico Prediction of Volume of Distribution in Humans. Extensive Data Set and the Exploration of Linear and Nonlinear Methods. J Med Chem. 2002.' },
  Half_Life_Obach:               { short: 'Obach et al., DMD 2008',          full: 'Obach RS et al. The Prediction of Human Clinical Pharmacokinetic Parameters Using Only In Vitro Data. Drug Metab Dispos. 2008.' },
  Clearance_Microsome_AZ:        { short: 'AstraZeneca / TDC 2021',          full: 'Huang K et al. Therapeutics Data Commons (TDC). NeurIPS 2021. [AstraZeneca microsomal clearance dataset].' },
  Clearance_Hepatocyte_AZ:       { short: 'AstraZeneca / TDC 2021',          full: 'Huang K et al. Therapeutics Data Commons (TDC). NeurIPS 2021. [AstraZeneca hepatocyte clearance dataset].' },
  Skin_Reaction:                 { short: 'Zhang et al., JCIM 2016',         full: 'Zhang L et al. In Silico Prediction of Chemical Skin Sensitization. J Chem Inf Model. 2016.' },
  CYP3A4_Substrate_CarbonMangels:{ short: 'CarbonMangels et al., JCIM 2012', full: 'CarbonMangels A et al. Selecting Relevant Descriptors for Classification by Bayesian Estimates. J Chem Inf Model. 2012.' },
  CYP1A2_Veith:                  { short: 'Veith et al., Nat Biotech 2009',  full: 'Veith H et al. Comprehensive characterization of cytochrome P450 isozyme selectivity across chemical libraries. Nat Biotechnol. 2009.' },
  CYP2C9_Veith:                  { short: 'Veith et al., Nat Biotech 2009',  full: 'Veith H et al. Comprehensive characterization of cytochrome P450 isozyme selectivity across chemical libraries. Nat Biotechnol. 2009.' },
  CYP2C19_Veith:                 { short: 'Veith et al., Nat Biotech 2009',  full: 'Veith H et al. Comprehensive characterization of cytochrome P450 isozyme selectivity across chemical libraries. Nat Biotechnol. 2009.' },
  CYP2D6_Veith:                  { short: 'Veith et al., Nat Biotech 2009',  full: 'Veith H et al. Comprehensive characterization of cytochrome P450 isozyme selectivity across chemical libraries. Nat Biotechnol. 2009.' },
  CYP3A4_Veith:                  { short: 'Veith et al., Nat Biotech 2009',  full: 'Veith H et al. Comprehensive characterization of cytochrome P450 isozyme selectivity across chemical libraries. Nat Biotechnol. 2009.' },
  QED:                           { short: 'Bickerton et al., Nat Chem 2012', full: 'Bickerton GR et al. Quantifying the chemical beauty of drugs. Nat Chem. 2012.' },
};

const PLATFORM_REF = 'Guo Z et al. ADMET-AI: A machine learning ADMET platform for evaluation of large-scale chemical libraries. Bioinformatics. 2024.';
const TDC_REF      = 'Huang K et al. Therapeutics Data Commons: Machine learning datasets and tasks for drug discovery and development. NeurIPS 2021.';

// ── category colour ───────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  'Absorption/Distribution': '#0ea5e9',
  'Metabolism/Excretion':    '#8b5cf6',
  'Toxicity':                '#ef4444',
  'General':                 '#64748b',
};

function RefTag({ prop }: { prop: string }) {
  const ref = REFS[prop];
  if (!ref) return null;
  return (
    <span
      title={ref.full}
      style={{
        fontSize: '9px', marginLeft: '5px', color: '#6366f1', cursor: 'help',
        backgroundColor: '#eef2ff', padding: '1px 4px', borderRadius: '3px',
        fontStyle: 'italic', fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      [{ref.short}]
    </span>
  );
}

function DeepADMET(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [results, setResults] = useState<DeepResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState<boolean | string>(false);
  const [showAllRefs, setShowAllRefs] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setIsError(false);
      try {
        const b64 = btoa(props.smiles);
        const res = await fetch(`/deep/${b64}`);
        if (res.status === 503) throw new Error('Engine inicializando ou indisponível');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setResults(data);
        if (props.onDataLoaded) {
          props.onDataLoaded(data.map((r: any) => ({ ...r, SMILES: props.smiles })));
        }
      } catch (err: any) {
        console.error(err);
        setIsError(err.message || true);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [props.smiles]);

  if (isLoading) return (
    <div style={{ padding: '20px', color: '#666', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '1px dashed #cbd5e1', margin: '15px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
        <span>Rodando motor Deep Learning (Chemprop D-MPNN)…</span>
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', marginLeft: '24px' }}>
        Pode levar até 20s na primeira execução enquanto o modelo carrega na memória.
      </div>
    </div>
  );

  if (isError) return (
    <div style={{ padding: '20px', color: '#b91c1c', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca', margin: '15px 0' }}>
      <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="bi bi-exclamation-triangle-fill"></i> Motor Deep indisponível
      </div>
      <div style={{ fontSize: '12px', marginTop: '4px' }}>
        {typeof isError === 'string' ? isError : 'Erro interno durante a predição.'}
      </div>
    </div>
  );

  const categories = Array.from(new Set(results.map(r => r.Category)));

  // Collect unique refs from returned results
  const usedRefs = Array.from(new Set(
    results.map(r => r.Property).filter(p => REFS[p]).map(p => REFS[p].full)
  ));

  return (
    <div style={{ margin: '15px 0', padding: '20px', backgroundColor: '#fcfdff', borderRadius: '12px', border: '1px solid #e0e7ff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #6366f1', paddingBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-cpu"></i> Chemprop Deep Engine (D-MPNN)
        </h3>
        <span style={{ marginLeft: 'auto', fontSize: '12px', backgroundColor: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
          {results.length} propriedades
        </span>
      </div>

      {/* results grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {categories.map(cat => {
          const catColor = CAT_COLOR[cat] || '#64748b';
          const catResults = results.filter(r => r.Category === cat);
          return (
            <div key={cat} style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #f0f0f0', overflow: 'hidden' }}>
              <div style={{
                backgroundColor: catColor + '18', padding: '8px 12px',
                fontWeight: 700, fontSize: '12px', borderBottom: `2px solid ${catColor}40`,
                color: catColor, display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: catColor }} />
                {cat}
              </div>
              <div style={{ padding: '8px 10px' }}>
                {catResults.map((r, idx) => {
                  const isTox = cat === 'Toxicity';
                  const numVal = typeof r.Value === 'number' ? r.Value : null;
                  const isHighTox = isTox && numVal != null && numVal > 0.5;
                  const valueColor = isHighTox ? '#dc2626' : numVal != null && numVal < 0.3 && isTox ? '#16a34a' : '#1e293b';
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        padding: '4px 0',
                        borderBottom: idx < catResults.length - 1 ? '1px solid #f8fafc' : 'none',
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ color: '#64748b', flex: 1, marginRight: '6px' }}>
                        {r.Property.replace(/_/g, ' ')}
                        <RefTag prop={r.Property} />
                      </span>
                      <span style={{ fontWeight: 700, color: valueColor, whiteSpace: 'nowrap' }}>
                        {typeof r.Value === 'number' ? r.Value.toFixed(4) : r.Value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* citation notice */}
      <div style={{
        marginTop: '18px', padding: '12px 14px',
        backgroundColor: '#fffbeb', border: '1px solid #fcd34d',
        borderRadius: '8px', fontSize: '11px', color: '#92400e',
      }}>
        <div style={{ fontWeight: 700, marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="bi bi-book"></i>
          Ao utilizar estas predições, cite os papers originais dos modelos
        </div>
        <div style={{ marginBottom: '4px' }}>
          <strong>Plataforma:</strong> {PLATFORM_REF}
        </div>
        <div style={{ marginBottom: '6px' }}>
          <strong>Datasets:</strong> {TDC_REF}
        </div>
        <button
          onClick={() => setShowAllRefs(!showAllRefs)}
          style={{
            background: 'none', border: '1px solid #f59e0b', borderRadius: '5px',
            color: '#92400e', fontSize: '10px', cursor: 'pointer', padding: '2px 8px', fontWeight: 600,
          }}
        >
          {showAllRefs ? 'Ocultar' : 'Ver'} referências dos endpoints ({usedRefs.length})
        </button>
        {showAllRefs && (
          <ol style={{ margin: '8px 0 0', paddingLeft: '18px', lineHeight: 1.6 }}>
            {usedRefs.map((ref, i) => <li key={i} style={{ marginBottom: '2px' }}>{ref}</li>)}
          </ol>
        )}
      </div>

    </div>
  );
}

export default DeepADMET;
