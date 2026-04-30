import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import MoleculeDrawerModal from '../components/MoleculeDrawerModal';
import { colors, radius, shadow, font } from '../styles/themes';

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

type InputMode = 'smiles' | 'name' | 'draw';

const DockingPage: React.FC = () => {
  const [entries, setEntries] = useState<MolEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'inspector'>('overview');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('smiles');
  const [nameQuery, setNameQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [nameResult, setNameResult] = useState<{ smiles: string; iupac: string; mw: string } | null>(null);
  const [nameError, setNameError] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [config, setConfig] = useState({
    remove_salts: true,
    neutralize: true,
    canon_tautomer: false,
    ff: 'MMFF94',
    max_iters: 2000
  });

  const handleLoad = async () => {
    try {
      const res = await fetch('/api/libprep/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, method: 'smiles' })
      });
      const data = await res.json();
      setEntries(data);
      if (data.length > 0) setSelectedIdx(0);
    } catch (err) {
      alert('Error loading library');
    }
  };

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

  const render3D = (sdf: string) => {
    if (!sdf) return (
      <div style={{
        height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.bg, borderRadius: radius.md, border: `1px dashed ${colors.border}`,
        color: colors.textMuted, fontSize: '14px'
      }}>
        No 3D structure. Please click "Prepare Library" first.
      </div>
    );

    const b64 = btoa(sdf);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.3/jquery.min.js"></script>
        <script src="https://3dmol.org/build/3Dmol-min.js"></script>
      </head>
      <body style="margin:0; background:#ffffff; overflow:hidden;">
        <div id="v" style="width:100%; height:400px;"></div>
        <script>
          $(function() {
            const viewer = $3Dmol.createViewer($('#v'), {backgroundColor: '#ffffff'});
            viewer.addModel(atob("${b64}"), "sdf");
            viewer.setStyle({}, {stick:{radius:0.15, colorscheme:'default'}, sphere:{radius:0.4, colorscheme:'default'}});
            viewer.zoomTo();
            viewer.render();
            viewer.setHoverable({}, true, function(atom){}, function(atom){});
          });
        </script>
      </body>
      </html>
    `;
    return <iframe srcDoc={html} style={{ width: '100%', height: '400px', border: `1px solid ${colors.border}`, borderRadius: radius.md }} />;
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
      onBack={() => window.location.hash = 'hub'}
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
                  onClick={handleLoad}
                >
                  Load SMILES
                </button>
              </>
            )}

            {/* Name search mode */}
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
                onChange={e => setConfig({...config, ff: e.target.value})}
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
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                padding: '8px 20px', border: 'none', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
                backgroundColor: activeTab === 'overview' ? colors.navy : 'transparent',
                color: activeTab === 'overview' ? '#fff' : colors.textMuted,
                transition: 'all 0.2s ease'
              }}
            >
              📊 Overview
            </button>
            <button
              onClick={() => setActiveTab('inspector')}
              style={{
                padding: '8px 20px', border: 'none', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
                backgroundColor: activeTab === 'inspector' ? colors.navy : 'transparent',
                color: activeTab === 'inspector' ? '#fff' : colors.textMuted,
                transition: 'all 0.2s ease'
              }}
            >
              🔍 Inspector
            </button>
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
                        onClick={() => { setSelectedIdx(i); setActiveTab('inspector'); }}
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

            {activeTab === 'inspector' && entries[selectedIdx] && (
              <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 400px' }}>
                  <h5 style={{ fontWeight: 700, marginBottom: '20px', fontSize: '16px', display: 'flex', justifyContent: 'space-between' }}>
                    3D Visualization
                    <span style={{ color: colors.textMuted, fontSize: '12px' }}>{entries[selectedIdx].name}</span>
                  </h5>
                  {render3D(entries[selectedIdx].sdf_3d)}
                  {entries[selectedIdx].energy && (
                    <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: radius.md, fontSize: '12px', color: colors.textMuted }}>
                      <i className="bi bi-lightning-fill" style={{ color: colors.warning }}></i> Energy: <strong>{entries[selectedIdx].energy}</strong> kcal/mol ({entries[selectedIdx].ff_used})
                    </div>
                  )}
                </div>
                <div style={{ flex: '0 0 300px' }}>
                  <h5 style={{ fontWeight: 700, marginBottom: '20px', fontSize: '16px' }}>Properties</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {entries[selectedIdx].props && Object.entries(entries[selectedIdx].props).map(([k, v]: [string, any]) => (
                      <div key={k} style={{
                        display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                        borderBottom: `1px solid ${colors.borderLight}`, fontSize: '13px'
                      }}>
                        <span style={{ color: colors.textMuted }}>{k.replace(/_/g, ' ')}</span>
                        <span style={{ fontWeight: 700, color: colors.navy }}>{v.toString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default DockingPage;
