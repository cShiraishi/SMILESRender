import React, { useState } from 'react';
import MolImage from './MolImage';

// ── helpers ───────────────────────────────────────────────────────────────────

function dp(results: any[], smi: string, prop: string): number | null {
  const r = results.find(x => x.SMILES === smi && x.Tool === 'Chemprop (D-MPNN)' && x.Property === prop);
  return r != null ? parseFloat(r.Probability) : null;
}

function dv(results: any[], smi: string, prop: string): number | null {
  const r = results.find(x => x.SMILES === smi && x.Tool === 'Chemprop (D-MPNN)' && x.Property === prop);
  if (r == null) return null;
  const v = parseFloat(r.Value);
  return isNaN(v) ? null : v;
}

function rv(results: any[], smi: string, prop: string): string | null {
  const r = results.find(x => x.SMILES === smi && String(x.Tool).includes('RDKit') && x.Property === prop);
  return r ? String(r.Value) : null;
}

// ── risk levels ───────────────────────────────────────────────────────────────

type RiskLevel = 'ok' | 'warn' | 'high' | 'info' | 'none';

const RS: Record<RiskLevel, { bg: string; border: string; dot: string; text: string; label: string }> = {
  ok:   { bg: '#f0fdf4', border: '#86efac', dot: '#22c55e', text: '#166534', label: 'Safe' },
  warn: { bg: '#fffbeb', border: '#fcd34d', dot: '#f59e0b', text: '#92400e', label: 'Caution' },
  high: { bg: '#fef2f2', border: '#fca5a5', dot: '#ef4444', text: '#991b1b', label: 'High Risk' },
  info: { bg: '#f0f9ff', border: '#7dd3fc', dot: '#0ea5e9', text: '#075985', label: 'Neutral' },
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
  const pgp   = dp(results, smi, 'Pgp_Broccatelli');
  if (bioav == null) return 'none';
  if (bioav < 0.3 || (pgp != null && pgp >= 0.7)) return 'high';
  if (bioav < 0.5 || lip === 'FAIL' || (pgp != null && pgp >= 0.5)) return 'warn';
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

function skinRisk(results: any[], smi: string): RiskLevel {
  const sr   = dp(results, smi, 'Skin_Reaction');
  const logp = parseFloat(rv(results, smi, 'LogP') ?? 'NaN');
  const mw   = parseFloat(rv(results, smi, 'MW')   ?? 'NaN');
  // Potts-Guy estimate
  const logkp = !isNaN(logp) && !isNaN(mw) ? 0.71 * logp - 0.0061 * mw - 6.3 : null;
  if (sr == null && logkp == null) return 'none';
  if ((sr ?? 0) >= 0.6 && logkp != null && logkp >= -3) return 'high';
  if ((sr ?? 0) >= 0.5) return 'warn';
  if (logkp != null && logkp >= -2) return 'warn';
  if (sr != null && sr < 0.3) return 'ok';
  return 'info';
}

// ── organ definitions ─────────────────────────────────────────────────────────

const ORGAN_DEF: Record<string, {
  label: string;
  note: string;
  deepProbs?: { key: string; label: string; invert: boolean }[];
  deepVals?:  { key: string; label: string; unit?: string; decimals?: number }[];
  rdkitVals?: { key: string; label: string }[];
}> = {
  brain: {
    label: 'Brain / CNS',
    note: 'BBB+ indicates penetration of the blood-brain barrier. Desirable for neurological targets; undesirable for peripherally-acting drugs (risk of CNS side effects).',
    deepProbs: [
      { key: 'BBB_Martins', label: 'Blood-Brain Barrier (BBB)', invert: false },
    ],
  },
  heart: {
    label: 'Heart',
    note: 'hERG channel blockade prolongs the QT interval and may cause Torsades de Pointes. Critical risk in clinical development.',
    deepProbs: [
      { key: 'hERG',    label: 'hERG Cardiotoxicity', invert: true },
      { key: 'ClinTox', label: 'ClinTox',             invert: true },
    ],
  },
  lung: {
    label: 'Lung / Inhaled Route',
    note: 'For aerosols: MW < 400 Da and LogP 1–4 favour alveolar deposition. MMAD particles 1–5 µm are ideal for pulmonary distribution.',
    rdkitVals: [
      { key: 'MW',    label: 'Molecular Weight (Da)' },
      { key: 'LogP',  label: 'LogP' },
      { key: 'Class', label: 'ESOL Solubility' },
    ],
  },
  liver: {
    label: 'Liver / Metabolism',
    note: 'High DILI and CYP inhibition increase risk of hepatic toxicity and drug-drug interactions. CYP3A4 metabolises ~50% of clinically used drugs.',
    deepProbs: [
      { key: 'DILI',          label: 'Liver Injury (DILI)',  invert: true },
      { key: 'CYP1A2_Veith',  label: 'CYP1A2 Inhibition',   invert: true },
      { key: 'CYP2C9_Veith',  label: 'CYP2C9 Inhibition',   invert: true },
      { key: 'CYP2C19_Veith', label: 'CYP2C19 Inhibition',  invert: true },
      { key: 'CYP2D6_Veith',  label: 'CYP2D6 Inhibition',   invert: true },
      { key: 'CYP3A4_Veith',  label: 'CYP3A4 Inhibition',   invert: true },
    ],
  },
  gi: {
    label: 'GI Tract / Oral Absorption',
    note: 'High intestinal permeability and bioavailability indicate good oral candidacy. Pgp >0.5 signals active efflux reducing absorption. PAMPA >0.7 indicates good passive permeability.',
    deepProbs: [
      { key: 'Bioavailability_Ma',             label: 'Oral Bioavailability',       invert: false },
      { key: 'HIA_Hou',                        label: 'Intestinal Absorption (HIA)', invert: false },
      { key: 'PAMPA_NCATS',                    label: 'PAMPA Permeability',          invert: false },
      { key: 'Pgp_Broccatelli',                label: 'Pgp Substrate (efflux)',      invert: true  },
      { key: 'CYP3A4_Substrate_CarbonMangels', label: 'CYP3A4 Substrate (1st pass)', invert: true  },
    ],
    deepVals: [
      { key: 'Caco2_Wang', label: 'Caco-2 Permeability (log Papp)', unit: 'cm/s', decimals: 2 },
    ],
    rdkitVals: [
      { key: 'Lipinski Ro5', label: 'Lipinski Ro5' },
      { key: 'Class',        label: 'ESOL Solubility' },
      { key: 'LogP',         label: 'LogP' },
    ],
  },
  kidney: {
    label: 'Kidney / Excretion',
    note: 'Clearance and half-life determine dosing frequency and accumulation risk. PPB >95% reduces the free fraction available. High VDss indicates extensive tissue distribution.',
    deepVals: [
      { key: 'Clearance_Hepatocyte_AZ', label: 'Hepatic Clearance',       unit: 'mL/min/kg', decimals: 2 },
      { key: 'Half_Life_Obach',         label: 'Half-life (t½)',           unit: 'h',         decimals: 1 },
      { key: 'PPBR_AZ',                 label: 'Plasma Protein Binding',   unit: '%',         decimals: 1 },
      { key: 'VDss_Lombardo',           label: 'Volume of Distribution (VDss)', unit: 'log L/kg', decimals: 2 },
    ],
  },
  skin: {
    label: 'Skin / Transdermal Route',
    note: 'LogP 1–3 and MW < 500 Da favour cutaneous penetration. TPSA < 60 Å² and HBD < 3 improve permeation. High Skin_Reaction contraindicates prolonged topical application.',
    deepProbs: [
      { key: 'Skin_Reaction', label: 'Skin Sensitization', invert: true },
    ],
    rdkitVals: [
      { key: 'LogP',  label: 'LogP' },
      { key: 'MW',    label: 'Molecular Weight (Da)' },
      { key: 'TPSA',  label: 'TPSA (Å²)' },
      { key: 'HBD',   label: 'H-Bond Donors (HBD)' },
    ],
  },
};

// ── ROA scoring ───────────────────────────────────────────────────────────────

type Factor = { label: string; ok: boolean | 'warn' | 'info' };

function computeROA(results: any[], smi: string) {
  const bioav   = dp(results, smi, 'Bioavailability_Ma');
  const lip     = rv(results, smi, 'Lipinski Ro5');
  const sol     = rv(results, smi, 'Class');
  const logpN   = parseFloat(rv(results, smi, 'LogP') ?? 'NaN');
  const mwN     = parseFloat(rv(results, smi, 'MW')   ?? 'NaN');
  const tpsaN   = parseFloat(rv(results, smi, 'TPSA') ?? 'NaN');
  const hbdN    = parseFloat(rv(results, smi, 'HBD')  ?? 'NaN');
  const pains   = rv(results, smi, 'PAINS Alerts');
  const herg    = dp(results, smi, 'hERG');
  const dili    = dp(results, smi, 'DILI');
  const clintx  = dp(results, smi, 'ClinTox');
  const pgp     = dp(results, smi, 'Pgp_Broccatelli');
  const pampa   = dp(results, smi, 'PAMPA_NCATS');
  const caco2   = dv(results, smi, 'Caco2_Wang');
  const cyp3a4s = dp(results, smi, 'CYP3A4_Substrate_CarbonMangels');
  const ppbr    = dv(results, smi, 'PPBR_AZ');
  const vdss    = dv(results, smi, 'VDss_Lombardo');
  const hl      = dv(results, smi, 'Half_Life_Obach');
  const skinR   = dp(results, smi, 'Skin_Reaction');

  // ── Oral ────────────────────────────────────────────────────────────────────
  const oF: Factor[] = [];
  let os = 0;
  if (bioav != null) {
    if (bioav >= 0.7)      { os += 28; oF.push({ label: `Bioavail. ${(bioav * 100).toFixed(0)}%`, ok: true }); }
    else if (bioav >= 0.5) { os += 14; oF.push({ label: `Bioavail. ${(bioav * 100).toFixed(0)}%`, ok: 'warn' }); }
    else                   {           oF.push({ label: `Low bioavail. (${(bioav * 100).toFixed(0)}%)`, ok: false }); }
  }
  if (lip) { os += lip === 'PASS' ? 22 : 0; oF.push({ label: `Lipinski ${lip}`, ok: lip === 'PASS' }); }
  if (pampa != null) {
    if (pampa >= 0.7)      { os += 10; oF.push({ label: `PAMPA ${(pampa * 100).toFixed(0)}%`, ok: true }); }
    else if (pampa >= 0.4) { os +=  5; oF.push({ label: `PAMPA ${(pampa * 100).toFixed(0)}%`, ok: 'warn' }); }
    else                   {           oF.push({ label: `Low PAMPA (${(pampa * 100).toFixed(0)}%)`, ok: false }); }
  }
  if (caco2 != null) {
    if (caco2 > -5.15)     { os += 10; oF.push({ label: `Caco-2 ${caco2.toFixed(1)}`, ok: true }); }
    else                   {           oF.push({ label: `Low Caco-2 (${caco2.toFixed(1)})`, ok: false }); }
  }
  if (pgp != null) {
    if (pgp < 0.4)         { os +=  8; oF.push({ label: 'Pgp: non-substrate', ok: true }); }
    else if (pgp < 0.6)    {           oF.push({ label: `Pgp substrate (${(pgp * 100).toFixed(0)}%)`, ok: 'warn' }); }
    else                   { os -= 15; oF.push({ label: `High Pgp efflux (${(pgp * 100).toFixed(0)}%)`, ok: false }); }
  }
  if (cyp3a4s != null) {
    if (cyp3a4s >= 0.5)    { os -=  8; oF.push({ label: `CYP3A4 1st pass (${(cyp3a4s * 100).toFixed(0)}%)`, ok: 'warn' }); }
    else                   { os +=  5; oF.push({ label: 'Low 1st-pass metabolism', ok: true }); }
  }
  if (sol) {
    const sl = sol.toLowerCase();
    if (sl.includes('soluble') && !sl.includes('poorly')) { os += 12; oF.push({ label: `Sol.: ${sol}`, ok: true }); }
    else if (sl.includes('mod') || sl.includes('slightly')){ os +=  5; oF.push({ label: `Sol.: ${sol}`, ok: 'warn' }); }
    else                                                   {           oF.push({ label: `Sol.: ${sol}`, ok: false }); }
  }
  if (!isNaN(logpN)) { os += logpN >= 0 && logpN <= 5 ? 5 : 0; oF.push({ label: `LogP ${logpN.toFixed(1)}`, ok: logpN >= 0 && logpN <= 5 }); }
  if (pains && pains !== 'PASS') { os -= 20; oF.push({ label: 'PAINS alert', ok: false }); }

  // ── Injectable ──────────────────────────────────────────────────────────────
  const iF: Factor[] = [];
  let is = 50;
  if (herg != null) {
    if (herg < 0.3)      { is += 20; iF.push({ label: `hERG safe (${(herg * 100).toFixed(0)}%)`, ok: true }); }
    else if (herg < 0.5) { is +=  5; iF.push({ label: `hERG moderate (${(herg * 100).toFixed(0)}%)`, ok: 'warn' }); }
    else                 { is -= 20; iF.push({ label: `hERG high (${(herg * 100).toFixed(0)}%)`, ok: false }); }
  }
  if (dili != null) {
    if (dili < 0.3)      { is += 15; iF.push({ label: 'Low DILI', ok: true }); }
    else if (dili < 0.5) { is +=  5; iF.push({ label: `Moderate DILI (${(dili * 100).toFixed(0)}%)`, ok: 'warn' }); }
    else                 { is -= 15; iF.push({ label: `High DILI (${(dili * 100).toFixed(0)}%)`, ok: false }); }
  }
  if (clintx != null) { is += clintx < 0.3 ? 10 : -10; iF.push({ label: `ClinTox ${(clintx * 100).toFixed(0)}%`, ok: clintx < 0.3 }); }
  if (hl != null) {
    if (hl >= 4)         { is += 7; iF.push({ label: `t½ ${hl.toFixed(0)}h — durable`, ok: true }); }
    else                 {          iF.push({ label: `t½ ${hl.toFixed(1)}h — short`, ok: 'warn' }); }
  }
  if (ppbr != null) iF.push({ label: `PPB ${ppbr.toFixed(0)}%`, ok: 'info' });
  if (vdss != null) iF.push({ label: `VDss ${vdss.toFixed(2)} log L/kg`, ok: 'info' });
  iF.push({ label: 'Solubility addressable by formulation', ok: 'info' });

  // ── Inhalation ──────────────────────────────────────────────────────────────
  const nhF: Factor[] = [];
  let nhs = 0;
  if (!isNaN(mwN)) {
    if (mwN < 300)      { nhs += 35; nhF.push({ label: `MW ${mwN.toFixed(0)} Da (ideal aerosol)`, ok: true }); }
    else if (mwN < 500) { nhs += 15; nhF.push({ label: `MW ${mwN.toFixed(0)} Da (acceptable)`, ok: 'warn' }); }
    else                {            nhF.push({ label: `MW ${mwN.toFixed(0)} Da — too high for aerosol`, ok: false }); }
  }
  if (!isNaN(logpN)) {
    if (logpN >= 1 && logpN <= 4)      { nhs += 30; nhF.push({ label: `LogP ${logpN.toFixed(1)} — ideal for lung`, ok: true }); }
    else if (logpN >= 0 && logpN <= 6) { nhs += 10; nhF.push({ label: `LogP ${logpN.toFixed(1)} — marginal`, ok: 'warn' }); }
    else                               {            nhF.push({ label: `LogP ${logpN.toFixed(1)} — out of range`, ok: false }); }
  }
  if (sol) {
    const sl = sol.toLowerCase();
    if (sl.includes('soluble') && !sl.includes('poorly')) { nhs += 20; nhF.push({ label: `Sol.: ${sol}`, ok: true }); }
    else if (sl.includes('mod'))                          { nhs += 10; nhF.push({ label: `Sol.: ${sol}`, ok: 'warn' }); }
    else                                                  {            nhF.push({ label: 'Insufficient solubility', ok: false }); }
  }
  if (pains && pains !== 'PASS') { nhs -= 15; nhF.push({ label: 'PAINS alert', ok: false }); }

  // ── Transdermal ─────────────────────────────────────────────────────────────
  const tdF: Factor[] = [];
  let tds = 0;
  const logkp = !isNaN(logpN) && !isNaN(mwN) ? 0.71 * logpN - 0.0061 * mwN - 6.3 : null;

  if (logkp != null) {
    const kpClass =
      logkp >= -2 ? 'High' :
      logkp >= -3 ? 'Moderate' :
      logkp >= -5 ? 'Low' : 'Very low';
    if (logkp >= -2)      { tds += 45; tdF.push({ label: `logKp ${logkp.toFixed(1)} — ${kpClass}`, ok: true }); }
    else if (logkp >= -3) { tds += 30; tdF.push({ label: `logKp ${logkp.toFixed(1)} — ${kpClass}`, ok: true }); }
    else if (logkp >= -4) { tds += 18; tdF.push({ label: `logKp ${logkp.toFixed(1)} — ${kpClass}`, ok: 'warn' }); }
    else if (logkp >= -5) { tds +=  8; tdF.push({ label: `logKp ${logkp.toFixed(1)} — ${kpClass}`, ok: 'warn' }); }
    else                  {            tdF.push({ label: `logKp ${logkp.toFixed(1)} — ${kpClass}`, ok: false }); }
  }
  if (!isNaN(logpN)) {
    if (logpN >= 1 && logpN <= 3)      { tds += 20; tdF.push({ label: `LogP ${logpN.toFixed(1)} — ideal transdermal`, ok: true }); }
    else if (logpN > 3 && logpN <= 5)  { tds += 10; tdF.push({ label: `LogP ${logpN.toFixed(1)} — lipophilic`, ok: 'warn' }); }
    else                               {            tdF.push({ label: `LogP ${logpN.toFixed(1)} — out of range (1–3)`, ok: false }); }
  }
  if (!isNaN(tpsaN)) {
    if (tpsaN < 60)       { tds += 15; tdF.push({ label: `TPSA ${tpsaN.toFixed(0)} Å² — favorable`, ok: true }); }
    else if (tpsaN < 100) { tds +=  5; tdF.push({ label: `TPSA ${tpsaN.toFixed(0)} Å²`, ok: 'warn' }); }
    else                  { tds -= 10; tdF.push({ label: `TPSA ${tpsaN.toFixed(0)} Å² — unfavorable (>100)`, ok: false }); }
  }
  if (!isNaN(hbdN)) {
    if (hbdN <= 2)        { tds += 10; tdF.push({ label: `HBD ${hbdN} — low`, ok: true }); }
    else if (hbdN <= 3)   {            tdF.push({ label: `HBD ${hbdN}`, ok: 'warn' }); }
    else                  { tds -= 10; tdF.push({ label: `HBD ${hbdN} — high (reduces permeation)`, ok: false }); }
  }
  if (!isNaN(mwN)) {
    if (mwN <= 350)       { tds +=  8; tdF.push({ label: `MW ${mwN.toFixed(0)} Da — ideal`, ok: true }); }
    else if (mwN <= 500)  { tds +=  3; tdF.push({ label: `MW ${mwN.toFixed(0)} Da`, ok: 'warn' }); }
    else                  { tds -= 10; tdF.push({ label: `MW ${mwN.toFixed(0)} Da — too high for skin`, ok: false }); }
  }
  if (skinR != null) {
    if (skinR >= 0.6)     { tds -= 25; tdF.push({ label: `Skin sensitization ${(skinR * 100).toFixed(0)}%`, ok: false }); }
    else if (skinR >= 0.4){ tds -=  8; tdF.push({ label: `Moderate sensitization ${(skinR * 100).toFixed(0)}%`, ok: 'warn' }); }
    else                  { tds += 10; tdF.push({ label: `No sensitization (${(skinR * 100).toFixed(0)}%)`, ok: true }); }
  }

  return {
    oral:        { score: Math.max(0, Math.min(100, os)),  factors: oF   },
    injectable:  { score: Math.max(0, Math.min(100, is)),  factors: iF   },
    inhalation:  { score: Math.max(0, Math.min(100, nhs)), factors: nhF  },
    transdermal: { score: Math.max(0, Math.min(100, tds)), factors: tdF  },
  };
}

// ── per-organ molecule scoring (higher = better for that organ) ───────────────

function organScore(results: any[], smi: string, organ: string): number | null {
  switch (organ) {
    case 'heart': {
      const h = dp(results, smi, 'hERG');
      if (h == null) return null;
      return 1 - h;
    }
    case 'liver': {
      const dili = dp(results, smi, 'DILI');
      const cyps = ['CYP1A2_Veith', 'CYP2C9_Veith', 'CYP2C19_Veith', 'CYP2D6_Veith', 'CYP3A4_Veith']
        .map(c => dp(results, smi, c) ?? 0);
      if (dili == null) return null;
      return 1 - (0.5 * dili + 0.5 * Math.max(...cyps));
    }
    case 'gi': {
      const bioav = dp(results, smi, 'Bioavailability_Ma');
      if (bioav == null) return null;
      const pgp = dp(results, smi, 'Pgp_Broccatelli') ?? 0;
      return Math.max(0, bioav - pgp * 0.3);
    }
    case 'brain': {
      const bbb = dp(results, smi, 'BBB_Martins');
      return bbb ?? null;
    }
    case 'lung': {
      const mwN   = parseFloat(rv(results, smi, 'MW')   ?? 'NaN');
      const logpN = parseFloat(rv(results, smi, 'LogP') ?? 'NaN');
      if (isNaN(mwN)) return null;
      let s = 0;
      if (mwN < 300)      s += 0.5;
      else if (mwN < 500) s += 0.25;
      if (!isNaN(logpN) && logpN >= 1 && logpN <= 4) s += 0.5;
      return s;
    }
    case 'kidney': {
      const hl = dv(results, smi, 'Half_Life_Obach');
      const cl = dv(results, smi, 'Clearance_Hepatocyte_AZ');
      if (hl == null && cl == null) return null;
      let s = 0.5;
      if (hl != null) s += hl >= 4 ? 0.3 : -0.1;
      if (cl != null) s += cl < 100 ? 0.2 : -0.1;
      return Math.max(0, Math.min(1, s));
    }
    case 'skin': {
      const sr    = dp(results, smi, 'Skin_Reaction') ?? 0;
      const logpN = parseFloat(rv(results, smi, 'LogP') ?? 'NaN');
      const mwN   = parseFloat(rv(results, smi, 'MW')   ?? 'NaN');
      if (isNaN(logpN) && sr === 0) return null;
      const logkp = !isNaN(logpN) && !isNaN(mwN) ? 0.71 * logpN - 0.0061 * mwN - 6.3 : null;
      let s = 0.5 - sr * 0.4;
      if (logkp != null) s += Math.max(0, Math.min(0.3, (logkp + 5) / 10));
      return Math.max(0, Math.min(1, s));
    }
    default: return null;
  }
}

// ── best molecules card strip for an organ ────────────────────────────────────

function BestMoleculesForOrgan({ organ, allResults, uniqueSmiles, moleculeNames, selectedSmi, onSelect }: {
  organ: string;
  allResults: any[];
  uniqueSmiles: string[];
  moleculeNames: Record<string, string>;
  selectedSmi: string;
  onSelect: (s: string) => void;
}) {
  const def = ORGAN_DEF[organ];
  if (!def || uniqueSmiles.length < 2) return null;

  const scored = uniqueSmiles
    .map(smi => ({ smi, score: organScore(allResults, smi, organ) }))
    .filter(x => x.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (!scored.length) return null;

  return (
    <div style={{ marginTop: '4px' }}>
      <div style={{
        fontSize: '10px', fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px',
      }}>
        Best molecules — {def.label}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {scored.slice(0, 5).map(({ smi, score }, i) => {
          const name = moleculeNames[smi]
            || allResults.find(r => r.SMILES === smi && r.Name)?.Name
            || '';
          const isSel  = smi === selectedSmi;
          const pct    = Math.round((score ?? 0) * 100);
          const pctCol = pct >= 65 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626';
          return (
            <div
              key={smi}
              onClick={() => onSelect(smi)}
              title={smi}
              style={{
                cursor: 'pointer', width: '88px', flexShrink: 0,
                border: isSel ? '2px solid #1a3a5c' : '1px solid #e2e8f0',
                borderRadius: '10px', padding: '6px 5px 5px',
                backgroundColor: isSel ? '#eff6ff' : '#fff',
                boxShadow: isSel ? '0 2px 8px rgba(26,58,92,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.15s',
                position: 'relative',
              }}
            >
              {/* rank badge */}
              <div style={{
                position: 'absolute', top: '4px', left: '4px',
                backgroundColor: i === 0 ? '#16a34a' : i === 1 ? '#0284c7' : '#94a3b8',
                color: '#fff', borderRadius: '4px', padding: '1px 5px',
                fontSize: '8px', fontWeight: 800, lineHeight: '14px', zIndex: 1,
              }}>#{i + 1}</div>

              <MolImage smiles={smi} width={78} height={60} />

              <div style={{
                fontSize: '9px', fontWeight: 700, textAlign: 'center',
                marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', color: '#0f172a',
              }}>
                {name || (smi.length > 10 ? smi.slice(0, 10) + '…' : smi)}
              </div>

              <div style={{
                textAlign: 'center', fontSize: '10px', fontWeight: 800,
                color: pctCol, marginTop: '2px',
              }}>
                {pct}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SVG body ──────────────────────────────────────────────────────────────────

interface BodySVGProps {
  risks: Record<string, RiskLevel>;
  selected: string;
  onSelect: (o: string) => void;
}

function BodySVG({ risks, selected, onSelect }: BodySVGProps) {
  const toggle = (o: string) => onSelect(selected === o ? '' : o);
  const bc  = (o: string) => RS[risks[o] || 'none'].dot;
  const sel = (o: string) => selected === o;
  const oStroke = (o: string) => sel(o) ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.18)';
  const oSW     = (o: string) => sel(o) ? '2.2' : '1';

  return (
    <svg viewBox="0 0 180 430" width="158" style={{ display: 'block', userSelect: 'none' }}>
      <defs>
        {/* skin gradients — give cylindrical/rounded 3-D look */}
        <radialGradient id="sg-head" cx="42%" cy="33%" r="64%">
          <stop offset="0%"   stopColor="#fff8f2" />
          <stop offset="50%"  stopColor="#fddfc0" />
          <stop offset="100%" stopColor="#b87238" />
        </radialGradient>
        <linearGradient id="sg-torso" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#a86530" />
          <stop offset="12%"  stopColor="#f0bc88" />
          <stop offset="50%"  stopColor="#fef4ea" />
          <stop offset="88%"  stopColor="#f0bc88" />
          <stop offset="100%" stopColor="#a86530" />
        </linearGradient>
        <linearGradient id="sg-arm-l" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%"   stopColor="#a86530" />
          <stop offset="22%"  stopColor="#f5c898" />
          <stop offset="70%"  stopColor="#fddfc0" />
          <stop offset="100%" stopColor="#c48848" />
        </linearGradient>
        <linearGradient id="sg-arm-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#a86530" />
          <stop offset="22%"  stopColor="#f5c898" />
          <stop offset="70%"  stopColor="#fddfc0" />
          <stop offset="100%" stopColor="#c48848" />
        </linearGradient>
        <linearGradient id="sg-leg-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#a86530" />
          <stop offset="28%"  stopColor="#f0bc88" />
          <stop offset="65%"  stopColor="#fddfc0" />
          <stop offset="100%" stopColor="#b87238" />
        </linearGradient>
        <linearGradient id="sg-leg-r" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%"   stopColor="#a86530" />
          <stop offset="28%"  stopColor="#f0bc88" />
          <stop offset="65%"  stopColor="#fddfc0" />
          <stop offset="100%" stopColor="#b87238" />
        </linearGradient>

        {/* organ specular highlight — white radial sheen for 3-D roundness */}
        <radialGradient id="og-shine" cx="36%" cy="28%" r="66%" gradientUnits="objectBoundingBox">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.52)" />
          <stop offset="42%"  stopColor="rgba(255,255,255,0.14)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.20)" />
        </radialGradient>

        {/* glow for selected organ */}
        <filter id="f-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>

        {/* soft drop shadow for body parts */}
        <filter id="f-body" x="-12%" y="-4%" width="130%" height="118%">
          <feDropShadow dx="2" dy="5" stdDeviation="5" floodColor="#7a3f10" floodOpacity="0.20" />
        </filter>
        <filter id="f-organ" x="-28%" y="-28%" width="156%" height="156%">
          <feDropShadow dx="1" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* ── body ────────────────────────────────────────────────────── */}

      {/* head */}
      <ellipse cx="90" cy="38" rx="27" ry="32"
        fill="url(#sg-head)" stroke="#9a6030" strokeWidth="0.8" filter="url(#f-body)" />
      {/* forehead highlight */}
      <ellipse cx="83" cy="26" rx="10" ry="7" fill="rgba(255,255,255,0.16)" />

      {/* neck */}
      <rect x="82" y="67" width="16" height="21" rx="4"
        fill="url(#sg-torso)" stroke="#9a6030" strokeWidth="0.7" />

      {/* torso — curved waist */}
      <path d="M44,86
               C36,92 36,148 50,174
               C53,186 53,216 49,244
               L131,244
               C127,216 127,186 130,174
               C144,148 144,92 136,86 Z"
        fill="url(#sg-torso)" stroke="#9a6030" strokeWidth="0.9" filter="url(#f-body)" />

      {/* pelvis / hips */}
      <path d="M49,240
               C47,256 44,270 44,284
               L136,284
               C136,270 133,256 131,240 Z"
        fill="url(#sg-torso)" stroke="#9a6030" strokeWidth="0.8" />

      {/* left arm */}
      <path d="M44,88
               C36,91 20,98 15,112
               L11,210 L29,210
               L33,112 C37,100 42,93 44,88 Z"
        fill="url(#sg-arm-l)" stroke="#9a6030" strokeWidth="0.8" filter="url(#f-body)" />

      {/* right arm */}
      <path d="M136,88
               C144,91 160,98 165,112
               L169,210 L151,210
               L147,112 C143,100 138,93 136,88 Z"
        fill="url(#sg-arm-r)" stroke="#9a6030" strokeWidth="0.8" filter="url(#f-body)" />

      {/* left leg */}
      <path d="M49,282
               C48,296 45,326 44,362
               L42,430 L80,430
               L80,362 C82,326 84,296 85,282 Z"
        fill="url(#sg-leg-l)" stroke="#9a6030" strokeWidth="0.8" filter="url(#f-body)" />

      {/* right leg */}
      <path d="M95,282
               C96,296 98,326 98,362
               L100,430 L136,430
               L134,362 C135,326 132,296 131,282 Z"
        fill="url(#sg-leg-r)" stroke="#9a6030" strokeWidth="0.8" filter="url(#f-body)" />

      {/* anatomical surface details */}
      {/* clavicles */}
      <path d="M66,89 Q90,96 114,89" stroke="#c8905a" strokeWidth="1.2" fill="none" opacity="0.40" />
      {/* sternum */}
      <line x1="90" y1="96" x2="90" y2="172" stroke="#c8905a" strokeWidth="0.9" opacity="0.20" />
      {/* navel */}
      <ellipse cx="90" cy="210" rx="3.5" ry="2" fill="none" stroke="#c8905a" strokeWidth="1.0" opacity="0.30" />
      {/* shoulder caps */}
      <ellipse cx="44"  cy="95" rx="9" ry="7" fill="rgba(255,200,150,0.18)" />
      <ellipse cx="136" cy="95" rx="9" ry="7" fill="rgba(255,200,150,0.18)" />
      {/* knee caps */}
      <ellipse cx="61"  cy="356" rx="10" ry="8" fill="rgba(255,200,150,0.22)" stroke="#b07838" strokeWidth="0.6" />
      <ellipse cx="117" cy="356" rx="10" ry="8" fill="rgba(255,200,150,0.22)" stroke="#b07838" strokeWidth="0.6" />

      {/* ── organs ──────────────────────────────────────────────────── */}

      {/* kidneys — rendered before GI so GI sits on top */}
      <g onClick={() => toggle('kidney')} style={{ cursor: 'pointer' }}
         filter={sel('kidney') ? 'url(#f-glow)' : undefined}>
        <ellipse cx="56"  cy="193" rx="11" ry="17"
          fill={bc('kidney')} stroke={oStroke('kidney')} strokeWidth={oSW('kidney')}
          filter="url(#f-organ)" />
        <ellipse cx="56"  cy="193" rx="11" ry="17" fill="url(#og-shine)" />
        <ellipse cx="124" cy="193" rx="11" ry="17"
          fill={bc('kidney')} stroke={oStroke('kidney')} strokeWidth={oSW('kidney')}
          filter="url(#f-organ)" />
        <ellipse cx="124" cy="193" rx="11" ry="17" fill="url(#og-shine)" />
        <text x="56"  y="196" textAnchor="middle" fontSize="5.5" fill="#fff" fontWeight="700" pointerEvents="none">Kid.</text>
        <text x="124" y="196" textAnchor="middle" fontSize="5.5" fill="#fff" fontWeight="700" pointerEvents="none">Kid.</text>
      </g>

      {/* GI tract */}
      <g onClick={() => toggle('gi')} style={{ cursor: 'pointer' }}
         filter={sel('gi') ? 'url(#f-glow)' : undefined}>
        <ellipse cx="82" cy="195" rx="29" ry="31"
          fill={bc('gi')} stroke={oStroke('gi')} strokeWidth={oSW('gi')}
          filter="url(#f-organ)" />
        <ellipse cx="82" cy="195" rx="29" ry="31" fill="url(#og-shine)" />
        <text x="82" y="198" textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700" pointerEvents="none">GI</text>
      </g>

      {/* liver */}
      <g onClick={() => toggle('liver')} style={{ cursor: 'pointer' }}
         filter={sel('liver') ? 'url(#f-glow)' : undefined}>
        <ellipse cx="113" cy="163" rx="27" ry="17"
          fill={bc('liver')} stroke={oStroke('liver')} strokeWidth={oSW('liver')}
          filter="url(#f-organ)" />
        <ellipse cx="113" cy="163" rx="27" ry="17" fill="url(#og-shine)" />
        <text x="113" y="166" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700" pointerEvents="none">Liver</text>
      </g>

      {/* lungs */}
      <g onClick={() => toggle('lung')} style={{ cursor: 'pointer' }}
         filter={sel('lung') ? 'url(#f-glow)' : undefined}>
        <ellipse cx="64"  cy="132" rx="17" ry="30"
          fill={bc('lung')} stroke={oStroke('lung')} strokeWidth={oSW('lung')}
          filter="url(#f-organ)" />
        <ellipse cx="64"  cy="132" rx="17" ry="30" fill="url(#og-shine)" />
        <ellipse cx="116" cy="132" rx="17" ry="30"
          fill={bc('lung')} stroke={oStroke('lung')} strokeWidth={oSW('lung')}
          filter="url(#f-organ)" />
        <ellipse cx="116" cy="132" rx="17" ry="30" fill="url(#og-shine)" />
        <text x="64"  y="134" textAnchor="middle" fontSize="6.5" fill="#fff" fontWeight="700" pointerEvents="none">Lung</text>
        <text x="116" y="134" textAnchor="middle" fontSize="6.5" fill="#fff" fontWeight="700" pointerEvents="none">Lung</text>
      </g>

      {/* heart */}
      <g onClick={() => toggle('heart')} style={{ cursor: 'pointer' }}
         filter={sel('heart') ? 'url(#f-glow)' : undefined}>
        <circle cx="74" cy="116" r="18"
          fill={bc('heart')} stroke={oStroke('heart')} strokeWidth={oSW('heart')}
          filter="url(#f-organ)" />
        <circle cx="74" cy="116" r="18" fill="url(#og-shine)" />
        <text x="74" y="120" textAnchor="middle" fontSize="14" fill="#fff" pointerEvents="none">&#9829;</text>
      </g>

      {/* brain */}
      <g onClick={() => toggle('brain')} style={{ cursor: 'pointer' }}
         filter={sel('brain') ? 'url(#f-glow)' : undefined}>
        <ellipse cx="90" cy="33" rx="22" ry="25"
          fill={bc('brain')} stroke={oStroke('brain')} strokeWidth={oSW('brain')}
          filter="url(#f-organ)" />
        <ellipse cx="90" cy="33" rx="22" ry="25" fill="url(#og-shine)" />
        <text x="90" y="36" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700" pointerEvents="none">CNS</text>
      </g>

      {/* skin patch — right forearm */}
      <g onClick={() => toggle('skin')} style={{ cursor: 'pointer' }}
         filter={sel('skin') ? 'url(#f-glow)' : undefined}>
        <rect x="151" y="138" width="20" height="30" rx="6"
          fill={bc('skin')} stroke={oStroke('skin')} strokeWidth={oSW('skin')}
          filter="url(#f-organ)" />
        <rect x="151" y="138" width="20" height="30" rx="6" fill="url(#og-shine)" />
        <text x="161" y="157" textAnchor="middle" fontSize="5.5" fill="#fff" fontWeight="700"
          pointerEvents="none" transform="rotate(-14,161,148)">Skin</text>
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
      Click an organ on the body map<br />to view ADMET data for that system
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
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>{val.toFixed(p.decimals ?? 2)} {p.unit}</span>
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

      {/* Potts-Guy logKp for skin organ */}
      {organ === 'skin' && (() => {
        const logp = parseFloat(rv(results, smi, 'LogP') ?? 'NaN');
        const mw   = parseFloat(rv(results, smi, 'MW')   ?? 'NaN');
        if (isNaN(logp) || isNaN(mw)) return null;
        const logkp = 0.71 * logp - 0.0061 * mw - 6.3;
        const kpClass = logkp >= -2 ? 'High' : logkp >= -3 ? 'Moderate' : logkp >= -5 ? 'Low' : 'Very low';
        const col = logkp >= -3 ? '#22c55e' : logkp >= -5 ? '#f59e0b' : '#94a3b8';
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>logKp Potts-Guy (cm/s)</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: col }}>{logkp.toFixed(2)} — {kpClass}</span>
          </div>
        );
      })()}

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
  const verdict = score >= 65 ? 'Viable' : score >= 40 ? 'Borderline' : 'Not recommended';
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
            BEST
          </span>
        )}
        <span style={{ fontSize: '11px', fontWeight: 700, color, marginLeft: '4px' }}>{verdict}</span>
        <span style={{ fontSize: '15px', fontWeight: 800, color, minWidth: '38px', textAlign: 'right' }}>{score}%</span>
      </div>
      <div style={{ height: '7px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ width: `${score}%`, height: '100%', backgroundColor: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {factors.slice(0, 6).map((f, i) => (
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

type ROAKey = 'oral' | 'injectable' | 'inhalation' | 'transdermal';

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
    skin:   skinRisk(allResults, smi),
  };

  const roa  = computeROA(allResults, smi);
  const best = (['oral', 'injectable', 'inhalation', 'transdermal'] as ROAKey[])
    .reduce<ROAKey>((a, b) => roa[a].score >= roa[b].score ? a : b, 'oral');

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 4px 14px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ background: 'linear-gradient(135deg, #1a3a5c 0%, #23527a 100%)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>ADMET Map — Decision Support</div>
          <div style={{ color: '#93c5fd', fontSize: '11px', marginTop: '2px' }}>
            Click organs to view risk profile · Route of administration calculated automatically
          </div>
        </div>
        <div style={{ fontSize: '10px', color: '#93c5fd', fontStyle: 'italic' }}>
          {uniqueSmiles.length} molecule{uniqueSmiles.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* molecule selector strip — cards when multiple, label only when single */}
      {uniqueSmiles.length > 1 ? (
        <div style={{
          padding: '10px 16px', backgroundColor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex', gap: '8px', overflowX: 'auto',
        }}>
          {uniqueSmiles.map(s => {
            const n   = moleculeNames[s] || allResults.find(r => r.SMILES === s && r.Name)?.Name || '';
            const sel = s === smi;
            return (
              <div
                key={s}
                onClick={() => { setSelectedSmi(s); setSelectedOrgan(''); }}
                title={s}
                style={{
                  cursor: 'pointer', flexShrink: 0, width: '80px',
                  border: sel ? '2px solid #1a3a5c' : '1px solid #e2e8f0',
                  borderRadius: '9px', padding: '5px 4px 4px',
                  backgroundColor: sel ? '#eff6ff' : '#fff',
                  boxShadow: sel ? '0 2px 8px rgba(26,58,92,0.18)' : 'none',
                }}
              >
                <MolImage smiles={s} width={72} height={54} />
                <div style={{
                  fontSize: '9px', fontWeight: 700, textAlign: 'center',
                  marginTop: '3px', color: sel ? '#1a3a5c' : '#475569',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {n || (s.length > 10 ? s.slice(0, 10) + '…' : s)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: '6px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <MolImage smiles={smi} width={54} height={42} />
          {molName && <strong style={{ color: '#0f172a' }}>{molName}</strong>}
          <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>
            {smi.length > 55 ? smi.slice(0, 55) + '…' : smi}
          </span>
        </div>
      )}

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
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '520px' }}>
          <OrganPanel organ={selectedOrgan} results={allResults} smi={smi} risks={risks} />

          {selectedOrgan && (
            <BestMoleculesForOrgan
              organ={selectedOrgan}
              allResults={allResults}
              uniqueSmiles={uniqueSmiles}
              moleculeNames={moleculeNames}
              selectedSmi={smi}
              onSelect={s => { setSelectedSmi(s); }}
            />
          )}

          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
              Route of Administration
            </div>
            <ROABar icon="bi bi-capsule"      label="Oral"                      score={roa.oral.score}        factors={roa.oral.factors}        recommended={best === 'oral'} />
            <ROABar icon="bi bi-droplet-half" label="Injectable (IV / SC / IM)" score={roa.injectable.score}  factors={roa.injectable.factors}  recommended={best === 'injectable'} />
            <ROABar icon="bi bi-wind"         label="Inhalation"                score={roa.inhalation.score}  factors={roa.inhalation.factors}  recommended={best === 'inhalation'} />
            <ROABar icon="bi bi-bandaid"      label="Transdermal (topical)"     score={roa.transdermal.score} factors={roa.transdermal.factors} recommended={best === 'transdermal'} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default BodyMapDecision;
