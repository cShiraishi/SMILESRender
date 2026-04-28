import React, { useEffect, useState } from 'react';
import { colors, font, radius, shadow } from '../styles/themes';

function SmilesCard(props: { smiles: string; name?: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [smileImage, setSmileImage] = useState(new Blob());
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/render/base64/${encodeURIComponent(window.btoa(props.smiles))}`)
      .then(r => r.blob())
      .then(img => { setSmileImage(img); setIsLoading(false); })
      .catch(() => { setError(true); setIsLoading(false); });
  }, []);

  const label = props.name || props.smiles;

  return (
    <div style={{
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      boxShadow: shadow.sm,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '260px',
      margin: '10px',
      fontFamily: font,
    }}>
      <div style={{
        width: '220px', height: '220px',
        backgroundColor: colors.bg,
        borderRadius: radius.sm,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        marginBottom: '10px',
      }}>
        {isLoading && (
          <span style={{ fontSize: '12px', color: colors.textMuted }}>Loading…</span>
        )}
        {error && (
          <span style={{ fontSize: '12px', color: colors.danger }}>Invalid SMILES</span>
        )}
        {!isLoading && !error && (
          <img src={URL.createObjectURL(smileImage)} alt={props.smiles} style={{ maxWidth: '100%', maxHeight: '100%' }} />
        )}
      </div>
      <p style={{
        fontSize: '11px',
        color: colors.textMuted,
        textAlign: 'center',
        overflowWrap: 'break-word',
        width: '100%',
        margin: '0 0 10px 0',
        fontFamily: 'monospace',
      }}>
        {label}
      </p>
      <button 
        onClick={() => {
          const a = document.createElement('a');
          a.href = `/render/${window.btoa(props.smiles)}?format=jpeg`;
          a.download = `molecule_${new Date().getTime()}.jpg`;
          a.click();
        }}
        style={{
          border: 'none', background: 'none', color: '#007bff', 
          fontSize: '11px', fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '4px'
        }}
      >
        <i className="bi bi-download"></i> JPEG
      </button>
    </div>
  );
}

export default SmilesCard;
