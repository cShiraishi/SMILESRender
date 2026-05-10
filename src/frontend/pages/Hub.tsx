import React, { useState } from 'react';
import { colors } from '../styles/themes';
import AtomicBackground from '../components/AtomicBackground';
import AppleDock from '../components/AppleDock';
import DiscoverGrid from '../components/DiscoverGrid';
import MoleculeDrawerModal from '../components/MoleculeDrawerModal';
import SmileIcon from '../components/SmileIcon';
import { parseCSV, autoDetect, detectSmilesColumn } from '../tools/csv';

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
  { id: 'predict',    icon: 'bi-activity',    title: 'ADMET Profiling Lab',         description: 'Multi-engine ADMET predictions: StopTox, StopLight and ADMETlab 3.0.', tags: ['ADMET'], color: '#10b981' },
  { id: 'iupac',      icon: 'bi-tag',         title: 'Chemical Nomenclature',   description: 'Convert SMILES to IUPAC names and vice-versa using intelligent dictionaries.', tags: ['Naming'], color: '#f59e0b' },
  { id: 'descriptors',icon: 'bi-list-ul',     title: 'Molecular Descriptors',   description: 'Generate 200+ physicochemical properties and QSAR fingerprints automatically.', tags: ['QSAR'], color: '#6366f1' },
  { id: 'similarity', icon: 'bi-cpu',      title: 'Similarity Searching',    description: 'Structure-based searching across chemical libraries using Tanimoto distance.', tags: ['Search'], color: '#ef4444' },
  { id: 'reaction',   icon: 'bi-diagram-3',   title: 'Reaction Prediction',     description: 'Predict organic reaction outcomes and mapping using chemical intelligence.', tags: ['Synthesis'], color: '#ec4899' },
  { id: 'peptide',    icon: 'bi-pentagon',    title: 'Peptide Engineering',    description: 'Convert amino acid sequences into chemical structures using PepLink.', tags: ['Peptides'], color: '#ec4899' },
  { id: 'docking',    icon: 'bi-box-arrow-in-right', title: 'Docking LibPrep', description: 'Prepare molecular libraries for docking: 3D generation, minimization and PDBQT export.', tags: ['Docking'], color: '#14b8a6' },
  { id: 'generation', icon: 'bi-stars',       title: 'Molecular Generation', description: 'Generative AI for de novo molecular design and analog generation using REINVENT 4.', tags: ['AI', 'GenAI'], color: '#7c3aed' },
  { id: 'flow',       icon: 'bi-benzene-flow',  title: 'SMILESFlow',           description: 'Pipeline centralizado: Structure → Descriptors → ADMET completo → Docking → Export em uma única tela.', tags: ['Pipeline', 'ADMET'], color: '#3b82f6' },
  { id: 'game',       icon: 'bi-controller',    title: 'SMILESGame',           description: 'Jogo arcade: você é um átomo de carbono — conecte H, O, N e cresça formando moléculas. 1 vida. Sobreviva!', tags: ['Game', 'Fun'], color: '#e11d48' },
  { id: 'datasets',   icon: 'bi-database',      title: 'Datasets',             description: 'Curated training and benchmark datasets: Tox21, ChEMBL, ESOL, BBBP, ZINC-250K and more.', tags: ['Data', 'Open'], color: '#0ea5e9' },
];

interface Props {
  onNavigate: (id: string, smiles?: string) => void;
}

const STARS = [
  { x: 8,  y: 8,  s: 2,   d: 0   }, { x: 22, y: 15, s: 1.5, d: 60  },
  { x: 78, y: 5,  s: 2.5, d: 30  }, { x: 90, y: 20, s: 1,   d: 80  },
  { x: 35, y: 25, s: 1.5, d: 120 }, { x: 65, y: 10, s: 2,   d: 45  },
  { x: 12, y: 60, s: 1,   d: 100 }, { x: 88, y: 55, s: 2,   d: 70  },
  { x: 45, y: 70, s: 1.5, d: 150 }, { x: 70, y: 80, s: 1,   d: 90  },
  { x: 25, y: 85, s: 2,   d: 40  }, { x: 55, y: 90, s: 1.5, d: 110 },
  { x: 15, y: 42, s: 1,   d: 55  }, { x: 82, y: 38, s: 2,   d: 25  },
  { x: 50, y: 5,  s: 1.5, d: 85  }, { x: 38, y: 48, s: 1,   d: 135 },
  { x: 92, y: 72, s: 2.5, d: 65  }, { x: 3,  y: 78, s: 1,   d: 20  },
  { x: 68, y: 62, s: 1.5, d: 95  }, { x: 30, y: 18, s: 2,   d: 145 },
  { x: 58, y: 35, s: 1,   d: 170 }, { x: 7,  y: 50, s: 1.5, d: 190 },
  { x: 95, y: 40, s: 1,   d: 10  }, { x: 42, y: 92, s: 2,   d: 75  },
];

