import React, { useState, useEffect, useRef, useCallback } from 'react';
import PageShell from '../components/PageShell';
import MolImage from '../components/MolImage';
import { colors, radius, shadow, font } from '../styles/themes';

const ACCENT = '#7c3aed';

interface GenResult {
  smiles: string;
  nll: number | null;
  score: number | null;
  img?: string;
}

interface JobState {
  id: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'cancelled';
  mode: string;
  smiles: string;
  num_smiles: number;
  created_at: number;
  started_at?: number;
  finished_at?: number;
  log: string[];
  results: GenResult[];
  result_count: number;
  error?: string;
}

interface CheckResult {
  reinvent_ok: boolean;
  reinvent_msg: string;
  model_path: string;
  model_ok: boolean;
  conda_env: string;
}

interface Props {
  onBack: () => void;
  initialSmiles?: string;
  onSmilesChange?: (s: string) => void;
  onNavigate?: (id: string, smiles?: string) => void;
}

// ─── Intro animation ─────────────────────────────────────────────────────────
const INTRO_COLORS = ['#60a5fa','#a78bfa','#34d399','#f472b6','#fb923c','#facc15','#38bdf8','#c084fc'];

function BenzeneRing({ color, size }: { color: string; size: number }) {
  const r = size * 0.38;
  const cx = size / 2, cy = size / 2;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible">
      <polygon points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function ChainMol({ color, size }: { color: string; size: number }) {
  const h = size * 0.65, w = size;
  const nodes: [number, number][] = [
    [0.05 * w, 0.75 * h], [0.35 * w, 0.2 * h],
    [0.65 * w, 0.75 * h], [0.95 * w, 0.2 * h],
  ];
  const d = nodes.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {nodes.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color} />)}
    </svg>
  );
}

