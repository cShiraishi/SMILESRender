import React, { useState, useEffect, useRef, useMemo } from 'react';
import PageShell from '../components/PageShell';
import SmilesCard from '../components/SmilesCard';
import { colors, radius, shadow } from '../styles/themes';

declare global {
  interface Window { Chart: any; }
}

interface MolData {
  smiles: string;
  MolecularWeight: number;
  TPSA: number;
  LogP: number;
  HBD: number;
  HBA: number;
  RotatableBonds: number;
  QED: number;
  Rings: number;
  HeavyAtoms?: number;
  FractionCSP3?: number;
  MolMR?: number;
  AromaticRings?: number;
  BertzCT?: number;
  LipinskiViolations?: number;
  [key: string]: any;
}

const AXIS_OPTIONS = [
  { value: 'MolecularWeight', label: 'Molecular Weight (Da)' },
  { value: 'LogP',            label: 'LogP (Lipophilicity)' },
  { value: 'TPSA',            label: 'TPSA (Å²)' },
  { value: 'HBD',             label: 'H-Bond Donors' },
  { value: 'HBA',             label: 'H-Bond Acceptors' },
  { value: 'RotatableBonds',  label: 'Rotatable Bonds' },
  { value: 'QED',             label: 'QED (Drug-likeness)' },
  { value: 'Rings',           label: 'Ring Count' },
  { value: 'HeavyAtoms',      label: 'Heavy Atom Count' },
  { value: 'FractionCSP3',    label: 'Fsp3 (Saturation)' },
  { value: 'MolMR',           label: 'Molar Refractivity' },
  { value: 'AromaticRings',   label: 'Aromatic Rings' },
  { value: 'BertzCT',         label: 'Bertz Complexity' },
];

type ChartTab = 'bubble' | 'radar' | 'histogram' | 'correlation';

// ─── Pearson r ────────────────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

// white → red (positive) | white → blue (negative)
function corrColor(r: number): string {
  const t = Math.abs(r);
  if (r >= 0) return `rgb(${Math.round(255-35*t)},${Math.round(255-205*t)},${Math.round(255-205*t)})`;
  return `rgb(${Math.round(255-205*t)},${Math.round(255-205*t)},${Math.round(255-35*t)})`;
}

const CORR_PROPS  = ['MolecularWeight','LogP','TPSA','HBD','HBA','RotatableBonds','QED','Rings','FractionCSP3','MolMR'];
const CORR_LABELS = ['MW','LogP','TPSA','HBD','HBA','RotB','QED','Rings','Fsp3','MR'];

// Radar: Lipinski / Veber reference limits for normalization
const RADAR_PROPS = [
  { key: 'MolecularWeight', label: 'MW',   max: 600, ref: 500 },
  { key: 'LogP',            label: 'LogP', max: 8,   ref: 5   },
  { key: 'TPSA',            label: 'TPSA', max: 180, ref: 140 },
  { key: 'HBD',             label: 'HBD',  max: 8,   ref: 5   },
  { key: 'HBA',             label: 'HBA',  max: 14,  ref: 10  },
  { key: 'RotatableBonds',  label: 'RotB', max: 14,  ref: 10  },
  { key: 'QED',             label: 'QED',  max: 1,   ref: 0.6 },
];

const MOL_COLORS = [
  '#0ea5e9','#8b5cf6','#f59e0b','#10b981','#ef4444',
  '#3b82f6','#ec4899','#14b8a6','#f97316','#6366f1',
];

