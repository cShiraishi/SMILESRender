import React from 'react';
import { useState, useRef } from 'react';
import Section from '../components/Section';
import SmilesCard from '../components/SmilesCard';
import { downloadBlob } from '../tools/helpers';
import { colors, font, radius, shadow } from '../styles/themes';
import { parseCSV, autoDetect } from '../tools/csv';
import { PaperOptions, LabelPosition, CardSize, PaperTheme, defaultPaperOptions, cardSizes } from '../types/paper';

const defaultSmiles = [
  'CCCCCCCC',
  'C0CCCCC0C0CCCCC0',
  'N#N',
  'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H](O)[C@H](O)1',
];

const btnBase: React.CSSProperties = {
  fontFamily: font, fontSize: '13px', fontWeight: 500,
  padding: '8px 18px', borderRadius: radius.sm, cursor: 'pointer',
};

interface MolData {
  smiles: string;
  name?: string;
  mw?: number;
}

const HISTORY_KEY = 'smilerender_lib_history';

function loadHistory(): { label: string; mols: MolData[] }[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(entry: { label: string; mols: MolData[] }) {
  const hist = loadHistory();
  hist.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 5)));
}

function DirectInput({ initialSmiles, onNavigate }: { initialSmiles?: string; onNavigate?: (page: string, smiles?: string) => void }) {
  const initialData = initialSmiles 
    ? initialSmiles.split('\n').map(s => ({ smiles: s.trim() })).filter(m => m.smiles)
    : defaultSmiles.map(s => ({ smiles: s }));

  const [mols, setMols] = useState<MolData[]>(initialData);
  const [molsToRender, setMolsToRender] = useState<MolData[]>(initialData);
  const [displayMode, setDisplayMode] = useState<'grid' | 'paper' | 'scaffold'>('grid');
  const [scaffolds, setScaffolds] = useState<{ smiles: string; count: number }[]>([]);
  const [analyzingScaffolds, setAnalyzingScaffolds] = useState(false);
  const [paperOpts, setPaperOpts] = useState<PaperOptions>(defaultPaperOptions);
  const [error, setError] = useState(false);
  const [history] = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (initialSmiles) {
      const data = initialSmiles.split('\n').map(s => ({ smiles: s.trim() })).filter(m => m.smiles);
      setMols(data);
      setMolsToRender(data);
    }
  }, [initialSmiles]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        let extracted: MolData[] = [];
        if (file.name.toLowerCase().endsWith('.csv')) {
          const rows = parseCSV(content);
          if (rows.length < 2) return;
          const headers = rows[0].map(h => h.toLowerCase().trim());
          const smilesCol = autoDetect(headers, /smiles|smi|canonical|structure/i) || headers[0];
          const nameCol = autoDetect(headers, /name|nome|id|label|drug|molecule/i);
          const smilesIndex = headers.indexOf(smilesCol);
          const nameIndex = nameCol ? headers.indexOf(nameCol) : -1;
          if (smilesIndex === -1) { alert("SMILES column not found."); return; }
          extracted = rows.slice(1)
            .map(r => ({ smiles: (r[smilesIndex] || '').trim(), name: nameIndex !== -1 ? (r[nameIndex] || '').trim() : undefined }))
            .filter(m => m.smiles.length > 0);
        } else {
          extracted = content.split('\n').map(s => ({ smiles: s.trim() })).filter(m => m.smiles.length > 0);
        }
        setMols(extracted);
        setMolsToRender(extracted);
        fetchMWs(extracted);
        saveHistory({ label: file.name, mols: extracted });
      } catch (err) {
        console.error("Upload error:", err);
        setError(true);
      }
    };
    reader.readAsText(file);
  };

  const fetchMWs = async (data: MolData[]) => {
    try {
      const res = await fetch('/api/mw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles: data.map(m => m.smiles) }),
      });
      if (res.ok) {
        const mws: number[] = await res.json();
        const updated = data.map((m, i) => ({ ...m, mw: mws[i] }));
        setMols(updated);
        setMolsToRender(updated);
      }
    } catch {}
  };

  const loadSmiles = () => {
    setMolsToRender(mols);
    if (!mols[0]?.mw) fetchMWs(mols);
  };

  const downloadSmiles = () => {
    fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'png', smiles: mols.map(m => m.smiles) }),
    })
      .then(r => r.blob())
      .then(blob => downloadBlob({ name: 'smiles.zip', blob }))
      .catch(() => setError(true));
  };

  const exportPaperPNG = async () => {
    if (!paperRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(paperRef.current, {
      backgroundColor: paperOpts.bgColor === 'transparent' ? null : (paperOpts.theme === 'dark' ? '#1a1a2e' : '#ffffff'),
      scale: 2,
    });
    const link = document.createElement('a');
    link.download = `smilerender_paper_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const sendToADMET = () => {
    if (onNavigate) {
      onNavigate('predict', mols.map(m => m.smiles).join('\n'));
    }
  };

  const handleScaffoldAnalysis = async () => {
    if (mols.length === 0) return;
    setAnalyzingScaffolds(true);
    try {
      const res = await fetch('/api/scaffolds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles: mols.map(m => m.smiles) }),
      });
      if (res.ok) {
        const data = await res.json();
        setScaffolds(data);
        setDisplayMode('scaffold');
      }
    } catch (err) {
      console.error("Scaffold analysis error:", err);
    } finally {
      setAnalyzingScaffolds(false);
    }
  };

  const posOptions: { value: LabelPosition; label: string }[] = [
    { value: 'top-left', label: '↖ Top Left' },
    { value: 'top-center', label: '↑ Top Center' },
    { value: 'top-right', label: '↗ Top Right' },
    { value: 'bottom-left', label: '↙ Bottom Left' },
    { value: 'bottom-center', label: '↓ Bottom Center' },
    { value: 'bottom-right', label: '↘ Bottom Right' },
  ];

  const displayFields = [
    { key: 'showNumber', posKey: 'numberPos', label: '# Number' },
    { key: 'showName', posKey: 'namePos', label: 'Name' },
    { key: 'showMW', posKey: 'mwPos', label: 'MW' },
    { key: 'showSmiles', posKey: 'smilesPos', label: 'SMILES' },
  ];

  const selectStyle: React.CSSProperties = {
    fontSize: '11px', padding: '2px 4px',
    border: `1px solid ${colors.border}`, borderRadius: radius.sm,
    backgroundColor: colors.surface, color: colors.text,
    fontFamily: font, cursor: 'pointer',
  };

  return (
    <Section title="Direct Input">
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 0 }}>
            SMILES — one per line (max 20)
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <label style={{ ...btnBase, backgroundColor: colors.tealLight, color: colors.teal, border: `1px solid ${colors.teal}33`, padding: '4px 10px', fontSize: '11px', margin: 0, cursor: 'pointer' }}>
              <i className="bi bi-file-earmark-arrow-up me-1"></i> Upload CSV/TXT
              <input type="file" accept=".csv,.txt,.smi" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
            {history.length > 0 && (
              <button 
                onClick={() => setShowHistory(!showHistory)}
                style={{ ...btnBase, backgroundColor: colors.bg, color: colors.textMuted, border: `1px solid ${colors.border}`, padding: '4px 10px', fontSize: '11px' }}
              >
                <i className="bi bi-clock-history me-1"></i> History
              </button>
            )}
            <button 
              onClick={() => { setMols([]); setMolsToRender([]); }}
              style={{ ...btnBase, backgroundColor: colors.bg, color: colors.textMuted, border: `1px solid ${colors.border}`, padding: '4px 10px', fontSize: '11px' }}
            >
              <i className="bi bi-trash me-1"></i> Clear
            </button>
          </div>
        </div>

        {/* History dropdown */}
        {showHistory && (
          <div style={{ marginBottom: '8px', padding: '8px', backgroundColor: colors.bg, borderRadius: radius.sm, border: `1px solid ${colors.border}` }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase' }}>Recent Libraries</span>
            {history.map((h, i) => (
              <button key={i} onClick={() => { setMols(h.mols); setMolsToRender(h.mols); setShowHistory(false); fetchMWs(h.mols); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '4px 8px', fontSize: '12px', color: colors.text, cursor: 'pointer', borderRadius: radius.sm, fontFamily: font }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = colors.surface)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <i className="bi bi-file-earmark-text me-1" style={{ color: colors.textMuted }}></i>
                {h.label} <span style={{ color: colors.textMuted }}>({h.mols.length} mol)</span>
              </button>
            ))}
          </div>
        )}

        <textarea
          className="smiles-input"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 12px',
            fontFamily: 'monospace', fontSize: '13px',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: colors.bg,
            color: colors.text,
            resize: 'vertical',
            minHeight: '120px'
          }}
          value={mols.map(m => m.smiles).join('\n')}
          rows={6}
          onChange={e => setMols(e.target.value.split('\n').map(s => ({ smiles: s.trim() })))}
        />
        {error && (
          <p style={{ fontSize: '12px', color: colors.danger, margin: '8px 0 0' }}>
            <i className="bi bi-exclamation-triangle" style={{ marginRight: '4px' }}></i>
            Could not download. Check SMILES and try again.
          </p>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={loadSmiles} style={{ ...btnBase, backgroundColor: colors.blue, color: '#fff', border: 'none' }}>
              Render
            </button>
            <button onClick={downloadSmiles} style={{ ...btnBase, backgroundColor: colors.surface, color: colors.textMuted, border: `1px solid ${colors.border}` }}>
              <i className="bi bi-download" style={{ marginRight: '6px' }}></i>Download ZIP
            </button>
            {onNavigate && molsToRender.length > 0 && (
              <button onClick={sendToADMET} style={{ ...btnBase, backgroundColor: colors.teal, color: '#fff', border: 'none' }}>
                → Predict ADMET
              </button>
            )}
            {mols.length > 0 && (
              <button 
                onClick={handleScaffoldAnalysis} 
                disabled={analyzingScaffolds}
                style={{ ...btnBase, backgroundColor: colors.surface, color: colors.blue, border: `1px solid ${colors.blue}44` }}
              >
                {analyzingScaffolds ? <><i className="bi bi-hourglass-split me-1"></i> Analyzing...</> : <><i className="bi bi-diagram-3 me-1"></i> Scaffold Analysis</>}
              </button>
            )}
            {molsToRender.length > 0 && (
              <span style={{ fontSize: '11px', color: colors.textMuted, backgroundColor: colors.bg, padding: '4px 10px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontWeight: 600 }}>
                {molsToRender.length} molecule{molsToRender.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', backgroundColor: colors.bg, padding: '4px', borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
            <button 
              onClick={() => setDisplayMode('grid')}
              style={{ 
                ...btnBase, padding: '4px 10px', border: 'none', borderRadius: radius.sm,
                backgroundColor: displayMode === 'grid' ? colors.surface : 'transparent',
                boxShadow: displayMode === 'grid' ? shadow.sm : 'none',
                color: displayMode === 'grid' ? colors.blue : colors.textMuted
              }}
            >
              <i className="bi bi-grid-fill me-1"></i> Grid
            </button>
            <button 
              onClick={() => setDisplayMode('paper')}
              style={{ 
                ...btnBase, padding: '4px 10px', border: 'none', borderRadius: radius.sm,
                backgroundColor: displayMode === 'paper' ? colors.surface : 'transparent',
                boxShadow: displayMode === 'paper' ? shadow.sm : 'none',
                color: displayMode === 'paper' ? colors.blue : colors.textMuted
              }}
            >
              <i className="bi bi-file-earmark-medical me-1"></i> Paper
            </button>
            {scaffolds.length > 0 && (
              <button 
                onClick={() => setDisplayMode('scaffold')}
                style={{ 
                  ...btnBase, padding: '4px 10px', border: 'none', borderRadius: radius.sm,
                  backgroundColor: displayMode === 'scaffold' ? colors.surface : 'transparent',
                  boxShadow: displayMode === 'scaffold' ? shadow.sm : 'none',
                  color: displayMode === 'scaffold' ? colors.blue : colors.textMuted
                }}
              >
                <i className="bi bi-diagram-3-fill me-1"></i> Scaffolds
              </button>
            )}
          </div>
        </div>

        {/* Paper options panel */}
        {displayMode === 'paper' && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px',
            padding: '12px 14px', backgroundColor: colors.bg, borderRadius: radius.md,
            border: `1px solid ${colors.border}`, fontSize: '12px', color: colors.text,
            fontFamily: font
          }}>
            {/* Row 1: Display fields */}
            <div>
              <span style={{ fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em' }}>Display Options</span>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px' }}>
                {displayFields.map(opt => (
                  <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={(paperOpts as any)[opt.key]}
                        onChange={() => setPaperOpts(prev => ({ ...prev, [opt.key]: !(prev as any)[opt.key] }))}
                        style={{ accentColor: colors.blue, width: '14px', height: '14px' }}
                      />
                      {opt.label}
                    </label>
                    {(paperOpts as any)[opt.key] && (
                      <select value={(paperOpts as any)[opt.posKey]} onChange={e => setPaperOpts(prev => ({ ...prev, [opt.posKey]: e.target.value as LabelPosition }))} style={selectStyle}>
                        {posOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Row 2: Size, Theme, Background, Export */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${colors.border}`, paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 500 }}>Size:</span>
                {(['sm', 'md', 'lg'] as CardSize[]).map(s => (
                  <button key={s} onClick={() => setPaperOpts(prev => ({ ...prev, cardSize: s }))}
                    style={{
                      ...btnBase, padding: '2px 8px', fontSize: '11px', border: 'none', borderRadius: radius.sm,
                      backgroundColor: paperOpts.cardSize === s ? colors.blue : colors.surface,
                      color: paperOpts.cardSize === s ? '#fff' : colors.textMuted,
                      boxShadow: paperOpts.cardSize === s ? shadow.sm : 'none',
                    }}>
                    {cardSizes[s].label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 500 }}>Theme:</span>
                {(['light', 'dark'] as PaperTheme[]).map(t => (
                  <button key={t} onClick={() => setPaperOpts(prev => ({ ...prev, theme: t }))}
                    style={{
                      ...btnBase, padding: '2px 8px', fontSize: '11px', border: 'none', borderRadius: radius.sm,
                      backgroundColor: paperOpts.theme === t ? (t === 'dark' ? '#1a1a2e' : colors.blue) : colors.surface,
                      color: paperOpts.theme === t ? '#fff' : colors.textMuted,
                    }}>
                    {t === 'light' ? '☀ Light' : '🌙 Dark'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 500 }}>BG:</span>
                <select value={paperOpts.bgColor} onChange={e => setPaperOpts(prev => ({ ...prev, bgColor: e.target.value as any }))} style={selectStyle}>
                  <option value="white">White</option>
                  <option value="transparent">Transparent</option>
                </select>
              </div>

              <button onClick={exportPaperPNG} style={{ ...btnBase, backgroundColor: colors.success, color: '#fff', border: 'none', padding: '4px 12px', fontSize: '12px' }}>
                <i className="bi bi-image me-1"></i> Export PNG
              </button>
            </div>
          </div>
        )}

        {/* Render area */}
        <div ref={paperRef} style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: '20px',
          backgroundColor: displayMode === 'paper' ? (paperOpts.theme === 'dark' ? '#1a1a2e' : '#fff') : 'transparent',
          padding: displayMode === 'paper' ? '20px' : '0',
          borderRadius: displayMode === 'paper' ? radius.md : '0',
        }}>
          {displayMode === 'scaffold' ? (
            <div style={{ width: '100%' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, color: colors.text }}>Bemis-Murcko Scaffold Analysis</h3>
                <p style={{ color: colors.textMuted, fontSize: '14px' }}>Found {scaffolds.length} unique scaffolds in the library</p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '15px' }}>
                {scaffolds.map((s, i) => (
                  <div key={i} style={{ backgroundColor: colors.surface, padding: '15px', borderRadius: radius.md, border: `1px solid ${colors.border}`, textAlign: 'center', width: '220px', boxShadow: shadow.sm }}>
                    <SmilesCard smiles={s.smiles} mode="grid" />
                    <div style={{ marginTop: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>SMILES: </span>
                      <code style={{ fontSize: '10px', wordBreak: 'break-all', display: 'block', color: colors.blue }}>{s.smiles}</code>
                    </div>
                    <div style={{ marginTop: '8px', backgroundColor: colors.blue + '11', padding: '4px', borderRadius: radius.sm }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: colors.blue }}>{s.count} molecules</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            molsToRender.map((m, i) => <SmilesCard key={i} smiles={m.smiles} name={m.name} mw={m.mw} mode={displayMode === 'paper' ? 'paper' : 'grid'} index={i + 1} paperOptions={paperOpts} />)
          )}
        </div>
      </>
    </Section>
  );
}

export default DirectInput;
