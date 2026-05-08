import React from 'react';
import PageShell from '../components/PageShell';
import DirectInput from '../forms/DirectInput';
import { colors } from '../styles/themes';

function RendererPage({ onBack, initialSmiles, onNavigate, onSmilesChange }: { onBack: () => void; initialSmiles?: string; onNavigate?: (page: string, smiles?: string) => void; onSmilesChange?: (s: string) => void }) {
  return (
    <PageShell
      icon="bi-diagram-2"
      title="Structure Rendering"
      subtitle="Generate 2D molecular structure images from SMILES"
      accentColor={colors.blue}
      onBack={onBack}
    >
      <>
        <DirectInput initialSmiles={initialSmiles} onNavigate={onNavigate} onSmilesChange={onSmilesChange} />
      </>
    </PageShell>
  );
}

export default RendererPage;
