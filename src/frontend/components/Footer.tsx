import React from 'react';
import { colors, font } from '../styles/themes';

function Footer() {
  return (
    <footer style={{
      backgroundColor: colors.navy,
      borderTop: '1px solid #1e3560',
      fontFamily: font,
      padding: '20px 32px',
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="static/logo.png" alt="" style={{ height: '20px', filter: 'brightness(0) invert(1)', opacity: 0.5 }} />
          <span style={{ fontSize: '12px', color: '#4a6a94' }}>
            SmileRender © {new Date().getFullYear()} — Open-source cheminformatics platform
          </span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#4a6a94' }}>Powered by RDKit · PubChem · Flask</span>
          <a href="https://github.com/Gabriel-Grechuk" target="_blank" rel="noreferrer" style={{ color: '#4a6a94' }}>
            <i className="bi bi-github" style={{ fontSize: '16px' }}></i>
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
