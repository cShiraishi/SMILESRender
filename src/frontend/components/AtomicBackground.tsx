import React, { useEffect, useRef } from 'react';

interface Node {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  label: string;
  color: string;
}

const ATOM_DEFS = [
  { label: 'C', color: '#3b82f6' },
  { label: 'N', color: '#8b5cf6' },
  { label: 'O', color: '#ef4444' },
  { label: 'H', color: '#94a3b8' },
  { label: 'S', color: '#f59e0b' },
];

const CONNECT_DIST = 200;
const REPEL_DIST   = 130;
const SPEED        = 0.35;

function makeNodes(w: number, h: number, count: number): Node[] {
  return Array.from({ length: count }, (_, i) => {
    const def = ATOM_DEFS[i % ATOM_DEFS.length];
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * SPEED * (0.5 + Math.random()),
      vy: Math.sin(angle) * SPEED * (0.5 + Math.random()),
      r: def.label === 'H' ? 5 : def.label === 'C' ? 8 : 6.5,
      label: def.label,
      color: def.color,
    };
  });
}

const AtomicBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef  = useRef({ x: -9999, y: -9999 });
  const nodesRef  = useRef<Node[]>([]);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const isMobile = window.innerWidth < 768;
    const COUNT = isMobile ? 9 : 20;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (nodesRef.current.length === 0)
        nodesRef.current = makeNodes(canvas.width, canvas.height, COUNT);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('mouseleave', onLeave);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      const nodes = nodesRef.current;
      const mouse = mouseRef.current;

      ctx.clearRect(0, 0, W, H);

      // Update positions
      for (const n of nodes) {
        // Mouse repulsion
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPEL_DIST && dist > 0) {
          const force = (REPEL_DIST - dist) / REPEL_DIST * 0.12;
          n.vx += (dx / dist) * force;
          n.vy += (dy / dist) * force;
        }

        // Speed cap
        const spd = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (spd > 0.9) { n.vx *= 0.9 / spd; n.vy *= 0.9 / spd; }
        if (spd < 0.15) { n.vx *= 1.05; n.vy *= 1.05; }

        n.x += n.vx;
        n.y += n.vy;

        // Soft wrap
        if (n.x < -20) n.x = W + 20;
        if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20;
        if (n.y > H + 20) n.y = -20;
      }

      // Draw bonds
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECT_DIST) {
            const alpha = (1 - d / CONNECT_DIST) * 0.38;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(80, 120, 210, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      // Draw atoms
      for (const n of nodes) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        const nearMouse = Math.sqrt(dx * dx + dy * dy) < REPEL_DIST;
        const alpha = nearMouse ? 0.75 : 0.45;

        // Glow (always visible, stronger near mouse)
        const glowR = nearMouse ? n.r * 5 : n.r * 3;
        const glowA = nearMouse ? '66' : '28';
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
        g.addColorStop(0, n.color + glowA);
        g.addColorStop(1, n.color + '00');
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // Circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();

        // Ring border
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.strokeStyle = n.color + (nearMouse ? 'cc' : '66');
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Label
        if (n.r > 5) {
          ctx.font = `bold ${n.r * 1.7}px monospace`;
          ctx.fillStyle = n.color + (nearMouse ? 'ff' : 'aa');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.label, n.x, n.y + n.r * 2.4);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <>
      {/* Static gradient glows */}
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        zIndex: -2, pointerEvents: 'none', backgroundColor: '#f8fafc',
      }} />
      <div style={{
        position: 'fixed', top: '-10%', right: '-5%', width: '60vw', height: '60vw',
        background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)',
        zIndex: -2, pointerEvents: 'none',
        animation: 'floatGlow 18s ease-in-out infinite alternate',
      }} />
      <div style={{
        position: 'fixed', bottom: '-15%', left: '-10%', width: '50vw', height: '50vw',
        background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
        zIndex: -2, pointerEvents: 'none',
        animation: 'floatGlow 24s ease-in-out infinite alternate-reverse',
      }} />

      {/* Interactive canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', top: 0, left: 0, zIndex: -1, pointerEvents: 'none' }}
      />

      <style>{`
        @keyframes floatGlow {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(40px, 50px) scale(1.1); }
        }
      `}</style>
    </>
  );
};

export default AtomicBackground;
