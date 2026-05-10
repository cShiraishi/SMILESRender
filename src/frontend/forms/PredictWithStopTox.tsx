import React, { useRef, useState, useEffect } from 'react';
import Prediction from '../components/Prediction';
import StopLight from '../components/StopLight';
import ToolErrorBoundary from '../components/ToolErrorBoundary';
import Tox21 from '../components/Tox21';
import DeepADMET from '../components/DeepADMET';
import GraphB3 from '../components/GraphB3';
import Dashboard from '../components/Dashboard';
import MolImage from '../components/MolImage';
import MoleculeDrawerModal from '../components/MoleculeDrawerModal';
import RDKitFilters from '../components/RDKitFilters';
import * as csvTools from '../tools/csv';

// ── Science quotes shown during ADMET analysis ────────────────────────────────

const SCIENCE_QUOTES: { text: string; author: string }[] = [
  { text: "The good thing about science is that it's true whether or not you believe in it.", author: "Neil deGrasse Tyson" },
  { text: "Science is not only a disciple of reason but, also, one of romance and passion.", author: "Stephen Hawking" },
  { text: "In science there are no shortcuts to truth.", author: "Karl Popper" },
  { text: "Research is what I'm doing when I don't know what I'm doing.", author: "Wernher von Braun" },
  { text: "The most exciting phrase to hear in science is not 'Eureka!' but 'That's funny...'", author: "Isaac Asimov" },
  { text: "Science is the great antidote to the poison of enthusiasm and superstition.", author: "Adam Smith" },
  { text: "The important thing is to not stop questioning. Curiosity has its own reason for existing.", author: "Albert Einstein" },
  { text: "Equipped with his five senses, man explores the universe around him and calls the adventure Science.", author: "Edwin Powell Hubble" },
  { text: "To know what you know and what you do not know — that is true knowledge.", author: "Confucius" },
  { text: "In every walk with nature, one receives far more than he seeks.", author: "John Muir" },
  { text: "An experiment is a question which science poses to Nature, and a measurement is the recording of Nature's answer.", author: "Max Planck" },
  { text: "The aim of science is not to open the door to infinite wisdom, but to set a limit to infinite error.", author: "Bertolt Brecht" },
  { text: "Somewhere, something incredible is waiting to be known.", author: "Carl Sagan" },
  { text: "Nothing in life is to be feared, it is only to be understood.", author: "Marie Curie" },
  { text: "Science is a way of thinking much more than it is a body of knowledge.", author: "Carl Sagan" },
  { text: "The first gulp from the glass of natural sciences will turn you into an atheist, but at the bottom of the glass God is waiting.", author: "Werner Heisenberg" },
  { text: "I am not ashamed to confess that I am ignorant of what I do not know.", author: "Marcus Tullius Cicero" },
  { text: "Science knows no country, because knowledge belongs to humanity, and is the torch which illuminates the world.", author: "Louis Pasteur" },
  { text: "The physician who knows only medicine knows not even medicine.", author: "Sir William Osler" },
  { text: "In theory, there is no difference between theory and practice. In practice, there is.", author: "Yogi Berra" },
  { text: "The strength of a theory is not what it allows, but what it does not allow.", author: "Karl Popper" },
  { text: "If you thought that science was certain — well, that is just an error on your part.", author: "Richard Feynman" },
  { text: "I would rather have questions that can't be answered than answers that can't be questioned.", author: "Richard Feynman" },
  { text: "Life is not easy for any of us. But what of that? We must have perseverance and above all confidence in ourselves.", author: "Marie Curie" },
  { text: "Look deep into nature, and then you will understand everything better.", author: "Albert Einstein" },
  { text: "The cosmos is within us. We are made of star-stuff.", author: "Carl Sagan" },
  { text: "One, remember to look up at the stars and not down at your feet.", author: "Stephen Hawking" },
  { text: "No great discovery was ever made without a bold guess.", author: "Isaac Newton" },
  { text: "I have no special talent. I am only passionately curious.", author: "Albert Einstein" },
  { text: "Facts do not cease to exist because they are ignored.", author: "Aldous Huxley" },
  { text: "Science is built up with facts, as a house is with stones. But a collection of facts is no more a science than a heap of stones is a house.", author: "Henri Poincaré" },
  { text: "It doesn't matter how beautiful your theory is... if it disagrees with experiment, it's wrong.", author: "Richard Feynman" },
  { text: "The art of medicine consists of amusing the patient while nature cures the disease.", author: "Voltaire" },
  { text: "To raise new questions, new possibilities, to regard old problems from a new angle requires creative imagination.", author: "Albert Einstein" },
  { text: "We especially need imagination in science. It is not all mathematics, nor all logic, but it is somewhat beauty and poetry.", author: "Maria Montessori" },
  { text: "Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world.", author: "Albert Einstein" },
  { text: "The scientist is not a person who gives the right answers, he's one who asks the right questions.", author: "Claude Lévi-Strauss" },
  { text: "Thousands of candles can be lighted from a single candle, and the life of the candle will not be shortened.", author: "Buddha" },
  { text: "A thinker sees his own actions as experiments and questions — as attempts to find out something.", author: "Friedrich Nietzsche" },
  { text: "Science and everyday life cannot and should not be separated.", author: "Rosalind Franklin" },
  { text: "The day science begins to study non-physical phenomena, it will make more progress in one decade than in all the previous centuries.", author: "Nikola Tesla" },
  { text: "Men love to wonder, and that is the seed of science.", author: "Ralph Waldo Emerson" },
  { text: "The most incomprehensible thing about the world is that it is comprehensible.", author: "Albert Einstein" },
  { text: "Nature uses only the longest threads to weave her patterns, so each small piece of her fabric reveals the organization of the entire tapestry.", author: "Richard Feynman" },
  { text: "Science is simply the word we use to describe a method of organizing our curiosity.", author: "Tim Minchin" },
  { text: "The saddest aspect of life right now is that science gathers knowledge faster than society gathers wisdom.", author: "Isaac Asimov" },
  { text: "The most beautiful thing we can experience is the mysterious. It is the source of all true art and science.", author: "Albert Einstein" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "In questions of science, the authority of a thousand is not worth the humble reasoning of a single individual.", author: "Galileo Galilei" },
  { text: "Science is organized knowledge. Wisdom is organized life.", author: "Immanuel Kant" },
  { text: "The effort to understand the universe is one of the very few things that lifts human life a little above the level of farce.", author: "Steven Weinberg" },
  { text: "What we observe is not nature itself, but nature exposed to our method of questioning.", author: "Werner Heisenberg" },
  { text: "Every great advance in science has issued from a new audacity of imagination.", author: "John Dewey" },
  { text: "There is no royal road to science, and only those who do not dread the fatiguing climb of its steep paths have a chance of gaining its luminous summits.", author: "Karl Marx" },
  { text: "Science without religion is lame, religion without science is blind.", author: "Albert Einstein" },
  { text: "All truths are easy to understand once they are discovered; the point is to discover them.", author: "Galileo Galilei" },
  { text: "The only way to have a friend is to be one.", author: "Ralph Waldo Emerson" },
  { text: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill" },
  { text: "Do not go where the path may lead, go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson" },
  { text: "The pessimist sees difficulty in every opportunity. The optimist sees opportunity in every difficulty.", author: "Winston Churchill" },
  { text: "There is only one way to avoid criticism: do nothing, say nothing, and be nothing.", author: "Aristotle" },
  { text: "Ask not what your country can do for you — ask what you can do for your country.", author: "John F. Kennedy" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "We must believe that we are gifted for something and that this thing must be attained.", author: "Marie Curie" },
  { text: "A ship is always safe at the shore — but that is NOT what it is built for.", author: "Albert Einstein" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "Tell me and I forget, teach me and I may remember, involve me and I learn.", author: "Benjamin Franklin" },
  { text: "The cure for boredom is curiosity. There is no cure for curiosity.", author: "Dorothy Parker" },
  { text: "It is not the strongest of the species that survive, nor the most intelligent, but the one most responsive to change.", author: "Charles Darwin" },
  { text: "Equipped with his five senses, man explores the universe around him and calls the adventure Science.", author: "Edwin Hubble" },
  { text: "A man who dares to waste one hour of time has not discovered the value of life.", author: "Charles Darwin" },
  { text: "All science is either physics or stamp collecting.", author: "Ernest Rutherford" },
  { text: "The good physician treats the disease; the great physician treats the patient who has the disease.", author: "Sir William Osler" },
  { text: "Drugs without a target are like bullets without an aim.", author: "Paul Ehrlich" },
  { text: "If the doors of perception were cleansed, everything would appear to man as it is — infinite.", author: "William Blake" },
  { text: "No problem can be solved from the same level of consciousness that created it.", author: "Albert Einstein" },
  { text: "First, do no harm.", author: "Hippocrates" },
  { text: "Where observation is concerned, chance favours only the prepared mind.", author: "Louis Pasteur" },
  { text: "The structure of DNA is so elegant, so perfectly suited to its purpose, that it makes me believe that there is something more to reality than mere accident.", author: "Francis Crick" },
  { text: "Drugs are taken to treat diseases; if a drug has no side effects, it probably has no effect at all.", author: "Unknown" },
  { text: "In chemistry, everything is about the molecular level.", author: "Linus Pauling" },
  { text: "Nature is a mutable cloud which is always and never the same.", author: "Ralph Waldo Emerson" },
  { text: "The double helix shows us that nature is the master of all chemists.", author: "Max Perutz" },
  { text: "Discovery consists of seeing what everybody has seen and thinking what nobody has thought.", author: "Albert von Szent-Györgyi" },
  { text: "A clever person solves a problem. A wise person avoids it.", author: "Albert Einstein" },
  { text: "Logic will get you from A to Z; imagination will get you everywhere.", author: "Albert Einstein" },
  { text: "The more I learn, the more I realize how much I don't know.", author: "Albert Einstein" },
  { text: "Science is a wonderful thing if one does not have to earn one's living at it.", author: "Albert Einstein" },
  { text: "Everything should be made as simple as possible, but not simpler.", author: "Albert Einstein" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "You can never solve a problem on the level on which it was created.", author: "Albert Einstein" },
  { text: "Small is beautiful.", author: "E.F. Schumacher" },
  { text: "The brain is wider than the sky.", author: "Emily Dickinson" },
  { text: "In science, we must be interested in things, not in persons.", author: "Marie Curie" },
  { text: "The greatest challenge to any thinker is stating the problem in a way that will allow a solution.", author: "Bertrand Russell" },
  { text: "Somewhere, something incredible is waiting to be known.", author: "Sharon Begley" },
  { text: "Science is the poetry of reality.", author: "Richard Dawkins" },
];

function ScienceQuote({ visible }: { visible: boolean }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * SCIENCE_QUOTES.length));
  const [fade, setFade] = useState(true);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % SCIENCE_QUOTES.length);
        setFade(true);
      }, 500);
    }, 7000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;
  const q = SCIENCE_QUOTES[idx];
  return (
    <div style={{
      margin: '14px 0 4px',
      padding: '12px 16px',
      backgroundColor: '#f0f9ff',
      borderLeft: '3px solid #0ea5e9',
      borderRadius: '0 8px 8px 0',
      opacity: fade ? 1 : 0,
      transition: 'opacity 0.5s ease',
    }}>
      <div style={{ fontSize: '12px', color: '#0369a1', fontStyle: 'italic', lineHeight: 1.5, marginBottom: '5px' }}>
        "{q.text}"
      </div>
      <div style={{ fontSize: '10px', color: '#7dd3fc', fontWeight: 700 }}>
        — {q.author}
      </div>
    </div>
  );
}

