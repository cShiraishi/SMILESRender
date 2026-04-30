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
      width: '100%',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
    }}>
      <div style={{
        width: '100%',
        padding: '0 40px',
        height: '70px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}>
        {/* Logo Section */}
        <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '15px', minWidth: 'fit-content' }}>
          <img src="static/logo.png" alt="SMILESRender" style={{ height: '38px', filter: 'brightness(0) invert(1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '15px' }}>
            <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '0.01em', lineHeight: 1.1 }}>SMILESRender</span>
            <span style={{ fontSize: '10px', color: '#94a8c9', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Molecular Intelligence Platform
            </span>
          </div>
        </a>

        {/* Navigation Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
          <nav style={{ display: 'flex', gap: '25px', marginRight: '10px' }}>
            <a href="/#renderer" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}>
              Rendering
            </a>
            <a href="/#predict" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}>
              ADMET
            </a>
            <a href="/#iupac" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}>
              Nomenclature
            </a>
          </nav>
          
          <a
            href="https://github.com/cShiraishi/SMILESRender"
            target="_blank"
            rel="noreferrer"
            style={{
              color: '#fff',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              padding: '8px 18px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.borderColor = '#fff';
            }}
            onMouseOut={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            }}
          >
            <i className="bi bi-github" style={{ fontSize: '16px' }}></i>
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}

export default Header;
