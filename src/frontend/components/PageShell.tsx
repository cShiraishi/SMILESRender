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
        padding: '0 32px',
        boxShadow: shadow.sm,
      }}>
        <div style={{
          maxWidth: '96%',
          margin: '0 auto',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              padding: '5px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              color: colors.textMuted,
              fontFamily: font,
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <i className="bi bi-arrow-left"></i> All Tools
          </button>
          <div style={{ width: '1px', height: '20px', backgroundColor: colors.border }} />
          <div style={{
            width: '32px', height: '32px',
            backgroundColor: `${accentColor}14`,
            borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`bi ${icon}`} style={{ fontSize: '15px', color: accentColor }}></i>
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: '11px', color: colors.textMuted }}>{subtitle}</div>}
          </div>
        </div>
      </div>
      {/* Content */}
      <div style={{ maxWidth: '96%', margin: '0 auto', padding: '32px' }}>
        {children}
      </div>
    </div>
  );
}

export default PageShell;
