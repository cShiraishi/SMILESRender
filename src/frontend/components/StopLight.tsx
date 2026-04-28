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

const categoryHeader: React.CSSProperties = {
  backgroundColor: '#f8f9fa',
  padding: '8px 12px',
  fontWeight: 'bold',
  fontSize: '14px',
  borderLeft: '4px solid #007bff',
  marginTop: '15px',
  marginBottom: '10px',
};

const propertyItem: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '5px 10px',
  fontSize: '13px',
  borderBottom: '1px solid #f0f0f0',
};

function StopLight(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [overallScore, setOverallScore] = useState<string>("");
  const [stoplightSvg, setStoplightSvg] = useState<string>("");
  const [categories, setCategories] = useState<{ name: string; props: { name: string; value: string; color?: string }[] }[]>([]);

  useEffect(() => {
    setIsLoading(true);

    fetch(`/predict/stoplight/base64/${encodeURIComponent(window.btoa(props.smiles))}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.text();
      })
      .then((text) => {
        // Tentar detectar se é JSON primeiro
        try {
          const data = JSON.parse(text);
          if (data && data.molProperties) {
            setOverallScore(data.overall !== undefined ? `Overall score ${data.overall}` : "");
            
            // Transformar o formato JSON do StopLight para o nosso formato de categorias
            const categoriesMap: { [key: string]: any[] } = {
              "Molecular Properties": []
            };

            data.molProperties.forEach((prop: any) => {
              // Formato: [Nome, ?, Valor, ?, ?, ?, Cor]
              categoriesMap["Molecular Properties"].push({
                name: prop[0],
                value: prop[2],
                color: prop[6]
              });
            });

            const extractedCategories = Object.keys(categoriesMap).map(name => ({
              name,
              props: categoriesMap[name]
            }));

            // Adicionar o SVG se existir
            if (data.stoplight) {
               setStoplightSvg(data.stoplight);
            }

            setCategories(extractedCategories);
            setIsLoading(false);
            
            // Finalizar exportação JSON
            if (props.onDataLoaded) {
               const allData: any[] = extractedCategories.flatMap(c => c.props.map(p => ({
                   SMILES: props.smiles,
                   Tool: "StopLight",
                   Category: "Pharmacokinetics",
                   Property: p.name,
                   Value: p.value,
                   Unit: "-"
               })));
               if (data.overall !== undefined) {
                   allData.unshift({ SMILES: props.smiles, Tool: "StopLight", Category: "General", Property: "Overall Score", Value: data.overall, Unit: "-" });
               }
               props.onDataLoaded(allData);
            }
            return;
          }
        } catch (e) {
          // Não é JSON, seguir com o parser HTML legado
        }

        // Remover TODOS os scripts e iframes da resposta para evitar popups indesejados
        const cleanHtml = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                              .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

        const parser = new DOMParser();
        const doc = parser.parseFromString(cleanHtml, 'text/html');
        
        // Extrair o Overall Score
        const scoreElement = doc.querySelector('.molecule-wrapper h4');
        if (scoreElement) setOverallScore(scoreElement.innerHTML.replace('Result: ', ''));

        // Extrair Categorias e Propriedades
        const wrapper = doc.querySelector('.molecule-wrapper');
        if (!wrapper) throw new Error('Result format not recognized');

        const extractedCategories: any[] = [];
        const headers = wrapper.querySelectorAll('h5');

        headers.forEach((header) => {
          const categoryName = header.innerText.trim();
          const categoryProps: any[] = [];
          
          let nextElem = header.nextElementSibling;
          while (nextElem && nextElem.classList.contains('option-item')) {
            const span = nextElem.querySelector('.model-preds');
            if (span) {
               const propName = span.id;
               const valueSpan = span.querySelector('span');
               categoryProps.push({
                 name: propName,
                 value: valueSpan ? valueSpan.innerText.trim() : "N/A",
                 color: valueSpan ? (valueSpan as HTMLElement).style.color : ""
               });
            }
            nextElem = nextElem.nextElementSibling;
          }

          if (categoryProps.length > 0) {
            extractedCategories.push({ name: categoryName, props: categoryProps });
          }
        });

        setCategories(extractedCategories);
        setIsLoading(false);
        
        // Finalizar exportação HTML
        if (props.onDataLoaded) {
            const allData: any[] = extractedCategories.flatMap(c => c.props.map(p => ({
                SMILES: props.smiles,
                Tool: "StopLight",
                Category: "Pharmacokinetics",
                Property: p.name,
                Value: p.value,
                Unit: "-"
            })));
            if (overallScore) {
                allData.unshift({ SMILES: props.smiles, Tool: "StopLight", Category: "General", Property: "Overall Score", Value: overallScore, Unit: "-" });
            }
            props.onDataLoaded(allData);
        }
      })
      .catch((err) => {
        console.error('StopLight Error:', err);
        setIsError(true);
        setIsLoading(false);
        if (props.onDataLoaded) props.onDataLoaded([]);
      });
  }, [props.smiles]);

  if (isLoading && !isError) {
    return (
      <div style={{ margin: '20px' }}>
        <p>Analisando luminosidade (StopLight) para <strong>{props.smiles}</strong>...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ margin: '20px', color: 'red' }}>
        <p>Erro ao obter dados do StopLight.</p>
      </div>
    );
  }

  return (
    <div style={componentStyles}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#007bff' }}>StopLight Results</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {stoplightSvg && (
            <div 
              style={{ width: '40px', height: '60px' }} 
              dangerouslySetInnerHTML={{ __html: stoplightSvg }} 
            />
          )}
          {overallScore && (
            <div style={{ backgroundColor: '#007bff', color: 'white', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px' }}>
              {overallScore}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
        {categories.map((cat, i) => (
          <div key={i} style={{ border: '1px solid #f0f0f0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={categoryHeader}>{cat.name}</div>
            {cat.props.map((p, j) => (
              <div key={j} style={propertyItem}>
                <span style={{ color: '#666', fontWeight: '500' }}>{p.name}</span>
                <span style={{ fontWeight: 'bold', color: p.color || '#333' }}>{p.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default StopLight;
