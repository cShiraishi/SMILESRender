import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import { colors, font, radius, shadow } from '../styles/themes';

interface DescResult {
  smiles: string;
  error?: string;
  MolecularWeight?: number; ExactMolWt?: number; LogP?: number; TPSA?: number;
  HBD?: number; HBA?: number; RotatableBonds?: number; AromaticRings?: number;
  HeavyAtoms?: number; Rings?: number; FractionCSP3?: number;
  NHOH?: number; NO?: number; NumHeteroatoms?: number;
  QED?: number; LipinskiViolations?: number;
}

const COLS: { key: keyof DescResult; label: string; desc: string }[] = [
  { key: 'MolecularWeight',   label: 'MW',        desc: 'Molecular Weight (Da)' },
  { key: 'ExactMolWt',        label: 'Exact MW',  desc: 'Exact Molecular Weight' },
  { key: 'LogP',              label: 'LogP',       desc: 'Lipophilicity (Crippen)' },
  { key: 'TPSA',              label: 'TPSA',       desc: 'Topological Polar Surface Area (Å²)' },
  { key: 'HBD',               label: 'HBD',        desc: 'H-Bond Donors' },
  { key: 'HBA',               label: 'HBA',        desc: 'H-Bond Acceptors' },
  { key: 'RotatableBonds',    label: 'RotBonds',   desc: 'Rotatable Bonds' },
  { key: 'AromaticRings',     label: 'ArRings',    desc: 'Aromatic Rings' },
  { key: 'HeavyAtoms',        label: 'HeavyAtoms', desc: 'Heavy Atom Count' },
  { key: 'Rings',             label: 'Rings',      desc: 'Total Ring Count' },
  { key: 'FractionCSP3',      label: 'Fsp3',       desc: 'Fraction of sp3 Carbons' },
  { key: 'QED',               label: 'QED',        desc: 'Drug-likeness Score (0–1)' },
  { key: 'LipinskiViolations',label: 'Ro5 Viol.',  desc: "Lipinski's Rule of 5 Violations" },
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

function DescContent() {
  const [input, setInput]     = useState('CC(=O)Oc1ccccc1C(=O)O\nCc1ccc(cc1)S(=O)(=O)N\nCC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C');
  const [results, setResults] = useState<DescResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView]       = useState<'table'|'cards'>('table');

  const run = async () => {
    const list = [...new Set(input.split('\n').map(s => s.trim()).filter(Boolean))];
    if (!list.length) return;
    setLoading(true);
    const res = await fetch('/descriptors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smiles: list }),
    });
    setResults(await res.json());
    setLoading(false);
  };

  const exportCsv = () => {
    const ok = results.filter(r => !r.error);
    if (!ok.length) return;
    const header = ['SMILES', ...COLS.map(c => c.label)].join(',');
    const rows = ok.map(r => [r.smiles, ...COLS.map(c => r[c.key] ?? '')].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'descriptors.csv'; a.click();
  };

  const btn = (label: string, onClick: () => void, active = false, primary = false) => (
    <button onClick={onClick} disabled={loading && primary} style={{
      fontFamily: font, fontSize: '13px', fontWeight: 500,
      padding: '8px 16px', borderRadius: radius.sm, cursor: 'pointer',
      border: active ? `1px solid ${accentColor}` : `1px solid ${colors.border}`,
      backgroundColor: primary ? accentColor : (active ? `${accentColor}10` : colors.surface),
      color: primary ? '#fff' : (active ? accentColor : colors.textMuted),
    }}>
      {label}
    </button>
  );

  return (
    <>
      <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '24px', marginBottom: '24px', boxShadow: shadow.sm }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          SMILES Input — one per line
        </label>
        <textarea rows={5} value={input} onChange={e => setInput(e.target.value)} style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 12px',
          fontFamily: 'monospace', fontSize: '13px',
          border: `1px solid ${colors.border}`, borderRadius: radius.sm,
          backgroundColor: colors.bg, color: colors.text, resize: 'vertical',
        }} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {btn(loading ? 'Calculating…' : 'Calculate Descriptors', run, false, true)}
          {results.length > 0 && btn('Export CSV', exportCsv)}
          {results.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
              {btn('Table', () => setView('table'), view === 'table')}
              {btn('Cards', () => setView('cards'), view === 'cards')}
            </div>
          )}
        </div>
      </div>

      {results.length > 0 && view === 'table' && (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: 'hidden', boxShadow: shadow.sm }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: font }}>
              <thead>
                <tr style={{ backgroundColor: colors.navy }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', color: '#94a8c9', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: colors.navy }}>
                    SMILES
                  </th>
                  {COLS.map(c => (
                    <th key={c.key} title={c.desc} style={{ padding: '10px 12px', textAlign: 'right', color: '#94a8c9', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em', whiteSpace: 'nowrap', cursor: 'help' }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: i % 2 === 0 ? colors.surface : colors.bg }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '12px', color: colors.textMuted, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'sticky', left: 0, backgroundColor: 'inherit' }}>
                      {r.error ? <span style={{ color: colors.danger }}>{r.error}</span> : r.smiles}
                    </td>
                    {COLS.map(c => {
                      const v = r[c.key];
                      let color = colors.text;
                      if (c.key === 'LipinskiViolations' && typeof v === 'number') color = lipColor(v);
                      if (c.key === 'QED' && typeof v === 'number') color = qedColor(v);
                      return (
                        <td key={c.key} style={{ padding: '10px 12px', textAlign: 'right', color, fontWeight: c.key === 'QED' || c.key === 'LipinskiViolations' ? 600 : 400 }}>
                          {v ?? <span style={{ color: colors.textLight }}>—</span>}
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

      {results.length > 0 && view === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {results.map((r, i) => (
            <div key={i} style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '20px', boxShadow: shadow.sm, fontFamily: font }}>
              <code style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '14px', wordBreak: 'break-all' }}>{r.smiles}</code>
              {r.error ? <span style={{ color: colors.danger, fontSize: '13px' }}>{r.error}</span> : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {COLS.map(c => {
                    const v = r[c.key];
                    let color = colors.text;
                    if (c.key === 'LipinskiViolations' && typeof v === 'number') color = lipColor(v);
                    if (c.key === 'QED' && typeof v === 'number') color = qedColor(v);
                    return (
                      <div key={c.key}>
                        <div style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color }}>{v ?? '—'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DescriptorsPage({ onBack }: { onBack: () => void }) {
  return (
    <PageShell icon="bi-grid-3x3" title="Molecular Descriptor Calculator" subtitle="16 physicochemical descriptors · Lipinski Ro5 · QED drug-likeness" accentColor={accentColor} onBack={onBack}>
      <DescContent />
    </PageShell>
  );
}

export default DescriptorsPage;
