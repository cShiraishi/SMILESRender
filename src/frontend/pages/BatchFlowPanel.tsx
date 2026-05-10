import React, { useState, useRef, useCallback } from 'react';
import { colors, shadow, radius } from '../styles/themes';

// ── helpers ───────────────────────────────────────────────────────────────────

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

// Pure .includes() — zero regex ambiguity, works for any SMILES
function looksLikeSmiles(s: string): boolean {
  const t = s.trim();
  if (!t || t.length < 2) return false;
  // SMILES never have spaces
  if (t.indexOf(' ') !== -1 || t.indexOf('\t') !== -1) return false;
  // Must have at least one SMILES-distinctive character
  return (
    t.indexOf('(') !== -1 ||
    t.indexOf('[') !== -1 ||
    t.indexOf('=') !== -1 ||
    t.indexOf('@') !== -1 ||
    t.indexOf('#') !== -1
  );
}

function parseLine(line: string, fallback: string): { name: string; smiles: string } | null {
  line = line.trim();
  if (!line || line.startsWith('#')) return null;

  // Tab or comma-separated: name,SMILES or SMILES,name
  for (const sep of ['\t', ',']) {
    if (line.indexOf(sep) !== -1) {
      const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 2) {
        if (looksLikeSmiles(parts[0])) return { smiles: parts[0], name: parts.slice(1).join(' ') || fallback };
        if (looksLikeSmiles(parts[1])) return { smiles: parts[1], name: parts[0] || fallback };
        const last = parts[parts.length - 1];
        if (looksLikeSmiles(last))     return { smiles: last, name: parts.slice(0, -1).join(' ') || fallback };
      }
    }
  }

  // Space-separated or single token
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Single token — most common batch input (SMILES-only line)
  if (tokens.length === 1) {
    return looksLikeSmiles(tokens[0]) ? { smiles: tokens[0], name: fallback } : null;
  }

  // Multiple tokens: first or last should be the SMILES
  if (looksLikeSmiles(tokens[0]))                 return { smiles: tokens[0],                name: tokens.slice(1).join(' ') };
  if (looksLikeSmiles(tokens[tokens.length - 1])) return { smiles: tokens[tokens.length - 1], name: tokens.slice(0, -1).join(' ') };

  return null;
}

function parseTextInput(text: string): { name: string; smiles: string }[] {
  // Normalize all line endings
  const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const results: { name: string; smiles: string }[] = [];
  const seen = new Set<string>();
  let idx = 1;
  for (const line of norm.split('\n')) {
    const p = parseLine(line, `Mol ${idx}`);
    if (p && !seen.has(p.smiles)) {
      seen.add(p.smiles);
      results.push(p);
      idx++;
    }
  }
  return results;
}

function parseCsvText(text: string): { name: string; smiles: string }[] {
  const norm  = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = norm.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const sep  = lines[0].split('\t').length >= lines[0].split(',').length ? '\t' : ',';
  const rows = lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
  const header = rows[0].map(h => h.toLowerCase());
  const dataRows = rows.slice(1);

  let smiIdx = header.findIndex(h => /^smiles$|^smile$|^canonical_smiles/.test(h));
  if (smiIdx === -1) smiIdx = (dataRows[0] ?? []).findIndex(c => looksLikeSmiles(c));
  if (smiIdx === -1) return [];

  let nameIdx = header.findIndex(h => /^name$|^compound_?name|^mol_?name|^id$|^label$/.test(h));
  if (nameIdx === -1) nameIdx = smiIdx === 0 ? 1 : 0;

  const results: { name: string; smiles: string }[] = [];
  const seen = new Set<string>();
  let idx = 1;
  for (const row of dataRows) {
    const smi = row[smiIdx]?.trim();
    if (!smi || !looksLikeSmiles(smi) || seen.has(smi)) continue;
    seen.add(smi);
    const name = (nameIdx >= 0 && nameIdx < row.length && row[nameIdx]?.trim())
      ? row[nameIdx].trim() : `Mol ${idx}`;
    results.push({ smiles: smi, name });
    idx++;
  }
  return results;
}

// ── types ─────────────────────────────────────────────────────────────────────

type MolStatus = 'idle' | 'processing' | 'done' | 'error';

interface BatchMol {
  id: string;
  index: number;
  name: string;
  smiles: string;
  status: MolStatus;
  error?: string;
  mw?: number;
  logp?: number;
  qed?: number;
  tpsa?: number;
  lipinskiPass?: boolean;
  painsPass?: boolean;
  esolCategory?: string;
  bbbPermeable?: boolean;
  bbbProb?: number;
  amesProb?: number;
  hergProb?: number;
}

