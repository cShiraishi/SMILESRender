import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── types ─────────────────────────────────────────────────────────────────────

export interface PDFReportData {
  smiles: string;
  imgUrl?: string;
  descriptors?: Record<string, any>;
  admetRows?: Array<{ Tool: string; Category: string; Property: string; Value: string; Unit: string }>;
  docking?: {
    single?: {
      receptorId?: string;
      scores?: Array<{ mode: number; affinity: number; rmsd_lb?: number; rmsd_ub?: number; ki?: string }>;
      nativeRef?: { inhibitor: string; affinity: number; cached?: boolean };
      plip?: { interactions?: { hbonds?: any[]; hydrophobic?: any[]; pi_stacking?: any[] }; ki?: string };
      libprep?: { energy?: number; props?: Record<string, any> };
      pocket?: { center?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number } };
    };
    screening?: Array<{
      target: { name: string; pdbId: string; gene: string; organism: string; inhibitor: string; mechanism?: string };
      disease: { name: string };
      status: string;
      affinity?: number;
      poses?: number;
      nativeAffinity?: number;
      nativeStatus?: string;
    }>;
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

const PAGE_W  = 210;
const PAGE_H  = 297;
const MARGIN  = 14;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const COL = {
  navy:     [15,  23,  42]  as [number,number,number],
  teal:     [20, 184, 166]  as [number,number,number],
  purple:   [139, 92, 246]  as [number,number,number],
  green:    [16, 185, 129]  as [number,number,number],
  red:      [239, 68,  68]  as [number,number,number],
  amber:    [245, 158, 11]  as [number,number,number],
  blue:     [59, 130, 246]  as [number,number,number],
  indigo:   [99, 102, 241]  as [number,number,number],
  slate:    [100, 116, 139] as [number,number,number],
  lightBg:  [248, 250, 252] as [number,number,number],
  border:   [226, 232, 240] as [number,number,number],
};

function estimateKi(affinity: number): string {
  const ki = Math.exp(affinity / 0.592);
  if (ki < 1e-9)  return `${(ki * 1e12).toFixed(1)} pM`;
  if (ki < 1e-6)  return `${(ki * 1e9).toFixed(1)} nM`;
  if (ki < 1e-3)  return `${(ki * 1e6).toFixed(1)} µM`;
  return `${(ki * 1e3).toFixed(1)} mM`;
}

function affinityLabel(v: number): string {
  if (v <= -9)  return 'Strong';
  if (v <= -7)  return 'Good';
  if (v <= -5)  return 'Moderate';
  return 'Weak';
}

async function blobUrlToBase64(url: string): Promise<string | null> {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror  = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── page builder class ────────────────────────────────────────────────────────

class ReportBuilder {
  doc: jsPDF;
  y: number;
  pageNum: number;
  totalPages: number;

  constructor() {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    this.y = MARGIN;
    this.pageNum = 1;
    this.totalPages = 1;
  }

  get page() { return this.doc; }

  /** Move cursor down by `h` mm, adding a new page if needed */
  advance(h: number, minSpaceNeeded = 20) {
    this.y += h;
    if (this.y + minSpaceNeeded > PAGE_H - MARGIN) this.newPage();
  }

  newPage() {
    this.doc.addPage();
    this.pageNum++;
    this.y = MARGIN;
    this.addRunningHeader();
  }

  addRunningHeader() {
    this.doc.setFillColor(...COL.navy);
    this.doc.rect(0, 0, PAGE_W, 8, 'F');
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(7);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text('SMILES RENDER · Molecular Profiling Report', MARGIN, 5.5);
    this.doc.setTextColor(0, 0, 0);
  }

  sectionHeader(label: string, color: [number, number, number]) {
    if (this.y + 14 > PAGE_H - MARGIN) this.newPage();
    this.doc.setFillColor(...color);
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, 7, 1.5, 1.5, 'F');
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(8.5);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(label, MARGIN + 4, this.y + 4.8);
    this.doc.setTextColor(0, 0, 0);
    this.y += 10;
  }

  subHeader(label: string, color: [number, number, number]) {
    if (this.y + 10 > PAGE_H - MARGIN) this.newPage();
    this.doc.setTextColor(...color);
    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(label.toUpperCase(), MARGIN, this.y + 4);
    this.doc.setTextColor(0, 0, 0);
    this.y += 7;
  }

  divider() {
    this.doc.setDrawColor(...COL.border);
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y);
    this.y += 3;
  }

