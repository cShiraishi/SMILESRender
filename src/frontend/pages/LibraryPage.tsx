import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import PageShell from '../components/PageShell';
import SmilesCard from '../components/SmilesCard';
import MolImage from '../components/MolImage';
import { colors, radius, shadow } from '../styles/themes';
import { parseCSV, autoDetect } from '../tools/csv';

declare global {
  interface Window { Chart: any; }
}

interface MolData {
  smiles: string;
  name?: string;
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

const RADAR_PROPS = [
  { key: 'MolecularWeight', label: 'MW',   min: 0,  max: 600, ref: 500 },
  { key: 'LogP',            label: 'LogP', min: -3, max: 7,   ref: 5   },
  { key: 'TPSA',            label: 'TPSA', min: 0,  max: 180, ref: 140 },
  { key: 'HBD',             label: 'HBD',  min: 0,  max: 8,   ref: 5   },
  { key: 'HBA',             label: 'HBA',  min: 0,  max: 14,  ref: 10  },
  { key: 'RotatableBonds',  label: 'RotB', min: 0,  max: 14,  ref: 10  },
  { key: 'QED',             label: 'QED',  min: 0,  max: 1,   ref: 0.6 },
];
const normRadar = (v: number, p: typeof RADAR_PROPS[0]) =>
  Math.min(1, Math.max(0, (v - p.min) / (p.max - p.min)));

const MOL_COLORS = [
  '#0ea5e9','#8b5cf6','#f59e0b','#10b981','#ef4444',
  '#3b82f6','#ec4899','#14b8a6','#f97316','#6366f1',
];

type ChartTab = 'bubble' | 'radar' | 'histogram' | 'correlation' | 'filters' | 'molecules' | 'pca';

// ─── PCA (client-side, power iteration) ──────────────────────────────────────
const PCA_PROPS  = ['MolecularWeight','LogP','TPSA','HBD','HBA','RotatableBonds','QED','Rings','HeavyAtoms','FractionCSP3','MolMR','AromaticRings'];
const PCA_SHORTS = ['MW','LogP','TPSA','HBD','HBA','RotB','QED','Rings','HA','Fsp3','MR','ArR'];

function _dot(a: number[], b: number[]) { return a.reduce((s, v, i) => s + v * b[i], 0); }
function _mv(M: number[][], v: number[]) { return M.map(row => _dot(row, v)); }

function powerIter(M: number[][]): number[] {
  // Deterministic init; converges to dominant eigenvector
  let v = M.map((_, i) => Math.cos(i + 1.0));
  for (let k = 0; k < 600; k++) {
    v = _mv(M, v);
    const n = Math.sqrt(_dot(v, v)) || 1;
    v = v.map(x => x / n);
  }
  return v;
}

function runPCA(mols: MolData[]): { data: MolData[]; variance: [number, number]; loadings: [number[], number[]]; propNames: string[] } | null {
  if (mols.length < 3) return null;
  const n = mols.length;

  // Pass 1: only include props where EVERY molecule has a finite value
  const rawProps = PCA_PROPS.filter(p => mols.every(m => isFinite(m[p] as number)));
  if (rawProps.length < 2) return null;

  const rawAll = mols.map(m => rawProps.map(pr => m[pr] as number));

  // Compute means and stds, then DROP constant features (std ≈ 0) — they corrupt the
  // covariance matrix trace and inflate variance percentages
  const meansAll = rawProps.map((_, j) => rawAll.reduce((s, r) => s + r[j], 0) / n);
  const stdsAll  = rawProps.map((_, j) => {
    const mu = meansAll[j];
    return Math.sqrt(rawAll.reduce((s, r) => s + (r[j] - mu) ** 2, 0) / Math.max(n - 1, 1));
  });
  const keepIdx = stdsAll.reduce<number[]>((acc, s, j) => (s > 1e-10 ? [...acc, j] : acc), []);
  if (keepIdx.length < 2) return null;

  const props = keepIdx.map(j => rawProps[j]);
  const p     = props.length;
  const raw   = rawAll.map(row => keepIdx.map(j => row[j]));
  const means = keepIdx.map(j => meansAll[j]);
  const stds  = keepIdx.map(j => stdsAll[j]);  // all > 1e-10

  // Standardise (zero-mean, unit-variance)
  const X = raw.map(row => row.map((v, j) => (v - means[j]) / stds[j]));

  // Covariance matrix (p × p) — diagonal entries are exactly 1.0 now
  const C: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) =>
      X.reduce((s, row) => s + row[i] * row[j], 0) / Math.max(n - 1, 1)
    )
  );
  const trace = C.reduce((s, row, i) => s + row[i], 0) || 1;  // = p for correlation matrix

  // PC1 via power iteration
  const pc1  = powerIter(C);
  const lam1 = _dot(pc1, _mv(C, pc1));

  // Deflate and get PC2
  const C2   = C.map((row, i) => row.map((v, j) => v - lam1 * pc1[i] * pc1[j]));
  const pc2  = powerIter(C2);
  const lam2 = _dot(pc2, _mv(C, pc2));

  return {
    data: mols.map((m, i) => ({ ...m, PC1: _dot(X[i], pc1), PC2: _dot(X[i], pc2) })),
    variance: [
      Math.max(0, Math.min(100, lam1 / trace * 100)),
      Math.max(0, Math.min(100, lam2 / trace * 100)),
    ],
    loadings:  [pc1, pc2],
    propNames: props,
  };
}

