import React from 'react';
import PageShell from '../components/PageShell';
import PredictWithStopTox from '../forms/PredictWithStopTox';
import { colors } from '../styles/themes';

function PredictPage({ onBack, initialSmiles }: { onBack: () => void; initialSmiles?: string }) {
  return (
    <PageShell
      icon="bi-activity"
      title="ADMET Profiling"
      subtitle="Multi-tool prediction: StopTox · SwissADME · StopLight · pkCSM · ADMETlab 3.0"
      accentColor={colors.teal}
      onBack={onBack}
    >
      <PredictWithStopTox initialSmiles={initialSmiles} />
    </PageShell>
  );
}

export default PredictPage;