// ─── Main content ─────────────────────────────────────────────────────────────
function LibraryContent({ initialSmiles }: { initialSmiles?: string }) {
  const [data,      setData]      = useState<MolData[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [activeTab, setActiveTab] = useState<ChartTab>('bubble');

  // Chemical Space controls
  const [spaceMode, setSpaceMode] = useState<'scatter' | 'bubble'>('scatter');
  const [xProp,    setXProp]    = useState('MolecularWeight');
  const [yProp,    setYProp]    = useState('LogP');
  const [sizeProp, setSizeProp] = useState('TPSA');

  // Histogram controls
  const [histProp, setHistProp] = useState('MolecularWeight');

  const chartRef      = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  // ── Fetch descriptors ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialSmiles) { setError('Please paste SMILES in the Hub to visualize data.'); return; }
    
    const fetchChunks = async () => {
      setLoading(true); setError(null); setData([]);
      const smiles = initialSmiles.split('\n').map(s => s.trim()).filter(Boolean);
      if (smiles.length === 0) { setError('SMILES list is empty.'); setLoading(false); return; }

      const CHUNK_SIZE = 20;
      const allClean: MolData[] = [];

      try {
        for (let i = 0; i < smiles.length; i += CHUNK_SIZE) {
          const chunk = smiles.slice(i, i + CHUNK_SIZE);
          const r = await fetch('/descriptors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ smiles: chunk }),
          });
          
          if (!r.ok) throw new Error('Backend server error.');
          const res = await r.json();
          if (res.error) throw new Error(res.error);
          
          const clean = res.filter((m: any) => !m.error);
          allClean.push(...clean);
          setData([...allClean]); // incremental update
        }
        
        if (allClean.length === 0) throw new Error('No valid structures in library.');
      } catch (err: any) {
        setError(err.message || 'Error calculating properties.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchChunks();
  }, [initialSmiles]);

  // ── Build / rebuild Chart.js instance ──────────────────────────────────────
  useEffect(() => {
    let timer: any;

    const buildChart = () => {
      if (activeTab === 'correlation') {
        if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
        return;
      }
      if (!chartRef.current || !data.length || !window.Chart) {
        // Retry when canvas not yet in DOM (tab just switched) OR Chart.js not loaded
        if (data.length && (!chartRef.current || !window.Chart)) timer = setTimeout(buildChart, 80);
        return;
      }
      if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }

      const ctx = chartRef.current.getContext('2d');

      // ─ Chemical Space (scatter 2-var or bubble 3-var) ───────────────────────
      if (activeTab === 'bubble') {
        const violBg   = (m: MolData) => { const v = m.LipinskiViolations ?? 0; return v === 0 ? '#10b981bb' : v === 1 ? '#f59e0bbb' : '#ef4444bb'; };
        const violBd   = (m: MolData) => { const v = m.LipinskiViolations ?? 0; return v === 0 ? '#059669'   : v === 1 ? '#d97706'   : '#dc2626';   };
        const xLabel   = AXIS_OPTIONS.find(o => o.value === xProp)?.label    || xProp;
        const yLabel   = AXIS_OPTIONS.find(o => o.value === yProp)?.label    || yProp;
        const szLabel  = AXIS_OPTIONS.find(o => o.value === sizeProp)?.label || sizeProp;

        if (spaceMode === 'scatter') {
          chartInstance.current = new window.Chart(ctx, {
            type: 'scatter',
            data: {
              datasets: [{
                label: 'Molecules',
                data: data.map((m, i) => ({ x: m[xProp], y: m[yProp], idx: i, violations: m.LipinskiViolations ?? 0 })),
                backgroundColor: data.map(violBg),
                borderColor:     data.map(violBd),
                borderWidth: 1.5,
                pointRadius: 7,
                pointHoverRadius: 10,
              }],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    title: (items: any[]) => `Compound ${items[0].raw.idx + 1}`,
                    label: (item: any) => [
                      ` ${xLabel}: ${item.raw.x.toFixed(3)}`,
                      ` ${yLabel}: ${item.raw.y.toFixed(3)}`,
                      ` Lipinski violations: ${item.raw.violations}`,
                    ],
                  },
                },
              },
              scales: {
                x: { title: { display: true, text: xLabel, font: { weight: 'bold', size: 12 }, color: colors.textMuted }, grid: { color: '#f1f5f9' } },
                y: { title: { display: true, text: yLabel, font: { weight: 'bold', size: 12 }, color: colors.textMuted }, grid: { color: '#f1f5f9' } },
              },
            },
          });
        } else {
          // bubble — 3rd variable encoded as radius
          const sizeVals = data.map(m => m[sizeProp] as number);
          const sMin = Math.min(...sizeVals), sRange = (Math.max(...sizeVals) - sMin) || 1;

          chartInstance.current = new window.Chart(ctx, {
            type: 'bubble',
            data: {
              datasets: [{
                label: 'Molecules',
                data: data.map((m, i) => ({
                  x: m[xProp],
                  y: m[yProp],
                  r: 7 + ((m[sizeProp] as number - sMin) / sRange) * 22,
                  idx: i,
                  violations: m.LipinskiViolations ?? 0,
                })),
                backgroundColor: data.map(violBg),
                borderColor:     data.map(violBd),
                borderWidth: 1.5,
              }],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    title: (items: any[]) => `Compound ${items[0].raw.idx + 1}`,
                    label: (item: any) => {
                      const m = data[item.raw.idx];
                      return [
                        ` ${xLabel}: ${item.raw.x.toFixed(3)}`,
                        ` ${yLabel}: ${item.raw.y.toFixed(3)}`,
                        ` ${szLabel}: ${m?.[sizeProp]}`,
                        ` Lipinski violations: ${item.raw.violations}`,
                      ];
                    },
                  },
                },
              },
              scales: {
                x: { title: { display: true, text: xLabel, font: { weight: 'bold', size: 12 }, color: colors.textMuted }, grid: { color: '#f1f5f9' } },
                y: { title: { display: true, text: yLabel, font: { weight: 'bold', size: 12 }, color: colors.textMuted }, grid: { color: '#f1f5f9' } },
              },
            },
          });
        }
      }

      // ─ Radar ────────────────────────────────────────────────────────────────
      else if (activeTab === 'radar') {
        const mols = data.slice(0, 10);
        const datasets: any[] = mols.map((m, i) => ({
          label: `#${i + 1}`,
          data: RADAR_PROPS.map(p => Math.min(1, (m[p.key] as number ?? 0) / p.max)),
          borderColor: MOL_COLORS[i % MOL_COLORS.length],
          backgroundColor: MOL_COLORS[i % MOL_COLORS.length] + '22',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: MOL_COLORS[i % MOL_COLORS.length],
        }));

        // Lipinski reference ring
        datasets.push({
          label: 'Lipinski limit',
          data: RADAR_PROPS.map(p => p.ref / p.max),
          borderColor: '#94a3b8',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 0,
          pointHoverRadius: 0,
        });

        chartInstance.current = new window.Chart(ctx, {
          type: 'radar',
          data: { labels: RADAR_PROPS.map(p => p.label), datasets },
          options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
              r: {
                min: 0, max: 1,
                ticks: { display: false },
                grid: { color: '#e2e8f0' },
                angleLines: { color: '#e2e8f0' },
                pointLabels: { font: { size: 13, weight: 'bold' }, color: colors.text },
              },
            },
            plugins: {
              legend: {
                display: true, position: 'right' as const,
                labels: { boxWidth: 12, font: { size: 11 } },
              },
              tooltip: {
                callbacks: {
                  label: (item: any) => {
                    if (item.datasetIndex >= mols.length) {
                      const p = RADAR_PROPS[item.dataIndex];
                      return ` Lipinski limit: ${p.ref} (norm: ${(p.ref / p.max).toFixed(2)})`;
                    }
                    const p   = RADAR_PROPS[item.dataIndex];
                    const mol = data[item.datasetIndex];
                    return ` ${item.dataset.label}: ${mol?.[p.key] ?? 'N/A'} ${p.max === 1 ? '' : `/ ${p.max}`}`;
                  },
                },
              },
            },
          },
        });
      }

      // ─ Histogram ────────────────────────────────────────────────────────────
      else if (activeTab === 'histogram') {
        const vals = data.map(m => m[histProp] as number).filter(v => v != null);
        if (!vals.length) return;

        const vMin = Math.min(...vals), vMax = Math.max(...vals);
        const k = Math.max(5, Math.ceil(Math.log2(vals.length) + 1)); // Sturges rule
        const bw = (vMax - vMin) / k || 1;

        const bins: number[] = Array(k).fill(0);
        const labels: string[] = [];
        for (let i = 0; i < k; i++) {
          const lo = vMin + i * bw, hi = vMin + (i + 1) * bw;
          labels.push(`${lo.toFixed(1)}`);
          bins[i] = vals.filter(v => v >= lo && (i === k - 1 ? v <= hi : v < hi)).length;
        }

        chartInstance.current = new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: AXIS_OPTIONS.find(o => o.value === histProp)?.label || histProp,
              data: bins,
              backgroundColor: '#0ea5e9aa',
              borderColor: '#0ea5e9',
              borderWidth: 1.5,
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items: any[]) => `≈ ${items[0].label}`,
                  label: (item: any) => ` ${item.raw} molecules`,
                },
              },
            },
            scales: {
              x: {
                title: { display: true, text: AXIS_OPTIONS.find(o => o.value === histProp)?.label || histProp, font: { weight: 'bold', size: 12 }, color: colors.textMuted },
                grid: { display: false },
                ticks: { maxRotation: 45, font: { size: 10 } },
              },
              y: {
                title: { display: true, text: 'Frequency', font: { weight: 'bold', size: 12 }, color: colors.textMuted },
                grid: { color: '#f1f5f9' },
                ticks: { precision: 0 },
              },
            },
          },
        });
      }
    };

    buildChart();
    return () => {
      if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
      if (timer) clearTimeout(timer);
    };
  }, [data, activeTab, spaceMode, xProp, yProp, sizeProp, histProp]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const corrMatrix = useMemo(() => {
    if (data.length < 2) return null;
    return CORR_PROPS.map(p1 =>
      CORR_PROPS.map(p2 => pearson(
        data.map(m => m[p1] as number),
        data.map(m => m[p2] as number),
      ))
    );
  }, [data]);

  const histStats = useMemo(() => {
    if (!data.length) return null;
    const vals = data.map(m => m[histProp] as number).filter(v => v != null);
    if (!vals.length) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const n = vals.length;
    const mean   = vals.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    return { mean: mean.toFixed(3), median: median.toFixed(3), std: std.toFixed(3), min: sorted[0].toFixed(3), max: sorted[n - 1].toFixed(3) };
  }, [data, histProp]);

  const summary = useMemo(() => {
    if (!data.length) return null;
    const avg = (k: string) => (data.reduce((a, m) => a + (m[k] as number ?? 0), 0) / data.length).toFixed(2);
    return {
      mw:       avg('MolecularWeight'),
      logp:     avg('LogP'),
      qed:      avg('QED'),
      tpsa:     avg('TPSA'),
      lipinski: data.filter(m => (m.LipinskiViolations ?? 0) === 0).length,
    };
  }, [data]);

  const filtered = data.filter(m => m.smiles.toLowerCase().includes(search.toLowerCase()));

  const TABS: { id: ChartTab; icon: string; label: string }[] = [
    { id: 'bubble',      icon: 'bi-diagram-3',    label: 'Chemical Space'   },
    { id: 'radar',       icon: 'bi-pentagon',      label: 'Drug Profiles'    },
    { id: 'histogram',   icon: 'bi-bar-chart',     label: 'Distributions'    },
    { id: 'correlation', icon: 'bi-grid-3x3-gap',  label: 'Correlations'     },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── KPI summary strip ─────────────────────────────────────────────── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '14px' }}>
          {[
            { label: 'Avg MW',       value: `${summary.mw} Da`, icon: 'bi-atom',          color: '#0ea5e9' },
            { label: 'Avg LogP',     value: summary.logp,       icon: 'bi-droplet-half',  color: '#8b5cf6' },
            { label: 'Avg TPSA',     value: `${summary.tpsa} Å²`, icon: 'bi-circle-half', color: '#f59e0b' },
            { label: 'Avg QED',      value: summary.qed,        icon: 'bi-star-half',     color: '#10b981' },
            { label: 'Lipinski OK',  value: `${summary.lipinski}/${data.length}`, icon: 'bi-check-circle', color: '#059669' },
          ].map((kpi, i) => (
            <div key={i} style={{ backgroundColor: '#fff', borderRadius: radius.md, border: `1px solid ${colors.borderLight}`, padding: '16px', boxShadow: shadow.sm }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                <i className={`bi ${kpi.icon}`} style={{ color: kpi.color, fontSize: '15px' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: colors.text }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Analytics panel ───────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: radius.lg, border: `1px solid ${colors.borderLight}`, boxShadow: shadow.sm, overflow: 'hidden' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: '#f8fafc' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              flex: 1, padding: '13px 6px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.id ? `2px solid #0ea5e9` : '2px solid transparent',
              color: activeTab === tab.id ? '#0ea5e9' : colors.textMuted,
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'color 0.15s',
            }}>
              <i className={`bi ${tab.icon}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab controls */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: '#fafbfd', minHeight: '62px', display: 'flex', alignItems: 'center' }}>

          {activeTab === 'bubble' && (
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', width: '100%' }}>

              {/* Mode toggle */}
              <div style={{ display: 'flex', borderRadius: '8px', border: `1px solid ${colors.border}`, overflow: 'hidden', flexShrink: 0, alignSelf: 'flex-end', marginBottom: '1px' }}>
                {([['scatter', 'bi-circle', '2 Variables'], ['bubble', 'bi-circle-fill', '3 Variables']] as const).map(([mode, icon, lbl]) => (
                  <button key={mode} onClick={() => setSpaceMode(mode)} style={{
                    padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: '6px',
                    backgroundColor: spaceMode === mode ? '#0ea5e9' : '#fff',
                    color:           spaceMode === mode ? '#fff'    : colors.textMuted,
                    transition: 'background 0.15s, color 0.15s',
                  }}>
                    <i className={`bi ${icon}`} style={{ fontSize: '11px' }} />
                    {lbl}
                  </button>
                ))}
              </div>

              {/* X / Y selectors (always visible) */}
              {[
                { label: 'X Axis', val: xProp, set: setXProp },
                { label: 'Y Axis', val: yProp, set: setYProp },
              ].map(ctrl => (
                <div key={ctrl.label} style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', marginBottom: '5px', display: 'block', letterSpacing: '0.06em' }}>{ctrl.label}</label>
                  <select value={ctrl.val} onChange={e => ctrl.set(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`, fontSize: '12px' }}>
                    {AXIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}

              {/* Bubble size — only in 3-variable mode */}
              {spaceMode === 'bubble' && (
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', marginBottom: '5px', display: 'block', letterSpacing: '0.06em' }}>Bubble Size</label>
                  <select value={sizeProp} onChange={e => setSizeProp(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`, fontSize: '12px' }}>
                    {AXIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              {/* Lipinski legend */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', paddingBottom: '2px' }}>
                {([['#10b981', '#059669', '0 violations'], ['#f59e0b', '#d97706', '1 violation'], ['#ef4444', '#dc2626', '2+ violations']] as const).map(([bg, bd, lbl]) => (
                  <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: bg, border: `2px solid ${bd}` }} />
                    <span style={{ fontSize: '11px', color: colors.textMuted }}>{lbl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'radar' && (
            <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted, lineHeight: 1.5 }}>
              <b style={{ color: colors.text }}>Drug-likeness Radar —</b> Normalized property profiles (max 10 compounds).
              Dashed grey ring = Lipinski / Veber reference limits.
            </p>
          )}

          {activeTab === 'histogram' && (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
              <div style={{ minWidth: '200px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', marginBottom: '5px', display: 'block', letterSpacing: '0.06em' }}>Property</label>
                <select value={histProp} onChange={e => setHistProp(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`, fontSize: '12px', minWidth: '200px' }}>
                  {AXIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {histStats && (
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {([['Mean', histStats.mean], ['Median', histStats.median], ['Std Dev', histStats.std], ['Min', histStats.min], ['Max', histStats.max]] as const).map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lbl}</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: colors.text }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'correlation' && (
            <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted, lineHeight: 1.5 }}>
              <b style={{ color: colors.text }}>Pearson Correlation Matrix —</b> Linear correlation between physicochemical descriptors.&nbsp;
              <span style={{ color: '#dc2626' }}>Red = positive</span> |&nbsp;
              <span style={{ color: '#2563eb' }}>Blue = negative</span> |&nbsp;
              White = no correlation.
            </p>
          )}
        </div>

        {/* Chart viewport */}
        <div style={{ padding: '24px', position: 'relative', minHeight: '420px' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffffdd', zIndex: 10, gap: '14px' }}>
              <div style={{ width: 32, height: 32, border: '3px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontWeight: 600, color: colors.textMuted, fontSize: '13px' }}>Computing molecular descriptors…</span>
            </div>
          )}

          {error && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '360px', gap: '10px', color: colors.danger }}>
              <i className="bi bi-exclamation-octagon" style={{ fontSize: '36px' }} />
              <div style={{ fontWeight: 600, textAlign: 'center', maxWidth: '400px', fontSize: '14px' }}>{error}</div>
            </div>
          )}

          {/* Canvas-based charts */}
          {!loading && !error && activeTab !== 'correlation' && (
            <div style={{ height: '390px', position: 'relative' }}>
              <canvas ref={chartRef} />
            </div>
          )}

          {/* Correlation heatmap (HTML table) */}
          {!loading && !error && activeTab === 'correlation' && corrMatrix && (
            <div style={{ overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: '3px', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 8px', color: 'transparent', userSelect: 'none' }}>__</th>
                    {CORR_LABELS.map(l => (
                      <th key={l} style={{ padding: '4px 8px', fontWeight: 700, color: colors.text, textAlign: 'center', fontSize: '11px', whiteSpace: 'nowrap' }}>{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corrMatrix.map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 10px', fontWeight: 700, color: colors.text, fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'right' }}>{CORR_LABELS[i]}</td>
                      {row.map((r, j) => (
                        <td key={j} style={{
                          padding: '10px 8px',
                          minWidth: '52px',
                          backgroundColor: corrColor(r),
                          textAlign: 'center',
                          fontWeight: i === j ? 800 : 600,
                          color: Math.abs(r) > 0.55 ? '#fff' : colors.text,
                          borderRadius: '6px',
                          cursor: 'default',
                          title: `${CORR_LABELS[i]} vs ${CORR_LABELS[j]}: ${r.toFixed(3)}`,
                        }}>
                          {r.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && activeTab === 'correlation' && !corrMatrix && data.length > 0 && (
            <div style={{ textAlign: 'center', color: colors.textLight, padding: '60px', fontSize: '13px' }}>
              At least 2 molecules required for correlation analysis.
            </div>
          )}
        </div>
      </div>

      {/* ── Compound library grid ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: colors.text }}>
            Compound Library <span style={{ color: colors.textLight, fontWeight: 400 }}>({data.length})</span>
          </h3>
          <div style={{ position: 'relative', width: '280px' }}>
            <i className="bi bi-search" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: colors.textLight, fontSize: '13px' }} />
            <input
              type="text" placeholder="Filter by SMILES…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '10px', border: `1px solid ${colors.border}`, outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {data.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '60px', border: `2px dashed ${colors.border}`, borderRadius: radius.md, color: colors.textLight }}>
            <i className="bi bi-inbox" style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }} />
            Paste SMILES in the Hub to start exploring!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '18px' }}>
            {filtered.map((mol, i) => {
              const viol = mol.LipinskiViolations ?? 0;
              const vc = viol === 0 ? colors.success : viol === 1 ? colors.warning : colors.danger;
              const vbg = viol === 0 ? colors.successBg : viol === 1 ? colors.warningBg : colors.dangerBg;
              return (
                <div key={i} style={{ backgroundColor: '#fff', borderRadius: radius.md, border: `1px solid ${colors.borderLight}`, boxShadow: shadow.sm, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '16px', backgroundColor: '#fcfcfc', borderBottom: `1px solid ${colors.borderLight}`, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '140px' }}>
                    <SmilesCard smiles={mol.smiles} />
                  </div>
                  <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: colors.text }}>Compound {i + 1}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', backgroundColor: vbg, color: vc }}>
                        {viol === 0 ? 'Lipinski ✓' : `${viol} violation${viol > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: colors.blue, marginBottom: '10px', wordBreak: 'break-all', lineHeight: 1.4 }} title={mol.smiles}>
                      {mol.smiles.length > 45 ? `${mol.smiles.slice(0, 45)}…` : mol.smiles}
                    </div>
                    <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '10px', color: colors.textMuted, backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                      {[['MW', mol.MolecularWeight], ['LogP', mol.LogP], ['TPSA', mol.TPSA], ['QED', mol.QED], ['HBD', mol.HBD], ['HBA', mol.HBA]].map(([lbl, val]) => (
                        <div key={lbl as string}><b style={{ color: colors.textMuted }}>{lbl}:</b> {val}</div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function LibraryPage({ onBack, initialSmiles }: { onBack: () => void; initialSmiles?: string }) {
  return (
    <PageShell
      icon="bi-grid-1x2"
      title="SMILES Library Analytics"
      subtitle="Professional cheminformatics analysis — chemical space, drug profiles, distributions and correlations."
      accentColor="#0ea5e9"
      onBack={onBack}
    >
      <LibraryContent initialSmiles={initialSmiles} />
    </PageShell>
  );
}

export default LibraryPage;
