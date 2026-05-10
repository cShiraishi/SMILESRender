import React from 'react';
import MolImage from './MolImage';
import BodyMapDecision from './BodyMapDecision';

interface DashboardProps {
  allResults: any[];
  uniqueSmiles: string[];
  moleculeNames?: Record<string, string>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function deepProb(results: any[], smiles: string, prop: string): number | null {
  const r = results.find(x => x.SMILES === smiles && x.Tool === 'Chemprop (D-MPNN)' && x.Property === prop);
  return r != null ? parseFloat(r.Probability) : null;
}

function deepVal(results: any[], smiles: string, prop: string): number | null {
  const r = results.find(x => x.SMILES === smiles && x.Tool === 'Chemprop (D-MPNN)' && x.Property === prop);
  return r != null ? parseFloat(r.Value) : null;
}

function rdkitVal(results: any[], smiles: string, prop: string): string | null {
  const r = results.find(x => x.SMILES === smiles && String(x.Tool).includes('RDKit') && x.Property === prop);
  return r ? String(r.Value) : null;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// ── sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: '12px', padding: '18px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
      borderLeft: accent ? `5px solid ${accent}` : undefined,
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px',
    }}>
      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
        {value}<span style={{ fontSize: '13px', fontWeight: 500, color: '#64748b', marginLeft: '3px' }}>{unit}</span>
      </div>
    </div>
  );
}