// ─── PCA Loadings Chart (horizontal bars, sorted by importance) ───────────────
function LoadingsChart({ loadings, propNames, variance }: {
  loadings: [number[], number[]]; propNames: string[]; variance: [number, number];
}) {
  const W = 210;
  const ML = 40, MR = 8, ROW = 22, TITL = 20, GAP = 14;
  const barArea = W - ML - MR; // pixels available for bars
  const TOP_N  = Math.min(propNames.length, 8);
  const shorts = propNames.map(p => PCA_SHORTS[PCA_PROPS.indexOf(p)] ?? p.slice(0, 5));

  // Global max for consistent scaling across PC1 and PC2
  const maxAbs = Math.max(...loadings[0].map(Math.abs), ...loadings[1].map(Math.abs), 0.01);

  const sortedIdx = (pc: 0 | 1) =>
    [...Array(propNames.length).keys()]
      .sort((a, b) => Math.abs(loadings[pc][b]) - Math.abs(loadings[pc][a]))
      .slice(0, TOP_N);

  const sectionH = TITL + TOP_N * ROW;
  const H = sectionH * 2 + GAP + 8;

  const renderSection = (pc: 0 | 1, offy: number) => {
    const idxs  = sortedIdx(pc);
    const fill  = (val: number) => val >= 0 ? (pc === 0 ? '#0ea5e9' : '#8b5cf6') : '#f87171';
    const mid   = ML + barArea / 2;

    return (
      <g key={pc}>
        {/* Section title */}
        <text x={0} y={offy + 13} fontSize={11} fontWeight="700" fill="#111827">PC{pc + 1}</text>
        <text x={28} y={offy + 13} fontSize={10} fill="#6b7280"> — {variance[pc].toFixed(1)}% var.</text>

        {/* Centre (zero) line */}
        <line x1={mid} y1={offy + TITL} x2={mid} y2={offy + TITL + TOP_N * ROW}
          stroke="#d1d5db" strokeWidth={1} strokeDasharray="3 2" />

        {idxs.map((origIdx, row) => {
          const val = loadings[pc][origIdx];
          const bw  = Math.abs(val) / maxAbs * barArea / 2;
          const bx  = val >= 0 ? mid : mid - bw;
          const by  = offy + TITL + row * ROW + 3;
          const bh  = ROW - 8;

          return (
            <g key={origIdx}>
              {/* Zebra row */}
              <rect x={0} y={offy + TITL + row * ROW} width={W} height={ROW}
                fill={row % 2 === 0 ? '#f9fafb' : 'white'} />
              {/* Descriptor label */}
              <text x={ML - 4} y={by + bh / 2} textAnchor="end" dominantBaseline="middle"
                fontSize={9} fontWeight="600" fill="#374151">
                {shorts[origIdx]}
              </text>
              {/* Bar */}
              <rect x={bx} y={by} width={Math.max(2, bw)} height={bh}
                fill={fill(val)} opacity={0.85} rx={2} />
              {/* Value label next to bar */}
              <text
                x={val >= 0 ? Math.min(bx + bw + 2, W - MR) : Math.max(bx - 2, 0)}
                y={by + bh / 2}
                textAnchor={val >= 0 ? 'start' : 'end'}
                dominantBaseline="middle"
                fontSize={7} fill="#9ca3af">
                {val.toFixed(2)}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}>
      {renderSection(0, 0)}
      {renderSection(1, sectionH + GAP)}
    </svg>
  );
}

// ─── SVG Chemical Space chart ─────────────────────────────────────────────────
function niceTicks(min: number, max: number, n = 5) {
  const range = max - min || 1;
  const rough = range / n;
  const pow   = Math.pow(10, Math.floor(Math.log10(rough)));
  const step  = [1, 2, 2.5, 5, 10].map(f => f * pow).find(s => range / s <= n + 1) ?? pow * 10;
  let lo      = Math.floor(min / step) * step;
  let hi      = Math.ceil(max / step) * step;
  if (lo >= hi) { lo -= step; hi += step; }  // guard: ensures non-zero range → no div/0 in sx/sy
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 0.001; v = Math.round((v + step) * 1e9) / 1e9) ticks.push(v);
  return { ticks, min: lo, max: hi };
}

function ChemicalSpaceChart({ data, xProp, yProp, sizeProp, mode, xLabel, yLabel,
  selectedIdx, highlightIdx, onSelect, showLabels, onHover,
}: {
  data: MolData[];
  xProp: string; yProp: string; sizeProp: string;
  mode: 'scatter' | 'bubble';
  xLabel: string; yLabel: string;
  selectedIdx: number | null;
  highlightIdx: number | null;
  onSelect: (idx: number) => void;
  showLabels: boolean;
  onHover: (mol: MolData | null, idx: number, x: number, y: number) => void;
}) {
  const W = 680, H = 360;
  const mg = { top: 24, right: 24, bottom: 48, left: 58 };
  const pw = W - mg.left - mg.right;
  const ph = H - mg.top - mg.bottom;

  const xs0 = data.map(d => d[xProp] as number).filter(isFinite);
  const ys0 = data.map(d => d[yProp] as number).filter(isFinite);
  const xR0 = niceTicks(Math.min(...xs0), Math.max(...xs0));
  const yR0 = niceTicks(Math.min(...ys0), Math.max(...ys0));

  const [view, setView] = useState({ xMin: xR0.min, xMax: xR0.max, yMin: yR0.min, yMax: yR0.max });
  const [dragging, setDragging] = useState(false);
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startView: typeof view } | null>(null);

  // Reset when axes/data change
  useEffect(() => {
    const xs = data.map(d => d[xProp] as number).filter(isFinite);
    const ys = data.map(d => d[yProp] as number).filter(isFinite);
    const xR = niceTicks(Math.min(...xs), Math.max(...xs));
    const yR = niceTicks(Math.min(...ys), Math.max(...ys));
    setView({ xMin: xR.min, xMax: xR.max, yMin: yR.min, yMax: yR.max });
  }, [xProp, yProp, sizeProp, data]);

  // Non-passive wheel listener for zoom
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const svgX = (e.clientX - rect.left) / rect.width  * W;
      const svgY = (e.clientY - rect.top)  / rect.height * H;
      if (svgX < mg.left || svgX > mg.left + pw || svgY < mg.top || svgY > mg.top + ph) return;
      const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      setView(v => {
        const cx = v.xMin + (svgX - mg.left) / pw * (v.xMax - v.xMin);
        const cy = v.yMin + (1 - (svgY - mg.top) / ph) * (v.yMax - v.yMin);
        return {
          xMin: cx - (cx - v.xMin) * factor,
          xMax: cx + (v.xMax - cx) * factor,
          yMin: cy - (cy - v.yMin) * factor,
          yMax: cy + (v.yMax - cy) * factor,
        };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Global mousemove/mouseup for pan
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { startX, startY, startView } = dragRef.current;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dxData = (e.clientX - startX) / rect.width  * W / pw * (startView.xMax - startView.xMin);
      const dyData = (e.clientY - startY) / rect.height * H / ph * (startView.yMax - startView.yMin);
      setView({
        xMin: startView.xMin - dxData,
        xMax: startView.xMax - dxData,
        yMin: startView.yMin + dyData,
        yMax: startView.yMax + dyData,
      });
    };
    const onUp = () => { dragRef.current = null; setDragging(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) / rect.width  * W;
    const svgY = (e.clientY - rect.top)  / rect.height * H;
    if (svgX < mg.left || svgX > mg.left + pw || svgY < mg.top || svgY > mg.top + ph) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startView: view };
    setDragging(true);
    onHover(null, -1, 0, 0);
    e.preventDefault();
  };

  const resetZoom = () => setView({ xMin: xR0.min, xMax: xR0.max, yMin: yR0.min, yMax: yR0.max });
  const isZoomed = Math.abs(view.xMin - xR0.min) > 1e-9 || Math.abs(view.xMax - xR0.max) > 1e-9
                || Math.abs(view.yMin - yR0.min) > 1e-9 || Math.abs(view.yMax - yR0.max) > 1e-9;

  const [showExportMenu, setShowExportMenu] = useState(false);

  const exportChart = (format: 'png' | 'jpeg') => {
    const svg = svgRef.current;
    if (!svg) return;
    setShowExportMenu(false);

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(W));
    clone.setAttribute('height', String(H));
    clone.removeAttribute('overflow');

    // White background rect
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(W)); bg.setAttribute('height', String(H));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    // Inline font so text renders consistently
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = '* { font-family: system-ui, -apple-system, Arial, sans-serif; }';
    clone.insertBefore(style, clone.firstChild);

    const svgStr = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const SCALE = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SCALE, SCALE);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mime, 0.95);
      const a = document.createElement('a');
      a.download = `chemical_space_${Date.now()}.${format}`;
      a.href = dataUrl;
      a.click();
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const sx = (v: number) => mg.left + (v - view.xMin) / (view.xMax - view.xMin) * pw;
  const sy = (v: number) => mg.top  + ph - (v - view.yMin) / (view.yMax - view.yMin) * ph;

  const xTicks = niceTicks(view.xMin, view.xMax);
  const yTicks = niceTicks(view.yMin, view.yMax);

  const ss = (() => {
    if (mode !== 'bubble') return () => 7;
    const sv = data.map(d => d[sizeProp] as number).filter(isFinite);
    const mn = Math.min(...sv), rng = (Math.max(...sv) - mn) || 1;
    return (d: MolData) => 5 + ((d[sizeProp] as number - mn) / rng) * 18;
  })();

  const dotFill   = (mol: MolData) => (mol.LipinskiViolations ?? 0) === 0 ? '#10b981' : (mol.LipinskiViolations ?? 0) === 1 ? '#f59e0b' : '#ef4444';
  const dotStroke = (mol: MolData) => (mol.LipinskiViolations ?? 0) === 0 ? '#059669' : (mol.LipinskiViolations ?? 0) === 1 ? '#d97706' : '#dc2626';

  const fmtTick = (v: number) => Math.abs(v) >= 100 ? Math.round(v).toString() : (v % 1 === 0 ? v.toString() : v.toFixed(1));

  // ── Force-directed label placement ────────────────────────────────────────────
  const LBL_H = 13;
  const CHAR_W = 5.7;
  const PAD = 4;

  const labelPositions = useMemo(() => {
    if (!showLabels || data.length === 0) return [] as { x: number; y: number }[];

    const _sx = (v: number) => mg.left + (v - view.xMin) / (view.xMax - view.xMin) * pw;
    const _sy = (v: number) => mg.top  + ph - (v - view.yMin) / (view.yMax - view.yMin) * ph;
    const _ss = mode === 'bubble'
      ? (() => {
          const sv = data.map(d => d[sizeProp] as number).filter(isFinite);
          const mn = Math.min(...sv), rng = (Math.max(...sv) - mn) || 1;
          return (d: MolData) => 5 + ((d[sizeProp] as number - mn) / rng) * 18;
        })()
      : () => 7;

    const dots = data.map((mol, i) => {
      const lbl = mol.name || `${i + 1}`;
      const txt = lbl.length > 22 ? lbl.slice(0, 21) + '…' : lbl;
      return {
        cx: _sx(mol[xProp] as number),
        cy: _sy(mol[yProp] as number),
        r:  _ss(mol),
        w:  txt.length * CHAR_W + PAD * 2,
        h:  LBL_H,
      };
    });

    // Initial placement: each label centred above its dot
    const pos = dots.map(d => ({ x: d.cx, y: d.cy - d.r - 18 }));

    const ITERS = 100;
    const REPEL = 0.65;
    const SPRING = 0.04;

    for (let iter = 0; iter < ITERS; iter++) {
      for (let i = 0; i < pos.length; i++) {
        let fx = 0, fy = 0;

        // Repulsion between label bounding boxes
        for (let j = 0; j < pos.length; j++) {
          if (i === j) continue;
          const dx = pos[i].x - pos[j].x;
          const dy = pos[i].y - pos[j].y;
          const minX = (dots[i].w + dots[j].w) / 2 + 3;
          const minY = (dots[i].h + dots[j].h) / 2 + 3;
          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            const ox = minX - Math.abs(dx);
            const oy = minY - Math.abs(dy);
            // Push along axis of least penetration
            if (ox < oy) {
              fx += Math.sign(dx || 1) * ox * REPEL;
            } else {
              fy += Math.sign(dy || 1) * oy * REPEL;
            }
          }
        }

        // Repulsion from dot circles (labels must not cover dots)
        for (let j = 0; j < dots.length; j++) {
          const dx = pos[i].x - dots[j].cx;
          const dy = pos[i].y - dots[j].cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const clearance = dots[j].r + Math.max(dots[i].w, dots[i].h) / 2 + 5;
          if (dist < clearance) {
            const push = (clearance - dist) * 0.4;
            fx += (dx / dist) * push;
            fy += (dy / dist) * push;
          }
        }

        // Spring pull toward anchor (above the dot)
        const ax = dots[i].cx;
        const ay = dots[i].cy - dots[i].r - 18;
        fx += (ax - pos[i].x) * SPRING;
        fy += (ay - pos[i].y) * SPRING;

        pos[i] = { x: pos[i].x + fx, y: pos[i].y + fy };

        // Clamp inside plot area
        const hw = dots[i].w / 2;
        pos[i].x = Math.max(mg.left + hw + 1, Math.min(mg.left + pw - hw - 1, pos[i].x));
        pos[i].y = Math.max(mg.top + dots[i].h / 2 + 1, Math.min(mg.top + ph - 4, pos[i].y));
      }
    }

    return pos;
  }, [data, xProp, yProp, sizeProp, mode, showLabels, view]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', cursor: dragging ? 'move' : 'default' }}
        overflow="visible"
        onMouseDown={handleMouseDown}
      >
        <defs>
          <clipPath id="plot-area">
            <rect x={mg.left} y={mg.top} width={pw} height={ph} />
          </clipPath>
        </defs>

        {/* Grid */}
        {xTicks.ticks.map(v => <line key={v} x1={sx(v)} y1={mg.top} x2={sx(v)} y2={mg.top + ph} stroke="#f1f5f9" strokeWidth={1} />)}
        {yTicks.ticks.map(v => <line key={v} x1={mg.left} y1={sy(v)} x2={mg.left + pw} y2={sy(v)} stroke="#f1f5f9" strokeWidth={1} />)}

        {/* Axes */}
        <line x1={mg.left} y1={mg.top + ph} x2={mg.left + pw} y2={mg.top + ph} stroke="#cbd5e1" strokeWidth={1} />
        <line x1={mg.left} y1={mg.top}      x2={mg.left}      y2={mg.top + ph}  stroke="#cbd5e1" strokeWidth={1} />

        {/* X ticks */}
        {xTicks.ticks.map(v => (
          <g key={v}>
            <line x1={sx(v)} y1={mg.top + ph} x2={sx(v)} y2={mg.top + ph + 4} stroke="#94a3b8" strokeWidth={1} />
            <text x={sx(v)} y={mg.top + ph + 14} textAnchor="middle" fontSize={9} fill="#64748b">{fmtTick(v)}</text>
          </g>
        ))}

        {/* Y ticks */}
        {yTicks.ticks.map(v => (
          <g key={v}>
            <line x1={mg.left - 4} y1={sy(v)} x2={mg.left} y2={sy(v)} stroke="#94a3b8" strokeWidth={1} />
            <text x={mg.left - 7} y={sy(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#64748b">{fmtTick(v)}</text>
          </g>
        ))}

        {/* Axis titles */}
        <text x={mg.left + pw / 2} y={H - 4} textAnchor="middle" fontSize={11} fontWeight="700" fill="#475569">{xLabel}</text>
        <text textAnchor="middle" fontSize={11} fontWeight="700" fill="#475569"
          transform={`translate(13, ${mg.top + ph / 2}) rotate(-90)`}>{yLabel}</text>

        {/* Points + labels */}
        <g clipPath="url(#plot-area)">
          {data.map((mol, i) => {
            const cx  = sx(mol[xProp] as number);
            const cy  = sy(mol[yProp] as number);
            const r   = ss(mol);
            const sel = selectedIdx === i;
            const lbl = mol.name || `${i + 1}`;
            const txt = lbl.length > 22 ? lbl.slice(0, 21) + '…' : lbl;
            const lp  = labelPositions[i];

            // Connector: from dot edge toward label centre
            const angle = lp ? Math.atan2(lp.y - cy, lp.x - cx) : -Math.PI / 2;
            const lx0 = cx + Math.cos(angle) * (r + 2);
            const ly0 = cy + Math.sin(angle) * (r + 2);

            return (
              <g key={i} style={{ cursor: dragging ? 'move' : 'pointer' }}
                onMouseEnter={e => { if (!dragRef.current) onHover(mol, i, e.clientX, e.clientY); }}
                onMouseMove={e  => { if (!dragRef.current) onHover(mol, i, e.clientX, e.clientY); }}
                onMouseLeave={_ => onHover(null, -1, 0, 0)}
                onClick={e => { if (!dragRef.current) { e.stopPropagation(); onSelect(i); } }}
              >
                {sel && <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="#0ea5e9" strokeWidth={2.5} />}
                {!sel && highlightIdx === i && <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#93c5fd" strokeWidth={2} strokeDasharray="4 2" />}
                <circle cx={cx} cy={cy} r={r}
                  fill={dotFill(mol)} stroke={sel ? '#0369a1' : dotStroke(mol)}
                  strokeWidth={sel ? 2 : 1.5}
                />
                {showLabels && lp && (
                  <>
                    <line x1={lx0} y1={ly0} x2={lp.x} y2={lp.y + LBL_H / 2}
                      stroke={sel ? '#0ea5e9' : '#94a3b8'} strokeWidth={1} strokeDasharray="3 2" />
                    <text x={lp.x} y={lp.y}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={10} fontWeight={sel ? '700' : '600'}
                      fill={sel ? '#0369a1' : '#1e293b'}
                      stroke="rgba(255,255,255,0.95)" strokeWidth={3} paintOrder="stroke fill"
                    >{txt}</text>
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom + export controls */}
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
        {isZoomed && (
          <button onClick={resetZoom} style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
            border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            <i className="bi bi-arrows-fullscreen" style={{ fontSize: 10 }} />
            Reset zoom
          </button>
        )}

        {/* Export dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowExportMenu(v => !v)}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <i className="bi bi-download" style={{ fontSize: 10 }} />
            Export
            <i className="bi bi-chevron-down" style={{ fontSize: 8 }} />
          </button>
          {showExportMenu && (
            <>
              {/* Click-outside overlay */}
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowExportMenu(false)} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 999,
                backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 120,
              }}>
                {(['png', 'jpeg'] as const).map(fmt => (
                  <button key={fmt} onClick={() => exportChart(fmt)} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '8px 14px', border: 'none', background: 'none',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151',
                    textAlign: 'left',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <i className={`bi bi-filetype-${fmt}`} style={{ fontSize: 13, color: fmt === 'png' ? '#0ea5e9' : '#f59e0b' }} />
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ fontSize: 10, color: '#94a3b8', userSelect: 'none' }}>
          <i className="bi bi-mouse2" style={{ marginRight: 3 }} />
          Scroll · Drag
        </div>
      </div>
    </div>
  );
}

// ─── Molecule table columns for DataWarrior view ──────────────────────────────
const DW_COLS: { key: string; label: string; fmt: (m: MolData) => string; w?: number }[] = [
  { key: 'MolecularWeight', label: 'MW',   fmt: m => (m.MolecularWeight ?? 0).toFixed(1), w: 72  },
  { key: 'LogP',            label: 'LogP', fmt: m => (m.LogP ?? 0).toFixed(2),            w: 60  },
  { key: 'TPSA',            label: 'TPSA', fmt: m => (m.TPSA ?? 0).toFixed(1),            w: 64  },
  { key: 'HBD',             label: 'HBD',  fmt: m => String(m.HBD ?? 0),                  w: 48  },
  { key: 'HBA',             label: 'HBA',  fmt: m => String(m.HBA ?? 0),                  w: 48  },
  { key: 'RotatableBonds',  label: 'RotB', fmt: m => String(m.RotatableBonds ?? 0),        w: 52  },
  { key: 'QED',             label: 'QED',  fmt: m => (m.QED ?? 0).toFixed(3),             w: 64  },
  { key: 'FractionCSP3',   label: 'Fsp3', fmt: m => (m.FractionCSP3 ?? 0).toFixed(3),    w: 60  },
  { key: 'MolMR',           label: 'MR',   fmt: m => (m.MolMR ?? 0).toFixed(1),           w: 56  },
];

const MOLS_PER_PAGE = 25;

// ─── Main content ─────────────────────────────────────────────────────────────
function LibraryContent({ initialSmiles, onSmilesChange }: { initialSmiles?: string; onSmilesChange?: (s: string) => void }) {
  const [data,      setData]      = useState<MolData[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [activeTab, setActiveTab] = useState<ChartTab>('bubble');
  const [sortProp,  setSortProp]  = useState('QED');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [showSmilesText, setShowSmilesText] = useState(true);
  const [dragOver,  setDragOver]  = useState(false);
  const [molsPage,  setMolsPage]  = useState(0);
  const [hoveredMol,       setHoveredMol]       = useState<{ mol: MolData; idx: number; x: number; y: number } | null>(null);
  const [selectedMolIdx,   setSelectedMolIdx]   = useState<number | null>(null);
  const [showDotLabels,    setShowDotLabels]    = useState(true);
  const [showThumbnails,   setShowThumbnails]   = useState(true);
  const [thumbnailHoverIdx, setThumbnailHoverIdx] = useState<number | null>(null);
  const thumbPanelRef = useRef<HTMLDivElement>(null);

  // Chemical Space controls
  const [spaceMode, setSpaceMode] = useState<'scatter' | 'bubble'>('scatter');
  const [xProp,    setXProp]    = useState('MolecularWeight');
  const [yProp,    setYProp]    = useState('LogP');
  const [sizeProp, setSizeProp] = useState('TPSA');

  // Histogram controls
  const [histProp, setHistProp] = useState('MolecularWeight');

  const chartRef      = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);

  // ── Core loading function ────────────────────────────────────────────────────
  const loadLibrary = useCallback(async (items: { smiles: string; name?: string }[]) => {
    if (items.length === 0) { setError('SMILES list is empty.'); return; }
    setLoading(true); setError(null); setData([]); setMolsPage(0);

    const CHUNK_SIZE = 10;
    const allClean: MolData[] = [];

    try {
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const r = await fetch('/descriptors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ smiles: chunk.map(p => p.smiles) }),
        });
        if (!r.ok) throw new Error('Backend server error.');
        const res = await r.json();
        if (res.error) throw new Error(res.error);

        const clean = res.filter((m: any) => !m.error).map((m: any) => {
          const original = chunk.find(p => p.smiles === m.smiles);
          return { ...m, name: original?.name };
        });

        allClean.push(...clean);
        setData([...allClean]);
      }
      if (allClean.length === 0) throw new Error('No valid structures in library.');
    } catch (err: any) {
      setError(err.message || 'Error calculating properties.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load from initialSmiles prop ─────────────────────────────────────────────
  useEffect(() => {
    if (!initialSmiles) return;
    const items = initialSmiles.split('\n').map(s => {
      const parts = s.trim().split(/\s+/);
      if (!parts[0]) return null;
      return { smiles: parts[0], name: parts.length > 1 ? parts.slice(1).join(' ') : undefined };
    }).filter((x): x is { smiles: string; name?: string } => !!x?.smiles);
    loadLibrary(items);
  }, [initialSmiles, loadLibrary]);

  // ── CSV / TXT file upload ─────────────────────────────────────────────────────
  const parseAndLoad = useCallback((content: string, fileName: string) => {
    let items: { smiles: string; name?: string }[] = [];

    if (fileName.toLowerCase().endsWith('.csv')) {
      const rows = parseCSV(content);
      if (rows.length < 2) { setError('CSV has no data rows.'); return; }
      const headers = rows[0].map(h => h.toLowerCase().trim());
      const smilesCol = autoDetect(headers, /smiles|smi|canonical|structure/i) || headers[0];
      const nameCol   = autoDetect(headers, /name|nome|id|label|drug|molecule/i);
      const si = headers.indexOf(smilesCol);
      const ni = nameCol ? headers.indexOf(nameCol) : -1;
      if (si === -1) { setError('SMILES column not found in CSV.'); return; }
      items = rows.slice(1)
        .map(r => ({ smiles: (r[si] || '').trim(), name: ni !== -1 && r[ni] ? r[ni].trim() : undefined }))
        .filter(m => m.smiles.length > 0);
    } else {
      items = content.split('\n').map(s => {
        const parts = s.trim().split(/\s+/);
        return { smiles: parts[0], name: parts.length > 1 ? parts.slice(1).join(' ') : undefined };
      }).filter(m => m.smiles.length > 0);
    }

    const smilesStr = items.map(i => i.name ? `${i.smiles} ${i.name}` : i.smiles).join('\n');
    onSmilesChange?.(smilesStr);
    loadLibrary(items);
  }, [loadLibrary, onSmilesChange]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => parseAndLoad(ev.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => parseAndLoad(ev.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const downloadChartAsJpeg = () => {
    const canvas = chartRef.current;
    if (!canvas) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvas, 0, 0);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 1.0);
    const link = document.createElement('a');
    link.download = `smilerender_analytics_${activeTab}_${new Date().getTime()}.jpeg`;
    link.href = dataUrl;
    link.click();
  };

  // ── Build / rebuild Chart.js instance ──────────────────────────────────────
  useEffect(() => {
    let timer: any;

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
      if (activeTab === 'correlation' || activeTab === 'filters' || activeTab === 'molecules' || activeTab === 'pca') {
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
        // Rendered as SVG — no Chart.js needed
        return;
      }

      // ─ Radar ────────────────────────────────────────────────────────────────
      else if (activeTab === 'radar') {
        const mols = data.slice(0, 10);
        const datasets: any[] = mols.map((m, i) => ({
          label: m.name ? m.name : `#${i + 1}`,
          data: RADAR_PROPS.map(p => {
            const v = Number(m[p.key]);
            return isNaN(v) ? normRadar(0, p) : normRadar(v, p);
          }),
          borderColor: MOL_COLORS[i % MOL_COLORS.length],
          backgroundColor: MOL_COLORS[i % MOL_COLORS.length] + '22',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: MOL_COLORS[i % MOL_COLORS.length],
        }));

        datasets.push({
          label: 'Ro5/Veber limit',
          data: RADAR_PROPS.map(p => normRadar(p.ref, p)),
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
                    const p = RADAR_PROPS[item.dataIndex];
                    if (item.datasetIndex >= mols.length) {
                      return ` Ro5/Veber limit: ${p.ref} (range ${p.min}–${p.max})`;
                    }
                    const mol = mols[item.datasetIndex];
                    const raw = mol?.[p.key] ?? 'N/A';
                    return ` ${item.dataset.label}: ${typeof raw === 'number' ? raw.toFixed(p.max <= 1 ? 3 : 1) : raw}`;
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

  const pcaResult = useMemo(() => data.length >= 3 ? runPCA(data) : null, [data]);

  const filtered = data.filter(m =>
    m.smiles.toLowerCase().includes(search.toLowerCase()) ||
    (m.name && m.name.toLowerCase().includes(search.toLowerCase()))
  );

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
    const cols = ['smiles','name','MolecularWeight','LogP','TPSA','HBD','HBA','RotatableBonds','QED','FractionCSP3','MolMR','HeavyAtoms','LipinskiViolations'];
    const csv  = [cols.join(','), ...data.map(m => cols.map(c => m[c] ?? '').join(','))].join('\n');
    const a    = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'library_descriptors.csv',
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // DataWarrior molecules tab pagination
  const dwTotalPages = Math.ceil(sortedFiltered.length / MOLS_PER_PAGE);
  const dwPage = Math.min(molsPage, Math.max(0, dwTotalPages - 1));
  const dwRows = sortedFiltered.slice(dwPage * MOLS_PER_PAGE, (dwPage + 1) * MOLS_PER_PAGE);

  const TABS: { id: ChartTab; icon: string; label: string }[] = [
    { id: 'molecules',   icon: 'bi-grid-3x3',     label: 'Molecules'      },
    { id: 'bubble',      icon: 'bi-diagram-3',    label: 'Chemical Space' },
    { id: 'radar',       icon: 'bi-pentagon',     label: 'Drug Profiles'  },
    { id: 'histogram',   icon: 'bi-bar-chart',    label: 'Distributions'  },
    { id: 'correlation', icon: 'bi-grid-3x3-gap', label: 'Correlations'   },
    { id: 'filters',     icon: 'bi-funnel',       label: 'Filter Rules'   },
    { id: 'pca',         icon: 'bi-stars',        label: 'PCA'            },
  ];

  const thSort = (key: string) => {
    if (sortProp === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortProp(key); setSortDir('desc'); }
  };

  const thStyle = (key: string): React.CSSProperties => ({
    padding: '8px 10px', fontWeight: 700, fontSize: '10px', color: colors.text,
    textAlign: 'center', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    backgroundColor: sortProp === key ? '#eff6ff' : '#f8fafc',
    borderBottom: `2px solid ${sortProp === key ? '#0ea5e9' : colors.borderLight}`,
    position: 'sticky', top: 0, zIndex: 1,
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,.smi"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* ── Upload drop zone (when no data) ──────────────────────────────── */}
      {data.length === 0 && !loading && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? '#0ea5e9' : colors.border}`,
            borderRadius: radius.lg,
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: dragOver ? '#f0f9ff' : '#fafbfd',
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <i className="bi bi-file-earmark-arrow-up" style={{ fontSize: 40, color: dragOver ? '#0ea5e9' : '#94a3b8', display: 'block', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 6 }}>
            Upload CSV / TXT / SMI
          </div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
            Drag & drop or click to select — detects SMILES column automatically
          </div>
          <button
            style={{
              padding: '9px 22px', borderRadius: radius.md, border: 'none',
              backgroundColor: '#0ea5e9', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
            onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
          >
            <i className="bi bi-folder2-open" style={{ marginRight: 7 }} />
            Browse file
          </button>
          {error && (
            <div style={{ marginTop: 16, fontSize: 13, color: colors.danger, fontWeight: 600 }}>
              <i className="bi bi-exclamation-circle" style={{ marginRight: 5 }} />
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── Loading indicator ────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '48px 24px', backgroundColor: '#fff', borderRadius: radius.lg, border: `1px solid ${colors.borderLight}` }}>
          <div style={{ width: 36, height: 36, border: '3px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontWeight: 600, color: colors.textMuted, fontSize: 14 }}>
            Computing descriptors… {data.length > 0 ? `(${data.length} done)` : ''}
          </span>
          {data.length > 0 && (
            <div style={{ width: '60%', height: 6, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', backgroundColor: '#0ea5e9', width: `${Math.min(100, data.length * 5)}%`, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
      )}

      {/* ── KPI summary strip ─────────────────────────────────────────────── */}
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
      {data.length > 0 && (
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
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: '#fafbfd', minHeight: '62px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>

            {activeTab === 'molecules' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, flexWrap: 'wrap' }}>
                <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted, lineHeight: 1.5 }}>
                  <b style={{ color: colors.text }}>Molecule Browser —</b> Estruturas + descritores, estilo DataWarrior.
                  Clique nas colunas para ordenar. {sortedFiltered.length} compostos.
                </p>
                <label style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: radius.md, border: `1px solid ${colors.border}`,
                  backgroundColor: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: colors.textMuted,
                }}>
                  <i className="bi bi-file-earmark-arrow-up" />
                  Trocar CSV
                  <input type="file" accept=".csv,.txt,.smi" style={{ display: 'none' }} onChange={handleFileUpload} />
                </label>
              </div>
            )}

            {activeTab === 'bubble' && (
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', flex: 1 }}>
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
                  <button
                    onClick={() => setShowDotLabels(v => !v)}
                    title={showDotLabels ? 'Hide labels' : 'Show labels'}
                    style={{
                      marginLeft: 4, padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                      border: `1px solid ${showDotLabels ? '#0ea5e9' : colors.border}`,
                      backgroundColor: showDotLabels ? '#e0f2fe' : '#fff',
                      color: showDotLabels ? '#0369a1' : colors.textMuted,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <i className={`bi bi-tag${showDotLabels ? '-fill' : ''}`} />
                    Labels
                  </button>
                  <button
                    onClick={() => setShowThumbnails(v => !v)}
                    title={showThumbnails ? 'Hide structure panel' : 'Show structure panel'}
                    style={{
                      padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                      border: `1px solid ${showThumbnails ? '#8b5cf6' : colors.border}`,
                      backgroundColor: showThumbnails ? '#ede9fe' : '#fff',
                      color: showThumbnails ? '#6d28d9' : colors.textMuted,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    <i className={`bi bi-layout-sidebar${showThumbnails ? '-reverse' : ''}`} />
                    Structures
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'radar' && (
              <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted, lineHeight: 1.5 }}>
                <b style={{ color: colors.text }}>Drug-likeness Radar —</b> Normalized property profiles vs. Ro5/Veber reference limits (max 10 compounds).
                Dashed ring = Ro5/Veber limits. Each axis normalized to its drug-like range (LogP: −3→7, MW: 0→600, TPSA: 0→180, etc.) — hover for raw values.
              </p>
            )}

            {activeTab === 'histogram' && (
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
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

            {activeTab === 'pca' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '12px', color: colors.textMuted, lineHeight: 1.6 }}>
                    <b style={{ color: colors.text }}>PCA — Principal Component Analysis</b> — projeção do espaço de descritores em 2D.
                    Cada ponto é uma molécula; distância reflete similaridade química.
                  </p>
                  {pcaResult && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                      {[
                        { label: 'PC1', val: `${pcaResult.variance[0].toFixed(1)}%` },
                        { label: 'PC2', val: `${pcaResult.variance[1].toFixed(1)}%` },
                        { label: 'Total', val: `${(pcaResult.variance[0] + pcaResult.variance[1]).toFixed(1)}%`, bold: true },
                      ].map(kv => (
                        <div key={kv.label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kv.label}</div>
                          <div style={{ fontSize: 15, fontWeight: kv.bold ? 800 : 700, color: kv.bold ? '#0ea5e9' : colors.text }}>{kv.val}</div>
                        </div>
                      ))}
                      <div style={{ fontSize: 10, color: colors.textLight, alignSelf: 'center', maxWidth: 320 }}>
                        Descritores: {pcaResult.propNames.map(p => PCA_SHORTS[PCA_PROPS.indexOf(p)] ?? p).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Chart / table viewport */}
          <div style={{ padding: activeTab === 'molecules' ? '0' : '24px', position: 'relative', minHeight: '420px' }}>

            {error && !loading && activeTab !== 'molecules' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '360px', gap: '10px', color: colors.danger }}>
                <i className="bi bi-exclamation-octagon" style={{ fontSize: '36px' }} />
                <div style={{ fontWeight: 600, textAlign: 'center', maxWidth: '400px', fontSize: '14px' }}>{error}</div>
              </div>
            )}

            {/* SVG Chemical Space chart + thumbnail sidebar */}
            {!error && activeTab === 'bubble' && data.length > 0 && (
              <div style={{ height: '420px', display: 'flex', gap: 0 }}>

                {/* Thumbnail grid panel — 4 columns */}
                {showThumbnails && (
                  <div ref={thumbPanelRef} style={{
                    width: 428, flexShrink: 0,
                    overflowY: 'auto', overflowX: 'hidden',
                    borderRight: `1px solid ${colors.borderLight}`,
                    padding: '8px',
                    backgroundColor: '#fafbfd',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 6,
                    alignContent: 'start',
                  }}>
                    {data.map((mol, i) => {
                      const isHov = hoveredMol?.idx === i || thumbnailHoverIdx === i;
                      const isSel = selectedMolIdx === i;
                      return (
                        <div
                          key={i}
                          id={`thumb-${i}`}
                          onMouseEnter={() => setThumbnailHoverIdx(i)}
                          onMouseLeave={() => setThumbnailHoverIdx(null)}
                          onClick={() => {
                            setSelectedMolIdx(i);
                            setHoveredMol(null);
                            setTimeout(() => document.getElementById(`mol-card-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
                          }}
                          style={{
                            borderRadius: 8, padding: '4px 3px 3px', cursor: 'pointer',
                            border: `2px solid ${isSel ? '#0ea5e9' : isHov ? '#93c5fd' : '#e2e8f0'}`,
                            backgroundColor: isSel ? '#f0f9ff' : isHov ? '#f8fafc' : '#fff',
                            transition: 'border-color 0.12s, background-color 0.12s',
                            boxShadow: isSel ? '0 0 0 3px #0ea5e922' : isHov ? '0 1px 4px rgba(0,0,0,0.07)' : 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                          }}
                        >
                          <MolImage smiles={mol.smiles} width={90} height={68} />
                          <div style={{
                            fontSize: 9, fontWeight: isSel ? 700 : 500,
                            color: isSel ? '#0369a1' : '#475569',
                            textAlign: 'center', marginTop: 3,
                            width: '100%', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            lineHeight: 1.3,
                          }}>
                            {mol.name || `#${i + 1}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Chart */}
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <ChemicalSpaceChart
                    data={data}
                    xProp={xProp}
                    yProp={yProp}
                    sizeProp={sizeProp}
                    mode={spaceMode}
                    xLabel={AXIS_OPTIONS.find(o => o.value === xProp)?.label || xProp}
                    yLabel={AXIS_OPTIONS.find(o => o.value === yProp)?.label || yProp}
                    selectedIdx={selectedMolIdx}
                    highlightIdx={thumbnailHoverIdx}
                    onSelect={idx => {
                      setSelectedMolIdx(idx);
                      setHoveredMol(null);
                      // Scroll thumbnail panel to show selected
                      setTimeout(() => {
                        document.getElementById(`thumb-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        document.getElementById(`mol-card-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 80);
                    }}
                    showLabels={showDotLabels}
                    onHover={(mol, idx, x, y) => {
                      if (mol) {
                        setHoveredMol({ mol, idx, x, y });
                        // Scroll thumbnail into view when hovering dot
                        document.getElementById(`thumb-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      } else {
                        setHoveredMol(null);
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Canvas-based charts (radar, histogram) */}
            {!error && activeTab !== 'bubble' && activeTab !== 'correlation' && activeTab !== 'filters' && activeTab !== 'molecules' && activeTab !== 'pca' && (
              <div style={{ height: '390px', position: 'relative' }}>
                <canvas ref={chartRef} />
              </div>
            )}

            {/* Radar — molecule thumbnails strip */}
            {!error && activeTab === 'radar' && data.length > 0 && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${colors.borderLight}`, paddingTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: colors.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Compounds in profile — {Math.min(data.length, 10)}
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                  {data.slice(0, 10).map((mol, i) => (
                    <div key={i} style={{
                      flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      background: '#fff', border: `2px solid ${MOL_COLORS[i % MOL_COLORS.length]}44`,
                      borderRadius: 10, padding: '6px 8px', minWidth: 90,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}>
                      <MolImage smiles={mol.smiles} />
                      <div style={{
                        fontSize: 9, fontWeight: 700, marginTop: 4, textAlign: 'center',
                        color: MOL_COLORS[i % MOL_COLORS.length],
                        maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {mol.name || `#${i + 1}`}
                      </div>
                      <div style={{ fontSize: 8, color: colors.textLight, marginTop: 1 }}>
                        QED {(mol.QED ?? 0).toFixed(2)} · MW {(mol.MolecularWeight ?? 0).toFixed(0)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histogram — Extremes panel (top 3 / bottom 3) */}
            {!error && activeTab === 'histogram' && data.length >= 2 && (() => {
              const propLabel = AXIS_OPTIONS.find(o => o.value === histProp)?.label ?? histProp;
              const sorted = [...data]
                .filter(m => m[histProp] != null)
                .sort((a, b) => (b[histProp] as number) - (a[histProp] as number));
              const top = sorted.slice(0, Math.min(3, sorted.length));
              const bot = sorted.slice(-Math.min(3, sorted.length)).reverse();
              const fmt = (v: any) => typeof v === 'number' ? v.toFixed(v < 10 ? 3 : 1) : '—';
              return (
                <div style={{ marginTop: 16, borderTop: `1px solid ${colors.borderLight}`, paddingTop: 14, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {[{ label: `Highest ${propLabel}`, mols: top, color: '#0ea5e9' }, { label: `Lowest ${propLabel}`, mols: bot, color: '#94a3b8' }].map(({ label, mols, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {mols.map((mol, i) => (
                          <div key={i} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            background: '#fff', border: `1.5px solid ${color}44`,
                            borderRadius: 10, padding: '6px 8px', minWidth: 90,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                          }}>
                            <MolImage smiles={mol.smiles} />
                            <div style={{ fontSize: 9, fontWeight: 700, marginTop: 4, color: colors.text, maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                              {mol.name || `#${data.indexOf(mol) + 1}`}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 800, color, marginTop: 1 }}>{fmt(mol[histProp])}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Molecule hover tooltip */}
            {hoveredMol && (activeTab === 'bubble' || activeTab === 'pca') && hoveredMol.x > 0 && (() => {
              const isPca = activeTab === 'pca';
              const xLbl = isPca ? `PC1 (${pcaResult?.variance[0].toFixed(1)}%)` : (AXIS_OPTIONS.find(o => o.value === xProp)?.label ?? xProp);
              const yLbl = isPca ? `PC2 (${pcaResult?.variance[1].toFixed(1)}%)` : (AXIS_OPTIONS.find(o => o.value === yProp)?.label ?? yProp);
              const xVal = isPca ? (hoveredMol.mol.PC1 as number) : (hoveredMol.mol[xProp] as number);
              const yVal = isPca ? (hoveredMol.mol.PC2 as number) : (hoveredMol.mol[yProp] as number);
              const tipW = 188, tipH = 150;
              const left = hoveredMol.x + 16 + tipW > window.innerWidth ? hoveredMol.x - tipW - 10 : hoveredMol.x + 16;
              const top  = hoveredMol.y - tipH < 8 ? hoveredMol.y + 10 : hoveredMol.y - tipH;
              return (
                <div style={{
                  position: 'fixed', left, top, zIndex: 9999,
                  backgroundColor: '#fff', border: '1px solid #e2e8f0',
                  borderRadius: '12px', boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                  padding: '10px 12px', pointerEvents: 'none', minWidth: tipW,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <MolImage smiles={hoveredMol.mol.smiles} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.text, marginTop: 6, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {hoveredMol.mol.name || `Compound ${hoveredMol.idx + 1}`}
                  </div>
                  <div style={{ fontSize: 9, color: colors.textMuted, marginTop: 2, textAlign: 'center' }}>
                    {xLbl}: <b>{xVal?.toFixed(3)}</b>
                    {' · '}
                    {yLbl}: <b>{yVal?.toFixed(3)}</b>
                  </div>
                  <div style={{ fontSize: 9, color: '#0ea5e9', marginTop: 5, textAlign: 'center', fontWeight: 600 }}>
                    Click to highlight in library ↓
                  </div>
                </div>
              );
            })()}

            {/* ── DataWarrior Molecules Tab ──────────────────────────────── */}
            {activeTab === 'molecules' && data.length > 0 && (
              <div>
                <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle(''), cursor: 'default', width: 36 }}>#</th>
                        <th style={{ ...thStyle(''), cursor: 'default', minWidth: 100, backgroundColor: '#f8fafc', borderBottom: `2px solid ${colors.borderLight}`, padding: '8px 12px', fontWeight: 700, fontSize: 10, color: colors.text, textAlign: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
                          Estrutura
                        </th>
                        <th style={{ ...thStyle('name'), cursor: 'default', textAlign: 'left', minWidth: 110 }}>Nome / ID</th>
                        {DW_COLS.map(c => (
                          <th
                            key={c.key}
                            style={{ ...thStyle(c.key), width: c.w }}
                            onClick={() => thSort(c.key)}
                            title={`Ordenar por ${c.label}`}
                          >
                            {c.label}
                            {sortProp === c.key && (
                              <i className={`bi bi-caret-${sortDir === 'desc' ? 'down' : 'up'}-fill`} style={{ marginLeft: 3, fontSize: 8 }} />
                            )}
                          </th>
                        ))}
                        <th style={{ ...thStyle(''), cursor: 'default', width: 46 }}>Ro5</th>
                        <th style={{ ...thStyle(''), cursor: 'default', width: 52 }}>Veber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dwRows.map((mol, i) => {
                        const rowIdx = dwPage * MOLS_PER_PAGE + i;
                        const viol   = mol.LipinskiViolations ?? 0;
                        const veber  = checkVeber(mol);
                        const bg     = rowIdx % 2 === 0 ? '#fff' : '#f9fafb';
                        const passStyle = (pass: boolean): React.CSSProperties => ({
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                          backgroundColor: pass ? '#dcfce7' : '#fee2e2',
                          color: pass ? '#15803d' : '#dc2626',
                        });
                        return (
                          <tr key={mol.smiles + rowIdx} style={{ backgroundColor: bg, borderBottom: `1px solid ${colors.borderLight}` }}>
                            <td style={{ padding: '4px 8px', textAlign: 'center', color: colors.textLight, fontSize: 10, fontWeight: 600 }}>
                              {rowIdx + 1}
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                              <MolImage smiles={mol.smiles} />
                            </td>
                            <td style={{ padding: '4px 10px', maxWidth: 140 }}>
                              <div style={{ fontWeight: 600, color: colors.navy, fontSize: 11, marginBottom: 2 }}>
                                {mol.name || `Compound ${rowIdx + 1}`}
                              </div>
                              <div style={{ fontSize: 9, color: colors.textLight, wordBreak: 'break-all', lineHeight: 1.3 }}>
                                {mol.smiles.length > 28 ? mol.smiles.slice(0, 28) + '…' : mol.smiles}
                              </div>
                            </td>
                            {DW_COLS.map(c => (
                              <td key={c.key} style={{ padding: '4px 8px', textAlign: 'center', fontFamily: 'monospace', color: colors.textMuted }}>
                                {c.fmt(mol)}
                              </td>
                            ))}
                            <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                              <span style={passStyle(viol === 0)}>{viol === 0 ? '✓' : '✗'}</span>
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                              <span style={passStyle(veber)}>{veber ? '✓' : '✗'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {dwTotalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 24px', borderTop: `1px solid ${colors.borderLight}`, backgroundColor: '#f8fafc' }}>
                    <button
                      disabled={dwPage === 0}
                      onClick={() => setMolsPage(p => Math.max(0, p - 1))}
                      style={{ padding: '5px 14px', borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: '#fff', cursor: dwPage === 0 ? 'not-allowed' : 'pointer', opacity: dwPage === 0 ? 0.4 : 1, fontSize: 12, fontWeight: 600 }}
                    >
                      ← Anterior
                    </button>
                    <span style={{ fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>
                      Página {dwPage + 1} / {dwTotalPages}
                    </span>
                    <button
                      disabled={dwPage >= dwTotalPages - 1}
                      onClick={() => setMolsPage(p => Math.min(dwTotalPages - 1, p + 1))}
                      style={{ padding: '5px 14px', borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: '#fff', cursor: dwPage >= dwTotalPages - 1 ? 'not-allowed' : 'pointer', opacity: dwPage >= dwTotalPages - 1 ? 0.4 : 1, fontSize: 12, fontWeight: 600 }}
                    >
                      Próxima →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Pearson correlation heatmap */}
            {!error && activeTab === 'correlation' && corrMatrix && (
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

            {/* Correlation — top/bottom molecules by QED strip */}
            {!error && activeTab === 'correlation' && corrMatrix && data.length > 0 && (() => {
              const sorted = [...data].filter(m => m.QED != null).sort((a, b) => (b.QED as number) - (a.QED as number));
              const top = sorted.slice(0, Math.min(5, sorted.length));
              const bot = sorted.slice(-Math.min(5, sorted.length)).reverse();
              return (
                <div style={{ marginTop: 20, borderTop: `1px solid ${colors.borderLight}`, paddingTop: 14, display: 'flex', gap: 32, flexWrap: 'wrap', padding: '14px 24px 0' }}>
                  {[
                    { label: 'Best QED', mols: top, color: '#10b981' },
                    { label: 'Lowest QED', mols: bot, color: '#f59e0b' },
                  ].map(({ label, mols, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {mols.map((mol, i) => (
                          <div key={i} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            background: '#fff', border: `1.5px solid ${color}55`,
                            borderRadius: 10, padding: '6px 8px', minWidth: 90,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                          }}>
                            <MolImage smiles={mol.smiles} />
                            <div style={{ fontSize: 9, fontWeight: 700, marginTop: 4, color: colors.text, maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                              {mol.name || `#${data.indexOf(mol) + 1}`}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 800, color, marginTop: 1 }}>
                              QED {(mol.QED as number).toFixed(3)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {!error && activeTab === 'correlation' && !corrMatrix && data.length > 0 && (
              <div style={{ textAlign: 'center', color: colors.textLight, padding: '60px', fontSize: '13px' }}>
                At least 2 molecules required for correlation analysis.
              </div>
            )}

            {/* Drug-likeness filter compliance table */}
            {/* PCA tab */}
            {!error && activeTab === 'pca' && (
              pcaResult ? (
                <div style={{ display: 'flex', height: '420px', gap: 0 }}>
                  {/* Thumbnail panel (reuse same as bubble tab) */}
                  {showThumbnails && (
                    <div ref={thumbPanelRef} style={{
                      width: 428, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
                      borderRight: `1px solid ${colors.borderLight}`, padding: '8px',
                      backgroundColor: '#fafbfd', display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, alignContent: 'start',
                    }}>
                      {data.map((mol, i) => {
                        const isHov = hoveredMol?.idx === i || thumbnailHoverIdx === i;
                        const isSel = selectedMolIdx === i;
                        return (
                          <div key={i} id={`thumb-pca-${i}`}
                            onMouseEnter={() => setThumbnailHoverIdx(i)}
                            onMouseLeave={() => setThumbnailHoverIdx(null)}
                            onClick={() => { setSelectedMolIdx(i); setHoveredMol(null); setTimeout(() => document.getElementById(`mol-card-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }}
                            style={{
                              borderRadius: 8, padding: '4px 3px 3px', cursor: 'pointer',
                              border: `2px solid ${isSel ? '#0ea5e9' : isHov ? '#93c5fd' : '#e2e8f0'}`,
                              backgroundColor: isSel ? '#f0f9ff' : isHov ? '#f8fafc' : '#fff',
                              transition: 'border-color 0.12s', display: 'flex', flexDirection: 'column', alignItems: 'center',
                              boxShadow: isSel ? '0 0 0 3px #0ea5e922' : 'none',
                            }}
                          >
                            <MolImage smiles={mol.smiles} width={90} height={68} />
                            <div style={{ fontSize: 9, fontWeight: isSel ? 700 : 500, color: isSel ? '#0369a1' : '#475569', textAlign: 'center', marginTop: 3, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {mol.name || `#${i + 1}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* PCA scatter + loadings side by side */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 0 }}>
                    {/* Scatter PC1 vs PC2 */}
                    <div style={{ flex: 3, position: 'relative' }}>
                      <ChemicalSpaceChart
                        data={pcaResult.data}
                        xProp="PC1" yProp="PC2" sizeProp="MolecularWeight"
                        mode="scatter"
                        xLabel={`PC1 (${pcaResult.variance[0].toFixed(1)}%)`}
                        yLabel={`PC2 (${pcaResult.variance[1].toFixed(1)}%)`}
                        selectedIdx={selectedMolIdx}
                        highlightIdx={thumbnailHoverIdx}
                        onSelect={idx => {
                          setSelectedMolIdx(idx); setHoveredMol(null);
                          setTimeout(() => {
                            document.getElementById(`thumb-pca-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            document.getElementById(`mol-card-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 80);
                        }}
                        showLabels={showDotLabels}
                        onHover={(mol, idx, x, y) => {
                          if (mol) { setHoveredMol({ mol, idx, x, y }); document.getElementById(`thumb-pca-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
                          else setHoveredMol(null);
                        }}
                      />
                    </div>
                    {/* Loadings chart */}
                    <div style={{ flex: 1, minWidth: 200, borderLeft: `1px solid ${colors.borderLight}`, padding: '12px 8px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: colors.text, marginBottom: 6 }}>Loadings</div>
                      <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 8, lineHeight: 1.4 }}>
                        Contribuição de cada descritor para PC1 e PC2
                      </div>
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <LoadingsChart loadings={pcaResult.loadings} propNames={pcaResult.propNames} variance={pcaResult.variance} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360, color: colors.textMuted, fontSize: 14 }}>
                  São necessárias pelo menos 3 moléculas para calcular a PCA.
                </div>
              )
            )}

            {!error && activeTab === 'filters' && data.length > 0 && (
              <div style={{ overflowX: 'auto', padding: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.borderLight}` }}>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: colors.text, whiteSpace: 'nowrap', minWidth: 110 }}>Compound</th>
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
                    <tr style={{ borderBottom: `1px solid ${colors.borderLight}`, backgroundColor: '#f8fafc' }}>
                      <td style={{ padding: '6px 12px', fontWeight: 700, color: colors.textMuted, fontSize: '11px' }}>Pass rate</td>
                      <td colSpan={7} />
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
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <MolImage smiles={m.smiles} width={80} height={60} />
                          <div style={{ fontSize: 9, fontWeight: 600, color: colors.text, marginTop: 2, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            {m.name || `#${i + 1}`}
                          </div>
                        </td>
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
      )}

      {/* ── Compound library card grid ─────────────────────────────────────── */}
      {data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: colors.text }}>
              Compound Library <span style={{ color: colors.textLight, fontWeight: 400 }}>({data.length})</span>
            </h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Upload new library */}
              <label style={{
                padding: '7px 14px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                color: colors.textMuted, display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <i className="bi bi-folder2-open" /> Novo CSV
                <input type="file" accept=".csv,.txt,.smi" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>
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
              <button onClick={exportCSV} style={{
                padding: '7px 14px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                color: colors.textMuted, display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <i className="bi bi-download" /> CSV
              </button>
              {/* Toggle SMILES */}
              <button onClick={() => setShowSmilesText(!showSmilesText)} style={{
                padding: '7px 14px', borderRadius: '8px', border: `1px solid ${colors.border}`,
                background: showSmilesText ? '#0ea5e9' : '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                color: showSmilesText ? '#fff' : colors.textMuted, display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'background 0.2s',
              }}>
                <i className={showSmilesText ? "bi bi-eye" : "bi bi-eye-slash"} /> SMILES
              </button>
              {/* Search */}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '18px' }}>
            {sortedFiltered.map((mol, i) => {
              const originalIdx = data.indexOf(mol);
              const isSelected  = selectedMolIdx === originalIdx;
              const viol  = mol.LipinskiViolations ?? 0;
              const vc    = viol === 0 ? colors.success   : viol === 1 ? colors.warning   : colors.danger;
              const vbg   = viol === 0 ? colors.successBg : viol === 1 ? colors.warningBg : colors.dangerBg;
              const veber = checkVeber(mol);
              return (
                <div
                  id={`mol-card-${originalIdx}`}
                  key={mol.smiles}
                  style={{
                    backgroundColor: isSelected ? '#f0f9ff' : '#fff',
                    borderRadius: radius.md,
                    border: `2px solid ${isSelected ? '#0ea5e9' : colors.borderLight}`,
                    boxShadow: isSelected ? `0 0 0 3px #0ea5e933, ${shadow.sm}` : shadow.sm,
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    transition: 'border 0.2s, box-shadow 0.2s, background 0.2s',
                  }}
                >
                  <div style={{ padding: '16px', backgroundColor: '#fcfcfc', borderBottom: `1px solid ${colors.borderLight}`, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '140px' }}>
                    <SmilesCard smiles={mol.smiles} />
                  </div>
                  <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: colors.navy }}>{mol.name || `Compound ${i + 1}`}</span>
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
                    {showSmilesText && (
                      <div style={{ fontSize: '10px', color: colors.blue, marginBottom: '10px', wordBreak: 'break-all', lineHeight: 1.4 }} title={mol.smiles}>
                        {mol.smiles.length > 45 ? `${mol.smiles.slice(0, 45)}…` : mol.smiles}
                      </div>
                    )}
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
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function LibraryPage({ onBack, initialSmiles, onSmilesChange }: { onBack: () => void; initialSmiles?: string; onSmilesChange?: (s: string) => void }) {
  return (
    <PageShell
      icon="bi-grid-1x2"
      title="SMILES Library Analytics"
      subtitle="Advanced cheminformatics analysis — chemical space, multi-filter compliance, property distributions and descriptor correlations."
      accentColor="#0ea5e9"
      onBack={onBack}
    >
      <LibraryContent initialSmiles={initialSmiles} onSmilesChange={onSmilesChange} />
    </PageShell>
  );
}

export default LibraryPage;
