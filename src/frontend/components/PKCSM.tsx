import React, { useEffect, useState, useRef } from 'react';

const componentStyles: React.CSSProperties = {
  margin: '10px',
  padding: '15px',
  boxShadow: '2px 4px 10px rgba(0, 0, 0, 0.2)',
  maxWidth: '100%',
  borderRadius: '10px',
  backgroundColor: '#fff',
  border: '1px solid #e0e0e0',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
  marginTop: '10px',
};

const thStyle: React.CSSProperties = {
  backgroundColor: '#f8f9fa',
  border: '1px solid #dee2e6',
  padding: '8px',
  textAlign: 'left',
  fontWeight: 'bold',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #dee2e6',
  padding: '8px',
  textAlign: 'left',
};

function PKCSM(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState<string>('Conectando ao pkCSM...');
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    setResults([]);
    setStatus('Conectando ao pkCSM...');

    workerRef.current?.terminate();
    const worker = new Worker(new URL('./pkcsm.worker.js', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { status: wStatus, results: wResults, message, error } = e.data;

      if (wStatus === 'started') {
        setStatus(message);
      } else if (wStatus === 'waiting') {
        setStatus(message);
      } else if (wStatus === 'partial') {
        setResults(wResults);
        setStatus(message);
      } else if (wStatus === 'done') {
        setResults(wResults);
        setIsLoading(false);
        if (props.onDataLoaded) {
          props.onDataLoaded(
            wResults.map((p: any) => ({
              SMILES: props.smiles,
              Tool: 'pkCSM',
              Category: p.property,
              Property: p.model,
              Value: p.value,
              Unit: p.unit,
            }))
          );
        }
        worker.terminate();
      } else if (wStatus === 'timeout') {
        setIsLoading(false);
        setStatus('Tempo esgotado');
        if (props.onDataLoaded) props.onDataLoaded([]);
        worker.terminate();
      } else if (wStatus === 'error') {
        console.error('pkCSM Worker Error:', error);
        setIsError(true);
        setIsLoading(false);
        if (props.onDataLoaded) props.onDataLoaded([]);
        worker.terminate();
      }
    };

    worker.postMessage({ smiles: props.smiles, type: 'FETCH_PKCSM' });

    return () => worker.terminate();
  }, [props.smiles]);

  if (isLoading && results.length === 0 && !isError) {
    return (
      <div style={{ margin: '20px' }}>
        <p>Analisando ADMET (pkCSM) para <strong>{props.smiles}</strong>...</p>
        <p style={{ fontSize: '12px', color: '#666' }}>Status: {status}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ margin: '20px', color: 'red' }}>
        <p>Erro ao obter dados do pkCSM.</p>
      </div>
    );
  }

  const groupedResults: { [key: string]: any[] } = {};
  results.forEach((res) => {
    if (!groupedResults[res.property]) groupedResults[res.property] = [];
    groupedResults[res.property].push(res);
  });

  return (
    <div style={componentStyles}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #28a745', paddingBottom: '10px', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#28a745' }}>pkCSM ADMET Results</h3>
        {isLoading && <span style={{ fontSize: '12px', color: '#666' }}>{status}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
        {Object.keys(groupedResults).map((category, i) => (
          <div key={i} style={{ border: '1px solid #f0f0f0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#f8f9fa', padding: '8px 12px', fontWeight: 'bold', fontSize: '14px', borderLeft: '4px solid #28a745' }}>
              {category}
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Model</th>
                  <th style={thStyle}>Value</th>
                  <th style={thStyle}>Unit</th>
                </tr>
              </thead>
              <tbody>
                {groupedResults[category].map((p, j) => (
                  <tr key={j}>
                    <td style={tdStyle}>{p.model}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', color: p.value.includes('Running') ? '#999' : '#333' }}>{p.value}</td>
                    <td style={tdStyle}>{p.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PKCSM;