const Hub: React.FC<Props> = ({ onNavigate }) => {
  const [heroSmiles, setHeroSmiles] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isFlowTransitioning, setIsFlowTransitioning] = useState(false);
  const [activeAppColor, setActiveAppColor] = useState(colors.blue);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const stats = [
    { label: 'Prediction Engines', value: '9' },
    { label: 'Supported Formats', value: '13+' },
    { label: 'Batch Size (SMILES)', value: '≤ 20' },
    { label: 'Export Formats', value: 'XLSX · ZIP · PNG' },
  ];

  const handleNavigate = (id: string) => {
    const app = apps.find(a => a.id === id);
    if (app) setActiveAppColor(app.color);

    if (id === 'flow') {
      setIsFlowTransitioning(true);
      setTimeout(() => onNavigate(id, heroSmiles), 2800);
      return;
    }

    setIsTransitioning(true);
    setTimeout(() => {
      onNavigate(id, heroSmiles);
    }, 600);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (file.name.toLowerCase().endsWith('.csv')) {
          const rows = parseCSV(content);
          if (rows.length < 2) return;
          
          const smilesIndex = detectSmilesColumn(rows);
          if (smilesIndex === -1) { alert("SMILES column not found in CSV."); return; }

          const headers = rows[0].map((h: string) => h.replace(/^\ufeff/, '').trim().toLowerCase());
          const nameCol = autoDetect(headers, /name|nome|id|label|drug|molecule/i);
          const nameIndex = nameCol ? headers.indexOf(nameCol) : -1;
          const formattedStr = rows.slice(1)
            .map((r: string[]) => {
              const s = (r[smilesIndex] || '').trim();
              const n = nameIndex !== -1 ? (r[nameIndex] || '').trim().replace(/\n/g, ' ') : '';
              return s ? `${s} ${n}`.trim() : '';
            })
            .filter((s: string) => s.length > 0)
            .join('\n');
          setHeroSmiles(formattedStr);
        } else {
          // txt or smi
          setHeroSmiles(content.trim());
        }
      } catch (err) {
        console.error("Upload error:", err);
        alert("Failed to parse file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      backgroundColor: 'transparent',
      overflowX: 'hidden',
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', animation: 'pulseLogo 0.8s ease-out forwards' }}>
            <SmileIcon size={72} color="rgba(255,255,255,0.95)" />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '22px', letterSpacing: '0.01em', opacity: 0.95 }}>
              SMILES <span style={{ fontWeight: 300 }}>Render</span>
            </span>
          </div>
        )}
      </div>

      {/* SMILESFlow — Molecule Transfer Transition */}
      {isFlowTransitioning && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1001, overflow: 'hidden',
          background: 'linear-gradient(135deg, #051225 0%, #0a1e38 50%, #051225 100%)',
          animation: 'flowBgIn 0.28s ease-out forwards',
        }}>

          {/* Grid tech */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }} />

          {/* Particles */}
          {STARS.map((st, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${st.x}%`, top: `${st.y}%`,
              width: st.s, height: st.s, borderRadius: '50%', background: 'rgba(147,197,253,0.55)',
              opacity: 0, animation: `starAppear 0.4s ease-out ${st.d}ms forwards`,
            }} />
          ))}

          {/* Computer (left) */}
          <div style={{
            position: 'absolute', left: '10%', top: '50%',
            opacity: 0, animation: 'slideInLeft 0.5s ease-out 0.1s forwards',
          }}>
            <svg viewBox="0 0 100 88" width="140" height="123" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="screenGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"  stopColor="#3b82f6" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
                </radialGradient>
              </defs>
              <rect x="2" y="2" width="96" height="64" rx="5" fill="#1e293b" stroke="#3b82f6" strokeWidth="2"/>
              <rect x="8" y="8" width="84" height="50" rx="3" fill="#070f1e"/>
              <rect x="8" y="8" width="84" height="50" rx="3" fill="url(#screenGlow)" style={{ animation: 'screenPulse 1.4s ease-in-out 0.3s infinite alternate' }}/>
              <g transform="translate(50, 33)">
                <polygon points="0,-14 12.1,-7 12.1,7 0,14 -12.1,7 -12.1,-7" fill="none" stroke="#60a5fa" strokeWidth="1.6"/>
                <circle cx="0" cy="0" r="7" fill="none" stroke="#93c5fd" strokeWidth="1.1"/>
                <circle cx="0" cy="-14" r="3" fill="#ef4444"/>
                <circle cx="12.1" cy="-7" r="2.5" fill="#8b5cf6"/>
                <circle cx="12.1" cy="7" r="2.5" fill="#10b981"/>
                <circle cx="0" cy="14" r="3" fill="#fbbf24"/>
                <circle cx="-12.1" cy="7" r="2.5" fill="#f97316"/>
                <circle cx="-12.1" cy="-7" r="2.5" fill="#ec4899"/>
              </g>
              <rect x="40" y="66" width="20" height="8" rx="1" fill="#334155"/>
              <rect x="26" y="74" width="48" height="6" rx="2" fill="#334155"/>
            </svg>
            <div style={{ textAlign: 'center', marginTop: 5, fontSize: 10, fontWeight: 700, color: 'rgba(96,165,250,0.65)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              SMILESFlow
            </div>
          </div>

          {/* Dashed trail */}
          <svg style={{ position: 'absolute', top: '50%', left: '25%', width: '50%', overflow: 'visible', transform: 'translateY(-50%)' }} height="2">
            <line x1="0" y1="1" x2="100%" y2="1" stroke="rgba(59,130,246,0.22)" strokeWidth="1.5" strokeDasharray="6 8"/>
          </svg>

          {/* Traveling molecule */}
          <div style={{
            position: 'absolute', left: '25%', top: '50%',
            opacity: 0,
            animation: 'moleculeTravel 2.0s cubic-bezier(0.25, 0.1, 0.25, 1) 0.55s forwards',
            filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.75))',
          }}>
            <svg viewBox="-30 -30 60 60" width="56" height="56" xmlns="http://www.w3.org/2000/svg">
              <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="rgba(251,191,36,0.08)" stroke="#fbbf24" strokeWidth="2.5"/>
              <circle cx="0" cy="0" r="11" fill="none" stroke="#f97316" strokeWidth="1.5"/>
              <circle cx="0" cy="-22" r="5" fill="#ef4444"/>
              <circle cx="19" cy="-11" r="4" fill="#8b5cf6"/>
              <circle cx="19" cy="11" r="4" fill="#10b981"/>
              <circle cx="0" cy="22" r="5" fill="#3b82f6"/>
              <circle cx="-19" cy="11" r="4" fill="#f59e0b"/>
              <circle cx="-19" cy="-11" r="4" fill="#ec4899"/>
              <circle cx="0" cy="0" r="4" fill="#fbbf24"/>
            </svg>
          </div>

          {/* Person / Researcher (right) */}
          <div style={{
            position: 'absolute', right: '9%', top: '50%',
            opacity: 0,
            animation: 'slideInRight 0.5s ease-out 0.15s forwards, personGlow 0.5s ease-out 2.35s both',
          }}>
            <svg viewBox="0 0 90 112" width="105" height="131" xmlns="http://www.w3.org/2000/svg">
              {/* Head */}
              <circle cx="45" cy="16" r="14" fill="#fde68a" stroke="#f59e0b" strokeWidth="1.5"/>
              {/* Glasses */}
              <circle cx="38" cy="15" r="4.5" fill="none" stroke="#1e3a5f" strokeWidth="1.5"/>
              <circle cx="52" cy="15" r="4.5" fill="none" stroke="#1e3a5f" strokeWidth="1.5"/>
              <line x1="42.5" y1="15" x2="47.5" y2="15" stroke="#1e3a5f" strokeWidth="1.5"/>
              <line x1="33.5" y1="14" x2="30" y2="13" stroke="#1e3a5f" strokeWidth="1.5"/>
              <line x1="56.5" y1="14" x2="60" y2="13" stroke="#1e3a5f" strokeWidth="1.5"/>
              {/* Smile */}
              <path d="M 40 20 Q 45 25 50 20" fill="none" stroke="#92400e" strokeWidth="1.5" strokeLinecap="round"/>
              {/* Lab coat */}
              <rect x="27" y="33" width="36" height="46" rx="9" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1"/>
              <path d="M 45 33 L 39 51 L 45 49" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="0.8"/>
              <path d="M 45 33 L 51 51 L 45 49" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="0.8"/>
              {/* Left arm — extended toward molecule */}
              <path d="M 27 44 C 14 43 6 39 1 34" stroke="#fde68a" strokeWidth="9" strokeLinecap="round" fill="none"/>
              <path d="M 27 44 C 14 43 6 39 1 34" stroke="#e2e8f0" strokeWidth="7" strokeLinecap="round" fill="none"/>
              {/* Right arm — slightly back */}
              <path d="M 63 44 C 74 49 80 54 84 60" stroke="#fde68a" strokeWidth="9" strokeLinecap="round" fill="none"/>
              <path d="M 63 44 C 74 49 80 54 84 60" stroke="#e2e8f0" strokeWidth="7" strokeLinecap="round" fill="none"/>
              {/* Legs */}
              <line x1="38" y1="79" x2="33" y2="105" stroke="#64748b" strokeWidth="8" strokeLinecap="round"/>
              <line x1="52" y1="79" x2="57" y2="105" stroke="#64748b" strokeWidth="8" strokeLinecap="round"/>
            </svg>
            <div style={{ textAlign: 'center', marginTop: 4, fontSize: 10, fontWeight: 700, color: 'rgba(253,230,138,0.65)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Researcher
            </div>
          </div>

          {/* Labels */}
          <div style={{
            position: 'absolute', bottom: '7%', width: '100%', textAlign: 'center',
            animation: 'flowTextIn 0.45s ease-out 0.2s both',
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: '#f1f5f9', textShadow: '0 0 28px rgba(96,165,250,0.4)' }}>
              SMILES<span style={{ color: '#3b82f6' }}>Flow</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.8)' }}>
              Molecular Screening Pipeline
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6', animation: `dotBounce 0.7s ease-in-out ${i * 0.18}s infinite alternate` }} />
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulseLogo {
          0%   { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1.2); opacity: 1; }
        }
        @keyframes flowBgIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes starAppear {
          from { opacity: 0; transform: scale(0); }
          to   { opacity: 0.7; transform: scale(1); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateY(-50%) translateX(-28px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateY(-50%) translateX(28px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        @keyframes moleculeTravel {
          0%   { opacity: 0;   transform: translate(0, -50%)      scale(0.4); }
          8%   { opacity: 1;   transform: translate(0, -50%)      scale(1.15); }
          82%  { opacity: 1;   transform: translate(44vw, -50%)   scale(1); }
          92%  { opacity: 0.7; transform: translate(46vw, -50%)   scale(1.25); }
          100% { opacity: 0;   transform: translate(46vw, -50%)   scale(0.15); }
        }
        @keyframes screenPulse {
          from { opacity: 0.4; }
          to   { opacity: 1; }
        }
        @keyframes personGlow {
          from { filter: drop-shadow(0 0 0px rgba(251,191,36,0)); }
          to   { filter: drop-shadow(0 0 22px rgba(251,191,36,0.65)); }
        }
        @keyframes flowTextIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotBounce {
          from { transform: translateY(0);    opacity: 0.4; }
          to   { transform: translateY(-5px); opacity: 1; }
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
                    maxHeight: '150px', height: '52px', fontFamily: 'monospace',
                  }}
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = '52px';
                    el.style.height = (el.scrollHeight) + 'px';
                  }}
                />
                <label 
                  title="Upload CSV"
                  style={{
                    backgroundColor: 'transparent', color: colors.blue, border: 'none', padding: '12px',
                    borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s ease',
                    marginRight: '2px', display: 'flex', alignItems: 'center'
                  }}
                >
                  <i className="bi bi-file-earmark-arrow-up" style={{ fontSize: '20px' }}></i>
                  <input type="file" accept=".csv,.txt,.smi" style={{ display: 'none' }} onChange={handleFileUpload} />
                </label>
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
