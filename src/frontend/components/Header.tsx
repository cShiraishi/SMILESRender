import React, { useState, useRef, useEffect } from 'react';
import { colors, font, shadow } from '../styles/themes';
import SmileIcon from './SmileIcon';
import { useLanguage, LANG_META, Lang } from '../i18n/LanguageContext';

function LangSelector() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = LANG_META[lang];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title={t('lang.label')}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px',
          backgroundColor: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: '8px',
          color: '#e2e8f0',
          fontSize: '13px', fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
          fontFamily: font,
        }}
        onMouseOver={e => { if (!open) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
        onMouseOut={e => { if (!open) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
      >
        <span style={{ fontSize: '15px', lineHeight: 1 }}>{current.flag}</span>
        <span className="lang-short">{current.short}</span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: '10px', opacity: 0.7 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          backgroundColor: '#1e293b',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          minWidth: '150px',
          overflow: 'hidden',
          zIndex: 9999,
        }}>
          {(Object.keys(LANG_META) as Lang[]).map(l => {
            const meta = LANG_META[l];
            const active = l === lang;
            return (
              <button
                key={l}
                onClick={() => { setLang(l); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 14px',
                  backgroundColor: active ? 'rgba(99,102,241,0.25)' : 'transparent',
                  border: 'none',
                  color: active ? '#a5b4fc' : '#cbd5e1',
                  fontSize: '13px', fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  fontFamily: font,
                  transition: 'background-color 0.1s',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
                onMouseOver={e => { if (!active) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
                onMouseOut={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>{meta.flag}</span>
                <span style={{ flex: 1 }}>{meta.label}</span>
                {active && <i className="bi bi-check2" style={{ color: '#818cf8', fontSize: '13px' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Header() {
  const { t } = useLanguage();

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
      <div className="header-inner" style={{
        width: '100%',
        padding: '0 40px',
        height: '70px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}>
        {/* Logo */}
        <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 'fit-content' }}>
          <div style={{
            width: '40px', height: '40px',
            background: '#1a1a2e',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(255,210,48,0.25)',
            flexShrink: 0,
          }}>
            <SmileIcon size={26} color="#ffffff" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '12px' }}>
            <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              <span style={{ color: '#fff' }}>SMILES </span><span style={{ color: '#7dd3fc' }}>Render</span>
            </span>
            <span style={{ fontSize: '10px', color: '#94a8c9', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {t('nav.platform')}
            </span>
          </div>
        </a>

        {/* Right section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <nav className="header-nav" style={{ display: 'flex', gap: '25px', marginRight: '6px' }}>
            <a href="/#renderer" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}>
              {t('nav.rendering')}
            </a>
            <a href="/#predict" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}>
              {t('nav.admet')}
            </a>
            <a href="/#iupac" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = '#fff'} onMouseOut={e => e.currentTarget.style.color = '#cbd5e1'}>
              {t('nav.nomenclature')}
            </a>
          </nav>

          <LangSelector />

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
            <span className="header-github-text">GitHub</span>
          </a>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .header-inner { padding: 0 16px !important; }
          .header-nav { display: none !important; }
          .header-github-text { display: none !important; }
          .lang-short { display: none !important; }
        }
      `}</style>
    </header>
  );
}

export default Header;
