import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import { colors, font, radius, shadow } from '../styles/themes';

interface PeptideResult {
  input: string;
  output?: string;
  is_cyclic?: boolean;
  cyclization?: string;
  metrics?: {
    pi: number;
    charge_74: number;
    charge_55: number;
    gravy: number;
    boman: number;
    instability: number;
    aliphatic: number;
    helical_wheel: string;
    cleavage_sites: { pos: number; residue: string; protease: string }[];
  };
  error?: string;
}

type Mode = 'seq-to-smiles' | 'smiles-to-seq';

function PeptideContent({ initialSmiles }: { initialSmiles?: string }) {
  const [mode, setMode]       = useState<Mode>(initialSmiles ? 'smiles-to-seq' : 'seq-to-smiles');
  const [input, setInput]     = useState(initialSmiles || 'M-A-Y-L-A\nC-D-E-F-G');
  const [results, setResults] = useState<PeptideResult[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const list = [...new Set(input.split('\n').map(s => s.trim()).filter(Boolean))];
    if (!list.length) return;
    setLoading(true);
    setResults([]);
    
    const endpoint = mode === 'seq-to-smiles' ? '/predict/peplink' : '/predict/smiles-to-peptide';
    const payloadKey = mode === 'seq-to-smiles' ? 'sequence' : 'smiles';

    const fetched = await Promise.all(list.map(async (val): Promise<PeptideResult> => {
      try {
        const res  = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [payloadKey]: val }),
        });
        const json = await res.json();
        if (!res.ok) return { input: val, error: json.error ?? 'Conversion failed' };
        
        if (mode === 'seq-to-smiles') {
            return { input: val, output: json.smiles, metrics: json.metrics };
        } else {
            return { 
                input: val, 
                output: json.sequence, 
                is_cyclic: json.is_cyclic, 
                cyclization: json.cyclization,
                metrics: json.metrics
            };
        }
      } catch {
        return { input: val, error: 'Request failed' };
      }
    }));
    setResults(fetched);
    setLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleMode = (newMode: Mode) => {
      setMode(newMode);
      setResults([]);
      if (newMode === 'seq-to-smiles') {
          setInput('M-A-Y-L-A\nC-D-E-F-G');
      } else {
          setInput('CSCC[C@H](N)C(=O)N[C@@H](C)C(=O)N[C@@H](Cc1ccc(O)cc1)C(=O)N[C@@H](CC(C)C)C(=O)N[C@@H](C)C(=O)O');
      }
  };

  const btn = (label: string, onClick: () => void, primary = false, disabled = false) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: font,
        fontSize: '13px', fontWeight: 500,
        padding: '8px 18px',
        borderRadius: radius.sm,
        border: primary ? 'none' : `1px solid ${colors.border}`,
        backgroundColor: primary ? (disabled ? colors.textLight : '#ec4899') : colors.surface,
        color: primary ? '#fff' : colors.textMuted,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
         <button 
            onClick={() => toggleMode('seq-to-smiles')}
            style={{
                flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                backgroundColor: mode === 'seq-to-smiles' ? '#ec4899' : '#f1f5f9',
                color: mode === 'seq-to-smiles' ? '#fff' : colors.textMuted,
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s ease'
            }}
         >
            Sequence → SMILES
         </button>
         <button 
            onClick={() => toggleMode('smiles-to-seq')}
            style={{
                flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                backgroundColor: mode === 'smiles-to-seq' ? '#ec4899' : '#f1f5f9',
                color: mode === 'smiles-to-seq' ? '#fff' : colors.textMuted,
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s ease'
            }}
         >
            SMILES → Sequence
         </button>
      </div>

      {/* Input panel */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: '24px',
        marginBottom: '24px',
        boxShadow: shadow.sm,
      }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          {mode === 'seq-to-smiles' ? 'Peptide Sequence Input (e.g. M-A-Y-L-A)' : 'SMILES Input (Molecular Structure)'}
        </label>
        <textarea
          rows={5}
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 12px',
            fontFamily: 'monospace', fontSize: '14px',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: colors.bg,
            color: colors.text,
            resize: 'vertical',
            outline: 'none',
          }}
        />

        {mode === 'seq-to-smiles' && (
          <div style={{ marginTop: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.05em' }}>
                    <i className="bi bi-hammer" /> PEPTIDE BUILDER TOOL
                </div>
                <button 
                    onClick={() => setInput('')}
                    style={{ border: 'none', background: 'none', color: '#f87171', fontSize: '10px', cursor: 'pointer', fontWeight: 800, textTransform: 'uppercase' }}
                >
                    [ Clear All ]
                </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {[
                    { label: 'Positive', sign: '+', color: '#ef4444', bg: '#fef2f2', codes: ['R', 'K', 'H'], names: ['Arg', 'Lys', 'His'] },
                    { label: 'Negative', sign: '-', color: '#3b82f6', bg: '#eff6ff', codes: ['D', 'E'], names: ['Asp', 'Glu'] },
                    { label: 'Polar', sign: '•', color: '#10b981', bg: '#ecfdf5', codes: ['S', 'T', 'N', 'Q', 'Y', 'C'], names: ['Ser', 'Thr', 'Asn', 'Gln', 'Tyr', 'Cys'] },
                    { label: 'Hydrophobic', sign: '≈', color: '#64748b', bg: '#f8fafc', codes: ['A', 'V', 'L', 'I', 'M', 'F', 'W', 'P'], names: ['Ala', 'Val', 'Leu', 'Ile', 'Met', 'Phe', 'Trp', 'Pro'] }
                ].map(group => (
                    <div key={group.label} style={{ 
                        flex: group.label === 'Hydrophobic' ? '1.5' : '1', minWidth: '160px', 
                        backgroundColor: group.bg, padding: '12px', borderRadius: '12px', 
                        border: `1px solid ${group.color}15`, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ 
                            fontSize: '9px', fontWeight: 900, color: group.color, marginBottom: '10px', 
                            display: 'flex', justifyContent: 'space-between', textTransform: 'uppercase', letterSpacing: '0.05em'
                        }}>
                            <span>{group.label}</span>
                            <span style={{ opacity: 0.5 }}>{group.sign}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {group.codes.map((aa, idx) => (
                                <button
                                    key={aa}
                                    title={`${group.names[idx]} - Click to append`}
                                    onClick={() => {
                                        const cleanInput = input.trim();
                                        const separator = cleanInput && !cleanInput.endsWith('\n') && !cleanInput.endsWith('-') ? '-' : '';
                                        setInput(input + separator + aa);
                                    }}
                                    style={{
                                        border: '1px solid #fff', backgroundColor: '#fff', 
                                        borderRadius: '8px', width: '34px', height: '34px', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '14px', fontWeight: 800, cursor: 'pointer', 
                                        transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                                        color: '#1e293b'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.backgroundColor = group.color;
                                        e.currentTarget.style.color = '#fff';
                                        e.currentTarget.style.transform = 'translateY(-3px)';
                                        e.currentTarget.style.boxShadow = `0 6px 15px ${group.color}40`;
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.backgroundColor = '#fff';
                                        e.currentTarget.style.color = '#1e293b';
                                        e.currentTarget.style.transform = 'none';
                                        e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
                                    }}
                                >
                                    {aa}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          {btn(loading ? 'Processing…' : 'Generate Result', run, true, loading)}
        </div>
      </div>

      {/* Results */}
      {results.map((r, i) => (
        <div key={i} style={{
          backgroundColor: colors.surface,
          border: `1px solid ${r.error ? colors.danger + '40' : colors.border}`,
          borderRadius: radius.lg,
          marginBottom: '16px',
          overflow: 'hidden',
          boxShadow: shadow.sm,
        }}>
          <div style={{
            padding: '12px 20px',
            backgroundColor: r.error ? colors.dangerBg : colors.bg,
            borderBottom: `1px solid ${colors.borderLight}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <code style={{ fontSize: '13px', color: colors.text, maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.input}</code>
            {r.error && (
              <span style={{ fontSize: '12px', color: colors.danger, fontWeight: 500 }}>
                {r.error}
              </span>
            )}
          </div>

          {!r.error && r.output && (
            <div style={{ padding: '20px' }}>
                <div style={{ marginBottom: '15px' }}>
                   <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>
                       {mode === 'seq-to-smiles' ? 'Generated SMILES' : 'Extracted Sequence'}
                   </div>
                   <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <code style={{ fontSize: '15px', color: colors.text, flex: 1, wordBreak: 'break-all', fontWeight: 700 }}>{r.output}</code>
                        {r.is_cyclic && <span style={{ backgroundColor: '#fee2e2', color: '#b91c1c', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>CYCLIC</span>}
                        <button onClick={() => copyToClipboard(r.output!)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.blue }}>
                            <i className="bi bi-clipboard" />
                        </button>
                   </div>
                </div>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'stretch' }}>
                    {/* Column 1: Structure */}
                    <div style={{
                        width: '240px', flexShrink: 0,
                        backgroundColor: '#fff', borderRadius: '12px', 
                        padding: '8px', border: '1px solid #f1f5f9',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                        display: 'flex', alignItems: 'center'
                    }}>
                        <img 
                            src={`/render?smiles=${encodeURIComponent(mode === 'seq-to-smiles' ? r.output! : r.input)}&format=png`} 
                            alt="Molecule structure" 
                            style={{ width: '100%', display: 'block', borderRadius: '6px' }}
                        />
                    </div>

                    {/* Column 2 & 3 Container */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                         {r.metrics && (
                            <div style={{ 
                                padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '12px', 
                                border: '1px solid #e0f2fe', color: '#0369a1'
                            }}>
                                <div style={{ display: 'flex', gap: '15px' }}>
                                    {/* Metrics Grid */}
                                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                        {[
                                            { label: 'pI', val: r.metrics.pi, icon: 'bi-droplet-half', color: '#0ea5e9' },
                                            { label: 'Charge', val: (r.metrics.charge_74 > 0 ? '+' : '') + r.metrics.charge_74, icon: 'bi-lightning-charge', color: '#f59e0b' },
                                            { label: 'GRAVY', val: r.metrics.gravy, sub: r.metrics.gravy > 0 ? 'Hydroph' : 'Hydrophil', icon: 'bi-water', color: '#10b981' },
                                            { label: 'Boman', val: r.metrics.boman, sub: r.metrics.boman > 2.48 ? 'High Bind' : 'Low Bind', icon: 'bi-link-45deg', color: '#6366f1' },
                                            { label: 'Instability', val: r.metrics.instability, color: r.metrics.instability > 40 ? '#ef4444' : '#10b981', icon: 'bi-activity', colorIcon: '#ec4899' },
                                            { label: 'Aliphatic', val: r.metrics.aliphatic, icon: 'bi-thermometer-half', color: '#8b5cf6' }
                                        ].map(m => (
                                            <div key={m.label} style={{ 
                                                backgroundColor: '#fff', padding: '10px 6px', borderRadius: '10px', 
                                                border: '1px solid #bae6fd', textAlign: 'center',
                                                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                            }}>
                                                <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                    <i className={`bi ${m.icon}`} style={{ color: m.colorIcon || m.color, fontSize: '14px' }} />
                                                    {m.val}
                                                </div>
                                                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#475569', fontWeight: 900, marginTop: '4px', letterSpacing: '0.02em' }}>{m.label}</div>
                                                {m.sub && <div style={{ fontSize: '9px', fontWeight: 800, color: m.color, marginTop: '2px' }}>{m.sub}</div>}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Helical Wheel */}
                                    <div style={{ width: '130px', backgroundColor: '#fff', borderRadius: '10px', padding: '10px', border: '1px solid #bae6fd', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <div style={{ fontSize: '9px', fontWeight: 800, color: '#0ea5e9', marginBottom: '5px', textAlign: 'center' }}>HELICAL WHEEL</div>
                                        <div style={{ width: '90px', height: '90px' }} dangerouslySetInnerHTML={{ __html: r.metrics.helical_wheel }} />
                                    </div>
                                </div>

                                {r.metrics.cleavage_sites.length > 0 && (
                                    <div style={{ marginTop: '10px', borderTop: '1px solid #bae6fd', paddingTop: '8px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#0ea5e9', alignSelf: 'center', marginRight: '5px' }}>STABILITY:</span>
                                            {r.metrics.cleavage_sites.slice(0, 10).map((site, si) => (
                                                <span key={si} style={{ backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca' }}>
                                                    {site.protease}: {site.residue}{site.pos}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                         )}
                    </div>
                </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function PeptidePage({ onBack, initialSmiles }: { onBack: () => void; initialSmiles?: string }) {
  return (
    <PageShell
      icon="bi-pentagon"
      title="Peptide Engineering"
      subtitle="Bidirectional Conversion: Peptide Sequecence ⇄ SMILES structure"
      accentColor="#ec4899"
      onBack={onBack}
    >
      <PeptideContent initialSmiles={initialSmiles} />
    </PageShell>
  );
}

export default PeptidePage;
