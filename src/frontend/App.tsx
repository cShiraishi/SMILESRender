import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Hub from './pages/Hub';
import RendererPage from './pages/RendererPage';
import PredictPage from './pages/PredictPage';
import IupacPage from './pages/IupacPage';
import DescriptorsPage from './pages/DescriptorsPage';
import SimilarityPage from './pages/SimilarityPage';
import ReactionPage from './pages/ReactionPage';

type Page = 'hub' | 'renderer' | 'predict' | 'iupac' | 'descriptors' | 'similarity' | 'reaction';

function getPageFromHash(): Page {
  const hash = window.location.hash.replace('#', '') as Page;
  const valid: Page[] = ['renderer', 'predict', 'iupac', 'descriptors', 'similarity', 'reaction'];
  return valid.includes(hash) ? hash : 'hub';
}

function App() {
  const [page, setPage] = useState<Page>(getPageFromHash);

  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (id: string) => {
    window.location.hash = id;
    setPage(id as Page);
  };

  const goBack = () => navigate('hub');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', backgroundColor: '#f9f9f9' }}>
        {page === 'hub'         && <Hub onNavigate={navigate} />}
        {page === 'renderer'    && <RendererPage onBack={goBack} />}
        {page === 'predict'     && <PredictPage onBack={goBack} />}
        {page === 'iupac'       && <IupacPage onBack={goBack} />}
        {page === 'descriptors' && <DescriptorsPage onBack={goBack} />}
        {page === 'similarity'  && <SimilarityPage onBack={goBack} />}
        {page === 'reaction'    && <ReactionPage onBack={goBack} />}
      </main>
      <Footer />
    </div>
  );
}

export default App;
