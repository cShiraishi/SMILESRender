import React, { useEffect, useState } from 'react';

const cardContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '12px',
  padding: '5px',
};

const toxicityCardStyle = (isActive: boolean): React.CSSProperties => ({
  backgroundColor: '#fff',
  border: `1px solid ${isActive ? '#fee2e2' : '#dcfce7'}`,
  borderRadius: '12px',
  padding: '16px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  borderLeft: `6px solid ${isActive ? '#ef4444' : '#22c55e'}`,
  minHeight: '110px',
});

const statusBadgeStyle = (isActive: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: '20px',
  fontSize: '13px',
  fontWeight: '800',
  textTransform: 'uppercase',
  display: 'inline-block',
  marginTop: '10px',
  backgroundColor: isActive ? '#fef2f2' : '#f0fdf4',
  color: isActive ? '#991b1b' : '#166534',
  border: `1px solid ${isActive ? '#fca5a5' : '#86efac'}`,
  textAlign: 'center',
});

interface Tox21Result {
  Property: string;
  Value: string;
  Probability: number;
  Unit: string;
  Category: string;
}

function Tox21(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [results, setResults] = useState<Tox21Result[]>([]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setIsError(false);
      try {
        const b64 = btoa(props.smiles);
        const res = await fetch(`/predict/tox21/base64/${b64}`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        setResults(data);
        setIsLoading(false);
        if (props.onDataLoaded) {
          props.onDataLoaded(data.map((r: Tox21Result) => ({
            SMILES: props.smiles,
            Tool: "Tox21-ML",
            Category: "Tox21 Toxicity",
            Property: `${r.Property} (${(r.Probability * 100).toFixed(0)}% conf.)`,
            Value: r.Value,
            Unit: r.Value === 'Active' ? "HIGH RISK" : "SAFE"
          })));
        }
      } catch (err) {
        console.error(err);
        setIsError(true);
        setIsLoading(false);
        if (props.onDataLoaded) props.onDataLoaded([]);
      }
    }
    fetchData();
  }, [props.smiles]);

  if (isLoading) return <div style={{ padding: '20px', color: '#64748b' }}>⏳ Analisando Toxicidade Tox21 (Random Forest)...</div>;
  if (isError) return <div style={{ padding: '20px', color: '#ef4444' }}>⚠️ Erro na previsão Tox21</div>;

  return (
    <div style={{ margin: '15px', padding: '20px', backgroundColor: '#fff', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #8b5cf6', paddingBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#8b5cf6', fontSize: '18px', fontWeight: 'bold' }}>Tox21 Toxicity Bioassays</h3>
        <span style={{ fontSize: '11px', color: '#64748b' }}>12 endpoints analyzed by ML model</span>
      </div>
      
      <div style={cardContainerStyle}>
        {results.map((res, i) => (
          <div key={i} style={toxicityCardStyle(res.Value === 'Active')}>
            <div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Endpoint</div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', lineHeight: '1.2' }}>{res.Property}</div>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={statusBadgeStyle(res.Value === 'Active')}>
                {res.Value}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', textAlign: 'center' }}>
                Confidence: {(res.Probability * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Tox21;
