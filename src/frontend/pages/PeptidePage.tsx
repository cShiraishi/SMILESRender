import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import { colors, font, radius, shadow } from '../styles/themes';

interface PeptideResult {
  input: string;
  output?: string;
  is_cyclic?: boolean;
  cyclization?: string;
  error?: string;
}

type Mode = 'seq-to-smiles' | 'smiles-to-seq';

function PeptideContent() {
  const [mode, setMode]       = useState<Mode>('seq-to-smiles');
  const [input, setInput]     = useState('M-A-Y-L-A\nC-D-E-F-G');
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
            return { input: val, output: json.smiles };
        } else {
            return { 
                input: val, 
                output: json.sequence, 
                is_cyclic: json.is_cyclic, 
                cyclization: json.cyclization 
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
                
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    <div style={{
                        maxWidth: '400px', flexShrink: 0,
                        backgroundColor: '#fff', borderRadius: '16px', 
                        padding: '10px', border: '1px solid #f1f5f9',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
                    }}>
                        <img 
                            src={`/render?smiles=${encodeURIComponent(mode === 'seq-to-smiles' ? r.output! : r.input)}&format=png`} 
                            alt="Molecule structure" 
                            style={{ width: '100%', display: 'block', borderRadius: '8px' }}
                        />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                         <div style={{ 
                            padding: '24px', backgroundColor: '#fcfaf0', borderRadius: '16px', 
                            border: '1px solid #fef3c7', color: '#92400e', fontSize: '14px', lineHeight: 1.6
                         }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '15px' }}>🧬 Bi-Structural Intelligence</h4>
                            Processing engine: <b>PepLink 1.0</b>.
                            <br/><br/>
                            {mode === 'seq-to-smiles' ? (
                                <>Converts peptide sequences (canonical and non-canonical) into precise molecular topologies for drug design.</>
                            ) : (
                                <>Analytic engine extracted the amino acid backbone from the provided complex molecular structure.</>
                            )}
                            <br/><br/>
                            You can now use this result in <b>ADMET Profiling</b> or <b>QSAR descriptors</b>.
                         </div>
                    </div>
                </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function PeptidePage({ onBack }: { onBack: () => void }) {
  return (
    <PageShell
      icon="bi-pentagon"
      title="Peptide Engineering"
      subtitle="Bidirectional Conversion: Peptide Sequecence ⇄ SMILES structure"
      accentColor="#ec4899"
      onBack={onBack}
    >
      <PeptideContent />
    </PageShell>
  );
}

export default PeptidePage;
