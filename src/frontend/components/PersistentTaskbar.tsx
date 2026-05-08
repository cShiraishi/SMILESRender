import React, { useState } from 'react';
import { colors } from '../styles/themes';

interface TaskbarApp {
  id: string;
  icon: string;
  label: string;
  color: string;
}

interface Props {
  apps: TaskbarApp[];
  activePage: string;
  onNavigate: (id: string) => void;
  onHome: () => void;
}

const PersistentTaskbar: React.FC<Props> = ({ apps, activePage, onNavigate, onHome }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);

  const getScale = (id: string) => {
    if (pressedId === id) return 'scale(0.88)';
    if (hoveredId === id) return 'scale(1.18)';
    return 'scale(1)';
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 500,
      display: 'flex',
      justifyContent: 'center',
      padding: '8px 16px max(12px, env(safe-area-inset-bottom))',
      backgroundColor: 'rgba(248, 250, 252, 0.88)',
      backdropFilter: 'blur(24px) saturate(200%)',
      WebkitBackdropFilter: 'blur(24px) saturate(200%)',
      borderTop: '1px solid rgba(0,0,0,0.07)',
      boxShadow: '0 -4px 32px rgba(0,0,0,0.07)',
      animation: 'taskbarSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>

        {/* Home button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onHome}
            onMouseEnter={() => setHoveredId('home')}
            onMouseLeave={() => { setHoveredId(null); setPressedId(null); }}
            onPointerDown={() => setPressedId('home')}
            onPointerUp={() => setPressedId(null)}
            style={{
              width: '44px', height: '44px',
              borderRadius: '10px',
              border: 'none',
              background: hoveredId === 'home' ? 'rgba(0,0,0,0.09)' : 'rgba(0,0,0,0.04)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: hoveredId === 'home' ? colors.text : colors.textMuted,
              transform: getScale('home'),
              transition: 'transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease, color 0.15s ease',
              marginRight: '6px',
              flexShrink: 0,
              outline: 'none',
            }}
          >
            <i className="bi bi-grid-fill" style={{ fontSize: '17px' }} />
          </button>
          {hoveredId === 'home' && (
            <Tooltip label="All Tools" color={colors.text} />
          )}
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '26px', background: colors.border, margin: '0 6px', flexShrink: 0 }} />

        {/* App icons */}
        {apps.map(app => {
          const isActive = activePage === app.id;
          return (
            <div
              key={app.id}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
            >
              <button
                onClick={() => !isActive && onNavigate(app.id)}
                onMouseEnter={() => setHoveredId(app.id)}
                onMouseLeave={() => { setHoveredId(null); setPressedId(null); }}
                onPointerDown={() => !isActive && setPressedId(app.id)}
                onPointerUp={() => setPressedId(null)}
                style={{
                  width: '44px', height: '44px',
                  borderRadius: '11px',
                  border: 'none',
                  background: isActive
                    ? `${app.color}22`
                    : hoveredId === app.id
                    ? 'rgba(0,0,0,0.07)'
                    : 'transparent',
                  cursor: isActive ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: getScale(app.id),
                  transition: 'transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease',
                  flexShrink: 0,
                  outline: 'none',
                  boxShadow: isActive ? `0 0 0 1.5px ${app.color}55` : 'none',
                }}
              >
                <i
                  className={`bi ${app.icon}`}
                  style={{
                    fontSize: '18px',
                    color: isActive ? app.color : hoveredId === app.id ? colors.text : colors.textMuted,
                    transition: 'color 0.15s ease',
                  }}
                />
              </button>

              {/* Active dot */}
              <div style={{
                width: isActive ? '16px' : '4px',
                height: '3px',
                borderRadius: '2px',
                backgroundColor: isActive ? app.color : 'transparent',
                transition: 'width 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease',
              }} />

              {/* Tooltip */}
              {hoveredId === app.id && (
                <Tooltip label={app.label} color={app.color} />
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes taskbarSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes tooltipFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);   }
        }
      `}</style>
    </div>
  );
};

function Tooltip({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(100% + 10px)',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(20, 20, 20, 0.88)',
      backdropFilter: 'blur(8px)',
      color: '#fff',
      fontSize: '11px',
      fontWeight: 600,
      padding: '5px 11px',
      borderRadius: '9px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 600,
      borderBottom: `2px solid ${color}`,
      animation: 'tooltipFadeIn 0.15s ease both',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    }}>
      {label}
    </div>
  );
}

export default PersistentTaskbar;
