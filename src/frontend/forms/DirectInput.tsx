import React from 'react';
import { useState } from 'react';
import Section from '../components/Section';
import SmilesCard from '../components/SmilesCard';
import { downloadBlob } from '../tools/helpers';
import { colors, font, radius } from '../styles/themes';

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

function DirectInput({ initialSmiles }: { initialSmiles?: string }) {
  const [smiles, setSmiles] = useState(initialSmiles ? initialSmiles.split('\n').map(s => s.trim()).filter(Boolean) : defaultSmiles);
  const [smilesToRender, setSmilesToRender] = useState([] as string[]);
  const [error, setError] = useState(false);

  React.useEffect(() => {
    if (initialSmiles) {
      setSmiles(initialSmiles.split('\n').map(s => s.trim()).filter(Boolean));
    }
  }, [initialSmiles]);

  const loadSmiles = () => setSmilesToRender(smiles);

  const downloadSmiles = () => {
    fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'png', smiles }),
    })
      .then(r => r.blob())
      .then(blob => downloadBlob({ name: 'smiles.zip', blob }))
      .catch(() => setError(true));
  };

  return (
    <Section title="Direct Input">
      <>
        <label style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          SMILES — one per line (max 20)
        </label>
        <textarea
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 12px',
            fontFamily: 'monospace', fontSize: '13px',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: colors.bg,
            color: colors.text,
            resize: 'vertical',
          }}
          value={smiles.join('\n')}
          rows={6}
          onChange={e => setSmiles(e.target.value.split('\n'))}
        />
        {error && (
          <p style={{ fontSize: '12px', color: colors.danger, margin: '8px 0 0' }}>
            <i className="bi bi-exclamation-triangle" style={{ marginRight: '4px' }}></i>
            Could not download. Check SMILES and try again.
          </p>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button onClick={loadSmiles} style={{ ...btnBase, backgroundColor: colors.blue, color: '#fff', border: 'none' }}>
            Render
          </button>
          <button onClick={downloadSmiles} style={{ ...btnBase, backgroundColor: colors.surface, color: colors.textMuted, border: `1px solid ${colors.border}` }}>
            <i className="bi bi-download" style={{ marginRight: '6px' }}></i>Download ZIP
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginTop: '20px' }}>
          {[...new Set(smilesToRender)].map(s => <SmilesCard key={s} smiles={s} />)}
        </div>
      </>
    </Section>
  );
}

export default DirectInput;
