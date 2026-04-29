import React, { useEffect, useState } from 'react';

const cardContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '12px',
  padding: '5px',
};

const toxicityCardStyle = (isToxic: boolean): React.CSSProperties => ({
  backgroundColor: '#fff',
  border: `1px solid ${isToxic ? '#fee2e2' : '#dcfce7'}`,
  borderRadius: '12px',
  padding: '16px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  borderLeft: `6px solid ${isToxic ? '#ef4444' : '#22c55e'}`,
  minHeight: '110px',
});

const statusBadgeStyle = (isToxic: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: '20px',
  fontSize: '13px',
  fontWeight: '800',
  textTransform: 'uppercase',
  display: 'inline-block',
  marginTop: '10px',
  backgroundColor: isToxic ? '#fef2f2' : '#f0fdf4',
  color: isToxic ? '#991b1b' : '#166534',
  border: `1px solid ${isToxic ? '#fca5a5' : '#86efac'}`,
  textAlign: 'center',
});

interface ParsedResult {
  endpoint: string;
  prediction: string;
  isToxic: boolean;
}

function Prediction(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [results, setResults] = useState<ParsedResult[]>([]);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);

    const worker = new Worker(new URL('./prediction.worker.js', import.meta.url));
    
    worker.onmessage = (e) => {
        const { html, status } = e.data;
        
        if (status === 'success') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Search in ALL tables, not just #tablePreview
            const allRows = doc.querySelectorAll('tr');
            const parsed: ParsedResult[] = [];
            const seenEndpoints = new Set<string>();

            allRows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    let endpoint = (cells[0].textContent || '').trim();
                    let prediction = (cells[1].textContent || '').trim();
                    
                    // Skip headers or empty rows
                    if (!endpoint || !prediction || endpoint === 'Endpoint' || prediction === 'Prediction') return;

                    // Cleanup endpoint name
                    endpoint = endpoint.replace(/StopTox_/g, '')
                                       .replace(/More Info/g, '')
                                       .replace(/Acute /g, '')
                                       .replace(/Toxicity/g, '')
                                       .replace(/[\d]+_/, '') // Remove numeric prefixes
                                       .trim();
                    
                    if (endpoint.length < 3) return; // Skip noise
                    if (seenEndpoints.has(endpoint)) return; // Avoid duplicates
                    seenEndpoints.add(endpoint);

                    const toxicTerms = ['toxic', 'sensitizer', 'irritant', 'corrosive', 'positive', '(+)'];
                    const safeTerms  = ['non-toxic', 'negative', '(-)', 'non-sensitizer'];
                    
                    const isToxic = toxicTerms.some(term => prediction.toLowerCase().includes(term)) && 
                                   !safeTerms.some(term => prediction.toLowerCase().includes(term));

                    parsed.push({ endpoint, prediction, isToxic });
                }
            });

            if (parsed.length === 0) {
                // Try fallback search for lists if no tables
                const listItems = doc.querySelectorAll('li');
                listItems.forEach(li => {
                    const text = li.textContent || '';
                    if (text.includes(':')) {
                        const [ep, pred] = text.split(':');
                        const endpoint = ep.trim();
                        const prediction = pred.trim();
                        if (endpoint && prediction && !seenEndpoints.has(endpoint)) {
                             seenEndpoints.add(endpoint);
                             const isToxic = toxicTerms.some(term => prediction.toLowerCase().includes(term));
                             parsed.push({ endpoint, prediction, isToxic });
                        }
                    }
                });
            }

            setResults(parsed);
            setIsLoading(false);

            if (props.onDataLoaded) {
                props.onDataLoaded(parsed.map(p => ({
                    SMILES: props.smiles,
                    Tool: "StopTox",
                    Category: "Safety Profile",
                    Property: p.endpoint,
                    Value: p.prediction,
                    Unit: p.isToxic ? "HIGH RISK" : "SAFE"
                })));
            }
        } else {
            setIsError(true);
            setIsLoading(false);
            if (props.onDataLoaded) props.onDataLoaded([]);
        }
        worker.terminate();
    };

    worker.postMessage({ smiles: props.smiles, type: 'FETCH_PREDICTION' });
    return () => worker.terminate();
  }, [props.smiles]);

  if (isLoading) return <div style={{ padding: '20px', color: '#64748b' }}>⏳ Capturando perfil ADMET (StopTox)...</div>;
  if (isError) return <div style={{ padding: '20px', color: '#ef4444' }}>⚠️ Falha na conexão StopTox</div>;

  return (
    <div style={{ margin: '15px', padding: '20px', backgroundColor: '#fff', borderRadius: '15px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ea580c', paddingBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#ea580c', fontSize: '18px', fontWeight: 'bold' }}>StopTox Full Toxicity Profile</h3>
        <span style={{ fontSize: '11px', color: '#64748b' }}>{results.length} tests analyzed</span>
      </div>
      
      <div style={cardContainerStyle}>
        {results.map((res, i) => (
          <div key={i} style={toxicityCardStyle(res.isToxic)}>
            <div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Endpoint</div>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', lineHeight: '1.2' }}>{res.endpoint}</div>
            </div>
            <div style={statusBadgeStyle(res.isToxic)}>
              {res.prediction}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Prediction;
