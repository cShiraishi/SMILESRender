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
            el.style.transform = 'translateY(-12px) scale(1.03)';
            el.style.boxShadow = `0 30px 60px rgba(0,0,0,0.12), 0 0 20px ${app.color}22`;
            el.style.borderColor = app.color;
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = 'translateY(0) scale(1)';
            el.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
            el.style.borderColor = '#f1f5f9';
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
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>
              {app.title}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '16px', display: 'block' }}>
              {app.tags[0]} &middot; Professional Tool
            </span>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
              <button className="get-btn" style={{
                backgroundColor: '#f1f5f9',
                color: app.color,
                fontWeight: 800,
                fontSize: '13px',
                padding: '8px 24px',
                borderRadius: '20px',
                border: 'none',
                cursor: 'inherit',
                transition: 'all 0.2s ease',
              }}>
                GET
              </button>
              <div style={{ display: 'flex', gap: '3px' }}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: colors.border }}></div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: colors.border }}></div>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: colors.border }}></div>
              </div>
            </div>
          </div>

          <style>{`
            .appstore-card {
              /* Molecule Cursor (Base64 SVG) */
              cursor: url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzIiBzdHJva2U9IiMxYTNhNWMiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjE5IiBjeT0iNSIgcj0iMiIgc3Ryb2tlPSIjMGQ5NDg4IiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1IiBjeT0iMTkiIHI9IjIiIHN0cm9rZT0iIzBkOTQ4OCIgc3Ryb2tlLXdpZHRoPSIyIi8+PGNpcmNsZSBjeD0iMTkiIGN5PSIxOSIgcj0iMiIgc3Ryb2tlPSIjYjQ1MzA5IiBzdHJva2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSI1IiBjeT0iNSIgcj0iMiIgc3Ryb2tlPSIjYjQ1MzA5IiBzdHJva2Utd2lkdGg9IjIiLz48bGluZSB4MT0iNyIgeTE9IjciIHgyPSIxMCIgeTI9IjEwIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMSIvPjxsaW5lIHgxPSIxNyIgeTE9IjE3IiB4Mj0iMTQiIHkyPSIxNCIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEiLz48bGluZSB4MT0iMTciIHkxPSI3IiB4Mj0iMTQiIHkyPSIxMCIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEiLz48bGluZSB4MT0iNyIgeTE9IjE3IiB4Mj0iMTAiIHkyPSIxNCIgc3Ryb2tlPSIjOTRhM2I4IiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4="KSAxNiAxNiwgYXV0bzsg
            }
            .appstore-card:hover .icon-squircle i {
              transform: scale(1.1) rotate(-8deg);
              filter: drop-shadow(0 0 8px rgba(255,255,255,0.4));
            }
            .appstore-card:active .get-btn {
              transform: scale(0.92);
              background-color: #e2e8f0;
            }
            .get-btn:hover {
              background-color: #fff;
              box-shadow: 0 4px 10px rgba(0,0,0,0.1);
              transform: scale(1.05);
            }
          `}</style>
        </div>
      ))}
    </div>
  );
};

export default DiscoverGrid;
