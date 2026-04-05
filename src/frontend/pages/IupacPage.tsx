import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import { colors, font, radius, shadow } from '../styles/themes';

interface Result {
  smiles: string;
  IUPACName?: string;
  InChI?: string;
  InChIKey?: string;
  MolecularFormula?: string;
  MolecularWeight?: string;
  error?: string;
}

const FIELDS: { key: keyof Result; label: string; mono?: boolean }[] = [
  { key: 'IUPACName',        label: 'IUPAC Name' },
  { key: 'MolecularFormula', label: 'Molecular Formula' },
  { key: 'MolecularWeight',  label: 'Molecular Weight (g/mol)' },
  { key: 'InChIKey',         label: 'InChIKey', mono: true },
  { key: 'InChI',            label: 'InChI', mono: true },
];

function IupacContent({ initialSmiles }: { initialSmiles?: string }) {
  const [input, setInput]     = useState(initialSmiles || 'CC(=O)Oc1ccccc1C(=O)O\nCC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (initialSmiles) {
      setInput(initialSmiles);
    }
  }, [initialSmiles]);

  const run = async () => {
    const list = [...new Set(input.split('\n').map(s => s.trim()).filter(Boolean))];
    if (!list.length) return;
    setLoading(true);
    setResults([]);
    const fetched = await Promise.all(list.map(async (smiles): Promise<Result> => {
      try {
        const res  = await fetch('/convert/iupac', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ smiles }),
        });
        const json = await res.json();
        if (!res.ok) return { smiles, error: json.error ?? 'Not found' };
        const props = json?.PropertyTable?.Properties?.[0] ?? {};
        return { smiles, ...props };
      } catch {
        return { smiles, error: 'Request failed' };
      }
    }));
    setResults(fetched);
    setLoading(false);
  };

  const copyTsv = () => {
    const header = 'SMILES\tIUPAC Name\tFormula\tMW\tInChIKey\tInChI';
    const rows = results.filter(r => !r.error).map(r =>
      [r.smiles, r.IUPACName, r.MolecularFormula, r.MolecularWeight, r.InChIKey, r.InChI].map(v => v ?? '').join('\t')
    );
    navigator.clipboard.writeText([header, ...rows].join('\n'));
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
        backgroundColor: primary ? (disabled ? colors.textLight : '#7c3aed') : colors.surface,
        color: primary ? '#fff' : colors.textMuted,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
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
          SMILES Input — one per line
        </label>
        <textarea
          rows={5}
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 12px',
            fontFamily: 'monospace', fontSize: '13px',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: colors.bg,
            color: colors.text,
            resize: 'vertical',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          {btn(loading ? 'Querying PubChem…' : 'Convert', run, true, loading)}
          {results.length > 0 && btn('Copy as TSV', copyTsv)}
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
          fontFamily: font,
        }}>
          <div style={{
            padding: '12px 20px',
            backgroundColor: r.error ? colors.dangerBg : colors.bg,
            borderBottom: `1px solid ${colors.borderLight}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <code style={{ fontSize: '13px', color: colors.text, fontFamily: 'monospace' }}>{r.smiles}</code>
            {r.error && (
              <span style={{ fontSize: '12px', color: colors.danger, fontWeight: 500 }}>
                <i className="bi bi-exclamation-triangle" style={{ marginRight: '4px' }}></i>
                {r.error}
              </span>
            )}
          </div>

          {!r.error && (
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {FIELDS.map(f => r[f.key] && (
                <div key={f.key}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {f.label}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: colors.text,
                    fontFamily: f.mono ? 'monospace' : font,
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                  }}>
                    {r[f.key]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function IupacPage({ onBack, initialSmiles }: { onBack: () => void; initialSmiles?: string }) {
  return (
    <PageShell
      icon="bi-tag"
      title="Chemical Nomenclature"
      subtitle="SMILES → IUPAC name · InChI · InChIKey · Molecular Formula via PubChem"
      accentColor="#7c3aed"
      onBack={onBack}
    >
      <IupacContent initialSmiles={initialSmiles} />
    </PageShell>
  );
}

export default IupacPage;
