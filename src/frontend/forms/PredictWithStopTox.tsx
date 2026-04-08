import React from 'react';
import { useState } from 'react';
import Prediction from '../components/Prediction';
import SwissADME from '../components/SwissADME';
import StopLight from '../components/StopLight';
import PKCSM from '../components/PKCSM';
import ADMETlab from '../components/ADMETlab';
import ToolErrorBoundary from '../components/ToolErrorBoundary';

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

function PredictWithStopTox({ initialSmiles }: { initialSmiles?: string }) {
  const [smiles, setSmiles] = useState(initialSmiles ? initialSmiles.split('\n').map(s => s.trim()).filter(Boolean) : defaultSmiles);
  const [smilesToRender, setSmilesToRender] = useState([] as string[]);
  const [allResults, setAllResults] = useState<{[key: string]: any[]}>({});
  const [activeTab, setActiveTab] = useState<'input'|'results'>('input');

  React.useEffect(() => {
    if (initialSmiles) {
      setSmiles(initialSmiles.split('\n').map(s => s.trim()).filter(Boolean));
    }
  }, [initialSmiles]);

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
          const proceed = window.confirm(`Algumas análises ainda não terminaram ou podem ter falhado (${percentage}% concluído). Deseja exportar os dados parciais recebidos até agora?`);
          if (!proceed) return;
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
  <div style={{ width: '95%', maxWidth: '1200px' }}>
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
            <label> SMILES to 2D Molecule (max 20) : </label>
          </p>
          <textarea
            style={{ width: '100%', padding: '10px', fontSize: '14px', fontFamily: 'monospace' }}
            value={smiles.join('\n')}
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
                  style={{
                    backgroundColor: isReady ? '#28a745' : '#ffc107',
                    color: isReady ? 'white' : '#333',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                  }}
                  onClick={handleExport}
                  title="Clique para exportar os dados recebidos até agora."
                >
                  {isReady ? '✅ Export to Excel (Ready!)' : `⏳ Exportar Dados Parciais (${percentage}%)`}
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
                    <ToolErrorBoundary toolName="StopTox">
                      <Prediction smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'StopTox', data)} />
                    </ToolErrorBoundary>
                  </div>
                  <div style={{ flex: '1', minWidth: '350px' }}>
                    <ToolErrorBoundary toolName="SwissADME">
                      <SwissADME smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'SwissADME', data)} />
                    </ToolErrorBoundary>
                  </div>
                </div>
                <div style={{ marginTop: '20px', width: '100%' }}>
                  <ToolErrorBoundary toolName="StopLight">
                    <StopLight smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'StopLight', data)} />
                  </ToolErrorBoundary>
                </div>
                <div style={{ marginTop: '20px', width: '100%' }}>
                  <ToolErrorBoundary toolName="pkCSM">
                    <PKCSM smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'PKCSM', data)} />
                  </ToolErrorBoundary>
                </div>
                <div style={{ marginTop: '20px', width: '100%' }}>
                  <ToolErrorBoundary toolName="ADMETlab">
                    <ADMETlab smiles={smiles} onDataLoaded={(data) => updateResults(smiles, 'ADMETlab', data)} />
                  </ToolErrorBoundary>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  </div>
);
}

export default PredictWithStopTox;
