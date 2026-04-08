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

// ─── Drug-likeness filter predicates ─────────────────────────────────────────
const checkVeber    = (m: MolData) => (m.RotatableBonds ?? 0) <= 10 && (m.TPSA ?? 0) <= 140;
const checkEgan     = (m: MolData) => (m.LogP ?? 0) <= 5.88 && (m.TPSA ?? 0) <= 131.6;
const checkGhose    = (m: MolData) => {
  const mw = m.MolecularWeight ?? 0, logp = m.LogP ?? 0, ha = m.HeavyAtoms ?? 0, mr = m.MolMR ?? 0;
  return mw >= 160 && mw <= 480 && logp >= -0.4 && logp <= 5.6 && ha >= 20 && ha <= 70 && mr >= 40 && mr <= 130;
};
// Teague / Hann & Oprea lead-likeness
const checkLeadLike = (m: MolData) =>
  (m.MolecularWeight ?? 0) < 350 && (m.LogP ?? 0) < 3 &&
  (m.HBD ?? 0) <= 3 && (m.HBA ?? 0) <= 8 && (m.RotatableBonds ?? 0) <= 7;

const FILTER_DEFS = [
  { key: 'ro5',      label: 'Ro5',       ref: 'Lipinski (2001)',      check: (m: MolData) => (m.LipinskiViolations ?? 0) === 0 },
  { key: 'veber',    label: 'Veber',     ref: 'Veber et al. (2002)',  check: checkVeber    },
  { key: 'egan',     label: 'Egan',      ref: 'Egan et al. (2000)',   check: checkEgan     },
  { key: 'ghose',    label: 'Ghose',     ref: 'Ghose et al. (1999)',  check: checkGhose    },
  { key: 'leadlike', label: 'Lead-like', ref: 'Teague et al. (1999)', check: checkLeadLike },
];

// ─── Statistics ───────────────────────────────────────────────────────────────
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

function calcSkewness(vals: number[]): number {
  const n = vals.length;
  if (n < 3) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (std === 0) return 0;
  return vals.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n;
}