function PentagonMol({ color, size }: { color: string; size: number }) {
  const r = size * 0.4;
  const cx = size / 2, cy = size / 2;
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = (2 * Math.PI / 5) * i - Math.PI / 2;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible">
      <polygon points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ComputerIntroSVG() {
  return (
    <svg width="110" height="95" viewBox="0 0 110 95">
      <rect x="5" y="4" width="100" height="66" rx="6" fill="#0f1e38" stroke="#2d4a6e" strokeWidth="2.5" />
      <rect x="13" y="12" width="84" height="50" rx="3" fill="#1a2f50" />
      <rect x="47" y="70" width="16" height="13" rx="2" fill="#1e3a5f" />
      <rect x="30" y="83" width="50" height="7" rx="3" fill="#1e3a5f" />
      <circle cx="55" cy="8" r="1.5" fill="#2d4a6e" />
    </svg>
  );
}

function GenerationIntro({ onDone }: { onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), 3500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      onClick={() => onDoneRef.current()}
      style={{
        position: 'fixed', inset: 0, zIndex: 490,
        background: 'radial-gradient(ellipse at center, #0d1f3c 40%, #050d1a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        animation: 'gIntroOut 0.6s 2.9s ease forwards',
      }}
    >
      <style>{`
        @keyframes gIntroOut { to { opacity:0; } }
        @keyframes gSkipFade { 0%{opacity:0} 80%{opacity:0} 100%{opacity:0.4} }
        @keyframes gTitleIn  { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes gTitleOut { from { opacity:1; } to { opacity:0; } }
        @keyframes gMolFly {
          0%   { transform:translateX(-340px) rotate(-15deg); opacity:0; }
          12%  { opacity:1; }
          78%  { transform:translateX(-10px) rotate(5deg); opacity:1; }
          92%  { transform:translateX(5px); opacity:0; }
          100% { opacity:0; }
        }
        @keyframes gScreenGlow {
          0%,35% { opacity:0.12; }
          52%    { opacity:1; }
          70%    { opacity:0.8; }
          100%   { opacity:0.12; }
        }
        @keyframes gBurst0 { 0%,52%{transform:translate(0,0) scale(0);opacity:0} 58%{transform:translate(0,0) scale(1.2);opacity:1} 100%{transform:translate(200px,-130px) scale(0.4);opacity:0} }
        @keyframes gBurst1 { 0%,55%{transform:translate(0,0) scale(0);opacity:0} 61%{transform:translate(0,0) scale(1.2);opacity:1} 100%{transform:translate(230px,-15px) scale(0.4);opacity:0} }
        @keyframes gBurst2 { 0%,57%{transform:translate(0,0) scale(0);opacity:0} 63%{transform:translate(0,0) scale(1.2);opacity:1} 100%{transform:translate(185px,145px) scale(0.4);opacity:0} }
        @keyframes gBurst3 { 0%,59%{transform:translate(0,0) scale(0);opacity:0} 65%{transform:translate(0,0) scale(1.2);opacity:1} 100%{transform:translate(75px,185px) scale(0.4);opacity:0} }
        @keyframes gBurst4 { 0%,61%{transform:translate(0,0) scale(0);opacity:0} 67%{transform:translate(0,0) scale(1.2);opacity:1} 100%{transform:translate(-120px,155px) scale(0.4);opacity:0} }
        @keyframes gBurst5 { 0%,63%{transform:translate(0,0) scale(0);opacity:0} 69%{transform:translate(0,0) scale(1.2);opacity:1} 100%{transform:translate(-175px,15px) scale(0.4);opacity:0} }
        @keyframes gBurst6 { 0%,65%{transform:translate(0,0) scale(0);opacity:0} 71%{transform:translate(0,0) scale(1.2);opacity:1} 100%{transform:translate(-135px,-135px) scale(0.4);opacity:0} }
        @keyframes gBurst7 { 0%,67%{transform:translate(0,0) scale(0);opacity:0} 73%{transform:translate(0,0) scale(1.2);opacity:1} 100%{transform:translate(255px,75px) scale(0.4);opacity:0} }
      `}</style>

      {/* Título */}
      <div style={{
        position: 'absolute', top: '22%', textAlign: 'center',
        animation: 'gTitleIn 0.6s 0.15s ease backwards, gTitleOut 0.5s 2.6s ease forwards',
      }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: 4, fontFamily: '"Inter", system-ui, sans-serif' }}>
          <span style={{ color: '#a78bfa' }}>Molecular</span> Generation
        </div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 8, letterSpacing: 3, fontFamily: '"Inter", system-ui, sans-serif' }}>
          REINVENT 4  •  Generative AI
        </div>
      </div>

      {/* Skip hint */}
      <div style={{
        position: 'absolute', bottom: 80, fontSize: 12, color: '#64748b', letterSpacing: 2,
        fontFamily: '"Inter", system-ui, sans-serif',
        animation: 'gSkipFade 3.5s ease forwards',
      }}>
        clique para pular
      </div>

      {/* Cena central */}
      <div style={{ position: 'relative', width: 520, height: 300 }}>

        {/* Molécula de entrada voa da esquerda */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          marginLeft: -30, marginTop: -30,
          animation: 'gMolFly 1.6s 0.4s ease-in-out forwards',
          opacity: 0,
        }}>
          <BenzeneRing color="#60a5fa" size={60} />
        </div>

        {/* Computador */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
          <div style={{
            position: 'absolute', left: 13, top: 12, width: 84, height: 50, borderRadius: 3,
            background: 'radial-gradient(ellipse at center, #7c3aed 0%, #4f46e5 50%, transparent 100%)',
            animation: 'gScreenGlow 3.0s 0.4s ease forwards',
            opacity: 0.12,
          }} />
          <ComputerIntroSVG />
        </div>

        {/* Moléculas saem em explosão */}
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: '50%',
            marginLeft: -20, marginTop: -20,
            animation: `gBurst${i} 3.0s 0.4s ease-out forwards`,
            opacity: 0,
          }}>
            {i % 3 === 0
              ? <BenzeneRing color={INTRO_COLORS[i]} size={40} />
              : i % 3 === 1
              ? <ChainMol color={INTRO_COLORS[i]} size={40} />
              : <PentagonMol color={INTRO_COLORS[i]} size={40} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Score badge ─────────────────────────────────────────────────────────────
function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === undefined) return null;
  const pct = Math.min(Math.max(value, 0), 1);
  const color = pct > 0.6 ? colors.success : pct > 0.35 ? colors.warning : colors.danger;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <span style={{ color: colors.textMuted }}>{label}</span>
      <div style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border, minWidth: 40 }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 2, backgroundColor: color, transition: 'width 0.4s' }} />
      </div>
      <span style={{ color, fontWeight: 600 }}>{value.toFixed(3)}</span>
    </div>
  );
}

