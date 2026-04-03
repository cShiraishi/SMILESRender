import React from 'react';
import { useState } from 'react';
import Section from '../components/Section';
import Prediction from '../components/Prediction';
import SwissADME from '../components/SwissADME';
import StopLight from '../components/StopLight';
import PKCSM from '../components/PKCSM';
import ADMETlab from '../components/ADMETlab';

const defaultSmiles = [
  'CCCCCCCC',
  'C0CCCCC0C0CCCCC0',
  'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H](O)[C@H](O)1',
];

const smilesPredictionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  width: '100%',
};

function PredictWithStopTox() {
  const [smiles, setSmiles] = useState(defaultSmiles);
  const [smilesToRender, setSmilesToRender] = useState([] as string[]);
  const [allResults, setAllResults] = useState<{[key: string]: any[]}>({});
  const [activeTab, setActiveTab] = useState<'input'|'results'>('input');

  const updateResults = (smiles: string, tool: string, data: any[]) => {
    setAllResults(prev => ({
      ...prev,
      [`${smiles}-${tool}`]: data
    }));
  };

  const handleExport = async () => {
      const flatData = Object.values(allResults).flat();
      const totalExpected = smilesToRender.filter(Boolean).length * 5;
      const currentCount = Object.keys(allResults).length;
      
      if (currentCount < totalExpected) {
          alert(`Aguarde a conclusão de todas as análises (${Math.floor((currentCount/totalExpected)*100)}%).`);
          return;
      }
      
      try {
          const response = await fetch('/export/excel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(flatData)
          });
          
          if (!response.ok) throw new Error("Erro na exportação");
          
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `molecular_predictions_${new Date().getTime()}.xlsx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
      } catch (err) {
          console.error("Export Error:", err);
          alert("Erro ao gerar o Excel. Verifique se o servidor Flask está configurado corretamente.");
      }
  };

  function loadSmiles() {
    setAllResults({}); // Limpar resultados antigos ao novo processamento
    setSmilesToRender(smiles);
    setActiveTab('results'); // Switch to results tab after starting prediction
  }

  const totalExpected = smilesToRender.filter(Boolean).length * 5;
  const currentCount = Object.keys(allResults).length;
  const percentage = totalExpected > 0 ? Math.floor((currentCount / totalExpected) * 100) : 0;
  const isReady = percentage === 100;

  return (
  <Section title="Predict SMILES (Multi-Tool: StopTox, SwissADME & StopLight)">
    <>
      {/* Tab navigation */}
      <div style={{ display: 'flex', marginBottom: '20px', gap: '10px' }}>
        <button
          style={{
            backgroundColor: activeTab === 'input' ? '#007bff' : '#e0e0e0',
            color: activeTab === 'input' ? 'white' : '#333',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
          }}
          onClick={() => setActiveTab('input')}
        >
          SMILES Input
        </button>
        <button
          style={{
            backgroundColor: activeTab === 'results' ? '#007bff' : '#e0e0e0',
            color: activeTab === 'results' ? 'white' : '#333',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
          }}
          onClick={() => setActiveTab('results')}
          disabled={smilesToRender.length === 0}
        >
          Results
        </button>
      </div>

      {/* Input Tab */}
      {activeTab === 'input' && (
        <div>
          <p style={{ marginBottom: '10px' }}>
            <label> SMILES to 2D Molecule : </label>
          </p>
          <textarea
            style={{ width: '100%' }}
            defaultValue={defaultSmiles.join('\n')}
            rows={6}
            onChange={(e) => setSmiles(e.target.value.split('\n'))}
          />
          <div style={{ padding: '10px 0', display: 'flex', gap: '15px', alignItems: 'center' }}>
            <button
              style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 25px' }}
              onClick={loadSmiles}
            >
              🚀 Run All Predictions
            </button>
          </div>
        </div>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <>
          <div style={{ padding: '10px 0', display: 'flex', gap: '15px', alignItems: 'center' }}>
            {smilesToRender.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  disabled={!isReady}
                  style={{
                    backgroundColor: isReady ? '#28a745' : '#ffc107',
                    color: isReady ? 'white' : '#333',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '5px',
                    cursor: isReady ? 'pointer' : 'not-allowed',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease',
                    boxShadow: isReady ? '0 4px 15px rgba(40,167,69,0.3)' : 'none',
                  }}
                  onClick={handleExport}
                >
                  {isReady ? '✅ Export to Excel (Ready!)' : `⏳ Compiling Data (${percentage}%)`}
                </button>
                {!isReady && (
                  <div style={{ width: '100px', height: '8px', backgroundColor: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: '#ffc107', transition: 'width 0.5s ease' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={smilesPredictionStyle}>
            {[...new Set(smilesToRender)].filter(Boolean).map((smiles) => (
              <div key={smiles} style={{ width: '100%', marginBottom: '50px', borderBottom: '3px solid #eee', paddingBottom: '30px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center' }}>
                  <div style={{ flex: '1', minWidth: '350px' }}>
                    <Prediction smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'StopTox', data)} />
                  </div>
                  <div style={{ flex: '1', minWidth: '350px' }}>
                    <SwissADME smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'SwissADME', data)} />
                  </div>
                </div>
                <div style={{ marginTop: '20px', width: '100%' }}>
                  <StopLight smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'StopLight', data)} />
                </div>
                <div style={{ marginTop: '20px', width: '100%' }}>
                  <PKCSM smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'PKCSM', data)} />
                </div>
                <div style={{ marginTop: '20px', width: '100%' }}>
                  <ADMETlab smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'ADMETlab', data)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  </Section>
);
}

export default PredictWithStopTox;
