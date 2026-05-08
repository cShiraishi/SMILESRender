import React, { useEffect, useState } from 'react';

export default function MolImage({ smiles, width = 90, height = 68 }: { smiles: string; width?: number; height?: number }) {
  const [src, setSrc]       = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objUrl = '';
    setSrc(null);
    setFailed(false);
    fetch(`/render?smiles=${encodeURIComponent(smiles)}`)
      .then(r => r.blob())
      .then(b => { objUrl = URL.createObjectURL(b); setSrc(objUrl); })
      .catch(() => setFailed(true));
    return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [smiles]);

  const box: React.CSSProperties = { width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  if (failed) return <div style={{ ...box, fontSize: 9, color: '#ef4444' }}>Invalid</div>;
  if (!src)   return (
    <div style={box}>
      <div style={{ width: 14, height: 14, border: '2px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
  return <img src={src} alt="" style={{ width, height, objectFit: 'contain', display: 'block' }} />;
}
