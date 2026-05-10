import React, { useEffect, useState } from 'react';

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
  padding: '6px',
  textAlign: 'left',
  fontWeight: 'bold',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #dee2e6',
  padding: '6px',
  textAlign: 'left',
};

function ADMETlab(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [categories, setCategories] = useState<{ name: string; props: any[] }[]>([]);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    setCategories([]);

    const worker = new Worker(new URL('./admetlab.worker.js', import.meta.url));
    const allCategories: { name: string; props: any[] }[] = [];

    worker.onmessage = (e) => {
      const { status, category, error } = e.data;

      if (status === 'chunk') {
        allCategories.push(category);
        // Update state on each chunk so the UI builds progressively
        setCategories([...allCategories]);
      } else if (status === 'done') {
        setIsLoading(false);
        if (props.onDataLoaded) {
          if (allCategories.length === 0) {
            // Worker finished but couldn't parse any data from the HTML
            console.warn('ADMETlab: done but no categories parsed');
            setIsError(true);
            props.onDataLoaded([]);
          } else {
            const allData: any[] = allCategories.flatMap((c) =>
              c.props.map((p) => ({
                SMILES: props.smiles,
                Tool: 'ADMETlab 3.0',
                Category: c.name,
                Property: p.name,
                Value: p.value,
                Unit: '-',
              }))
            );
            props.onDataLoaded(allData);
          }
        }
        worker.terminate();
      } else if (status === 'error') {
        console.error('ADMETlab Worker Error:', error);
        setIsError(true);
        setIsLoading(false);
        if (props.onDataLoaded) props.onDataLoaded([]);
        worker.terminate();
      }
    };

    worker.postMessage({ smiles: props.smiles, type: 'FETCH_ADMETLAB' });

    return () => worker.terminate();
  }, [props.smiles]);

  if (isLoading && categories.length === 0 && !isError) {
    return (
      <div style={{ margin: '20px' }}>
        <p>Analisando (ADMETlab 3.0) para <strong>{props.smiles}</strong>...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ margin: '20px', color: 'red' }}>
        <p>Erro ao obter dados do ADMETlab 3.0.</p>
      </div>
    );
  }

  return (
    <div style={componentStyles}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #5a5aed', paddingBottom: '10px', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#5a5aed' }}>ADMETlab 3.0 Analysis</h3>
        {isLoading && <span style={{ fontSize: '12px', color: '#999' }}>Carregando...</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
        {categories.map((cat, i) => (
          <div key={i} style={{ border: '1px solid #f0f0f0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#f8f9fa', padding: '6px 12px', fontWeight: 'bold', fontSize: '14px', borderLeft: '4px solid #5a5aed' }}>
              {cat.name}
            </div>
            <table style={tableStyle}>
              <tbody>
                {cat.props.map((p, j) => (
                  <tr key={j}>
                    <td style={{ ...tdStyle, width: '60%' }}>{p.name}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold' }}>{p.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '14px', padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', fontSize: '10px', color: '#92400e', lineHeight: 1.6 }}>
        <strong style={{ display: 'block', marginBottom: '3px' }}><i className="bi bi-book" style={{ marginRight: '4px' }} />Ao utilizar estes resultados, cite:</strong>
        <span>Xiong G et al. ADMETlab 2.0: an integrated online platform for accurate and comprehensive predictions of ADMET properties. <em>Nucleic Acids Res</em>. 2021.</span><br />
        <span>Fang J et al. Geometry-enhanced molecular representation learning for property prediction. <em>Nat Mach Intell</em>. 2022.</span>
      </div>
    </div>
  );
}

export default ADMETlab;
