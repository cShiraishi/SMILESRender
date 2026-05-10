import React, { useState, useRef, useCallback, useEffect } from 'react';
import { colors, shadow, radius } from '../styles/themes';
import PageShell from '../components/PageShell';
import MoleculeDrawerModal from '../components/MoleculeDrawerModal';
import BatchFlowPanel from './BatchFlowPanel';
import Prediction from '../components/Prediction';
import StopLight from '../components/StopLight';
import Tox21 from '../components/Tox21';
import DeepADMET from '../components/DeepADMET';
import GraphB3 from '../components/GraphB3';
import RDKitFilters from '../components/RDKitFilters';
import ToolErrorBoundary from '../components/ToolErrorBoundary';
import BodyMapDecision from '../components/BodyMapDecision';
import TargetLibrary, { DISEASE_LIBRARY, type Target, type Disease } from '../components/TargetLibrary';
import { useLanguage } from '../i18n/LanguageContext';
import { generatePDFReport } from '../utils/pdfReport';

// ── types ─────────────────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

interface StepState {
  status: StepStatus;
  error?: string;
  data?: any;
}

type StepId = 'structure' | 'descriptors' | 'admet' | 'docking' | 'export_';

const PIPELINE_STEPS: StepId[] = ['structure', 'descriptors', 'admet', 'docking'];

const STEP_META: Record<StepId, { label: string; i18nKey: string; icon: string; color: string; num: number }> = {
  structure:   { label: 'Structure',   i18nKey: 'step.structure',   icon: 'bi-box',     color: '#8b5cf6', num: 1 },
  descriptors: { label: 'Descriptors', i18nKey: 'step.descriptors', icon: 'bi-list-ul', color: '#6366f1', num: 2 },
  admet:       { label: 'ADMET',       i18nKey: 'step.admet',       icon: 'bi-activity',color: '#10b981', num: 3 },
  docking:     { label: 'Docking',     i18nKey: 'step.docking',     icon: 'bi-boxes',   color: '#14b8a6', num: 4 },
  export_:     { label: 'Export',      i18nKey: 'step.export',      icon: 'bi-download',color: '#0ea5e9', num: 5 },
};

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function initSteps(): Record<StepId, StepState> {
  return {
    structure:   { status: 'idle' },
    descriptors: { status: 'idle' },
    admet:       { status: 'idle' },
    docking:     { status: 'idle' },
    export_:     { status: 'idle' },
  };
}

// ── API runners (structure, descriptors, docking only) ────────────────────────

async function runStructureStep(smiles: string) {
  const res = await fetch(`/render?smiles=${encodeURIComponent(smiles)}`);
  if (!res.ok) throw new Error('Render falhou');
  const blob = await res.blob();
  return { imgUrl: URL.createObjectURL(blob) };
}

async function runDescriptorsStep(smiles: string) {
  const res = await fetch('/descriptors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ smiles: [smiles] }),
  });
  if (!res.ok) throw new Error('Descritores: falha na requisição');
  const arr = await res.json();
  if (arr[0]?.error) throw new Error(arr[0].error);
  return arr[0];
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StepStatus }) {
  const { t } = useLanguage();
  const cfg: Record<StepStatus, [string, string, string]> = {
    idle:    ['#f1f5f9', '#64748b', t('status.idle')],
    running: ['#eff6ff', '#2563eb', t('status.running')],
    done:    ['#ecfdf5', '#059669', t('status.done')],
    error:   ['#fef2f2', '#dc2626', t('status.error')],
    skipped: ['#f8fafc', '#94a3b8', t('status.skipped')],
  };
  const [bg, fg, label] = cfg[status];
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 20, fontSize: 11,
      fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
      backgroundColor: bg, color: fg, whiteSpace: 'nowrap',
    }}>
      {status === 'running' && (
        <span style={{ marginRight: 4, display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
      )}
      {label}
    </span>
  );
}

function Pill({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 12px', borderRadius: radius.md, minWidth: 72,
      backgroundColor: ok === undefined ? colors.bg : ok ? '#ecfdf5' : '#fef2f2',
      border: `1px solid ${ok === undefined ? colors.border : ok ? '#a7f3d0' : '#fca5a5'}`,
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: ok === undefined ? colors.text : ok ? '#059669' : '#dc2626' }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: colors.textLight, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
        {label}
      </span>
    </div>
  );
}

function SubHeader({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 4 }}>
      <i className={`bi ${icon}`} style={{ color, fontSize: 13 }} />
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textMuted }}>
        {label}
      </span>
    </div>
  );
}

// ── result panels ─────────────────────────────────────────────────────────────

function StructureResult({ data, descData }: { data: { imgUrl: string }; descData?: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
      <img
        src={data.imgUrl}
        alt="molecule"
        style={{
          width: 220, height: 165, objectFit: 'contain',
          border: `1px solid ${colors.border}`, borderRadius: radius.md, backgroundColor: '#fff',
        }}
      />
      {descData && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
          {[
            { k: 'MolecularWeight', l: 'MW (Da)' },
            { k: 'HeavyAtoms',      l: 'Heavy Atoms' },
            { k: 'AromaticRings',   l: 'Arom. Rings' },
            { k: 'FractionCSP3',    l: 'Fsp3' },
          ].map(({ k, l }) => descData[k] !== undefined && (
            <Pill key={k} label={l} value={String(descData[k])} />
          ))}
        </div>
      )}
    </div>
  );
}

