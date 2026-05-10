import React from 'react';
import PageShell from '../components/PageShell';
import PredictWithStopTox from '../forms/PredictWithStopTox';
import { colors } from '../styles/themes';

function PredictPage({ onBack, initialSmiles, onSmilesChange }: { onBack: () => void; initialSmiles?: string; onSmilesChange?: (s: string) => void }) {
  return (
    <PageShell
      icon="bi-activity"
      title="ADMET Profiling Lab"
      subtitle="Multi-tool prediction: StopTox · StopLight · ADMETlab 3.0 · RDKit"
      accentColor={colors.teal}
      onBack={onBack}
    >
      <PredictWithStopTox initialSmiles={initialSmiles} onSmilesChange={onSmilesChange} />
    </PageShell>
  );
}

export default PredictPage;
