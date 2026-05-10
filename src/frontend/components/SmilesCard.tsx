import React, { useEffect, useState } from 'react';
import { colors, font, radius, shadow } from '../styles/themes';
import { PaperOptions, LabelPosition, defaultPaperOptions, cardSizes } from '../types/paper';

function SmilesCard(props: { smiles: string; name?: string; mode?: 'grid' | 'paper'; index?: number; paperOptions?: PaperOptions; mw?: number }) {
  const [isLoading, setIsLoading] = useState(true);
  const [imgSrc, setImgSrc] = useState('');
  const [error, setError] = useState(false);
  const mode = props.mode || 'grid';
  const opts = props.paperOptions || defaultPaperOptions;
  const size = cardSizes[opts.cardSize || 'md'];
  const isDark = opts.theme === 'dark';

  useEffect(() => {
    let objUrl = '';
    setIsLoading(true); setError(false);
    fetch(`/render?smiles=${encodeURIComponent(props.smiles)}`)
      .then(r => r.blob())
      .then(blob => { objUrl = URL.createObjectURL(blob); setImgSrc(objUrl); setIsLoading(false); })
      .catch(() => { setError(true); setIsLoading(false); });
    return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [props.smiles]);

  const label = props.name || props.smiles;

  if (mode === 'paper') {
    const bgColor = isDark ? '#1a1a2e' : '#fff';
    const borderColor = isDark ? '#444' : '#000';
    const textColor = isDark ? '#e0e0e0' : '#000';
    const mutedColor = isDark ? '#999' : '#666';
    const numColor = isDark ? '#aaa' : '#333';

    const getTopStyle = (pos: LabelPosition): React.CSSProperties => {
      const base: React.CSSProperties = { position: 'absolute', fontSize: '11px', fontWeight: 700, color: numColor, fontFamily: 'monospace', zIndex: 2 };
      if (pos === 'top-left') return { ...base, top: '6px', left: '8px' };
      if (pos === 'top-center') return { ...base, top: '6px', left: '50%', transform: 'translateX(-50%)' };
      if (pos === 'top-right') return { ...base, top: '6px', right: '8px' };
      return base;
    };

    const getBottomAlign = (pos: LabelPosition): 'left' | 'center' | 'right' => {
      if (pos === 'bottom-left') return 'left';
      if (pos === 'bottom-right') return 'right';
      return 'center';
    };

    const isTop = (pos: LabelPosition) => pos.startsWith('top');

    const bottomItems: { content: React.ReactNode; align: string; key: string }[] = [];

    if (opts.showNumber && props.index != null && !isTop(opts.numberPos)) {
      bottomItems.push({ key: 'num', align: getBottomAlign(opts.numberPos), content: (
        <span style={{ fontSize: '11px', fontWeight: 700, color: numColor, fontFamily: 'monospace' }}>{props.index}</span>
      )});
    }
    if (opts.showName && !isTop(opts.namePos)) {
      bottomItems.push({ key: 'name', align: getBottomAlign(opts.namePos), content: (
        <p style={{ fontSize: `${opts.nameSize}px`, fontWeight: 700, color: textColor, margin: 0, lineHeight: 1.2 }}>{props.name || 'Unnamed'}</p>
      )});
    }
    if (opts.showMW && props.mw != null && !isTop(opts.mwPos)) {
      bottomItems.push({ key: 'mw', align: getBottomAlign(opts.mwPos), content: (
        <span style={{ fontSize: '10px', color: mutedColor, fontFamily: 'monospace' }}>MW: {props.mw.toFixed(2)}</span>
      )});
    }
    if (opts.showSmiles && !isTop(opts.smilesPos)) {
      bottomItems.push({ key: 'smi', align: getBottomAlign(opts.smilesPos), content: (
        <span style={{ fontSize: '9px', color: mutedColor, fontStyle: 'italic', wordBreak: 'break-all', lineHeight: 1.3, maxWidth: `${size.imgSize}px`, display: 'inline-block' }}>{props.smiles}</span>
      )});
    }

    return (
      <div className="paper-card" style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: `${size.width}px`,
        margin: '10px',
        fontFamily: 'serif',
        position: 'relative',
      }}>
        {opts.showNumber && props.index != null && isTop(opts.numberPos) && (
          <span style={getTopStyle(opts.numberPos)}>{props.index}</span>
        )}
        {opts.showName && isTop(opts.namePos) && (
          <span style={{ ...getTopStyle(opts.namePos), fontFamily: 'serif', fontSize: `${opts.nameSize - 1}px`, color: textColor }}>{props.name || 'Unnamed'}</span>
        )}
        {opts.showMW && props.mw != null && isTop(opts.mwPos) && (
          <span style={{ ...getTopStyle(opts.mwPos), fontSize: '9px', color: mutedColor }}>MW: {props.mw.toFixed(2)}</span>
        )}
        {opts.showSmiles && isTop(opts.smilesPos) && (
          <span style={{ ...getTopStyle(opts.smilesPos), fontSize: '8px', fontStyle: 'italic', color: mutedColor, maxWidth: `${size.width - 40}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.smiles}</span>
        )}

        <div style={{
          width: `${size.imgSize}px`, height: `${size.imgSize}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: '6px',
          marginTop: (opts.showNumber && isTop(opts.numberPos)) || (opts.showName && isTop(opts.namePos)) ? '14px' : '0',
          backgroundColor: isDark ? '#111' : 'transparent',
          borderRadius: isDark ? '4px' : '0',
        }}>
          {!isLoading && !error && (
            <img src={imgSrc} alt={props.smiles} style={{ maxWidth: '100%', maxHeight: '100%', filter: isDark ? 'invert(1) contrast(1.1)' : 'contrast(1.2)' }} />
          )}
          {isLoading && (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <div className={isDark ? 'skeleton-dark' : 'skeleton'} style={{ width: '70%', height: '70%', borderRadius: '8px' }} />
              <div className={isDark ? 'skeleton-dark' : 'skeleton'} style={{ width: '50%', height: '8px' }} />
            </div>
          )}
          {error && <span style={{ fontSize: '11px', color: '#c00' }}>Invalid</span>}
        </div>

        {bottomItems.map(item => (
          <div key={item.key} style={{ width: '100%', textAlign: item.align as any, marginTop: '2px' }}>
            {item.content}
          </div>
        ))}
      </div>
    );
  }

  // Grid mode (unchanged)
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
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '20px' }}>
            <svg className="skeleton-icon" width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.4 }}>
              <polygon points="32,8 56,20 56,44 32,56 8,44 8,20" fill="none" stroke={colors.border} strokeWidth="2" strokeLinejoin="round" />
              <circle cx="32" cy="32" r="10" fill="none" stroke={colors.border} strokeWidth="2" strokeDasharray="4 3" />
              <circle cx="32" cy="8" r="3" fill={colors.border} />
              <circle cx="56" cy="20" r="3" fill={colors.border} />
              <circle cx="56" cy="44" r="3" fill={colors.border} />
              <circle cx="32" cy="56" r="3" fill={colors.border} />
              <circle cx="8" cy="44" r="3" fill={colors.border} />
              <circle cx="8" cy="20" r="3" fill={colors.border} />
            </svg>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
              <div className="skeleton" style={{ width: '80%', height: '10px' }} />
              <div className="skeleton" style={{ width: '55%', height: '8px' }} />
            </div>
          </div>
        )}
        {error && (
          <span style={{ fontSize: '12px', color: colors.danger }}>Invalid SMILES</span>
        )}
        {!isLoading && !error && (
          <img src={imgSrc} alt={props.smiles} style={{ maxWidth: '100%', maxHeight: '100%' }} />
        )}
      </div>
      <p style={{
        fontSize: mode === 'paper' ? `${opts.nameSize}px` : '13px',
        color: colors.text,
        fontWeight: 600,
        textAlign: 'center',
        overflowWrap: 'break-word',
        width: '100%',
        margin: '0 0 10px 0',
        fontFamily: font,
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
          border: 'none', background: 'none', color: colors.blue, 
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
