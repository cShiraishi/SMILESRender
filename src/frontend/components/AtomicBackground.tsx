import React from 'react';
import { colors } from '../styles/themes';

const AtomicBackground: React.FC = () => {
  // Diverse molecular shapes: Hexagon, Pentagon, Double Ring
  const shapes = [
    // Hexagon (Benzene style)
    <svg width="48" height="48" viewBox="0 0 48 48" stroke={colors.blue} strokeWidth="1" fill="none">
      <path d="M24 6 L40 15 L40 33 L24 42 L8 33 L8 15 Z" />
      <circle cx="24" cy="6" r="2.5" fill={colors.blue} />
      <circle cx="40" cy="15" r="2.5" fill={colors.blue} />
      <circle cx="24" cy="24" r="1.5" fill={`${colors.blue}33`} />
    </svg>,
    // Pentagon (Furan/Pyrrole style)
    <svg width="48" height="48" viewBox="0 0 48 48" stroke={colors.blue} strokeWidth="1" fill="none">
      <path d="M24 6 L41 19 L34 40 L14 40 L7 19 Z" />
      <circle cx="24" cy="6" r="2" fill={colors.blue} />
      <circle cx="24" cy="25" r="1.2" fill={colors.blue} />
    </svg>,
    // Double Ring (Naphthalene style)
    <svg width="60" height="48" viewBox="0 0 60 48" stroke={colors.blue} strokeWidth="1" fill="none">
      <path d="M15 10 L30 5 L45 10 L45 30 L30 35 L15 30 Z M30 5 L30 35" />
      <circle cx="30" cy="5" r="2" fill={colors.blue} />
      <circle cx="15" cy="10" r="2" fill={colors.blue} />
    </svg>
  ];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      zIndex: -1, overflow: 'hidden', pointerEvents: 'none', backgroundColor: '#f8fafc'
    }}>
      {/* Soft Moving Ambient Glows (Apple Signature) */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-5%', width: '60vw', height: '60vw',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, rgba(255, 255, 255, 0) 70%)',
        animation: 'floatGlow 15s ease-in-out infinite alternate'
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-10%', width: '50vw', height: '50vw',
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, rgba(255, 255, 255, 0) 70%)',
        animation: 'floatGlow 20s ease-in-out infinite alternate-reverse'
      }} />

      {/* Randomized Molecular Particles */}
      {[...Array(18)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: `${Math.random() * 100}%`,
          left: `${Math.random() * 100}%`,
          opacity: 0.07,
          pointerEvents: 'none',
          transform: `scale(${0.5 + Math.random()}) rotate(${Math.random() * 360}deg)`,
          animation: `slowFloat ${20 + Math.random() * 30}s linear infinite`,
          animationDelay: `-${Math.random() * 20}s`
        }}>
          {shapes[i % shapes.length]}
        </div>
      ))}

      <style>{`
        @keyframes floatGlow {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(40px, 50px) scale(1.1); }
        }
        @keyframes slowFloat {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(30px, -30px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AtomicBackground;