  keyVal(key: string, val: string, unit = '') {
    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(...COL.slate);
    this.doc.text(key, MARGIN + 2, this.y);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(15, 23, 42);
    this.doc.text(val + (unit ? ' ' + unit : ''), MARGIN + 55, this.y);
    this.y += 5;
  }

  table(
    head: string[],
    body: string[][],
    opts: { colWidths?: number[]; highlight?: number[]; compact?: boolean } = {},
  ) {
    const { colWidths, highlight = [0], compact = false } = opts;
    const colStyles: Record<number, any> = {};
    if (colWidths) {
      colWidths.forEach((w, i) => { colStyles[i] = { cellWidth: w }; });
    }
    highlight.forEach(i => {
      colStyles[i] = { ...colStyles[i], fontStyle: 'bold', textColor: [...COL.navy] };
    });

    autoTable(this.doc, {
      startY: this.y,
      head: [head],
      body,
      margin: { left: MARGIN, right: MARGIN },
      styles: {
        fontSize: compact ? 7 : 7.5,
        cellPadding: compact ? 1.2 : 1.8,
        font: 'helvetica',
        textColor: [30, 41, 59],
        lineColor: COL.border,
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: COL.navy,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: 2,
        halign: 'center',
      },
      alternateRowStyles: { fillColor: COL.lightBg },
      columnStyles: colStyles,
      didDrawPage: () => { this.y = ((this.doc as any).lastAutoTable?.finalY ?? this.y) + 5; },
    });
    this.y = ((this.doc as any).lastAutoTable?.finalY ?? this.y) + 6;
  }

  callout(text: string, color: [number, number, number], icon = '★') {
    if (this.y + 12 > PAGE_H - MARGIN) this.newPage();
    this.doc.setFillColor(color[0], color[1], color[2], 0.12 as any);
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, 9, 1.5, 1.5, 'F');
    this.doc.setDrawColor(...color);
    this.doc.setLineWidth(0.3);
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, 9, 1.5, 1.5, 'S');
    this.doc.setTextColor(...color);
    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(`${icon}  ${text}`, MARGIN + 4, this.y + 5.8);
    this.doc.setTextColor(0, 0, 0);
    this.y += 12;
  }
}

// ── section builders ──────────────────────────────────────────────────────────

