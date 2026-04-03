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
  marginTop: '10px'
};

const thStyle: React.CSSProperties = {
  backgroundColor: '#f8f9fa',
  border: '1px solid #dee2e6',
  padding: '8px',
  textAlign: 'left',
  fontWeight: 'bold'
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #dee2e6',
  padding: '8px',
  textAlign: 'left'
};

function PKCSM(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [results, setResults] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("Iniciando predição...");
  const pollInterval = useRef<any>(null);
  const resultUrl = useRef<string>("");

  const stopPolling = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  };

  const fetchResults = async () => {
    try {
      const response = await fetch('/predict/pkcsm/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: resultUrl.current })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const html = await response.text();
      // Sanitizar o HTML contra scripts e anúncios externos
      const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

      const parser = new DOMParser();
      const doc = parser.parseFromString(cleanHtml, 'text/html');
      
      // O pkCSM tem os resultados na segunda tabela da classe especificada
      const tables = doc.querySelectorAll('.table.table-hover.table-striped');
      const targetTable = tables.length > 1 ? tables[1] : tables[0];

      if (!targetTable) {
        setStatus("Aguardando tabela de resultados...");
        return;
      }

      const rows = targetTable.querySelectorAll('tbody tr');
      const extractedResults: any[] = [];
      let allReady = true;

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          const predValue = cells[2].innerText.trim();
          if (predValue.toLowerCase().includes("running")) {
            allReady = false;
          }
          
          extractedResults.push({
            property: cells[0].innerText.trim(),
            model: cells[1].innerText.trim(),
            value: predValue,
            unit: cells[3].innerText.trim()
          });
        }
      });

      if (extractedResults.length > 0) {
        setResults(extractedResults);
        if (allReady) {
          setIsLoading(false);
          stopPolling();
          
          // Finalizar exportação quando tudo estiver carregado
          if (props.onDataLoaded) {
              props.onDataLoaded(extractedResults.map(p => ({
                  SMILES: props.smiles,
                  Tool: "pkCSM",
                  Category: p.property,
                  Property: p.model,
                  Value: p.value,
                  Unit: p.unit
              })));
          }
        } else {
          setStatus("Processando modelos ADMET...");
        }
      }
    } catch (err) {
      console.error('pkCSM Fetch Error:', err);
      // Não parar o polling no primeiro erro, pode ser oscilação, mas marcar erro se persistir?
    }
  };

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    setResults([]);
    setStatus("Conectando ao pkCSM...");

    // 1. Inicializar a predição e pegar a URL única
    fetch(`/predict/pkcsm/base64/${encodeURIComponent(window.btoa(props.smiles))}`)
      .then(res => {
        if (!res.ok) throw new Error("Falha ao iniciar pkCSM");
        return res.json();
      })
      .then(data => {
        if (data.result_url) {
          resultUrl.current = data.result_url;
          setStatus("Predição iniciada. Aguardando resultados...");
          
          // 2. Começar a poll os resultados
          pollInterval.current = setInterval(fetchResults, 3000);
          fetchResults(); // Primeira chamada imediata
        } else {
          throw new Error("URL de resultado não encontrada");
        }
      })
      .catch(err => {
        console.error("pkCSM Init Error:", err);
        setIsError(true);
        setIsLoading(false);
      });

    return () => stopPolling();
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

  // Agrupar resultados por 'Property'
  const groupedResults: { [key: string]: any[] } = {};
  results.forEach(res => {
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