function RiskDot({ prob, threshold = 0.4 }: { prob: number | null; threshold?: number }) {
  if (prob == null) return <span style={{ color: '#cbd5e1', fontSize: '18px' }}>·</span>;
  const color = prob >= 0.6 ? '#ef4444' : prob >= threshold ? '#f59e0b' : '#22c55e';
  const label = prob >= 0.6 ? 'High' : prob >= threshold ? 'Med' : 'Low';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: color }} title={`${(prob * 100).toFixed(0)}%`} />
      <span style={{ fontSize: '9px', color, fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function CypDot({ prob }: { prob: number | null }) {
  if (prob == null) return <span style={{ color: '#e2e8f0' }}>—</span>;
  const bg    = prob >= 0.5 ? '#fef2f2' : prob >= 0.25 ? '#fffbeb' : '#f0fdf4';
  const color = prob >= 0.5 ? '#dc2626' : prob >= 0.25 ? '#d97706' : '#16a34a';
  return (
    <div style={{ padding: '3px 6px', borderRadius: '4px', backgroundColor: bg, color, fontSize: '10px', fontWeight: 700, minWidth: '34px', textAlign: 'center' }}>
      {(prob * 100).toFixed(0)}%
    </div>
  );
}

function MiniBar({ value, max = 1, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ flex: 1, height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ── types for Decision Maker ──────────────────────────────────────────────────
type Tier  = 'P1' | 'P2' | 'P3' | 'DISCARD';
type Route = 'oral' | 'injectable' | 'inhalation';

const TIER_CFG: Record<Tier, { short: string; label: string; color: string; bg: string; border: string }> = {
  P1:      { short: 'P1', label: 'Lead Candidate', color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  P2:      { short: 'P2', label: 'Monitorar',      color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
  P3:      { short: 'P3', label: 'Alto Risco',     color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  DISCARD: { short: '✕',  label: 'Descartar',      color: '#7f1d1d', bg: '#fee2e2', border: '#ef4444' },
};

const ROUTE_CFG: Record<Route, { label: string; icon: string; color: string }> = {
  oral:       { label: 'Oral',       icon: 'bi-capsule',      color: '#0ea5e9' },
  injectable: { label: 'Injetável',  icon: 'bi-droplet-half', color: '#8b5cf6' },
  inhalation: { label: 'Inalatória', icon: 'bi-wind',         color: '#10b981' },
};

const TIER_ORDER: Record<Tier, number> = { P1: 0, P2: 1, P3: 2, DISCARD: 3 };

// ── main ──────────────────────────────────────────────────────────────────────

function Dashboard({ allResults = [], uniqueSmiles = [], moleculeNames = {} }: DashboardProps) {
  if (!allResults.length || !uniqueSmiles.length) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '15px', marginBottom: '30px', textAlign: 'center', color: '#64748b' }}>
        Gerando dashboard estatístico...
      </div>
    );
  }

  const n = uniqueSmiles.length;

  // ── RDKit aggregates ────────────────────────────────────────────────────────
  const rdkit       = allResults.filter(r => r && String(r.Tool).includes('RDKit'));
  const mwVals      = rdkit.filter(r => r.Property === 'MW').map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
  const logPVals    = rdkit.filter(r => r.Property === 'LogP').map(r => parseFloat(r.Value)).filter(v => !isNaN(v));
  const lipinskiItems = rdkit.filter(r => r.Property === 'Lipinski Ro5');
  const lipinskiRate  = lipinskiItems.length ? (lipinskiItems.filter(r => String(r.Value).toUpperCase() === 'PASS').length / lipinskiItems.length) * 100 : 0;
  const esolClasses   = rdkit.filter(r => r.Property === 'Class');
  const solDist: Record<string, number> = esolClasses.reduce((acc: any, r) => { if (r.Value) acc[r.Value] = (acc[r.Value] || 0) + 1; return acc; }, {});

  const painsHits = uniqueSmiles.filter(smi => rdkitVal(allResults, smi, 'PAINS Alerts') !== 'PASS' && rdkitVal(allResults, smi, 'PAINS Alerts') !== null).length;
  const brenkHits = uniqueSmiles.filter(smi => rdkitVal(allResults, smi, 'BRENK Alerts') !== 'PASS' && rdkitVal(allResults, smi, 'BRENK Alerts') !== null).length;

  // ── Deep ADMET aggregates ───────────────────────────────────────────────────
  const deepData  = allResults.filter(r => r && r.Tool === 'Chemprop (D-MPNN)');
  const hasDeep   = deepData.length > 0;
  const qedVals   = uniqueSmiles.map(s => deepVal(allResults, s, 'QED')).filter(v => v != null) as number[];
  const bioaVals  = uniqueSmiles.map(s => deepProb(allResults, s, 'Bioavailability_Ma')).filter(v => v != null) as number[];
  const avgQED    = avg(qedVals);
  const avgBioav  = avg(bioaVals);
  const hergHigh  = uniqueSmiles.filter(s => { const p = deepProb(allResults, s, 'hERG'); return p != null && p >= 0.4; }).length;
  const diliHigh  = uniqueSmiles.filter(s => { const p = deepProb(allResults, s, 'DILI'); return p != null && p >= 0.5; }).length;
  const bbbPlus   = uniqueSmiles.filter(s => { const p = deepProb(allResults, s, 'BBB_Martins'); return p != null && p >= 0.5; }).length;

  // ── StopTox ─────────────────────────────────────────────────────────────────
  const toxResults  = allResults.filter(r => r && r.Tool === 'StopTox');
  const highRiskTox = toxResults.filter(r => r.Unit === 'HIGH RISK').length;
  const toxRiskRate = toxResults.length ? (highRiskTox / toxResults.length) * 100 : 0;

  // ── CYP isoforms ────────────────────────────────────────────────────────────
  const CYP_ISOFORMS = ['CYP1A2_Veith', 'CYP2C9_Veith', 'CYP2C19_Veith', 'CYP2D6_Veith', 'CYP3A4_Veith'];
  const CYP_LABELS   = ['CYP1A2', 'CYP2C9', 'CYP2C19', 'CYP2D6', 'CYP3A4'];

  // ── Per-molecule risk score ─────────────────────────────────────────────────
  function molRiskScore(smi: string): number {
    let score = 0, count = 0;
    const herg = deepProb(allResults, smi, 'hERG'); if (herg != null) { score += herg; count++; }
    const dili = deepProb(allResults, smi, 'DILI'); if (dili != null) { score += dili; count++; }
    const clin = deepProb(allResults, smi, 'ClinTox'); if (clin != null) { score += clin; count++; }
    const tox  = toxResults.filter(r => r.SMILES === smi && r.Unit === 'HIGH RISK').length > 0 ? 0.8 : 0;
    score += tox; count++;
    return count ? score / count : 0;
  }

  function shortSmi(smi: string): string {
    return smi.length > 22 ? smi.slice(0, 20) + '…' : smi;
  }

  // ── Decision Maker ────────────────────────────────────────────────────────
  function calcDecision(smi: string): { tier: Tier; routes: Route[]; flags: { text: string; severe: boolean }[]; pass: string[] } {
    const flags: { text: string; severe: boolean }[] = [];
    const pass: string[] = [];
    let critTox = 0, modTox = 0, absIssues = 0;

    const herg     = deepProb(allResults, smi, 'hERG');
    const dili     = deepProb(allResults, smi, 'DILI');
    const clintox  = deepProb(allResults, smi, 'ClinTox');
    const ames     = deepProb(allResults, smi, 'AMES');
    const bioav    = deepProb(allResults, smi, 'Bioavailability_Ma');
    const pgp      = deepProb(allResults, smi, 'Pgp_Broccatelli');
    const qed      = deepVal(allResults, smi, 'QED');
    const lipinski = rdkitVal(allResults, smi, 'Lipinski Ro5');
    const pains    = rdkitVal(allResults, smi, 'PAINS Alerts');
    const brenk    = rdkitVal(allResults, smi, 'BRENK Alerts');
    const solClass = rdkitVal(allResults, smi, 'Class');
    const mwStr    = rdkitVal(allResults, smi, 'MW');
    const logPStr  = rdkitVal(allResults, smi, 'LogP');
    const mw       = mwStr   ? parseFloat(mwStr)   : null;
    const logP     = logPStr ? parseFloat(logPStr)  : null;
    const toxHighN = toxResults.filter(r => r.SMILES === smi && r.Unit === 'HIGH RISK').length;

    // Toxicity scoring
    if (herg != null) {
      if (herg >= 0.65)      { flags.push({ text: `hERG ${(herg*100).toFixed(0)}%`, severe: true  }); critTox++; }
      else if (herg >= 0.40) { flags.push({ text: `hERG ${(herg*100).toFixed(0)}%`, severe: false }); modTox++;  }
      else pass.push('hERG seguro');
    }
    if (dili != null) {
      if (dili >= 0.65)      { flags.push({ text: `DILI ${(dili*100).toFixed(0)}%`, severe: true  }); critTox++; }
      else if (dili >= 0.45) { flags.push({ text: `DILI ${(dili*100).toFixed(0)}%`, severe: false }); modTox++;  }
      else pass.push('DILI seguro');
    }
    if (clintox != null) {
      if (clintox >= 0.55)    { flags.push({ text: `ClinTox ${(clintox*100).toFixed(0)}%`, severe: true  }); critTox++; }
      else if (clintox >= 0.35) { flags.push({ text: `ClinTox ${(clintox*100).toFixed(0)}%`, severe: false }); modTox++; }
    }
    if (ames != null && ames >= 0.5) { flags.push({ text: `Mutagênico ${(ames*100).toFixed(0)}%`, severe: true }); critTox++; }
    if (pains && pains !== 'PASS')   { flags.push({ text: 'PAINS alerta', severe: false }); modTox++; }
    if (brenk && brenk !== 'PASS')   { flags.push({ text: 'BRENK alerta', severe: false }); modTox++; }
    if (toxHighN > 0) { flags.push({ text: 'StopTox ALTO RISCO', severe: critTox > 0 }); if (critTox === 0) modTox++; }

    // Absorption scoring
    if (bioav != null) {
      if (bioav >= 0.55) pass.push(`Biodisp. oral ${(bioav*100).toFixed(0)}%`);
      else if (bioav < 0.35) { flags.push({ text: `Biodisp. baixa ${(bioav*100).toFixed(0)}%`, severe: false }); absIssues++; }
    }
    if (lipinski === 'PASS') pass.push('Lipinski ✓');
    else if (lipinski === 'FAIL') { flags.push({ text: 'Lipinski falha', severe: false }); absIssues++; }
    if (pgp != null && pgp >= 0.5) { flags.push({ text: `Pgp effluxo ${(pgp*100).toFixed(0)}%`, severe: false }); absIssues++; }
    if (solClass === 'Poorly' || solClass === 'Insoluble') {
      flags.push({ text: `Solubilidade ${solClass}`, severe: false }); absIssues++;
    } else if (solClass) pass.push(`Solub. ${solClass}`);
    if (qed != null && qed >= 0.4) pass.push(`QED ${qed.toFixed(2)}`);

    // Tier decision
    let tier: Tier;
    if (critTox >= 2 || (herg != null && herg >= 0.80) || (dili != null && dili >= 0.80) || (ames != null && ames >= 0.70)) {
      tier = 'DISCARD';
    } else if (critTox >= 1 || modTox >= 2) {
      tier = 'P3';
    } else if (modTox >= 1 || absIssues >= 2) {
      tier = 'P2';
    } else {
      tier = 'P1';
    }

    // Route suitability
    const routes: Route[] = [];
    if (tier !== 'DISCARD') {
      const oralOk = lipinski !== 'FAIL'
        && (bioav == null || bioav >= 0.35)
        && (pgp == null || pgp < 0.6)
        && !['Poorly', 'Insoluble'].includes(solClass ?? '')
        && (mw == null || mw <= 600)
        && tier !== 'P3';
      if (oralOk) routes.push('oral');

      const injOk = solClass !== 'Insoluble'
        && (herg == null || herg < 0.65)
        && (dili == null || dili < 0.65);
      if (injOk) routes.push('injectable');

      const inhalOk = (mw == null || mw <= 450)
        && (logP == null || (logP >= -1 && logP <= 4.5))
        && solClass !== 'Insoluble'
        && tier !== 'P3';
      if (inhalOk) routes.push('inhalation');
    }

    return { tier, routes, flags, pass };
  }

  const decisions = uniqueSmiles
    .map(smi => ({ smi, dec: calcDecision(smi) }))
    .sort((a, b) => TIER_ORDER[a.dec.tier] - TIER_ORDER[b.dec.tier]);

  const SOL_COLORS: Record<string, string> = { Soluble: '#22c55e', Moderately: '#3b82f6', Poorly: '#f59e0b', Insoluble: '#ef4444' };

  return (
    <>
      <BodyMapDecision allResults={allResults} uniqueSmiles={uniqueSmiles} moleculeNames={moleculeNames} />

    <div style={{ padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '15px', marginBottom: '30px', border: '1px solid #cbd5e1' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '22px' }}>
        <div style={{ width: '40px', height: '40px', backgroundColor: '#1a3a5c', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>
          <i className="bi bi-bar-chart-fill" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Batch Analysis Overview</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Análise consolidada de {n} molécula{n !== 1 ? 's' : ''}.</p>
        </div>
      </div>

      {/* ── Decision Maker ──────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: '20px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="bi bi-diagram-3-fill" style={{ color: '#1a3a5c', fontSize: '16px' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a' }}>Decision Maker — Prioridade por Via de Administração</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>Ranqueado por perfil ADMET: toxicidade + absorção por rota</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estrutura</th>
                <th style={{ padding: '8px 12px', textAlign: 'left',   fontWeight: 700, color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Composto</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prioridade</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Via Indicada</th>
                <th style={{ padding: '8px 12px', textAlign: 'left',   fontWeight: 700, color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Flags</th>
                <th style={{ padding: '8px 12px', textAlign: 'left',   fontWeight: 700, color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pontos Positivos</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map(({ smi, dec }, i) => {
                const cfg     = TIER_CFG[dec.tier];
                const molName = moleculeNames[smi] || allResults.find(r => r.SMILES === smi && r.Name)?.Name || '';
                return (
                  <tr key={smi} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <MolImage smiles={smi} width={80} height={60} />
                    </td>
                    <td style={{ padding: '8px 12px', maxWidth: '160px' }}>
                      {molName && (
                        <div style={{ fontWeight: 700, fontSize: '12px', color: '#1e293b', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{molName}</div>
                      )}
                      <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={smi}>{shortSmi(smi)}</div>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{
                        display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                        backgroundColor: cfg.bg, border: `1.5px solid ${cfg.border}`,
                        borderRadius: '10px', padding: '5px 10px', minWidth: '70px',
                      }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{cfg.short}</span>
                        <span style={{ fontSize: '9px', fontWeight: 600, color: cfg.color, marginTop: '2px', whiteSpace: 'nowrap' }}>{cfg.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {dec.routes.length === 0 ? (
                        <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700 }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          {dec.routes.map(r => {
                            const rc = ROUTE_CFG[r];
                            return (
                              <div key={r} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                backgroundColor: `${rc.color}14`, border: `1px solid ${rc.color}44`,
                                borderRadius: '6px', padding: '3px 7px', fontSize: '10px', fontWeight: 700, color: rc.color,
                                whiteSpace: 'nowrap',
                              }}>
                                <i className={rc.icon} style={{ fontSize: '11px' }} />
                                {rc.label}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: '200px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {dec.flags.length === 0 ? (
                          <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600 }}>Sem flags críticas</span>
                        ) : dec.flags.map((f, fi) => (
                          <span key={fi} style={{
                            fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                            backgroundColor: f.severe ? '#fef2f2' : '#fffbeb',
                            color: f.severe ? '#dc2626' : '#b45309',
                            border: `1px solid ${f.severe ? '#fca5a5' : '#fde68a'}`,
                            whiteSpace: 'nowrap',
                          }}>{f.text}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: '200px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {dec.pass.map((p, pi) => (
                          <span key={pi} style={{
                            fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                            backgroundColor: '#f0fdf4', color: '#15803d',
                            border: '1px solid #86efac', whiteSpace: 'nowrap',
                          }}>{p}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Tier legend */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legenda:</span>
          {(Object.entries(TIER_CFG) as [Tier, typeof TIER_CFG[Tier]][]).map(([k, v]) => (
            <span key={k} style={{ fontSize: '10px', fontWeight: 700, color: v.color }}>
              ■ {v.short} {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Row 1: metric cards ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <MetricCard label="Total Molecules"          value={String(n)} />
        <MetricCard label="Avg Mol. Weight"          value={avg(mwVals).toFixed(1)} unit="Da" />
        <MetricCard label="Avg LogP"                 value={avg(logPVals).toFixed(2)} />
        {hasDeep && <MetricCard label="Avg QED"      value={avgQED.toFixed(2)} accent={avgQED >= 0.6 ? '#22c55e' : avgQED >= 0.4 ? '#f59e0b' : '#ef4444'} />}
        {hasDeep && <MetricCard label="Avg Biodisp. Oral" value={`${(avgBioav * 100).toFixed(0)}`} unit="%" accent="#3b82f6" />}
        <MetricCard label="Lipinski Compliance"      value={`${lipinskiRate.toFixed(0)}`} unit="%" accent={lipinskiRate > 80 ? '#22c55e' : '#f59e0b'} />
      </div>

      {/* ── Row 2: Safety Flags + Solubility ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>

        {/* Safety Flags */}
        {hasDeep && (
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>Safety Flags</h4>
            {[
              { label: 'hERG Cardiotoxicidade', count: hergHigh,  color: '#ef4444', note: '≥40%' },
              { label: 'DILI (Hepatotoxicidade)', count: diliHigh, color: '#f97316', note: '≥50%' },
              { label: 'PAINS Alerts',           count: painsHits, color: '#8b5cf6', note: 'estrutural' },
              { label: 'BRENK Alerts',           count: brenkHits, color: '#ec4899', note: 'estrutural' },
              { label: 'BBB Permeável',          count: bbbPlus,   color: '#10b981', note: 'CNS ativo' },
            ].map(({ label, count, color, note }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: count > 0 ? color : '#d1fae5', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '11px', color: count > 0 ? color : '#6b7280', fontWeight: 700 }}>
                      {count}/{n} <span style={{ fontWeight: 400, color: '#9ca3af' }}>({note})</span>
                    </span>
                  </div>
                  <MiniBar value={count} max={n} color={count > 0 ? color : '#d1fae5'} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Toxicity + Solubility stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>Risco Global de Toxicidade (StopTox)</h4>
            <div style={{ height: '10px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${100 - toxRiskRate}%`, backgroundColor: '#22c55e' }} />
              <div style={{ width: `${toxRiskRate}%`, backgroundColor: '#ef4444' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', fontWeight: 700 }}>
              <span style={{ color: '#166534' }}>Seguro: {(100 - toxRiskRate).toFixed(0)}%</span>
              <span style={{ color: '#991b1b' }}>Alto Risco: {toxRiskRate.toFixed(0)}%</span>
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>Solubilidade Aquosa (ESOL)</h4>
            <div style={{ display: 'flex', gap: '4px', height: '28px' }}>
              {Object.entries(solDist).map(([cat, count]: any) => {
                const pct = esolClasses.length ? (count / esolClasses.length) * 100 : 0;
                return (
                  <div key={cat} style={{ flex: count, backgroundColor: SOL_COLORS[cat] || '#94a3b8', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 700, minWidth: pct > 10 ? '28px' : 0 }} title={`${cat}: ${count}`}>
                    {pct > 15 ? `${pct.toFixed(0)}%` : ''}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '10px' }}>
              {Object.keys(SOL_COLORS).map(cat => <span key={cat} style={{ color: SOL_COLORS[cat] }}>● {cat}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Per-molecule risk matrix ─────────────────────────────────── */}
      {hasDeep && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>Per-Molecule Risk Matrix</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  {['Estrutura', 'Nome', 'Overall', 'hERG', 'DILI', 'ClinTox', 'BBB', 'Bioavail.', 'QED'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', color: '#64748b', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uniqueSmiles.map((smi, i) => {
                  const risk      = molRiskScore(smi);
                  const riskColor = risk >= 0.5 ? '#ef4444' : risk >= 0.3 ? '#f59e0b' : '#22c55e';
                  const riskLabel = risk >= 0.5 ? 'High' : risk >= 0.3 ? 'Med' : 'Low';
                  const molName   = moleculeNames[smi] || allResults.find(r => r.SMILES === smi && r.Name)?.Name || '';
                  return (
                    <tr key={smi} style={{ borderBottom: '1px solid #f8fafc', backgroundColor: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <MolImage smiles={smi} width={72} height={54} />
                      </td>
                      <td style={{ padding: '8px 10px', maxWidth: '140px' }}>
                        {molName && <div style={{ fontWeight: 700, fontSize: '11px', color: '#1e293b', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{molName}</div>}
                        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={smi}>{shortSmi(smi)}</div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span style={{ padding: '3px 8px', borderRadius: '10px', backgroundColor: risk >= 0.5 ? '#fef2f2' : risk >= 0.3 ? '#fffbeb' : '#f0fdf4', color: riskColor, fontWeight: 700, fontSize: '11px' }}>
                          {riskLabel}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}><RiskDot prob={deepProb(allResults, smi, 'hERG')} threshold={0.4} /></td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}><RiskDot prob={deepProb(allResults, smi, 'DILI')} threshold={0.5} /></td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}><RiskDot prob={deepProb(allResults, smi, 'ClinTox')} threshold={0.3} /></td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {(() => { const p = deepProb(allResults, smi, 'BBB_Martins'); return p != null ? <span style={{ fontSize: '11px', fontWeight: 700, color: p >= 0.5 ? '#10b981' : '#ef4444' }}>{p >= 0.5 ? 'BBB+' : 'BBB-'}</span> : <span style={{ color: '#cbd5e1' }}>—</span>; })()}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                        {(() => { const p = deepProb(allResults, smi, 'Bioavailability_Ma'); return p != null ? `${(p * 100).toFixed(0)}%` : '—'; })()}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                        {(() => { const v = deepVal(allResults, smi, 'QED'); return v != null ? v.toFixed(2) : '—'; })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Row 4: CYP inhibition heatmap ───────────────────────────────────── */}
      {hasDeep && uniqueSmiles.some(smi => CYP_ISOFORMS.some(cyp => deepProb(allResults, smi, cyp) != null)) && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>CYP Inhibition Profile</h4>
          <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#94a3b8' }}>Probabilidade de inibição — risco de interações medicamentosas</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '6px 12px', color: '#64748b', fontWeight: 700, textAlign: 'center' }}>Estrutura</th>
                  <th style={{ padding: '6px 12px', color: '#64748b', fontWeight: 700, textAlign: 'left' }}>Nome / SMILES</th>
                  {CYP_LABELS.map(l => <th key={l} style={{ padding: '6px 10px', color: '#64748b', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {uniqueSmiles.map((smi, i) => {
                  const molName = moleculeNames[smi] || allResults.find(r => r.SMILES === smi && r.Name)?.Name || '';
                  return (
                    <tr key={smi} style={{ borderBottom: '1px solid #f8fafc', backgroundColor: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <MolImage smiles={smi} width={64} height={48} />
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: '150px' }}>
                        {molName && <div style={{ fontWeight: 700, fontSize: '11px', color: '#1e293b', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{molName}</div>}
                        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={smi}>{shortSmi(smi)}</div>
                      </td>
                      {CYP_ISOFORMS.map(cyp => (
                        <td key={cyp} style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <CypDot prob={deepProb(allResults, smi, cyp)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '16px', fontSize: '10px', color: '#94a3b8' }}>
            <span style={{ color: '#16a34a' }}>■ &lt;25% Baixo</span>
            <span style={{ color: '#d97706' }}>■ 25–50% Moderado</span>
            <span style={{ color: '#dc2626' }}>■ &gt;50% Alto</span>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default Dashboard;
