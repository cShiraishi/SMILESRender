import React, { useState } from 'react';
import { colors } from '../styles/themes';
import AtomicBackground from '../components/AtomicBackground';
import AppleDock from '../components/AppleDock';
import DiscoverGrid from '../components/DiscoverGrid';
import MoleculeDrawerModal from '../components/MoleculeDrawerModal';

interface HubApp {
  id: string;
  icon: string;
  title: string;
  description: string;
  tags: string[];
  color: string;
}

const apps: HubApp[] = [
  { id: 'library',    icon: 'bi-grid-1x2',    title: 'SMILES Library Dashboard', description: 'Advanced inventory analysis, chemical space visualization and library analytics.', tags: ['Inventory'], color: '#0ea5e9' },
  { id: 'renderer',   icon: 'bi-box',         title: 'Structure Rendering',      description: 'High-fidelity 2D/3D molecular visualization with RDKit-driven precision.', tags: ['Visualization'], color: '#8b5cf6' },
  { id: 'predict',    icon: 'bi-activity',    title: 'ADMET Profiling',         description: 'Multi-engine ADMET predictions: StopTox, StopLight and ADMETlab 3.0.', tags: ['ADMET'], color: '#10b981' },
  { id: 'iupac',      icon: 'bi-tag',         title: 'Chemical Nomenclature',   description: 'Convert SMILES to IUPAC names and vice-versa using intelligent dictionaries.', tags: ['Naming'], color: '#f59e0b' },
  { id: 'descriptors',icon: 'bi-list-ul',     title: 'Molecular Descriptors',   description: 'Generate 200+ physicochemical properties and QSAR fingerprints automatically.', tags: ['QSAR'], color: '#6366f1' },
  { id: 'similarity', icon: 'bi-cpu',      title: 'Similarity Searching',    description: 'Structure-based searching across chemical libraries using Tanimoto distance.', tags: ['Search'], color: '#ef4444' },
  { id: 'reaction',   icon: 'bi-diagram-3',   title: 'Reaction Prediction',     description: 'Predict organic reaction outcomes and mapping using chemical intelligence.', tags: ['Synthesis'], color: '#ec4899' },
  { id: 'peptide',    icon: 'bi-pentagon',    title: 'Peptide Engineering',    description: 'Convert amino acid sequences into chemical structures using PepLink.', tags: ['Peptides'], color: '#ec4899' },
];

interface Props {
  onNavigate: (id: string, smiles?: string) => void;
}