// ─── Molecule card ────────────────────────────────────────────────────────────
function MolCard({ result, onUse }: { result: GenResult; onUse: (s: string) => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(result.smiles).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{
      backgroundColor: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: radius.lg, padding: 12, display: 'flex', flexDirection: 'column',
      gap: 8, boxShadow: shadow.sm, transition: 'box-shadow 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = shadow.md)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = shadow.sm)}
    >
      <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: colors.bg,
        borderRadius: radius.md, padding: 4 }}>
        <MolImage smiles={result.smiles} width={150} height={150} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ScoreBadge label="Score" value={result.score} />
        {result.nll !== null && (
          <div style={{ fontSize: 10, color: colors.textMuted }}>
            NLL: {result.nll?.toFixed(3)}
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: colors.textMuted, wordBreak: 'break-all',
        backgroundColor: colors.bg, borderRadius: radius.sm, padding: '4px 6px',
        fontFamily: 'monospace', lineHeight: 1.4 }}>
        {result.smiles.length > 60 ? result.smiles.slice(0, 57) + '…' : result.smiles}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={handleCopy} style={btnStyle(colors.textMuted, '#f1f5f9')}>
          <i className={`bi ${copied ? 'bi-check' : 'bi-clipboard'}`} style={{ fontSize: 12 }} />
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button onClick={() => onUse(result.smiles)} style={btnStyle(ACCENT, `${ACCENT}14`)}>
          <i className="bi bi-arrow-right-circle" style={{ fontSize: 12 }} />
          Usar
        </button>
      </div>
    </div>
  );
}

