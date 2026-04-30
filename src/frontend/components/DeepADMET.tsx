import React, { useEffect, useState } from 'react';

interface DeepResult {
  Property: string;
  Value: any;
  Probability: number;
  Unit: string;
  Category: string;
  Tool: string;
}

function DeepADMET(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [results, setResults] = useState<DeepResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setIsError(false);
      try {
        const b64 = btoa(props.smiles);
        const res = await fetch(`/deep/${b64}`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        setResults(data);
        if (props.onDataLoaded) {
          props.onDataLoaded(data.map((r: any) => ({
            ...r,
            SMILES: props.smiles
          })));
        }
      } catch (err) {
        console.error(err);
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [props.smiles]);

  if (isLoading) return <div style={{ padding: '20px', color: '#666' }}>
    <div className="spinner-border spinner-border-sm me-2" role="status"></div>
    Running Deep Learning Engine (Chemprop D-MPNN)...
  </div>;
  
  if (isError) return <div style={{ padding: '20px', color: 'red' }}>Error loading Deep ADMET data.</div>;

  const categories = Array.from(new Set(results.map(r => r.Category)));

  return (
    <div style={{ margin: '15px 0', padding: '20px', backgroundColor: '#fcfdff', borderRadius: '12px', border: '1px solid #e0e7ff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #6366f1', paddingBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-cpu"></i> Chemprop Deep Engine (D-MPNN)
        </h3>
        <span style={{ marginLeft: 'auto', fontSize: '12px', backgroundColor: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
          State-of-the-Art
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {categories.map(cat => (
          <div key={cat} style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #f0f0f0', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#f8fafc', padding: '8px 12px', fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #f0f0f0', color: '#475569' }}>
              {cat}
            </div>
            <div style={{ padding: '10px' }}>
              {results.filter(r => r.Category === cat).map((r, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: idx < results.filter(res => res.Category === cat).length - 1 ? '1px solid #f8fafc' : 'none', fontSize: '12px' }}>
                  <span style={{ color: '#64748b' }}>{r.Property.replace(/_/g, ' ')}</span>
                  <span style={{ 
                    fontWeight: 'bold', 
                    color: typeof r.Value === 'number' && r.Value > 0.5 && cat === 'Toxicity' ? '#ef4444' : '#1e293b' 
                  }}>
                    {r.Value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ marginTop: '15px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'right' }}>
        Predictions generated via ADMET-AI & Chemprop v2
      </div>
    </div>
  );
}

export default DeepADMET;