const Hub: React.FC<Props> = ({ onNavigate }) => {
  const [heroSmiles, setHeroSmiles] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeAppColor, setActiveAppColor] = useState(colors.blue);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const stats = [
    { label: 'Prediction Engines', value: '5' },
    { label: 'Supported Formats', value: '13+' },
    { label: 'Batch Size (SMILES)', value: '≤ 20' },
    { label: 'Export Formats', value: 'XLSX · ZIP · PNG' },
  ];

  const handleNavigate = (id: string) => {
    const app = apps.find(a => a.id === id);
    if (app) setActiveAppColor(app.color);
    
    setIsTransitioning(true);
    setTimeout(() => {
      onNavigate(id, heroSmiles);
    }, 600); // iOS style transition time
  };

  return (
    <div style={{ 
      position: 'relative', 
      minHeight: '100vh',
      backgroundColor: 'transparent', // Now shows the global background
      overflowX: 'hidden'
    }}>
      {/* Transition Overlay (iOS Style Expansion) */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundColor: activeAppColor,
        zIndex: isTransitioning ? 1000 : -1,
        pointerEvents: 'none',
        opacity: isTransitioning ? 1 : 0,
        transition: 'opacity 0.6s cubic-bezier(0.645, 0.045, 0.355, 1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isTransitioning && (
          <div style={{ animation: 'pulseLogo 0.8s ease-out forwards' }}>
            <img src="static/logo.png" alt="Logo" style={{ height: '80px', filter: 'brightness(0) invert(1)' }} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseLogo {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>

      {/* Main UI Layer */}
      <div style={{ 
        position: 'relative', 
        zIndex: 1, 
        opacity: isTransitioning ? 0 : 1,
        transition: 'opacity 0.4s ease, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isTransitioning ? 'scale(0.96) translateY(20px)' : 'scale(1) translateY(0)'
      }}>
        
        {/* Hero Section */}
        <div style={{ textAlign: 'center', padding: '120px 24px 60px' }}>
          <div style={{ maxWidth: '96%', margin: '0 auto' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: colors.blue, backgroundColor: `${colors.blue}12`,
              padding: '6px 16px', borderRadius: '30px', marginBottom: '24px',
              border: `1px solid ${colors.blue}20`
            }}>
               <i className="bi bi-stars" /> 2026 Scientific Edition — Now with QSAR Fingerprints
            </div>

            <h1 style={{
              fontSize: 'clamp(40px, 6vw, 64px)', fontWeight: 600, color: colors.navy,
              lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: '24px'
            }}>
              Molecular intelligence with <br/>
              <span style={{ fontWeight: 900, color: '#f85a1a' }}>SMILES data</span>
            </h1>

            <p style={{ fontSize: '18px', color: colors.textMuted, lineHeight: 1.6, marginBottom: '48px', maxWidth: '800px', margin: '0 auto 48px' }}>
              The API to profile, render, and rank chemical libraries at scale.
              Integrated with 5 ADMET engines and QSAR descriptors.
            </p>

            <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                backgroundColor: '#fff', borderRadius: '16px', border: `1px solid ${colors.border}`,
                display: 'flex', alignItems: 'center', padding: '4px 4px 4px 16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
              }}>
                <i className="bi bi-globe2" style={{ color: colors.textLight, fontSize: '18px' }} />
                <textarea
                  placeholder="Paste SMILES strings here..."
                  value={heroSmiles}
                  onChange={(e) => setHeroSmiles(e.target.value)}
                  style={{
                    flex: 1, border: 'none', background: 'none', resize: 'none',
                    padding: '14px 16px', fontSize: '16px', color: colors.text, outline: 'none',
                    maxHeight: '150px', height: '52px', fontFamily: 'monospace'
                  }}
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = '52px';
                    el.style.height = (el.scrollHeight) + 'px';
                  }}
                />
                <button 
                  onClick={() => setIsDrawerOpen(true)}
                  title="Draw Molecule"
                  style={{
                    backgroundColor: 'transparent', color: colors.blue, border: 'none', padding: '12px',
                    borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s ease',
                    marginRight: '8px'
                  }}
                >
                  <i className="bi bi-pencil-square" style={{ fontSize: '20px' }}></i>
                </button>
                <button 
                  onClick={() => handleNavigate('predict')}
                  style={{
                    backgroundColor: colors.blue, color: '#fff', border: 'none', padding: '12px 14px',
                    borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                >
                  <i className="bi bi-arrow-right" style={{ fontSize: '20px' }}></i>
                </button>
              </div>

              {/* Refactored Apple Dock */}
              <AppleDock 
                apps={apps.map(a => ({ id: a.id, icon: a.icon, label: a.title, color: a.color }))}
                onNavigate={handleNavigate}
              />
            </div>
          </div>
        </div>

        {/* Info Strip */}
        <div style={{ backgroundColor: '#fff', borderTop: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: '24px 0' }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', justifyContent: 'center', gap: '80px', flexWrap: 'wrap' }}>
            {stats.map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: colors.blue }}>{s.value}</div>
                <div style={{ fontSize: '10px', color: colors.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Refactored Discover Grid */}
        <div style={{ maxWidth: '96%', margin: '0 auto', padding: '48px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', color: colors.textMuted }}>
            <i className="bi bi-grid-fill" style={{ fontSize: '15px' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Discover Tools Library</span>
          </div>
          <DiscoverGrid 
            apps={apps}
            onNavigate={handleNavigate}
          />
        </div>

        <MoleculeDrawerModal 
          isOpen={isDrawerOpen} 
          onClose={() => setIsDrawerOpen(false)}
          onApply={(smi) => {
            setHeroSmiles(prev => prev ? prev + '\n' + smi : smi);
          }}
        />
      </div>
    </div>
  );
};

export default Hub;
