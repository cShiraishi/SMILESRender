import React, { useEffect, useRef, useState } from 'react';
import { colors } from '../styles/themes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (smiles: string) => void;
  initialSmiles?: string;
}

declare global {
  interface Window {
    jsmeApplet: any;
    JSApplet: any;
  }
}

const MoleculeDrawerModal: React.FC<Props> = ({ isOpen, onClose, onApply, initialSmiles }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const appletRef = useRef<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const initEditor = () => {
      if (window.JSApplet) {
        setIsInitializing(true);
        // JSME requires a bit of time to ensure the DOM is ready if it just opened
        setTimeout(() => {
          try {
            // Options: "smiles" enables smiles export, "nocontrols" removes the menu if desired
            appletRef.current = new window.JSApplet.JSME("jsme_editor", "600px", "450px", {
              "options": "oldlook,toggle"
            });
            
            if (initialSmiles) {
              appletRef.current.readGenericMolecularInput(initialSmiles);
            }
            setIsInitializing(false);
          } catch (err) {
            console.error("JSME Initialization Error:", err);
          }
        }, 300);
      } else {
        // Retry if script not loaded yet
        setTimeout(initEditor, 500);
      }
    };

    initEditor();

    return () => {
      appletRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (appletRef.current) {
      const smiles = appletRef.current.smiles();
      if (smiles) {
        onApply(smiles);
        onClose();
      } else {
        alert("Please draw a molecule first.");
      }
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', animation: 'fadeIn 0.3s ease'
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      
      <div style={{
        backgroundColor: '#fff', borderRadius: '24px', width: '100%', maxWidth: '700px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.2)', overflow: 'hidden',
        animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ 
          padding: '20px 24px', borderBottom: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: colors.navy }}>Molecular Sketcher</h2>
            <p style={{ fontSize: '13px', color: colors.textMuted }}>Draw your structure to generate SMILES</p>
          </div>
          <button onClick={onClose} style={{ 
            background: `${colors.blue}10`, border: 'none', color: colors.blue,
            width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* Content */}
        <div style={{ 
          padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center',
          backgroundColor: '#f8fafc', minHeight: '500px'
        }}>
          {isInitializing && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: colors.blue }}>
              <i className="bi bi-arrow-repeat spin" style={{ fontSize: '32px' }}></i>
              <style>{` .spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } } `}</style>
            </div>
          )}
          <div id="jsme_editor" ref={editorRef} style={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${colors.border}` }} />
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '20px 24px', borderTop: `1px solid ${colors.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: '12px'
        }}>
          <button 
            onClick={onClose}
            style={{ 
              padding: '10px 20px', borderRadius: '12px', border: `1px solid ${colors.border}`,
              backgroundColor: '#fff', color: colors.text, cursor: 'pointer', fontWeight: 600
            }}
          >
            Cancel
          </button>
          <button 
            onClick={handleApply}
            style={{ 
              padding: '10px 24px', borderRadius: '12px', border: 'none',
              backgroundColor: colors.blue, color: '#fff', cursor: 'pointer', fontWeight: 700,
              boxShadow: `0 4px 12px ${colors.blue}40`
            }}
          >
            Apply Structure
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoleculeDrawerModal;
