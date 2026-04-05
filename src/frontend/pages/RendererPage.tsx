import React from 'react';
import PageShell from '../components/PageShell';
import DirectInput from '../forms/DirectInput';
import ConvertFromCsv from '../forms/ConvertFromCsv';
import { colors } from '../styles/themes';

function RendererPage({ onBack, initialSmiles }: { onBack: () => void; initialSmiles?: string }) {
  return (
    <PageShell
      icon="bi-diagram-2"
      title="Structure Rendering"
      subtitle="Generate 2D molecular structure images from SMILES"
      accentColor={colors.blue}
      onBack={onBack}
    >
      <>
        <DirectInput initialSmiles={initialSmiles} />
        <ConvertFromCsv />
      </>
    </PageShell>
  );
}

export default RendererPage;
