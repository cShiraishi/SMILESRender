import React, { useRef } from 'react';
import { useState, useEffect } from 'react';
import Prediction from '../components/Prediction';
import StopLight from '../components/StopLight';
import ToolErrorBoundary from '../components/ToolErrorBoundary';
import Tox21 from '../components/Tox21';
import DeepADMET from '../components/DeepADMET';
import GraphB3 from '../components/GraphB3';
import Dashboard from '../components/Dashboard';
import MolImage from '../components/MolImage';
import MoleculeDrawerModal from '../components/MoleculeDrawerModal';
import RDKitFilters from '../components/RDKitFilters';
import * as csvTools from '../tools/csv';

const defaultSmiles = [
  'CCCCCCCC',
  'C0CCCCC0C0CCCCC0',
  'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H](O)[C@H](O)1',
];

const TOOLS = ['RDKit', 'StopTox', 'StopLight', 'Tox21', 'Deep ADMET', 'GraphB3'] as const;
type ToolName = typeof TOOLS[number];
type ToolState = 'loading' | 'done' | 'error' | 'queued';

const TOOL_COLORS: Record<ToolName, string> = {
  RDKit:      '#0d9488',
  StopTox:    '#b45309',
  StopLight:  '#1d4ed8',
  Tox21:      '#8b5cf6',
  'Deep ADMET': '#ec4899',
  GraphB3:    '#10b981',
};



