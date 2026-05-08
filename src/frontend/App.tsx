import React, { useState, useEffect } from 'react';
import SmileIcon from './components/SmileIcon';

const _MOL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><line x1="12" y1="12" x2="28" y2="7" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="12" x2="8" y2="28" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="12" x2="28" y2="26" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="6" fill="#3b82f6"/><circle cx="28" cy="7" r="4" fill="#ef4444"/><circle cx="8" cy="28" r="3.5" fill="#8b5cf6"/><circle cx="28" cy="26" r="3" fill="#10b981"/></svg>`;
const MOL_CURSOR_CSS = `url("data:image/svg+xml;base64,${btoa(_MOL_SVG)}") 12 12, auto`;
import Header from './components/Header';
import Footer from './components/Footer';
import AtomicBackground from './components/AtomicBackground';
import PersistentTaskbar from './components/PersistentTaskbar';
import Hub from './pages/Hub';
import RendererPage from './pages/RendererPage';
import PredictPage from './pages/PredictPage';
import IupacPage from './pages/IupacPage';
import DescriptorsPage from './pages/DescriptorsPage';
import SimilarityPage from './pages/SimilarityPage';
import ReactionPage from './pages/ReactionPage';
import LibraryPage from './pages/LibraryPage';
import PeptidePage from './pages/PeptidePage';
import DockingPage from './pages/DockingPage';

const TASKBAR_APPS = [
  { id: 'library',     icon: 'bi-grid-1x2',            label: 'SMILES Library',       color: '#0ea5e9' },
  { id: 'renderer',    icon: 'bi-box',                  label: 'Structure Rendering',  color: '#8b5cf6' },
  { id: 'predict',     icon: 'bi-activity',             label: 'ADMET Profiling',      color: '#10b981' },
  { id: 'iupac',       icon: 'bi-tag',                  label: 'Nomenclature',         color: '#f59e0b' },
  { id: 'descriptors', icon: 'bi-list-ul',              label: 'Descriptors',          color: '#6366f1' },
  { id: 'similarity',  icon: 'bi-cpu',                  label: 'Similarity Search',    color: '#ef4444' },
  { id: 'reaction',    icon: 'bi-diagram-3',            label: 'Reaction Prediction',  color: '#ec4899' },
  { id: 'peptide',     icon: 'bi-pentagon',             label: 'Peptide Engineering',  color: '#ec4899' },
  { id: 'docking',     icon: 'bi-box-arrow-in-right',   label: 'Docking LibPrep',      color: '#14b8a6' },
];

type Page = 'hub' | 'renderer' | 'predict' | 'iupac' | 'descriptors' | 'similarity' | 'reaction' | 'library' | 'peptide' | 'docking';

function getPageFromHash(): Page {
  const hash = window.location.hash.replace('#', '') as Page;
  const valid: Page[] = ['renderer', 'predict', 'iupac', 'descriptors', 'similarity', 'reaction', 'library', 'peptide', 'docking'];
  return valid.includes(hash) ? hash : 'hub';
}

function App() {
  const [page, setPage] = useState<Page>(getPageFromHash);
  const [sharedSmiles, setSharedSmiles] = useState('');
  const [txColor, setTxColor] = useState('#0ea5e9');
  const [txActive, setTxActive] = useState(false);
  const txTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (id: string, smiles?: string) => {
    if (smiles !== undefined) setSharedSmiles(smiles);

    // Hub→tool transition is handled inside Hub.tsx; skip overlay there.
    // For tool→tool and tool→hub we run our own flash.
    if (page !== 'hub') {
      const dest = TASKBAR_APPS.find(a => a.id === id);
      setTxColor(dest?.color ?? '#64748b');
      setTxActive(true);
      if (txTimer.current) clearTimeout(txTimer.current);
      txTimer.current = setTimeout(() => {
        window.location.hash = id;
        setPage(id as Page);
        setTxActive(false);
      }, 1450);
      return;
    }

    window.location.hash = id;
    setPage(id as Page);
  };

  const goBack = () => navigate('hub');

  const showTaskbar = page !== 'hub';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: '100vh', position: 'relative' }}>
      <AtomicBackground />
      <Header />

      {/* Tool-to-tool transition overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 900,
        backgroundColor: txColor,
        pointerEvents: txActive ? 'all' : 'none',
        opacity: txActive ? 1 : 0,
        transition: txActive
          ? 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
          : 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {txActive && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            animation: 'txLogoPulse 1.45s ease-out both',
          }}>
            <SmileIcon size={56} color="rgba(255,255,255,0.9)" />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '18px', letterSpacing: '0.01em', opacity: 0.9 }}>
              SMILES <span style={{ fontWeight: 300 }}>Render</span>
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes txLogoPulse {
          from { transform: scale(0.85); opacity: 0; }
          to   { transform: scale(1.05); opacity: 0.9; }
        }
        *, *::before, *::after { cursor: ${MOL_CURSOR_CSS} !important; }
        a, button, [role="button"], select, label[for] { cursor: ${MOL_CURSOR_CSS} !important; }
        input[type="range"] { cursor: ${MOL_CURSOR_CSS} !important; }
      `}</style>

      <main style={{ flex: 1, width: '100%', backgroundColor: 'transparent', paddingBottom: showTaskbar ? '64px' : 0 }}>
        {page === 'hub'         && <Hub onNavigate={navigate} />}
        {page === 'renderer'    && <RendererPage onBack={goBack} initialSmiles={sharedSmiles} onNavigate={navigate} onSmilesChange={setSharedSmiles} />}
        {page === 'predict'     && <PredictPage onBack={goBack} initialSmiles={sharedSmiles} onSmilesChange={setSharedSmiles} />}
        {page === 'iupac'       && <IupacPage onBack={goBack} initialSmiles={sharedSmiles} onSmilesChange={setSharedSmiles} />}
        {page === 'descriptors' && <DescriptorsPage onBack={goBack} initialSmiles={sharedSmiles} onSmilesChange={setSharedSmiles} />}
        {page === 'similarity'  && <SimilarityPage onBack={goBack} initialSmiles={sharedSmiles} onSmilesChange={setSharedSmiles} />}
        {page === 'reaction'    && <ReactionPage onBack={goBack} initialSmiles={sharedSmiles} />}
        {page === 'library'     && <LibraryPage onBack={goBack} initialSmiles={sharedSmiles} onSmilesChange={setSharedSmiles} />}
        {page === 'peptide'     && <PeptidePage onBack={goBack} initialSmiles={sharedSmiles} />}
        {page === 'docking'     && <DockingPage onBack={goBack} initialSmiles={sharedSmiles} onSmilesChange={setSharedSmiles} />}
      </main>
      {!showTaskbar && <Footer />}
      {showTaskbar && (
        <PersistentTaskbar
          apps={TASKBAR_APPS}
          activePage={page}
          onNavigate={navigate}
          onHome={goBack}
        />
      )}
    </div>
  );
}

export default App;
