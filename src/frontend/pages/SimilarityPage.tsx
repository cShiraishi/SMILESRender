import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import { colors, font, radius, shadow } from '../styles/themes';

interface SimResult { smiles: string; tanimoto: number | null; error?: string }

const accentColor = '#d97706';

function bar(v: number) {
  const pct = Math.round(v * 100);
  const color = v >= 0.7 ? colors.success : v >= 0.4 ? accentColor : colors.textLight;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ flex: 1, height: '6px', backgroundColor: colors.bg, borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 600, color, minWidth: '44px', textAlign: 'right' }}>
        {(v * 100).toFixed(1)}%
      </span>
    </div>
  );
}

function SimContent() {
  const [ref,     setRef]     = useState('CC(=O)Oc1ccccc1C(=O)O');
  const [input,   setInput]   = useState('CC(=O)Oc1ccccc1C(=O)O\nCc1ccc(cc1)S(=O)(=O)N\nCC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C\nCN1C=NC2=C1C(=O)N(C(=O)N2C)C\nC1=CC=CC=C1');
  const [radius2, setRadius2] = useState(2);
  const [results, setResults] = useState<SimResult[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const list = [...new Set(input.split('\n').map(s => s.trim()).filter(Boolean))];
    if (!ref.trim() || !list.length) return;
    setLoading(true);
    const res = await fetch('/similarity', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: ref.trim(), smiles: list, radius: radius2 }),
    });
    setResults(await res.json());
    setLoading(false);
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Reference */}
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '24px', boxShadow: shadow.sm }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
            Reference SMILES
          </label>
          <input
            value={ref}
            onChange={e => setRef(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              fontFamily: 'monospace', fontSize: '13px',
              border: `1px solid ${accentColor}60`, borderRadius: radius.sm,
              backgroundColor: `${accentColor}08`, color: colors.text, outline: 'none',
            }}
          />
          <div style={{ marginTop: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Morgan Radius: {radius2}
            </label>
            <input type="range" min={1} max={4} value={radius2} onChange={e => setRadius2(+e.target.value)}
              style={{ width: '100%', accentColor }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: colors.textLight, marginTop: '2px' }}>
              <span>1 (broad)</span><span>2 (ECFP4)</span><span>3</span><span>4 (specific)</span>
            </div>
          </div>
        </div>

        {/* Query list */}
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '24px', boxShadow: shadow.sm }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
            Query Library — one SMILES per line
          </label>
          <textarea rows={6} value={input} onChange={e => setInput(e.target.value)} style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px',
            fontFamily: 'monospace', fontSize: '13px',
            border: `1px solid ${colors.border}`, borderRadius: radius.sm,
            backgroundColor: colors.bg, color: colors.text, resize: 'vertical',
          }} />
        </div>
      </div>

      <button onClick={run} disabled={loading} style={{
        fontFamily: font, fontSize: '13px', fontWeight: 500,
        padding: '10px 24px', borderRadius: radius.sm, border: 'none',
        backgroundColor: loading ? colors.textLight : accentColor,
        color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '24px',
      }}>
        {loading ? 'Computing…' : 'Compute Tanimoto Similarity'}
      </button>

      {results.length > 0 && (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, overflow: 'hidden', boxShadow: shadow.sm }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${colors.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>
              Results — ranked by Tanimoto (Morgan r={radius2}, ECFP{radius2 * 2})
            </span>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
              <span style={{ color: colors.success }}>● ≥70% high</span>
              <span style={{ color: accentColor }}>● 40–69% moderate</span>
              <span style={{ color: colors.textLight }}>● &lt;40% low</span>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: font }}>
            <thead>
              <tr style={{ backgroundColor: colors.bg }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', width: '40px' }}>#</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>SMILES</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', width: '260px' }}>Tanimoto Similarity</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                  <td style={{ padding: '12px 20px', color: colors.textMuted, fontSize: '12px' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: colors.text }}>{r.smiles}</td>
                  <td style={{ padding: '12px 20px' }}>
                    {r.error
                      ? <span style={{ color: colors.danger, fontSize: '12px' }}>{r.error}</span>
                      : r.tanimoto !== null ? bar(r.tanimoto) : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SimilarityPage({ onBack }: { onBack: () => void }) {
  return (
    <PageShell icon="bi-intersect" title="Similarity Search" subtitle="Morgan fingerprint · Tanimoto coefficient · ranked results" accentColor={accentColor} onBack={onBack}>
      <SimContent />
    </PageShell>
  );
}

export default SimilarityPage;