const MAX_MOLS   = 20;
const CHUNK_SIZE = 4;

// ── component ─────────────────────────────────────────────────────────────────

interface BatchFlowPanelProps {
  onSmilesChange?: (s: string) => void;
}

const BatchFlowPanel: React.FC<BatchFlowPanelProps> = () => {
  const [textInput,  setTextInput]  = useState('');
  const [mols,       setMols]       = useState<BatchMol[]>([]);
  const [running,    setRunning]    = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [parseWarn,  setParseWarn]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const updateMol = useCallback((id: string, patch: Partial<BatchMol>) =>
    setMols(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m)), []);

  const applyParsed = useCallback((pairs: { name: string; smiles: string }[]) => {
    const limited = pairs.slice(0, MAX_MOLS);
    setMols(limited.map((p, i) => ({
      id: `bm_${i}_${Date.now()}`, index: i + 1,
      name: p.name, smiles: p.smiles, status: 'idle',
    })));
    setParseWarn(pairs.length > MAX_MOLS
      ? `Limitado a ${MAX_MOLS} moléculas (${pairs.length} no total).` : '');
    setExportDone(false);
  }, []);

  const handleTextChange = (val: string) => {
    setTextInput(val);
    if (!val.trim()) { setMols([]); return; }
    applyParsed(parseTextInput(val));
  };

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCsvText(text);
      if (!parsed.length) { setParseWarn('Coluna SMILES não detectada no CSV.'); return; }
      setTextInput(parsed.map(p => p.name ? `${p.smiles}\t${p.name}` : p.smiles).join('\n'));
      applyParsed(parsed);
    };
    reader.readAsText(file);
  };

  const processMol = async (mol: BatchMol): Promise<void> => {
    updateMol(mol.id, { status: 'processing' });
    const enc = encodeURIComponent(b64(mol.smiles));
    try {
      const [rdkitRes, bbbRes, deepRes] = await Promise.allSettled([
        fetch(`/predict/rdkit-filters/base64/${enc}`).then(r => r.json()),
        fetch(`/predict/bbb/base64/${enc}`).then(r => r.json()),
        fetch(`/deep/${enc}`).then(r => r.json()),
      ]);

      const patch: Partial<BatchMol> = { status: 'done' };

      if (rdkitRes.status === 'fulfilled' && !rdkitRes.value?.error) {
        const d = rdkitRes.value;
        patch.lipinskiPass = d.lipinski?.pass;
        patch.painsPass    = d.pains?.pass;
        patch.esolCategory = d.esol?.category;
      }
      if (bbbRes.status === 'fulfilled' && !bbbRes.value?.error) {
        patch.bbbPermeable = bbbRes.value.permeable;
        patch.bbbProb      = bbbRes.value.probability;
      }
      if (deepRes.status === 'fulfilled' && Array.isArray(deepRes.value)) {
        const list = deepRes.value as any[];
        const ames = list.find(r => r.Property === 'AMES');
        const herg = list.find(r => r.Property === 'hERG');
        if (ames) patch.amesProb = parseFloat(String(ames.Value));
        if (herg) patch.hergProb = parseFloat(String(herg.Value));
      }

      updateMol(mol.id, patch);
    } catch (e: any) {
      updateMol(mol.id, { status: 'error', error: e.message ?? 'Erro' });
    }
  };

  const runBatch = async () => {
    if (!mols.length || running) return;
    setRunning(true);
    setExportDone(false);
    // Capture snapshot before any async state updates
    const snapshot = mols.slice();
    setMols(prev => prev.map(m => ({ ...m, status: 'idle', error: undefined })));

    // Batch descriptors (single call for all molecules)
    try {
      const res = await fetch('/descriptors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles: snapshot.map(m => m.smiles) }),
      });
      const data: any[] = await res.json();
      setMols(prev => prev.map((m, i) => {
        const d = data[i];
        if (!d || d.error) return m;
        return { ...m, mw: d.MolecularWeight, logp: d.LogP, qed: d.QED, tpsa: d.TPSA };
      }));
    } catch { /* continue — descriptors optional */ }

    // Per-molecule ADMET in parallel chunks
    for (let i = 0; i < snapshot.length; i += CHUNK_SIZE) {
      await Promise.all(snapshot.slice(i, i + CHUNK_SIZE).map(mol => processMol(mol)));
    }

    setRunning(false);
  };

  const exportExcel = async () => {
    const rows: any[] = [];
    for (const m of mols.filter(m => m.status === 'done')) {
      const push = (tool: string, cat: string, prop: string, val: any, unit = '') => {
        if (val !== undefined && val !== null)
          rows.push({ SMILES: m.smiles, Tool: tool, Category: cat, Property: prop, Value: String(val), Unit: unit });
      };
      if (m.name) push('Batch', 'Input', 'Name', m.name);
      push('Descriptors', 'Physicochemical', 'MolecularWeight', m.mw,    'Da');
      push('Descriptors', 'Physicochemical', 'LogP',            m.logp);
      push('Descriptors', 'Physicochemical', 'QED',             m.qed);
      push('Descriptors', 'Physicochemical', 'TPSA',            m.tpsa,  'Å²');
      if (m.lipinskiPass !== undefined) push('RDKit', 'Drug-likeness', 'Lipinski', m.lipinskiPass ? 'Pass' : 'Fail');
      if (m.painsPass    !== undefined) push('RDKit', 'Drug-likeness', 'PAINS',    m.painsPass    ? 'Pass' : 'Fail');
      push('RDKit',      'Solubility',       'ESOL_Category',   m.esolCategory);
      if (m.bbbPermeable !== undefined) push('BBB', 'CNS', 'BBB_Permeable', m.bbbPermeable ? 'Yes' : 'No');
      push('BBB',      'CNS',          'BBB_Probability', m.bbbProb);
      push('DeepADMET', 'Toxicity',    'AMES',            m.amesProb);
      push('DeepADMET', 'Toxicity',    'hERG',            m.hergProb);
    }
    if (!rows.length) return;
    setExporting(true);
    try {
      const res  = await fetch('/export/excel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error('Export falhou');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `batch_flow_${Date.now()}.xlsx`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setExportDone(true);
    } catch { /* silent */ }
    finally { setExporting(false); }
  };

  const done       = mols.filter(m => m.status === 'done').length;
  const errors     = mols.filter(m => m.status === 'error').length;
  const processing = mols.filter(m => m.status === 'processing').length;
  const hasMols    = mols.length > 0;

  // ── small display helpers ──────────────────────────────────────────────────

  const riskBadge = (prob: number | undefined) => {
    if (prob === undefined) return <span style={{ color: '#cbd5e1' }}>—</span>;
    const hi  = prob >= 0.5;
    const pct = Math.round(prob * 100);
    return (
      <span style={{
        fontSize: 10, padding: '1px 5px', borderRadius: 5, fontWeight: 700,
        backgroundColor: hi ? '#fee2e2' : '#dcfce7',
        color: hi ? '#dc2626' : '#16a34a',
      }}>{pct}%</span>
    );
  };

  const checkMark = (v: boolean | undefined, trueGood = true) => {
    if (v === undefined) return <span style={{ color: '#cbd5e1' }}>—</span>;
    const ok = trueGood ? v : !v;
    return ok
      ? <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 700 }}>✓</span>
      : <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 700 }}>✗</span>;
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Input card ── */}
      <div style={{
        backgroundColor: '#fff',
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        boxShadow: shadow.sm,
        overflow: 'hidden',
      }}>
        {/* Card header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', borderBottom: `1px solid ${colors.borderLight}`,
          backgroundColor: '#f8fafc',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="bi bi-list-ul" style={{ color: '#fff', fontSize: 13 }} />
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.navy }}>Entrada em Lote</span>
            <span style={{ fontSize: 11, color: colors.textMuted, marginLeft: 8 }}>até {MAX_MOLS} moléculas</span>
          </div>
          {hasMols && (
            <span style={{
              marginLeft: 'auto', fontSize: 12, fontWeight: 700,
              padding: '3px 10px', borderRadius: 20,
              backgroundColor: '#e0e7ff', color: '#4338ca',
            }}>
              {mols.length} detectada{mols.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Textarea */}
        <div style={{ padding: '14px 18px' }}>
          <textarea
            value={textInput}
            onChange={e => handleTextChange(e.target.value)}
            placeholder={
              'Cole um SMILES por linha. Formatos suportados:\n' +
              '  CC(=O)Oc1ccccc1C(=O)O\n' +
              '  CC(=O)Oc1ccccc1C(=O)O   Aspirina\n' +
              '  Aspirina,CC(=O)Oc1ccccc1C(=O)O\n\n' +
              'Ou importe um CSV com coluna "smiles" e coluna "name".'
            }
            style={{
              width: '100%', minHeight: 140, padding: '10px 12px',
              fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
              border: `1px solid ${colors.border}`, borderRadius: radius.md,
              outline: 'none', resize: 'vertical',
              color: colors.text, backgroundColor: '#fafafa',
              boxSizing: 'border-box',
            }}
          />

          {/* Parse warning */}
          {parseWarn && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="bi bi-exclamation-triangle" />{parseWarn}
            </div>
          )}

          {/* Action row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <input type="file" accept=".csv,.tsv,.txt" ref={fileRef} style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }} />

            <button onClick={() => fileRef.current?.click()}
              style={{
                padding: '7px 14px', borderRadius: radius.md,
                border: `1px solid ${colors.border}`,
                backgroundColor: '#fff', color: colors.textMuted,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
              <i className="bi bi-filetype-csv" style={{ color: '#059669' }} />
              Importar CSV
            </button>

            {hasMols && (
              <span style={{ fontSize: 12, color: colors.textMuted }}>
                <strong style={{ color: colors.navy }}>{mols.length}</strong> molécula{mols.length !== 1 ? 's' : ''}
              </span>
            )}

            <button
              onClick={runBatch}
              disabled={!hasMols || running}
              style={{
                marginLeft: 'auto', padding: '8px 22px',
                borderRadius: radius.md, border: 'none',
                backgroundColor: !hasMols || running ? colors.border : '#6366f1',
                color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: !hasMols || running ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                transition: 'background-color 0.2s',
              }}>
              {running
                ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span> Processando…</>
                : <><i className="bi bi-play-fill" /> Analisar Lote</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      {(running || done > 0 || errors > 0) && hasMols && (
        <div style={{
          padding: '10px 16px', borderRadius: radius.md,
          backgroundColor: running ? '#eff6ff' : done > 0 ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${running ? '#bfdbfe' : done > 0 ? '#a7f3d0' : '#fca5a5'}`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: running ? '#1e40af' : done > 0 ? '#065f46' : '#991b1b' }}>
                {running
                  ? `${done + errors} / ${mols.length}${processing > 0 ? ` · ${processing} em execução` : ''}`
                  : `${done} concluída${done !== 1 ? 's' : ''}${errors > 0 ? ` · ${errors} erro${errors !== 1 ? 's' : ''}` : ''}`}
              </span>
              {!running && done > 0 && (
                <span style={{ fontSize: 11, color: '#059669' }}>
                  <i className="bi bi-check-circle-fill" style={{ marginRight: 4 }} />Pronto para exportar
                </span>
              )}
            </div>
            <div style={{ height: 5, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${mols.length > 0 ? ((done + errors) / mols.length) * 100 : 0}%`,
                backgroundColor: running ? '#6366f1' : done > 0 ? '#059669' : '#ef4444',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
          {!running && done > 0 && (
            <button onClick={exportExcel} disabled={exporting}
              style={{
                padding: '7px 16px', borderRadius: radius.md, border: 'none',
                backgroundColor: exporting ? colors.border : exportDone ? '#059669' : '#0ea5e9',
                color: '#fff', fontWeight: 600, fontSize: 12,
                cursor: exporting ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              }}>
              <i className="bi bi-file-earmark-excel" />
              {exporting ? 'Exportando…' : exportDone ? '✓ Exportado' : 'Download Excel'}
            </button>
          )}
        </div>
      )}

      {/* ── Results table ── */}
      {hasMols && (
        <div style={{
          backgroundColor: '#fff',
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          boxShadow: shadow.sm,
          overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            padding: '10px 16px', borderBottom: `1px solid ${colors.borderLight}`,
            backgroundColor: '#f8fafc',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="bi bi-table" style={{ color: '#6366f1', fontSize: 13 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.navy, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Resultados
            </span>
            {done > 0 && (
              <span style={{ fontSize: 11, color: colors.textMuted }}>
                — {done} de {mols.length} análises concluídas
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: `2px solid ${colors.border}` }}>
                  {[
                    { l: '#',       w: 28  },
                    { l: 'Struct.', w: 90  },
                    { l: 'Nome',    w: 130 },
                    { l: 'MW',      w: 60  },
                    { l: 'LogP',    w: 55  },
                    { l: 'QED',     w: 50  },
                    { l: 'Lip.',    w: 42  },
                    { l: 'PAINS',   w: 50  },
                    { l: 'BBB',     w: 60  },
                    { l: 'AMES',    w: 52  },
                    { l: 'hERG',    w: 52  },
                    { l: 'ESOL',    w: 80  },
                    { l: '',        w: 28  },
                  ].map(({ l, w }) => (
                    <th key={l} style={{
                      padding: '7px 8px', textAlign: 'left', fontSize: 10, width: w,
                      fontWeight: 700, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mols.map(m => (
                  <tr key={m.id} style={{
                    borderBottom: `1px solid ${colors.borderLight}`,
                    backgroundColor:
                      m.status === 'processing' ? '#f5f3ff' :
                      m.status === 'error'       ? '#fef2f2' : 'transparent',
                    transition: 'background-color 0.2s',
                  }}>
                    {/* # */}
                    <td style={{ padding: '7px 8px', color: '#94a3b8', fontWeight: 700, verticalAlign: 'middle', fontSize: 11 }}>
                      {m.index}
                    </td>

                    {/* Structure */}
                    <td style={{ padding: '5px 8px', verticalAlign: 'middle' }}>
                      <img
                        src={`/render?smiles=${encodeURIComponent(m.smiles)}&width=80&height=58`}
                        alt={m.name}
                        style={{ width: 80, height: 58, objectFit: 'contain', display: 'block', border: `1px solid ${colors.borderLight}`, borderRadius: 6, backgroundColor: '#fff' }}
                        loading="lazy"
                      />
                    </td>

                    {/* Name + SMILES */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', maxWidth: 130 }}>
                      <div style={{ fontWeight: 700, color: colors.navy, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 126 }}>
                        {m.name || <span style={{ color: colors.textLight, fontStyle: 'italic', fontWeight: 400 }}>sem nome</span>}
                      </div>
                      <div title={m.smiles} style={{ fontSize: 10, color: colors.textLight, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 126 }}>
                        {m.smiles.length > 22 ? m.smiles.slice(0, 22) + '…' : m.smiles}
                      </div>
                    </td>

                    {/* MW */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {m.mw !== undefined
                        ? <span style={{ fontWeight: 600, color: colors.navy }}>{m.mw.toFixed(1)}</span>
                        : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>

                    {/* LogP */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {m.logp !== undefined
                        ? <span style={{ fontWeight: 600, color: m.logp <= 5 ? '#059669' : m.logp <= 7 ? '#d97706' : '#dc2626' }}>
                            {m.logp.toFixed(2)}
                          </span>
                        : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>

                    {/* QED */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {m.qed !== undefined
                        ? <span style={{ fontWeight: 700, color: m.qed >= 0.7 ? '#059669' : m.qed >= 0.4 ? '#d97706' : '#dc2626' }}>
                            {m.qed.toFixed(2)}
                          </span>
                        : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>

                    {/* Lipinski */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                      {checkMark(m.lipinskiPass)}
                    </td>

                    {/* PAINS */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                      {checkMark(m.painsPass)}
                    </td>

                    {/* BBB */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                      {m.bbbPermeable !== undefined
                        ? m.bbbPermeable
                          ? <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 700 }}>Perm.</span>
                          : <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 700 }}>Não</span>
                        : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>

                    {/* AMES */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                      {riskBadge(m.amesProb)}
                    </td>

                    {/* hERG */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                      {riskBadge(m.hergProb)}
                    </td>

                    {/* ESOL */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>
                      {m.esolCategory ?? <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '7px 8px', verticalAlign: 'middle', textAlign: 'center' }}>
                      {m.status === 'idle'       && <span style={{ color: '#cbd5e1', fontSize: 11 }}>·</span>}
                      {m.status === 'processing' && <span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite', color: '#6366f1' }}>⟳</span>}
                      {m.status === 'done'       && <i className="bi bi-check-circle-fill" style={{ color: '#059669', fontSize: 12 }} />}
                      {m.status === 'error'      && <span title={m.error} style={{ fontSize: 11, color: '#dc2626' }}>✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer legend */}
          {done > 0 && (
            <div style={{
              padding: '7px 16px',
              backgroundColor: '#fafafa',
              borderTop: `1px solid ${colors.borderLight}`,
              fontSize: 10, color: '#94a3b8',
              display: 'flex', gap: 16, flexWrap: 'wrap',
            }}>
              <span><strong style={{ color: '#475569' }}>AMES</strong> mutagenicidade</span>
              <span><strong style={{ color: '#475569' }}>hERG</strong> cardiotoxicidade</span>
              <span><strong style={{ color: '#475569' }}>Lip.</strong> Lipinski Ro5</span>
              <span><strong style={{ color: '#475569' }}>PAINS</strong> alertas estruturais</span>
              <span style={{ color: '#059669' }}>■ verde = favorável &nbsp;</span>
              <span style={{ color: '#dc2626' }}>■ vermelho = alerta</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BatchFlowPanel;
