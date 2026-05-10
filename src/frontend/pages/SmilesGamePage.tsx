import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AminoAcidDef {
  code: string; full: string; color: string; r: number; letter: string;
  type: string;
}

interface EnzymeDef {
  name: string; color: string; r: number; cutLength: number;
}

interface ChainNode {
  x: number; y: number; def: AminoAcidDef; id: number;
}

interface FreeAA {
  x: number; y: number; vx: number; vy: number;
  def: AminoAcidDef; id: number;
}

interface EnzymeEntity {
  x: number; y: number; vx: number; vy: number;
  def: EnzymeDef; id: number; angle: number;
}

interface ProteinBlob {
  x: number; y: number; vx: number; vy: number;
  aas: AminoAcidDef[]; id: number; r: number; pulseFrame: number;
  angle: number;
}

interface Banner {
  text: string; sub: string; color: string; frames: number; maxFrames: number;
}

interface RadicalBurst {
  cx: number; cy: number;
  r: number; maxR: number;
  frame: number; warnDur: number; burstDur: number;
  id: number;
}

interface GS {
  px: number; py: number; pr: number;
  playerDef: AminoAcidDef;
  posHistory: Array<{ x: number; y: number }>;
  chain: ChainNode[];
  freeAAs: FreeAA[];
  enzymes: EnzymeEntity[];
  proteins: ProteinBlob[];
  radicals: RadicalBurst[];
  keys: Set<string>;
  score: number; frame: number;
  spawnCd: number; enzymeCd: number; radicalCd: number;
  alive: boolean;
  shakeFrames: number;
  nextId: number;
  proteinCount: number; complexCount: number;
  banner: Banner | null;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const AA_DEFS: AminoAcidDef[] = [
  { code: 'Gly', full: 'Glicina',      color: '#94a3b8', r: 16, letter: 'G', type: 'Apolar'   },
  { code: 'Ala', full: 'Alanina',      color: '#a78bfa', r: 17, letter: 'A', type: 'Apolar'   },
  { code: 'Val', full: 'Valina',       color: '#60a5fa', r: 18, letter: 'V', type: 'Apolar'   },
  { code: 'Leu', full: 'Leucina',      color: '#4ade80', r: 18, letter: 'L', type: 'Apolar'   },
  { code: 'Ser', full: 'Serina',       color: '#f87171', r: 16, letter: 'S', type: 'Polar'    },
  { code: 'Thr', full: 'Treonina',     color: '#fb923c', r: 17, letter: 'T', type: 'Polar'    },
  { code: 'Asp', full: 'Aspartato',    color: '#f43f5e', r: 18, letter: 'D', type: 'Ácido'    },
  { code: 'Lys', full: 'Lisina',       color: '#fbbf24', r: 18, letter: 'K', type: 'Básico'   },
  { code: 'Pro', full: 'Prolina',      color: '#c084fc', r: 16, letter: 'P', type: 'Cíclico'  },
  { code: 'Phe', full: 'Fenilalanina', color: '#22d3ee', r: 19, letter: 'F', type: 'Aromático'},
];

const ENZYME_DEFS: EnzymeDef[] = [
  { name: 'Tripsina',      color: '#ef4444', r: 22, cutLength: 5 },
  { name: 'Pepsina',       color: '#f97316', r: 20, cutLength: 3 },
  { name: 'Quimotripsina', color: '#eab308', r: 24, cutLength: 7 },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const CHAIN_FOR_PROTEIN    = 8;
const PROTEINS_FOR_COMPLEX = 3;
const PLAYER_SPEED         = 5.2;
const CHAIN_SPACING        = 28;
const RADICAL_RING_W       = 28;
const RADICAL_MAX_RADIUS   = 140;  // localized — not full-screen

interface LeaderboardEntry {
  name: string;
  score: number;
  proteins: number;
  complexes: number;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function randAA() { return AA_DEFS[Math.floor(Math.random() * AA_DEFS.length)]; }
function randEnzyme() { return ENZYME_DEFS[Math.floor(Math.random() * ENZYME_DEFS.length)]; }

function spawnEdge(W: number, H: number, m = 40): { x: number; y: number; angle: number } {
  const edge = Math.floor(Math.random() * 4);
  let x = 0, y = 0;
  if (edge === 0) { x = Math.random() * W; y = -m; }
  else if (edge === 1) { x = W + m; y = Math.random() * H; }
  else if (edge === 2) { x = Math.random() * W; y = H + m; }
  else { x = -m; y = Math.random() * H; }
  const angle = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - 0.5) * 0.9;
  return { x, y, angle };
}

// ─── Draw utilities (outside component — never stale) ────────────────────────

function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(148,163,184,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, color: string, label: string,
  fontSize: number, glowA = 0.3, sw = 2
) {
  const g = ctx.createRadialGradient(x, y, 2, x, y, r + 8);
  g.addColorStop(0, color + Math.round(glowA * 255).toString(16).padStart(2, '0'));
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = color + '2e';
  ctx.strokeStyle = color;
  ctx.lineWidth = sw;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
}

function drawHUD(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  score: number, chainLen: number, proteinCount: number,
  complexCount: number, hs: number
) {
  ctx.fillStyle = 'rgba(15,23,42,0.8)';
  ctx.beginPath(); ctx.rect(8, 8, 190, 96); ctx.fill();

  ctx.fillStyle = '#475569';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('PONTUAÇÃO', 16, 14);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(String(score), 16, 26);

  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';
  ctx.fillText(`Recorde: ${hs}`, 16, 58);
  ctx.fillText(`Cadeia: ${chainLen}/${CHAIN_FOR_PROTEIN} AAs`, 16, 72);

  ctx.fillStyle = '#c084fc';
  ctx.fillText(`Proteínas: ${proteinCount}`, 16, 86);
  ctx.fillStyle = '#f43f5e';
  ctx.fillText(`Complexos: ${complexCount}`, 106, 86);

  // Right-side protein fill gauge
  const bx = W - 26, bTop = 80, bH = H - 160;
  ctx.fillStyle = 'rgba(15,23,42,0.65)';
  ctx.beginPath(); ctx.rect(bx - 8, bTop - 30, 28, bH + 50); ctx.fill();

  const filled = Math.min(chainLen / CHAIN_FOR_PROTEIN, 1);
  ctx.fillStyle = '#1e293b';
  ctx.beginPath(); ctx.rect(bx - 2, bTop, 16, bH); ctx.fill();

  if (filled > 0) {
    const barG = ctx.createLinearGradient(0, bTop + bH, 0, bTop);
    barG.addColorStop(0, '#7c3aed');
    barG.addColorStop(1, '#c084fc');
    ctx.fillStyle = barG;
    ctx.beginPath(); ctx.rect(bx - 2, bTop + bH * (1 - filled), 16, bH * filled); ctx.fill();
  }

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  for (let i = 1; i < CHAIN_FOR_PROTEIN; i++) {
    const ty = bTop + bH * (1 - i / CHAIN_FOR_PROTEIN);
    ctx.beginPath(); ctx.moveTo(bx - 2, ty); ctx.lineTo(bx + 14, ty); ctx.stroke();
  }

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PROT', bx + 6, bTop - 18);
  ctx.fillText(`${chainLen}/${CHAIN_FOR_PROTEIN}`, bx + 6, bTop + bH + 10);
}

function drawBanner(ctx: CanvasRenderingContext2D, W: number, H: number, b: Banner) {
  const t = b.frames / b.maxFrames;
  const alpha = Math.min(1, t * 8, (1 - t) * 4 + 0.15);
  ctx.globalAlpha = Math.max(0, alpha);
  const bw = 380, bh = 72, bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
  ctx.fillStyle = '#0c111d' + 'dd';
  ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.fill();
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.text, W / 2, H / 2 - 11);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px monospace';
  ctx.fillText(b.sub, W / 2, H / 2 + 13);
  ctx.globalAlpha = 1;
}

function drawDeadScreen(ctx: CanvasRenderingContext2D, W: number, H: number, score: number, hs: number) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(148,163,184,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 38px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PROTEÓLISE TOTAL!', W / 2, H / 2 - 55);
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '22px monospace';
  ctx.fillText(`Pontuação: ${score}`, W / 2, H / 2 - 10);
  ctx.fillStyle = '#64748b';
  ctx.font = '14px monospace';
  ctx.fillText(`Recorde: ${hs}`, W / 2, H / 2 + 22);
  ctx.fillStyle = '#334155';
  ctx.font = '13px monospace';
  ctx.fillText('Pressione R ou clique em Reiniciar', W / 2, H / 2 + 55);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props { onBack: () => void; }

export default function SmilesGamePage({ onBack }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const gsRef      = useRef<GS | null>(null);
  const loopRef    = useRef<() => void>(() => {});
  const rafRef     = useRef<number>(0);
  const hsRef      = useRef<number>(0);

  const [alive,        setAlive]        = useState(true);
  const [highScore,    setHighScore]    = useState(() => {
    try { return parseInt(localStorage.getItem('smilesgame_hs') || '0', 10); } catch { return 0; }
  });

  // Leaderboard / name entry
  const [phase,        setPhase]        = useState<'entry' | 'playing' | 'dead'>('entry');
  const [playerName,   setPlayerName]   = useState(() => {
    try { return localStorage.getItem('smilesgame_name') || ''; } catch { return ''; }
  });
  const [nameInput,    setNameInput]    = useState(() => {
    try { return localStorage.getItem('smilesgame_name') || ''; } catch { return ''; }
  });
  const [leaderboard,  setLeaderboard]  = useState<LeaderboardEntry[]>([]);
  const [myRank,       setMyRank]       = useState<number | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [lastScore,    setLastScore]    = useState<{ score: number; proteins: number; complexes: number } | null>(null);
  const phaseRef      = useRef<'entry' | 'playing' | 'dead'>('entry');
  const gameOverCbRef = useRef<(score: number, proteins: number, complexes: number) => void>(() => {});

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { hsRef.current = highScore; }, [highScore]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/game/leaderboard?limit=10');
      const data = await res.json();
      if (Array.isArray(data)) setLeaderboard(data);
    } catch {}
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const submitScore = useCallback(async (score: number, proteins: number, complexes: number, name: string) => {
    if (!name.trim() || score <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/game/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), score, proteins, complexes }),
      });
      const data = await res.json();
      if (data.ok) setMyRank(data.rank);
      await fetchLeaderboard();
    } catch {}
    setSubmitting(false);
  }, [fetchLeaderboard]);

  // Re-assign every render so closures are fresh
  gameOverCbRef.current = (score: number, proteins: number, complexes: number) => {
    setLastScore({ score, proteins, complexes });
    setPhase('dead');
    submitScore(score, proteins, complexes, playerName);
  };

  const startGame = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPlayerName(trimmed);
    try { localStorage.setItem('smilesgame_name', trimmed); } catch {}
    setMyRank(null);
    setLastScore(null);
    setPhase('playing');
    const canvas = canvasRef.current;
    if (canvas) gsRef.current = makeGS(canvas.width, canvas.height);
    setAlive(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const makeGS = useCallback((w: number, h: number): GS => ({
    px: w / 2, py: h / 2, pr: 20,
    playerDef: AA_DEFS[0],
    posHistory: [],
    chain: [], freeAAs: [], enzymes: [], proteins: [], radicals: [],
    keys: new Set(),
    score: 0, frame: 0,
    spawnCd: 60, enzymeCd: 480, radicalCd: 900,
    alive: true, shakeFrames: 0, nextId: 1,
    proteinCount: 0, complexCount: 0,
    banner: null,
  }), []);

  const restart = useCallback(() => {
    setMyRank(null);
    setLastScore(null);
    setPhase('entry');
    setAlive(true);
  }, []);

  // ── Game loop — re-assigned each render so closures are always fresh ────────
  loopRef.current = () => {
    const canvas = canvasRef.current;
    const gs = gsRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    if (phaseRef.current === 'entry') {
      drawBg(ctx, W, H);
      return;
    }
    if (!gs || !gs.alive) {
      drawDeadScreen(ctx, W, H, gs?.score ?? 0, hsRef.current);
      return;
    }

    gs.frame++;

    // ── Movement ─────────────────────────────────────────────────────────
    let dx = 0, dy = 0;
    if (gs.keys.has('ArrowLeft')  || gs.keys.has('a') || gs.keys.has('A')) dx -= 1;
    if (gs.keys.has('ArrowRight') || gs.keys.has('d') || gs.keys.has('D')) dx += 1;
    if (gs.keys.has('ArrowUp')    || gs.keys.has('w') || gs.keys.has('W')) dy -= 1;
    if (gs.keys.has('ArrowDown')  || gs.keys.has('s') || gs.keys.has('S')) dy += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
    gs.px = Math.max(gs.pr, Math.min(W - gs.pr, gs.px + dx * PLAYER_SPEED));
    gs.py = Math.max(gs.pr, Math.min(H - gs.pr, gs.py + dy * PLAYER_SPEED));

    // ── Position history (for snake-chain) ───────────────────────────────
    gs.posHistory.unshift({ x: gs.px, y: gs.py });
    const maxHist = (gs.chain.length + 2) * CHAIN_SPACING * 2 + 120;
    if (gs.posHistory.length > maxHist) gs.posHistory.length = maxHist;

    for (let i = 0; i < gs.chain.length; i++) {
      const idx = Math.round((i + 1) * CHAIN_SPACING);
      if (idx < gs.posHistory.length) {
        gs.chain[i].x = gs.posHistory[idx].x;
        gs.chain[i].y = gs.posHistory[idx].y;
      }
    }

    // ── Passive score ─────────────────────────────────────────────────────
    if (gs.frame % 60 === 0) gs.score += 1 + gs.chain.length;

    // ── Spawn free AAs ────────────────────────────────────────────────────
    if (--gs.spawnCd <= 0) {
      const { x, y, angle } = spawnEdge(W, H, 30);
      const spd = 1.4 + Math.random() * 1.4;
      gs.freeAAs.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, def: randAA(), id: gs.nextId++ });
      gs.spawnCd = 80 + Math.floor(Math.random() * 60);
    }

    // ── Spawn enzymes (after 5s grace period) ─────────────────────────────
    if (--gs.enzymeCd <= 0 && gs.frame > 300) {
      const { x, y } = spawnEdge(W, H, 50);
      gs.enzymes.push({ x, y, vx: 0, vy: 0, def: randEnzyme(), id: gs.nextId++, angle: 0 });
      const base = Math.max(200, 400 - Math.floor(gs.frame / 600) * 25);
      gs.enzymeCd = base + Math.floor(Math.random() * 180);
    }

    // ── Spawn radical burst (after 15s) ───────────────────────────────────
    if (--gs.radicalCd <= 0 && gs.frame > 900) {
      const cx = W * 0.15 + Math.random() * W * 0.7;
      const cy = H * 0.15 + Math.random() * H * 0.7;
      gs.radicals.push({ cx, cy, r: 0, maxR: RADICAL_MAX_RADIUS, frame: 0, warnDur: 120, burstDur: 140, id: gs.nextId++ });
      gs.radicalCd = 600 + Math.floor(Math.random() * 350);
    }

    // ── Update radicals ───────────────────────────────────────────────────
    const RING_W = RADICAL_RING_W;
    gs.radicals = gs.radicals.filter(rb => {
      rb.frame++;
      const inBurst = rb.frame >= rb.warnDur;
      if (inBurst) {
        const t = (rb.frame - rb.warnDur) / rb.burstDur;
        rb.r = rb.maxR * t;

        // Destroy free AAs caught in ring
        gs.freeAAs = gs.freeAAs.filter(a => {
          const d = dist(rb.cx, rb.cy, a.x, a.y);
          return !(d >= rb.r - RING_W && d <= rb.r + 4);
        });

        // Destroy enzymes caught in ring (+score bonus)
        gs.enzymes = gs.enzymes.filter(e => {
          const d = dist(rb.cx, rb.cy, e.x, e.y);
          if (d >= rb.r - RING_W && d <= rb.r + 4) { gs.score += 20; return false; }
          return true;
        });

        // Destroy protein blobs caught in ring
        gs.proteins = gs.proteins.filter(p => {
          const d = dist(rb.cx, rb.cy, p.x, p.y);
          return !(d >= rb.r - RING_W && d <= rb.r + 4);
        });

        // Hit player
        const dp = dist(rb.cx, rb.cy, gs.px, gs.py);
        if (dp >= rb.r - RING_W && dp <= rb.r + 4) {
          if (gs.chain.length > 0) {
            gs.score = Math.max(0, gs.score - gs.chain.length * 3);
            gs.chain = [];
            gs.posHistory = [];
            gs.shakeFrames = 28;
            gs.banner = { text: '☢ DESNATURAÇÃO!', sub: 'Radical livre destruiu toda a cadeia!', color: '#f97316', frames: 160, maxFrames: 160 };
          } else {
            gs.alive = false;
            const hs = Math.max(hsRef.current, gs.score);
            try { localStorage.setItem('smilesgame_hs', String(hs)); } catch {}
            hsRef.current = hs;
            setHighScore(hs);
            setAlive(false);
            gameOverCbRef.current(gs.score, gs.proteinCount, gs.complexCount);
          }
        }
      }
      return rb.frame < rb.warnDur + rb.burstDur;
    });

    // ── Move free AAs (bounce) ────────────────────────────────────────────
    for (const a of gs.freeAAs) {
      a.x += a.vx; a.y += a.vy;
      if (Math.random() < 0.015) {
        a.vx += (Math.random() - 0.5) * 0.4;
        a.vy += (Math.random() - 0.5) * 0.4;
        const s = Math.hypot(a.vx, a.vy);
        if (s > 2.8) { a.vx = a.vx / s * 2.8; a.vy = a.vy / s * 2.8; }
      }
      if (a.x < a.def.r) { a.x = a.def.r; a.vx = Math.abs(a.vx); }
      if (a.x > W - a.def.r) { a.x = W - a.def.r; a.vx = -Math.abs(a.vx); }
      if (a.y < a.def.r) { a.y = a.def.r; a.vy = Math.abs(a.vy); }
      if (a.y > H - a.def.r) { a.y = H - a.def.r; a.vy = -Math.abs(a.vy); }
    }

    // ── Move enzymes (chase middle of chain) ──────────────────────────────
    for (const e of gs.enzymes) {
      let tx = gs.px, ty = gs.py;
      if (gs.chain.length >= 2) {
        const mid = gs.chain[Math.floor(gs.chain.length / 2)];
        tx = mid.x; ty = mid.y;
      } else if (gs.chain.length === 1) {
        tx = gs.chain[0].x; ty = gs.chain[0].y;
      }
      const ang = Math.atan2(ty - e.y, tx - e.x);
      const spd = 1.1 + Math.min(2.0, gs.frame / 1800);
      e.vx = e.vx * 0.88 + Math.cos(ang) * spd * 0.12;
      e.vy = e.vy * 0.88 + Math.sin(ang) * spd * 0.12;
      e.x += e.vx; e.y += e.vy;
      e.angle += 0.07;
    }

    // ── Move protein blobs ────────────────────────────────────────────────
    for (const p of gs.proteins) {
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.996; p.vy *= 0.996;
      if (p.x - p.r < 0) { p.x = p.r; p.vx = Math.abs(p.vx); }
      if (p.x + p.r > W) { p.x = W - p.r; p.vx = -Math.abs(p.vx); }
      if (p.y - p.r < 0) { p.y = p.r; p.vy = Math.abs(p.vy); }
      if (p.y + p.r > H) { p.y = H - p.r; p.vy = -Math.abs(p.vy); }
      if (p.pulseFrame > 0) p.pulseFrame--;
      p.angle += 0.004;
    }

    // ── Protein complex check ──────────────────────────────────────────────
    if (gs.proteins.length >= PROTEINS_FOR_COMPLEX) {
      gs.complexCount++;
      const bonus = 500 * gs.complexCount;
      gs.score += bonus;
      const cx = gs.proteins.reduce((s, p) => s + p.x, 0) / gs.proteins.length;
      const cy = gs.proteins.reduce((s, p) => s + p.y, 0) / gs.proteins.length;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        gs.freeAAs.push({ x: cx + Math.cos(ang) * 70, y: cy + Math.sin(ang) * 70, vx: Math.cos(ang) * 2, vy: Math.sin(ang) * 2, def: randAA(), id: gs.nextId++ });
      }
      gs.proteins = [];
      gs.banner = { text: `✨ COMPLEXO PROTEICO! ×${gs.complexCount}`, sub: `+${bonus} pts — ${PROTEINS_FOR_COMPLEX} proteínas formaram o complexo!`, color: '#f43f5e', frames: 220, maxFrames: 220 };
    }

    // ── Collect free AAs ──────────────────────────────────────────────────
    gs.freeAAs = gs.freeAAs.filter(a => {
      if (dist(gs.px, gs.py, a.x, a.y) >= gs.pr + a.def.r + 4) return true;
      gs.chain.push({ x: a.x, y: a.y, def: a.def, id: a.id });
      gs.score += 5;

      if (gs.chain.length >= CHAIN_FOR_PROTEIN) {
        const protAAs = gs.chain.splice(0, CHAIN_FOR_PROTEIN).map(n => n.def);
        gs.posHistory = [];
        gs.proteins.push({
          x: gs.px + (Math.random() - 0.5) * 120,
          y: gs.py + (Math.random() - 0.5) * 120,
          vx: (Math.random() - 0.5) * 2.5,
          vy: (Math.random() - 0.5) * 2.5,
          aas: protAAs, id: gs.nextId++,
          r: 30 + protAAs.length, pulseFrame: 90, angle: 0,
        });
        gs.proteinCount++;
        gs.score += 100;
        gs.banner = {
          text: '🧬 PROTEÍNA FORMADA!',
          sub: protAAs.map(a => a.code).join('-') + '  +100 pts',
          color: '#c084fc', frames: 170, maxFrames: 170,
        };
      }
      return false;
    });

    // ── Enzyme collisions ─────────────────────────────────────────────────
    gs.enzymes = gs.enzymes.filter(e => {
      for (let i = 0; i < gs.chain.length; i++) {
        const node = gs.chain[i];
        if (dist(e.x, e.y, node.x, node.y) < e.def.r + node.def.r) {
          const removed = gs.chain.splice(i);
          gs.shakeFrames = 18;
          gs.score = Math.max(0, gs.score - removed.length * 2);
          gs.banner = {
            text: `✂ ${e.def.name} cortou a cadeia!`,
            sub: `−${removed.length} aminoácido${removed.length > 1 ? 's' : ''} perdido${removed.length > 1 ? 's' : ''}`,
            color: e.def.color, frames: 140, maxFrames: 140,
          };
          return false;
        }
      }
      if (dist(e.x, e.y, gs.px, gs.py) < e.def.r + gs.pr + 2) {
        if (gs.chain.length > 0) {
          const cut = Math.min(e.def.cutLength, gs.chain.length);
          gs.chain.splice(-cut);
          gs.shakeFrames = 20;
          gs.banner = {
            text: `✂ ${e.def.name} atingiu você!`,
            sub: `−${cut} aminoácidos da cauda`,
            color: e.def.color, frames: 130, maxFrames: 130,
          };
        } else {
          gs.alive = false;
          const hs = Math.max(hsRef.current, gs.score);
          try { localStorage.setItem('smilesgame_hs', String(hs)); } catch {}
          hsRef.current = hs;
          setHighScore(hs);
          setAlive(false);
          gameOverCbRef.current(gs.score, gs.proteinCount, gs.complexCount);
        }
        return false;
      }
      return true;
    });

    if (gs.banner) { gs.banner.frames--; if (gs.banner.frames <= 0) gs.banner = null; }
    if (gs.shakeFrames > 0) gs.shakeFrames--;

    // ─── Draw ──────────────────────────────────────────────────────────────
    ctx.save();
    if (gs.shakeFrames > 0) {
      const sh = gs.shakeFrames * 0.6;
      ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    }

    drawBg(ctx, W, H);

    // Radical bursts
    for (const rb of gs.radicals) {
      const inBurst = rb.frame >= rb.warnDur;
      if (!inBurst) {
        // Warning: zone preview + pulsing crosshair
        const blink     = Math.sin((rb.frame / rb.warnDur) * Math.PI * 10) * 0.5 + 0.5;
        const progress  = rb.frame / rb.warnDur;
        const warnAlpha = 0.3 + blink * 0.55;
        ctx.save();

        // Filled danger zone (semi-transparent, grows as countdown progresses)
        ctx.globalAlpha = 0.12 + progress * 0.10;
        ctx.fillStyle = '#f97316';
        ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.maxR, 0, Math.PI * 2); ctx.fill();

        // Dashed border of the zone
        ctx.globalAlpha = 0.4 + blink * 0.45;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.maxR, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);

        // Crosshair at center
        ctx.globalAlpha = warnAlpha;
        ctx.lineWidth = 2;
        const cSize = 20;
        ctx.beginPath(); ctx.moveTo(rb.cx - cSize, rb.cy); ctx.lineTo(rb.cx + cSize, rb.cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rb.cx, rb.cy - cSize); ctx.lineTo(rb.cx, rb.cy + cSize); ctx.stroke();
        ctx.beginPath(); ctx.arc(rb.cx, rb.cy, 12, 0, Math.PI * 2); ctx.stroke();

        // Countdown + escape direction relative to player
        const framesLeft = rb.warnDur - rb.frame;
        const secsTxt    = framesLeft > 0 ? `${(framesLeft / 60 * 1.5).toFixed(1)}s` : '';
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(`☢ RADICAL ${secsTxt}`, rb.cx, rb.cy - rb.maxR - 6);

        // Arrow pointing AWAY from explosion (escape hint)
        if (gs) {
          const awayAngle = Math.atan2(gs.py - rb.cy, gs.px - rb.cx);
          const arrowDist = rb.maxR + 22;
          const ax = rb.cx + Math.cos(awayAngle) * arrowDist;
          const ay = rb.cy + Math.sin(awayAngle) * arrowDist;
          ctx.globalAlpha = 0.75 + blink * 0.25;
          ctx.fillStyle = '#4ade80';
          ctx.font = 'bold 18px monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          // rotate canvas to point arrow in escape direction
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(awayAngle);
          ctx.fillText('▶', 0, 0);
          ctx.restore();
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = '#4ade80';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText('FUJA', ax, ay - 12);
        }

        ctx.globalAlpha = 1;
        ctx.restore();
      } else {
        // Burst: expanding annihilation ring
        const t = (rb.frame - rb.warnDur) / rb.burstDur;
        const alpha = Math.max(0, 1 - t * 0.7);
        ctx.save();
        ctx.globalAlpha = alpha;

        // Outer glow ring
        const grad = ctx.createRadialGradient(rb.cx, rb.cy, Math.max(0, rb.r - RING_W - 10), rb.cx, rb.cy, rb.r + 14);
        grad.addColorStop(0, 'rgba(249,115,22,0)');
        grad.addColorStop(0.4, 'rgba(249,115,22,0.55)');
        grad.addColorStop(0.7, 'rgba(255,200,50,0.9)');
        grad.addColorStop(0.85, 'rgba(255,80,20,0.7)');
        grad.addColorStop(1, 'rgba(239,68,68,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = RADICAL_RING_W + 10;
        ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.r, 0, Math.PI * 2); ctx.stroke();

        // Core bright ring
        ctx.strokeStyle = `rgba(255,255,200,${0.9 * alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.r, 0, Math.PI * 2); ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // Protein blobs
    for (const p of gs.proteins) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const pulse = p.pulseFrame > 0 ? 1 + (p.pulseFrame / 90) * 0.2 : 1;
      ctx.scale(pulse, pulse);

      const pGrad = ctx.createRadialGradient(0, 0, p.r * 0.3, 0, 0, p.r * 1.7);
      pGrad.addColorStop(0, 'rgba(192,132,252,0.2)');
      pGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = pGrad;
      ctx.beginPath(); ctx.arc(0, 0, p.r * 1.7, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#1e1b4b';
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      for (let i = 0; i < p.aas.length; i++) {
        const ang = p.angle + (i / p.aas.length) * Math.PI * 2;
        const dx2 = Math.cos(ang) * p.r * 0.62;
        const dy2 = Math.sin(ang) * p.r * 0.62;
        ctx.fillStyle = p.aas[i].color;
        ctx.beginPath(); ctx.arc(dx2, dy2, 5, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('Proteína', 0, -p.r - 4);
      ctx.restore();
    }

    // Free AAs
    for (const a of gs.freeAAs) {
      drawNode(ctx, a.x, a.y, a.def.r, a.def.color, a.def.code, a.def.r * 0.6);
    }

    // Enzymes
    for (const e of gs.enzymes) {
      ctx.save();
      ctx.translate(e.x, e.y);

      const eGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, e.def.r + 10);
      eGrad.addColorStop(0, e.def.color + '30');
      eGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = eGrad;
      ctx.beginPath(); ctx.arc(0, 0, e.def.r + 10, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = e.def.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(0, 0, e.def.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      ctx.rotate(e.angle);
      const c = e.def.r * 0.58;
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = e.def.color;
      ctx.beginPath(); ctx.moveTo(-c, -c); ctx.lineTo(c, c); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c, -c); ctx.lineTo(-c, c); ctx.stroke();
      ctx.fillStyle = e.def.color;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.fillStyle = e.def.color;
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(e.def.name, e.x, e.y + e.def.r + 5);
    }

    // Chain (peptide bonds)
    if (gs.chain.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(gs.px, gs.py);
      for (const node of gs.chain) ctx.lineTo(node.x, node.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      for (let i = 0; i < gs.chain.length; i++) {
        const node = gs.chain[i];
        const r = node.def.r * 0.82;
        drawNode(ctx, node.x, node.y, r, node.def.color, node.def.code, r * 0.58, 0.18, 1.5);
        ctx.fillStyle = '#334155';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(String(i + 1), node.x, node.y - r - 3);
      }
    }

    // Player
    {
      const { px, py, pr } = gs;
      const pGrad = ctx.createRadialGradient(px, py, 4, px, py, pr + 16);
      pGrad.addColorStop(0, gs.playerDef.color + 'cc');
      pGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = pGrad;
      ctx.beginPath(); ctx.arc(px, py, pr + 16, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = gs.playerDef.color + '44';
      ctx.strokeStyle = gs.playerDef.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(gs.playerDef.code, px, py);

      ctx.fillStyle = '#64748b';
      ctx.font = '7px monospace';
      ctx.fillText('N-term', px, py + pr + 10);
    }

    drawHUD(ctx, W, H, gs.score, gs.chain.length, gs.proteinCount, gs.complexCount, hsRef.current);
    if (gs.banner) drawBanner(ctx, W, H, gs.banner);

    ctx.restore();
  };

  // ── Setup ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    gsRef.current = makeGS(canvas.width, canvas.height);

    const onKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current === 'playing') gsRef.current?.keys.add(e.key);
      if ((e.key === 'r' || e.key === 'R') && phaseRef.current === 'dead') {
        setMyRank(null); setLastScore(null); setPhase('entry'); setAlive(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => gsRef.current?.keys.delete(e.key);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const tick = () => { loopRef.current(); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [makeGS]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', backgroundColor: '#0f172a', fontFamily: 'monospace' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid #475569', color: '#94a3b8', padding: '4px 12px', borderRadius: 6, fontFamily: 'monospace', fontSize: 13 }}>
          ← Voltar
        </button>
        <span style={{ color: '#c084fc', fontWeight: 700, fontFamily: 'monospace', fontSize: 15 }}>
          🧬 SMILESGame — Montagem de Proteínas
        </span>
        {phase === 'playing' && (
          <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto', fontFamily: 'monospace' }}>
            WASD/↑↓←→ · {CHAIN_FOR_PROTEIN} AAs=Proteína · {PROTEINS_FOR_COMPLEX} Prot=Complexo · R=Reiniciar
          </span>
        )}
        {phase !== 'playing' && (
          <span style={{ color: '#c084fc', fontSize: 11, marginLeft: 'auto', fontFamily: 'monospace' }}>
            {playerName ? `Jogador: ${playerName}` : ''}
          </span>
        )}
      </div>

      {/* Canvas + overlays */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {/* ── Name entry screen ── */}
        {phase === 'entry' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24, backgroundColor: 'rgba(10,17,30,0.92)', backdropFilter: 'blur(4px)' }}>
            {/* Left: controls */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, maxWidth: 340, width: '100%' }}>
              <div>
                <div style={{ color: '#c084fc', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', textAlign: 'center' }}>🧬 SMILESGame</div>
                <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 4, letterSpacing: '0.1em' }}>MONTAGEM DE PROTEÍNAS</div>
              </div>
              <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '16px 20px', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ color: '#64748b', fontSize: 10, marginBottom: 8, letterSpacing: '0.1em' }}>SEU NOME NO RANKING</div>
                <input
                  autoFocus
                  maxLength={24}
                  placeholder="Ex: CarlosS"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') startGame(nameInput); }}
                  style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 6, padding: '10px 12px', color: '#f1f5f9', fontFamily: 'monospace', fontSize: 15, outline: 'none' }}
                />
              </div>
              <button
                onClick={() => startGame(nameInput)}
                disabled={!nameInput.trim()}
                style={{ width: '100%', padding: '13px 0', borderRadius: 8, border: 'none', fontFamily: 'monospace', fontWeight: 700, fontSize: 16, cursor: nameInput.trim() ? 'pointer' : 'default', backgroundColor: nameInput.trim() ? '#c084fc' : '#334155', color: '#fff', transition: 'background-color 0.2s' }}
              >
                ▶ JOGAR
              </button>
              <div style={{ color: '#334155', fontSize: 10, textAlign: 'center', lineHeight: 1.7 }}>
                WASD / ↑↓←→ para mover · Colete aminoácidos · Fuja das enzimas e radicais
              </div>
            </div>

            {/* Right: leaderboard */}
            <LeaderboardPanel entries={leaderboard} highlightName={playerName} myRank={null} />
          </div>
        )}

        {/* ── Dead screen overlay ── */}
        {phase === 'dead' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24, pointerEvents: 'none' }}>
            {/* Leaderboard + result on the right */}
            <div style={{ pointerEvents: 'all', maxWidth: 320, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lastScore && (
                <div style={{ backgroundColor: 'rgba(15,23,42,0.94)', border: '1px solid #c084fc', borderRadius: 10, padding: '14px 18px' }}>
                  <div style={{ color: '#c084fc', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📊 Sua sessão — {playerName}</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[['Pontos', lastScore.score], ['Proteínas', lastScore.proteins], ['Complexos', lastScore.complexes]].map(([l, v]) => (
                      <div key={l as string} style={{ textAlign: 'center' }}>
                        <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 18 }}>{v}</div>
                        <div style={{ color: '#475569', fontSize: 9 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {submitting
                    ? <div style={{ color: '#64748b', fontSize: 10, marginTop: 8 }}>⟳ Enviando resultado…</div>
                    : myRank != null
                      ? <div style={{ color: myRank <= 3 ? '#fbbf24' : '#4ade80', fontSize: 11, marginTop: 8, fontWeight: 700 }}>
                          {myRank <= 3 ? '🏆' : '✓'} #{myRank} no ranking global
                        </div>
                      : null}
                </div>
              )}
              <LeaderboardPanel entries={leaderboard} highlightName={playerName} myRank={myRank} />
              <button
                onClick={restart}
                style={{ padding: '12px 0', borderRadius: 8, border: 'none', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, cursor: 'pointer', backgroundColor: '#c084fc', color: '#fff' }}
              >
                ↩ Jogar Novamente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AA reference */}
      {phase === 'playing' && <AAReference />}
    </div>
  );
}

// ─── Leaderboard panel ───────────────────────────────────────────────────────

interface LeaderboardPanelProps {
  entries: LeaderboardEntry[];
  highlightName: string;
  myRank: number | null;
}

function LeaderboardPanel({ entries, highlightName, myRank }: LeaderboardPanelProps) {
  return (
    <div style={{ backgroundColor: 'rgba(15,23,42,0.94)', border: '1px solid #334155', borderRadius: 10, padding: '14px 18px', minWidth: 260, maxWidth: 320, width: '100%' }}>
      <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        🏆 Ranking Global
        {myRank != null && (
          <span style={{ marginLeft: 'auto', backgroundColor: myRank <= 3 ? '#fbbf2422' : '#33415566', color: myRank <= 3 ? '#fbbf24' : '#94a3b8', borderRadius: 4, padding: '2px 7px', fontSize: 10 }}>
            seu rank #{myRank}
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <div style={{ color: '#334155', fontSize: 12, textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>
          Seja o primeiro!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {entries.map((e, i) => {
            const isMe = e.name.toLowerCase() === highlightName.toLowerCase() && highlightName.trim() !== '';
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, backgroundColor: isMe ? 'rgba(192,132,252,0.12)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', border: isMe ? '1px solid #c084fc44' : '1px solid transparent' }}>
                <span style={{ width: 22, textAlign: 'center', fontSize: 12, flexShrink: 0, color: i < 3 ? '#fbbf24' : '#475569' }}>{medal}</span>
                <span style={{ flex: 1, color: isMe ? '#c084fc' : '#cbd5e1', fontSize: 12, fontWeight: isMe ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>{e.score}</span>
                <span style={{ color: '#475569', fontSize: 9, whiteSpace: 'nowrap' }}>{e.proteins}p {e.complexes}c</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Reference panel ─────────────────────────────────────────────────────────

function AAReference() {
  return (
    <div style={{ backgroundColor: '#0f172a', borderTop: '1px solid #1e293b', padding: '6px 14px 8px', display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', flexShrink: 0 }}>
      <div>
        <div style={{ color: '#334155', fontSize: 9, fontFamily: 'monospace', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Aminoácidos — Coletar</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {AA_DEFS.map(aa => (
            <div key={aa.code} title={`${aa.full} (${aa.type})`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', border: `2px solid ${aa.color}`, backgroundColor: aa.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontFamily: 'monospace', fontWeight: 700 }}>
                {aa.code}
              </div>
              <div style={{ color: '#334155', fontSize: 7, fontFamily: 'monospace', textAlign: 'center' }}>{aa.type}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ color: '#334155', fontSize: 9, fontFamily: 'monospace', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Enzimas — Evitar ✂</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {ENZYME_DEFS.map(e => (
            <div key={e.name} title={`${e.name} — corta ${e.cutLength} AAs`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', border: `2px solid ${e.color}`, backgroundColor: e.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: e.color, fontSize: 18 }}>
                ✂
              </div>
              <div style={{ color: e.color, fontSize: 7, fontFamily: 'monospace', textAlign: 'center', maxWidth: 48 }}>{e.name}</div>
              <div style={{ color: '#334155', fontSize: 7, fontFamily: 'monospace' }}>−{e.cutLength} AAs</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', color: '#1e293b', fontSize: 8, fontFamily: 'monospace', textAlign: 'right', lineHeight: 1.6 }}>
        <div>{CHAIN_FOR_PROTEIN} aminoácidos → Proteína (+100 pts)</div>
        <div>{PROTEINS_FOR_COMPLEX} proteínas → Complexo Proteico (+500 pts × nível)</div>
      </div>
    </div>
  );
}