// ── Component ────────────────────────────────────────────────────────────────
function PredictWithStopTox({ initialSmiles, onSmilesChange }: { initialSmiles?: string; onSmilesChange?: (s: string) => void }) {
  const [smiles, setSmiles] = useState(
    initialSmiles
      ? initialSmiles.split('\n').map(s => s.trim()).filter(Boolean)
      : defaultSmiles
  );
  const [moleculeNames, setMoleculeNames] = useState<Record<string, string>>({});

  // CSV state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows,    setCsvRows]    = useState<string[][]>([]);
  const [smilesCol,  setSmilesCol]  = useState('');
  const [nameCol,    setNameCol]    = useState('');
  const [csvVisible, setCsvVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Run state
  const [smilesToRender, setSmilesToRender] = useState<string[]>([]);
  const [allResults,     setAllResults]     = useState<{ [key: string]: any[] }>({});
  const [toolStatus,     setToolStatus]     = useState<{ [key: string]: ToolState }>({});
  const [activeTab,      setActiveTab]      = useState<'input' | 'results'>('input');
  const [isDrawerOpen,   setIsDrawerOpen]   = useState(false);
  const [expandedSmi,    setExpandedSmi]    = useState<string | null>(null);

  const namesRef = useRef(moleculeNames);
  useEffect(() => { namesRef.current = moleculeNames; }, [moleculeNames]);

  useEffect(() => {
    if (initialSmiles) setSmiles(initialSmiles.split('\n').map(s => s.trim()).filter(Boolean));
  }, [initialSmiles]);


  // ── CSV handlers ────────────────────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const content = csvTools.parseCSV(text);
      if (!content.length) return;
      const headers = content[0];
      const rows = content.slice(1).filter(r => r.some(c => c));
      setCsvHeaders(headers);
      setCsvRows(rows);
      setSmilesCol(csvTools.autoDetect(headers, /smiles/i) || headers[0]);
      setNameCol(csvTools.autoDetect(headers, /name|mol|compound|id/i));
      setCsvVisible(true);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  function importFromCSV() {
    const smiIdx  = csvHeaders.indexOf(smilesCol);
    const nameIdx = nameCol ? csvHeaders.indexOf(nameCol) : -1;
    if (smiIdx < 0) return;

    const newSmiles: string[] = [];
    const newNames: Record<string, string> = {};
    csvRows.forEach(row => {
      const smi = row[smiIdx]?.trim();
      if (!smi) return;
      newSmiles.push(smi);
      if (nameIdx >= 0 && row[nameIdx]?.trim()) newNames[smi] = row[nameIdx].trim();
    });

    // Update state then immediately run predictions
    setSmiles(newSmiles);
    onSmilesChange?.(newSmiles.join('\n'));
    setMoleculeNames(newNames);
    namesRef.current = newNames;

    // Run predictions with the imported list directly
    const list = newSmiles.filter(Boolean);
    const unique = [...new Set(list)];
    const init: { [key: string]: ToolState } = {};
    unique.forEach(smi => TOOLS.forEach(t => { init[`${smi}-${t}`] = 'queued'; }));
    setAllResults({});
    setToolStatus(init);
    setSmilesToRender(unique);
    setActiveTab('results');
  }

  // ── Run ─────────────────────────────────────────────────────────────────────
  const updateResults = (smi: string, tool: string, data: any[]) => {
    const name = namesRef.current[smi] ?? '';
    const enriched = name ? data.map(row => ({ ...row, Name: name })) : data;
    setAllResults(prev => ({ ...prev, [`${smi}-${tool}`]: enriched }));
    setToolStatus(prev => ({
      ...prev,
      [`${smi}-${tool}`]: data.length > 0 ? 'done' : 'error',
    }));
  };

  function loadSmiles() {
    const list = smiles.filter(Boolean);
    const unique = [...new Set(list)];
    const init: { [key: string]: ToolState } = {};
    unique.forEach(smi => TOOLS.forEach(t => { init[`${smi}-${t}`] = 'queued'; }));
    setAllResults({});
    setToolStatus(init);
    setSmilesToRender(unique);
    setActiveTab('results');
  }

  const uniqueSmiles  = [...new Set(smilesToRender)].filter(Boolean);

  // ── Queue: 1 molécula ativa de cada vez para não saturar o servidor ──────────
  useEffect(() => {
    if (activeTab !== 'results' || uniqueSmiles.length === 0) return;
    const anyLoading = uniqueSmiles.some(smi => TOOLS.some(t => toolStatus[`${smi}-${t}`] === 'loading'));
    if (anyLoading) return;
    const next = uniqueSmiles.find(smi => TOOLS.every(t => toolStatus[`${smi}-${t}`] === 'queued'));
    if (!next) return;
    setToolStatus(prev => {
      const up = { ...prev };
      TOOLS.forEach(t => { up[`${next}-${t}`] = 'loading'; });
      return up;
    });
  }, [activeTab, toolStatus, uniqueSmiles]);

  const totalExpected = uniqueSmiles.length * TOOLS.length;
  const doneCount     = Object.values(toolStatus).filter(s => s === 'done' || s === 'error').length;
  const percentage    = totalExpected > 0 ? Math.floor((doneCount / totalExpected) * 100) : 0;
  const isReady       = totalExpected > 0 && doneCount >= totalExpected;

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async (type: 'excel' | 'report') => {
    const flatData = Object.values(allResults).flat();
    if (!flatData.length) { alert('Nenhum dado disponível para exportar.'); return; }
    if (!isReady && type === 'report') {
      const ok = window.confirm(`Análise ${percentage}% concluída. Exportar relatório parcial?`);
      if (!ok) return;
    }
    const endpoint = type === 'excel' ? '/export/excel' : '/export/report';
    const filename  = type === 'excel'
      ? `ADMET_Data_${Date.now()}.xlsx`
      : `ADMET_Report_${Date.now()}.pdf`;
    const mime = type === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
    try {
      const res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flatData) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (err) {
      alert('Erro ao exportar. Verifique o servidor.');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '95%', maxWidth: '1200px' }}>
      {/* Tab nav */}
      <div style={{ display: 'flex', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
        {(['input', 'results'] as const).map(tab => (
          <button key={tab}
            disabled={tab === 'results' && !smilesToRender.length}
            onClick={() => setActiveTab(tab)}
            style={{ 
              backgroundColor: activeTab === tab ? '#1a3a5c' : '#e2e8f0', 
              color: activeTab === tab ? 'white' : '#475569', 
              border: 'none', 
              padding: '12px 24px', 
              borderRadius: '8px', 
              cursor: 'pointer',
              flex: '1 1 auto',
              fontWeight: 600,
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
          >
            <i className={tab === 'input' ? 'bi bi-input-cursor-text' : 'bi bi-bar-chart-fill'} style={{ marginRight: 7 }} />
            {tab === 'input' ? 'SMILES Input' : 'Results Dashboard'}
          </button>
        ))}
      </div>

      {/* ── Input tab ── */}
      {activeTab === 'input' && (
        <div>
          {/* ── Input mode toggle ── */}
          <div style={{ display: 'flex', gap: '0', marginBottom: '16px', border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden', width: 'fit-content' }}>
            {(['smiles', 'csv'] as const).map(mode => (
              <button key={mode}
                onClick={() => setCsvVisible(mode === 'csv')}
                style={{
                  padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                  backgroundColor: (mode === 'csv') === csvVisible ? '#1a3a5c' : '#f8f9fa',
                  color: (mode === 'csv') === csvVisible ? 'white' : '#475569',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                <i className={mode === 'smiles' ? 'bi bi-input-cursor-text' : 'bi bi-file-earmark-spreadsheet'}></i>
                {mode === 'smiles' ? 'SMILES manual' : 'Importar CSV'}
              </button>
            ))}
          </div>

          {/* ── SMILES mode ── */}
          {!csvVisible && (
            <>
              {Object.keys(moleculeNames).length > 0 && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#166534' }}>
                  <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }} />{Object.keys(moleculeNames).length} nomes carregados via CSV.{' '}
                  <button onClick={() => setMoleculeNames({})} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>Remover</button>
                </div>
              )}
              <label style={{ fontSize: '13px', color: '#475569', display: 'block', marginBottom: '6px' }}>
                SMILES para análise (máx. 20) — um por linha:
              </label>
              <textarea
                className="smiles-input"
                style={{ width: '100%', padding: '10px', fontSize: '14px', fontFamily: 'monospace', borderRadius: '6px', border: '1px solid #dee2e6' }}
                value={smiles.join('\n')}
                rows={7}
                onChange={e => setSmiles(e.target.value.split('\n'))}
                placeholder="Cole SMILES, um por linha..."
              />
              <div style={{ padding: '10px 0', display: 'flex', gap: '15px', alignItems: 'center' }}>
                <button onClick={loadSmiles}
                  style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 25px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                  <i className="bi bi-play-fill" style={{ marginRight: 6 }} />Run All Predictions
                </button>
                <button onClick={() => setIsDrawerOpen(true)}
                  style={{ backgroundColor: '#fff', color: '#007bff', border: '1px solid #007bff', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="bi bi-pencil-square"></i> Draw Structure
                </button>
              </div>
            </>
          )}

          {/* ── CSV mode ── */}
          {csvVisible && (
            <div>
              {csvHeaders.length === 0 ? (
                /* Drop zone — no file loaded yet */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const text = ev.target?.result as string;
                        const content = csvTools.parseCSV(text);
                        if (!content.length) return;
                        const headers = content[0];
                        const rows = content.slice(1).filter(r => r.some(c => c));
                        setCsvHeaders(headers);
                        setCsvRows(rows);
                        setSmilesCol(csvTools.autoDetect(headers, /smiles/i) || headers[0]);
                        setNameCol(csvTools.autoDetect(headers, /name|mol|compound|id/i));
                      };
                      reader.readAsText(file, 'UTF-8');
                    }
                  }}
                  style={{
                    border: '2px dashed #94a3b8', borderRadius: '10px', padding: '40px 20px',
                    textAlign: 'center', cursor: 'pointer', backgroundColor: '#f8fafc',
                    transition: 'border-color 0.2s',
                  }}>
                  <i className="bi bi-file-earmark-text" style={{ fontSize: '36px', color: '#94a3b8', marginBottom: '8px', display: 'block' }} />
                  <div style={{ fontWeight: 'bold', color: '#1a3a5c', marginBottom: '4px' }}>
                    Clique ou arraste um arquivo CSV / TSV / TXT
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Suporta vírgula, ponto-e-vírgula e tab como separador · UTF-8
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt"
                    style={{ display: 'none' }} onChange={handleFile} />
                </div>
              ) : (
                /* File loaded — show column selectors + preview */
                <div style={{ backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <strong style={{ color: '#1a3a5c' }}>
                      {csvRows.length} linhas detectadas — configure as colunas:
                    </strong>
                    <button onClick={() => { setCsvHeaders([]); setCsvRows([]); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#64748b', textDecoration: 'underline' }}>
                      Trocar arquivo
                    </button>
                  </div>

                  {/* Column selectors */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 'bold', minWidth: '160px' }}>
                      Coluna SMILES *
                      <select value={smilesCol} onChange={e => setSmilesCol(e.target.value)}
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '2px solid #1a3a5c', fontSize: '13px' }}>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 'bold', minWidth: '160px' }}>
                      Coluna Nome (opcional)
                      <select value={nameCol} onChange={e => setNameCol(e.target.value)}
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}>
                        <option value="">— nenhuma —</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  </div>

                  {/* Preview */}
                  <div style={{ overflowX: 'auto', maxHeight: '200px', overflowY: 'auto', marginBottom: '14px', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>{csvHeaders.map(h => (
                          <th key={h} style={{ padding: '6px 10px', backgroundColor: h === smilesCol ? '#1a3a5c' : h === nameCol ? '#0d9488' : '#475569', color: 'white', textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {h}{h === smilesCol ? ' ★' : h === nameCol ? ' ◆' : ''}
                          </th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 8).map((row, i) => (
                          <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#f8f9fa' : 'white' }}>
                            {row.map((cell, j) => (
                              <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid #dee2e6', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={cell}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvRows.length > 8 && (
                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                      Pré-visualizando 8 de {csvRows.length} linhas.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button onClick={importFromCSV}
                      style={{ backgroundColor: '#1a3a5c', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                      <i className="bi bi-play-fill" style={{ marginRight: 6 }} />Importar e rodar {csvRows.filter(r => r[csvHeaders.indexOf(smilesCol)]?.trim()).length} moléculas
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Results tab ── */}
      {activeTab === 'results' && (
        <>
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '10px', border: '1px solid #e0e0e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a3a5c' }}>
                {isReady
                  ? <><i className="bi bi-check-circle-fill" style={{ marginRight: 6, color: '#16a34a' }} />Analysis complete</>
                  : <><i className="bi bi-hourglass-split" style={{ marginRight: 6 }} />Analysing… {percentage}%</>
                }
              </span>
              <span style={{ fontSize: '13px', color: '#666' }}>
                {uniqueSmiles.length} molécula{uniqueSmiles.length !== 1 ? 's' : ''} · {TOOLS.length} tools each
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', height: '8px', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: isReady ? '#16a34a' : '#007bff', transition: 'width 0.4s ease', borderRadius: '4px' }} />
            </div>

            {/* Dashboard Overview — only after full analysis */}
            {isReady && (
              <Dashboard allResults={Object.values(allResults).flat()} uniqueSmiles={uniqueSmiles} moleculeNames={moleculeNames} />
            )}

            {/* Per-molecule status cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {uniqueSmiles.map(smi => {
                const name     = moleculeNames[smi];
                const isExpanded = expandedSmi === smi;
                const molDone  = TOOLS.every(t => toolStatus[`${smi}-${t}`] === 'done' || toolStatus[`${smi}-${t}`] === 'error');
                const molResults = Object.entries(allResults)
                  .filter(([k]) => k.startsWith(smi + '-'))
                  .flatMap(([, v]) => v);
                return (
                  <div key={smi} style={{ backgroundColor: 'white', borderRadius: '10px', border: `1px solid ${isExpanded ? '#0ea5e9' : '#e0e0e0'}`, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                    {/* Header — always visible */}
                    <div
                      onClick={() => molDone && setExpandedSmi(isExpanded ? null : smi)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', cursor: molDone ? 'pointer' : 'default', userSelect: 'none' }}
                    >
                      <MolImage smiles={smi} width={72} height={54} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {name && <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '2px' }}>{name}</div>}
                        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8', wordBreak: 'break-all', lineHeight: 1.4 }}>{smi}</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {TOOLS.map(tool => {
                            const state = toolStatus[`${smi}-${tool}`] ?? 'queued';
                            const iconCls = state === 'done' ? 'bi bi-check-circle-fill' : state === 'error' ? 'bi bi-x-circle-fill' : state === 'queued' ? 'bi bi-pause-circle' : 'bi bi-hourglass-split';
                            return (
                              <span key={tool} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                padding: '2px 8px', borderRadius: '20px', fontSize: '11px',
                                backgroundColor: state === 'done' ? '#dcfce7' : state === 'error' ? '#fee2e2' : state === 'queued' ? '#f8fafc' : '#f1f5f9',
                                color: state === 'done' ? '#16a34a' : state === 'error' ? '#dc2626' : state === 'queued' ? '#94a3b8' : '#64748b',
                                border: `1px solid ${TOOL_COLORS[tool]}22`,
                              }}>
                                <i className={iconCls} /> {tool}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      {molDone && (
                        <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} style={{ fontSize: '14px', color: '#94a3b8', flexShrink: 0 }} />
                      )}
                    </div>

                    {/* Expanded detail panel */}
                    {isExpanded && molResults.length > 0 && (
                      <div style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '12px 14px' }}>
                        {TOOLS.map(tool => {
                          const rows = molResults.filter(r => r && (r.Tool === tool || (tool === 'RDKit' && String(r.Tool).includes('RDKit'))));
                          if (!rows.length) return null;
                          return (
                            <div key={tool} style={{ marginBottom: '14px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: TOOL_COLORS[tool], textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                                {tool}
                              </div>
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Property</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Value</th>
                                      {rows.some(r => r.Probability != null) && (
                                        <th style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Probability</th>
                                      )}
                                      {rows.some(r => r.Unit) && (
                                        <th style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Unit</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r, ri) => {
                                      const prob = r.Probability != null ? parseFloat(r.Probability) : null;
                                      const isRisk = prob != null && prob >= 0.5;
                                      return (
                                        <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                          <td style={{ padding: '4px 8px', color: '#374151', fontWeight: 500 }}>{r.Property ?? r.Endpoint ?? '—'}</td>
                                          <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#0f172a' }}>{String(r.Value ?? '—')}</td>
                                          {rows.some(x => x.Probability != null) && (
                                            <td style={{ padding: '4px 8px', fontWeight: 700, color: isRisk ? '#dc2626' : prob != null && prob >= 0.3 ? '#d97706' : '#16a34a' }}>
                                              {prob != null ? `${(prob * 100).toFixed(0)}%` : '—'}
                                            </td>
                                          )}
                                          {rows.some(x => x.Unit) && (
                                            <td style={{ padding: '4px 8px', color: '#94a3b8', fontSize: '10px' }}>{r.Unit ?? '—'}</td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Export buttons */}
            {doneCount > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '20px' }}>
                <button onClick={() => handleExport('excel')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'transform 0.1s' }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <i className="bi bi-file-earmark-excel"></i>
                  {isReady ? 'Export Excel' : `Export Excel (${percentage}% complete)`}
                </button>
                <button onClick={() => handleExport('report')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#1a3a5c', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'transform 0.1s' }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <i className="bi bi-file-earmark-pdf"></i>
                  {isReady ? 'Export PDF Report' : `Export PDF Report (${percentage}% complete)`}
                </button>
              </div>
            )}
          </div>

          {/* Hidden runners */}
          <div style={{ display: 'none' }}>
            {uniqueSmiles.map(smi => {
              const isStarted = TOOLS.some(t => toolStatus[`${smi}-${t}`] === 'loading' || toolStatus[`${smi}-${t}`] === 'done' || toolStatus[`${smi}-${t}`] === 'error');
              if (!isStarted) return null;
              return (
                <div key={smi}>
                  <ToolErrorBoundary toolName="RDKit"     onError={() => updateResults(smi, 'RDKit',     [])}>
                    <RDKitFilters smiles={smi} onDataLoaded={d => updateResults(smi, 'RDKit', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="StopTox"   onError={() => updateResults(smi, 'StopTox',   [])}>
                    <Prediction smiles={smi} onDataLoaded={d => updateResults(smi, 'StopTox', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="StopLight" onError={() => updateResults(smi, 'StopLight', [])}>
                    <StopLight smiles={smi} onDataLoaded={d => updateResults(smi, 'StopLight', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="Tox21"     onError={() => updateResults(smi, 'Tox21',     [])}>
                    <Tox21 smiles={smi} onDataLoaded={d => updateResults(smi, 'Tox21', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="Deep ADMET" onError={() => updateResults(smi, 'Deep ADMET', [])}>
                    <DeepADMET smiles={smi} onDataLoaded={d => updateResults(smi, 'Deep ADMET', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="GraphB3"   onError={() => updateResults(smi, 'GraphB3',   [])}>
                    <GraphB3 smiles={smi} onDataLoaded={d => updateResults(smi, 'GraphB3', d)} />
                  </ToolErrorBoundary>
                </div>
              );
            })}
          </div>
        </>
      )}

      <MoleculeDrawerModal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onApply={smi => setSmiles(prev => {
          const cur = prev.filter(Boolean);
          return cur.length > 0 ? [...cur, smi] : [smi];
        })}
      />
    </div>
  );
}

export default PredictWithStopTox;
