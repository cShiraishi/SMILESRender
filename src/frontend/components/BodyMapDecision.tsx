import React, { useState } from 'react';

// ── helpers ───────────────────────────────────────────────────────────────────

function dp(results: any[], smi: string, prop: string): number | null {
  const r = results.find(x => x.SMILES === smi && x.Tool === 'Chemprop (D-MPNN)' && x.Property === prop);
  return r != null ? parseFloat(r.Probability) : null;
}

function dv(results: any[], smi: string, prop: string): number | null {
  const r = results.find(x => x.SMILES === smi && x.Tool === 'Chemprop (D-MPNN)' && x.Property === prop);
  return r != null ? parseFloat(r.Value) : null;
}

function rv(results: any[], smi: string, prop: string): string | null {
  const r = results.find(x => x.SMILES === smi && String(x.Tool).includes('RDKit') && x.Property === prop);
  return r ? String(r.Value) : null;
}

// ── risk levels ───────────────────────────────────────────────────────────────

type RiskLevel = 'ok' | 'warn' | 'high' | 'info' | 'none';

const RS: Record<RiskLevel, { bg: string; border: string; dot: string; text: string; label: string }> = {
  ok:   { bg: '#f0fdf4', border: '#86efac', dot: '#22c55e', text: '#166534', label: 'Seguro' },
  warn: { bg: '#fffbeb', border: '#fcd34d', dot: '#f59e0b', text: '#92400e', label: 'Atenção' },
  high: { bg: '#fef2f2', border: '#fca5a5', dot: '#ef4444', text: '#991b1b', label: 'Risco Alto' },
  info: { bg: '#f0f9ff', border: '#7dd3fc', dot: '#0ea5e9', text: '#075985', label: 'Neutro' },
  none: { bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8', text: '#64748b', label: '—' },
};

function heartRisk(results: any[], smi: string): RiskLevel {
  const h = dp(results, smi, 'hERG');
  const c = dp(results, smi, 'ClinTox');
  if (h == null) return 'none';
  if (h >= 0.6 || (c ?? 0) >= 0.5) return 'high';
  if (h >= 0.4) return 'warn';
  return 'ok';
}

function liverRisk(results: any[], smi: string): RiskLevel {
  const dili = dp(results, smi, 'DILI');
  const cyps = ['CYP1A2_Veith', 'CYP2C9_Veith', 'CYP2C19_Veith', 'CYP2D6_Veith', 'CYP3A4_Veith']
    .map(c => dp(results, smi, c) ?? 0);
  if (dili == null) return 'none';
  if (dili >= 0.5 || Math.max(...cyps) >= 0.7) return 'high';
  if (dili >= 0.3 || Math.max(...cyps) >= 0.5) return 'warn';
  return 'ok';
}

function giRisk(results: any[], smi: string): RiskLevel {
  const bioav = dp(results, smi, 'Bioavailability_Ma');
  const lip   = rv(results, smi, 'Lipinski Ro5');
  if (bioav == null) return 'none';
  if (bioav < 0.3) return 'high';
  if (bioav < 0.5 || lip === 'FAIL') return 'warn';
  return 'ok';
}

function lungRisk(results: any[], smi: string): RiskLevel {
  const mwN  = parseFloat(rv(results, smi, 'MW')   ?? 'NaN');
  const logN = parseFloat(rv(results, smi, 'LogP') ?? 'NaN');
  if (isNaN(mwN)) return 'none';
  if (mwN > 500) return 'high';
  if (!isNaN(logN) && logN >= 1 && logN <= 4 && mwN < 400) return 'ok';
  return 'warn';
}

function brainRisk(results: any[], smi: string): RiskLevel {
  return dp(results, smi, 'BBB_Martins') == null ? 'none' : 'info';
}

// ── organ definitions ─────────────────────────────────────────────────────────

const ORGAN_DEF: Record<string, {
  label: string;
  note: string;
  deepProbs?: { key: string; label: string; invert: boolean }[];
  deepVals?:  { key: string; label: string; unit?: string }[];
  rdkitVals?: { key: string; label: string }[];
}> = {
  brain: {
    label: 'Cérebro / SNC',
    note: 'BBB+ indica penetração na barreira hematoencefálica. Desejável para alvos neurológicos; indesejável para fármacos de ação periférica (risco de efeitos no SNC).',
    deepProbs: [
      { key: 'BBB_Martins', label: 'Barreira Hematoencefálica (BBB)', invert: false },
    ],
  },
  heart: {
    label: 'Coração',
    note: 'Bloqueio do canal hERG prolonga o intervalo QT e pode causar Torsades de Pointes. Risco crítico em desenvolvimento clínico.',
    deepProbs: [
      { key: 'hERG',    label: 'hERG Cardiotoxicidade', invert: true },
      { key: 'ClinTox', label: 'ClinTox',               invert: true },
    ],
  },
  lung: {
    label: 'Pulmão / Via Inalatória',
    note: 'Para aerossol: PM < 400 Da e LogP 1–4 favorecem deposição alveolar. Partículas MMAD 1–5 µm são ideais para distribuição pulmonar.',
    rdkitVals: [
      { key: 'MW',    label: 'Peso Molecular (Da)' },
      { key: 'LogP',  label: 'LogP' },
      { key: 'Class', label: 'Solubilidade ESOL' },
    ],
  },
  liver: {
    label: 'Fígado / Metabolismo',
    note: 'DILI alto e inibição de CYPs aumentam risco de toxicidade hepática e interações medicamentosas. CYP3A4 metaboliza ~50% dos fármacos em uso clínico.',
    deepProbs: [
      { key: 'DILI',          label: 'Lesão Hepática (DILI)',  invert: true },
      { key: 'CYP1A2_Veith',  label: 'Inibição CYP1A2',       invert: true },
      { key: 'CYP2C9_Veith',  label: 'Inibição CYP2C9',       invert: true },
      { key: 'CYP2C19_Veith', label: 'Inibição CYP2C19',      invert: true },
      { key: 'CYP2D6_Veith',  label: 'Inibição CYP2D6',       invert: true },
      { key: 'CYP3A4_Veith',  label: 'Inibição CYP3A4',       invert: true },
    ],
  },
  gi: {
    label: 'Trato GI / Absorção Oral',
    note: 'Alta permeabilidade intestinal e biodisponibilidade indicam boa candidatura oral. Lipinski Ro5 é o filtro clássico de drug-likeness para via oral.',
    deepProbs: [
      { key: 'Bioavailability_Ma', label: 'Biodisponibilidade Oral',    invert: false },
      { key: 'HIA_Hou',            label: 'Absorção Intestinal (HIA)',  invert: false },
    ],
    rdkitVals: [
      { key: 'Lipinski Ro5', label: 'Lipinski Ro5' },
      { key: 'Class',        label: 'Solubilidade ESOL' },
      { key: 'LogP',         label: 'LogP' },
    ],
  },
  kidney: {
    label: 'Rim / Excreção',
    note: 'Clearance e meia-vida determinam frequência de dose e risco de acúmulo. Moléculas com t½ longo podem gerar efeitos adversos prolongados.',
    deepVals: [
      { key: 'Clearance_Hepatic_AZ', label: 'Clearance Hepático', unit: 'mL/min/kg' },
      { key: 'Half_Life_Obach',      label: 'Meia-vida (t½)',     unit: 'h' },
    ],
  },
};

// ── ROA scoring ───────────────────────────────────────────────────────────────

type Factor = { label: string; ok: boolean | 'warn' | 'info' };

function computeROA(results: any[], smi: string) {
  const bioav  = dp(results, smi, 'Bioavailability_Ma');
  const lip    = rv(results, smi, 'Lipinski Ro5');
  const sol    = rv(results, smi, 'Class');
  const logpN  = parseFloat(rv(results, smi, 'LogP') ?? 'NaN');
  const mwN    = parseFloat(rv(results, smi, 'MW')   ?? 'NaN');
  const pains  = rv(results, smi, 'PAINS Alerts');
  const herg   = dp(results, smi, 'hERG');
  const dili   = dp(results, smi, 'DILI');
  const clintx = dp(results, smi, 'ClinTox');

  // Oral
  const oF: Factor[] = [];
  let os = 0;
  if (bioav != null) {
    if (bioav >= 0.7)      { os += 30; oF.push({ label: `Biodisponibilidade ${(bioav * 100).toFixed(0)}%`, ok: true }); }
    else if (bioav >= 0.5) { os += 15; oF.push({ label: `Biodisponibilidade ${(bioav * 100).toFixed(0)}%`, ok: 'warn' }); }
    else                   {           oF.push({ label: `Biodisponibilidade baixa (${(bioav * 100).toFixed(0)}%)`, ok: false }); }
  }
  if (lip) { os += lip === 'PASS' ? 25 : 0; oF.push({ label: `Lipinski Ro5 ${lip}`, ok: lip === 'PASS' }); }
  if (sol) {
    const sl = sol.toLowerCase();
    if (sl.includes('soluble') && !sl.includes('poorly'))          { os += 20; oF.push({ label: `Solubilidade: ${sol}`, ok: true }); }
    else if (sl.includes('mod') || sl.includes('slightly'))        { os += 10; oF.push({ label: `Solubilidade: ${sol}`, ok: 'warn' }); }
    else                                                            { os +=  2; oF.push({ label: `Solubilidade: ${sol}`, ok: false }); }
  }
  if (!isNaN(logpN)) { os += logpN >= 0 && logpN <= 5 ? 15 : 0; oF.push({ label: `LogP ${logpN.toFixed(1)}`, ok: logpN >= 0 && logpN <= 5 }); }
  if (!isNaN(mwN))   { os += mwN < 500 ? 10 : 0; oF.push({ label: `PM ${mwN.toFixed(0)} Da`, ok: mwN < 500 }); }
  if (pains && pains !== 'PASS') { os -= 20; oF.push({ label: 'PAINS alert', ok: false }); }

  // Injectable
  const iF: Factor[] = [];
  let is = 50;
  if (herg != null) {
    if (herg < 0.3)      { is += 20; iF.push({ label: `hERG seguro (${(herg * 100).toFixed(0)}%)`, ok: true }); }
    else if (herg < 0.5) { is +=  5; iF.push({ label: `hERG moderado (${(herg * 100).toFixed(0)}%)`, ok: 'warn' }); }
    else                 { is -= 20; iF.push({ label: `hERG alto — risco IV (${(herg * 100).toFixed(0)}%)`, ok: false }); }
  }
  if (dili != null) {
    if (dili < 0.3)      { is += 15; iF.push({ label: 'DILI baixo', ok: true }); }
    else if (dili < 0.5) { is +=  5; iF.push({ label: `DILI moderado (${(dili * 100).toFixed(0)}%)`, ok: 'warn' }); }
    else                 { is -= 15; iF.push({ label: `DILI alto (${(dili * 100).toFixed(0)}%)`, ok: false }); }
  }
  if (clintx != null) { is += clintx < 0.3 ? 10 : -10; iF.push({ label: `ClinTox ${(clintx * 100).toFixed(0)}%`, ok: clintx < 0.3 }); }
  iF.push({ label: 'Solubilidade contornável por formulação', ok: 'info' });

  // Inhalation
  const nhF: Factor[] = [];
  let nhs = 0;
  if (!isNaN(mwN)) {
    if (mwN < 300)      { nhs += 35; nhF.push({ label: `PM ${mwN.toFixed(0)} Da (ideal aerossol)`, ok: true }); }
    else if (mwN < 500) { nhs += 15; nhF.push({ label: `PM ${mwN.toFixed(0)} Da (aceitável)`, ok: 'warn' }); }
    else                {            nhF.push({ label: `PM ${mwN.toFixed(0)} Da — alto para aerossol`, ok: false }); }
  }
  if (!isNaN(logpN)) {
    if (logpN >= 1 && logpN <= 4)      { nhs += 30; nhF.push({ label: `LogP ${logpN.toFixed(1)} — ótimo pulmonar`, ok: true }); }
    else if (logpN >= 0 && logpN <= 6) { nhs += 10; nhF.push({ label: `LogP ${logpN.toFixed(1)} — marginal`, ok: 'warn' }); }
    else                               {            nhF.push({ label: `LogP ${logpN.toFixed(1)} — fora do ideal`, ok: false }); }
  }
  if (sol) {
    const sl = sol.toLowerCase();
    if (sl.includes('soluble') && !sl.includes('poorly')) { nhs += 20; nhF.push({ label: `Solubilidade: ${sol}`, ok: true }); }
    else if (sl.includes('mod'))                          { nhs += 10; nhF.push({ label: `Solubilidade: ${sol}`, ok: 'warn' }); }
    else                                                  {            nhF.push({ label: 'Solubilidade insuficiente', ok: false }); }
  }
  if (pains && pains !== 'PASS') { nhs -= 15; nhF.push({ label: 'PAINS alert', ok: false }); }

  return {
    oral:       { score: Math.max(0, Math.min(100, os)),  factors: oF  },
    injectable: { score: Math.max(0, Math.min(100, is)),  factors: iF  },
    inhalation: { score: Math.max(0, Math.min(100, nhs)), factors: nhF },
  };
}

// ── SVG body ──────────────────────────────────────────────────────────────────

interface BodySVGProps {
  risks: Record<string, RiskLevel>;
  selected: string;
  onSelect: (o: string) => void;
}

function BodySVG({ risks, selected, onSelect }: BodySVGProps) {
  const toggle = (o: string) => onSelect(selected === o ? '' : o);
  const fill   = (o: string) => RS[risks[o] || 'none'].dot + (selected === o ? 'ff' : 'cc');
  const stroke = (o: string) => RS[risks[o] || 'none'].dot;
  const sw     = (o: string) => selected === o ? '3' : '1.5';

  return (
    <svg viewBox="0 0 180 430" width="158" style={{ display: 'block', cursor: 'pointer', userSelect: 'none' }}>
      {/* ── body outline ── */}
      <ellipse cx="90" cy="38" rx="27" ry="32" fill="#fde8d0" stroke="#d4a878" strokeWidth="1.5" />
      <rect x="79" y="68" width="22" height="20" rx="3" fill="#fde8d0" stroke="#d4a878" strokeWidth="1" />
      <path d="M42,86 L138,86 L133,242 L47,242 Z" fill="#fde8d0" stroke="#d4a878" strokeWidth="1.5" />
      <path d="M47,242 L133,242 L138,284 L42,284 Z" fill="#fde8d0" stroke="#d4a878" strokeWidth="1.5" />
      <path d="M42,86 L16,96 L12,210 L30,210 Z"   fill="#fde8d0" stroke="#d4a878" strokeWidth="1.5" />
      <path d="M138,86 L164,96 L168,210 L150,210 Z" fill="#fde8d0" stroke="#d4a878" strokeWidth="1.5" />
      <path d="M42,284 L85,284 L82,430 L34,430 Z"  fill="#fde8d0" stroke="#d4a878" strokeWidth="1.5" />
      <path d="M95,284 L138,284 L146,430 L98,430 Z" fill="#fde8d0" stroke="#d4a878" strokeWidth="1.5" />

      {/* ── kidneys (behind) ── */}
      <g onClick={() => toggle('kidney')} style={{ cursor: 'pointer' }}>
        <ellipse cx="56"  cy="193" rx="11" ry="17" fill={fill('kidney')} stroke={stroke('kidney')} strokeWidth={sw('kidney')} opacity="0.85" />
        <ellipse cx="124" cy="193" rx="11" ry="17" fill={fill('kidney')} stroke={stroke('kidney')} strokeWidth={sw('kidney')} opacity="0.85" />
        <text x="56"  y="196" textAnchor="middle" fontSize="6"   fill="#fff" fontWeight="700" pointerEvents="none">Rim</text>
        <text x="124" y="196" textAnchor="middle" fontSize="6"   fill="#fff" fontWeight="700" pointerEvents="none">Rim</text>
      </g>

      {/* ── GI tract ── */}
      <g onClick={() => toggle('gi')} style={{ cursor: 'pointer' }}>
        <ellipse cx="82" cy="195" rx="29" ry="31" fill={fill('gi')} stroke={stroke('gi')} strokeWidth={sw('gi')} />
        <text x="82" y="198" textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700" pointerEvents="none">GI</text>
      </g>

      {/* ── liver ── */}
      <g onClick={() => toggle('liver')} style={{ cursor: 'pointer' }}>
        <ellipse cx="113" cy="163" rx="27" ry="17" fill={fill('liver')} stroke={stroke('liver')} strokeWidth={sw('liver')} />
        <text x="113" y="166" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700" pointerEvents="none">Fígado</text>
      </g>

      {/* ── lungs ── */}
      <g onClick={() => toggle('lung')} style={{ cursor: 'pointer' }}>
        <ellipse cx="64"  cy="132" rx="17" ry="30" fill={fill('lung')} stroke={stroke('lung')} strokeWidth={sw('lung')} opacity="0.92" />
        <ellipse cx="116" cy="132" rx="17" ry="30" fill={fill('lung')} stroke={stroke('lung')} strokeWidth={sw('lung')} opacity="0.92" />
        <text x="64"  y="134" textAnchor="middle" fontSize="6.5" fill="#fff" fontWeight="700" pointerEvents="none">Pulm.</text>
        <text x="116" y="134" textAnchor="middle" fontSize="6.5" fill="#fff" fontWeight="700" pointerEvents="none">Pulm.</text>
      </g>

      {/* ── heart ── */}
      <g onClick={() => toggle('heart')} style={{ cursor: 'pointer' }}>
        <circle cx="74" cy="116" r="18" fill={fill('heart')} stroke={stroke('heart')} strokeWidth={sw('heart')} />
        <text x="74" y="120" textAnchor="middle" fontSize="14" fill="#fff" pointerEvents="none">♥</text>
      </g>

      {/* ── brain ── */}
      <g onClick={() => toggle('brain')} style={{ cursor: 'pointer' }}>
        <ellipse cx="90" cy="33" rx="22" ry="25" fill={fill('brain')} stroke={stroke('brain')} strokeWidth={sw('brain')} opacity="0.92" />
        <text x="90" y="36" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700" pointerEvents="none">SNC</text>
      </g>
    </svg>
  );
}

// ── organ detail panel ────────────────────────────────────────────────────────

function ProbBar({ prob, label, invert }: { prob: number; label: string; invert: boolean }) {
  const level: RiskLevel = invert
    ? (prob >= 0.6 ? 'high' : prob >= 0.4 ? 'warn' : 'ok')
    : (prob < 0.3  ? 'high' : prob < 0.5  ? 'warn' : 'ok');
  const c = RS[level].dot;
  return (
    <div style={{ marginBottom: '9px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: c }}>{(prob * 100).toFixed(0)}%</span>
      </div>
      <div style={{ height: '5px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${prob * 100}%`, height: '100%', backgroundColor: c, borderRadius: '3px' }} />
      </div>
    </div>
  );
}

function OrganPanel({ organ, results, smi, risks }: { organ: string; results: any[]; smi: string; risks: Record<string, RiskLevel> }) {
  const def = ORGAN_DEF[organ];
  if (!def) return (
    <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center', padding: '20px 0', lineHeight: 1.6 }}>
      Clique em um órgão no corpo humano<br />para ver os dados ADMET do sistema
    </div>
  );

  const risk = risks[organ] || 'none';
  const rs = RS[risk];

  return (
    <div style={{ backgroundColor: rs.bg, border: `1px solid ${rs.border}`, borderRadius: '10px', padding: '13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '11px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: rs.dot, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', flex: 1 }}>{def.label}</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: rs.text, backgroundColor: rs.border + '55', padding: '2px 7px', borderRadius: '6px' }}>{rs.label}</span>
      </div>

      {def.deepProbs?.map(p => {
        const prob = dp(results, smi, p.key);
        return prob != null ? <ProbBar key={p.key} prob={prob} label={p.label} invert={p.invert} /> : null;
      })}

      {def.deepVals?.map(p => {
        const val = dv(results, smi, p.key);
        return val != null ? (
          <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{p.label}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>{val.toFixed(2)} {p.unit}</span>
          </div>
        ) : null;
      })}

      {def.rdkitVals?.map(p => {
        const val = rv(results, smi, p.key);
        if (!val) return null;
        const isPass = val === 'PASS';
        const isFail = val === 'FAIL';
        return (
          <div key={p.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{p.label}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: isPass ? '#16a34a' : isFail ? '#dc2626' : '#0f172a' }}>{val}</span>
          </div>
        );
      })}

      <p style={{ margin: '10px 0 0', fontSize: '10px', color: '#64748b', borderTop: `1px solid ${rs.border}`, paddingTop: '8px', lineHeight: 1.55 }}>
        {def.note}
      </p>
    </div>
  );
}

// ── ROA bar ───────────────────────────────────────────────────────────────────

function ROABar({ icon, label, score, factors, recommended }: {
  icon: string; label: string; score: number; factors: Factor[]; recommended: boolean;
}) {
  const color   = score >= 65 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  const verdict = score >= 65 ? 'Viável' : score >= 40 ? 'Marginal' : 'Não indicado';
  return (
    <div style={{
      backgroundColor: recommended ? '#f0fdf4' : '#fafafa',
      border: recommended ? '2px solid #86efac' : '1px solid #e2e8f0',
      borderRadius: '10px', padding: '11px 13px', marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
        <i className={icon} style={{ fontSize: '16px', color: '#475569' }} />
        <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', flex: 1 }}>{label}</span>
        {recommended && (
          <span style={{ fontSize: '9px', backgroundColor: '#22c55e', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.04em' }}>
            MELHOR OPÇÃO
          </span>
        )}
        <span style={{ fontSize: '11px', fontWeight: 700, color, marginLeft: '4px' }}>{verdict}</span>
        <span style={{ fontSize: '15px', fontWeight: 800, color, minWidth: '38px', textAlign: 'right' }}>{score}%</span>
      </div>
      <div style={{ height: '7px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ width: `${score}%`, height: '100%', backgroundColor: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {factors.slice(0, 5).map((f, i) => (
          <span key={i} style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
            backgroundColor: f.ok === true ? '#f0fdf4' : f.ok === false ? '#fef2f2' : f.ok === 'warn' ? '#fffbeb' : '#f0f9ff',
            color:           f.ok === true ? '#16a34a' : f.ok === false ? '#dc2626' : f.ok === 'warn' ? '#d97706' : '#0284c7',
          }}>
            <i className={f.ok === true ? 'bi bi-check-lg' : f.ok === false ? 'bi bi-x-lg' : f.ok === 'warn' ? 'bi bi-exclamation-triangle' : 'bi bi-info-circle'} style={{ marginRight: 3 }} />{f.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

interface BodyMapDecisionProps {
  allResults: any[];
  uniqueSmiles: string[];
  moleculeNames?: Record<string, string>;
}

function BodyMapDecision({ allResults, uniqueSmiles, moleculeNames = {} }: BodyMapDecisionProps) {
  const [selectedSmi,   setSelectedSmi]   = useState<string>(uniqueSmiles[0] || '');
  const [selectedOrgan, setSelectedOrgan] = useState<string>('');

  const smi     = selectedSmi || uniqueSmiles[0] || '';
  const molName = moleculeNames[smi] || allResults.find(r => r.SMILES === smi && r.Name)?.Name || '';

  if (!allResults.some(r => r.SMILES === smi)) return null;

  const risks: Record<string, RiskLevel> = {
    brain:  brainRisk(allResults, smi),
    heart:  heartRisk(allResults, smi),
    lung:   lungRisk(allResults, smi),
    liver:  liverRisk(allResults, smi),
    gi:     giRisk(allResults, smi),
    kidney: 'info',
  };

  const roa  = computeROA(allResults, smi);
  const best = (['oral', 'injectable', 'inhalation'] as const)
    .reduce<'oral' | 'injectable' | 'inhalation'>((a, b) => roa[a].score >= roa[b].score ? a : b, 'oral');

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 4px 14px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ background: 'linear-gradient(135deg, #1a3a5c 0%, #23527a 100%)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>Mapa ADMET — Tomada de Decisão</div>
          <div style={{ color: '#93c5fd', fontSize: '11px', marginTop: '2px' }}>
            Clique nos órgãos para detalhar o perfil de risco por sistema · Via de administração calculada automaticamente
          </div>
        </div>
        {uniqueSmiles.length > 1 && (
          <select
            value={selectedSmi}
            onChange={e => { setSelectedSmi(e.target.value); setSelectedOrgan(''); }}
            style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #3b6ea8', backgroundColor: '#1e4d7a', color: '#fff', cursor: 'pointer' }}
          >
            {uniqueSmiles.map(s => {
              const n = moleculeNames[s] || allResults.find(r => r.SMILES === s && r.Name)?.Name;
              return <option key={s} value={s}>{n || s.slice(0, 32)}</option>;
            })}
          </select>
        )}
      </div>

      {/* molecule label */}
      <div style={{ padding: '6px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b', fontFamily: 'monospace', display: 'flex', gap: '8px', alignItems: 'center' }}>
        {molName && <strong style={{ color: '#0f172a', fontFamily: 'inherit' }}>{molName}</strong>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {smi.length > 60 ? smi.slice(0, 60) + '…' : smi}
        </span>
      </div>

      {/* content */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '420px' }}>
        {/* body SVG + legend */}
        <div style={{ padding: '16px 12px', borderRight: '1px solid #f1f5f9', backgroundColor: '#fafbfc', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <BodySVG risks={risks} selected={selectedOrgan} onSelect={setSelectedOrgan} />
          <div style={{ width: '100%', padding: '8px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
            {(['ok', 'warn', 'high', 'info'] as RiskLevel[]).map(r => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: RS[r].dot, flexShrink: 0 }} />
                <span style={{ fontSize: '10px', color: '#64748b' }}>{RS[r].label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* right panel: organ detail + ROA */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '480px' }}>
          <OrganPanel organ={selectedOrgan} results={allResults} smi={smi} risks={risks} />

          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
              Via de Administração
            </div>
            <ROABar icon="bi bi-capsule"      label="Oral"                     score={roa.oral.score}       factors={roa.oral.factors}       recommended={best === 'oral'} />
            <ROABar icon="bi bi-droplet-half" label="Injetável (IV / SC / IM)" score={roa.injectable.score}  factors={roa.injectable.factors}  recommended={best === 'injectable'} />
            <ROABar icon="bi bi-wind"         label="Inalatória"               score={roa.inhalation.score} factors={roa.inhalation.factors} recommended={best === 'inhalation'} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default BodyMapDecision;
