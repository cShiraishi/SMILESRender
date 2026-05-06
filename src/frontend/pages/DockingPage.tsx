import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import MoleculeDrawerModal from '../components/MoleculeDrawerModal';
import { colors, radius, shadow, font } from '../styles/themes';
import { parseCSV, autoDetect, detectSmilesColumn } from '../tools/csv';

interface MolEntry {
  name: string;
  smiles: string;
  sdf_3d: string;
  energy: number | null;
  ff_used: string;
  status: 'pending' | 'ok' | 'failed' | 'invalid';
  error: string;
  props: any;
}

type InputMode = 'smiles' | 'name' | 'draw' | 'csv';

interface DockingPageProps {
  onBack: () => void;
  initialSmiles?: string;
}

const DockingPage: React.FC<DockingPageProps> = ({ onBack, initialSmiles }) => {
  const [entries, setEntries] = useState<MolEntry[]>([]);
  const [inputText, setInputText] = useState(initialSmiles || '');
  const [isPreparing, setIsPreparing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'simulation'>('overview');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('smiles');
  const [nameQuery, setNameQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [nameResult, setNameResult] = useState<{ smiles: string; iupac: string; mw: string } | null>(null);
  const [nameError, setNameError] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [exhaustiveness, setExhaustiveness] = useState(8);
  const [numModes, setNumModes] = useState(9);

  // Docking Simulation State
  const [receptor, setReceptor] = useState<{ id: string, path: string, content: string } | null>(null);
  const [isLoadingReceptor, setIsLoadingReceptor] = useState(false);
  const [grid, setGrid] = useState({ cx: 0, cy: 0, cz: 0, sx: 20, sy: 20, sz: 20 });
  const [dockingResults, setDockingResults] = useState<any[]>([]);
  const [isDocking, setIsDocking] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [plipData, setPlipData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [boxColor, setBoxColor] = useState('yellow');
  const [targetLigand, setTargetLigand] = useState('');
  const [targetChain, setTargetChain] = useState('');

  const [config, setConfig] = useState({
    remove_salts: true,
    neutralize: true,
    canon_tautomer: false,
    ff: 'MMFF94',
    max_iters: 2000
  });

  const handleLoad = async (textToLoad?: string) => {
    const text = textToLoad || inputText;
    if (!text.trim()) return;
    try {
      const res = await fetch('/api/libprep/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, method: 'smiles' })
      });
      const data = await res.json();
      setEntries(data);
      if (data.length > 0) setSelectedIdx(0);
    } catch (err) {
      alert('Error loading library');
    }
  };

  const handleLoadReceptor = async (id: string) => {
    if (!id || id.length !== 4) return;
    setIsLoadingReceptor(true);
    try {
      const res = await fetch('/api/docking/receptor/load-pdb-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pdbId: id,
          ligandId: targetLigand.trim() || null,
          chainId: targetChain.trim() || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setReceptor({ id: data.pdbId, path: data.pdbPath, content: data.pdbContent, pocket: data.pocket });
        if (data.pocket && data.pocket.success) {
          setGrid({
            cx: data.pocket.center.x, cy: data.pocket.center.y, cz: data.pocket.center.z,
            sx: data.pocket.size.x, sy: data.pocket.size.y, sz: data.pocket.size.z
          });
        }
      } else {
        alert(data.error || 'Failed to load receptor');
      }
    } catch (err) {
      alert('Network error loading receptor');
    } finally {
      setIsLoadingReceptor(false);
    }
  };
  const handleAddInhibitorForRedocking = async () => {
    if (!receptor || !receptor.pocket?.inhibitor) return;
    try {
      const res = await fetch('/api/docking/receptor/extract-inhibitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pdbId: receptor.id, 
          resName: receptor.pocket.inhibitor,
          chainId: receptor.pocket.chain
        })
      });
      const data = await res.json();
      if (data.success) {
        appendSmiles(data.smiles, data.name);
        alert(`Added ${data.name} to library for Redocking!`);
      } else {
        alert(data.error || 'Failed to extract inhibitor');
      }
    } catch (err) {
      alert('Network error extracting inhibitor');
    }
  };

  const runDocking = async (idx: number) => {
    if (!receptor || !entries[idx]) return;
    setIsDocking(true);
    try {
      const res = await fetch('/api/docking/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receptorPath: receptor.path,
          smiles: entries[idx].smiles,
          center: { x: grid.cx, y: grid.cy, z: grid.cz },
          size: { x: grid.sx, y: grid.sy, z: grid.sz },
          exhaustiveness,
          numModes
        })
      });
      const data = await res.json();
      if (data.success) {
        setDockingResults(data.scores);
        setSessionInfo(data);
        setPlipData(null);
      } else {
        alert(data.error || 'Docking failed');
      }
    } catch (err) {
      alert('Network error during docking');
    } finally {
      setIsDocking(false);
    }
  };

  const handleAnalyze = async () => {
    if (!sessionInfo?.complexPath) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/docking/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          complexPath: sessionInfo.complexPath,
          smiles: entries[selectedIdx].smiles
        })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else setPlipData(data);
    } catch (err) {
      alert('Error running PLIP analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadResults = () => {
    if (!sessionInfo?.sessionId) return;
    window.location.href = `/api/docking/download?session=${sessionInfo.sessionId}`;
  };

  React.useEffect(() => {
    if (initialSmiles) {
      handleLoad(initialSmiles);
    }
  }, [initialSmiles]);

  const handleNameSearch = async () => {
    if (!nameQuery.trim()) return;
    setIsSearching(true);
    setNameError('');
    setNameResult(null);
    try {
      const res = await fetch('/api/pubchem/name-to-smiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameQuery.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.error || 'Not found');
      } else {
        setNameResult(data);
      }
    } catch (err) {
      setNameError('Network error');
    } finally {
      setIsSearching(false);
    }
  };

  const appendSmiles = (smiles: string, label?: string) => {
    const line = label ? `${smiles} ${label}` : smiles;
    setInputText(prev => prev ? `${prev.trim()}\n${line}` : line);
    setInputMode('smiles');
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const rows = parseCSV(content);
        if (rows.length < 2) return;

        const smilesIndex = detectSmilesColumn(rows);
        if (smilesIndex === -1) { alert("SMILES column not found in CSV."); return; }

        const headers = rows[0].map((h: string) => h.replace(/^\ufeff/, '').trim().toLowerCase());
        const nameCol = autoDetect(headers, /name|nome|id|label|drug|molecule/i);
        const nameIndex = nameCol ? headers.indexOf(nameCol) : -1;

        const formattedStr = rows.slice(1)
          .map((r: string[]) => {
            const s = (r[smilesIndex] || '').trim();
            const n = nameIndex !== -1 ? (r[nameIndex] || '').trim().replace(/\n/g, ' ') : '';
            return s ? `${s} ${n}`.trim() : '';
          })
          .filter((s: string) => s.length > 0)
          .join('\n');

        setInputText(formattedStr);
        handleLoad(formattedStr);
        setInputMode('smiles');
      } catch (err) {
        alert("Failed to parse CSV file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePrepare = async () => {
    setIsPreparing(true);
    try {
      const res = await fetch('/api/libprep/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, config })
      });
      const data = await res.json();
      setEntries(data);
    } catch (err) {
      alert('Error preparing library');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleExport = async (format: string) => {
    try {
      const res = await fetch('/api/libprep/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, format })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `library_export_${format}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('Error exporting library');
    }
  };

  const render3DViewer = () => {
    if (!receptor) return (
      <div style={{
        height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.bg, borderRadius: radius.md, border: `1px dashed ${colors.border}`,
        color: colors.textMuted, fontSize: '14px'
      }}>
        No structure loaded. Use Fetch Receptor to begin.
      </div>
    );

    // Use the dedicated viewer route
    const viewerUrl = `/api/docking/viewer?pdb=${receptor.id}&cx=${grid.cx}&cy=${grid.cy}&cz=${grid.cz}&sx=${grid.sx}&sy=${grid.sy}&sz=${grid.sz}&color=${boxColor}`.replace(/,/g, '.');

    return (
      <div style={{ position: 'relative' }}>
        <iframe 
          key={receptor.id + grid.cx} // Force refresh
          src={viewerUrl} 
          style={{ width: '100%', height: '400px', border: `1px solid ${colors.border}`, borderRadius: radius.md, backgroundColor: 'white' }} 
        />
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', gap: '5px' }}>
             <button
              onClick={() => window.open(viewerUrl, "_blank")}
              style={{
                padding: '4px 8px', fontSize: '10px', fontWeight: 600,
                backgroundColor: 'rgba(255,255,255,0.8)', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer'
              }}
            >
              <i className="bi bi-arrows-fullscreen"></i> Full View
            </button>
        </div>
      </div>
    );
  };

  const inputModeBtn = (mode: InputMode, icon: string, label: string) => (
    <button
      onClick={() => setInputMode(mode)}
      style={{
        flex: 1, padding: '7px 4px', border: 'none', borderRadius: radius.md, fontSize: '12px',
        fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
        backgroundColor: inputMode === mode ? '#14b8a6' : colors.bg,
        color: inputMode === mode ? '#fff' : colors.textMuted,
      }}
    >
      <i className={`bi ${icon}`} style={{ marginRight: '4px' }}></i>{label}
    </button>
  );

  return (
    <PageShell
      icon="bi-box-arrow-in-right"
      title="Docking LibPrep"
      subtitle="Prepare molecular libraries for virtual screening"
      accentColor="#14b8a6"
      onBack={onBack}
    >
      <MoleculeDrawerModal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onApply={(smiles) => appendSmiles(smiles, 'drawn')}
      />

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {/* Sidebar */}
        <div style={{ flex: '0 0 320px' }}>
          <div style={{ backgroundColor: colors.surface, padding: '24px', borderRadius: radius.lg, boxShadow: shadow.md, border: `1px solid ${colors.border}` }}>
            <h6 style={{ fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-folder2-open" style={{ color: '#14b8a6' }}></i> Load Library
            </h6>

            {/* Input mode switcher */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', backgroundColor: colors.bg, padding: '4px', borderRadius: radius.md }}>
              {inputModeBtn('smiles', 'bi-code', 'SMILES')}
              {inputModeBtn('csv', 'bi-file-earmark-spreadsheet', 'CSV/Excel')}
              {inputModeBtn('name', 'bi-search', 'Name')}
              {inputModeBtn('draw', 'bi-pencil', 'Draw')}
            </div>

            {/* SMILES mode */}
            {inputMode === 'smiles' && (
              <>
                <textarea
                  style={{
                    width: '100%', padding: '12px', borderRadius: radius.md, border: `1px solid ${colors.border}`,
                    fontSize: '13px', fontFamily: 'monospace', marginBottom: '12px', minHeight: '140px', outline: 'none',
                    resize: 'vertical'
                  }}
                  placeholder={"Paste SMILES (one per line)\nOptional: SMILES name"}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                />
                <button
                  style={{
                    width: '100%', padding: '10px', backgroundColor: colors.blue, color: '#fff', border: 'none',
                    borderRadius: radius.md, fontWeight: 600, cursor: 'pointer', marginBottom: '24px'
                  }}
                  onClick={() => handleLoad()}
                >
                  Load SMILES
                </button>
              </>
            )}

            {inputMode === 'csv' && (
              <div style={{ marginBottom: '24px' }}>
                <div
                  style={{
                    padding: '32px 16px', backgroundColor: colors.bg, borderRadius: radius.lg,
                    border: `2px dashed ${colors.border}`, marginBottom: '16px', cursor: 'pointer',
                    textAlign: 'center', transition: 'all 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.borderColor = '#14b8a6'}
                  onMouseOut={e => e.currentTarget.style.borderColor = colors.border}
                  onClick={() => document.getElementById('csv-file-input')?.click()}
                >
                  <i className="bi bi-file-earmark-arrow-up" style={{ fontSize: '32px', color: '#14b8a6', display: 'block', marginBottom: '8px' }}></i>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: colors.navy, marginBottom: '4px' }}>Upload Molecule Library</p>
                  <p style={{ fontSize: '11px', color: colors.textMuted, marginBottom: '16px' }}>
                    Supports <b>.csv, .txt, .smi</b><br />
                    Auto-detects SMILES and Names
                  </p>
                  <button
                    style={{
                      padding: '8px 20px', backgroundColor: '#14b8a6', color: '#fff', border: 'none',
                      borderRadius: radius.md, fontWeight: 700, cursor: 'pointer', fontSize: '12px'
                    }}
                  >
                    Browse Files
                  </button>
                  <input
                    id="csv-file-input"
                    type="file"
                    accept=".csv,.txt,.smi"
                    style={{ display: 'none' }}
                    onChange={handleCSVUpload}
                  />
                </div>

                {inputText && (
                  <div style={{
                    padding: '12px', backgroundColor: '#f0fdf4', borderRadius: radius.md,
                    border: '1px solid #bbf7d0', fontSize: '12px', color: '#166534'
                  }}>
                    <div style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span><i className="bi bi-check-circle-fill" style={{ marginRight: '6px' }}></i> File loaded</span>
                      <span>{inputText.trim().split('\n').length} mols</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#15803d', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inputText.split('\n')[0]}...
                    </div>
                    <button
                      onClick={() => handleLoad()}
                      style={{
                        width: '100%', marginTop: '10px', padding: '8px',
                        backgroundColor: '#166534', color: '#fff', border: 'none',
                        borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '11px'
                      }}
                    >
                      Process Now
                    </button>
                  </div>
                )}
              </div>
            )}
            {inputMode === 'name' && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    value={nameQuery}
                    onChange={e => { setNameQuery(e.target.value); setNameError(''); setNameResult(null); }}
                    onKeyDown={e => e.key === 'Enter' && handleNameSearch()}
                    placeholder="e.g. aspirin, ibuprofen..."
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border}`,
                      fontSize: '13px', outline: 'none'
                    }}
                  />
                  <button
                    onClick={handleNameSearch}
                    disabled={isSearching || !nameQuery.trim()}
                    style={{
                      padding: '9px 14px', backgroundColor: '#14b8a6', color: '#fff', border: 'none',
                      borderRadius: radius.md, fontWeight: 600, cursor: 'pointer', flexShrink: 0
                    }}
                  >
                    {isSearching ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-search"></i>}
                  </button>
                </div>

                {nameError && (
                  <div style={{ padding: '10px 12px', backgroundColor: '#fef2f2', borderRadius: radius.md, fontSize: '12px', color: colors.danger, marginBottom: '8px' }}>
                    <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: '6px' }}></i>{nameError}
                  </div>
                )}

                {nameResult && (
                  <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: radius.md, border: `1px solid #bbf7d0`, fontSize: '12px' }}>
                    <div style={{ fontWeight: 700, color: colors.navy, marginBottom: '4px' }}>{nameResult.iupac}</div>
                    <div style={{ fontFamily: 'monospace', color: colors.textMuted, marginBottom: '4px', wordBreak: 'break-all' }}>{nameResult.smiles}</div>
                    {nameResult.mw && <div style={{ color: colors.textMuted }}>MW: {nameResult.mw} Da</div>}
                    <button
                      onClick={() => {
                        appendSmiles(nameResult!.smiles, nameResult!.iupac);
                        setNameQuery('');
                        setNameResult(null);
                      }}
                      style={{
                        marginTop: '10px', width: '100%', padding: '8px', backgroundColor: '#14b8a6',
                        color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 600, cursor: 'pointer', fontSize: '12px'
                      }}
                    >
                      <i className="bi bi-plus-circle" style={{ marginRight: '6px' }}></i>Add to Library
                    </button>
                  </div>
                )}

                {!nameResult && !nameError && (
                  <p style={{ fontSize: '11px', color: colors.textMuted, textAlign: 'center', marginTop: '8px' }}>
                    Search by common name, IUPAC name, or synonym via PubChem
                  </p>
                )}
              </div>
            )}

            {/* Draw mode */}
            {inputMode === 'draw' && (
              <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                <div style={{
                  padding: '32px 16px', backgroundColor: colors.bg, borderRadius: radius.md,
                  border: `2px dashed ${colors.border}`, marginBottom: '12px'
                }}>
                  <i className="bi bi-pencil-square" style={{ fontSize: '36px', color: '#14b8a6', display: 'block', marginBottom: '12px' }}></i>
                  <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '14px' }}>
                    Open the molecular sketcher to draw a structure. The SMILES will be added to your library.
                  </p>
                  <button
                    onClick={() => setIsDrawerOpen(true)}
                    style={{
                      padding: '10px 20px', backgroundColor: '#14b8a6', color: '#fff', border: 'none',
                      borderRadius: radius.md, fontWeight: 700, cursor: 'pointer', fontSize: '13px'
                    }}
                  >
                    <i className="bi bi-pencil" style={{ marginRight: '8px' }}></i>Open Sketcher
                  </button>
                </div>
                {inputText && (
                  <p style={{ fontSize: '11px', color: colors.success }}>
                    <i className="bi bi-check-circle" style={{ marginRight: '4px' }}></i>
                    {inputText.trim().split('\n').length} molecule(s) in queue
                  </p>
                )}
              </div>
            )}

            {/* Current queue count (shown in all modes) */}
            {inputText && inputMode !== 'smiles' && (
              <div style={{ marginBottom: '12px' }}>
                <button
                  onClick={() => setInputMode('smiles')}
                  style={{
                    width: '100%', padding: '8px', backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`, borderRadius: radius.md,
                    fontSize: '12px', color: colors.textMuted, cursor: 'pointer'
                  }}
                >
                  <i className="bi bi-list-ul" style={{ marginRight: '6px' }}></i>
                  View / edit queue ({inputText.trim().split('\n').length} entries)
                </button>
              </div>
            )}

            {/* Load button for non-smiles modes */}
            {inputMode !== 'smiles' && (
              <button
                style={{
                  width: '100%', padding: '10px', backgroundColor: inputText ? colors.blue : colors.textMuted,
                  color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 600,
                  cursor: inputText ? 'pointer' : 'default', marginBottom: '24px'
                }}
                onClick={handleLoad}
                disabled={!inputText}
              >
                Load Library ({inputText.trim().split('\n').filter(Boolean).length} entries)
              </button>
            )}

            <div style={{ height: '1px', backgroundColor: colors.border, margin: '0 -24px 24px' }}></div>

            <h6 style={{ fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-gear" style={{ color: colors.warning }}></i> Preparation
            </h6>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textMuted, marginBottom: '6px' }}>Force Field</label>
              <select
                style={{ width: '100%', padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '13px' }}
                value={config.ff}
                onChange={e => setConfig({ ...config, ff: e.target.value })}
              >
                <option value="MMFF94">MMFF94 (Best for Drugs)</option>
                <option value="MMFF94s">MMFF94s</option>
                <option value="UFF">UFF (General)</option>
              </select>
            </div>
            <button
              style={{
                width: '100%', padding: '12px', backgroundColor: isPreparing ? colors.textMuted : colors.success, color: '#fff',
                border: 'none', borderRadius: radius.md, fontWeight: 700, cursor: isPreparing ? 'default' : 'pointer', marginBottom: '24px'
              }}
              onClick={handlePrepare}
              disabled={isPreparing || entries.length === 0}
            >
              {isPreparing ? (
                <><span className="spinner-border spinner-border-sm me-2"></span> Preparing...</>
              ) : '▶ Prepare Library'}
            </button>

            <div style={{ height: '1px', backgroundColor: colors.border, margin: '0 -24px 24px' }}></div>

            <h6 style={{ fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-download" style={{ color: colors.blue }}></i> Export
            </h6>
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
              <button
                style={{
                  padding: '8px', backgroundColor: '#f8fafc', color: colors.text, border: `1px solid ${colors.border}`,
                  borderRadius: radius.md, fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                }}
                onClick={() => handleExport('pdbqt')}
              >
                PDBQT ZIP (Docking)
              </button>
              <button
                style={{
                  padding: '8px', backgroundColor: '#f8fafc', color: colors.text, border: `1px solid ${colors.border}`,
                  borderRadius: radius.md, fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                }}
                onClick={() => handleExport('sdf')}
              >
                SDF (3D Library)
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, minWidth: '400px' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
            {['overview', 'simulation'].map((tab: any) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 20px', border: 'none', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
                  backgroundColor: activeTab === tab ? colors.navy : 'transparent',
                  color: activeTab === tab ? '#fff' : colors.textMuted,
                  transition: 'all 0.2s ease', textTransform: 'capitalize'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div style={{ backgroundColor: colors.surface, padding: '32px', borderRadius: radius.lg, boxShadow: shadow.lg, border: `1px solid ${colors.border}`, minHeight: '500px' }}>
            {activeTab === 'overview' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.borderLight}`, textAlign: 'left' }}>
                      <th style={{ padding: '12px', color: colors.textMuted }}>Name</th>
                      <th style={{ padding: '12px', color: colors.textMuted }}>Status</th>
                      <th style={{ padding: '12px', color: colors.textMuted }}>SMILES</th>
                      <th style={{ padding: '12px', color: colors.textMuted }}>MW</th>
                      <th style={{ padding: '12px', color: colors.textMuted }}>LogP</th>
                      <th style={{ padding: '12px', color: colors.textMuted }}>Ro5</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={i}
                        onClick={() => { setSelectedIdx(i); setActiveTab('simulation'); }}
                        style={{ borderBottom: `1px solid ${colors.borderLight}`, cursor: 'pointer', backgroundColor: selectedIdx === i ? '#f0f9ff' : 'transparent' }}
                      >
                        <td style={{ padding: '12px', fontWeight: 600 }}>{e.name}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                            backgroundColor: e.status === 'ok' ? colors.successBg : e.status === 'pending' ? colors.bg : colors.dangerBg,
                            color: e.status === 'ok' ? colors.success : e.status === 'pending' ? colors.textMuted : colors.danger
                          }}>
                            {e.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: colors.textMuted, fontFamily: 'monospace', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.smiles}
                        </td>
                        <td style={{ padding: '12px' }}>{e.props?.ExactMW || '-'}</td>
                        <td style={{ padding: '12px' }}>{e.props?.LogP || '-'}</td>
                        <td style={{ padding: '12px' }}>{e.props?.Lipinski_Ro5 || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entries.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '80px 0', color: colors.textLight }}>
                    <i className="bi bi-inbox" style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}></i>
                    No molecules loaded. Use the sidebar to start.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'simulation' && (
              <div>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Receptor PDB ID</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        id="pdb-id-input"
                        type="text"
                        placeholder="e.g. 5KIR"
                        style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border}` }}
                        onKeyDown={e => e.key === 'Enter' && handleLoadReceptor(e.currentTarget.value)}
                      />
                      <input
                        type="text"
                        placeholder="Ligand ID (e.g. RCX)"
                        value={targetLigand}
                        onChange={e => setTargetLigand(e.target.value.toUpperCase())}
                        style={{ width: '150px', padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border}` }}
                      />
                      <input
                        type="text"
                        placeholder="Chain"
                        value={targetChain}
                        onChange={e => setTargetChain(e.target.value.toUpperCase())}
                        style={{ width: '70px', padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border}` }}
                      />
                      <button
                        onClick={() => handleLoadReceptor((document.getElementById('pdb-id-input') as HTMLInputElement).value)}
                        disabled={isLoadingReceptor}
                        style={{ padding: '10px 20px', backgroundColor: colors.navy, color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 700 }}
                      >
                        {isLoadingReceptor ? 'Loading...' : 'Fetch Receptor'}
                      </button>
                    </div>
                  </div>
                  {receptor && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ padding: '10px', backgroundColor: colors.successBg, border: `1px solid ${colors.success}`, borderRadius: radius.md, fontSize: '12px', color: colors.success }}>
                        <i className="bi bi-check-circle-fill me-2"></i> Receptor <b>{receptor.id}</b> Loaded
                      </div>
                      {receptor.pocket?.inhibitor && (
                        <button
                          onClick={handleAddInhibitorForRedocking}
                          style={{
                            padding: '8px 12px', backgroundColor: '#fef3c7', color: '#92400e',
                            border: '1px solid #fde68a', borderRadius: radius.md, fontSize: '11px',
                            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                          }}
                        >
                          <i className="bi bi-magic"></i> Add Inhibitor ({receptor.pocket.inhibitor}) for Redocking
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {receptor && (
                  <div style={{ display: 'flex', gap: '24px' }}>
                    <div style={{ flex: '1 1 500px' }}>
                      <h6 style={{ fontWeight: 700, marginBottom: '12px' }}>Grid Box Configuration</h6>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                        {['cx', 'cy', 'cz'].map(k => (
                          <div key={k}>
                            <label style={{ fontSize: '11px', color: colors.textMuted }}>Center {k.slice(1).toUpperCase()}</label>
                            <input type="number" step="0.1" value={(grid as any)[k]} onChange={e => setGrid({ ...grid, [k]: parseFloat(e.target.value) })}
                              style={{ width: '100%', padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}` }} />
                          </div>
                        ))}
                        {['sx', 'sy', 'sz'].map(k => (
                          <div key={k}>
                            <label style={{ fontSize: '11px', color: colors.textMuted }}>Size {k.slice(1).toUpperCase()}</label>
                            <input type="number" step="1" value={(grid as any)[k]} onChange={e => setGrid({ ...grid, [k]: parseFloat(e.target.value) })}
                              style={{ width: '100%', padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}` }} />
                          </div>
                        ))}
                        <div>
                          <label style={{ fontSize: '11px', color: colors.textMuted }}>Box Color</label>
                          <select 
                            value={boxColor} 
                            onChange={e => setBoxColor(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '12px' }}
                          >
                            <option value="yellow">Yellow</option>
                            <option value="lime">Lime Green</option>
                            <option value="red">Red</option>
                            <option value="cyan">Cyan</option>
                            <option value="magenta">Magenta</option>
                            <option value="blue">Blue</option>
                            <option value="orange">Orange</option>
                          </select>
                        </div>
                      </div>
                      {render3DViewer()}
                    </div>
                    <div style={{ flex: '0 0 300px' }}>
                      <h6 style={{ fontWeight: 700, marginBottom: '12px' }}>Docking Controls</h6>
                      <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '16px' }}>
                        Selected: <b>{entries[selectedIdx]?.name || 'None'}</b>
                      </p>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: colors.textMuted, marginBottom: '4px' }}>Exhaustiveness</label>
                          <input type="number" min="1" max="64" value={exhaustiveness} onChange={e => setExhaustiveness(parseInt(e.target.value))}
                            style={{ width: '100%', padding: '8px', border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: '13px' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: colors.textMuted, marginBottom: '4px' }}>Max Poses</label>
                          <input type="number" min="1" max="20" value={numModes} onChange={e => setNumModes(parseInt(e.target.value))}
                            style={{ width: '100%', padding: '8px', border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: '13px' }} />
                        </div>
                      </div>
                      <button 
                        onClick={() => runDocking(selectedIdx)}
                        disabled={isDocking || !receptor || entries.length === 0}
                        style={{ width: '100%', padding: '12px', backgroundColor: colors.success, color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 700, fontSize: '14px', marginBottom: '12px', marginTop: '16px' }}
                      >
                        {isDocking ? 'Simulating...' : '▶ Run AutoDock Vina'}
                      </button>

                      {sessionInfo && (
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                          <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            style={{ flex: 1, padding: '8px', backgroundColor: colors.navy, color: '#fff', border: 'none', borderRadius: radius.md, fontSize: '11px', fontWeight: 700 }}
                          >
                            {isAnalyzing ? 'Analyzing...' : '🔍 PLIP Analysis'}
                          </button>
                          <button
                            onClick={handleDownloadResults}
                            style={{ flex: 1, padding: '8px', backgroundColor: colors.blue, color: '#fff', border: 'none', borderRadius: radius.md, fontSize: '11px', fontWeight: 700 }}
                          >
                            <i className="bi bi-download me-1"></i> Results.zip
                          </button>
                        </div>
                      )}

                      {dockingResults.length > 0 && (
                        <div style={{ marginTop: '0' }}>
                          <h6 style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px' }}>Results (Scores)</h6>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                            {dockingResults.map((r, i) => (
                              <div key={i} style={{ padding: '10px', backgroundColor: i === 0 ? '#f0fdf4' : colors.bg, border: `1px solid ${i === 0 ? colors.success : colors.border}`, borderRadius: radius.md, display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>Pose {r.mode}</span>
                                <span style={{ color: colors.danger, fontWeight: 700 }}>{r.affinity} kcal/mol</span>
                              </div>
                            ))}
                          </div>
                          
                          {sessionInfo?.le > 0 && (
                            <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: radius.md, border: '1px solid #bfdbfe', marginBottom: '20px' }}>
                               <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700, marginBottom: '2px' }}>LIGAND EFFICIENCY (LE)</div>
                               <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e40af' }}>{sessionInfo.le} <span style={{ fontSize: '11px', fontWeight: 400 }}>kcal/mol/HA</span></div>
                               <p style={{ fontSize: '10px', color: '#60a5fa', marginTop: '4px' }}>Higher is better. > 0.3 is considered a good lead.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {plipData?.diagram && (
                        <div style={{ marginTop: '24px', backgroundColor: '#fff', padding: '16px', borderRadius: radius.md, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
                          <h6 style={{ fontWeight: 700, fontSize: '13px', marginBottom: '12px' }}>2D Interaction Map</h6>
                          <div dangerouslySetInnerHTML={{ __html: plipData.diagram }} style={{ maxWidth: '100%' }} />
                        </div>
                      )}

                      {plipData && (
                        <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
                          <h6 style={{ fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>Structural Interactions</h6>
                          {plipData.interactions.hbonds.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <p style={{ fontSize: '10px', fontWeight: 700, color: colors.success, marginBottom: '4px' }}>Hydrogen Bonds</p>
                              {plipData.interactions.hbonds.map((h: any, i: number) => (
                                <div key={i} style={{ fontSize: '10px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '2px 0' }}>
                                  <span>{h.residue}</span>
                                  <span>{h.dist} Å</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {plipData.interactions.hydrophobic.length > 0 && (
                            <div>
                              <p style={{ fontSize: '10px', fontWeight: 700, color: colors.navy, marginBottom: '4px' }}>Hydrophobic</p>
                              {plipData.interactions.hydrophobic.map((h: any, i: number) => (
                                <div key={i} style={{ fontSize: '10px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '2px 0' }}>
                                  <span>{h.residue}</span>
                                  <span>{h.dist} Å</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default DockingPage;
