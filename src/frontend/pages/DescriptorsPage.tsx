import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import { colors, font, radius, shadow } from '../styles/themes';

interface DescResult {
  smiles: string;
  error?: string;
  // Constitutional
  MolecularWeight?: number; ExactMolWt?: number; HeavyAtoms?: number;
  NumHeteroatoms?: number; NHOH?: number; NO?: number;
  FractionCSP3?: number; MolMR?: number; LabuteASA?: number;
  // Drug-likeness
  LogP?: number; TPSA?: number; HBD?: number; HBA?: number;
  RotatableBonds?: number; QED?: number;
  LipinskiViolations?: number; VerberViolations?: number; EganViolations?: number;
  // Topological
  BalabanJ?: number; BertzCT?: number; HallKierAlpha?: number;
  Kappa1?: number; Kappa2?: number; Kappa3?: number;
  Chi0n?: number; Chi1n?: number; Chi2n?: number; Chi3n?: number; Chi4n?: number;
  Ipc?: number;
  // Electronic / VSA
  MaxEStateIndex?: number; MinEStateIndex?: number;
  MaxAbsEStateIndex?: number; MinAbsEStateIndex?: number;
  PEOE_VSA1?: number; PEOE_VSA2?: number;
  SMR_VSA1?: number; SMR_VSA2?: number;
  SlogP_VSA1?: number; SlogP_VSA2?: number;
  // Ring & Fragment
  Rings?: number; AromaticRings?: number; AliphaticRings?: number;
  AromaticCarbocycles?: number; AromaticHeterocycles?: number;
  SaturatedCarbocycles?: number; SaturatedHeterocycles?: number;
  AliphaticCarbocycles?: number; AliphaticHeterocycles?: number;
  // Fingerprints (bit strings + popcount)
  fp_rdkit_bits?: string;    fp_rdkit_onbits?: number;
  fp_morgan_bits?: string;   fp_morgan_onbits?: number;
  fp_maccs_bits?: string;    fp_maccs_onbits?: number;
  fp_atompair_bits?: string; fp_atompair_onbits?: number;
}

const FP_OPTIONS = [
  { id: 'rdkit',    label: 'RDKit FP',        bits: 1024, desc: 'Path-based fingerprint (RDKit default)' },
  { id: 'morgan',   label: 'ECFP4 (Morgan r=2)', bits: 2048, desc: 'Circular fingerprint — most widely used in QSAR/ML' },
  { id: 'maccs',    label: 'MACCS Keys',       bits: 166,  desc: '166 interpretable structural keys (MDL/MACCS)' },
  { id: 'atompair', label: 'Atom Pairs',       bits: 2048, desc: 'Atom-pair fingerprint (hashed, captures bond environments)' },
] as const;
type FpId = typeof FP_OPTIONS[number]['id'];

type Category = 'all' | 'constitutional' | 'druglikeness' | 'topological' | 'electronic' | 'rings';

interface ColDef { key: keyof DescResult; label: string; desc: string; category: Category }