// white → red (positive) | white → blue (negative)
function corrColor(r: number): string {
  const t = Math.abs(r);
  if (r >= 0) return `rgb(${Math.round(255-35*t)},${Math.round(255-205*t)},${Math.round(255-205*t)})`;
  return `rgb(${Math.round(255-205*t)},${Math.round(255-205*t)},${Math.round(255-35*t)})`;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const AXIS_OPTIONS = [
  { value: 'MolecularWeight', label: 'Molecular Weight (Da)' },
  { value: 'LogP',            label: 'LogP (Lipophilicity)'  },
  { value: 'TPSA',            label: 'TPSA (Å²)'            },
  { value: 'HBD',             label: 'H-Bond Donors'         },
  { value: 'HBA',             label: 'H-Bond Acceptors'      },
  { value: 'RotatableBonds',  label: 'Rotatable Bonds'       },
  { value: 'QED',             label: 'QED (Drug-likeness)'   },
  { value: 'Rings',           label: 'Ring Count'             },
  { value: 'HeavyAtoms',      label: 'Heavy Atom Count'       },
  { value: 'FractionCSP3',    label: 'Fsp3 (Saturation)'     },
  { value: 'MolMR',           label: 'Molar Refractivity'     },
  { value: 'AromaticRings',   label: 'Aromatic Rings'         },
  { value: 'BertzCT',         label: 'Bertz Complexity'       },
];

// Reference threshold lines for histograms (Ro5/Veber/Ghose cutoffs)
const PROP_THRESHOLDS: Record<string, { value: number; label: string } | null> = {
  MolecularWeight: { value: 500,  label: 'Ro5 ≤500'   },
  LogP:            { value: 5,    label: 'Ro5 ≤5'     },
  TPSA:            { value: 140,  label: 'Veber ≤140' },
  HBD:             { value: 5,    label: 'Ro5 ≤5'     },
  HBA:             { value: 10,   label: 'Ro5 ≤10'    },
  RotatableBonds:  { value: 10,   label: 'Veber ≤10'  },
  MolMR:           { value: 130,  label: 'Ghose ≤130' },
  QED:             null,
  Rings:           null,
  HeavyAtoms:      null,
  FractionCSP3:    null,
  AromaticRings:   null,
  BertzCT:         null,
};

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

type ChartTab = 'bubble' | 'radar' | 'histogram' | 'correlation' | 'filters';

// ─── Main content ─────────────────────────────────────────────────────────────
function LibraryContent({ initialSmiles }: { initialSmiles?: string }) {
  const [data,      setData]      = useState<MolData[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [activeTab, setActiveTab] = useState<ChartTab>('bubble');
  const [sortProp,  setSortProp]  = useState('QED');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');

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
          setData([...allClean]);
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

    // Threshold reference line plugin (created inside effect so histProp is always fresh)
    const thresholdPlugin = {
      id: 'thresholdLine',
      afterDraw(chart: any) {
        const thr = PROP_THRESHOLDS[histProp];
        if (!thr) return;
        const { ctx, scales: { x, y } } = chart;
        const xPx = x.getPixelForValue(thr.value);
        if (xPx < x.left || xPx > x.right) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xPx, y.top);
        ctx.lineTo(xPx, y.bottom);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(thr.label, xPx + 4, y.top + 14);
        ctx.restore();
      },
    };

    const buildChart = () => {
      if (activeTab === 'correlation' || activeTab === 'filters') {
        if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }
        return;
      }
      if (!chartRef.current || !data.length || !window.Chart) {
        if (data.length && (!chartRef.current || !window.Chart)) timer = setTimeout(buildChart, 80);
        return;
      }
      if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }

      const ctx = chartRef.current.getContext('2d');

      // ─ Chemical Space ───────────────────────────────────────────────────────
      if (activeTab === 'bubble') {
        const violBg = (m: MolData) => { const v = m.LipinskiViolations ?? 0; return v === 0 ? '#10b981bb' : v === 1 ? '#f59e0bbb' : '#ef4444bb'; };
        const violBd = (m: MolData) => { const v = m.LipinskiViolations ?? 0; return v === 0 ? '#059669'   : v === 1 ? '#d97706'   : '#dc2626';   };
        const xLabel  = AXIS_OPTIONS.find(o => o.value === xProp)?.label    || xProp;
        const yLabel  = AXIS_OPTIONS.find(o => o.value === yProp)?.label    || yProp;
        const szLabel = AXIS_OPTIONS.find(o => o.value === sizeProp)?.label || sizeProp;

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
                    label: (item: any) => {
                      const m = data[item.raw.idx];
                      return [
                        ` ${xLabel}: ${item.raw.x.toFixed(3)}`,
                        ` ${yLabel}: ${item.raw.y.toFixed(3)}`,
                        ` Lipinski violations: ${item.raw.violations}`,
                        ` Veber: ${checkVeber(m) ? '✓' : '✗'}  |  Egan: ${checkEgan(m) ? '✓' : '✗'}`,
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
        } else {
          const sizeVals = data.map(m => m[sizeProp] as number);
          const sMin = Math.min(...sizeVals), sRange = (Math.max(...sizeVals) - sMin) || 1;

          chartInstance.current = new window.Chart(ctx, {
            type: 'bubble',
            data: {
              datasets: [{
                label: 'Molecules',
                data: data.map((m, i) => ({
                  x: m[xProp], y: m[yProp],
                  r: 7 + ((m[sizeProp] as number - sMin) / sRange) * 22,
                  idx: i, violations: m.LipinskiViolations ?? 0,
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
                        ` Veber: ${checkVeber(m) ? '✓' : '✗'}  |  Egan: ${checkEgan(m) ? '✓' : '✗'}`,
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

        datasets.push({
          label: 'Ro5/Veber limit',
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
              legend: { display: true, position: 'right' as const, labels: { boxWidth: 12, font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  label: (item: any) => {
                    if (item.datasetIndex >= mols.length) {
                      const p = RADAR_PROPS[item.dataIndex];
                      return ` Ro5/Veber limit: ${p.ref} (norm: ${(p.ref / p.max).toFixed(2)})`;
                    }
                    const p = RADAR_PROPS[item.dataIndex];
                    const mol = data[item.datasetIndex];
                    return ` ${item.dataset.label}: ${mol?.[p.key] ?? 'N/A'} ${p.max === 1 ? '' : `/ ${p.max}`}`;
                  },
                },
              },
            },
          },
        });
      }

      // ─ Histogram (Sturges bins + drug-likeness reference line) ──────────────
      else if (activeTab === 'histogram') {
        const vals = data.map(m => m[histProp] as number).filter(v => v != null);
        if (!vals.length) return;

        const vMin = Math.min(...vals), vMax = Math.max(...vals);
        const k = Math.max(5, Math.ceil(Math.log2(vals.length) + 1));
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
          plugins: [thresholdPlugin],
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
      CORR_PROPS.map(p2 => pearson(data.map(m => m[p1] as number), data.map(m => m[p2] as number)))
    );
  }, [data]);

  const histStats = useMemo(() => {
    if (!data.length) return null;
    const vals = data.map(m => m[histProp] as number).filter(v => v != null);
    if (!vals.length) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const n    = vals.length;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const q1   = sorted[Math.floor(n * 0.25)];
    const q3   = sorted[Math.floor(n * 0.75)];
    return {
      mean: mean.toFixed(3), median: median.toFixed(3), std: std.toFixed(3),
      q1: q1.toFixed(3), q3: q3.toFixed(3), iqr: (q3 - q1).toFixed(3),
      min: sorted[0].toFixed(3), max: sorted[n - 1].toFixed(3),
      skewness: calcSkewness(vals).toFixed(3),
    };
  }, [data, histProp]);

  const summary = useMemo(() => {
    if (!data.length) return null;
    const vals   = (k: string) => data.map(m => m[k] as number ?? 0);
    const avg    = (k: string) => vals(k).reduce((a, b) => a + b, 0) / data.length;
    const sd     = (k: string) => { const m = avg(k); return Math.sqrt(vals(k).reduce((a, b) => a + (b - m) ** 2, 0) / data.length); };
    const median = (k: string) => { const s = [...vals(k)].sort((a, b) => a - b); const n = s.length; return n % 2 === 0 ? (s[n/2-1]+s[n/2])/2 : s[Math.floor(n/2)]; };
    return {
      n:        data.length,
      medMW:    median('MolecularWeight').toFixed(1),
      avgLogP:  avg('LogP').toFixed(2),
      sdLogP:   sd('LogP').toFixed(2),
      avgTPSA:  avg('TPSA').toFixed(1),
      avgQED:   avg('QED').toFixed(3),
      sdQED:    sd('QED').toFixed(3),
      avgFsp3:  avg('FractionCSP3').toFixed(3),
      pctRo5:   Math.round(data.filter(m => (m.LipinskiViolations ?? 0) === 0).length / data.length * 100),
      pctVeber: Math.round(data.filter(checkVeber).length / data.length * 100),
    };
  }, [data]);

  const filterResults = useMemo(() =>
    data.map(m => ({ m, results: FILTER_DEFS.map(f => f.check(m)) }))
  , [data]);

  const filterPassCounts = useMemo(() =>
    FILTER_DEFS.map((_, fi) => filterResults.filter(r => r.results[fi]).length)
  , [filterResults]);

  const filtered = data.filter(m => m.smiles.toLowerCase().includes(search.toLowerCase()));

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = (a[sortProp] as number) ?? 0;
      const bv = (b[sortProp] as number) ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return arr;
  }, [filtered, sortProp, sortDir]);

  const exportCSV = () => {
    const cols = ['smiles','MolecularWeight','LogP','TPSA','HBD','HBA','RotatableBonds','QED','FractionCSP3','MolMR','HeavyAtoms','LipinskiViolations'];
    const csv  = [cols.join(','), ...data.map(m => cols.map(c => m[c] ?? '').join(','))].join('\n');
    const a    = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'library_descriptors.csv',
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const TABS: { id: ChartTab; icon: string; label: string }[] = [
    { id: 'bubble',      icon: 'bi-diagram-3',   label: 'Chemical Space' },
    { id: 'radar',       icon: 'bi-pentagon',     label: 'Drug Profiles'  },
    { id: 'histogram',   icon: 'bi-bar-chart',    label: 'Distributions'  },
    { id: 'correlation', icon: 'bi-grid-3x3-gap', label: 'Correlations'   },
    { id: 'filters',     icon: 'bi-funnel',       label: 'Filter Rules'   },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── KPI summary strip (8 metrics) ─────────────────────────────────── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Library Size',    value: `${summary.n}`,                            icon: 'bi-collection',   color: '#64748b' },
            { label: 'Median MW',       value: `${summary.medMW} Da`,                     icon: 'bi-atom',         color: '#0ea5e9' },
            { label: 'Mean LogP ± SD',  value: `${summary.avgLogP} ± ${summary.sdLogP}`,  icon: 'bi-droplet-half', color: '#8b5cf6' },
            { label: 'Mean TPSA',       value: `${summary.avgTPSA} Å²`,                   icon: 'bi-circle-half',  color: '#f59e0b' },
            { label: 'Mean QED ± SD',   value: `${summary.avgQED} ± ${summary.sdQED}`,    icon: 'bi-star-half',    color: '#10b981' },
            { label: 'Ro5 Compliant',   value: `${summary.pctRo5}%`,                      icon: 'bi-check-circle', color: '#059669' },
            { label: 'Veber Compliant', value: `${summary.pctVeber}%`,                    icon: 'bi-shield-check', color: '#0d9488' },
            { label: 'Mean Fsp3',       value: summary.avgFsp3,                           icon: 'bi-layers',       color: '#6366f1' },
          ].map((kpi, i) => (
            <div key={i} style={{ backgroundColor: '#fff', borderRadius: radius.md, border: `1px solid ${colors.borderLight}`, padding: '14px', boxShadow: shadow.sm }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px' }}>
                <i className={`bi ${kpi.icon}`} style={{ color: kpi.color, fontSize: '13px' }} />
                <span style={{ fontSize: '9px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: colors.text, lineHeight: 1.2 }}>{kpi.value}</div>
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
              flex: 1, padding: '13px 4px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid #0ea5e9' : '2px solid transparent',
              color: activeTab === tab.id ? '#0ea5e9' : colors.textMuted,
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              transition: 'color 0.15s',
            }}>
              <i className={`bi ${tab.icon}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab controls bar */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: '#fafbfd', minHeight: '62px', display: 'flex', alignItems: 'center' }}>

          {activeTab === 'bubble' && (
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', width: '100%' }}>
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
              {spaceMode === 'bubble' && (
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', marginBottom: '5px', display: 'block', letterSpacing: '0.06em' }}>Bubble Size</label>
                  <select value={sizeProp} onChange={e => setSizeProp(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`, fontSize: '12px' }}>
                    {AXIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', paddingBottom: '2px' }}>
                {([['#10b981','#059669','0 violations'],['#f59e0b','#d97706','1 violation'],['#ef4444','#dc2626','2+ violations']] as const).map(([bg, bd, lbl]) => (
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
              <b style={{ color: colors.text }}>Drug-likeness Radar —</b> Normalized property profiles vs. Ro5/Veber reference limits (max 10 compounds).
              Dashed ring: MW≤500, LogP≤5, TPSA≤140, HBD≤5, HBA≤10, RotB≤10, QED≥0.6.
            </p>
          )}

          {activeTab === 'histogram' && (
            <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
              <div style={{ minWidth: '200px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', marginBottom: '5px', display: 'block', letterSpacing: '0.06em' }}>Property</label>
                <select value={histProp} onChange={e => setHistProp(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`, fontSize: '12px', minWidth: '200px' }}>
                  {AXIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {histStats && (
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  {([
                    ['Mean', histStats.mean], ['Median', histStats.median], ['SD', histStats.std],
                    ['Q1', histStats.q1], ['Q3', histStats.q3], ['IQR', histStats.iqr],
                    ['Min', histStats.min], ['Max', histStats.max], ['Skewness', histStats.skewness],
                  ] as const).map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lbl}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: colors.text }}>{val}</div>
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
              White = no correlation. Hover cells for exact r values.
            </p>
          )}

          {activeTab === 'filters' && (
            <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted, lineHeight: 1.5 }}>
              <b style={{ color: colors.text }}>Drug-likeness Filter Compliance —</b> Pass/fail matrix across five established oral bioavailability filter sets.
              Hover column headers for literature references.
            </p>
          )}
        </div>

        {/* Chart / table viewport */}
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
          {!loading && !error && activeTab !== 'correlation' && activeTab !== 'filters' && (
            <div style={{ height: '390px', position: 'relative' }}>
              <canvas ref={chartRef} />
            </div>
          )}

          {/* Pearson correlation heatmap */}
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
                        <td key={j} title={`${CORR_LABELS[i]} vs ${CORR_LABELS[j]}: r = ${r.toFixed(3)}`} style={{
                          padding: '10px 8px', minWidth: '52px', backgroundColor: corrColor(r),
                          textAlign: 'center', borderRadius: '6px', cursor: 'default',
                          fontWeight: i === j ? 800 : 600,
                          color: Math.abs(r) > 0.55 ? '#fff' : colors.text,
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

          {/* Drug-likeness filter compliance table */}
          {!loading && !error && activeTab === 'filters' && data.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${colors.borderLight}` }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left',  fontWeight: 700, color: colors.text, whiteSpace: 'nowrap' }}>Cpd</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: colors.text }}>MW</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: colors.text }}>LogP</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: colors.text }}>TPSA</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: colors.text }}>HBD</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: colors.text }}>HBA</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: colors.text }}>RotB</th>
                    {FILTER_DEFS.map(f => (
                      <th key={f.key} title={f.ref} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: colors.text, whiteSpace: 'nowrap', cursor: 'help' }}>
                        {f.label}
                      </th>
                    ))}
                  </tr>
                  {/* Pass-rate summary row */}
                  <tr style={{ borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: '#f8fafc' }}>
                    <td style={{ padding: '6px 12px', fontWeight: 700, color: colors.textMuted, fontSize: '11px' }}>Pass rate</td>
                    <td colSpan={6} />
                    {filterPassCounts.map((count, fi) => {
                      const pct = count / data.length;
                      const col = pct >= 0.7 ? '#059669' : pct >= 0.4 ? '#d97706' : '#dc2626';
                      return (
                        <td key={fi} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, fontSize: '12px', color: col }}>
                          {count}/{data.length}
                        </td>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filterResults.map(({ m, results }, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: i % 2 === 0 ? '#fff' : '#fafbfd' }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: colors.text, fontSize: '11px' }}>#{i + 1}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: colors.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>{(m.MolecularWeight ?? 0).toFixed(1)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: colors.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>{(m.LogP ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: colors.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>{(m.TPSA ?? 0).toFixed(1)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: colors.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>{m.HBD ?? 0}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: colors.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>{m.HBA ?? 0}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: colors.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>{m.RotatableBonds ?? 0}</td>
                      {results.map((pass, fi) => (
                        <td key={fi} style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 22, height: 22, borderRadius: '50%', fontSize: '11px', fontWeight: 700,
                            backgroundColor: pass ? '#dcfce7' : '#fee2e2',
                            color: pass ? '#15803d' : '#dc2626',
                          }}>
                            {pass ? '✓' : '✗'}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Sort controls */}
            <select value={sortProp} onChange={e => setSortProp(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`, fontSize: '12px' }}>
              {AXIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} title={sortDir === 'desc' ? 'Descending' : 'Ascending'} style={{
              padding: '7px 10px', borderRadius: '8px', border: `1px solid ${colors.border}`,
              background: '#fff', cursor: 'pointer', fontSize: '13px', color: colors.textMuted,
            }}>
              <i className={`bi bi-sort-${sortDir === 'desc' ? 'down' : 'up'}`} />
            </button>
            {/* CSV export */}
            {data.length > 0 && (
              <button onClick={exportCSV} style={{
                padding: '7px 14px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                color: colors.textMuted, display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <i className="bi bi-download" /> CSV
              </button>
            )}
            {/* SMILES filter */}
            <div style={{ position: 'relative', width: '220px' }}>
              <i className="bi bi-search" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: colors.textLight, fontSize: '13px' }} />
              <input
                type="text" placeholder="Filter by SMILES…"
                value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '10px', border: `1px solid ${colors.border}`, outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {data.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '60px', border: `2px dashed ${colors.border}`, borderRadius: radius.md, color: colors.textLight }}>
            <i className="bi bi-inbox" style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }} />
            Paste SMILES in the Hub to start exploring!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '18px' }}>
            {sortedFiltered.map((mol, i) => {
              const viol  = mol.LipinskiViolations ?? 0;
              const vc    = viol === 0 ? colors.success   : viol === 1 ? colors.warning   : colors.danger;
              const vbg   = viol === 0 ? colors.successBg : viol === 1 ? colors.warningBg : colors.dangerBg;
              const veber = checkVeber(mol);
              return (
                <div key={mol.smiles} style={{ backgroundColor: '#fff', borderRadius: radius.md, border: `1px solid ${colors.borderLight}`, boxShadow: shadow.sm, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '16px', backgroundColor: '#fcfcfc', borderBottom: `1px solid ${colors.borderLight}`, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '140px' }}>
                    <SmilesCard smiles={mol.smiles} />
                  </div>
                  <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: colors.text }}>Compound {i + 1}</span>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', backgroundColor: vbg, color: vc }}>
                          {viol === 0 ? 'Ro5 ✓' : `${viol} viol.`}
                        </span>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
                            backgroundColor: veber ? '#f0fdf4' : '#fef2f2', color: veber ? '#15803d' : '#dc2626' }}>
                          Veber {veber ? '✓' : '✗'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '10px', color: colors.blue, marginBottom: '10px', wordBreak: 'break-all', lineHeight: 1.4 }} title={mol.smiles}>
                      {mol.smiles.length > 45 ? `${mol.smiles.slice(0, 45)}…` : mol.smiles}
                    </div>
                    <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '10px', color: colors.textMuted, backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
                      {[
                        ['MW',   mol.MolecularWeight?.toFixed(1)],
                        ['LogP', mol.LogP?.toFixed(2)],
                        ['TPSA', mol.TPSA?.toFixed(1)],
                        ['QED',  mol.QED?.toFixed(3)],
                        ['Fsp3', mol.FractionCSP3?.toFixed(3)],
                        ['RotB', mol.RotatableBonds],
                      ].map(([lbl, val]) => (
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
      subtitle="Advanced cheminformatics analysis — chemical space, multi-filter compliance, property distributions and descriptor correlations."
      accentColor="#0ea5e9"
      onBack={onBack}
    >
      <LibraryContent initialSmiles={initialSmiles} />
    </PageShell>
  );
}

export default LibraryPage;