const defaultSmiles = [
  'CCCCCCCC',
  'C0CCCCC0C0CCCCC0',
  'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H](O)[C@H](O)1',
];

const TOOLS = ['RDKit', 'StopTox', 'StopLight', 'Tox21', 'Deep ADMET', 'GraphB3'] as const;
type ToolName = typeof TOOLS[number];
type ToolState = 'loading' | 'done' | 'error' | 'queued';

const TOOL_COLORS: Record<ToolName, string> = {
  RDKit:      '#0d9488',
  StopTox:    '#b45309',
  StopLight:  '#1d4ed8',
  Tox21:      '#8b5cf6',
  'Deep ADMET': '#ec4899',
  GraphB3:    '#10b981',
};



// ── Component ────────────────────────────────────────────────────────────────
function PredictWithStopTox({ initialSmiles, onSmilesChange }: { initialSmiles?: string; onSmilesChange?: (s: string) => void }) {
  const [smiles, setSmiles] = useState(
    initialSmiles
      ? initialSmiles.split('\n').map(s => s.trim()).filter(Boolean)
      : defaultSmiles
  );
  const [moleculeNames, setMoleculeNames] = useState<Record<string, string>>({});

  // CSV state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows,    setCsvRows]    = useState<string[][]>([]);
  const [smilesCol,  setSmilesCol]  = useState('');
  const [nameCol,    setNameCol]    = useState('');
  const [csvVisible, setCsvVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Run state
  const [smilesToRender, setSmilesToRender] = useState<string[]>([]);
  const [allResults,     setAllResults]     = useState<{ [key: string]: any[] }>({});
  const [toolStatus,     setToolStatus]     = useState<{ [key: string]: ToolState }>({});
  const [activeTab,      setActiveTab]      = useState<'input' | 'results'>('input');
  const [isDrawerOpen,   setIsDrawerOpen]   = useState(false);
  const [expandedSmi,    setExpandedSmi]    = useState<string | null>(null);

  const namesRef = useRef(moleculeNames);
  useEffect(() => { namesRef.current = moleculeNames; }, [moleculeNames]);

  useEffect(() => {
    if (initialSmiles) setSmiles(initialSmiles.split('\n').map(s => s.trim()).filter(Boolean));
  }, [initialSmiles]);


  // ── CSV handlers ────────────────────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const content = csvTools.parseCSV(text);
      if (!content.length) return;
      const headers = content[0];
      const rows = content.slice(1).filter(r => r.some(c => c));
      setCsvHeaders(headers);
      setCsvRows(rows);
      setSmilesCol(csvTools.autoDetect(headers, /smiles/i) || headers[0]);
      setNameCol(csvTools.autoDetect(headers, /name|mol|compound|id/i));
      setCsvVisible(true);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  function importFromCSV() {
    const smiIdx  = csvHeaders.indexOf(smilesCol);
    const nameIdx = nameCol ? csvHeaders.indexOf(nameCol) : -1;
    if (smiIdx < 0) return;

    const newSmiles: string[] = [];
    const newNames: Record<string, string> = {};
    csvRows.forEach(row => {
      const smi = row[smiIdx]?.trim();
      if (!smi) return;
      newSmiles.push(smi);
      if (nameIdx >= 0 && row[nameIdx]?.trim()) newNames[smi] = row[nameIdx].trim();
    });

    // Update state then immediately run predictions
    setSmiles(newSmiles);
    onSmilesChange?.(newSmiles.join('\n'));
    setMoleculeNames(newNames);
    namesRef.current = newNames;

    // Run predictions with the imported list directly
    const list = newSmiles.filter(Boolean);
    const unique = [...new Set(list)];
    const init: { [key: string]: ToolState } = {};
    unique.forEach(smi => TOOLS.forEach(t => { init[`${smi}-${t}`] = 'queued'; }));
    setAllResults({});
    setToolStatus(init);
    setSmilesToRender(unique);
    setActiveTab('results');
  }

  // ── Run ─────────────────────────────────────────────────────────────────────
  const updateResults = (smi: string, tool: string, data: any[]) => {
    const name = namesRef.current[smi] ?? '';
    const enriched = name ? data.map(row => ({ ...row, Name: name })) : data;
    setAllResults(prev => ({ ...prev, [`${smi}-${tool}`]: enriched }));
    setToolStatus(prev => ({
      ...prev,
      [`${smi}-${tool}`]: data.length > 0 ? 'done' : 'error',
    }));
  };

  function loadSmiles() {
    const list = smiles.filter(Boolean);
    const unique = [...new Set(list)];
    const init: { [key: string]: ToolState } = {};
    unique.forEach(smi => TOOLS.forEach(t => { init[`${smi}-${t}`] = 'queued'; }));
    setAllResults({});
    setToolStatus(init);
    setSmilesToRender(unique);
    setActiveTab('results');
  }

  const uniqueSmiles  = [...new Set(smilesToRender)].filter(Boolean);

  // ── Queue: 1 molécula ativa de cada vez para não saturar o servidor ──────────
  useEffect(() => {
    if (activeTab !== 'results' || uniqueSmiles.length === 0) return;
    const anyLoading = uniqueSmiles.some(smi => TOOLS.some(t => toolStatus[`${smi}-${t}`] === 'loading'));
    if (anyLoading) return;
    const next = uniqueSmiles.find(smi => TOOLS.every(t => toolStatus[`${smi}-${t}`] === 'queued'));
    if (!next) return;
    setToolStatus(prev => {
      const up = { ...prev };
      TOOLS.forEach(t => { up[`${next}-${t}`] = 'loading'; });
      return up;
    });
  }, [activeTab, toolStatus, uniqueSmiles]);

  const totalExpected = uniqueSmiles.length * TOOLS.length;
  const doneCount     = Object.values(toolStatus).filter(s => s === 'done' || s === 'error').length;
  const percentage    = totalExpected > 0 ? Math.floor((doneCount / totalExpected) * 100) : 0;
  const isReady       = totalExpected > 0 && doneCount >= totalExpected;

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async (type: 'excel' | 'report') => {
    const flatData = Object.values(allResults).flat();
    if (!flatData.length) { alert('Nenhum dado disponível para exportar.'); return; }
    if (!isReady && type === 'report') {
      const ok = window.confirm(`Análise ${percentage}% concluída. Exportar relatório parcial?`);
      if (!ok) return;
    }
    const endpoint = type === 'excel' ? '/export/excel' : '/export/report';
    const filename  = type === 'excel'
      ? `ADMET_Data_${Date.now()}.xlsx`
      : `ADMET_Report_${Date.now()}.pdf`;
    const mime = type === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
    try {
      const res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flatData) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Erro ao exportar. Verifique o servidor.');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '95%', maxWidth: '1200px' }}>
      {/* Tab nav */}
      <div style={{ display: 'flex', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
        {(['input', 'results'] as const).map(tab => (
          <button key={tab}
            disabled={tab === 'results' && !smilesToRender.length}
            onClick={() => setActiveTab(tab)}
            style={{ 
              backgroundColor: activeTab === tab ? '#1a3a5c' : '#e2e8f0', 
              color: activeTab === tab ? 'white' : '#475569', 
              border: 'none', 
              padding: '12px 24px', 
              borderRadius: '8px', 
              cursor: 'pointer',
              flex: '1 1 auto',
              fontWeight: 600,
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
          >
            <i className={tab === 'input' ? 'bi bi-input-cursor-text' : 'bi bi-bar-chart-fill'} style={{ marginRight: 7 }} />
            {tab === 'input' ? 'SMILES Input' : 'Results Dashboard'}
          </button>
        ))}
      </div>

      {/* ── Input tab ── */}
      {activeTab === 'input' && (
        <div>
          {/* ── Input mode toggle ── */}
          <div style={{ display: 'flex', gap: '0', marginBottom: '16px', border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden', width: 'fit-content' }}>
            {(['smiles', 'csv'] as const).map(mode => (
              <button key={mode}
                onClick={() => setCsvVisible(mode === 'csv')}
                style={{
                  padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold',
                  backgroundColor: (mode === 'csv') === csvVisible ? '#1a3a5c' : '#f8f9fa',
                  color: (mode === 'csv') === csvVisible ? 'white' : '#475569',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                <i className={mode === 'smiles' ? 'bi bi-input-cursor-text' : 'bi bi-file-earmark-spreadsheet'}></i>
                {mode === 'smiles' ? 'SMILES manual' : 'Importar CSV'}
              </button>
            ))}
          </div>

          {/* ── SMILES mode ── */}
          {!csvVisible && (
            <>
              {Object.keys(moleculeNames).length > 0 && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#166534' }}>
                  <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }} />{Object.keys(moleculeNames).length} nomes carregados via CSV.{' '}
                  <button onClick={() => setMoleculeNames({})} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>Remover</button>
                </div>
              )}
              <label style={{ fontSize: '13px', color: '#475569', display: 'block', marginBottom: '6px' }}>
                SMILES para análise (máx. 20) — um por linha:
              </label>
              <textarea
                className="smiles-input"
                style={{ width: '100%', padding: '10px', fontSize: '14px', fontFamily: 'monospace', borderRadius: '6px', border: '1px solid #dee2e6' }}
                value={smiles.join('\n')}
                rows={7}
                onChange={e => setSmiles(e.target.value.split('\n'))}
                placeholder="Cole SMILES, um por linha..."
              />
              <div style={{ padding: '10px 0', display: 'flex', gap: '15px', alignItems: 'center' }}>
                <button onClick={loadSmiles}
                  style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 25px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                  <i className="bi bi-play-fill" style={{ marginRight: 6 }} />Run All Predictions
                </button>
                <button onClick={() => setIsDrawerOpen(true)}
                  style={{ backgroundColor: '#fff', color: '#007bff', border: '1px solid #007bff', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="bi bi-pencil-square"></i> Draw Structure
                </button>
              </div>
            </>
          )}

          {/* ── CSV mode ── */}
          {csvVisible && (
            <div>
              {csvHeaders.length === 0 ? (
                /* Drop zone — no file loaded yet */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const text = ev.target?.result as string;
                        const content = csvTools.parseCSV(text);
                        if (!content.length) return;
                        const headers = content[0];
                        const rows = content.slice(1).filter(r => r.some(c => c));
                        setCsvHeaders(headers);
                        setCsvRows(rows);
                        setSmilesCol(csvTools.autoDetect(headers, /smiles/i) || headers[0]);
                        setNameCol(csvTools.autoDetect(headers, /name|mol|compound|id/i));
                      };
                      reader.readAsText(file, 'UTF-8');
                    }
                  }}
                  style={{
                    border: '2px dashed #94a3b8', borderRadius: '10px', padding: '40px 20px',
                    textAlign: 'center', cursor: 'pointer', backgroundColor: '#f8fafc',
                    transition: 'border-color 0.2s',
                  }}>
                  <i className="bi bi-file-earmark-text" style={{ fontSize: '36px', color: '#94a3b8', marginBottom: '8px', display: 'block' }} />
                  <div style={{ fontWeight: 'bold', color: '#1a3a5c', marginBottom: '4px' }}>
                    Clique ou arraste um arquivo CSV / TSV / TXT
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Suporta vírgula, ponto-e-vírgula e tab como separador · UTF-8
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt"
                    style={{ display: 'none' }} onChange={handleFile} />
                </div>
              ) : (
                /* File loaded — show column selectors + preview */
                <div style={{ backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <strong style={{ color: '#1a3a5c' }}>
                      {csvRows.length} linhas detectadas — configure as colunas:
                    </strong>
                    <button onClick={() => { setCsvHeaders([]); setCsvRows([]); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#64748b', textDecoration: 'underline' }}>
                      Trocar arquivo
                    </button>
                  </div>

                  {/* Column selectors */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 'bold', minWidth: '160px' }}>
                      Coluna SMILES *
                      <select value={smilesCol} onChange={e => setSmilesCol(e.target.value)}
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '2px solid #1a3a5c', fontSize: '13px' }}>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 'bold', minWidth: '160px' }}>
                      Coluna Nome (opcional)
                      <select value={nameCol} onChange={e => setNameCol(e.target.value)}
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}>
                        <option value="">— nenhuma —</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  </div>

                  {/* Preview */}
                  <div style={{ overflowX: 'auto', maxHeight: '200px', overflowY: 'auto', marginBottom: '14px', borderRadius: '6px', border: '1px solid #dee2e6' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>{csvHeaders.map(h => (
                          <th key={h} style={{ padding: '6px 10px', backgroundColor: h === smilesCol ? '#1a3a5c' : h === nameCol ? '#0d9488' : '#475569', color: 'white', textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {h}{h === smilesCol ? ' ★' : h === nameCol ? ' ◆' : ''}
                          </th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 8).map((row, i) => (
                          <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#f8f9fa' : 'white' }}>
                            {row.map((cell, j) => (
                              <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid #dee2e6', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={cell}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvRows.length > 8 && (
                    <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                      Pré-visualizando 8 de {csvRows.length} linhas.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button onClick={importFromCSV}
                      style={{ backgroundColor: '#1a3a5c', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                      <i className="bi bi-play-fill" style={{ marginRight: 6 }} />Importar e rodar {csvRows.filter(r => r[csvHeaders.indexOf(smilesCol)]?.trim()).length} moléculas
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Results tab ── */}
      {activeTab === 'results' && (
        <>
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '10px', border: '1px solid #e0e0e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a3a5c' }}>
                {isReady
                  ? <><i className="bi bi-check-circle-fill" style={{ marginRight: 6, color: '#16a34a' }} />Analysis complete</>
                  : <><i className="bi bi-hourglass-split" style={{ marginRight: 6 }} />Analysing… {percentage}%</>
                }
              </span>
              <span style={{ fontSize: '13px', color: '#666' }}>
                {uniqueSmiles.length} molécula{uniqueSmiles.length !== 1 ? 's' : ''} · {TOOLS.length} tools each
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ width: '100%', height: '8px', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden', marginBottom: '0' }}>
              <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: isReady ? '#16a34a' : '#007bff', transition: 'width 0.4s ease', borderRadius: '4px' }} />
            </div>

            {/* Science quote during loading */}
            <ScienceQuote visible={!isReady} />

            {/* Dashboard Overview — only after full analysis */}
            {isReady && (
              <Dashboard allResults={Object.values(allResults).flat()} uniqueSmiles={uniqueSmiles} moleculeNames={moleculeNames} />
            )}

            {/* Per-molecule status cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {uniqueSmiles.map(smi => {
                const name     = moleculeNames[smi];
                const isExpanded = expandedSmi === smi;
                const molDone  = TOOLS.every(t => toolStatus[`${smi}-${t}`] === 'done' || toolStatus[`${smi}-${t}`] === 'error');
                const molResults = Object.entries(allResults)
                  .filter(([k]) => k.startsWith(smi + '-'))
                  .flatMap(([, v]) => v);
                return (
                  <div key={smi} style={{ backgroundColor: 'white', borderRadius: '10px', border: `1px solid ${isExpanded ? '#0ea5e9' : '#e0e0e0'}`, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                    {/* Header — always visible */}
                    <div
                      onClick={() => molDone && setExpandedSmi(isExpanded ? null : smi)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', cursor: molDone ? 'pointer' : 'default', userSelect: 'none' }}
                    >
                      <MolImage smiles={smi} width={72} height={54} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {name && <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a3a5c', marginBottom: '2px' }}>{name}</div>}
                        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8', wordBreak: 'break-all', lineHeight: 1.4 }}>{smi}</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {TOOLS.map(tool => {
                            const state = toolStatus[`${smi}-${tool}`] ?? 'queued';
                            const iconCls = state === 'done' ? 'bi bi-check-circle-fill' : state === 'error' ? 'bi bi-x-circle-fill' : state === 'queued' ? 'bi bi-pause-circle' : 'bi bi-hourglass-split';
                            return (
                              <span key={tool} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                padding: '2px 8px', borderRadius: '20px', fontSize: '11px',
                                backgroundColor: state === 'done' ? '#dcfce7' : state === 'error' ? '#fee2e2' : state === 'queued' ? '#f8fafc' : '#f1f5f9',
                                color: state === 'done' ? '#16a34a' : state === 'error' ? '#dc2626' : state === 'queued' ? '#94a3b8' : '#64748b',
                                border: `1px solid ${TOOL_COLORS[tool]}22`,
                              }}>
                                <i className={iconCls} /> {tool}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      {molDone && (
                        <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`} style={{ fontSize: '14px', color: '#94a3b8', flexShrink: 0 }} />
                      )}
                    </div>

                    {/* Expanded detail panel */}
                    {isExpanded && molResults.length > 0 && (
                      <div style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '12px 14px' }}>
                        {TOOLS.map(tool => {
                          const rows = molResults.filter(r => r && (r.Tool === tool || (tool === 'RDKit' && String(r.Tool).includes('RDKit'))));
                          if (!rows.length) return null;
                          return (
                            <div key={tool} style={{ marginBottom: '14px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: TOOL_COLORS[tool], textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                                {tool}
                              </div>
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Property</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Value</th>
                                      {rows.some(r => r.Probability != null) && (
                                        <th style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Probability</th>
                                      )}
                                      {rows.some(r => r.Unit) && (
                                        <th style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Unit</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r, ri) => {
                                      const prob = r.Probability != null ? parseFloat(r.Probability) : null;
                                      const isRisk = prob != null && prob >= 0.5;
                                      return (
                                        <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                          <td style={{ padding: '4px 8px', color: '#374151', fontWeight: 500 }}>{r.Property ?? r.Endpoint ?? '—'}</td>
                                          <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#0f172a' }}>{String(r.Value ?? '—')}</td>
                                          {rows.some(x => x.Probability != null) && (
                                            <td style={{ padding: '4px 8px', fontWeight: 700, color: isRisk ? '#dc2626' : prob != null && prob >= 0.3 ? '#d97706' : '#16a34a' }}>
                                              {prob != null ? `${(prob * 100).toFixed(0)}%` : '—'}
                                            </td>
                                          )}
                                          {rows.some(x => x.Unit) && (
                                            <td style={{ padding: '4px 8px', color: '#94a3b8', fontSize: '10px' }}>{r.Unit ?? '—'}</td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Export buttons */}
            {doneCount > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '20px' }}>
                <button onClick={() => handleExport('excel')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'transform 0.1s' }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <i className="bi bi-file-earmark-excel"></i>
                  {isReady ? 'Export Excel' : `Export Excel (${percentage}% complete)`}
                </button>
                <button onClick={() => handleExport('report')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#1a3a5c', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: 'transform 0.1s' }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <i className="bi bi-file-earmark-pdf"></i>
                  {isReady ? 'Export PDF Report' : `Export PDF Report (${percentage}% complete)`}
                </button>
              </div>
            )}
          </div>

          {/* Hidden runners */}
          <div style={{ display: 'none' }}>
            {uniqueSmiles.map(smi => {
              const isStarted = TOOLS.some(t => toolStatus[`${smi}-${t}`] === 'loading' || toolStatus[`${smi}-${t}`] === 'done' || toolStatus[`${smi}-${t}`] === 'error');
              if (!isStarted) return null;
              return (
                <div key={smi}>
                  <ToolErrorBoundary toolName="RDKit"     onError={() => updateResults(smi, 'RDKit',     [])}>
                    <RDKitFilters smiles={smi} onDataLoaded={d => updateResults(smi, 'RDKit', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="StopTox"   onError={() => updateResults(smi, 'StopTox',   [])}>
                    <Prediction smiles={smi} onDataLoaded={d => updateResults(smi, 'StopTox', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="StopLight" onError={() => updateResults(smi, 'StopLight', [])}>
                    <StopLight smiles={smi} onDataLoaded={d => updateResults(smi, 'StopLight', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="Tox21"     onError={() => updateResults(smi, 'Tox21',     [])}>
                    <Tox21 smiles={smi} onDataLoaded={d => updateResults(smi, 'Tox21', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="Deep ADMET" onError={() => updateResults(smi, 'Deep ADMET', [])}>
                    <DeepADMET smiles={smi} onDataLoaded={d => updateResults(smi, 'Deep ADMET', d)} />
                  </ToolErrorBoundary>
                  <ToolErrorBoundary toolName="GraphB3"   onError={() => updateResults(smi, 'GraphB3',   [])}>
                    <GraphB3 smiles={smi} onDataLoaded={d => updateResults(smi, 'GraphB3', d)} />
                  </ToolErrorBoundary>
                </div>
              );
            })}
          </div>
        </>
      )}

      <MoleculeDrawerModal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onApply={smi => setSmiles(prev => {
          const cur = prev.filter(Boolean);
          return cur.length > 0 ? [...cur, smi] : [smi];
        })}
      />
    </div>
  );
}

export default PredictWithStopTox;