const ALL_COLS: ColDef[] = [
  // Constitutional
  { key: 'MolecularWeight',       label: 'MW',           desc: 'Molecular Weight (Da)',                   category: 'constitutional' },
  { key: 'ExactMolWt',            label: 'Exact MW',     desc: 'Exact Monoisotopic Weight (Da)',          category: 'constitutional' },
  { key: 'HeavyAtoms',            label: 'HeavyAtoms',   desc: 'Heavy Atom Count',                        category: 'constitutional' },
  { key: 'NumHeteroatoms',        label: 'Heteroatoms',  desc: 'Number of Heteroatoms',                   category: 'constitutional' },
  { key: 'NHOH',                  label: 'NHOH',         desc: 'N–H and O–H Count',                      category: 'constitutional' },
  { key: 'NO',                    label: 'NO',           desc: 'N and O Count',                           category: 'constitutional' },
  { key: 'FractionCSP3',          label: 'Fsp3',         desc: 'Fraction of sp³ Carbons',                category: 'constitutional' },
  { key: 'MolMR',                 label: 'MolMR',        desc: 'Molar Refractivity (Crippen)',            category: 'constitutional' },
  { key: 'LabuteASA',             label: 'LabuteASA',    desc: 'Approximate Surface Area (Ų)',          category: 'constitutional' },
  // Drug-likeness
  { key: 'LogP',                  label: 'LogP',         desc: 'Lipophilicity (Crippen)',                 category: 'druglikeness' },
  { key: 'TPSA',                  label: 'TPSA',         desc: 'Topological Polar Surface Area (Ų)',    category: 'druglikeness' },
  { key: 'HBD',                   label: 'HBD',          desc: 'H-Bond Donors',                          category: 'druglikeness' },
  { key: 'HBA',                   label: 'HBA',          desc: 'H-Bond Acceptors',                       category: 'druglikeness' },
  { key: 'RotatableBonds',        label: 'RotBonds',     desc: 'Rotatable Bonds',                        category: 'druglikeness' },
  { key: 'QED',                   label: 'QED',          desc: 'Quantitative Estimate of Drug-likeness (0–1)', category: 'druglikeness' },
  { key: 'LipinskiViolations',    label: 'Ro5 Viol.',    desc: "Lipinski Rule-of-Five Violations (MW≤500, LogP≤5, HBD≤5, HBA≤10)", category: 'druglikeness' },
  { key: 'VerberViolations',      label: 'Veber Viol.',  desc: 'Veber Filter Violations (RotBonds≤10, TPSA≤140)', category: 'druglikeness' },
  { key: 'EganViolations',        label: 'Egan Viol.',   desc: 'Egan Filter Violations (LogP≤5.88, TPSA≤131.6)', category: 'druglikeness' },
  // Topological
  { key: 'BalabanJ',              label: 'BalabanJ',     desc: 'Balaban J Connectivity Index',           category: 'topological' },
  { key: 'BertzCT',               label: 'BertzCT',      desc: 'Bertz Topological Complexity',           category: 'topological' },
  { key: 'HallKierAlpha',         label: 'HKAlpha',      desc: 'Hall-Kier Alpha Value',                  category: 'topological' },
  { key: 'Kappa1',                label: 'κ1',           desc: 'First-order Kier Shape Index',           category: 'topological' },
  { key: 'Kappa2',                label: 'κ2',           desc: 'Second-order Kier Shape Index',          category: 'topological' },
  { key: 'Kappa3',                label: 'κ3',           desc: 'Third-order Kier Shape Index',           category: 'topological' },
  { key: 'Chi0n',                 label: 'χ0n',          desc: 'Zero-order Connectivity Index (atoms)',  category: 'topological' },
  { key: 'Chi1n',                 label: 'χ1n',          desc: 'First-order Connectivity Index',        category: 'topological' },
  { key: 'Chi2n',                 label: 'χ2n',          desc: 'Second-order Connectivity Index',       category: 'topological' },
  { key: 'Chi3n',                 label: 'χ3n',          desc: 'Third-order Connectivity Index',        category: 'topological' },
  { key: 'Chi4n',                 label: 'χ4n',          desc: 'Fourth-order Connectivity Index',       category: 'topological' },
  { key: 'Ipc',                   label: 'Ipc',          desc: 'Atom-pair Information Content',         category: 'topological' },
  // Electronic / VSA
  { key: 'MaxEStateIndex',        label: 'MaxES',        desc: 'Maximum E-State Index',                  category: 'electronic' },
  { key: 'MinEStateIndex',        label: 'MinES',        desc: 'Minimum E-State Index',                  category: 'electronic' },
  { key: 'MaxAbsEStateIndex',     label: 'MaxAbsES',     desc: 'Maximum Absolute E-State Index',         category: 'electronic' },
  { key: 'MinAbsEStateIndex',     label: 'MinAbsES',     desc: 'Minimum Absolute E-State Index',         category: 'electronic' },
  { key: 'PEOE_VSA1',             label: 'PEOE_VSA1',    desc: 'Partial Equalization of Orbital Electronegativity VSA bin 1', category: 'electronic' },
  { key: 'PEOE_VSA2',             label: 'PEOE_VSA2',    desc: 'PEOE VSA bin 2',                        category: 'electronic' },
  { key: 'SMR_VSA1',              label: 'SMR_VSA1',     desc: 'Molar Refractivity VSA bin 1',           category: 'electronic' },
  { key: 'SMR_VSA2',              label: 'SMR_VSA2',     desc: 'Molar Refractivity VSA bin 2',           category: 'electronic' },
  { key: 'SlogP_VSA1',            label: 'SlogP_VSA1',   desc: 'SlogP VSA bin 1',                        category: 'electronic' },
  { key: 'SlogP_VSA2',            label: 'SlogP_VSA2',   desc: 'SlogP VSA bin 2',                        category: 'electronic' },
  // Rings & Fragments
  { key: 'Rings',                 label: 'Rings',        desc: 'Total Ring Count',                       category: 'rings' },
  { key: 'AromaticRings',         label: 'ArRings',      desc: 'Aromatic Ring Count',                    category: 'rings' },
  { key: 'AliphaticRings',        label: 'AlipRings',    desc: 'Aliphatic Ring Count',                   category: 'rings' },
  { key: 'AromaticCarbocycles',   label: 'ArCC',         desc: 'Aromatic Carbocycles',                   category: 'rings' },
  { key: 'AromaticHeterocycles',  label: 'ArHet',        desc: 'Aromatic Heterocycles',                  category: 'rings' },
  { key: 'SaturatedCarbocycles',  label: 'SatCC',        desc: 'Saturated Carbocycles',                  category: 'rings' },
  { key: 'SaturatedHeterocycles', label: 'SatHet',       desc: 'Saturated Heterocycles',                 category: 'rings' },
  { key: 'AliphaticCarbocycles',  label: 'AlCC',         desc: 'Aliphatic Carbocycles',                  category: 'rings' },
  { key: 'AliphaticHeterocycles', label: 'AlHet',        desc: 'Aliphatic Heterocycles',                 category: 'rings' },
];

