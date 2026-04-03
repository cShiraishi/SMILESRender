import React, { useEffect, useState } from 'react';

const componentStyles: React.CSSProperties = {
  margin: '10px',
  padding: '15px',
  boxShadow: '2px 4px 10px rgba(0, 0, 0, 0.2)',
  maxWidth: '100%',
  borderRadius: '10px',
  backgroundColor: '#f9f9f9',
};

const cellStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: '8px',
  fontSize: '13px',
  textAlign: 'left',
};

const headerStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 'bold',
  backgroundColor: '#e9ecef',
};

function SwissADME(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [results, setResults] = useState<{ title: string; data: [string, string][] }[]>([]);

  useEffect(() => {
    setIsLoading(true);

    fetch(`/predict/swissadme/base64/${encodeURIComponent(window.btoa(props.smiles))}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.text();
      })
      .then((html) => {
        // Sanitizar o HTML contra scripts e anúncios externos
        const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                              .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanHtml, 'text/html');
        
        // No SwissADME, os resultados estão em tabelas dentro do #content
        const content = doc.querySelector('#content');
        if (!content) throw new Error('Could not find results content');

        const tables = content.querySelectorAll('table');
        const extractedResults: { title: string; data: [string, string][] }[] = [];

        tables.forEach((table) => {
           const rows = table.querySelectorAll('tr');
           const tableData: [string, string][] = [];
           let title = "Property";

           rows.forEach((row, index) => {
             const cells = row.querySelectorAll('td');
             if (cells.length === 2) {
               tableData.push([cells[0].innerText.trim(), cells[1].innerText.trim()]);
             } else if (cells.length === 1 && index === 0) {
                title = cells[0].innerText.trim();
             }
           });

           if (tableData.length > 0) {
             extractedResults.push({ title, data: tableData });
           }
        });

        setResults(extractedResults);
        setIsLoading(false);

        // Finalizar exportação
        if (props.onDataLoaded) {
            const allData: any[] = [];
            extractedResults.forEach(group => {
                group.data.forEach(([prop, value]) => {
                    allData.push({
                        SMILES: props.smiles,
                        Tool: "SwissADME",
                        Category: group.title,
                        Property: prop,
                        Value: value,
                        Unit: "-"
                    });
                });
            });
            props.onDataLoaded(allData);
        }
      })
      .catch((err) => {
        console.error('SwissADME Error:', err);
        setIsError(true);
      });
  }, [props.smiles]);

  if (isLoading && !isError) {
    return (
      <div style={{ margin: '20px' }}>
        <p>Calculando propriedades SwissADME para <strong>{props.smiles}</strong>...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ margin: '20px', color: 'red' }}>
        <p>Erro ao obter dados do SwissADME.</p>
      </div>
    );
  }

  return (
    <div style={componentStyles}>
      <h3 style={{ marginBottom: '15px', color: '#333' }}>SwissADME Results</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {results.map((section, idx) => (
          <div key={idx} style={{ border: '1px solid #eee', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#ff4b4b', color: 'white', padding: '5px 10px', fontWeight: 'bold', fontSize: '14px' }}>
              {section.title}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {section.data.map(([prop, value], i) => (
                  <tr key={i}>
                    <td style={{ ...cellStyle, fontWeight: '500', width: '60%' }}>{prop}</td>
                    <td style={cellStyle}>{value}</td>
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

export default SwissADME;