function btnStyle(color: string, bg: string): React.CSSProperties {
  return {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 4, padding: '5px 8px', fontSize: 11, fontWeight: 600,
    color, backgroundColor: bg, border: `1px solid ${color}22`,
    borderRadius: radius.sm, cursor: 'pointer', fontFamily: font,
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────
const GenerationPage: React.FC<Props> = ({ onBack, initialSmiles, onSmilesChange, onNavigate }) => {
  const [showIntro, setShowIntro] = useState(true);

  // Setup check
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checkLoading, setCheckLoading] = useState(true);

  // Form
  const [smiles, setSmiles] = useState(initialSmiles || '');
  const [mode, setMode] = useState<'sampling' | 'rl'>('sampling');
  const [numSmiles, setNumSmiles] = useState(50);
  const [temperature, setTemperature] = useState(1.0);
  const [maxSteps, setMaxSteps] = useState(50);
  const [device, setDevice] = useState('cpu');
  const [modelPath, setModelPath] = useState('');

  // Job
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // ── load check on mount ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/generation/check')
      .then(r => r.json())
      .then((d: CheckResult) => { setCheck(d); setModelPath(d.model_path || ''); })
      .catch(() => setCheck({ reinvent_ok: false, reinvent_msg: 'Server unreachable', model_path: '', model_ok: false, conda_env: 'libprep' }))
      .finally(() => setCheckLoading(false));
  }, []);

  // ── polling ──────────────────────────────────────────────────────────────
  const poll = useCallback((id: string) => {
    fetch(`/api/generation/status/${id}`)
      .then(r => r.json())
      .then((j: JobState) => {
        setJob(j);
        if (j.status === 'pending' || j.status === 'running') {
          pollRef.current = setTimeout(() => poll(id), 3000);
        }
      })
      .catch(() => {
        pollRef.current = setTimeout(() => poll(id), 5000);
      });
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  // auto-scroll log
  useEffect(() => {
    if (logRef.current && showLog) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.log, showLog]);

  // ── start ────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    setSubmitError('');
    setSubmitting(true);
    setJob(null);
    setJobId(null);
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }

    try {
      const res = await fetch('/api/generation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles, mode, num_smiles: numSmiles, temperature, max_steps: maxSteps, device, model_path: modelPath }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSubmitError(data.error || 'Failed to start job');
        return;
      }
      setJobId(data.job_id);
      pollRef.current = setTimeout(() => poll(data.job_id), 1000);
    } catch (e: any) {
      setSubmitError(e.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── cancel ───────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!jobId) return;
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    await fetch(`/api/generation/cancel/${jobId}`, { method: 'DELETE' });
    setJob(prev => prev ? { ...prev, status: 'cancelled' } : null);
  };

  // ── export CSV ───────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!job?.results?.length) return;
    const header = 'SMILES,Score,NLL\n';
    const rows = job.results.map(r => `"${r.smiles}",${r.score ?? ''},${r.nll ?? ''}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reinvent_${jobId?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const isRunning = job?.status === 'pending' || job?.status === 'running';
  const isDone = job?.status === 'done';
  const isError = job?.status === 'error';
  const elapsed = job?.started_at
    ? ((job.finished_at ?? Date.now() / 1000) - job.started_at).toFixed(0)
    : null;

  // ── setup banner ─────────────────────────────────────────────────────────
  const renderSetupBanner = () => {
    if (checkLoading) return (
      <div style={bannerStyle('#e0e7ff')}>
        <i className="bi bi-hourglass" style={{ color: ACCENT }} />
        <span style={{ color: ACCENT, fontSize: 13 }}>Verificando instalação do REINVENT 4...</span>
      </div>
    );
    if (!check?.reinvent_ok) return (
      <div style={bannerStyle('#fef2f2')}>
        <i className="bi bi-exclamation-triangle-fill" style={{ color: colors.danger }} />
        <div>
          <div style={{ fontWeight: 700, color: colors.danger, fontSize: 13 }}>REINVENT 4 não encontrado no ambiente <code style={codeStyle}>{check?.conda_env}</code></div>
          <div style={{ color: colors.danger, fontSize: 12, marginTop: 3 }}>{check?.reinvent_msg}</div>
          <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
            Via conda: <code style={codeStyle}>conda activate {check?.conda_env} &amp;&amp; pip install reinvent4</code><br />
            Via pip/venv: <code style={codeStyle}>pip install reinvent4</code> depois defina <code style={codeStyle}>REINVENT_PYTHON</code> no .env
          </div>
        </div>
      </div>
    );
    if (!check?.model_ok) return (
      <div style={bannerStyle('#fffbeb')}>
        <i className="bi bi-info-circle-fill" style={{ color: colors.warning }} />
        <div>
          <div style={{ fontWeight: 700, color: colors.warning, fontSize: 13 }}>REINVENT instalado — modelo não configurado</div>
          <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            Baixe um modelo <code style={codeStyle}>.prior</code> do HuggingFace <code style={codeStyle}>MolecularAI/reinvent4</code>{' '}
            e configure <code style={codeStyle}>REINVENT_MODEL_PATH</code> no <code style={codeStyle}>.env</code> ou informe o caminho abaixo.
          </div>
        </div>
      </div>
    );
    return (
      <div style={bannerStyle('#ecfdf5')}>
        <i className="bi bi-check-circle-fill" style={{ color: colors.success }} />
        <span style={{ color: colors.success, fontSize: 13, fontWeight: 600 }}>
          REINVENT 4 pronto — ambiente <code style={{ ...codeStyle, color: colors.success }}>{check.conda_env}</code>
        </span>
      </div>
    );
  };

  return (
    <>
    {showIntro && <GenerationIntro onDone={() => setShowIntro(false)} />}
    <PageShell
      icon="bi-stars"
      title="Molecular Generation"
      subtitle="REINVENT 4 — Generative AI para design molecular"
      accentColor={ACCENT}
      onBack={onBack}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Setup banner ── */}
        {renderSetupBanner()}

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ── Left: form ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Reference SMILES */}
            <div style={cardStyle}>
              <div style={sectionTitle(ACCENT)}>
                <i className="bi bi-bezier2" /> Molécula de referência
              </div>
              <label style={labelStyle}>SMILES</label>
              <textarea
                value={smiles}
                onChange={e => { setSmiles(e.target.value); onSmilesChange?.(e.target.value); }}
                placeholder="Cole o SMILES da molécula de referência..."
                rows={3}
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                disabled={isRunning}
              />
              {smiles && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8,
                  backgroundColor: colors.bg, borderRadius: radius.md, padding: 8 }}>
                  <MolImage smiles={smiles} width={140} height={140} />
                </div>
              )}
            </div>

            {/* Mode */}
            <div style={cardStyle}>
              <div style={sectionTitle(ACCENT)}>
                <i className="bi bi-sliders" /> Modo de geração
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['sampling', 'rl'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    disabled={isRunning}
                    style={{
                      padding: '8px 4px', borderRadius: radius.md, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: font, transition: 'all 0.15s',
                      border: `2px solid ${mode === m ? ACCENT : colors.border}`,
                      backgroundColor: mode === m ? `${ACCENT}14` : colors.surface,
                      color: mode === m ? ACCENT : colors.textMuted,
                    }}
                  >
                    <div style={{ fontSize: 18, marginBottom: 2 }}>
                      {m === 'sampling' ? '⚡' : '🎯'}
                    </div>
                    {m === 'sampling' ? 'Sampling' : 'Reinforcement'}
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>
                      {m === 'sampling' ? 'Rápido, sem scoring' : 'Otimizado (lento)'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Parameters */}
            <div style={cardStyle}>
              <div style={sectionTitle(ACCENT)}>
                <i className="bi bi-gear" /> Parâmetros
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Moléculas a gerar: <strong>{numSmiles}</strong></label>
                  <input type="range" min={10} max={200} step={10} value={numSmiles}
                    onChange={e => setNumSmiles(+e.target.value)} disabled={isRunning}
                    style={{ width: '100%' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: colors.textLight }}>
                    <span>10</span><span>200</span>
                  </div>
                </div>

                {mode === 'sampling' && (
                  <div>
                    <label style={labelStyle}>Temperatura: <strong>{temperature.toFixed(1)}</strong></label>
                    <input type="range" min={0.5} max={2.5} step={0.1} value={temperature}
                      onChange={e => setTemperature(+e.target.value)} disabled={isRunning}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: colors.textLight }}>
                      <span>0.5 (conservador)</span><span>2.5 (criativo)</span>
                    </div>
                  </div>
                )}

                {mode === 'rl' && (
                  <div>
                    <label style={labelStyle}>Max steps de RL: <strong>{maxSteps}</strong></label>
                    <input type="range" min={10} max={200} step={10} value={maxSteps}
                      onChange={e => setMaxSteps(+e.target.value)} disabled={isRunning}
                      style={{ width: '100%' }} />
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Dispositivo</label>
                  <select value={device} onChange={e => setDevice(e.target.value)}
                    disabled={isRunning} style={inputStyle}>
                    <option value="cpu">CPU</option>
                    <option value="cuda:0">GPU (cuda:0)</option>
                    <option value="cuda:1">GPU (cuda:1)</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Caminho do modelo .prior</label>
                  <input
                    value={modelPath}
                    onChange={e => setModelPath(e.target.value)}
                    placeholder="Ex: C:/models/Mol2MolVS_v1.prior"
                    disabled={isRunning}
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
                  />
                  {modelPath && !checkLoading && (
                    <div style={{ fontSize: 11, marginTop: 4,
                      color: (check?.model_ok && modelPath === check?.model_path) ? colors.success : colors.warning }}>
                      <i className={`bi ${(check?.model_ok && modelPath === check?.model_path) ? 'bi-check-circle' : 'bi-question-circle'}`} />
                      {' '}{(check?.model_ok && modelPath === check?.model_path)
                        ? 'Arquivo encontrado'
                        : 'Caminho não verificado — será validado ao iniciar'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleStart}
                disabled={isRunning || submitting || !smiles.trim() || !check?.reinvent_ok}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: radius.md, border: 'none',
                  backgroundColor: isRunning || submitting ? colors.textLight : ACCENT,
                  color: '#fff', fontWeight: 700, fontSize: 14, cursor: isRunning || submitting ? 'not-allowed' : 'pointer',
                  fontFamily: font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {submitting ? (
                  <><div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent',
                    borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Iniciando...</>
                ) : isRunning ? (
                  <><div style={{ width: 14, height: 14, backgroundColor: '#fff', borderRadius: '50%',
                    animation: 'pulse 1s ease-in-out infinite' }} /> Gerando...</>
                ) : (
                  <><i className="bi bi-stars" /> Gerar moléculas</>
                )}
              </button>

              {isRunning && (
                <button onClick={handleCancel} style={{
                  padding: '10px 14px', borderRadius: radius.md, border: `1px solid ${colors.danger}`,
                  backgroundColor: colors.dangerBg, color: colors.danger, fontWeight: 600,
                  fontSize: 13, cursor: 'pointer', fontFamily: font,
                }}>
                  <i className="bi bi-stop-circle" /> Cancelar
                </button>
              )}
            </div>

            {submitError && (
              <div style={{ backgroundColor: colors.dangerBg, border: `1px solid ${colors.danger}22`,
                borderRadius: radius.md, padding: '10px 14px', color: colors.danger, fontSize: 13 }}>
                <i className="bi bi-exclamation-triangle" /> {submitError}
              </div>
            )}
          </div>

          {/* ── Right: results ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Status card */}
            {job && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <StatusBadge status={job.status} />
                  <span style={{ fontSize: 13, color: colors.textMuted }}>
                    {job.status === 'running' && 'Gerando moléculas...'}
                    {job.status === 'pending' && 'Na fila, aguardando...'}
                    {job.status === 'done' && `${job.result_count} moléculas geradas em ${elapsed}s`}
                    {job.status === 'error' && 'Erro na geração'}
                    {job.status === 'cancelled' && 'Job cancelado'}
                  </span>
                  {elapsed && job.status === 'running' && (
                    <span style={{ fontSize: 12, color: colors.textLight }}>{elapsed}s</span>
                  )}
                  {isDone && (
                    <button onClick={handleExport} style={{
                      marginLeft: 'auto', padding: '5px 12px', borderRadius: radius.sm,
                      border: `1px solid ${colors.border}`, backgroundColor: colors.surface,
                      color: colors.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: font,
                    }}>
                      <i className="bi bi-download" /> CSV
                    </button>
                  )}
                </div>

                {isError && (
                  <pre style={{ fontSize: 11, color: colors.danger, backgroundColor: colors.dangerBg,
                    borderRadius: radius.sm, padding: '8px 10px', marginTop: 8,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto' }}>
                    {job.error}
                  </pre>
                )}

                {/* Log toggle */}
                {job.log?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <button onClick={() => setShowLog(v => !v)} style={{
                      background: 'none', border: 'none', color: colors.textMuted, fontSize: 12,
                      cursor: 'pointer', fontFamily: font, display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <i className={`bi bi-chevron-${showLog ? 'up' : 'down'}`} />
                      {showLog ? 'Ocultar log' : `Ver log (${job.log.length} linhas)`}
                    </button>
                    {showLog && (
                      <div ref={logRef} style={{
                        marginTop: 6, backgroundColor: '#0f172a', borderRadius: radius.md,
                        padding: '10px 12px', maxHeight: 200, overflow: 'auto',
                        fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', lineHeight: 1.6,
                      }}>
                        {job.log.map((line, i) => <div key={i}>{line}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Results grid */}
            {isDone && job.results.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 12 }}>
                  {job.results.length} moléculas geradas
                  {job.mode === 'sampling' && <span style={{ fontWeight: 400, color: colors.textMuted }}> (sampling mode)</span>}
                  {job.mode === 'rl' && <span style={{ fontWeight: 400, color: colors.textMuted }}> (reinforcement learning)</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                  {job.results.map((r, i) => (
                    <MolCard
                      key={i}
                      result={r}
                      onUse={(s) => { onSmilesChange?.(s); onNavigate?.('renderer', s); }}
                    />
                  ))}
                </div>
              </div>
            )}

            {isDone && job.results.length === 0 && (
              <div style={{ ...cardStyle, textAlign: 'center', color: colors.textMuted, padding: 40 }}>
                <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                Nenhuma molécula válida gerada. Tente ajustar os parâmetros ou verifique o modelo.
              </div>
            )}

            {/* Empty state */}
            {!job && !submitting && (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '50px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🧬</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, marginBottom: 6 }}>
                  REINVENT 4 — Molecular Generation
                </div>
                <div style={{ fontSize: 13, color: colors.textMuted, maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
                  Gere análogos moleculares usando modelos generativos de IA.
                  Informe um SMILES de referência e configure os parâmetros ao lado.
                </div>
                <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {['QED + SA Score scoring', 'Mol2Mol mode', 'Sampling & RL', 'Validação RDKit'].map(tag => (
                    <span key={tag} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11,
                      backgroundColor: `${ACCENT}14`, color: ACCENT, border: `1px solid ${ACCENT}33` }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Model setup guide ── */}
        <details style={{ ...cardStyle, cursor: 'pointer' }}>
          <summary style={{ fontWeight: 600, fontSize: 13, color: colors.textMuted,
            userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="bi bi-book" /> Guia: como instalar o REINVENT 4 e baixar o modelo
          </summary>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: colors.text }}>
            <div style={stepStyle}>
              <div style={stepNum(ACCENT)}>1</div>
              <div>
                <strong>Instalar REINVENT 4</strong>
                <pre style={codeBlock}>conda activate libprep{'\n'}pip install reinvent4</pre>
              </div>
            </div>
            <div style={stepStyle}>
              <div style={stepNum(ACCENT)}>2</div>
              <div>
                <strong>Baixar modelo Mol2Mol</strong>
                <p style={{ color: colors.textMuted, margin: '4px 0' }}>
                  Acesse <code style={codeStyle}>huggingface.co/MolecularAI/reinvent4</code> e baixe{' '}
                  <code style={codeStyle}>Mol2MolVS_v1.prior</code> (~450 MB).
                </p>
                <pre style={codeBlock}>pip install huggingface_hub{'\n'}python -c "from huggingface_hub import hf_hub_download; hf_hub_download('MolecularAI/reinvent4', 'Mol2MolVS_v1.prior', local_dir='C:/models')"</pre>
              </div>
            </div>
            <div style={stepStyle}>
              <div style={stepNum(ACCENT)}>3</div>
              <div>
                <strong>Configurar o caminho no .env</strong>
                <pre style={codeBlock}>REINVENT_MODEL_PATH=C:/models/Mol2MolVS_v1.prior{'\n'}REINVENT_CONDA_ENV=libprep</pre>
              </div>
            </div>
            <div style={stepStyle}>
              <div style={stepNum(ACCENT)}>4</div>
              <div>
                <strong>Reiniciar o servidor e verificar</strong>
                <pre style={codeBlock}>python src/main.py</pre>
              </div>
            </div>
          </div>
        </details>
      </div>
    </PageShell>
    </>
  );
};

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pending:   [colors.textMuted,  '#f1f5f9'],
    running:   [ACCENT,            `${ACCENT}14`],
    done:      [colors.success,    colors.successBg],
    error:     [colors.danger,     colors.dangerBg],
    cancelled: [colors.textMuted,  '#f1f5f9'],
  };
  const [color, bg] = map[status] ?? [colors.textMuted, '#f1f5f9'];
  const icons: Record<string, string> = {
    pending: 'bi-hourglass', running: 'bi-arrow-repeat',
    done: 'bi-check-circle-fill', error: 'bi-x-circle-fill', cancelled: 'bi-dash-circle',
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      borderRadius: 20, fontSize: 12, fontWeight: 600, color, backgroundColor: bg, fontFamily: font }}>
      <i className={`bi ${icons[status] ?? 'bi-circle'}`}
        style={{ animation: status === 'running' ? 'spin 1s linear infinite' : undefined }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  backgroundColor: colors.surface, border: `1px solid ${colors.border}`,
  borderRadius: radius.lg, padding: 16, boxShadow: shadow.sm,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: radius.md, border: `1px solid ${colors.border}`,
  fontSize: 13, color: colors.text, backgroundColor: colors.surface, fontFamily: font,
  boxSizing: 'border-box', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: colors.textMuted,
  marginBottom: 4, marginTop: 8,
};

function sectionTitle(accent: string): React.CSSProperties {
  return {
    fontSize: 12, fontWeight: 700, color: accent, textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
  };
}

function bannerStyle(bg: string): React.CSSProperties {
  return {
    backgroundColor: bg, borderRadius: radius.lg, padding: '12px 16px',
    display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13,
  };
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.06)',
  borderRadius: 3, padding: '1px 5px', fontSize: '0.95em',
};

const codeBlock: React.CSSProperties = {
  backgroundColor: '#0f172a', color: '#94a3b8', borderRadius: radius.md,
  padding: '8px 12px', fontSize: 11, marginTop: 6, whiteSpace: 'pre', overflowX: 'auto',
};

const stepStyle: React.CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
};

function stepNum(color: string): React.CSSProperties {
  return {
    width: 22, height: 22, borderRadius: '50%', backgroundColor: `${color}20`,
    color, fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, marginTop: 2,
  };
}

export default GenerationPage;