const CATEGORIES: { id: Category; label: string; count: number }[] = [
  { id: 'all',           label: 'All',           count: ALL_COLS.length },
  { id: 'constitutional',label: 'Constitutional', count: ALL_COLS.filter(c => c.category === 'constitutional').length },
  { id: 'druglikeness',  label: 'Drug-likeness',  count: ALL_COLS.filter(c => c.category === 'druglikeness').length },
  { id: 'topological',   label: 'Topological',    count: ALL_COLS.filter(c => c.category === 'topological').length },
  { id: 'electronic',    label: 'Electronic/VSA', count: ALL_COLS.filter(c => c.category === 'electronic').length },
  { id: 'rings',         label: 'Rings & Fragments', count: ALL_COLS.filter(c => c.category === 'rings').length },
];

const accentColor = '#0891b2';

function lipColor(v: number) {
  if (v === 0) return colors.success;
  if (v === 1) return colors.warning;
  return colors.danger;
}

function qedColor(v: number) {
  if (v >= 0.6) return colors.success;
  if (v >= 0.4) return colors.warning;
  return colors.danger;
}

function cellColor(col: ColDef, v: number): string {
  if (col.key === 'LipinskiViolations' || col.key === 'VerberViolations' || col.key === 'EganViolations') return lipColor(v);
  if (col.key === 'QED') return qedColor(v);
  return colors.text;
}

function isBold(col: ColDef) {
  return col.key === 'QED' || col.key === 'LipinskiViolations' || col.key === 'VerberViolations' || col.key === 'EganViolations';
}

