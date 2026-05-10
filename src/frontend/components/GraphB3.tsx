import React, { useEffect, useState } from 'react';

interface BBBResult {
  status: 'BBB+' | 'BBB-';
  probability: number;
  permeable: boolean;
}

function ProbBar({ value, permeable }: { value: number; permeable: boolean }) {
  const color = permeable ? '#10b981' : '#ef4444';
  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
        <span>BBB- (0%)</span>
        <span>BBB+ (100%)</span>
      </div>
      <div style={{ background: '#f1f5f9', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
        <div style={{
          width: `${(value * 100).toFixed(1)}%`,
          height: '100%',
          background: color,
          borderRadius: '6px',
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: '12px', color, fontWeight: 700, marginTop: '4px' }}>
        {(value * 100).toFixed(1)}% probability of BBB+
      </div>
    </div>
  );
}

function GraphB3({ smiles, onDataLoaded }: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<BBBResult | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    const b64 = btoa(smiles);
    fetch(`/predict/bbb/base64/${b64}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        setResult(data);
        setLoading(false);
        if (onDataLoaded) {
          onDataLoaded([{
            SMILES: smiles,
            Tool: 'GraphB3-ML',
            Category: 'Blood-Brain Barrier',
            Property: 'BBB Permeability',
            Value: data.status,
            Unit: `${(data.probability * 100).toFixed(1)}% conf.`,
          }]);
        }
      })
      .catch(() => { setError(true); setLoading(false); if (onDataLoaded) onDataLoaded([]); });
  }, [smiles]);

  if (loading) return <div style={{ padding: '20px', color: '#64748b' }}>Predicting BBB permeability...</div>;
  if (error || !result) return (
    <div style={{ margin: '15px', padding: '20px', backgroundColor: '#fef2f2', borderRadius: '15px', border: '1px solid #fecaca', color: '#b91c1c' }}>
      <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <i className="bi bi-shield-slash"></i> GraphB3 Model Unavailable
      </div>
      <div style={{ fontSize: '12px' }}>
        The BBB prediction engine failed to load on the server. Check if 'bbb_model.pkl' is present and scikit-learn versions match.
      </div>
    </div>
  );

  const permeable = result.permeable;
  const accent = permeable ? '#10b981' : '#ef4444';
  const accentBg = permeable ? '#ecfdf5' : '#fef2f2';
  const accentBorder = permeable ? '#6ee7b7' : '#fca5a5';

  return (
    <div style={{ margin: '15px', padding: '20px', backgroundColor: '#fff', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: `2px solid ${accent}`, paddingBottom: '10px' }}>
        <h3 style={{ margin: 0, color: accent, fontSize: '18px', fontWeight: 'bold' }}>Blood-Brain Barrier</h3>
        <span style={{ fontSize: '11px', color: '#64748b' }}>GraphB3-inspired · GradientBoosting · B3DB dataset (7.8k compounds)</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{
          padding: '18px 28px',
          borderRadius: '12px',
          backgroundColor: accentBg,
          border: `2px solid ${accentBorder}`,
          textAlign: 'center',
          minWidth: '120px',
        }}>
          <div style={{ fontSize: '28px', fontWeight: 900, color: accent }}>{result.status}</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {permeable ? 'Permeable' : 'Non-permeable'}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontSize: '13px', color: '#475569', marginBottom: '4px' }}>
            {permeable
              ? 'This compound is predicted to cross the blood-brain barrier, suggesting potential CNS activity.'
              : 'This compound is predicted NOT to cross the blood-brain barrier. CNS activity is unlikely.'}
          </div>
          <ProbBar value={result.probability} permeable={permeable} />
        </div>
      </div>

      <div style={{ marginTop: '14px', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '11px', color: '#94a3b8' }}>
        Modelo: GradientBoosting · Features: ECFP4 (2048 bits) + 9 descritores · AUC-ROC 0.95 · F1 0.90
      </div>

      <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '10px', color: '#92400e', lineHeight: 1.6 }}>
        <strong style={{ display: 'block', marginBottom: '3px' }}><i className="bi bi-book" style={{ marginRight: '4px' }} />Ao utilizar estes resultados, cite:</strong>
        <span>Dataset: Meng F et al. B3DB: A multifunctional reference database of blood-brain barrier permeability. <em>Sci Data</em>. 2021.</span><br />
        <span>Modelo local: GradientBoostingClassifier (scikit-learn) treinado no B3DB com fingerprints ECFP4 + descritores físico-químicos RDKit.</span>
      </div>
    </div>
  );
}

export default GraphB3;
