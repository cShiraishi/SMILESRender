import React from 'react';
import { colors, font, shadow } from '../styles/themes';

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  accentColor?: string;
  onBack: () => void;
  children: React.ReactNode;
}

function PageShell({ icon, title, subtitle, accentColor = colors.blue, onBack, children }: Props) {
  return (
    <div style={{ width: '100%', fontFamily: font, backgroundColor: colors.bg, minHeight: '100%' }}>
      {/* Page header */}
      <div style={{
        backgroundColor: colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        padding: '10px 20px',
        boxShadow: shadow.sm,
      }}>
        <div style={{
          width: '100%',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          boxSizing: 'border-box',
        }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: colors.textMuted,
              fontFamily: font,
              display: 'flex', alignItems: 'center', gap: '6px',
              backgroundColor: '#fff',
            }}
          >
            <i className="bi bi-arrow-left"></i> All Tools
          </button>
          <div style={{ width: '1px', height: '24px', backgroundColor: colors.border, margin: '0 8px' }} />
          <div style={{
            width: '38px', height: '38px',
            backgroundColor: `${accentColor}14`,
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`bi ${icon}`} style={{ fontSize: '18px', color: accentColor }}></i>
          </div>
          <div style={{ flex: '1 1 auto', minWidth: '150px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: colors.text, lineHeight: 1.2 }}>{title}</div>
            {subtitle && <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>{subtitle}</div>}
          </div>
        </div>
      </div>
      {/* Content */}
      <div style={{ width: '100%', padding: 'clamp(12px, 3vw, 20px) clamp(12px, 4vw, 40px)', boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  );
}

export default PageShell;
