import React from 'react';

interface DashboardProps {
  allResults: any[];
  uniqueSmiles: string[];
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  border: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
};

const barStyle = (percent: number, color: string): React.CSSProperties => ({
  height: '10px',
  width: `${Math.min(100, Math.max(0, percent))}%`,
  backgroundColor: color,
  borderRadius: '5px',
  transition: 'width 0.5s ease-out',
});

function Dashboard({ allResults = [], uniqueSmiles = [] }: DashboardProps) {
  if (!allResults || allResults.length === 0 || !uniqueSmiles || uniqueSmiles.length === 0) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '15px', marginBottom: '30px', textAlign: 'center', color: '#64748b' }}>
        Gerando dashboard estatístico...
      </div>
    );
  }

  // 1. Médias com proteção (Procuramos por Tool que contenha 'RDKit')
  const rdkitData = allResults.filter(r => r && String(r.Tool).includes('RDKit'));
  
  const mwValues = rdkitData.filter(r => r.Property === 'MW').map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
  const avgMW = mwValues.length > 0 ? mwValues.reduce((a, b) => a + b, 0) / mwValues.length : 0;

  const logPValues = rdkitData.filter(r => r.Property === 'LogP').map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
  const avgLogP = logPValues.length > 0 ? logPValues.reduce((a, b) => a + b, 0) / logPValues.length : 0;

  // 2. Lipinski
  const lipinskiItems = rdkitData.filter(r => r.Property === 'Lipinski Ro5');
  const lipinskiPasses = lipinskiItems.filter(r => String(r.Value).toUpperCase() === 'PASS').length;
  const lipinskiRate = lipinskiItems.length > 0 ? (lipinskiPasses / lipinskiItems.length) * 100 : 0;

  // 3. Toxicity (StopTox)
  const toxResults = allResults.filter(r => r && r.Tool === 'StopTox');
  const highRiskTox = toxResults.filter(r => r.Unit === 'HIGH RISK').length;
  const toxRiskRate = toxResults.length > 0 ? (highRiskTox / toxResults.length) * 100 : 0;

  // 4. Solubility
  const esolClasses = rdkitData.filter(r => r.Property === 'Class');
  const solDistribution = esolClasses.reduce((acc: any, curr) => {
    if (curr && curr.Value) {
      acc[curr.Value] = (acc[curr.Value] || 0) + 1;
    }
    return acc;
  }, {});

  return (
    <div style={{ padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '15px', marginBottom: '30px', border: '1px solid #cbd5e1' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
        <div style={{ width: '40px', height: '40px', backgroundColor: '#1a3a5c', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>📊</div>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>Batch Analysis Overview</h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Análise consolidada de {uniqueSmiles.length} moléculas.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Molecules</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>{uniqueSmiles.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Avg Mol. Weight</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>{avgMW.toFixed(1)} <span style={{ fontSize: '14px' }}>Da</span></div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Avg LogP</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>{avgLogP.toFixed(2)}</div>
        </div>
        <div style={{ ...cardStyle, borderLeft: `6px solid ${lipinskiRate > 50 ? '#22c55e' : '#eab308'}` }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Lipinski Compliance</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>{lipinskiRate.toFixed(0)}%</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <div style={{ ...cardStyle, alignItems: 'stretch', textAlign: 'left' }}>
          <h4 style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#0f172a' }}>Global Toxicity Risk (StopTox)</h4>
          <div style={{ height: '10px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ ...barStyle(100 - toxRiskRate, '#22c55e'), borderRadius: '0' }} />
            <div style={{ ...barStyle(toxRiskRate, '#ef4444'), borderRadius: '0' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '12px', fontWeight: 'bold' }}>
            <span style={{ color: '#166534' }}>Safe: {(100 - toxRiskRate).toFixed(0)}%</span>
            <span style={{ color: '#991b1b' }}>High Risk: {toxRiskRate.toFixed(0)}%</span>
          </div>
        </div>

        <div style={{ ...cardStyle, alignItems: 'stretch', textAlign: 'left' }}>
          <h4 style={{ margin: '0 0 15px 0', fontSize: '15px', color: '#0f172a' }}>Aqueous Solubility (ESOL)</h4>
          <div style={{ display: 'flex', gap: '5px', height: '30px' }}>
            {Object.entries(solDistribution).map(([cat, count]: any, i) => {
              const pct = esolClasses.length > 0 ? (count / esolClasses.length) * 100 : 0;
              return (
                <div 
                  key={i} 
                  style={{ 
                    flex: count, 
                    backgroundColor: cat === 'Soluble' ? '#22c55e' : cat === 'Moderately' ? '#3b82f6' : cat === 'Poorly' ? '#eab308' : '#ef4444',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    overflow: 'hidden',
                    minWidth: pct > 10 ? '30px' : '0'
                  }}
                  title={`${cat}: ${count}`}
                >
                  {pct > 15 ? `${pct.toFixed(0)}%` : ''}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '10px' }}>
            <span style={{ color: '#22c55e' }}>● Soluble</span>
            <span style={{ color: '#3b82f6' }}>● Moderately</span>
            <span style={{ color: '#eab308' }}>● Poorly</span>
            <span style={{ color: '#ef4444' }}>● Insoluble</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
