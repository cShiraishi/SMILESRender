import React, { useEffect, useState } from 'react';

const ACCENT = '#dc2626';

const wrap: React.CSSProperties = {
  margin: '10px', padding: '15px',
  boxShadow: '2px 4px 10px rgba(0,0,0,0.15)',
  borderRadius: '10px', backgroundColor: '#fff',
  border: '1px solid #e0e0e0',
};

type ModelResult = { label: string; active: boolean; probability: number };
type Data = Record<string, ModelResult>;

const CATEGORIES: { title: string; keys: string[] }[] = [
  { title: 'Organ Toxicity',      keys: ['dili', 'neuro', 'nephro', 'respi', 'cardio'] },
  { title: 'Genotox & Immuno',    keys: ['carcino', 'immuno', 'mutagen', 'cyto'] },
  { title: 'Other Endpoints',     keys: ['bbb', 'eco', 'clinical'] },
];

function ResultRow({ r }: { r: ModelResult }) {
  const bg  = r.active ? '#fef2f2' : '#f0fdf4';
  const col = r.active ? '#dc2626' : '#16a34a';
  const tag = r.active ? 'Active' : 'Inactive';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', backgroundColor: bg, borderRadius: '6px',
                  marginBottom: '4px', fontSize: '13px' }}>
      <span style={{ color: '#1e293b' }}>{r.label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#64748b', fontSize: '11px' }}>{(r.probability * 100).toFixed(1)}%</span>
        <span style={{ padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold', fontSize: '11px',
                       backgroundColor: r.active ? '#fee2e2' : '#dcfce7', color: col }}>
          {tag}
        </span>
      </span>
    </div>
  );
}

function ProTox(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [data,      setData]      = useState<Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError,   setIsError]   = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    setData(null);

    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 60_000);

    fetch(`/predict/protox/base64/${encodeURIComponent(btoa(props.smiles))}`,
          { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Data) => {
        clearTimeout(t);
        setData(d);
        setIsLoading(false);

        if (props.onDataLoaded) {
          const rows = Object.entries(d).map(([key, v]) => ({
            SMILES:   props.smiles,
            Tool:     'ProTox-3.0',
            Category: 'Organ & Systemic Toxicity',
            Property: v.label,
            Value:    v.active ? 'Active' : 'Inactive',
            Unit:     `confidence ${(v.probability * 100).toFixed(1)}%`,
          }));
          props.onDataLoaded(rows);
        }
      })
      .catch(err => {
        clearTimeout(t);
        if (err.name !== 'AbortError') console.error('ProTox Error:', err);
        setIsError(true);
        setIsLoading(false);
        if (props.onDataLoaded) props.onDataLoaded([]);
      });

    return () => { clearTimeout(t); ctrl.abort(); };
  }, [props.smiles]);

  if (isLoading) return (
    <div style={{ margin: '20px' }}>
      <p>Analisando toxicidade (ProTox-3.0) para <strong>{props.smiles}</strong>...</p>
    </div>
  );

  if (isError || !data) return (
    <div style={{ margin: '20px', color: 'red' }}>
      <p>Erro ao obter dados do ProTox-3.0.</p>
    </div>
  );

  const activeCount = Object.values(data).filter(r => r.active).length;
  const total       = Object.keys(data).length;

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: `2px solid ${ACCENT}`, paddingBottom: '10px', marginBottom: '14px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: ACCENT }}>ProTox-3.0</h3>
        <span style={{
          padding: '4px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px',
          backgroundColor: activeCount === 0 ? '#dcfce7' : activeCount <= 2 ? '#fef9c3' : '#fee2e2',
          color:           activeCount === 0 ? '#16a34a' : activeCount <= 2 ? '#854d0e' : '#dc2626',
        }}>
          {activeCount}/{total} endpoints active
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
        {CATEGORIES.map(cat => {
          const catResults = cat.keys.map(k => data[k]).filter(Boolean);
          if (!catResults.length) return null;
          return (
            <div key={cat.title}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                            marginBottom: '6px' }}>
                {cat.title}
              </div>
              {catResults.map((r, i) => <ResultRow key={i} r={r} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProTox;
