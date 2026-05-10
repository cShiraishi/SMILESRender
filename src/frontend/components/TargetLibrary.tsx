import React, { useState, useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// ── curated target database ────────────────────────────────────────────────────

export interface Target {
  name: string;
  gene: string;
  pdbId: string;
  ligandId: string;       // reference inhibitor residue name in PDB
  chainId?: string;
  inhibitor: string;      // drug/inhibitor display name
  mechanism: string;      // brief pharmacology note
  resolution: string;     // crystal structure resolution
  organism: string;
}

export interface Disease {
  id: string;
  label: string;
  i18nKey: string;
  icon: string;
  color: string;
  targets: Target[];
}

export const DISEASE_LIBRARY: Disease[] = [
  {
    id: 'diabetes',
    label: 'Diabetes',
    i18nKey: 'disease.diabetes',
    icon: 'bi-droplet-fill',
    color: '#0284c7',
    targets: [
      { name: 'Dipeptidyl Peptidase 4', gene: 'DPP4', pdbId: '3BJM', ligandId: 'BJM', chainId: 'A', inhibitor: 'Sitagliptin', mechanism: 'Incretin-enhancer; prolongs GLP-1 action', resolution: '2.30 Å', organism: 'Homo sapiens' },
      { name: 'PPAR-γ (Peroxisome Proliferator-Activated Receptor γ)', gene: 'PPARG', pdbId: '2PRG', ligandId: 'BRL', chainId: 'A', inhibitor: 'Rosiglitazone', mechanism: 'Insulin sensitizer; promotes GLUT4 expression', resolution: '2.20 Å', organism: 'Homo sapiens' },
      { name: 'Protein Tyrosine Phosphatase 1B', gene: 'PTPN1', pdbId: '2QBS', ligandId: '024', chainId: 'A', inhibitor: 'Trodusquemine', mechanism: 'Insulin/leptin signalling amplifier', resolution: '1.90 Å', organism: 'Homo sapiens' },
      { name: 'Glucokinase', gene: 'GCK', pdbId: '3VEV', ligandId: '0H4', chainId: 'A', inhibitor: 'GKA (Activator)', mechanism: 'Glucose sensor; allosteric activation', resolution: '2.40 Å', organism: 'Homo sapiens' },
      { name: 'Alpha-Glucosidase (MGAM)', gene: 'MGAM', pdbId: '5NN8', ligandId: 'ACR', chainId: 'A', inhibitor: 'Acarbose', mechanism: 'Delays carbohydrate digestion; lowers postprandial glucose', resolution: '2.00 Å', organism: 'Homo sapiens' },
      { name: 'Aldose Reductase', gene: 'AKR1B1', pdbId: '2IKH', ligandId: 'LIT', chainId: 'A', inhibitor: 'Tolrestat', mechanism: 'Prevents diabetic complications via polyol pathway', resolution: '1.87 Å', organism: 'Homo sapiens' },
      { name: 'SGLT2 (Sodium-Glucose Cotransporter 2)', gene: 'SLC5A2', pdbId: '7VSI', ligandId: '7R3', chainId: 'A', inhibitor: 'Dapagliflozin', mechanism: 'Renal glucose reabsorption inhibitor', resolution: '2.95 Å', organism: 'Homo sapiens' },
      { name: 'GLP-1 Receptor', gene: 'GLP1R', pdbId: '7P00', ligandId: 'PAR', chainId: 'R', inhibitor: 'Small-molecule agonist', mechanism: 'Insulin secretagogue; appetite suppression', resolution: '3.20 Å', organism: 'Homo sapiens' },
    ],
  },
  {
    id: 'inflammation',
    label: 'Inflammation',
    i18nKey: 'disease.inflammation',
    icon: 'bi-fire',
    color: '#dc2626',
    targets: [
      { name: 'Cyclooxygenase-2', gene: 'PTGS2', pdbId: '5IKT', ligandId: 'TLF', chainId: 'A', inhibitor: 'Celecoxib analogue', mechanism: 'Selective COX-2 inhibitor; anti-inflammatory', resolution: '2.40 Å', organism: 'Ovis aries' },
      { name: 'Cyclooxygenase-1', gene: 'PTGS1', pdbId: '1EQG', ligandId: 'IBP', chainId: 'A', inhibitor: 'Ibuprofen', mechanism: 'Non-selective COX inhibitor; anti-inflammatory', resolution: '3.11 Å', organism: 'Ovis aries' },
      { name: '5-Lipoxygenase', gene: 'ALOX5', pdbId: '3V99', ligandId: 'MK8', chainId: 'A', inhibitor: 'Zileuton analogue', mechanism: 'Leukotriene synthesis inhibitor; anti-asthmatic', resolution: '2.20 Å', organism: 'Homo sapiens' },
      { name: 'TNF-α Converting Enzyme (TACE)', gene: 'ADAM17', pdbId: '2AZ5', ligandId: '307', chainId: 'A', inhibitor: 'Marimastat analogue', mechanism: 'Inhibits TNF-α shedding; anti-inflammatory', resolution: '1.95 Å', organism: 'Homo sapiens' },
      { name: 'JAK1 Kinase', gene: 'JAK1', pdbId: '3EYG', ligandId: 'MI1', chainId: 'A', inhibitor: 'Ruxolitinib', mechanism: 'JAK-STAT pathway; cytokine signalling', resolution: '2.20 Å', organism: 'Homo sapiens' },
      { name: 'p38 MAPK', gene: 'MAPK14', pdbId: '1A9U', ligandId: 'SB2', chainId: 'A', inhibitor: 'SB203580', mechanism: 'Stress kinase; pro-inflammatory cytokine regulation', resolution: '2.10 Å', organism: 'Homo sapiens' },
    ],
  },
  {
    id: 'cardiovascular',
    label: 'Cardiovascular',
    i18nKey: 'disease.cardiovascular',
    icon: 'bi-heart-pulse-fill',
    color: '#e11d48',
    targets: [
      { name: 'Angiotensin-Converting Enzyme', gene: 'ACE', pdbId: '1O86', ligandId: 'LPR', chainId: 'A', inhibitor: 'Lisinopril', mechanism: 'RAAS inhibitor; antihypertensive', resolution: '2.00 Å', organism: 'Homo sapiens' },
      { name: 'HMG-CoA Reductase', gene: 'HMGCR', pdbId: '1HWK', ligandId: '117', chainId: 'A', inhibitor: 'Atorvastatin', mechanism: 'Rate-limiting step in cholesterol biosynthesis', resolution: '2.22 Å', organism: 'Homo sapiens' },
      { name: 'Factor Xa', gene: 'F10', pdbId: '2W26', ligandId: 'RIV', chainId: 'A', inhibitor: 'Rivaroxaban', mechanism: 'Direct oral anticoagulant', resolution: '2.80 Å', organism: 'Homo sapiens' },
      { name: 'hERG Potassium Channel', gene: 'KCNH2', pdbId: '7CN1', ligandId: 'E9C', chainId: 'A', inhibitor: 'E-4031 analogue', mechanism: 'Cardiac QT prolongation risk; safety target', resolution: '3.30 Å', organism: 'Homo sapiens' },
      { name: 'Thrombin', gene: 'F2', pdbId: '1DWD', ligandId: 'MID', chainId: 'H', inhibitor: 'Melagatran', mechanism: 'Serine protease; coagulation cascade', resolution: '2.15 Å', organism: 'Homo sapiens' },
    ],
  },
  {
    id: 'alzheimer',
    label: "Alzheimer's",
    i18nKey: 'disease.alzheimer',
    icon: 'bi-brain',
    color: '#7c3aed',
    targets: [
      { name: 'Acetylcholinesterase', gene: 'ACHE', pdbId: '1EVE', ligandId: 'E20', chainId: 'A', inhibitor: 'Donepezil', mechanism: 'Prolongs acetylcholine action in synaptic cleft', resolution: '2.50 Å', organism: 'Torpedo californica' },
      { name: 'BACE-1 (β-Secretase)', gene: 'BACE1', pdbId: '2OHM', ligandId: '8AP', chainId: 'A', inhibitor: 'Verubecestat', mechanism: 'Amyloid precursor protein cleavage; Aβ production', resolution: '2.20 Å', organism: 'Homo sapiens' },
      { name: 'GSK-3β (Glycogen Synthase Kinase 3β)', gene: 'GSK3B', pdbId: '3F88', ligandId: '007', chainId: 'A', inhibitor: 'SB216763', mechanism: 'Tau hyperphosphorylation; NFT formation', resolution: '2.20 Å', organism: 'Homo sapiens' },
      { name: 'Monoamine Oxidase B', gene: 'MAOB', pdbId: '2V61', ligandId: 'C18', chainId: 'A', inhibitor: 'Rasagiline', mechanism: 'Neuroprotective; dopamine catabolism', resolution: '1.70 Å', organism: 'Homo sapiens' },
    ],
  },
  {
    id: 'cancer',
    label: 'Cancer',
    i18nKey: 'disease.cancer',
    icon: 'bi-radioactive',
    color: '#b45309',
    targets: [
      { name: 'EGFR (Epidermal Growth Factor Receptor)', gene: 'EGFR', pdbId: '4HJO', ligandId: 'ERL', chainId: 'A', inhibitor: 'Erlotinib', mechanism: 'Tyrosine kinase inhibitor; anti-proliferative', resolution: '2.40 Å', organism: 'Homo sapiens' },
      { name: 'BCR-ABL Tyrosine Kinase', gene: 'ABL1', pdbId: '2HYY', ligandId: 'STI', chainId: 'A', inhibitor: 'Imatinib', mechanism: 'CML treatment; first targeted cancer therapy', resolution: '2.10 Å', organism: 'Homo sapiens' },
      { name: 'VEGFR-2', gene: 'KDR', pdbId: '4ASD', ligandId: 'BAX', chainId: 'A', inhibitor: 'Sorafenib', mechanism: 'Angiogenesis inhibitor; anti-tumor', resolution: '2.20 Å', organism: 'Homo sapiens' },
      { name: 'CDK2 (Cyclin-Dependent Kinase 2)', gene: 'CDK2', pdbId: '1H00', ligandId: 'FAP', chainId: 'A', inhibitor: 'Olomoucine II', mechanism: 'Cell cycle G1/S checkpoint; proliferation', resolution: '1.60 Å', organism: 'Homo sapiens' },
      { name: 'HDAC2 (Histone Deacetylase 2)', gene: 'HDAC2', pdbId: '4LXZ', ligandId: 'SHH', chainId: 'A', inhibitor: 'Vorinostat', mechanism: 'Epigenetic regulation; gene expression', resolution: '1.87 Å', organism: 'Homo sapiens' },
    ],
  },
  {
    id: 'antibacterial',
    label: 'Antibacterial',
    i18nKey: 'disease.antibacterial',
    icon: 'bi-bug-fill',
    color: '#059669',
    targets: [
      { name: 'DNA Gyrase B', gene: 'gyrB', pdbId: '1KZN', ligandId: 'CBN', chainId: 'A', inhibitor: 'Novobiocin', mechanism: 'Topoisomerase II inhibitor; DNA supercoiling', resolution: '2.50 Å', organism: 'E. coli' },
      { name: 'Dihydrofolate Reductase', gene: 'folA', pdbId: '1DRE', ligandId: 'TMP', chainId: 'A', inhibitor: 'Trimethoprim', mechanism: 'Folate synthesis inhibitor; bacteriostatic', resolution: '1.85 Å', organism: 'E. coli' },
      { name: 'Penicillin-Binding Protein 2a', gene: 'mecA', pdbId: '1MWT', ligandId: 'PEN', chainId: 'A', inhibitor: 'Methicillin', mechanism: 'MRSA resistance target; cell wall synthesis', resolution: '2.37 Å', organism: 'S. aureus' },
      { name: 'InhA (Enoyl-ACP Reductase)', gene: 'inhA', pdbId: '2NSD', ligandId: 'INH', chainId: 'A', inhibitor: 'Isoniazid', mechanism: 'Mycobacterium tuberculosis fatty acid synthesis', resolution: '2.00 Å', organism: 'M. tuberculosis' },
    ],
  },
  {
    id: 'antiviral',
    label: 'Antiviral',
    i18nKey: 'disease.antiviral',
    icon: 'bi-virus',
    color: '#0891b2',
    targets: [
      { name: 'SARS-CoV-2 Main Protease (Mpro)', gene: 'ORF1ab', pdbId: '7RFS', ligandId: 'NMV', chainId: 'A', inhibitor: 'Nirmatrelvir (Paxlovid)', mechanism: 'COVID-19 replication inhibitor', resolution: '1.90 Å', organism: 'SARS-CoV-2' },
      { name: 'HIV-1 Reverse Transcriptase', gene: 'pol', pdbId: '1KLM', ligandId: 'NVP', chainId: 'A', inhibitor: 'Nevirapine', mechanism: 'NNRTI; HIV replication inhibitor', resolution: '2.90 Å', organism: 'HIV-1' },
      { name: 'Influenza Neuraminidase', gene: 'NA', pdbId: '2QWK', ligandId: 'OTV', chainId: 'A', inhibitor: 'Oseltamivir', mechanism: 'Prevents viral release from host cells', resolution: '2.10 Å', organism: 'Influenza A' },
      { name: 'HCV NS5B Polymerase', gene: 'NS5B', pdbId: '2GIR', ligandId: 'GS0', chainId: 'A', inhibitor: 'Sofosbuvir', mechanism: 'Nucleotide analogue; RNA-dependent RNA polymerase', resolution: '2.40 Å', organism: 'HCV' },
    ],
  },
];

// ── component ──────────────────────────────────────────────────────────────────

interface TargetLibraryProps {
  onLoad: (pdbId: string, ligandId: string, chainId?: string) => void;
  onClose: () => void;
}

export default function TargetLibrary({ onLoad, onClose }: TargetLibraryProps) {
  const { t } = useLanguage();
  const [selectedDisease, setSelectedDisease] = useState<string | null>(null);
  const [search, setSearch]                   = useState('');

  const disease = DISEASE_LIBRARY.find(d => d.id === selectedDisease) ?? null;

  const filteredTargets = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return disease?.targets ?? [];
    const base = selectedDisease ? disease?.targets ?? [] : DISEASE_LIBRARY.flatMap(d => d.targets);
    return base.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.gene.toLowerCase().includes(q) ||
      t.pdbId.toLowerCase().includes(q) ||
      t.inhibitor.toLowerCase().includes(q)
    );
  }, [search, selectedDisease, disease]);

  const handleLoad = (t: Target) => {
    onLoad(t.pdbId, t.ligandId, t.chainId);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px',
        width: '100%', maxWidth: '900px', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
        overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{
          background: 'linear-gradient(135deg, #1a3a5c 0%, #0f4c8a 100%)',
          padding: '18px 22px', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <i className="bi bi-database-fill-gear" style={{ fontSize: '20px', color: '#93c5fd' }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '16px' }}>{t('lib.title')}</div>
            <div style={{ color: '#93c5fd', fontSize: '11px' }}>
              {DISEASE_LIBRARY.reduce((n, d) => n + d.targets.length, 0)} {t('lib.subtitle.a')} · {t('lib.subtitle.b')}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#93c5fd', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        {/* search toolbar */}
        <div style={{ padding: '10px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <i className="bi bi-search" style={{ color: '#94a3b8' }} />
          <input
            autoFocus
            placeholder={t('lib.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', color: '#0f172a' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <i className="bi bi-x" />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* disease sidebar */}
          <div style={{
            width: '180px', flexShrink: 0,
            borderRight: '1px solid #f1f5f9',
            backgroundColor: '#fafbfc',
            overflowY: 'auto', padding: '10px 8px',
          }}>
            <button
              onClick={() => { setSelectedDisease(null); setSearch(''); }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
                backgroundColor: !selectedDisease ? '#eff6ff' : 'transparent',
                color: !selectedDisease ? '#1a3a5c' : '#64748b',
                fontWeight: !selectedDisease ? 700 : 500,
                fontSize: '12px', marginBottom: '4px',
                display: 'flex', alignItems: 'center', gap: '7px',
              }}
            >
              <i className="bi bi-grid-3x3-gap-fill" style={{ fontSize: '13px' }} />
              {t('lib.allDiseases')}
            </button>

            {DISEASE_LIBRARY.map(d => (
              <button
                key={d.id}
                onClick={() => { setSelectedDisease(d.id); setSearch(''); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px',
                  borderRadius: '8px', border: 'none', cursor: 'pointer',
                  backgroundColor: selectedDisease === d.id ? '#eff6ff' : 'transparent',
                  color: selectedDisease === d.id ? '#1a3a5c' : '#475569',
                  fontWeight: selectedDisease === d.id ? 700 : 500,
                  fontSize: '12px', marginBottom: '2px',
                  display: 'flex', alignItems: 'center', gap: '7px',
                }}
              >
                <i className={`bi ${d.icon}`} style={{ fontSize: '13px', color: d.color }} />
                {t(d.i18nKey as any)}
                <span style={{
                  marginLeft: 'auto', fontSize: '10px',
                  backgroundColor: selectedDisease === d.id ? '#bfdbfe' : '#f1f5f9',
                  color: selectedDisease === d.id ? '#1e40af' : '#94a3b8',
                  borderRadius: '9px', padding: '1px 6px', fontWeight: 700,
                }}>
                  {d.targets.length}
                </span>
              </button>
            ))}
          </div>

          {/* target list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            {!selectedDisease && !search && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '10px', marginBottom: '16px',
              }}>
                {DISEASE_LIBRARY.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDisease(d.id)}
                    style={{
                      padding: '16px', borderRadius: '12px',
                      border: `1px solid ${d.color}33`,
                      backgroundColor: `${d.color}08`,
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                  >
                    <i className={`bi ${d.icon}`} style={{ fontSize: '22px', color: d.color, display: 'block', marginBottom: '8px' }} />
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{t(d.i18nKey as any)}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{d.targets.length} {t('lib.subtitle.a')}</div>
                  </button>
                ))}
              </div>
            )}

            {(selectedDisease || search) && (
              <>
                {filteredTargets.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                    <i className="bi bi-search" style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }} />
                    {t('lib.noResults')} "{search}"
                  </div>
                )}
                {filteredTargets.map(t => (
                  <TargetCard
                    key={t.pdbId + t.ligandId}
                    target={t}
                    disease={DISEASE_LIBRARY.find(d => d.targets.some(x => x.pdbId === t.pdbId && x.ligandId === t.ligandId))}
                    onLoad={() => handleLoad(t)}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* footer */}
        <div style={{
          borderTop: '1px solid #e2e8f0',
          padding: '10px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          backgroundColor: '#fafbfc',
          minHeight: '52px',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', backgroundColor: 'transparent',
              color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px',
              fontWeight: 600, fontSize: '12px', cursor: 'pointer',
            }}
          >
            {t('lib.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── target card ────────────────────────────────────────────────────────────────

function TargetCard({
  target: t, disease, onLoad,
}: {
  target: Target;
  disease?: Disease;
  onLoad: () => void;
}) {
  const { t: tr } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      marginBottom: '8px', overflow: 'hidden',
      backgroundColor: '#fff',
    }}>
      {/* main row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          padding: '11px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}
      >
        {/* PDB badge */}
        <div style={{
          minWidth: '52px', padding: '4px 0', textAlign: 'center',
          backgroundColor: disease ? `${disease.color}15` : '#f1f5f9',
          border: `1px solid ${disease?.color ?? '#e2e8f0'}44`,
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: disease?.color ?? '#475569', letterSpacing: '0.04em' }}>
            {t.pdbId}
          </div>
          <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '1px' }}>{t.resolution}</div>
        </div>

        {/* info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {t.name}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>{t.gene}</span>
            <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
            Ref: <span style={{ fontWeight: 600, color: '#0284c7' }}>{t.inhibitor}</span>
            <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
            {t.organism}
          </div>
        </div>

        {/* controls */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <i
            className={`bi bi-chevron-${expanded ? 'up' : 'down'}`}
            style={{ fontSize: '11px', color: '#94a3b8' }}
          />
          <button
            onClick={e => { e.stopPropagation(); onLoad(); }}
            style={{
              padding: '6px 14px', backgroundColor: '#1a3a5c',
              color: '#fff', border: 'none', borderRadius: '7px',
              fontWeight: 700, fontSize: '11px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            <i className="bi bi-box-arrow-in-down" />
            {tr('lib.load')}
          </button>
        </div>
      </div>

      {/* expanded detail */}
      {expanded && (
        <div style={{
          padding: '10px 14px 14px',
          borderTop: '1px solid #f1f5f9',
          backgroundColor: '#fafbfc',
          fontSize: '11px', color: '#475569', lineHeight: 1.6,
        }}>
          <p style={{ margin: '0 0 8px' }}><b>{tr('lib.mechanism')}:</b> {t.mechanism}</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span><b>{tr('lib.refLigand')}:</b> <code style={{ backgroundColor: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>{t.ligandId}</code> / Chain {t.chainId || 'A'}</span>
            <span><b>{tr('lib.organism')}:</b> {t.organism}</span>
            <span><b>{tr('lib.resolution')}:</b> {t.resolution}</span>
            <a
              href={`https://www.rcsb.org/structure/${t.pdbId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}
            >
              {tr('lib.viewRcsb')} <i className="bi bi-box-arrow-up-right" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
