import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import { colors, font, radius, shadow } from '../styles/themes';

const accentColor = '#be185d';

const EXAMPLES = [
  { label: 'Aspirin synthesis',   smarts: 'OC(=O)c1ccccc1O.CC(=O)O>>CC(=O)Oc1ccccc1C(=O)O' },
  { label: 'Esterification',      smarts: 'OCC.CC(=O)O>>CC(=O)OCC' },
  { label: 'Diels-Alder',         smarts: 'C=CC=C.C=C>>C1CCCCC1' },
  { label: 'Amide bond',          smarts: 'CC(=O)O.CN>>CC(=O)NC' },
];

function ReactionContent({ initialSmiles }: { initialSmiles?: string }) {
  const [smarts, setSmarts]   = useState(initialSmiles || EXAMPLES[0].smarts);
  const [imgUrl, setImgUrl]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  React.useEffect(() => {
    if (initialSmiles) {
      setSmarts(initialSmiles);
    }
  }, [initialSmiles]);

  const run = async () => {
    if (!smarts.trim()) return;
    setLoading(true); setError(''); setImgUrl(null);
    try {
      const res = await fetch('/render/reaction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smarts: smarts.trim() }),
      });
      if (!res.ok) { setError(await res.text()); return; }
      setImgUrl(URL.createObjectURL(await res.blob()));
    } catch { setError('Request failed'); }
    finally { setLoading(false); }
  };

  const download = () => {
    if (!imgUrl) return;
    const a = document.createElement('a'); a.href = imgUrl; a.download = 'reaction.png'; a.click();
  };

  return (
    <>
      <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '24px', marginBottom: '24px', boxShadow: shadow.sm }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          Reaction SMILES (SMARTS format: reactants>>products)
        </label>
        <input
          value={smarts}
          onChange={e => setSmarts(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px',
            fontFamily: 'monospace', fontSize: '13px',
            border: `1px solid ${colors.border}`, borderRadius: radius.sm,
            backgroundColor: colors.bg, color: colors.text,
          }}
        />

        <div style={{ marginTop: '14px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Examples: </span>
          {EXAMPLES.map(ex => (
            <button key={ex.label} onClick={() => setSmarts(ex.smarts)} style={{
              fontFamily: font, fontSize: '12px', padding: '4px 10px', margin: '4px',
              borderRadius: '20px', border: `1px solid ${colors.border}`,
              backgroundColor: smarts === ex.smarts ? `${accentColor}12` : colors.surface,
              color: smarts === ex.smarts ? accentColor : colors.textMuted,
              cursor: 'pointer',
            }}>
              {ex.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button onClick={run} disabled={loading} style={{
            fontFamily: font, fontSize: '13px', fontWeight: 500,
            padding: '8px 20px', borderRadius: radius.sm, border: 'none',
            backgroundColor: loading ? colors.textLight : accentColor,
            color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? 'Rendering…' : 'Render Reaction'}
          </button>
          {imgUrl && (
            <button onClick={download} style={{
              fontFamily: font, fontSize: '13px', fontWeight: 500,
              padding: '8px 16px', borderRadius: radius.sm,
              border: `1px solid ${colors.border}`, backgroundColor: colors.surface,
              color: colors.textMuted, cursor: 'pointer',
            }}>
              <i className="bi bi-download" style={{ marginRight: '6px' }}></i>PNG
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: colors.dangerBg, border: `1px solid ${colors.danger}40`, borderRadius: radius.md, padding: '12px 16px', color: colors.danger, fontSize: '13px', marginBottom: '16px' }}>
          <i className="bi bi-exclamation-triangle" style={{ marginRight: '8px' }}></i>{error}
        </div>
      )}

      {imgUrl && (
        <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '32px', textAlign: 'center', boxShadow: shadow.sm }}>
          <img src={imgUrl} alt="Reaction" style={{ maxWidth: '100%', borderRadius: radius.sm }} />
          <div style={{ marginTop: '16px', padding: '10px 16px', backgroundColor: colors.bg, borderRadius: radius.sm, display: 'inline-block' }}>
            <code style={{ fontSize: '12px', color: colors.textMuted }}>{smarts}</code>
          </div>
        </div>
      )}

      <div style={{ marginTop: '24px', backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '20px', boxShadow: shadow.sm }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Format Guide</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', color: colors.textMuted }}>
          <div><code style={{ fontFamily: 'monospace', color: colors.blue }}>R1.R2{'>>'}P</code> — multiple reactants separated by <code>.</code></div>
          <div><code style={{ fontFamily: 'monospace', color: colors.blue }}>R{'>>'}P1.P2</code> — multiple products separated by <code>.</code></div>
          <div><code style={{ fontFamily: 'monospace', color: colors.blue }}>R{'>>'}P</code> — minimal single step reaction</div>
          <div>Use standard SMILES notation for each molecule</div>
        </div>
      </div>
    </>
  );
}

function ReactionPage({ onBack, initialSmiles }: { onBack: () => void; initialSmiles?: string }) {
  return (
    <PageShell icon="bi-arrow-left-right" title="Reaction Visualizer" subtitle="Render chemical reactions from SMILES · supports multi-step · PNG export" accentColor={accentColor} onBack={onBack}>
      <ReactionContent initialSmiles={initialSmiles} />
    </PageShell>
  );
}

export default ReactionPage;
