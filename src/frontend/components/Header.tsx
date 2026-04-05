import React from 'react';
import { colors, font, shadow } from '../styles/themes';

function Header() {
  return (
    <header style={{
      backgroundColor: colors.navy,
      color: '#fff',
      fontFamily: font,
      boxShadow: shadow.md,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0 32px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="static/logo.png" alt="SmileRender" style={{ height: '32px', filter: 'brightness(0) invert(1)' }} />
          <div>
            <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.02em' }}>SmileRender</span>
            <span style={{ fontSize: '11px', color: '#94a8c9', marginLeft: '8px', fontWeight: 400, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Molecular Intelligence Platform
            </span>
          </div>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <a href="/#renderer" style={{ color: '#94a8c9', textDecoration: 'none', fontSize: '13px', fontWeight: 500, letterSpacing: '0.03em' }}>
            Structure Rendering
          </a>
          <a href="/#predict" style={{ color: '#94a8c9', textDecoration: 'none', fontSize: '13px', fontWeight: 500, letterSpacing: '0.03em' }}>
            ADMET Prediction
          </a>
          <a href="/#iupac" style={{ color: '#94a8c9', textDecoration: 'none', fontSize: '13px', fontWeight: 500, letterSpacing: '0.03em' }}>
            Nomenclature
          </a>
          <a
            href="https://github.com/Gabriel-Grechuk/smiles-render-web"
            target="_blank"
            rel="noreferrer"
            style={{
              color: '#fff',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500,
              padding: '6px 14px',
              border: '1px solid #2d4a72',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="bi bi-github"></i>
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}

export default Header;
