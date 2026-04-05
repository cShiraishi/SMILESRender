import React, { useRef, useEffect } from 'react';
import { colors, shadow } from '../styles/themes';

interface DockApp {
  id: string;
  icon: string;
  label: string;
  color: string;
}

interface Props {
  apps: DockApp[];
  onNavigate: (id: string) => void;
  accentColor?: string;
}

const AppleDock: React.FC<Props> = ({ apps, onNavigate, accentColor = colors.blue }) => {
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;

    const items = dock.querySelectorAll('.dock-item') as NodeListOf<HTMLElement>;
    const baseSize = 48;
    const maxScale = 1.6;
    const range = 200;

    const handleMouseMove = (e: MouseEvent) => {
      const mouseX = e.clientX;
      items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const dist = Math.abs(mouseX - centerX);

        if (dist < range) {
          const scale = maxScale - (dist / range) * (maxScale - 1);
          const size = baseSize * scale;
          item.style.width = `${size}px`;
          item.style.height = `${size}px`;
          item.style.marginTop = `${-(size - baseSize)}px`;
        } else {
          item.style.width = `${baseSize}px`;
          item.style.height = `${baseSize}px`;
          item.style.marginTop = '0px';
        }
      });
    };

    const handleMouseLeave = () => {
      items.forEach(item => {
        item.style.width = `${baseSize}px`;
        item.style.height = `${baseSize}px`;
        item.style.marginTop = '0px';
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    dock.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      dock.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
      <div 
        ref={dockRef}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          padding: '10px 18px',
          borderRadius: '24px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          boxShadow: '0 15px 35px rgba(0,0,0,0.06)',
          height: '68px',
        }}
      >
        {apps.map(app => (
          <div
            key={app.id}
            className="dock-icon-wrapper"
            onClick={() => onNavigate(app.id)}
            style={{ position: 'relative', cursor: 'pointer' }}
          >
            <div className="dock-item" style={{
              width: '48px', height: '48px',
              backgroundColor: app.color,
              borderRadius: '13px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 8px 16px ${app.color}44`,
              transition: 'margin 0.1s ease-out, width 0.1s ease-out, height 0.1s ease-out',
              transformOrigin: 'bottom center',
              overflow: 'hidden'
            }}>
              <i className={`bi ${app.icon}`} style={{ fontSize: '20px', color: '#fff' }}></i>
            </div>
            
            {/* Glossy Apple-style Label (Tooltip) */}
            <div className="dock-tooltip" style={{
              position: 'absolute', bottom: '-40px', left: '50%',
              transform: 'translateX(-50%) translateY(-10px)',
              backgroundColor: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(8px)',
              padding: '4px 12px', borderRadius: '10px',
              fontSize: '11px', fontWeight: 600, color: colors.text,
              whiteSpace: 'nowrap', opacity: 0, transition: 'all 0.2s ease',
              zIndex: 100, border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: shadow.sm, pointerEvents: 'none'
            }}>
              {app.label}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .dock-icon-wrapper:hover .dock-tooltip {
          opacity: 1 !important;
          transform: translateX(-50%) translateY(0) !important;
        }
      `}</style>
    </div>
  );
};

export default AppleDock;
