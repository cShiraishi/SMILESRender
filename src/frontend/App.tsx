import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import AtomicBackground from './components/AtomicBackground';
import Hub from './pages/Hub';
import RendererPage from './pages/RendererPage';
import PredictPage from './pages/PredictPage';
import IupacPage from './pages/IupacPage';
import DescriptorsPage from './pages/DescriptorsPage';
import SimilarityPage from './pages/SimilarityPage';
import ReactionPage from './pages/ReactionPage';
import LibraryPage from './pages/LibraryPage';

type Page = 'hub' | 'renderer' | 'predict' | 'iupac' | 'descriptors' | 'similarity' | 'reaction' | 'library';

function getPageFromHash(): Page {
  const hash = window.location.hash.replace('#', '') as Page;
  const valid: Page[] = ['renderer', 'predict', 'iupac', 'descriptors', 'similarity', 'reaction', 'library'];
  return valid.includes(hash) ? hash : 'hub';
}

function App() {
  const [page, setPage] = useState<Page>(getPageFromHash);
  const [sharedSmiles, setSharedSmiles] = useState('');

  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (id: string, smiles?: string) => {
    if (smiles !== undefined) setSharedSmiles(smiles);
    window.location.hash = id;
    setPage(id as Page);
  };

  const goBack = () => navigate('hub');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      <AtomicBackground />
      <Header />
      <main style={{ flex: 1, width: '100%', backgroundColor: 'transparent' }}>
        {page === 'hub'         && <Hub onNavigate={navigate} />}
        {page === 'renderer'    && <RendererPage onBack={goBack} initialSmiles={sharedSmiles} />}
        {page === 'predict'     && <PredictPage onBack={goBack} initialSmiles={sharedSmiles} />}
        {page === 'iupac'       && <IupacPage onBack={goBack} initialSmiles={sharedSmiles} />}
        {page === 'descriptors' && <DescriptorsPage onBack={goBack} initialSmiles={sharedSmiles} />}
        {page === 'similarity'  && <SimilarityPage onBack={goBack} initialSmiles={sharedSmiles} />}
        {page === 'reaction'    && <ReactionPage onBack={goBack} initialSmiles={sharedSmiles} />}
        {page === 'library'     && <LibraryPage onBack={goBack} initialSmiles={sharedSmiles} />}
      </main>
      <Footer />
    </div>
  );
}

export default App;
