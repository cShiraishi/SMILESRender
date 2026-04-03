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
  marginTop: '10px'
};

const thStyle: React.CSSProperties = {
  backgroundColor: '#f8f9fa',
  border: '1px solid #dee2e6',
  padding: '6px',
  textAlign: 'left',
  fontWeight: 'bold'
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #dee2e6',
  padding: '6px',
  textAlign: 'left'
};

function ADMETlab(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [categories, setCategories] = useState<{ name: string; props: any[] }[]>([]);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);

    fetch(`/predict/admetlab/base64/${encodeURIComponent(window.btoa(props.smiles))}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.text();
      })
      .then((html) => {
        // Sanitizar contra scripts
        const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                              .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanHtml, 'text/html');
        
        const extractedCategories: any[] = [];
        
        // ADMETlab 3.0 uses '.sub-title' for section headers
        const subTitles = doc.querySelectorAll('.sub-title');
        
        subTitles.forEach((titleElem) => {
           let categoryName = titleElem.textContent?.trim() || "Propriedades";
           
           // Corrigir erro de digitação do site original para o usuário
           if (categoryName === "ABSPORPTION") categoryName = "ABSORPTION";

           const sectionProps: any[] = [];
           
           // A tabela geralmente está no próximo elemento ou dentro do mesmo container row
           let container = titleElem.closest('.row, .card-body, .col-xl-4');
           if (!container) container = titleElem.parentElement;

           const tables = container ? container.querySelectorAll('table') : [];
           tables.forEach(table => {
              // Pegar apenas as tabelas que estão "perto" deste título para não repetir dados
              const rows = table.querySelectorAll('tr');
              rows.forEach(row => {
                 const cells = row.querySelectorAll('td');
                 if (cells.length >= 2) {
                    const name = cells[0].textContent?.trim() || "";
                    const value = cells[1].textContent?.trim() || "";
                    
                    if (name && value && name !== "Property" && name !== "Model") {
                      sectionProps.push({ name, value });
                    }
                 }
              });
           });

           if (sectionProps.length > 0) {
              extractedCategories.push({ name: categoryName, props: sectionProps });
           }
        });

        if (extractedCategories.length === 0) {
           // Fallback se o seletor .sub-title falhar
           const tables = doc.querySelectorAll('table');
           tables.forEach((table, idx) => {
              const props: any[] = [];
              table.querySelectorAll('tr').forEach(row => {
                 const cells = row.querySelectorAll('td');
                 if (cells.length >= 2) {
                    props.push({ name: cells[0].textContent?.trim(), value: cells[1].textContent?.trim() });
                 }
              });
              if (props.length > 0) extractedCategories.push({ name: `Seção ${idx + 1}`, props });
           });
        }

        setCategories(extractedCategories); // SEM LIMITE agora
        setIsLoading(false);
        
        // Finalizar exportação completa
        if (props.onDataLoaded) {
           const allData: any[] = extractedCategories.flatMap(c => c.props.map(p => ({
               SMILES: props.smiles,
               Tool: "ADMETlab 3.0",
               Category: c.name,
               Property: p.name,
               Value: p.value,
               Unit: "-"
           })));
           props.onDataLoaded(allData);
        }
      })
      .catch((err) => {
        console.error('ADMETlab Fetch Error:', err);
        setIsError(true);
        setIsLoading(false);
      });
  }, [props.smiles]);

  if (isLoading) {
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
    </div>
  );
}

export default ADMETlab;
