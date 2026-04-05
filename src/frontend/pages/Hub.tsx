import React from 'react';
import { colors, font, radius, shadow } from '../styles/themes';

const apps = [
  {
    id: 'renderer',
    icon: 'bi-diagram-2',
    title: 'Structure Rendering',
    description: 'Generate high-quality 2D molecular structure images from SMILES notation. Supports direct input and high-throughput CSV batch processing.',
    tags: ['RDKit', 'PNG/SVG', 'Batch CSV'],
    color: colors.blue,
  },
  {
    id: 'predict',
    icon: 'bi-activity',
    title: 'ADMET Profiling',
    description: 'Comprehensive ADMET property prediction using 5 integrated engines: StopTox, SwissADME, StopLight, pkCSM and ADMETlab 3.0. Exports to Excel.',
    tags: ['Toxicity', 'ADMET', 'Multi-Tool'],
    color: colors.teal,
  },
  {
    id: 'iupac',
    icon: 'bi-tag',
    title: 'Chemical Nomenclature',
    description: 'Convert SMILES to IUPAC systematic names, InChI, InChIKey, molecular formula and molecular weight via PubChem REST API.',
    tags: ['IUPAC', 'InChI', 'PubChem'],
    color: '#7c3aed',
  },
  {
    id: 'descriptors',
    icon: 'bi-grid-3x3',
    title: 'Descriptor Calculator',
    description: 'Calculate 16 physicochemical descriptors including MW, LogP, TPSA, HBD/HBA, QED drug-likeness and Lipinski Ro5 violations.',
    tags: ['RDKit', 'Lipinski', 'QED'],
    color: '#0891b2',
  },
  {
    id: 'similarity',
    icon: 'bi-intersect',
    title: 'Similarity Search',
    description: 'Compute Morgan fingerprint Tanimoto similarity between a reference compound and a query library. Results ranked by score.',
    tags: ['Morgan', 'Tanimoto', 'ECFP'],
    color: '#d97706',
  },
  {
    id: 'reaction',
    icon: 'bi-arrow-left-right',
    title: 'Reaction Visualizer',
    description: 'Render chemical reactions from SMILES notation (R>>P format). Supports multi-reactant and multi-product reactions with PNG export.',
    tags: ['Synthesis', 'RDKit', 'PNG'],
    color: '#be185d',
  },
];

function Hub({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <div style={{ width: '100%', fontFamily: font, backgroundColor: colors.bg, minHeight: '100%' }}>

      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${colors.navy} 0%, ${colors.navyLight} 100%)`,
        padding: '60px 32px',
        textAlign: 'center',
        color: '#fff',
      }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <img
            src="static/logo.png"
            alt="SmileRender"
            style={{
              height: '100px',
              marginBottom: '24px',
              filter: 'brightness(0) invert(1)',
              display: 'block',
              margin: '0 auto 24px',
            }}
          />
          <div style={{
            display: 'inline-block',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#7aa8d8',
            backgroundColor: 'rgba(255,255,255,0.06)',
            padding: '4px 14px',
            borderRadius: '20px',
            marginBottom: '18px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            Molecular Intelligence Platform
          </div>
          <p style={{ fontSize: '15px', color: '#94a8c9', lineHeight: 1.7, margin: 0 }}>
            A unified platform for pharmaceutical research — structure visualization,
            ADMET profiling, and chemical nomenclature in a single interface.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        backgroundColor: colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        padding: '16px 32px',
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', gap: '48px', justifyContent: 'center' }}>
          {[
            { label: 'Prediction Engines', value: '5' },
            { label: 'Supported Formats', value: '13+' },
            { label: 'Batch Size (SMILES)', value: '≤ 20' },
            { label: 'Export Formats', value: 'XLSX · ZIP · PNG' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: colors.blue }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: colors.textMuted, letterSpacing: '0.04em', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* App Cards */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 32px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.textMuted, marginBottom: '20px' }}>
          Available Tools
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {apps.map(app => (
            <div
              key={app.id}
              onClick={() => onNavigate(app.id)}
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.lg,
                padding: '28px',
                cursor: 'pointer',
                boxShadow: shadow.sm,
                transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.15s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = shadow.lg;
                el.style.borderColor = app.color;
                el.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = shadow.sm;
                el.style.borderColor = colors.border;
                el.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '40px', height: '40px',
                backgroundColor: `${app.color}14`,
                borderRadius: radius.md,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '16px',
              }}>
                <i className={`bi ${app.icon}`} style={{ fontSize: '18px', color: app.color }}></i>
              </div>

              <h3 style={{ fontSize: '15px', fontWeight: 600, color: colors.text, margin: '0 0 8px' }}>
                {app.title}
              </h3>
              <p style={{ fontSize: '13px', color: colors.textMuted, lineHeight: '1.6', margin: '0 0 18px' }}>
                {app.description}
              </p>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {app.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: '11px', fontWeight: 500,
                    padding: '2px 8px', borderRadius: '20px',
                    backgroundColor: `${app.color}12`,
                    color: app.color,
                    border: `1px solid ${app.color}25`,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', fontWeight: 600, color: app.color,
              }}>
                Open tool <i className="bi bi-arrow-right"></i>
              </div>
            </div>
          ))}

          {/* Coming soon card */}
          <div style={{
            backgroundColor: colors.bg,
            border: `1px dashed ${colors.border}`,
            borderRadius: radius.lg,
            padding: '28px',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', gap: '8px',
            minHeight: '220px',
          }}>
            <i className="bi bi-plus-circle" style={{ fontSize: '24px', color: colors.textLight }}></i>
            <span style={{ fontSize: '13px', fontWeight: 600, color: colors.textMuted }}>More tools coming soon</span>
            <span style={{ fontSize: '12px', color: colors.textLight }}>More pharmaceutical tools in development</span>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Hub;