async function buildCover(rb: ReportBuilder, data: PDFReportData) {
  const doc = rb.doc;

  // Nav bar
  doc.setFillColor(...COL.navy);
  doc.rect(0, 0, PAGE_W, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SMILES', MARGIN, 9);
  doc.setTextColor(125, 211, 252);
  doc.text('Render', MARGIN + 22, 9);
  doc.setTextColor(148, 168, 201);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Molecular Intelligence Platform', MARGIN + 49, 9);

  // Date (top right)
  doc.setTextColor(148, 168, 201);
  doc.setFontSize(7);
  const dateStr = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  doc.text(dateStr, PAGE_W - MARGIN, 9, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  rb.y = 22;

  // Title
  doc.setTextColor(...COL.navy);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Molecular Profiling Report', MARGIN, rb.y);
  rb.y += 8;

  // SMILES chip
  const smilesDisplay = data.smiles.length > 90 ? data.smiles.slice(0, 90) + '…' : data.smiles;
  doc.setFillColor(...COL.lightBg);
  doc.roundedRect(MARGIN, rb.y, CONTENT_W, 8, 2, 2, 'F');
  doc.setDrawColor(...COL.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, rb.y, CONTENT_W, 8, 2, 2, 'S');
  doc.setTextColor(...COL.slate);
  doc.setFontSize(7.5);
  doc.setFont('courier', 'normal');
  doc.text(smilesDisplay, MARGIN + 3, rb.y + 5);
  doc.setFont('helvetica', 'normal');
  rb.y += 12;

  // Molecule image
  if (data.imgUrl) {
    const imgData = await blobUrlToBase64(data.imgUrl);
    if (imgData) {
      const imgW = 80, imgH = 60;
      const imgX = (PAGE_W - imgW) / 2;
      try {
        doc.addImage(imgData, 'PNG', imgX, rb.y, imgW, imgH, undefined, 'FAST');
      } catch { /* image embed failed — skip */ }
      rb.y += imgH + 6;
    }
  }

  // Quick stats pills row
  if (data.descriptors) {
    const d = data.descriptors;
    const pills = [
      { label: 'MW',       value: d.MolecularWeight != null ? `${Number(d.MolecularWeight).toFixed(1)} Da` : '—' },
      { label: 'LogP',     value: d.LogP != null ? String(d.LogP) : '—' },
      { label: 'HBD / HBA', value: (d.HBD != null && d.HBA != null) ? `${d.HBD} / ${d.HBA}` : '—' },
      { label: 'TPSA',     value: d.TPSA != null ? `${Number(d.TPSA).toFixed(1)} Å²` : '—' },
      { label: 'QED',      value: d.QED != null ? String(d.QED) : '—' },
      { label: 'Lipinski', value: (d.LipinskiViolations ?? 0) === 0 ? 'Pass ✓' : `${d.LipinskiViolations} violations` },
    ];
    const pillW = CONTENT_W / pills.length;
    pills.forEach((p, i) => {
      const px = MARGIN + i * pillW;
      doc.setFillColor(i % 2 === 0 ? 241 : 248, i % 2 === 0 ? 245 : 250, i % 2 === 0 ? 255 : 252);
      doc.roundedRect(px, rb.y, pillW - 2, 13, 1.5, 1.5, 'F');
      doc.setTextColor(...COL.navy);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(p.value, px + (pillW - 2) / 2, rb.y + 5.5, { align: 'center' });
      doc.setTextColor(...COL.slate);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(p.label, px + (pillW - 2) / 2, rb.y + 10, { align: 'center' });
    });
    rb.y += 17;
  }

  rb.divider();
}

function buildDescriptors(rb: ReportBuilder, desc: Record<string, any>) {
  rb.sectionHeader('2  ·  Physicochemical Descriptors', COL.indigo);

  // Drug-likeness table
  rb.subHeader('Drug-likeness & ADME Rules', COL.indigo);
  const dlProps: [string, string, string][] = [
    ['Molecular Weight',   desc.MolecularWeight  != null ? `${Number(desc.MolecularWeight).toFixed(2)}` : '—', 'Da   ≤ 500'],
    ['Exact MW',          desc.ExactMolWt        != null ? `${Number(desc.ExactMolWt).toFixed(4)}`  : '—', 'Da'],
    ['LogP (Crippen)',    desc.LogP              != null ? String(desc.LogP)  : '—', '≤ 5'],
    ['HBD',              desc.HBD               != null ? String(desc.HBD)   : '—', '≤ 5'],
    ['HBA',              desc.HBA               != null ? String(desc.HBA)   : '—', '≤ 10'],
    ['TPSA',             desc.TPSA              != null ? `${Number(desc.TPSA).toFixed(2)}`  : '—', 'Å²   ≤ 140'],
    ['Rotatable Bonds',  desc.RotatableBonds    != null ? String(desc.RotatableBonds) : '—', '≤ 10'],
    ['QED',              desc.QED               != null ? String(desc.QED)   : '—', '0–1 (higher = better)'],
    ['Fsp³',            desc.FractionCSP3      != null ? String(desc.FractionCSP3)  : '—', '≥ 0.25 preferred'],
    ['Heavy Atoms',      desc.HeavyAtoms        != null ? String(desc.HeavyAtoms)   : '—', ''],
    ['Molar Refractivity', desc.MolMR           != null ? String(desc.MolMR) : '—', '40–130'],
  ];
  rb.table(
    ['Property', 'Value', 'Guideline'],
    dlProps.map(([p, v, g]) => [p, v, g]),
    { colWidths: [65, 30, 87], highlight: [0] },
  );

  // Rule compliance
  rb.subHeader('Rule Compliance', COL.green);
  const ruleRows: [string, string, string][] = [
    ['Lipinski Ro5',   (desc.LipinskiViolations ?? 0) === 0 ? '✓ Pass' : `✗ ${desc.LipinskiViolations} violations`, 'MW ≤ 500, LogP ≤ 5, HBD ≤ 5, HBA ≤ 10'],
    ['Veber',          (desc.VerberViolations ?? 0) === 0 ? '✓ Pass' : `✗ ${desc.VerberViolations} violations`, 'RotBonds ≤ 10, TPSA ≤ 140'],
    ['Egan',           (desc.EganViolations ?? 0) === 0 ? '✓ Pass' : `✗ ${desc.EganViolations} violations`, 'LogP ≤ 5.88, TPSA ≤ 131.6'],
  ];
  rb.table(
    ['Rule', 'Result', 'Criteria'],
    ruleRows,
    { colWidths: [50, 35, 97], highlight: [1] },
  );

  // Topological
  rb.subHeader('Topological Descriptors', COL.purple);
  const topoProps: [string, string][] = [
    ['BalabanJ',  desc.BalabanJ  != null ? String(desc.BalabanJ) : '—'],
    ['BertzCT',   desc.BertzCT   != null ? String(desc.BertzCT)  : '—'],
    ['Kappa1',    desc.Kappa1    != null ? String(desc.Kappa1)   : '—'],
    ['Kappa2',    desc.Kappa2    != null ? String(desc.Kappa2)   : '—'],
    ['Kappa3',    desc.Kappa3    != null ? String(desc.Kappa3)   : '—'],
    ['Aromatic Rings', desc.AromaticRings  != null ? String(desc.AromaticRings) : '—'],
    ['Aliphatic Rings', desc.AliphaticRings != null ? String(desc.AliphaticRings) : '—'],
  ];
  // 2-column layout
  const half = Math.ceil(topoProps.length / 2);
  const topoRows = [];
  for (let i = 0; i < half; i++) {
    const left  = topoProps[i];
    const right = topoProps[i + half] ?? ['', ''];
    topoRows.push([left[0], left[1], right[0], right[1]]);
  }
  rb.table(
    ['Property', 'Value', 'Property', 'Value'],
    topoRows,
    { colWidths: [50, 25, 50, 57], highlight: [0, 2] },
  );
}

function buildADMET(rb: ReportBuilder, rows: PDFReportData['admetRows']) {
  if (!rows?.length) return;

  rb.sectionHeader('3  ·  ADMET Profile', COL.green);

  const grouped: Record<string, typeof rows> = {};
  rows.forEach(r => {
    if (!grouped[r.Tool]) grouped[r.Tool] = [];
    grouped[r.Tool].push(r);
  });

  const TOOL_META: Record<string, { color: [number,number,number]; label: string }> = {
    'RDKit':      { color: COL.indigo, label: 'RDKit Filters' },
    'StopTox':    { color: COL.red,    label: 'StopTox — Toxicity' },
    'StopLight':  { color: COL.amber,  label: 'StopLight' },
    'Tox21':      { color: COL.red,    label: 'Tox21 Panel (12 endpoints)' },
    'DeepADMET':  { color: COL.teal,   label: 'DeepADMET' },
    'GraphB3':    { color: COL.blue,   label: 'GraphB3 — Blood–Brain Barrier' },
  };
  const ORDER = ['RDKit', 'StopTox', 'StopLight', 'Tox21', 'DeepADMET', 'GraphB3'];

  ORDER.forEach(tool => {
    const toolRows = grouped[tool];
    if (!toolRows?.length) return;
    const meta = TOOL_META[tool] ?? { color: COL.slate, label: tool };
    rb.subHeader(meta.label, meta.color);

    const hasUnit = toolRows.some(r => r.Unit);
    if (hasUnit) {
      rb.table(
        ['Category', 'Property', 'Value', 'Unit'],
        toolRows.map(r => [r.Category, r.Property, r.Value, r.Unit || '—']),
        { colWidths: [38, 60, 50, 34], highlight: [1], compact: true },
      );
    } else {
      rb.table(
        ['Category', 'Property', 'Value'],
        toolRows.map(r => [r.Category, r.Property, r.Value]),
        { colWidths: [40, 80, 62], highlight: [1], compact: true },
      );
    }
  });
}

function buildDocking(rb: ReportBuilder, single: NonNullable<PDFReportData['docking']>['single']) {
  if (!single) return;

  rb.sectionHeader('4  ·  Docking Analysis — Single Target', COL.teal);

  // Target info
  if (single.receptorId || single.pocket) {
    rb.subHeader('Target & Grid', COL.teal);
    if (single.receptorId) rb.keyVal('PDB ID', single.receptorId.toUpperCase());
    if (single.pocket?.center) {
      const c = single.pocket.center;
      rb.keyVal('Grid center', `X = ${c.x?.toFixed(2)}   Y = ${c.y?.toFixed(2)}   Z = ${c.z?.toFixed(2)}`);
    }
    if (single.pocket?.size) {
      const s = single.pocket.size;
      rb.keyVal('Grid size', `X = ${s.x?.toFixed(1)}   Y = ${s.y?.toFixed(1)}   Z = ${s.z?.toFixed(1)}   Å`);
    }
    if (single.libprep?.energy != null) {
      rb.keyVal('LibPrep energy', String(single.libprep.energy), 'kcal/mol (MMFF94)');
    }
    rb.y += 2;
  }

  // Vina poses
  if (single.scores?.length) {
    rb.subHeader('AutoDock Vina — Docking Poses', COL.red);
    rb.table(
      ['Pose', 'Affinity (kcal/mol)', 'RMSD l.b. (Å)', 'RMSD u.b. (Å)', 'Ki (estimated)', 'Classification'],
      single.scores.map((s, i) => [
        String(i === 0 ? '★ 1 (best)' : s.mode),
        String(s.affinity),
        s.rmsd_lb != null ? String(s.rmsd_lb) : '—',
        s.rmsd_ub != null ? String(s.rmsd_ub) : '—',
        estimateKi(s.affinity),
        affinityLabel(s.affinity),
      ]),
      { colWidths: [28, 38, 30, 30, 32, 24], highlight: [0, 1] },
    );
  }

  // Redocking validation
  if (single.nativeRef) {
    rb.subHeader('Redocking Validation', COL.purple);
    const diff  = parseFloat(String(single.scores?.[0]?.affinity)) - single.nativeRef.affinity;
    const beats = diff < 0;
    rb.table(
      ['Molecule', 'Affinity (kcal/mol)', 'Ki (est.)', 'Assessment'],
      [
        [single.nativeRef.inhibitor + ' (native ref.)', String(single.nativeRef.affinity), estimateKi(single.nativeRef.affinity), 'Reference'],
        ['Query molecule (pose 1)',   String(single.scores?.[0]?.affinity ?? '—'), single.scores?.[0]?.affinity != null ? estimateKi(single.scores[0].affinity) : '—', beats ? `▲ ${Math.abs(diff).toFixed(1)} kcal/mol better` : `▼ ${Math.abs(diff).toFixed(1)} kcal/mol weaker`],
      ],
      { colWidths: [55, 38, 30, 59], highlight: [0] },
    );
    if (beats) {
      rb.callout(`Query molecule outperforms native inhibitor ${single.nativeRef.inhibitor} by ${Math.abs(diff).toFixed(1)} kcal/mol`, COL.green, '★');
    }
  }

  // PLIP interactions
  const plip = single.plip;
  if (plip?.interactions) {
    rb.subHeader('Protein–Ligand Interactions (PLIP)', COL.green);
    const hb = plip.interactions.hbonds       ?? [];
    const hy = plip.interactions.hydrophobic  ?? [];
    const pi = plip.interactions.pi_stacking  ?? [];

    rb.table(
      ['Interaction type', 'Count'],
      [
        ['Hydrogen bonds',           String(hb.length)],
        ['Hydrophobic contacts',     String(hy.length)],
        ['π–π stacking',            String(pi.length)],
        ...(plip.ki ? [['Ki (PLIP estimate)', plip.ki]] : []),
      ],
      { colWidths: [80, 102], highlight: [0] },
    );

    if (hb.length > 0) {
      rb.table(
        ['H-bond', 'Residue', 'Distance (Å)', 'Type'],
        hb.map((h: any, i: number) => [String(i + 1), h.residue ?? '—', h.dist ?? '—', h.type ?? 'H-bond']),
        { colWidths: [15, 60, 35, 72], compact: true },
      );
    }
    if (hy.length > 0) {
      rb.table(
        ['Contact', 'Residue', 'Distance (Å)'],
        hy.map((h: any, i: number) => [String(i + 1), h.residue ?? '—', h.dist ?? '—']),
        { colWidths: [15, 80, 87], compact: true },
      );
    }
  }
}

function buildScreening(rb: ReportBuilder, screening: NonNullable<PDFReportData['docking']>['screening']) {
  if (!screening?.length) return;
  const done = screening.filter(r => r.status === 'done' && r.affinity != null)
    .sort((a, b) => (a.affinity ?? 0) - (b.affinity ?? 0));
  if (!done.length) return;

  rb.sectionHeader('5  ·  Multi-Target Screening', COL.amber);

  const best = done[0];
  rb.callout(
    `Best hit: ${best.target.name} (${best.target.pdbId}) · ${best.affinity} kcal/mol · ${best.disease.name}`,
    COL.amber, '⬤',
  );

  rb.table(
    ['#', 'Target', 'Gene', 'PDB', 'Disease', 'Affinity', 'Ki (est.)', 'Native ref.', 'Δ vs ref.'],
    done.map((r, i) => {
      const nativeStr = r.nativeAffinity != null ? `${r.nativeAffinity} kcal/mol` : '—';
      let deltaStr = '—';
      if (r.nativeAffinity != null && r.affinity != null) {
        const delta = r.affinity - r.nativeAffinity;
        deltaStr = delta < 0 ? `▲ ${Math.abs(delta).toFixed(1)}` : `▼ ${Math.abs(delta).toFixed(1)}`;
      }
      return [
        String(i + 1),
        r.target.name,
        r.target.gene ?? '—',
        r.target.pdbId,
        r.disease.name,
        `${r.affinity} kcal/mol`,
        estimateKi(r.affinity!),
        nativeStr,
        deltaStr,
      ];
    }),
    { colWidths: [8, 38, 18, 15, 26, 22, 18, 22, 15], compact: true, highlight: [0, 1, 5] },
  );
}

function buildFooter(rb: ReportBuilder, smiles: string) {
  rb.newPage();
  rb.sectionHeader('Notes & References', COL.slate);

  rb.doc.setFontSize(8);
  rb.doc.setFont('helvetica', 'normal');
  rb.doc.setTextColor(...COL.slate);

  const lines = [
    'This report was generated automatically by SMILES Render Molecular Intelligence Platform.',
    '',
    'Docking performed with AutoDock Vina (Eberhardt et al., J. Chem. Inf. Model. 2021).',
    'Protein–ligand interactions analyzed with PLIP (Salentin et al., Nucleic Acids Research 2015).',
    'Ligand 3D preparation with RDKit MMFF94 force field.',
    'ADMET predictions: RDKit, StopTox, StopLight, Tox21, DeepADMET, GraphB3.',
    '',
    'Input SMILES: ' + smiles,
    '',
    'Important: computational predictions are for research purposes only and do not constitute',
    'clinical or regulatory advice. Always validate predictions experimentally.',
  ];

  lines.forEach(line => {
    rb.doc.text(line, MARGIN, rb.y);
    rb.y += line === '' ? 3 : 5.5;
  });
}

// ── main export ───────────────────────────────────────────────────────────────

export async function generatePDFReport(data: PDFReportData): Promise<void> {
  const rb = new ReportBuilder();

  // Cover
  await buildCover(rb, data);

  // Descriptors
  if (data.descriptors && Object.keys(data.descriptors).length > 0) {
    rb.newPage();
    buildDescriptors(rb, data.descriptors);
  }

  // ADMET
  if (data.admetRows?.length) {
    rb.newPage();
    buildADMET(rb, data.admetRows);
  }

  // Docking — single target
  if (data.docking?.single?.scores?.length) {
    rb.newPage();
    buildDocking(rb, data.docking.single);
  }

  // Docking — multi-target screening
  if (data.docking?.screening?.some(r => r.status === 'done')) {
    rb.newPage();
    buildScreening(rb, data.docking.screening);
  }

  // Footer / references
  buildFooter(rb, data.smiles);

  // Save
  const filename = `smiles_report_${data.smiles.slice(0, 20).replace(/[^A-Za-z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  rb.doc.save(filename);
}