function DescContent({ initialSmiles }: { initialSmiles?: string }) {
  const [input, setInput]       = useState(initialSmiles || 'CC(=O)Oc1ccccc1C(=O)O\nCc1ccc(cc1)S(=O)(=O)N\nCC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C');
  const [results, setResults]   = useState<DescResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [view, setView]         = useState<'table' | 'cards'>('table');
  const [cat, setCat]           = useState<Category>('all');
  const [selectedFPs, setFPs]   = useState<Set<FpId>>(new Set());
  const [fpOpen, setFpOpen]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  React.useEffect(() => {
    if (initialSmiles) {
      setInput(initialSmiles);
    }
  }, [initialSmiles]);

  const visibleCols = cat === 'all' ? ALL_COLS : ALL_COLS.filter(c => c.category === cat);

  const toggleFP = (id: FpId) => setFPs(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const activeFPs = FP_OPTIONS.filter(f => selectedFPs.has(f.id));

  // True when the current results already contain fingerprint data
  const resultHasFPs = results.length > 0 &&
    activeFPs.some(fp => `fp_${fp.id}_bits` in results[0]);

  // True when user selected FPs but hasn't recalculated yet
  const fpStale = activeFPs.length > 0 && results.length > 0 && !resultHasFPs;

  const run = async () => {
    const list = [...new Set(input.split('\n').map(s => s.trim()).filter(Boolean))];
    if (!list.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/descriptors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles: list, fingerprints: [...selectedFPs] }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setResults(data);
      } else {
        setError(data.error ?? 'Server error');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
    const ok = results.filter(r => !r.error);
    if (!ok.length) return;
    setExporting(true);
    try {
      const res = await fetch('/descriptors/excel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ok),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'descriptors_qsar.xlsx';
      a.click();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const btnStyle = (active: boolean, primary: boolean): React.CSSProperties => ({
    fontFamily: font, fontSize: '13px', fontWeight: 500,
    padding: '8px 16px', borderRadius: radius.sm, cursor: 'pointer',
    border: active ? `1px solid ${accentColor}` : `1px solid ${colors.border}`,
    backgroundColor: primary ? accentColor : (active ? `${accentColor}18` : colors.surface),
    color: primary ? '#fff' : (active ? accentColor : colors.textMuted),
    transition: 'all 0.15s',
  });

  return (
    <>
      {/* Input */}
      <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '24px', marginBottom: '16px', boxShadow: shadow.sm }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          SMILES Input — one per line (max 20)
        </label>
        <textarea rows={5} value={input} onChange={e => setInput(e.target.value)} style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 12px',
          fontFamily: 'monospace', fontSize: '13px',
          border: `1px solid ${colors.border}`, borderRadius: radius.sm,
          backgroundColor: colors.bg, color: colors.text, resize: 'vertical',
        }} />

        {/* Fingerprint selector */}
        <div style={{ marginTop: '14px', border: `1px solid ${colors.border}`, borderRadius: radius.sm, overflow: 'hidden' }}>
          <button onClick={() => setFpOpen(o => !o)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: colors.bg, border: 'none', cursor: 'pointer',
            fontFamily: font, fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-fingerprint" style={{ fontSize: '14px', color: accentColor }} />
              Molecular Fingerprints for QSAR/ML
              {selectedFPs.size > 0 && (
                <span style={{ backgroundColor: accentColor, color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 700 }}>
                  {selectedFPs.size} selected
                </span>
              )}
            </span>
            <span style={{ fontSize: '10px', color: colors.textLight }}>{fpOpen ? '▲' : '▼'}</span>
          </button>

          {fpOpen && (
            <div style={{ padding: '14px', borderTop: `1px solid ${colors.border}`, backgroundColor: colors.surface }}>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: colors.textMuted, lineHeight: 1.5 }}>
                Fingerprints are appended to the CSV export as individual bit columns (e.g. <code style={{ backgroundColor: colors.bg, padding: '1px 4px', borderRadius: '3px' }}>ecfp4_b0 … ecfp4_b2047</code>), ready for QSAR/ML pipelines.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                {FP_OPTIONS.map(fp => {
                  const active = selectedFPs.has(fp.id);
                  return (
                    <label key={fp.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
                      border: `1px solid ${active ? accentColor : colors.border}`,
                      borderRadius: radius.sm, cursor: 'pointer',
                      backgroundColor: active ? `${accentColor}0d` : colors.bg,
                      transition: 'all 0.15s',
                    }}>
                      <input type="checkbox" checked={active} onChange={() => toggleFP(fp.id)}
                        style={{ marginTop: '2px', accentColor }} />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: active ? accentColor : colors.text }}>{fp.label}</div>
                        <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>{fp.bits} bits — {fp.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={run} disabled={loading} style={btnStyle(false, true)}>
            {loading ? 'Calculating…' : 'Calculate Descriptors'}
          </button>
          {results.length > 0 && (
            <button onClick={exportExcel} disabled={exporting} style={btnStyle(false, false)}>
              {exporting ? 'Generating…' : `Export Excel (.xlsx)${activeFPs.length > 0 && resultHasFPs ? ` + ${activeFPs.length} FP sheet(s)` : ''}`}
            </button>
          )}
          {results.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
              <button onClick={() => setView('table')} style={btnStyle(view === 'table', false)}>Table</button>
              <button onClick={() => setView('cards')} style={btnStyle(view === 'cards', false)}>Cards</button>
            </div>
          )}
        </div>
      {fpStale && (
        <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: '#fffbeb', border: `1px solid ${colors.warning}`, borderRadius: radius.sm, fontSize: '13px', fontFamily: font, color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-exclamation-triangle-fill" />
          Fingerprints selected after last calculation — click <strong>Calculate Descriptors</strong> again to include them in the export.
        </div>
      )}
      {error && (
        <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: '#fff0f0', border: '1px solid #fca5a5', borderRadius: radius.sm, color: colors.danger, fontSize: '13px', fontFamily: font }}>
          {error}
        </div>
      )}
      </div>

      {/* Category tabs */}
      {results.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              ...btnStyle(cat === c.id, false),
              fontSize: '12px', padding: '6px 12px',
            }}>
              {c.label}
              <span style={{
                marginLeft: '6px', fontSize: '10px', fontWeight: 700,
                backgroundColor: cat === c.id ? accentColor : colors.border,
                color: cat === c.id ? '#fff' : colors.textMuted,
                borderRadius: '10px', padding: '1px 6px',
              }}>{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table view */}
      {results.length > 0 && view === 'table' && (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: 'hidden', boxShadow: shadow.sm }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: font }}>
              <thead>
                <tr style={{ backgroundColor: colors.navy }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#94a8c9', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: colors.navy, zIndex: 1 }}>
                    SMILES
                  </th>
                  {visibleCols.map(c => (
                    <th key={c.key} title={c.desc} style={{ padding: '10px 10px', textAlign: 'right', color: '#94a8c9', fontWeight: 600, fontSize: '11px', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: 'help' }}>
                      {c.label}
                    </th>
                  ))}
                  {activeFPs.map(fp => (
                    <th key={fp.id} title={`${fp.label} — ${fp.bits} bits. On-bits shown; full bit vector in CSV export.`} style={{ padding: '10px 10px', textAlign: 'right', color: '#7ecfd4', fontWeight: 600, fontSize: '11px', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: 'help', borderLeft: `1px solid ${colors.navyLight}` }}>
                      {fp.label} <span style={{ opacity: 0.6 }}>on/{fp.bits}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: i % 2 === 0 ? colors.surface : colors.bg }}>
                    <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontSize: '11px', color: colors.textMuted, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: 'inherit', zIndex: 1 }}>
                      {r.error ? <span style={{ color: colors.danger }}>{r.error}</span> : r.smiles}
                    </td>
                    {visibleCols.map(c => {
                      const v = r[c.key];
                      const color = typeof v === 'number' ? cellColor(c, v) : colors.textLight;
                      return (
                        <td key={c.key} style={{ padding: '9px 10px', textAlign: 'right', color, fontWeight: isBold(c) ? 600 : 400, whiteSpace: 'nowrap' }}>
                          {v != null ? v : <span style={{ color: colors.textLight }}>—</span>}
                        </td>
                      );
                    })}
                    {activeFPs.map(fp => {
                      const onbits = r[`fp_${fp.id}_onbits` as keyof DescResult] as number | undefined;
                      return (
                        <td key={fp.id} title={onbits != null ? `${onbits} bits set of ${fp.bits}` : 'Not calculated'} style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap', borderLeft: `1px solid ${colors.borderLight}`, color: onbits != null ? accentColor : colors.textLight, fontWeight: 500 }}>
                          {onbits != null ? `${onbits}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cards view */}
      {results.length > 0 && view === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {results.map((r, i) => (
            <div key={i} style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '20px', boxShadow: shadow.sm, fontFamily: font }}>
              <code style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: '14px', wordBreak: 'break-all' }}>{r.smiles}</code>
              {r.error ? <span style={{ color: colors.danger, fontSize: '13px' }}>{r.error}</span> : (
                <>
                  {(cat === 'all' ? CATEGORIES.filter(c => c.id !== 'all') : CATEGORIES.filter(c => c.id === cat)).map(catDef => {
                    const cols = ALL_COLS.filter(c => c.category === catDef.id);
                    if (!cols.length) return null;
                    return (
                      <div key={catDef.id} style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', borderBottom: `1px solid ${colors.borderLight}`, paddingBottom: '4px' }}>
                          {catDef.label}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {cols.map(c => {
                            const v = r[c.key];
                            const color = typeof v === 'number' ? cellColor(c, v) : colors.textMuted;
                            return (
                              <div key={c.key} title={c.desc}>
                                <div style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
                                <div style={{ fontSize: '13px', fontWeight: isBold(c) ? 700 : 500, color }}>{v ?? '—'}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {activeFPs.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0891b2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', borderBottom: `1px solid ${colors.borderLight}`, paddingBottom: '4px' }}>
                        Fingerprints
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {activeFPs.map(fp => {
                          const onbits = r[`fp_${fp.id}_onbits` as keyof DescResult] as number | undefined;
                          return (
                            <div key={fp.id} title={fp.desc}>
                              <div style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fp.label}</div>
                              <div style={{ fontSize: '13px', fontWeight: 500, color: onbits != null ? accentColor : colors.textMuted }}>
                                {onbits != null ? `${onbits}/${fp.bits} bits` : '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DescriptorsPage({ onBack, initialSmiles }: { onBack: () => void; initialSmiles?: string }) {
  return (
    <PageShell icon="bi-grid-3x3" title="Molecular Descriptor Calculator" subtitle="50 RDKit descriptors · QSAR-ready · Lipinski · Veber · Egan · Topological · Electronic" accentColor={accentColor} onBack={onBack}>
      <DescContent initialSmiles={initialSmiles} />
    </PageShell>
  );
}

export default DescriptorsPage;