function DescriptorsResult({ data }: { data: any }) {
  const groups = [
    { title: 'Drug-likeness', icon: 'bi-capsule', color: '#6366f1', props: [
      { k: 'MolecularWeight', l: 'MW (Da)' }, { k: 'LogP', l: 'LogP' },
      { k: 'HBD', l: 'HBD' }, { k: 'HBA', l: 'HBA' },
      { k: 'TPSA', l: 'TPSA (Å²)' }, { k: 'RotatableBonds', l: 'RotBonds' },
      { k: 'QED', l: 'QED' }, { k: 'LipinskiViolations', l: 'Lip. Viol.' },
    ]},
    { title: 'Topological', icon: 'bi-diagram-2', color: '#8b5cf6', props: [
      { k: 'BalabanJ', l: 'BalabanJ' }, { k: 'BertzCT', l: 'BertzCT' },
      { k: 'Kappa1', l: 'Kappa1' }, { k: 'Kappa2', l: 'Kappa2' },
      { k: 'FractionCSP3', l: 'Fsp3' }, { k: 'HeavyAtoms', l: 'Heavy Atoms' },
    ]},
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map(g => (
        <div key={g.title}>
          <SubHeader icon={g.icon} label={g.title} color={g.color} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {g.props.map(({ k, l }) => data[k] !== undefined && (
              <Pill key={k} label={l} value={String(data[k])} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ScreeningMode — multi-target batch docking ───────────────────────────────

const tKey = (t: Target) => `${t.pdbId}_${t.ligandId}`;

interface ScreenResult {
  target: Target;
  disease: Disease;
  status: 'pending' | 'docking' | 'done' | 'error';
  affinity?: number;
  poses?: number;
  error?: string;
  // redocking validation
  nativeSmiles?: string;
  nativeAffinity?: number;
  nativeStatus?: 'idle' | 'running' | 'done' | 'error';
  redockError?: string;
}

type LibCacheEntry = { pdbPath: string; center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number }; inhibitorId?: string; inhibitorChain?: string };
type LibCache = Record<string, LibCacheEntry | null>;

interface ScreeningModeProps {
  smiles: string;
  libprep: any;
  libprepRunning: boolean;
  libprepError: string;
  onRetryLibprep: () => void;
  onComplete?: (results: ScreenResult[]) => void;
}

function ScreeningMode({ smiles, libprep, libprepRunning, libprepError, onRetryLibprep, onComplete }: ScreeningModeProps) {
  const [diseaseFilter, setDiseaseFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [results, setResults]             = useState<ScreenResult[]>([]);
  const [running, setRunning]             = useState(false);
  const [phase, setPhase]                 = useState<'select' | 'prepare' | 'results'>('select');
  const [libCache, setLibCache]           = useState<LibCache>({});
  const [prepProgress, setPrepProgress]   = useState<{ current: number; total: number; name: string } | null>(null);
  const [redocking, setRedocking]         = useState(false);
  const [serverWorkers, setServerWorkers] = useState(2);
  const [screeningExhaustiveness, setScreeningExhaustiveness] = useState(4);
  const [activeJobs, setActiveJobs]       = useState(0);

  // Fetch server concurrency once on mount
  useEffect(() => {
    fetch('/api/docking/status').then(r => r.json()).then(d => {
      if (d.workers) setServerWorkers(d.workers);
    }).catch(() => {});
  }, []);

  const flatTargets = DISEASE_LIBRARY.flatMap(d => d.targets.map(t => ({ t, d })));

  const visibleTargets = diseaseFilter === 'all'
    ? flatTargets
    : flatTargets.filter(({ d }) => d.id === diseaseFilter);

  const selectAll  = () => setSelectedIds(new Set(flatTargets.map(({ t }) => tKey(t))));
  const clearAll   = () => setSelectedIds(new Set());

  const toggleTarget = (t: Target) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(tKey(t)) ? n.delete(tKey(t)) : n.add(tKey(t));
      return n;
    });
  };

  const toggleDisease = (d: Disease) => {
    const keys = d.targets.map(tKey);
    const allOn = keys.every(k => selectedIds.has(k));
    setSelectedIds(prev => {
      const n = new Set(prev);
      allOn ? keys.forEach(k => n.delete(k)) : keys.forEach(k => n.add(k));
      return n;
    });
  };

  const selectedList  = flatTargets.filter(({ t }) => selectedIds.has(tKey(t)));
  const unprepared    = selectedList.filter(({ t }) => libCache[tKey(t)] === undefined);
  const allPrepared   = selectedList.length > 0 && unprepared.length === 0;

  const prepareTargets = async () => {
    if (!unprepared.length) return;
    setRunning(true);
    setPhase('prepare');
    let cache: LibCache = { ...libCache };
    for (let i = 0; i < unprepared.length; i++) {
      const { t } = unprepared[i];
      setPrepProgress({ current: i + 1, total: unprepared.length, name: `${t.pdbId} — ${t.name}` });
      try {
        const res = await fetch('/api/docking/receptor/load-pdb-id', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdbId: t.pdbId, ligandId: t.ligandId, chainId: t.chainId ?? null }),
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error ?? 'Receptor falhou');
        const pk = d.pocket;
        if (!pk?.success) throw new Error('Pocket não detectado para ' + t.pdbId);
        cache = { ...cache, [tKey(t)]: { pdbPath: d.pdbPath, center: pk.center, size: pk.size, inhibitorId: pk.inhibitor, inhibitorChain: pk.chain } };
      } catch {
        cache = { ...cache, [tKey(t)]: null };
      }
      setLibCache({ ...cache });
    }
    setPrepProgress(null);
    setRunning(false);
    setPhase('select');
  };

  const runScreening = async () => {
    if (!libprep?.smiles || !selectedList.length) return;
    setRunning(true);
    setPhase('results');
    setResults(selectedList.map(({ t, d }) => ({ target: t, disease: d, status: 'pending' })));

    const chunkSize = Math.max(1, serverWorkers);

    const runOne = async ({ t }: { t: Target; d: Disease }) => {
      const k = tKey(t);
      const upd = (patch: Partial<ScreenResult>) =>
        setResults(prev => prev.map(r => tKey(r.target) === k ? { ...r, ...patch } : r));

      const cached = libCache[k];
      if (!cached) { upd({ status: 'error', error: `Receptor não preparado: ${t.pdbId}` }); return; }

      upd({ status: 'docking' });
      setActiveJobs(n => n + 1);
      try {
        const vinaRes = await fetch('/api/docking/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receptorPath: cached.pdbPath,
            smiles: libprep.smiles,
            center: cached.center,
            size:   cached.size,
            exhaustiveness: screeningExhaustiveness,
            numModes: 5,
            priority: 2,  // PRIORITY_SCREENING
          }),
        });
        const vina = await vinaRes.json();
        if (!vina.success) throw new Error(vina.error ?? 'Vina falhou');
        upd({ status: 'done', affinity: vina.scores?.[0]?.affinity, poses: vina.scores?.length ?? 0 });
      } catch (e: any) {
        upd({ status: 'error', error: e.message });
      } finally {
        setActiveJobs(n => n - 1);
      }
    };

    // Process in parallel chunks matching server worker count
    for (let i = 0; i < selectedList.length; i += chunkSize) {
      await Promise.all(selectedList.slice(i, i + chunkSize).map(runOne));
    }

    setRunning(false);
  };

  const runRedocking = async () => {
    const targets = results.filter(r => r.status === 'done' && r.affinity != null);
    if (!targets.length) return;
    setRedocking(true);
    setResults(prev => prev.map(r =>
      r.status === 'done' && r.affinity != null
        ? { ...r, nativeStatus: 'running' }
        : r
    ));

    for (const res of targets) {
      const k = tKey(res.target);
      const upd = (patch: Partial<ScreenResult>) =>
        setResults(prev => prev.map(r => tKey(r.target) === k ? { ...r, ...patch } : r));

      const cached = libCache[k];
      if (!cached) { upd({ nativeStatus: 'error', redockError: 'Receptor não disponível' }); continue; }

      try {
        // 1. Extract native ligand SMILES — use detected inhibitor (may differ from library entry)
        const realInhibitor = cached.inhibitorId ?? res.target.ligandId;
        const realChain     = cached.inhibitorChain ?? res.target.chainId ?? null;
        const extRes = await fetch('/api/docking/receptor/extract-inhibitor', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdbId: res.target.pdbId, resName: realInhibitor, chainId: realChain }),
        });
        const ext = await extRes.json();
        if (!ext.success) throw new Error(ext.error ?? 'Extração do inibidor falhou');

        // 2. Dock native ligand back into same pocket
        const vinaRes = await fetch('/api/docking/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receptorPath: cached.pdbPath,
            smiles: ext.smiles,
            center: cached.center,
            size:   cached.size,
            exhaustiveness: 8, numModes: 5,
          }),
        });
        const vina = await vinaRes.json();
        if (!vina.success) throw new Error(vina.error ?? 'Redocking falhou');
        upd({ nativeSmiles: ext.smiles, nativeAffinity: vina.scores?.[0]?.affinity, nativeStatus: 'done' });
      } catch (e: any) {
        upd({ nativeStatus: 'error', redockError: e.message });
      }
    }
    setRedocking(false);
  };

  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && results.length > 0 && phase === 'results') {
      onComplete?.(results);
    }
    wasRunning.current = running;
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const wasRedocking = useRef(false);
  useEffect(() => {
    if (wasRedocking.current && !redocking && results.length > 0) {
      onComplete?.(results);
    }
    wasRedocking.current = redocking;
  }, [redocking]); // eslint-disable-line react-hooks/exhaustive-deps

  const doneResults   = results.filter(r => r.status === 'done' && r.affinity != null);
  const bestAffinity  = doneResults.length ? Math.min(...doneResults.map(r => r.affinity!)) : null;
  const screeningDone = !running && doneResults.length > 0;
  const redockingDone = doneResults.some(r => r.nativeStatus === 'done');
  const sortedResults = [...results].sort((a, b) => {
    if (a.affinity != null && b.affinity != null) return a.affinity - b.affinity;
    if (a.affinity != null) return -1;
    if (b.affinity != null) return 1;
    return 0;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── LibPrep status banner ── */}
      <div style={{
        padding: '10px 14px', borderRadius: radius.md,
        backgroundColor: libprepRunning ? '#eff6ff' : libprepError ? '#fef2f2' : libprep ? '#ecfdf5' : '#f8fafc',
        border: `1px solid ${libprepRunning ? '#bfdbfe' : libprepError ? '#fca5a5' : libprep ? '#a7f3d0' : colors.borderLight}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {libprepRunning
          ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span><span style={{ fontSize: 12, color: '#2563eb' }}>Preparando estrutura 3D do ligante…</span></>
          : libprepError
            ? <><i className="bi bi-exclamation-circle" style={{ color: '#dc2626' }} /><span style={{ fontSize: 12, color: '#dc2626', flex: 1 }}>{libprepError}</span><button onClick={onRetryLibprep} style={{ padding: '3px 10px', borderRadius: radius.sm, border: 'none', backgroundColor: '#14b8a6', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Tentar novamente</button></>
            : libprep
              ? <><i className="bi bi-check-circle-fill" style={{ color: '#059669' }} /><span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Ligante 3D pronto</span>{libprep.smiles && <code style={{ fontSize: 10, color: colors.textMuted, marginLeft: 8 }}>{libprep.smiles.slice(0, 60)}{libprep.smiles.length > 60 ? '…' : ''}</code>}</>
              : <><span style={{ fontSize: 12, color: colors.textMuted }}>Aguardando SMILES para preparação 3D…</span></>
        }
      </div>

      {/* ── Preparation progress banner ── */}
      {phase === 'prepare' && prepProgress && (
        <div style={{
          padding: '14px 16px', borderRadius: radius.md,
          backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', color: '#3b82f6', fontSize: 18 }}>⟳</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>
                Preparando receptores… {prepProgress.current}/{prepProgress.total}
              </div>
              <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 2 }}>{prepProgress.name}</div>
            </div>
          </div>
          <div style={{ height: 5, backgroundColor: '#dbeafe', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${(prepProgress.current / prepProgress.total) * 100}%`,
              backgroundColor: '#3b82f6', transition: 'width 0.4s',
            }} />
          </div>
        </div>
      )}

      {/* ── Phase: select targets ── */}
      {(phase === 'select' || phase === 'prepare') && (
        <>
          {/* Global select / clear + counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={selectAll} disabled={running}
              style={{ padding: '5px 14px', borderRadius: radius.md, border: 'none', fontWeight: 700, fontSize: 12,
                backgroundColor: '#0f172a', color: '#fff', cursor: running ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="bi bi-check2-all" /> Todos ({flatTargets.length})
            </button>
            <button onClick={clearAll} disabled={running}
              style={{ padding: '5px 12px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontWeight: 600, fontSize: 12,
                backgroundColor: 'transparent', color: colors.textMuted, cursor: running ? 'default' : 'pointer' }}>
              Limpar
            </button>
            {selectedIds.size > 0 && (
              <span style={{ fontSize: 11, color: colors.textMuted }}>
                <strong style={{ color: colors.navy }}>{selectedIds.size}</strong> selecionado{selectedIds.size !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Disease filter pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Doença:</span>
            <button onClick={() => setDiseaseFilter('all')}
              style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                backgroundColor: diseaseFilter === 'all' ? '#0f172a' : '#f1f5f9',
                color: diseaseFilter === 'all' ? '#fff' : '#475569' }}>
              Todas ({flatTargets.length})
            </button>
            {DISEASE_LIBRARY.map(d => (
              <button key={d.id} onClick={() => setDiseaseFilter(d.id)}
                style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                  backgroundColor: diseaseFilter === d.id ? d.color : '#f1f5f9',
                  color: diseaseFilter === d.id ? '#fff' : '#475569' }}>
                <i className={`bi ${d.icon}`} style={{ marginRight: 4 }} />{d.label} ({d.targets.length})
              </button>
            ))}
          </div>

          {/* "Selecionar todos" for current disease */}
          {diseaseFilter !== 'all' && (() => {
            const d = DISEASE_LIBRARY.find(x => x.id === diseaseFilter)!;
            const allOn = d.targets.every(t => selectedIds.has(tKey(t)));
            return (
              <button onClick={() => toggleDisease(d)}
                style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: radius.md, border: `1px solid ${d.color}`, backgroundColor: allOn ? d.color : 'transparent', color: allOn ? '#fff' : d.color, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                {allOn ? '✓ Todos selecionados' : `Selecionar todos de ${d.label}`}
              </button>
            );
          })()}

          {/* Target list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
            {visibleTargets.map(({ t, d }) => {
              const checked   = selectedIds.has(tKey(t));
              const prepared  = libCache[tKey(t)] !== undefined;
              const prepFailed = libCache[tKey(t)] === null;
              return (
                <div key={tKey(t)}
                  onClick={() => !running && toggleTarget(t)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: radius.md, cursor: running ? 'default' : 'pointer',
                    border: `1px solid ${checked ? d.color + '50' : colors.borderLight}`,
                    backgroundColor: checked ? d.color + '08' : '#fff',
                    transition: 'all 0.15s',
                  }}>
                  {/* Checkbox */}
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${checked ? d.color : '#cbd5e1'}`,
                    backgroundColor: checked ? d.color : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <i className="bi bi-check-lg" style={{ color: '#fff', fontSize: 11 }} />}
                  </div>

                  {/* Disease badge */}
                  <div style={{ width: 6, height: 32, borderRadius: 3, backgroundColor: d.color, flexShrink: 0 }} />

                  {/* PDB + resolution */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: d.color, fontFamily: 'monospace', letterSpacing: '0.04em' }}>{t.pdbId}</span>
                    <span style={{ fontSize: 9, color: colors.textLight }}>{t.resolution}</span>
                  </div>

                  {/* Name + info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: colors.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>
                      <span style={{ fontWeight: 600 }}>{t.gene}</span>
                      <span style={{ margin: '0 5px', color: '#cbd5e1' }}>·</span>
                      {t.inhibitor}
                      <span style={{ margin: '0 5px', color: '#cbd5e1' }}>·</span>
                      <span style={{ color: '#94a3b8' }}>{d.label}</span>
                    </div>
                  </div>

                  {/* Prepared status indicator */}
                  {prepared && !prepFailed && (
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d', flexShrink: 0 }}>
                      ✓ Pronto
                    </span>
                  )}
                  {prepFailed && (
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700, backgroundColor: '#fee2e2', color: '#dc2626', flexShrink: 0 }}>
                      ✗ Erro
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action button */}
          {phase !== 'prepare' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
              {!allPrepared ? (
                <button
                  onClick={prepareTargets}
                  disabled={selectedIds.size === 0 || running}
                  style={{
                    padding: '10px 24px', borderRadius: radius.md, border: 'none',
                    backgroundColor: selectedIds.size === 0 ? colors.border : '#f59e0b',
                    color: '#fff', fontWeight: 700, fontSize: 14,
                    cursor: selectedIds.size === 0 ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                  <i className="bi bi-cloud-download" />
                  Preparar {unprepared.length} receptor{unprepared.length !== 1 ? 'es' : ''}
                  {selectedIds.size > 0 && (
                    <span style={{ padding: '1px 8px', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                      {selectedIds.size} selecionados
                    </span>
                  )}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={runScreening}
                    disabled={!libprep?.smiles || running}
                    style={{
                      padding: '10px 24px', borderRadius: radius.md, border: 'none',
                      backgroundColor: !libprep?.smiles ? colors.border : '#3b82f6',
                      color: '#fff', fontWeight: 700, fontSize: 14,
                      cursor: !libprep?.smiles ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                    <i className="bi bi-play-fill" />
                    Executar Screening
                    <span style={{ padding: '1px 8px', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                      {selectedIds.size} alvos · {serverWorkers}× paralelo
                    </span>
                  </button>
                  {/* Exhaustiveness selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: radius.md, border: `1px solid ${colors.border}`, backgroundColor: '#fff' }}>
                    <i className="bi bi-speedometer2" style={{ fontSize: 12, color: '#64748b' }} />
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Exaustividade:</span>
                    {[2, 4, 8].map(v => (
                      <button key={v} onClick={() => setScreeningExhaustiveness(v)}
                        style={{ padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                          backgroundColor: screeningExhaustiveness === v ? '#3b82f6' : '#f1f5f9',
                          color: screeningExhaustiveness === v ? '#fff' : '#475569' }}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {allPrepared && !libprep?.smiles && (
                <span style={{ fontSize: 11, color: '#f59e0b' }}>⚠ Aguardando LibPrep 3D</span>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Phase: results ── */}
      {phase === 'results' && (
        <>
          {/* Progress header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.navy }}>
                  {running
                    ? <>
                        {`${results.filter(r => r.status === 'done' || r.status === 'error').length}/${results.length} alvos`}
                        {activeJobs > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: '#0891b2', fontWeight: 700 }}>
                            <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', marginRight: 3 }}>⟳</span>
                            {activeJobs} em paralelo
                          </span>
                        )}
                      </>
                    : redocking
                      ? `Redocking… ${results.filter(r => r.nativeStatus === 'done' || r.nativeStatus === 'error').length}/${doneResults.length} validando`
                      : `Screening completo — ${results.length} alvos`}
                </span>
                {bestAffinity != null && (
                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>
                    Melhor: {bestAffinity} kcal/mol
                  </span>
                )}
              </div>
              <div style={{ height: 5, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${results.length ? (results.filter(r => r.status === 'done' || r.status === 'error').length / results.length) * 100 : 0}%`,
                  backgroundColor: '#3b82f6', transition: 'width 0.4s',
                }} />
              </div>
            </div>
            <button onClick={() => { setPhase('select'); setResults([]); setRedocking(false); }}
              style={{ padding: '5px 12px', borderRadius: radius.md, border: `1px solid ${colors.border}`, background: 'none', color: colors.textMuted, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
              <i className="bi bi-arrow-left" style={{ marginRight: 4 }} />Voltar
            </button>
          </div>

          {/* Redocking CTA — shown after screening finishes */}
          {screeningDone && !redockingDone && (
            <div style={{
              padding: '14px 16px', borderRadius: radius.md,
              backgroundColor: redocking ? '#f0fdf4' : '#eff6ff',
              border: `1px solid ${redocking ? '#86efac' : '#bfdbfe'}`,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: redocking ? '#15803d' : '#1e40af', marginBottom: 3 }}>
                  {redocking
                    ? `Redocking em andamento… ${results.filter(r => r.nativeStatus === 'done' || r.nativeStatus === 'error').length}/${doneResults.length}`
                    : 'Validar resultados por Redocking'}
                </div>
                <div style={{ fontSize: 11, color: redocking ? '#15803d' : '#3b82f6' }}>
                  {redocking
                    ? 'Extraindo inibidor nativo e dockando de volta no mesmo sítio de ligação…'
                    : `Re-doca o inibidor nativo de cada alvo confirmado e compara com a molécula query. ${doneResults.length} alvo${doneResults.length !== 1 ? 's' : ''} com resultado.`}
                </div>
                {redocking && (
                  <div style={{ marginTop: 6, height: 4, backgroundColor: '#bbf7d0', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${doneResults.length ? (results.filter(r => r.nativeStatus === 'done' || r.nativeStatus === 'error').length / doneResults.length) * 100 : 0}%`,
                      backgroundColor: '#16a34a', transition: 'width 0.4s',
                    }} />
                  </div>
                )}
              </div>
              {!redocking && (
                <button onClick={runRedocking} disabled={running}
                  style={{ padding: '9px 20px', borderRadius: radius.md, border: 'none', fontWeight: 700, fontSize: 13,
                    backgroundColor: '#3b82f6', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 7 }}>
                  <i className="bi bi-arrow-repeat" /> Validar Redocking
                </button>
              )}
            </div>
          )}

          {/* Results list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {sortedResults.map((r, idx) => {
              const isActive = r.status === 'docking';
              const isBest   = r.affinity != null && r.affinity === bestAffinity && doneResults.length > 1;
              const ratio    = r.affinity != null && r.nativeAffinity != null
                ? (r.affinity / r.nativeAffinity).toFixed(2)
                : null;
              const betterThanNative = ratio != null && parseFloat(ratio) <= 1.0;
              return (
                <div key={tKey(r.target)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: radius.md,
                  border: `1px solid ${isBest ? '#fbbf24' : r.status === 'error' ? '#fca5a5' : r.status === 'done' ? '#a7f3d0' : isActive ? '#bfdbfe' : colors.borderLight}`,
                  backgroundColor: isBest ? '#fffbeb' : r.status === 'error' ? '#fef2f2' : r.status === 'done' ? '#f0fdf4' : isActive ? '#eff6ff' : '#fafafa',
                  transition: 'all 0.3s',
                }}>
                  {/* Rank / status icon */}
                  <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
                    {isActive
                      ? <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', color: '#3b82f6', fontSize: 16 }}>⟳</span>
                      : r.status === 'done'
                        ? isBest
                          ? <i className="bi bi-trophy-fill" style={{ color: '#f59e0b', fontSize: 16 }} />
                          : <span style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>#{idx + 1}</span>
                        : r.status === 'error'
                          ? <i className="bi bi-x-circle-fill" style={{ color: '#dc2626', fontSize: 14 }} />
                          : <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                    }
                  </div>

                  {/* Disease color bar */}
                  <div style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: r.disease.color, flexShrink: 0 }} />

                  {/* Target info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.navy }}>{r.target.name}</span>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: r.disease.color, fontWeight: 700 }}>{r.target.pdbId}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, backgroundColor: r.disease.color + '20', color: r.disease.color, fontWeight: 600 }}>{r.disease.label}</span>
                      {betterThanNative && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                          ★ Supera inibidor
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                      {r.status === 'docking'  && <span style={{ color: '#ef4444', fontWeight: 600 }}>AutoDock Vina rodando…</span>}
                      {r.status === 'done'     && <span>{r.target.gene} · Ref: {r.target.inhibitor} · {r.poses} poses</span>}
                      {r.status === 'error'    && <span style={{ color: '#dc2626' }}>{r.error}</span>}
                      {r.status === 'pending'  && <span style={{ color: '#94a3b8' }}>Na fila…</span>}
                    </div>
                  </div>

                  {/* Affinity query */}
                  {r.status === 'done' && r.affinity != null && (
                    <div style={{
                      textAlign: 'right', flexShrink: 0,
                      padding: '5px 10px', borderRadius: radius.md,
                      backgroundColor: isBest ? '#f59e0b' : '#fff',
                      border: `1px solid ${isBest ? '#f59e0b' : '#e2e8f0'}`,
                    }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: isBest ? '#fff' : '#ef4444', lineHeight: 1 }}>{r.affinity}</div>
                      <div style={{ fontSize: 9, color: isBest ? '#fef3c7' : '#94a3b8', fontWeight: 600, marginTop: 1 }}>query</div>
                    </div>
                  )}

                  {/* Redocking column */}
                  {r.status === 'done' && (r.nativeStatus || redocking) && (
                    <div style={{
                      textAlign: 'right', flexShrink: 0,
                      padding: '5px 10px', borderRadius: radius.md,
                      backgroundColor: r.nativeStatus === 'done' ? '#f0fdf4' : r.nativeStatus === 'error' ? '#fef2f2' : '#f8fafc',
                      border: `1px solid ${r.nativeStatus === 'done' ? '#86efac' : r.nativeStatus === 'error' ? '#fca5a5' : '#e2e8f0'}`,
                      minWidth: 56,
                    }}>
                      {r.nativeStatus === 'running' && (
                        <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', color: '#3b82f6', fontSize: 13 }}>⟳</span>
                      )}
                      {r.nativeStatus === 'done' && r.nativeAffinity != null && (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#059669', lineHeight: 1 }}>{r.nativeAffinity}</div>
                          <div style={{ fontSize: 9, color: '#86efac', fontWeight: 600, marginTop: 1 }}>nativo</div>
                        </>
                      )}
                      {r.nativeStatus === 'error' && (
                        <span title={r.redockError} style={{ fontSize: 11, color: '#dc2626' }}>✗</span>
                      )}
                      {!r.nativeStatus && <span style={{ fontSize: 10, color: '#94a3b8' }}>—</span>}
                    </div>
                  )}

                  {/* Ratio badge */}
                  {ratio != null && (
                    <div style={{
                      flexShrink: 0, padding: '4px 8px', borderRadius: radius.sm,
                      backgroundColor: betterThanNative ? '#dcfce7' : '#fef9c3',
                      border: `1px solid ${betterThanNative ? '#86efac' : '#fde047'}`,
                      textAlign: 'center', minWidth: 46,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: betterThanNative ? '#15803d' : '#92400e' }}>{ratio}×</div>
                      <div style={{ fontSize: 8, color: betterThanNative ? '#16a34a' : '#a16207', fontWeight: 600 }}>q/nativo</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Redocking legend */}
          {redockingDone && (
            <div style={{ padding: '10px 14px', borderRadius: radius.md, backgroundColor: '#f8fafc', border: `1px solid ${colors.borderLight}`, fontSize: 11, color: colors.textMuted }}>
              <strong>Legenda redocking:</strong> &nbsp;
              <span style={{ color: '#ef4444' }}>query</span> = afinidade da molécula testada &nbsp;·&nbsp;
              <span style={{ color: '#059669' }}>nativo</span> = inibidor de referência re-dockado &nbsp;·&nbsp;
              <span style={{ color: '#15803d' }}>q/nativo ≤ 1.0×</span> = molécula supera o inibidor de referência
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── DockSection — sub-step card with lock state ──────────────────────────────

interface DockSectionProps {
  icon: string; label: string; color: string;
  locked?: boolean; lockMsg?: string;
  badge?: string; badgeOk?: boolean; badgeErr?: boolean;
  last?: boolean;
  children: React.ReactNode;
}

function DockSection({ icon, label, color, locked, lockMsg, badge, badgeOk, badgeErr, last, children }: DockSectionProps) {
  const borderColor = locked ? colors.borderLight : `${color}40`;
  const bgColor     = locked ? '#fafafa' : '#fff';
  return (
    <div style={{
      borderLeft: `3px solid ${locked ? '#e2e8f0' : color}`,
      backgroundColor: bgColor,
      borderRadius: `0 ${radius.md}px ${radius.md}px 0`,
      marginBottom: last ? 0 : 2,
      padding: '12px 14px',
      opacity: locked ? 0.55 : 1,
      transition: 'opacity 0.2s, border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: locked ? 0 : 10 }}>
        <i className={`bi ${icon}`} style={{ color: locked ? '#94a3b8' : color, fontSize: 13 }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: locked ? '#94a3b8' : colors.navy }}>
          {label}
        </span>
        {badge && (
          <span style={{
            fontSize: 9, padding: '1px 7px', borderRadius: 10, fontWeight: 700, textTransform: 'uppercase',
            backgroundColor: badgeErr ? '#fee2e2' : badgeOk ? `${color}20` : '#f1f5f9',
            color: badgeErr ? '#dc2626' : badgeOk ? color : '#64748b',
          }}>
            {badge}
          </span>
        )}
        {locked && lockMsg && (
          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>— {lockMsg}</span>
        )}
      </div>
      {!locked && children}
    </div>
  );
}

// ── DockingPanel — LibPrep + Receptor + Vina + PLIP inline ───────────────────

interface DockingPanelProps {
  smiles: string;
  runKey: number;
  onStatusChange: (status: StepStatus, data?: any) => void;
  onDockingData?: (data: {
    single?: {
      receptorId?: string;
      scores?: any[];
      session?: any;
      plip?: any;
      nativeRef?: { affinity: number; inhibitor: string } | null;
      pocket?: { center?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number } };
      libprep?: { energy?: number; props?: Record<string, any> };
    };
    screening?: ScreenResult[];
  }) => void;
}

function DockingPanel({ smiles, runKey, onStatusChange, onDockingData }: DockingPanelProps) {
  const { t } = useLanguage();
  const [libprep, setLibprep]               = useState<any>(null);
  const [libprepRunning, setLibprepRunning] = useState(false);
  const [libprepError, setLibprepError]     = useState('');
  const runningRef                          = useRef(false);

  // Auto-run LibPrep on mount if smiles available
  useEffect(() => {
    if (smiles) triggerLibPrep(smiles);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-run when pipeline triggers (Run Pipeline button)
  useEffect(() => {
    if (runKey === 0 || !smiles) return;
    triggerLibPrep(smiles);
  }, [runKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerLibPrep = (smi: string) => {
    if (runningRef.current) return;
    runLibPrep(smi);
  };

  const runLibPrep = async (smi: string) => {
    runningRef.current = true;
    setLibprepRunning(true);
    setLibprep(null); setLibprepError('');
    setReceptor(null); setScores([]); setSession(null); setPlip(null);
    onStatusChange('running');
    try {
      const loadRes = await fetch('/api/libprep/load', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: smi, method: 'smiles' }),
      });
      if (!loadRes.ok) throw new Error('LibPrep: falha ao carregar SMILES');
      const entries = await loadRes.json();
      if (!entries.length || entries[0].status === 'invalid')
        throw new Error(entries[0]?.error ?? 'SMILES inválido para LibPrep');
      const prepRes = await fetch('/api/libprep/prepare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, config: { remove_salts: true, neutralize: true, canon_tautomer: false, f: 'MMFF94', max_iters: 2000 } }),
      });
      if (!prepRes.ok) throw new Error('LibPrep: falha na preparação 3D');
      const prepared = await prepRes.json();
      if (!prepared.length) throw new Error('Nenhum resultado da preparação 3D');
      const mol = prepared[0];
      if (mol.status === 'failed' || mol.status === 'invalid')
        throw new Error(mol.error ?? 'Preparação 3D falhou');
      setLibprep(mol);
      onStatusChange('done', mol);
    } catch (e: any) {
      setLibprepError(e.message ?? 'Erro desconhecido');
      onStatusChange('error');
    } finally {
      setLibprepRunning(false);
      runningRef.current = false;
    }
  };

  const ok3d = libprep?.status === 'ok';
  const props = libprep?.props ?? {};

  const [dockMode, setDockMode] = useState<'single' | 'screening'>('single');

  const [pdbInput, setPdbInput]               = useState('');
  const [receptor, setReceptor]               = useState<{ id: string; path: string; pocket?: any; ligands?: { id: string; chain: string }[] } | null>(null);
  const [loadingReceptor, setLoadingReceptor] = useState(false);
  const [grid, setGrid]                       = useState({ cx: 0, cy: 0, cz: 0, sx: 20, sy: 20, sz: 20 });
  const [detectingPocket, setDetectingPocket] = useState(false);
  const [scores, setScores]                   = useState<any[]>([]);
  const [session, setSession]                 = useState<any>(null);
  const [running, setRunning]                 = useState(false);
  const [plip, setPlip]                       = useState<any>(null);
  const [analyzing, setAnalyzing]             = useState(false);
  const [exhaustiveness, setExhaustiveness]   = useState(8);
  const [showLibrary, setShowLibrary]         = useState(false);
  const [nativeRef, setNativeRef]             = useState<{ pdbId: string; inhibitor: string; smiles: string; affinity: number; cached: boolean } | null>(null);
  const [fetchingRef, setFetchingRef]         = useState(false);
  const [screeningResults, setScreeningResults] = useState<ScreenResult[]>([]);

  // Propagate docking results upward for export/report
  useEffect(() => {
    if (scores.length > 0 || plip || screeningResults.length > 0) {
      onDockingData?.({
        single: scores.length > 0 ? {
          receptorId: receptor?.id,
          scores,
          session,
          plip,
          nativeRef: nativeRef ? { affinity: nativeRef.affinity, inhibitor: nativeRef.inhibitor } : null,
          pocket: { center: receptor?.pocket?.center ?? { x: grid.cx, y: grid.cy, z: grid.cz }, size: { x: grid.sx, y: grid.sy, z: grid.sz } },
          libprep: libprep ? { energy: libprep.energy, props: libprep.props } : undefined,
        } : undefined,
        screening: screeningResults.length > 0 ? screeningResults : undefined,
      });
    }
  }, [scores, plip, screeningResults, nativeRef, grid, libprep]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNativeRef = async (pdbId: string, ligandId?: string, chainId?: string) => {
    setNativeRef(null);
    setFetchingRef(true);
    try {
      const res = await fetch('/api/docking/redocking/reference', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbId, ligandId: ligandId ?? null, chainId: chainId ?? null }),
      });
      const d = await res.json();
      if (d.affinity != null) setNativeRef(d);
    } catch { /* silently ignore */ }
    finally { setFetchingRef(false); }
  };


  const loadReceptor = async (overridePdb?: string, overrideLigand?: string, overrideChain?: string) => {
    const pdb = (overridePdb ?? pdbInput).trim().toUpperCase();
    if (!pdb) return;
    if (overridePdb) setPdbInput(overridePdb);
    setLoadingReceptor(true);
    setReceptor(null); setScores([]); setSession(null); setPlip(null);
    try {
      const res = await fetch('/api/docking/receptor/load-pdb-id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbId: pdb, ligandId: overrideLigand ?? null, chainId: overrideChain ?? null }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? 'Falha ao carregar receptor');
      setReceptor({ id: d.pdbId, path: d.pdbPath, pocket: d.pocket, ligands: d.rcsbLigands ?? [] });
      if (d.pocket?.success) {
        setGrid({ cx: d.pocket.center.x, cy: d.pocket.center.y, cz: d.pocket.center.z, sx: d.pocket.size.x, sy: d.pocket.size.y, sz: d.pocket.size.z });
      }
      // Busca referência de redocking em background (cache persistente, sem bloquear UI)
      fetchNativeRef(d.pdbId, overrideLigand, overrideChain);
    } catch (e: any) { alert(e.message); }
    finally { setLoadingReceptor(false); }
  };

  const detectPocket = async (ligId?: string, chainId?: string) => {
    if (!receptor) return;
    setDetectingPocket(true);
    try {
      const res = await fetch('/api/docking/receptor/detect-pocket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbId: receptor.id, ligandId: ligId ?? null, chainId: chainId ?? null }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? 'Pocket não detectado');
      setGrid({ cx: d.center.x, cy: d.center.y, cz: d.center.z, sx: d.size.x, sy: d.size.y, sz: d.size.z });
    } catch (e: any) { alert(e.message); }
    finally { setDetectingPocket(false); }
  };

  const runVina = async () => {
    if (!receptor || !libprep?.smiles) return;
    setRunning(true); setScores([]); setSession(null); setPlip(null);
    try {
      const res = await fetch('/api/docking/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receptorPath: receptor.path,
          smiles: libprep.smiles,
          center: { x: grid.cx, y: grid.cy, z: grid.cz },
          size:   { x: grid.sx, y: grid.sy, z: grid.sz },
          exhaustiveness, numModes: 9,
          priority: 0,
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error ?? 'Docking falhou');
      setScores(d.scores ?? []);
      setSession(d);
    } catch (e: any) { alert(e.message); }
    finally { setRunning(false); }
  };

  const analyzePlip = async () => {
    if (!session?.complexPath) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/docking/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complexPath: session.complexPath, sessionId: session.sessionId, poseIdx: 0, smiles: libprep.smiles }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setPlip(d);
    } catch (e: any) { alert(e.message); }
    finally { setAnalyzing(false); }
  };

  const sectionHead = (icon: string, label: string, color: string, badge?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`bi ${icon}`} style={{ color, fontSize: 12 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: colors.navy, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {badge && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, backgroundColor: color + '20', color, fontWeight: 700 }}>{badge}</span>}
    </div>
  );

  // ── mode tabs ────────────────────────────────────────────────────────────────
  const modeTabs = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
      {([
        { id: 'single'   as const, icon: 'bi-bullseye',        label: 'Alvo Único'          },
        { id: 'screening'as const, icon: 'bi-grid-3x3-gap',    label: 'Screening Multi-Alvo' },
      ]).map(tab => (
        <button key={tab.id} onClick={() => setDockMode(tab.id)}
          style={{
            padding: '7px 14px', borderRadius: radius.md, border: 'none', fontWeight: 600, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            backgroundColor: dockMode === tab.id ? '#0f172a' : '#f1f5f9',
            color: dockMode === tab.id ? '#fff' : '#64748b',
          }}>
          <i className={`bi ${tab.icon}`} />{tab.label}
        </button>
      ))}
    </div>
  );

  if (dockMode === 'screening') {
    return (
      <div>
        {modeTabs}
        <ScreeningMode
          smiles={smiles}
          libprep={libprep}
          libprepRunning={libprepRunning}
          libprepError={libprepError}
          onRetryLibprep={() => triggerLibPrep(smiles)}
          onComplete={(r) => setScreeningResults(r)}
        />
      </div>
    );
  }

  // ── derived state for steps ─────────────────────────────────────────────────
  const noSmiles = !smiles.trim();

  // ── step pill strip ──────────────────────────────────────────────────────────
  const dockSteps = [
    { label: t('dock.step.libprep'),  icon: 'bi-boxes',     color: '#14b8a6', done: ok3d,            active: libprepRunning,  locked: false,    error: !!libprepError },
    { label: t('dock.step.receptor'), icon: 'bi-building',  color: '#8b5cf6', done: !!receptor,      active: loadingReceptor, locked: !ok3d,    error: false },
    { label: t('dock.step.grid'),     icon: 'bi-grid-3x3',  color: '#f59e0b', done: false,           active: detectingPocket, locked: !receptor,error: false },
    { label: t('dock.step.vina'),     icon: 'bi-send',      color: '#ef4444', done: scores.length>0, active: running,         locked: !receptor,error: false },
    { label: 'PLIP',                  icon: 'bi-diagram-3', color: '#10b981', done: !!plip,          active: analyzing,       locked: !session,  error: false },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {modeTabs}

      {/* ── Stepper strip ── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 0 }}>
        {dockSteps.map((s, i) => {
          const bg  = s.done ? s.color : s.active ? s.color : s.locked ? '#e2e8f0' : '#f1f5f9';
          const fg  = s.done || s.active ? '#fff' : s.locked ? '#94a3b8' : '#64748b';
          return (
            <React.Fragment key={s.label}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', backgroundColor: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: s.error ? '2px solid #ef4444' : `2px solid ${s.done || s.active ? s.color : '#e2e8f0'}`,
                  transition: 'all 0.3s',
                }}>
                  {s.active
                    ? <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', color: '#fff', fontSize: 14 }}>⟳</span>
                    : s.error
                      ? <i className="bi bi-x" style={{ color: '#ef4444', fontSize: 14 }} />
                      : s.done
                        ? <i className="bi bi-check-lg" style={{ color: '#fff', fontSize: 13 }} />
                        : <i className={`bi ${s.icon}`} style={{ color: fg, fontSize: 12 }} />
                  }
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.locked ? '#94a3b8' : s.done || s.active ? s.color : '#64748b', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </div>
              {i < dockSteps.length - 1 && (
                <div style={{ flex: 1, height: 2, backgroundColor: dockSteps[i+1].locked ? '#e2e8f0' : dockSteps[i].done ? dockSteps[i].color : '#e2e8f0', transition: 'background-color 0.3s', marginBottom: 18, maxWidth: 32 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── A: LibPrep ── */}
      <DockSection icon="bi-boxes" label="LibPrep 3D" color="#14b8a6"
        badge={libprepRunning ? 'rodando' : ok3d ? 'ok' : libprepError ? 'erro' : noSmiles ? 'sem smiles' : 'aguardando'}
        badgeOk={ok3d} badgeErr={!!libprepError}
      >
        {noSmiles ? (
          <p style={{ margin: 0, fontSize: 12, color: colors.textLight }}>{t('libprep.waitSmiles')}</p>
        ) : libprepRunning ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textMuted }}>
            <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span>
            <span style={{ fontSize: 12 }}>{t('libprep.running')}</span>
          </div>
        ) : libprepError ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>
              <i className="bi bi-exclamation-circle" style={{ marginRight: 4 }} />{libprepError}
            </p>
            <button onClick={() => triggerLibPrep(smiles)}
              style={{ padding: '5px 12px', borderRadius: radius.md, border: 'none', backgroundColor: '#14b8a6', color: '#fff', fontWeight: 600, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="bi bi-arrow-clockwise" /> {t('libprep.retry')}
            </button>
          </div>
        ) : ok3d ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                <i className="bi bi-check-circle-fill" /> {t('libprep.done')}
              </span>
              <Pill label="FF" value={libprep.ff_used ?? 'MMFF94'} />
              {libprep.energy != null && <Pill label="Energia" value={`${libprep.energy} kcal/mol`} />}
              {props.ExactMW != null && <Pill label="ExactMW" value={`${props.ExactMW} Da`} />}
              {props.LogP != null && <Pill label="LogP" value={String(props.LogP)} />}
              {props.QED != null && <Pill label="QED" value={String(props.QED)} />}
              <button onClick={() => triggerLibPrep(smiles)}
                style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: radius.sm, border: `1px solid ${colors.border}`, backgroundColor: 'transparent', color: colors.textMuted, fontSize: 11, cursor: 'pointer' }}>
                <i className="bi bi-arrow-clockwise" /> {t('libprep.redo')}
              </button>
            </div>
            {libprep.smiles && (
              <div style={{ marginTop: 8, padding: '5px 10px', borderRadius: radius.sm, backgroundColor: '#f8fafc', border: `1px solid ${colors.borderLight}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="bi bi-braces" style={{ color: colors.textLight, fontSize: 11, flexShrink: 0 }} />
                <code style={{ fontSize: 10, color: colors.textMuted, wordBreak: 'break-all' }}>{libprep.smiles}</code>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textMuted }}>
            <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span>
            <span style={{ fontSize: 12 }}>{t('libprep.starting')}</span>
          </div>
        )}
      </DockSection>

      {/* ── B: Receptor ── */}
      <DockSection icon="bi-building" label={t('receptor.title')} color="#8b5cf6"
        locked={!ok3d} lockMsg={t('receptor.waitLibprep')}
        badge={receptor ? t('status.done') : undefined} badgeOk={!!receptor}
      >
        {!receptor ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={pdbInput}
              onChange={e => setPdbInput(e.target.value.toUpperCase().slice(0, 4))}
              placeholder={t('receptor.placeholder')}
              maxLength={4}
              onKeyDown={e => e.key === 'Enter' && loadReceptor()}
              style={{ width: 100, padding: '7px 10px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}
            />
            <button onClick={() => loadReceptor()} disabled={loadingReceptor || pdbInput.length < 4}
              style={{ padding: '7px 14px', borderRadius: radius.md, border: 'none', fontWeight: 600, fontSize: 12,
                backgroundColor: (loadingReceptor || pdbInput.length < 4) ? colors.border : '#8b5cf6',
                color: '#fff', cursor: (loadingReceptor || pdbInput.length < 4) ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 5 }}>
              {loadingReceptor
                ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span> {t('receptor.loading')}</>
                : <><i className="bi bi-download" /> {t('receptor.load')}</>}
            </button>
            <button onClick={() => setShowLibrary(true)}
              style={{ padding: '7px 14px', borderRadius: radius.md, border: `1px solid #8b5cf6`, backgroundColor: '#f5f3ff', color: '#7c3aed', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="bi bi-bookmarks-fill" /> {t('receptor.library')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
              <i className="bi bi-check-circle-fill" /> {receptor.id}
            </span>
            {receptor.pocket?.inhibitor && <span style={{ fontSize: 11, color: colors.textMuted }}>{t('receptor.inhibitor')}: <strong>{receptor.pocket.inhibitor}</strong></span>}
            <button onClick={() => { setReceptor(null); setPdbInput(''); setScores([]); setSession(null); setPlip(null); }}
              style={{ fontSize: 11, color: colors.textLight, background: 'none', border: 'none', cursor: 'pointer' }}>{t('receptor.change')}</button>
            <button onClick={() => setShowLibrary(true)}
              style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              <i className="bi bi-bookmarks-fill" /> {t('receptor.library.short')}
            </button>
          </div>
        )}
      </DockSection>

      {/* ── C: Pocket / Grid ── */}
      <DockSection icon="bi-grid-3x3" label={t('grid.title')} color="#f59e0b"
        locked={!receptor} lockMsg={t('grid.waitReceptor')}
        badge={scores.length > 0 ? t('status.done') : undefined}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <button onClick={() => detectPocket(receptor?.pocket?.inhibitor, receptor?.pocket?.chain)} disabled={detectingPocket || !receptor}
            style={{ padding: '6px 13px', borderRadius: radius.md, border: `1px solid #f59e0b`, backgroundColor: '#fffbeb', color: '#d97706', fontWeight: 600, fontSize: 12, cursor: (!receptor || detectingPocket) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            {detectingPocket
              ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span> {t('grid.detecting')}</>
              : <><i className="bi bi-geo-alt" /> {t('grid.autoDetect')}</>}
          </button>
          {receptor?.ligands && receptor.ligands.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {receptor.ligands.slice(0, 6).map(lig => (
                <button key={lig.id + lig.chain} onClick={() => detectPocket(lig.id, lig.chain)}
                  style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: `1px solid ${colors.border}`, backgroundColor: colors.bg, color: colors.textMuted, cursor: 'pointer', fontWeight: 600 }}>
                  {lig.id}/{lig.chain}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          {(['cx','cy','cz','sx','sy','sz'] as const).map(k => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 9, fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {k === 'cx' ? 'Cx' : k === 'cy' ? 'Cy' : k === 'cz' ? 'Cz' : k === 'sx' ? 'Sx' : k === 'sy' ? 'Sy' : 'Sz'}
              </label>
              <input type="number" step="0.5"
                value={grid[k].toFixed ? parseFloat(grid[k].toFixed(2)) : grid[k]}
                onChange={e => setGrid(prev => ({ ...prev, [k]: parseFloat(e.target.value) || 0 }))}
                style={{ padding: '5px 4px', borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 11, textAlign: 'center' }}
              />
            </div>
          ))}
        </div>
      </DockSection>

      {/* ── D: Docking ── */}
      <DockSection icon="bi-send" label={t('vina.title')} color="#ef4444"
        locked={!receptor} lockMsg={t('vina.waitGrid')}
        badge={scores.length > 0 ? `${scores.length} poses` : undefined} badgeOk={scores.length > 0}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: scores.length > 0 ? 12 : 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600 }}>{t('vina.exhaustiveness')}</label>
            <input type="number" min={1} max={32} value={exhaustiveness}
              onChange={e => setExhaustiveness(Math.min(32, Math.max(1, parseInt(e.target.value) || 8)))}
              style={{ width: 50, padding: '5px 6px', borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 12, textAlign: 'center' }}
            />
          </div>
          <button onClick={runVina} disabled={running || !receptor}
            style={{ padding: '8px 20px', borderRadius: radius.md, border: 'none', fontWeight: 700, fontSize: 13,
              backgroundColor: (running || !receptor) ? colors.border : '#ef4444', color: '#fff',
              cursor: (running || !receptor) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            {running
              ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span> {t('vina.running')}</>
              : <><i className="bi bi-play-fill" /> {t('vina.run')}</>}
          </button>
        </div>
        {scores.length > 0 && (
          <>
            <div style={{ overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#0f172a' }}>
                    {[t('vina.mode'), `${t('vina.affinity')} (kcal/mol)`, 'RMSD l.b.', 'RMSD u.b.'].map(h => (
                      <th key={h} style={{ padding: '5px 10px', color: '#fff', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s, i) => (
                    <tr key={i} style={{ backgroundColor: i === 0 ? '#fff7f7' : i % 2 === 0 ? '#f8fafc' : '#fff', borderBottom: `1px solid ${colors.borderLight}` }}>
                      <td style={{ padding: '5px 10px', textAlign: 'center', fontWeight: i === 0 ? 800 : 400, color: i === 0 ? '#dc2626' : colors.text }}>
                        {i === 0 && <i className="bi bi-trophy-fill" style={{ marginRight: 4, color: '#f59e0b' }} />}{i + 1}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 700, color: i === 0 ? '#dc2626' : colors.text }}>{s.affinity}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'center', color: colors.textMuted }}>{s.rmsd_lb ?? '—'}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'center', color: colors.textMuted }}>{s.rmsd_ub ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* ── Redocking Validation ── */}
            {(fetchingRef || nativeRef) && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: radius.md, border: '1px solid #e0e7ff', backgroundColor: '#f5f3ff' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="bi bi-shield-check" /> {t('redock.title')}
                  {nativeRef?.cached && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, backgroundColor: '#ede9fe', color: '#7c3aed', fontWeight: 700 }}>{t('redock.cached')}</span>}
                </div>
                {(fetchingRef && !nativeRef) ? (
                  <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span>
                    {t('redock.native')}…
                  </div>
                ) : nativeRef ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{t('redock.native').toUpperCase()}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9' }}>{nativeRef.inhibitor}</div>
                      <div style={{ fontSize: 11, color: '#475569' }}>{nativeRef.affinity} kcal/mol</div>
                    </div>
                    <div style={{ fontSize: 18, color: '#c4b5fd' }}>vs</div>
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{t('redock.yourMol').toUpperCase()}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{t('vina.pose1')}</div>
                      <div style={{ fontSize: 11, color: '#475569' }}>{scores[0]?.affinity} kcal/mol</div>
                    </div>
                    {(() => {
                      const q = parseFloat(String(scores[0]?.affinity));
                      const n = nativeRef.affinity;
                      if (isNaN(q)) return null;
                      const beats = q <= n;
                      const delta = (q - n).toFixed(1);
                      return (
                        <div style={{ padding: '6px 12px', borderRadius: radius.md, backgroundColor: beats ? '#dcfce7' : '#fff7ed', border: `1px solid ${beats ? '#86efac' : '#fdba74'}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 16 }}>{beats ? '★' : '▽'}</div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: beats ? '#15803d' : '#c2410c' }}>{beats ? t('redock.beats') : t('redock.below')}</div>
                          <div style={{ fontSize: 10, color: beats ? '#16a34a' : '#ea580c' }}>{t('redock.delta')} = {delta} kcal/mol</div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            )}

            {session?.sessionId && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: colors.textMuted, userSelect: 'none', marginBottom: 4 }}>
                  <i className="bi bi-badge-3d" style={{ marginRight: 5 }} />Ver pose 3D (3Dmol.js)
                </summary>
                <iframe
                  src={`/api/docking/viewer?pdb=${receptor!.id}&cx=${grid.cx}&cy=${grid.cy}&cz=${grid.cz}&sx=${grid.sx}&sy=${grid.sy}&sz=${grid.sz}&color=blue&session=${session.sessionId}&pose=0&aff=${encodeURIComponent(scores[0]?.affinity ?? '')}&v=${Date.now()}`.replace(/,/g,'.')}
                  style={{ width: '100%', height: 340, border: 'none', borderRadius: radius.md, backgroundColor: '#1a1a2e', marginTop: 4 }}
                  title="3D Docking Viewer"
                />
              </details>
            )}
          </>
        )}
      </DockSection>

      {/* ── E: PLIP ── */}
      <DockSection icon="bi-diagram-3" label={t('plip.title')} color="#10b981"
        locked={!session} lockMsg={t('plip.waitDocking')}
        badge={plip ? t('status.done') : undefined} badgeOk={!!plip}
        last
      >
        {!plip ? (
          <button onClick={analyzePlip} disabled={analyzing || !session}
            style={{ padding: '7px 16px', borderRadius: radius.md, border: 'none', fontWeight: 600, fontSize: 12,
              backgroundColor: (analyzing || !session) ? colors.border : '#10b981', color: '#fff',
              cursor: (analyzing || !session) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {analyzing
              ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span> {t('plip.running')}</>
              : <><i className="bi bi-search" /> {t('plip.run')}</>}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Pill label={t('plip.hbonds')} value={String(plip.interactions?.hbonds?.length ?? 0)} ok={(plip.interactions?.hbonds?.length ?? 0) > 0} />
              <Pill label={t('plip.hydrophobic')} value={String(plip.interactions?.hydrophobic?.length ?? 0)} />
              <Pill label={t('plip.pistack')} value={String(plip.interactions?.pi_stacking?.length ?? 0)} />
              {plip.ki && <Pill label={t('vina.ki')} value={plip.ki} />}
            </div>
            {plip.interactions?.hbonds?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 4 }}>{t('plip.hbonds')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {plip.interactions.hbonds.map((h: any, i: number) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontWeight: 600 }}>
                      {h.residue} {h.dist}Å
                    </span>
                  ))}
                </div>
              </div>
            )}
            {plip.interactions?.hydrophobic?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 4 }}>{t('plip.hydrophobic')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {plip.interactions.hydrophobic.map((h: any, i: number) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontWeight: 600 }}>
                      {h.residue} {h.dist}Å
                    </span>
                  ))}
                </div>
              </div>
            )}
            {plip.diagram && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: colors.textMuted, userSelect: 'none' }}>
                  <i className="bi bi-image" style={{ marginRight: 5 }} /> Diagrama de interações
                </summary>
                <div dangerouslySetInnerHTML={{ __html: plip.diagram }} style={{ marginTop: 6 }} />
              </details>
            )}
          </div>
        )}
      </DockSection>

      {showLibrary && (
        <TargetLibrary
          onLoad={(pdbId, ligandId, chainId) => loadReceptor(pdbId, ligandId, chainId ?? undefined)}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}

// ── ADMET step body — uses real components identical to PredictPage ───────────

const ADMET_TOTAL = 6;

interface AdmetPanelProps {
  smiles: string;
  admetKey: number;
  onToolLoaded: (data: any[]) => void;
  onToolError: () => void;
}

function AdmetPanel({ smiles, admetKey, onToolLoaded, onToolError }: AdmetPanelProps) {
  return (
    <div key={admetKey}>
      <ToolErrorBoundary toolName="RDKit" onError={onToolError}>
        <RDKitFilters smiles={smiles} onDataLoaded={onToolLoaded} />
      </ToolErrorBoundary>
      <ToolErrorBoundary toolName="StopTox" onError={onToolError}>
        <Prediction smiles={smiles} onDataLoaded={onToolLoaded} />
      </ToolErrorBoundary>
      <ToolErrorBoundary toolName="StopLight" onError={onToolError}>
        <StopLight smiles={smiles} onDataLoaded={onToolLoaded} />
      </ToolErrorBoundary>
      <ToolErrorBoundary toolName="Tox21" onError={onToolError}>
        <Tox21 smiles={smiles} onDataLoaded={onToolLoaded} />
      </ToolErrorBoundary>
      <ToolErrorBoundary toolName="Deep ADMET" onError={onToolError}>
        <DeepADMET smiles={smiles} onDataLoaded={onToolLoaded} />
      </ToolErrorBoundary>
      <ToolErrorBoundary toolName="GraphB3" onError={onToolError}>
        <GraphB3 smiles={smiles} onDataLoaded={onToolLoaded} />
      </ToolErrorBoundary>
    </div>
  );
}

// ── export ────────────────────────────────────────────────────────────────────

type DockingExportData = {
  single?: { receptorId?: string; scores?: any[]; session?: any; plip?: any; nativeRef?: { affinity: number; inhibitor: string } | null };
  screening?: ScreenResult[];
} | null;

function buildExportRows(
  smiles: string,
  steps: Record<StepId, StepState>,
  admetRows: any[],
  dockingData?: DockingExportData,
) {
  const rows: any[] = [];

  const desc = steps.descriptors?.data;
  if (desc) {
    const PROPS = [
      'MolecularWeight','ExactMolWt','LogP','HBD','HBA','TPSA',
      'RotatableBonds','QED','LipinskiViolations','FractionCSP3',
      'BalabanJ','BertzCT','Kappa1','Kappa2','HeavyAtoms',
    ];
    PROPS.forEach(p => {
      if (desc[p] !== undefined)
        rows.push({ SMILES: smiles, Tool: 'Descriptors', Category: 'Physicochemical', Property: p, Value: String(desc[p]), Unit: '' });
    });
  }

  // ADMET rows collected from component callbacks
  admetRows.forEach(r => rows.push(r));

  const dock = steps.docking?.data;
  if (dock?.status === 'ok' && dock.props) {
    Object.entries(dock.props).forEach(([k, v]) =>
      rows.push({ SMILES: smiles, Tool: 'LibPrep', Category: '3D Preparation', Property: k, Value: String(v), Unit: '' }));
    if (dock.energy != null)
      rows.push({ SMILES: smiles, Tool: 'LibPrep', Category: '3D Preparation', Property: 'Energy_MMFF94', Value: String(dock.energy), Unit: 'kcal/mol' });
  }

  // ── Single docking results ────────────────────────────────────────────────
  const sd = dockingData?.single;
  if (sd?.scores?.length) {
    if (sd.receptorId)
      rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'Single', Property: 'Receptor_PDB', Value: sd.receptorId, Unit: '' });
    sd.scores.forEach((s: any) => {
      rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'Single', Property: `Mode_${s.mode}_Affinity`, Value: String(s.affinity), Unit: 'kcal/mol' });
      if (s.ki)   rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'Single', Property: `Mode_${s.mode}_Ki`, Value: s.ki, Unit: '' });
      if (s.rmsd != null) rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'Single', Property: `Mode_${s.mode}_RMSD`, Value: String(s.rmsd), Unit: 'Å' });
    });
    const pl = sd.plip;
    if (pl?.interactions) {
      rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'PLIP', Property: 'Hbonds', Value: String(pl.interactions.hbonds?.length ?? 0), Unit: '' });
      rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'PLIP', Property: 'Hydrophobic', Value: String(pl.interactions.hydrophobic?.length ?? 0), Unit: '' });
      rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'PLIP', Property: 'PiStacking', Value: String(pl.interactions.pi_stacking?.length ?? 0), Unit: '' });
      if (pl.interactions.hbonds?.length)
        rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'PLIP', Property: 'Hbond_Residues', Value: pl.interactions.hbonds.map((h: any) => `${h.residue}(${h.dist}Å)`).join('; '), Unit: '' });
      if (pl.interactions.hydrophobic?.length)
        rows.push({ SMILES: smiles, Tool: 'Docking', Category: 'PLIP', Property: 'Hydrophobic_Residues', Value: pl.interactions.hydrophobic.map((h: any) => `${h.residue}(${h.dist}Å)`).join('; '), Unit: '' });
    }
  }

  // ── Screening results ─────────────────────────────────────────────────────
  dockingData?.screening?.filter(r => r.status === 'done' && r.affinity != null).forEach(r => {
    rows.push({ SMILES: smiles, Tool: 'Screening', Category: r.disease.name, Property: `${r.target.name}_PDB`, Value: r.target.pdbId, Unit: '' });
    rows.push({ SMILES: smiles, Tool: 'Screening', Category: r.disease.name, Property: `${r.target.name}_Affinity`, Value: String(r.affinity), Unit: 'kcal/mol' });
    rows.push({ SMILES: smiles, Tool: 'Screening', Category: r.disease.name, Property: `${r.target.name}_Gene`, Value: r.target.gene, Unit: '' });
    if (r.nativeAffinity != null)
      rows.push({ SMILES: smiles, Tool: 'Screening', Category: r.disease.name, Property: `${r.target.name}_NativeRef`, Value: String(r.nativeAffinity), Unit: 'kcal/mol' });
  });

  return rows;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function affinityColor(a: number | string): string {
  const v = typeof a === 'string' ? parseFloat(a) : a;
  if (isNaN(v)) return '#94a3b8';
  if (v <= -9)  return '#059669';
  if (v <= -7)  return '#0891b2';
  if (v <= -5)  return '#d97706';
  return '#dc2626';
}

function affinityLabel(a: number | string): string {
  const v = typeof a === 'string' ? parseFloat(a) : a;
  if (isNaN(v)) return '';
  if (v <= -9)  return 'Forte';
  if (v <= -7)  return 'Bom';
  if (v <= -5)  return 'Moderado';
  return 'Fraco';
}

// ── DockingReport ─────────────────────────────────────────────────────────────

interface DockingReportProps {
  smiles: string;
  imgUrl?: string;
  dockingData: DockingExportData;
}

function DockingReport({ smiles, imgUrl, dockingData }: DockingReportProps) {
  if (!dockingData) return null;

  const { single, screening } = dockingData;
  const hasData = (single?.scores?.length ?? 0) > 0 || (screening?.filter(r => r.status === 'done').length ?? 0) > 0;
  if (!hasData) return null;

  const boxStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '14px 18px',
    marginTop: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  const sectionTitle = (icon: string, label: string, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, paddingBottom: 7, borderBottom: '1px solid #f1f5f9' }}>
      <i className={`bi ${icon}`} style={{ color, fontSize: 14 }} />
      <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#334155' }}>
        {label}
      </span>
    </div>
  );

  const affinityBar = (value: number | string) => {
    const v = typeof value === 'string' ? parseFloat(value) : value;
    const pct = Math.min(100, Math.max(0, ((v + 12) / 12) * 100));
    const col = affinityColor(v);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <div style={{ flex: 1, height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: col, borderRadius: 3, transition: 'width 0.4s ease' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: col, whiteSpace: 'nowrap' }}>{v} kcal/mol</span>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, backgroundColor: col + '20', color: col }}>
          {affinityLabel(v)}
        </span>
      </div>
    );
  };

  const plipSection = (plip: any) => {
    if (!plip?.interactions) return null;
    const hb = plip.interactions.hbonds ?? [];
    const hy = plip.interactions.hydrophobic ?? [];
    const pi = plip.interactions.pi_stacking ?? [];
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, fontWeight: 700, backgroundColor: hb.length > 0 ? '#ecfdf5' : '#f8fafc', color: hb.length > 0 ? '#059669' : '#94a3b8', border: `1px solid ${hb.length > 0 ? '#a7f3d0' : '#e2e8f0'}` }}>
            <i className="bi bi-arrow-left-right" style={{ marginRight: 4 }} />H-bond: {hb.length}
          </span>
          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, fontWeight: 700, backgroundColor: hy.length > 0 ? '#eff6ff' : '#f8fafc', color: hy.length > 0 ? '#2563eb' : '#94a3b8', border: `1px solid ${hy.length > 0 ? '#bfdbfe' : '#e2e8f0'}` }}>
            <i className="bi bi-circle" style={{ marginRight: 4 }} />Hidrofóbico: {hy.length}
          </span>
          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, fontWeight: 700, backgroundColor: pi.length > 0 ? '#fdf4ff' : '#f8fafc', color: pi.length > 0 ? '#9333ea' : '#94a3b8', border: `1px solid ${pi.length > 0 ? '#e9d5ff' : '#e2e8f0'}` }}>
            <i className="bi bi-hexagon" style={{ marginRight: 4 }} />π-stack: {pi.length}
          </span>
        </div>
        {hb.length > 0 && (
          <div style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>H-bonds: </span>
            {hb.map((h: any, i: number) => (
              <span key={i} style={{ fontSize: 10, marginRight: 4, padding: '1px 6px', borderRadius: 4, backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontWeight: 600 }}>
                {h.residue} {h.dist}Å
              </span>
            ))}
          </div>
        )}
        {hy.length > 0 && (
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hidrofóbico: </span>
            {hy.map((h: any, i: number) => (
              <span key={i} style={{ fontSize: 10, marginRight: 4, padding: '1px 6px', borderRadius: 4, backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontWeight: 600 }}>
                {h.residue} {h.dist}Å
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#14b8a6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-boxes" style={{ color: '#fff', fontSize: 13 }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Docking Report</span>
        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace', background: '#f1f5f9', borderRadius: 4, padding: '2px 6px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{smiles}</span>
      </div>

      {/* Single docking */}
      {single?.scores?.length ? (
        <div style={boxStyle}>
          {sectionTitle('bi-boxes', `Docking Individual${single.receptorId ? ' — ' + single.receptorId : ''}`, '#14b8a6')}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
            {imgUrl && (
              <img src={imgUrl} alt="mol" style={{ width: 130, height: 100, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: '#fff', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Melhor pose</div>
              {affinityBar(single.scores[0].affinity)}
              {single.scores[0].ki && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                  <i className="bi bi-eyedropper" style={{ marginRight: 5, color: '#0891b2' }} />Ki: <strong style={{ color: '#0f172a' }}>{single.scores[0].ki}</strong>
                </div>
              )}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                <i className="bi bi-layers" style={{ marginRight: 5, color: '#8b5cf6' }} />Poses: <strong style={{ color: '#0f172a' }}>{single.scores.length}</strong>
              </div>

              {/* Controle — ligante nativo */}
              {single.nativeRef && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    <i className="bi bi-bookmark-check" style={{ marginRight: 4 }} />
                    Controle — {single.nativeRef.inhibitor} (ligante nativo)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', minWidth: 60, border: '1px dashed #cbd5e1' }}>
                      <div style={{
                        width: `${Math.min(100, Math.max(0, ((single.nativeRef.affinity + 12) / 12) * 100))}%`,
                        height: '100%',
                        backgroundColor: '#94a3b8',
                        borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>
                      {single.nativeRef.affinity} kcal/mol
                    </span>
                    {(() => {
                      const diff = parseFloat(String(single.scores[0].affinity)) - single.nativeRef!.affinity;
                      const better = diff < 0;
                      return (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap',
                          backgroundColor: better ? '#ecfdf5' : '#fef2f2',
                          color: better ? '#059669' : '#dc2626' }}>
                          {better ? '▲' : '▼'} {Math.abs(diff).toFixed(1)} vs ref
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Todas as poses */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Todas as poses
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {single.scores.map((s: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', minWidth: 14, textAlign: 'right' }}>{s.mode}</span>
                  {affinityBar(s.affinity)}
                  <span style={{
                    fontSize: 10, whiteSpace: 'nowrap', minWidth: 68, textAlign: 'right',
                    color: s.rmsd != null ? '#64748b' : '#cbd5e1',
                  }}>
                    RMSD {s.rmsd != null ? `${typeof s.rmsd === 'number' ? s.rmsd.toFixed(2) : s.rmsd} Å` : '—'}
                  </span>
                </div>
              ))}
              {/* Linha de controle (nativeRef) como referência visual */}
              {single.nativeRef && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6, marginTop: 4, borderTop: '1px dashed #e2e8f0' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', minWidth: 14, textAlign: 'right' }}>REF</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <div style={{ flex: 1, height: 5, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', minWidth: 60, border: '1px dashed #cbd5e1' }}>
                      <div style={{
                        width: `${Math.min(100, Math.max(0, ((single.nativeRef.affinity + 12) / 12) * 100))}%`,
                        height: '100%', backgroundColor: '#94a3b8', borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {single.nativeRef.affinity} kcal/mol
                    </span>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                      {single.nativeRef.inhibitor}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: '#cbd5e1', minWidth: 68, textAlign: 'right' }}>controle</span>
                </div>
              )}
            </div>
          </div>

          {single.plip && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                <i className="bi bi-diagram-3" style={{ marginRight: 5, color: '#059669' }} />Interações PLIP
              </div>
              {plipSection(single.plip)}
              {single.plip.diagram && (
                <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: single.plip.diagram }} />
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Screening results */}
      {screening && screening.filter(r => r.status === 'done').length > 0 && (() => {
        const done = [...screening.filter(r => r.status === 'done' && r.affinity != null)].sort((a, b) => (a.affinity ?? 0) - (b.affinity ?? 0));
        const best = done[0];
        return (
          <div style={boxStyle}>
            {sectionTitle('bi-grid-1x2', `Multi-Target Screening — ${done.length} alvo${done.length > 1 ? 's' : ''} concluído${done.length > 1 ? 's' : ''}`, '#f59e0b')}
            {best && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, backgroundColor: '#fffbeb', border: '1px solid #fde68a', marginBottom: 12 }}>
                <i className="bi bi-trophy-fill" style={{ color: '#d97706', fontSize: 16 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e' }}>Melhor hit: {best.target.name} ({best.target.pdbId})</div>
                  <div style={{ fontSize: 11, color: '#78350f' }}>{best.disease.name} · {best.affinity} kcal/mol · {best.target.gene}</div>
                </div>
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['#', 'Alvo', 'PDB', 'Doença', 'Afinidade', 'Ki', 'Ref'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {done.map((r, i) => {
                    const col = affinityColor(r.affinity!);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i === 0 ? '#fffbeb' : 'transparent' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 700, color: i === 0 ? '#d97706' : '#64748b' }}>{i + 1}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{r.target.name}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{r.target.pdbId}</td>
                        <td style={{ padding: '6px 10px', fontSize: 11, color: '#475569' }}>{r.disease.name}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ fontWeight: 700, color: col }}>{r.affinity}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 3 }}>kcal/mol</span>
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: 11, color: '#475569' }}>
                          {r.affinity != null ? (() => {
                            const ki = Math.exp(parseFloat(String(r.affinity)) / 0.592);
                            if (ki < 1e-6) return `${(ki * 1e9).toFixed(1)} nM`;
                            if (ki < 1e-3) return `${(ki * 1e6).toFixed(1)} µM`;
                            return `${(ki * 1e3).toFixed(1)} mM`;
                          })() : '—'}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          {r.nativeAffinity != null ? (
                            <span style={{ fontSize: 10, color: '#64748b' }}>{r.nativeAffinity} kcal/mol</span>
                          ) : r.nativeStatus === 'running' ? (
                            <span style={{ fontSize: 10, color: '#2563eb' }}>⟳</span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── step card ─────────────────────────────────────────────────────────────────

interface StepCardProps {
  id: StepId;
  state: StepState;
  open: boolean;
  onToggle: () => void;
  onRun?: () => void;
  runDisabled?: boolean;
  extra?: React.ReactNode;
  skipRunningSpinner?: boolean;
  children: React.ReactNode;
}

function StepCard({ id, state, open, onToggle, onRun, runDisabled, extra, skipRunningSpinner, children }: StepCardProps) {
  const meta = STEP_META[id];
  const { t } = useLanguage();
  const showRun = onRun && state.status !== 'running' && state.status !== 'skipped';

  return (
    <div style={{
      backgroundColor: '#fff',
      border: `1px solid ${state.status === 'done' ? meta.color + '50' : state.status === 'error' ? '#fca5a5' : colors.border}`,
      borderRadius: radius.lg,
      boxShadow: state.status === 'done' ? `0 0 0 3px ${meta.color}14` : shadow.sm,
      overflow: 'hidden',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}>
      <div style={{ display: 'flex' }}>
        <div style={{
          width: 3, flexShrink: 0,
          backgroundColor: state.status === 'done' ? meta.color : state.status === 'running' ? meta.color : state.status === 'error' ? '#ef4444' : 'transparent',
          transition: 'background-color 0.3s',
        }} />
        <div style={{ flex: 1 }}>
          {/* Header */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '13px 18px 13px 14px',
              backgroundColor: state.status === 'done' ? `${meta.color}06` : '#fff',
              borderBottom: open ? `1px solid ${colors.borderLight}` : 'none',
              cursor: 'pointer',
            }}
            onClick={onToggle}
          >
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              backgroundColor: state.status === 'done' || state.status === 'running' ? meta.color : colors.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className={`bi ${meta.icon}`} style={{
                fontSize: 13,
                color: state.status === 'done' || state.status === 'running' ? '#fff' : colors.textLight,
              }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: colors.textLight, fontWeight: 700, letterSpacing: '0.08em' }}>
                  STEP {meta.num}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: colors.navy }}>{t(meta.i18nKey as any)}</span>
                <StatusBadge status={state.status} />
              </div>
              {state.error && (
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#dc2626' }}>
                  <i className="bi bi-exclamation-circle" style={{ marginRight: 4 }} />{state.error}
                </p>
              )}
            </div>

            {extra}

            {showRun && (
              <button
                onClick={e => { e.stopPropagation(); if (!runDisabled) onRun!(); }}
                disabled={runDisabled}
                style={{
                  padding: '5px 13px', borderRadius: radius.md,
                  border: `1px solid ${runDisabled ? colors.border : meta.color}`,
                  backgroundColor: 'transparent',
                  color: runDisabled ? colors.textLight : meta.color,
                  fontSize: 12, fontWeight: 600,
                  cursor: runDisabled ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                }}
              >
                <i className="bi bi-play-fill" />
                {state.status === 'done' ? 'Re-run' : 'Run'}
              </button>
            )}

            <i className={`bi bi-chevron-${open ? 'up' : 'down'}`}
               style={{ fontSize: 12, color: colors.textLight, marginLeft: 2, flexShrink: 0 }} />
          </div>

          {/* Body */}
          {open && (
            <div style={{ padding: '18px 20px' }}>
              {state.status === 'running' && !skipRunningSpinner && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.textMuted }}>
                  <div style={{
                    width: 18, height: 18, border: `2px solid ${meta.color}`,
                    borderTopColor: 'transparent', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13 }}>Processando…</span>
                </div>
              )}
              {(state.status !== 'running' || skipRunningSpinner) && children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── connector between steps ───────────────────────────────────────────────────

function PipelineConnector({ active }: { active: boolean }) {
  const color = active ? '#10b981' : colors.borderLight;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: 22, padding: '1px 0' }}>
      <div style={{ width: 2, flex: 1, backgroundColor: color, transition: 'background-color 0.3s' }} />
      <div style={{
        width: 7, height: 7,
        borderRight: `2px solid ${color}`,
        borderBottom: `2px solid ${color}`,
        transform: 'rotate(45deg)',
        transition: 'border-color 0.3s',
        marginBottom: 2,
      }} />
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  initialSmiles: string;
  onNavigate: (id: string, smiles?: string) => void;
  onSmilesChange: (s: string) => void;
}

const SmilesFlowPage: React.FC<Props> = ({ onBack, initialSmiles, onSmilesChange }) => {
  const [flowMode, setFlowMode] = useState<'single' | 'batch'>('single');
  const [smiles, setSmiles] = useState(initialSmiles);
  const [steps, setSteps] = useState<Record<StepId, StepState>>(initSteps);
  const [open, setOpen] = useState<Record<StepId, boolean>>(
    { structure: true, descriptors: true, admet: true, docking: true, export_: true }
  );
  const [dockingEnabled, setDockingEnabled] = useState(true);
  const [dockingRunKey, setDockingRunKey]   = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ADMET component state
  const [admetSmiles, setAdmetSmiles] = useState('');
  const [admetKey, setAdmetKey] = useState(0);
  const admetDoneRef = useRef(0);
  const admetRowsRef = useRef<any[]>([]);

  const imgUrlRef         = useRef<string | null>(null);
  const dockingDataRef    = useRef<DockingExportData>(null);
  const [dockingReportData, setDockingReportData] = useState<DockingExportData>(null);

  const setStep = useCallback((id: StepId, patch: Partial<StepState>) => {
    setSteps(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const openStep = useCallback((id: StepId) => {
    setOpen(prev => ({ ...prev, [id]: true }));
  }, []);

  const toggleOpen = (id: StepId) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));

  // Called when each ADMET component finishes loading
  const handleAdmetLoaded = useCallback((data: any[]) => {
    admetRowsRef.current = [...admetRowsRef.current, ...data];
    admetDoneRef.current += 1;
    if (admetDoneRef.current >= ADMET_TOTAL) {
      setStep('admet', { status: 'done', data: { rows: admetRowsRef.current } });
    }
  }, [setStep]);

  const handleAdmetError = useCallback(() => {
    admetDoneRef.current += 1;
    if (admetDoneRef.current >= ADMET_TOTAL) {
      setStep('admet', { status: 'done', data: { rows: admetRowsRef.current } });
    }
  }, [setStep]);

  const triggerAdmet = useCallback((s: string) => {
    admetDoneRef.current = 0;
    admetRowsRef.current = [];
    setStep('admet', { status: 'running', error: undefined, data: undefined });
    openStep('admet');
    setAdmetSmiles(s);
    setAdmetKey(k => k + 1);
  }, [setStep, openStep]);

  const runSingleStep = useCallback(async (id: StepId, smilesVal: string) => {
    if (id === 'admet') { triggerAdmet(smilesVal); return; }
    if (id === 'docking') { setDockingRunKey(k => k + 1); return; }
    setStep(id, { status: 'running', error: undefined });
    openStep(id);
    try {
      let data: any;
      if (id === 'structure') {
        if (imgUrlRef.current) URL.revokeObjectURL(imgUrlRef.current);
        data = await runStructureStep(smilesVal);
        imgUrlRef.current = data.imgUrl;
      } else if (id === 'descriptors') {
        data = await runDescriptorsStep(smilesVal);
      }
      setStep(id, { status: 'done', data });
    } catch (err: any) {
      setStep(id, { status: 'error', error: err.message ?? 'Erro desconhecido' });
    }
  }, [setStep, openStep, triggerAdmet]);

  const runAll = useCallback(async () => {
    if (!smiles.trim() || isRunning) return;
    setIsRunning(true);
    onSmilesChange(smiles);
    const s = smiles;

    setSteps(prev => {
      const next = { ...prev };
      (['structure', 'descriptors', 'admet'] as StepId[]).forEach(id => { next[id] = { status: 'idle' }; });
      next.docking  = dockingEnabled ? { status: 'idle' } : { status: 'skipped' };
      next.export_  = { status: 'idle' };
      return next;
    });

    await runSingleStep('structure', s);
    await runSingleStep('descriptors', s);
    triggerAdmet(s);
    if (dockingEnabled) setDockingRunKey(k => k + 1);
    setIsRunning(false);
  }, [smiles, dockingEnabled, isRunning, runSingleStep, triggerAdmet, onSmilesChange]);

  const exportExcel = useCallback(async () => {
    const rows = buildExportRows(smiles, steps, admetRowsRef.current, dockingDataRef.current);
    if (!rows.length) return;
    setExporting(true);
    setStep('export_', { status: 'running', error: undefined });
    try {
      const res = await fetch('/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error('Export falhou: ' + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smilesflow_${smiles.slice(0, 20).replace(/[^A-Za-z0-9]/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStep('export_', { status: 'done' });
    } catch (err: any) {
      setStep('export_', { status: 'error', error: err.message });
    } finally {
      setExporting(false);
    }
  }, [smiles, steps, setStep]);

  const [exportingPdf, setExportingPdf] = useState(false);

  const exportPDF = useCallback(async () => {
    setExportingPdf(true);
    try {
      await generatePDFReport({
        smiles,
        imgUrl: imgUrlRef.current ?? undefined,
        descriptors: steps.descriptors?.data ?? undefined,
        admetRows: admetRowsRef.current.length > 0 ? admetRowsRef.current : undefined,
        docking: dockingDataRef.current ? {
          single:    dockingDataRef.current.single,
          screening: dockingDataRef.current.screening,
        } : undefined,
      });
    } catch (err: any) {
      setStep('export_', { status: 'error', error: 'PDF: ' + err.message });
    } finally {
      setExportingPdf(false);
    }
  }, [smiles, steps, setStep]);

  const doneSteps = PIPELINE_STEPS.filter(id => steps[id].status === 'done');
  const totalSteps = dockingEnabled ? 4 : 3;
  const hasResults = steps.descriptors.status === 'done' || steps.admet.status === 'done';
  const pipelineComplete = doneSteps.length === totalSteps && totalSteps > 0;

  return (
    <PageShell title="SMILESFlow" icon="bi-benzene-flow" accentColor="#3b82f6" onBack={onBack}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          { id: 'single' as const, icon: 'bi-rulers',  label: 'Molécula Única' },
          { id: 'batch'  as const, icon: 'bi-list-ul', label: 'Lote (até 20)' },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setFlowMode(tab.id)}
            style={{
              padding: '7px 16px', borderRadius: radius.md, border: 'none',
              fontWeight: 600, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              backgroundColor: flowMode === tab.id ? '#3b82f6' : '#f1f5f9',
              color: flowMode === tab.id ? '#fff' : '#64748b',
              transition: 'background-color 0.15s',
            }}>
            <i className={`bi ${tab.icon}`} />{tab.label}
          </button>
        ))}
      </div>

      {/* Batch mode */}
      {flowMode === 'batch' && (
        <BatchFlowPanel
          onSmilesChange={onSmilesChange}
          onAnalyzeSingle={smi => {
            setSmiles(smi);
            setSteps(initSteps());
            setAdmetSmiles('');
            setFlowMode('single');
          }}
        />
      )}

      {/* Single-molecule mode */}
      {flowMode === 'single' && <>

      {/* Input bar */}
      <div style={{
        backgroundColor: '#fff', border: `1px solid ${colors.border}`,
        borderRadius: radius.lg, boxShadow: shadow.sm,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 5px 5px 14px', marginBottom: 20,
      }}>
        <i className="bi bi-rulers" style={{ color: colors.textLight, fontSize: 15, flexShrink: 0 }} />
        <input
          value={smiles}
          onChange={e => setSmiles(e.target.value)}
          placeholder="Cole um SMILES aqui… ex: CC(=O)Oc1ccccc1C(=O)O"
          style={{
            flex: 1, border: 'none', outline: 'none', fontSize: 14,
            fontFamily: 'monospace', color: colors.text, backgroundColor: 'transparent',
            padding: '8px 4px',
          }}
          onKeyDown={e => e.key === 'Enter' && !isRunning && runAll()}
        />
        <button onClick={() => setDrawerOpen(true)} title="Desenhar"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '7px 9px', color: colors.blue }}>
          <i className="bi bi-pencil-square" style={{ fontSize: 17 }} />
        </button>
        {smiles && (
          <button onClick={() => { setSmiles(''); setSteps(initSteps()); setAdmetSmiles(''); setIsRunning(false); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '7px 9px', color: colors.textLight }}>
            <i className="bi bi-x-circle" style={{ fontSize: 17 }} />
          </button>
        )}
        <button
          onClick={runAll}
          disabled={!smiles.trim() || isRunning}
          style={{
            padding: '9px 22px', borderRadius: radius.md, border: 'none',
            backgroundColor: (!smiles.trim() || isRunning) ? colors.border : '#3b82f6',
            color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: (!smiles.trim() || isRunning) ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'background-color 0.2s', flexShrink: 0,
          }}
        >
          {isRunning ? (
            <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Rodando…</>
          ) : (
            <><i className="bi bi-play-fill" /> Run Pipeline</>
          )}
        </button>
      </div>

      {/* Progress bar */}
      {doneSteps.length > 0 && (
        <div style={{
          marginBottom: 20, padding: '10px 16px', borderRadius: radius.md,
          backgroundColor: pipelineComplete ? '#ecfdf5' : '#eff6ff',
          border: `1px solid ${pipelineComplete ? '#a7f3d0' : '#bfdbfe'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <i className={`bi ${pipelineComplete ? 'bi-check-circle-fill' : 'bi-hourglass-split'}`}
             style={{ color: pipelineComplete ? '#059669' : '#2563eb', fontSize: 16 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: pipelineComplete ? '#065f46' : '#1e40af' }}>
                {pipelineComplete ? 'Pipeline completo!' : `${doneSteps.length} de ${totalSteps} etapas`}
              </span>
              {hasResults && !pipelineComplete && (
                <span style={{ fontSize: 12, color: '#2563eb' }}>Resultados parciais disponíveis</span>
              )}
            </div>
            <div style={{ height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${(doneSteps.length / totalSteps) * 100}%`,
                backgroundColor: pipelineComplete ? '#059669' : '#3b82f6',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Step 1 – Structure */}
        <StepCard
          id="structure" state={steps.structure} open={open.structure}
          onToggle={() => toggleOpen('structure')}
          onRun={() => runSingleStep('structure', smiles)}
          runDisabled={!smiles.trim() || isRunning}
        >
          {steps.structure.status === 'done' && steps.structure.data ? (
            <StructureResult data={steps.structure.data} descData={steps.descriptors.data} />
          ) : steps.structure.status !== 'running' && (
            <p style={{ color: colors.textLight, fontSize: 13, margin: 0 }}>
              Renderização 2D via RDKit. Clique em Run Pipeline ou Run nesta etapa.
            </p>
          )}
        </StepCard>

        <PipelineConnector active={steps.structure.status === 'done'} />

        {/* Step 2 – Descriptors */}
        <StepCard
          id="descriptors" state={steps.descriptors} open={open.descriptors}
          onToggle={() => toggleOpen('descriptors')}
          onRun={() => runSingleStep('descriptors', smiles)}
          runDisabled={!smiles.trim() || isRunning}
        >
          {steps.descriptors.status === 'done' && steps.descriptors.data ? (
            <DescriptorsResult data={steps.descriptors.data} />
          ) : steps.descriptors.status !== 'running' && (
            <p style={{ color: colors.textLight, fontSize: 13, margin: 0 }}>
              200+ descritores: MW, LogP, HBD, HBA, TPSA, QED, Kappa, topológicos e mais.
            </p>
          )}
        </StepCard>

        <PipelineConnector active={steps.descriptors.status === 'done'} />

        {/* Step 3 – ADMET (same components as PredictPage) */}
        <StepCard
          id="admet" state={steps.admet} open={open.admet}
          onToggle={() => toggleOpen('admet')}
          onRun={() => triggerAdmet(smiles)}
          runDisabled={!smiles.trim() || isRunning}
          skipRunningSpinner
        >
          {admetSmiles ? (
            <>
              <AdmetPanel
                smiles={admetSmiles}
                admetKey={admetKey}
                onToolLoaded={handleAdmetLoaded}
                onToolError={handleAdmetError}
              />
              {steps.admet.status === 'done' && steps.admet.data?.rows?.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <BodyMapDecision
                    allResults={steps.admet.data.rows}
                    uniqueSmiles={[admetSmiles]}
                  />
                </div>
              )}
            </>
          ) : (
            <p style={{ color: colors.textLight, fontSize: 13, margin: 0 }}>
              6 engines em paralelo: RDKit Filters · StopTox · StopLight · Tox21 · DeepADMET · GraphB3.
            </p>
          )}
        </StepCard>

        <PipelineConnector active={steps.admet.status === 'done'} />

        {/* Step 4 – Docking (LibPrep + Receptor + Vina + PLIP) */}
        <StepCard
          id="docking" state={steps.docking} open={open.docking}
          onToggle={() => toggleOpen('docking')}
          onRun={dockingEnabled ? () => setDockingRunKey(k => k + 1) : undefined}
          runDisabled={!smiles.trim() || isRunning}
          skipRunningSpinner
          extra={
            <div onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
              <button
                onClick={() => {
                  const next = !dockingEnabled;
                  setDockingEnabled(next);
                  setStep('docking', { status: next ? 'idle' : 'skipped', data: undefined });
                }}
                style={{
                  padding: '4px 10px', borderRadius: radius.md, border: 'none', fontSize: 11,
                  fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  backgroundColor: dockingEnabled ? '#fef2f2' : '#ecfdf5',
                  color: dockingEnabled ? '#dc2626' : '#059669',
                  transition: 'background-color 0.2s',
                }}
              >
                <i className={`bi ${dockingEnabled ? 'bi-x-circle' : 'bi-plus-circle'}`} />
                {dockingEnabled ? 'Pular etapa' : 'Incluir'}
              </button>
            </div>
          }
        >
          {dockingEnabled ? (
            <DockingPanel
              smiles={smiles}
              runKey={dockingRunKey}
              onStatusChange={(status, data) => setStep('docking', { status, data, error: undefined })}
              onDockingData={(d) => { dockingDataRef.current = d; setDockingReportData(d); }}
            />
          ) : (
            <p style={{ color: colors.textLight, fontSize: 13, margin: 0 }}>
              Ative o toggle para incluir LibPrep 3D + Receptor + AutoDock Vina + PLIP no pipeline.
            </p>
          )}
        </StepCard>

        <PipelineConnector active={doneSteps.length === totalSteps} />

        {/* Step 5 – Export */}
        <StepCard
          id="export_" state={steps.export_} open={open.export_}
          onToggle={() => toggleOpen('export_')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {hasResults ? (
              <>
                <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
                  Consolida descritores, ADMET (RDKit, StopTox, StopLight, Tox21, DeepADMET, GraphB3)
                  {dockingReportData ? ', resultados de docking (Vina + PLIP)' : steps.docking.status === 'done' ? ' e LibPrep 3D' : ''}
                  {' '}em uma planilha Excel.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={exportExcel}
                    disabled={exporting}
                    style={{
                      padding: '10px 20px', borderRadius: radius.md, border: 'none',
                      backgroundColor: exporting ? colors.border : '#059669',
                      color: '#fff', fontWeight: 600, fontSize: 13,
                      cursor: exporting ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <i className="bi bi-file-earmark-excel" />
                    {exporting ? 'Exportando…' : 'Download Excel'}
                  </button>
                  <button
                    onClick={exportPDF}
                    disabled={exportingPdf}
                    style={{
                      padding: '10px 20px', borderRadius: radius.md, border: 'none',
                      backgroundColor: exportingPdf ? colors.border : '#ef4444',
                      color: '#fff', fontWeight: 600, fontSize: 13,
                      cursor: exportingPdf ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <i className="bi bi-file-earmark-pdf" />
                    {exportingPdf ? 'Gerando PDF…' : 'Download PDF'}
                  </button>
                </div>
                {steps.export_.status === 'done' && (
                  <p style={{ margin: 0, color: '#059669', fontSize: 13, fontWeight: 600 }}>
                    <i className="bi bi-check-circle-fill" style={{ marginRight: 6 }} />
                    Arquivo gerado com sucesso.
                  </p>
                )}
                {steps.export_.status === 'error' && (
                  <p style={{ margin: 0, color: '#dc2626', fontSize: 13 }}>
                    <i className="bi bi-exclamation-circle" style={{ marginRight: 6 }} />
                    {steps.export_.error}
                  </p>
                )}

                {/* ── Docking Report inline ── */}
                <DockingReport
                  smiles={smiles}
                  imgUrl={imgUrlRef.current ?? undefined}
                  dockingData={dockingReportData}
                />
              </>
            ) : (
              <p style={{ color: colors.textLight, fontSize: 13, margin: 0 }}>
                Execute pelo menos as etapas de Descritores ou ADMET para habilitar a exportação.
              </p>
            )}
          </div>
        </StepCard>

      </div>

      <MoleculeDrawerModal
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onApply={(smi) => setSmiles(smi)}
      />

      </> /* end single mode */}
    </PageShell>
  );
};

export default SmilesFlowPage;
