import React from 'react';
import { colors } from '../styles/themes';

interface App {
  id: string;
  icon: string;
  title: string;
  tags: string[];
  color: string;
}

interface Props {
  apps: App[];
  onNavigate: (id: string) => void;
}

const DiscoverGrid: React.FC<Props> = ({ apps, onNavigate }) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '24px',
      padding: '24px 0 60px',
      maxWidth: '96%',
      margin: '0 auto',
    }}>
      {apps.map(app => (
        <div
          key={app.id}
          className="appstore-card"
          onClick={() => onNavigate(app.id)}
          style={{
            backgroundColor: '#fff',
            borderRadius: '24px',
            padding: '24px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
            transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex',
            gap: '18px',
            border: '1px solid #f1f5f9',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = 'translateY(-8px) scale(1.02)';
            el.style.boxShadow = '0 25px 50px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = 'translateY(0) scale(1)';
            el.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
          }}
        >
          {/* iOS Style Squircle Icon with Molecule Interaction */}
          <div className="icon-squircle" style={{
            width: '76px', height: '76px',
            borderRadius: '17px',
            backgroundColor: app.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: `0 8px 16px ${app.color}33`,
            transition: 'transform 0.3s ease',
          }}>
            <i className={`bi ${app.icon}`} style={{ 
              fontSize: '34px', color: '#fff',
              transition: 'all 0.4s ease' 
            }}></i>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: colors.text, margin: '0 0 4px' }}>
              {app.title}
            </h3>
            <span style={{ fontSize: '12px', color: colors.textMuted, fontWeight: 500, marginBottom: '16px', display: 'block' }}>
              {app.tags[0]} &middot; AI Intelligence
            </span>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
              <button className="get-btn" style={{
                backgroundColor: '#f1f2f6',
                color: colors.blue,
                fontWeight: 800,
                fontSize: '13px',
                padding: '6px 22px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                OPEN
              </button>
              <div style={{ display: 'flex', gap: '3px' }}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: colors.border }}></div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: colors.border }}></div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: colors.border }}></div>
              </div>
            </div>
          </div>

          <style>{`
            .appstore-card:hover .icon-squircle i {
              transform: scale(1.1) rotate(-8deg);
              filter: drop-shadow(0 0 8px rgba(255,255,255,0.4));
            }
            .appstore-card:active .get-btn {
              transform: scale(0.92);
              background-color: #e2e8f0;
            }
            .get-btn:hover {
              background-color: #eaebf0;
              opacity: 0.9;
            }
          `}</style>
        </div>
      ))}
    </div>
  );
};

export default DiscoverGrid;
