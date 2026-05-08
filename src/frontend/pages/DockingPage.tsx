import React, { useState, useRef } from 'react';
import PageShell from '../components/PageShell';
import MoleculeDrawerModal from '../components/MoleculeDrawerModal';
import { colors, radius, shadow, font } from '../styles/themes';
import { parseCSV, autoDetect, detectSmilesColumn } from '../tools/csv';

interface MolEntry {
  name: string;
  smiles: string;
  sdf_3d: string;
  energy: number | null;
  ff_used: string;
  status: 'pending' | 'ok' | 'failed' | 'invalid';
  error: string;
  props: any;
}

type InputMode = 'smiles' | 'name' | 'draw' | 'csv';

interface DockingPageProps {
  onBack: () => void;
  initialSmiles?: string;
  onSmilesChange?: (s: string) => void;
}

const DockingPage: React.FC<DockingPageProps> = ({ onBack, initialSmiles, onSmilesChange }) => {
  const [entries, setEntries] = useState<MolEntry[]>([]);
  const [inputText, setInputText] = useState(initialSmiles || '');
  const [isPreparing, setIsPreparing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'simulation'>('overview');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('smiles');
  const [nameQuery, setNameQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [nameResult, setNameResult] = useState<{ smiles: string; iupac: string; mw: string } | null>(null);
  const [nameError, setNameError] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [exhaustiveness, setExhaustiveness] = useState(8);
  const [numModes, setNumModes] = useState(9);

  // Docking Simulation State
  const [receptor, setReceptor] = useState<{ id: string, path: string, content: string, pocket?: any } | null>(null);
  const [isLoadingReceptor, setIsLoadingReceptor] = useState(false);
  const [grid, setGrid] = useState({ cx: 0, cy: 0, cz: 0, sx: 20, sy: 20, sz: 20 });
  const [dockingResults, setDockingResults] = useState<any[]>([]);
  const [isDocking, setIsDocking] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [plipData, setPlipData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [boxColor, setBoxColor] = useState('blue');
  const [targetLigand, setTargetLigand] = useState('');
  const [targetChain, setTargetChain] = useState('');
  const [dismissRedocking, setDismissRedocking] = useState(false);
  const [rcsbLigands, setRcsbLigands] = useState<{id: string, chain: string}[]>([]);
  const [isDetectingPocket, setIsDetectingPocket] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, name: '' });
  const batchAbortRef = useRef(false);

  // Accumulated results for comparison report
  type AccumResult = { name: string; smiles: string; affinity: string; le: number; plipData?: any; isControl: boolean; };
  const [accumulated, setAccumulated] = useState<AccumResult[]>([]);

  const [config, setConfig] = useState({
    remove_salts: true,
    neutralize: true,
    canon_tautomer: false,
    ff: 'MMFF94',
    max_iters: 2000
  });

  const handleLoad = async (textToLoad?: string) => {
    const text = textToLoad || inputText;
    if (!text.trim()) return;
    try {
      const res = await fetch('/api/libprep/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, method: 'smiles' })
      });
      const data = await res.json();
      setEntries(data);
      if (data.length > 0) setSelectedIdx(0);
    } catch (err) {
      alert('Error loading library');
    }
  };

  const handleLoadReceptor = async (id: string) => {
    if (!id || id.length !== 4) return;
    setIsLoadingReceptor(true);
    try {
      const res = await fetch('/api/docking/receptor/load-pdb-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pdbId: id,
          ligandId: targetLigand.trim() || null,
          chainId: targetChain.trim() || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setReceptor({ id: data.pdbId, path: data.pdbPath, content: data.pdbContent, pocket: data.pocket });
        if (data.rcsbLigands) setRcsbLigands(data.rcsbLigands);
        setDismissRedocking(false);
        if (data.pocket && data.pocket.success) {
          setGrid({
            cx: data.pocket.center.x, cy: data.pocket.center.y, cz: data.pocket.center.z,
            sx: data.pocket.size.x, sy: data.pocket.size.y, sz: data.pocket.size.z
          });
        }
      } else {
        alert(data.error || 'Failed to load receptor');
      }
    } catch (err) {
      alert('Network error loading receptor');
    } finally {
      setIsLoadingReceptor(false);
    }
  };

  const handleAddInhibitorForRedocking = async () => {
    if (!receptor || !receptor.pocket?.inhibitor) return;
    try {
      const res = await fetch('/api/docking/receptor/extract-inhibitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pdbId: receptor.id, 
          resName: receptor.pocket.inhibitor,
          chainId: receptor.pocket.chain
        })
      });
      const data = await res.json();
      if (data.success) {
        appendSmiles(data.smiles, data.name);
        alert(`Added ${data.name} to library for Redocking!`);
      } else {
        alert(data.error || 'Failed to extract inhibitor');
      }
    } catch (err) {
      alert('Network error extracting inhibitor');
    }
  };

  const runDocking = async (idx: number) => {
    if (!receptor || !entries[idx]) return;
    setIsDocking(true);
    try {
      const res = await fetch('/api/docking/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receptorPath: receptor.path,
          smiles: entries[idx].smiles,
          center: { x: grid.cx, y: grid.cy, z: grid.cz },
          size: { x: grid.sx, y: grid.sy, z: grid.sz },
          exhaustiveness,
          numModes
        })
      });
      const data = await res.json();
      if (data.success) {
        setDockingResults(data.scores);
        setSessionInfo(data);
        setPlipData(null);
        // Accumulate result for comparison report
        const molName = entries[idx].name || ('mol_' + (idx + 1));
        const molSmiles = entries[idx].smiles;
        const bestAffinity = data.scores.length > 0 ? data.scores[0].affinity : '—';
        setAccumulated(prev => {
          const existingIdx = prev.findIndex(r => r.smiles === molSmiles);
          // If a control already exists in the list (other than the one we are updating), don't override it
          const hasControl = prev.some((r, idx) => r.isControl && idx !== existingIdx);
          
          // Auto-set as control if: 
          // 1. No control exists yet
          // 2. OR it's the native inhibitor being redocked
          const isNative = molName.toLowerCase().includes((receptor?.pocket?.inhibitor || '___').toLowerCase());
          const shouldBeControl = !hasControl || isNative;
          
          const entry: AccumResult = { 
            name: molName, 
            smiles: molSmiles, 
            affinity: bestAffinity, 
            le: data.le || 0, 
            isControl: shouldBeControl 
          };

          // If we are setting THIS one as control, others must lose it
          let newList = [...prev];
          if (shouldBeControl) {
            newList = newList.map(r => ({ ...r, isControl: false }));
          }

          if (existingIdx >= 0) {
            newList[existingIdx] = { ...newList[existingIdx], ...entry };
            return newList;
          }
          return [...newList, entry];
        });
      } else {
        alert(data.error || 'Docking failed');
      }
    } catch (err) {
      alert('Network error during docking');
    } finally {
      setIsDocking(false);
    }
  };

  const handleAnalyze = async (poseIdx = 0) => {
    if (!sessionInfo?.complexPath) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/docking/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          complexPath: sessionInfo.complexPath,
          sessionId: sessionInfo.sessionId,
          poseIdx: poseIdx,
          smiles: entries[selectedIdx].smiles
        })
      });
      const data = await res.json();
      if (data.error) { alert(data.error); }
      else {
        setPlipData(data);
        // Save PLIP data into accumulated result for report
        const molSmiles = entries[selectedIdx]?.smiles;
        if (molSmiles) {
          setAccumulated(prev => {
            const i = prev.findIndex(r => r.smiles === molSmiles);
            if (i >= 0) { const u = [...prev]; u[i] = { ...u[i], plipData: data }; return u; }
            return prev;
          });
        }
      }
    } catch (err) {
      alert('Error running PLIP analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDetectBox = async (ligId?: string, chainId?: string) => {
    if (!receptor) return;
    const lig = (ligId ?? targetLigand).trim() || null;
    const ch = (chainId ?? targetChain).trim() || null;
    setIsDetectingPocket(true);
    try {
      const res = await fetch('/api/docking/receptor/detect-pocket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdbId: receptor.id, ligandId: lig, chainId: ch })
      });
      const data = await res.json();
      if (data.success) {
        setGrid({
          cx: data.center.x, cy: data.center.y, cz: data.center.z,
          sx: data.size.x, sy: data.size.y, sz: data.size.z
        });
        if (ligId) { setTargetLigand(ligId); setTargetChain(chainId || ''); }
      } else {
        alert(data.error || 'Ligand not found in structure');
      }
    } catch {
      alert('Error detecting pocket');
    } finally {
      setIsDetectingPocket(false);
    }
  };

  const handleDownloadResults = () => {
    if (!sessionInfo?.sessionId) return;
    window.location.href = `/api/docking/download?session=${sessionInfo.sessionId}`;
  };

  const runBatchDocking = async () => {
    if (!receptor || entries.length === 0) return;
    batchAbortRef.current = false;
    setIsBatchRunning(true);
    const valid = entries.filter(e => e.smiles && e.smiles.trim());
    setBatchProgress({ current: 0, total: valid.length, name: '' });

    for (let i = 0; i < valid.length; i++) {
      if (batchAbortRef.current) break;
      const entry = valid[i];
      const entryIdx = entries.indexOf(entry);
      const molName = entry.name || ('mol_' + (entryIdx + 1));
      setBatchProgress({ current: i + 1, total: valid.length, name: molName });
      setSelectedIdx(entryIdx);

      try {
        const dockRes = await fetch('/api/docking/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receptorPath: receptor.path,
            smiles: entry.smiles,
            center: { x: grid.cx, y: grid.cy, z: grid.cz },
            size: { x: grid.sx, y: grid.sy, z: grid.sz },
            exhaustiveness,
            numModes
          })
        });
        const dockData = await dockRes.json();
        if (!dockData.success) continue;

        setDockingResults(dockData.scores);
        setSessionInfo(dockData);

        const bestAff = dockData.scores.length > 0 ? dockData.scores[0].affinity : '—';
        setAccumulated(prev => {
          const existing = prev.findIndex(r => r.smiles === entry.smiles);
          const shouldBeControl = prev.length === 0 || molName.includes(receptor?.pocket?.inhibitor || '\x00');
          const isCtrl = shouldBeControl && !prev.some(r => r.isControl);
          const ae: AccumResult = { name: molName, smiles: entry.smiles, affinity: bestAff, le: dockData.le || 0, isControl: isCtrl };
          if (existing >= 0) { const u = [...prev]; u[existing] = { ...u[existing], ...ae }; return u; }
          return [...prev, ae];
        });

        if (batchAbortRef.current) break;

        if (dockData.complexPath) {
          try {
            const plipRes = await fetch('/api/docking/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ complexPath: dockData.complexPath, sessionId: dockData.sessionId, poseIdx: 0, smiles: entry.smiles })
            });
            const plipResult = await plipRes.json();
            if (!plipResult.error) {
              setPlipData(plipResult);
              setAccumulated(prev => {
                const idx = prev.findIndex(r => r.smiles === entry.smiles);
                if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], plipData: plipResult }; return u; }
                return prev;
              });
            }
          } catch { /* skip PLIP errors silently */ }
        }
      } catch { /* skip molecule on network error */ }
    }

    setIsBatchRunning(false);
    setBatchProgress({ current: 0, total: 0, name: '' });
  };

  const handleSetControl = (idx: number) => {
    setAccumulated(prev => prev.map((r, i) => ({ 
      ...r, 
      isControl: i === idx ? !r.isControl : false 
    })));
  };

  const handleDownloadReport = () => {
    if (accumulated.length === 0) { alert('No docking results to export. Run docking for at least one molecule first.'); return; }
    const ctrl = accumulated.find(r => r.isControl);
    const ctrlAff = ctrl ? parseFloat(ctrl.affinity) : null;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const sorted = [...accumulated].sort((a, b) => parseFloat(a.affinity) - parseFloat(b.affinity));
    const affinities = accumulated.map(r => parseFloat(r.affinity)).filter(v => !isNaN(v));
    const bestAff = affinities.length > 0 ? Math.min(...affinities) : null;
    const bestMol = bestAff !== null ? accumulated.find(r => parseFloat(r.affinity) === bestAff) : null;
    const hitsVsCtrl = ctrlAff !== null ? accumulated.filter(r => !r.isControl && parseFloat(r.affinity) < ctrlAff - 0.1).length : null;
    const deltaList = ctrlAff !== null ? accumulated.filter(r => !r.isControl && !isNaN(parseFloat(r.affinity))).map(r => parseFloat(r.affinity) - ctrlAff) : [];
    const bestDelta = deltaList.length > 0 ? Math.min(...deltaList) : null;

    const allResSet = new Set<string>();
    accumulated.forEach(r => {
      if (r.plipData?.interactions) {
        (r.plipData.interactions.hbonds || []).forEach((h: any) => allResSet.add(h.residue));
        (r.plipData.interactions.hydrophobic || []).forEach((h: any) => allResSet.add(h.residue));
        (r.plipData.interactions.pi_stacking || []).forEach((h: any) => allResSet.add(h.residue));
      }
    });
    const residueList = Array.from(allResSet).sort();
    const ctrlRes = new Set<string>();
    if (ctrl?.plipData?.interactions) {
      (ctrl.plipData.interactions.hbonds || []).forEach((h: any) => ctrlRes.add(h.residue));
      (ctrl.plipData.interactions.hydrophobic || []).forEach((h: any) => ctrlRes.add(h.residue));
      (ctrl.plipData.interactions.pi_stacking || []).forEach((h: any) => ctrlRes.add(h.residue));
    }

    const rowBg = (r: AccumResult) => {
      if (r.isControl) return '#eff6ff';
      if (!ctrlAff) return '#fff';
      const d = parseFloat(r.affinity) - ctrlAff;
      return d < -0.5 ? '#f0fdf4' : d > 0.5 ? '#fff7f7' : '#fffbeb';
    };

    const tableRows = sorted.map((r, rank) => {
      const hb = r.plipData?.interactions?.hbonds?.length ?? '—';
      const hp = r.plipData?.interactions?.hydrophobic?.length ?? '—';
      const pi = r.plipData?.interactions?.pi_stacking?.length ?? '—';
      const delta = ctrlAff !== null && !r.isControl ? (parseFloat(r.affinity) - ctrlAff).toFixed(2) : (r.isControl ? 'REF' : '—');
      const dColor = !r.isControl && ctrlAff !== null ? (parseFloat(r.affinity)-ctrlAff < -0.1 ? '#16a34a' : parseFloat(r.affinity)-ctrlAff > 0.1 ? '#dc2626' : '#92400e') : '#64748b';
      const ki = r.plipData?.ki || '—';
      const le = r.le > 0 ? r.le.toFixed(3) : '—';
      const ctrlLabel = r.isControl ? ' <span style="background:#1e3a5f;color:#fff;padding:1px 7px;border-radius:4px;font-size:9px;font-weight:800;vertical-align:middle">REF</span>' : '';
      return `<tr style="background:${rowBg(r)}">
        <td style="padding:10px 10px;text-align:center;font-weight:800;color:#94a3b8;font-size:12px">${r.isControl ? '—' : '#'+(rank+1)}</td>
        <td style="padding:10px 10px"><div style="font-weight:700;color:#1e293b;font-size:12px">${r.name}${ctrlLabel}</div><div style="font-size:9px;color:#94a3b8;font-family:monospace;word-break:break-all">${r.smiles.length>60?r.smiles.slice(0,60)+'…':r.smiles}</div></td>
        <td style="padding:10px;text-align:center;font-weight:800;color:#dc2626;font-size:13px">${r.affinity}</td>
        <td style="padding:10px;text-align:center;font-weight:700;color:#16a34a;font-size:11px">${ki}</td>
        <td style="padding:10px;text-align:center;font-weight:700;color:${dColor};font-size:12px">${delta}</td>
        <td style="padding:10px;text-align:center;font-size:11px">${le}</td>
        <td style="padding:10px;text-align:center"><span style="display:inline-block;min-width:22px;height:22px;line-height:22px;border-radius:5px;font-weight:800;font-size:11px;background:#dcfce7;color:#16a34a">${hb}</span></td>
        <td style="padding:10px;text-align:center"><span style="display:inline-block;min-width:22px;height:22px;line-height:22px;border-radius:5px;font-weight:800;font-size:11px;background:#dbeafe;color:#2563eb">${hp}</span></td>
        <td style="padding:10px;text-align:center"><span style="display:inline-block;min-width:22px;height:22px;line-height:22px;border-radius:5px;font-weight:800;font-size:11px;background:#f3e8ff;color:#9333ea">${pi}</span></td>
      </tr>`;
    }).join('');

    const hasAnyPlip = accumulated.some(r => r.plipData?.interactions);
    const heatmapSection = hasAnyPlip && residueList.length > 0 ? (() => {
      const hdrCols = residueList.map(res =>
        `<th style="background:#1e3a5f;color:#fff;padding:5px 3px;font-size:8px;font-weight:700;writing-mode:vertical-rl;transform:rotate(180deg);min-width:26px;white-space:nowrap">${res}${ctrlRes.has(res) ? ' ★' : ''}</th>`
      ).join('');
      const bRows = sorted.map(r => {
        const hbSet = new Set((r.plipData?.interactions?.hbonds||[]).map((h:any)=>h.residue));
        const hpSet = new Set((r.plipData?.interactions?.hydrophobic||[]).map((h:any)=>h.residue));
        const piSet = new Set((r.plipData?.interactions?.pi_stacking||[]).map((h:any)=>h.residue));
        const cells = residueList.map(res => {
          if (hbSet.has(res)) return `<td style="background:#16a34a;color:#fff;text-align:center;font-weight:800;font-size:9px;padding:4px 2px">H</td>`;
          if (hpSet.has(res)) return `<td style="background:#2563eb;color:#fff;text-align:center;font-weight:800;font-size:9px;padding:4px 2px">P</td>`;
          if (piSet.has(res)) return `<td style="background:#9333ea;color:#fff;text-align:center;font-weight:800;font-size:9px;padding:4px 2px">π</td>`;
          return `<td style="background:#f8fafc;color:#e2e8f0;text-align:center;font-size:9px;padding:4px 2px">·</td>`;
        }).join('');
        const cm = r.isControl ? ' <span style="background:#0ea5e9;color:#fff;border-radius:3px;padding:0 4px;font-size:8px">REF</span>' : '';
        return `<tr><td style="padding:5px 10px;font-size:10px;font-weight:700;white-space:nowrap;border-right:2px solid #e2e8f0">${r.name}${cm}</td>${cells}</tr>`;
      }).join('');
      return `<p style="font-size:11px;color:#64748b;margin:0 0 10px">
        <span style="display:inline-block;width:11px;height:11px;background:#16a34a;border-radius:2px;margin-right:4px;vertical-align:middle"></span>H = Hydrogen bond &nbsp;
        <span style="display:inline-block;width:11px;height:11px;background:#2563eb;border-radius:2px;margin-right:4px;vertical-align:middle"></span>P = Hydrophobic &nbsp;
        <span style="display:inline-block;width:11px;height:11px;background:#9333ea;border-radius:2px;margin-right:4px;vertical-align:middle"></span>π = Pi-stacking &nbsp;
        ★ = shared with reference
      </p>
      <div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:10px">
        <thead><tr><th style="background:#0f172a;color:#fff;padding:8px 12px;font-size:10px;font-weight:700;text-align:left;min-width:110px">Compound</th>${hdrCols}</tr></thead>
        <tbody>${bRows}</tbody>
      </table></div>`;
    })() : '';

    const detailCards = sorted.filter(r => r.plipData).map(r => {
      const intList = [
        ...(r.plipData.interactions?.hbonds||[]).map((h:any)=>`<div style="font-size:10px;color:#065f46;padding:2px 0"><b style="color:#16a34a">H</b> ${h.residue} (${h.dist}Å)</div>`),
        ...(r.plipData.interactions?.hydrophobic||[]).map((h:any)=>`<div style="font-size:10px;color:#1e40af;padding:2px 0"><b style="color:#2563eb">P</b> ${h.residue} (${h.dist}Å)</div>`),
        ...(r.plipData.interactions?.pi_stacking||[]).map((h:any)=>`<div style="font-size:10px;color:#581c87;padding:2px 0"><b style="color:#9333ea">π</b> ${h.residue} (${h.dist}Å)</div>`),
      ].join('') || '<div style="font-size:10px;color:#94a3b8">No significant interactions detected</div>';
      const diag = r.plipData.diagram ? `<div>${r.plipData.diagram}</div>` : '';
      const ctrlLabel = r.isControl ? ' <span style="background:#0ea5e9;color:#fff;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:800">REFERENCE</span>' : '';
      const delta = ctrlAff !== null && !r.isControl
        ? `<span style="font-weight:700;color:${parseFloat(r.affinity)-ctrlAff < -0.1 ? '#16a34a' : parseFloat(r.affinity)-ctrlAff > 0.1 ? '#dc2626' : '#92400e'}">ΔΔG: ${(parseFloat(r.affinity)-ctrlAff).toFixed(2)} kcal/mol</span>`
        : '';
      return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:24px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:14px;margin-bottom:16px">
          <div>
            <div style="font-size:16px;font-weight:800;color:#1e3a5f">${r.name}${ctrlLabel}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px">${r.affinity} kcal/mol | Ki: ${r.plipData?.ki||'—'} | LE: ${r.le>0?r.le.toFixed(3):'—'}</div>
            ${delta?`<div style="font-size:11px;margin-top:4px">${delta}</div>`:''}
          </div>
          <div style="text-align:right;font-size:10px;color:#94a3b8">
            <div>${(r.plipData.interactions?.hbonds||[]).length} H-bonds</div>
            <div>${(r.plipData.interactions?.hydrophobic||[]).length} Hydrophobic</div>
            <div>${(r.plipData.interactions?.pi_stacking||[]).length} π-stack</div>
          </div>
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">${intList}</div>
          <div style="flex:0 0 300px;text-align:center">${diag}</div>
        </div>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Drug Design Report — ${receptor?.id||'Virtual Screening'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  *{box-sizing:border-box}
  body{font-family:'Inter',-apple-system,sans-serif;margin:0;padding:32px;color:#1e293b;background:#f1f5f9;line-height:1.5}
  .page{max-width:1150px;margin:0 auto;background:#fff;padding:52px;border-radius:16px;box-shadow:0 4px 40px rgba(0,0,0,.08)}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1e3a5f;padding-bottom:24px;margin-bottom:32px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 28px}
  .chip{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:100px;padding:5px 14px;font-size:11px;font-weight:600;color:#475569}
  .chip b{color:#1e293b}
  .sec{font-size:13px;font-weight:800;color:#1e3a5f;margin:36px 0 14px;padding-left:12px;border-left:4px solid #1e3a5f;text-transform:uppercase;letter-spacing:.5px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
  .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px}
  .kpi .lbl{font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px}
  .kpi .val{font-size:22px;font-weight:900;color:#1e293b;line-height:1}
  .kpi .sub{font-size:10px;color:#64748b;margin-top:4px}
  .kpi.best{border-color:#dc2626;background:#fff7f7}.kpi.best .val{color:#dc2626}
  .kpi.hit{border-color:#16a34a;background:#f0fdf4}.kpi.hit .val{color:#16a34a}
  .ctrl-bar{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px 20px;margin-bottom:28px;display:flex;align-items:center;gap:14px}
  .warn{background:#fffbeb;border:1px solid #fcd34d;color:#92400e;padding:14px;border-radius:10px;font-size:12px;font-weight:600;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead th{background:#0f172a;color:#fff;padding:10px;text-align:left;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px}
  tbody td{padding:9px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tbody tr:last-child td{border-bottom:none}
  .methods{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;font-size:11px;color:#475569;line-height:1.8}
  .methods b{color:#1e293b}
  footer{margin-top:48px;padding-top:18px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
  @media print{body{background:#fff;padding:0}.page{box-shadow:none;padding:28px;max-width:none}}
</style></head><body>
<div class="page">
  <header>
    <div>
      <h1 style="color:#1e3a5f;font-size:26px;font-weight:900;margin:0 0 4px;letter-spacing:-.5px">Drug Design Virtual Screening Report</h1>
      <p style="color:#64748b;font-size:12px;font-weight:500;margin:0">SmileRender Suite &mdash; Advanced Cheminformatics &amp; Molecular Docking</p>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700;color:#1e3a5f;font-size:13px">${date}</div>
      <div style="font-size:10px;color:#94a3b8">Report ID: ${Date.now()}</div>
    </div>
  </header>
  <div class="chips">
    <div class="chip">Receptor: <b>${receptor?.id||'—'}</b></div>
    <div class="chip">Center: <b>${grid.cx.toFixed(1)}, ${grid.cy.toFixed(1)}, ${grid.cz.toFixed(1)}</b></div>
    <div class="chip">Box (Å): <b>${grid.sx}&times;${grid.sy}&times;${grid.sz}</b></div>
    <div class="chip">Exhaustiveness: <b>${exhaustiveness}</b></div>
    <div class="chip">Max Poses: <b>${numModes}</b></div>
    <div class="chip">Screened: <b>${accumulated.length}</b></div>
  </div>
  <div class="sec">Executive Summary</div>
  <div class="kpi-grid">
    <div class="kpi"><div class="lbl">Compounds Screened</div><div class="val">${accumulated.length}</div><div class="sub">Against ${receptor?.id||'target'}</div></div>
    <div class="kpi best"><div class="lbl">Best Binder</div><div class="val">${bestAff!==null?bestAff.toFixed(2):'—'}</div><div class="sub">${bestMol?.name||'—'} (kcal/mol)</div></div>
    <div class="kpi hit"><div class="lbl">Hits vs. Control</div><div class="val">${hitsVsCtrl!==null?hitsVsCtrl:'—'}</div><div class="sub">Better than reference</div></div>
    <div class="kpi" style="${bestDelta!==null&&bestDelta<-0.1?'border-color:#16a34a;background:#f0fdf4':''}"><div class="lbl">Best &Delta;&Delta;G</div><div class="val" style="color:${bestDelta!==null&&bestDelta<-0.1?'#16a34a':'#1e293b'}">${bestDelta!==null?(bestDelta>0?'+':'')+bestDelta.toFixed(2):'—'}</div><div class="sub">vs. reference (kcal/mol)</div></div>
  </div>
  ${ctrl?`<div class="ctrl-bar">
    <div style="background:#1e3a5f;color:#fff;border-radius:8px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">&#9733;</div>
    <div>
      <div style="font-size:9px;font-weight:800;color:#3b82f6;text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px">Reference Compound</div>
      <div style="font-size:17px;font-weight:800;color:#1e3a5f">${ctrl.name}</div>
      <div style="font-size:12px;color:#1d4ed8;font-weight:600;margin-top:2px">${ctrl.affinity} kcal/mol &nbsp;|&nbsp; Ki: ${ctrl.plipData?.ki||'—'} &nbsp;|&nbsp; LE: ${ctrl.le>0?ctrl.le.toFixed(3):'—'} &nbsp;|&nbsp; H-bonds: ${ctrl.plipData?.interactions?.hbonds?.length??'—'}</div>
    </div>
  </div>`:`<div class="warn">&#9888; No reference compound defined. &Delta;&Delta;G comparison is disabled.</div>`}
  <div class="sec">Ranked Binding Results</div>
  <table>
    <thead><tr>
      <th style="width:32px">Rank</th><th style="width:22%">Compound</th>
      <th style="text-align:center">Affinity<br>(kcal/mol)</th>
      <th style="text-align:center">Est. Ki</th>
      <th style="text-align:center">&Delta;&Delta;G<br>(kcal/mol)</th>
      <th style="text-align:center">LE</th>
      <th style="text-align:center">H-B</th>
      <th style="text-align:center">H-P</th>
      <th style="text-align:center">&pi;-S</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  ${heatmapSection?`<div class="sec">Interaction Fingerprint</div>${heatmapSection}`:''}
  ${detailCards?`<div class="sec">Per-Molecule Binding Analysis</div>${detailCards}`:''}
  <div class="sec">Methods</div>
  <div class="methods">
    <b>Software:</b> AutoDock Vina (Trott &amp; Olson, 2010) via SmileRender Suite. &nbsp;
    <b>Receptor:</b> PDB ${receptor?.id||'—'} from RCSB; heteroatoms &amp; water removed; converted to PDBQT via Meeko. &nbsp;
    <b>Ligand prep:</b> SMILES to 3D with RDKit MMFF94 minimization; PDBQT via Meeko. &nbsp;
    <b>Grid:</b> center (${grid.cx.toFixed(2)}, ${grid.cy.toFixed(2)}, ${grid.cz.toFixed(2)}) Å; box ${grid.sx}&times;${grid.sy}&times;${grid.sz} Å; exhaustiveness ${exhaustiveness}; max poses ${numModes}. &nbsp;
    <b>PLIP:</b> H-bond &le;3.5 Å/120&deg;; hydrophobic &le;4.0 Å; &pi;-stack &le;5.5 Å. &nbsp;
    <b>LE</b> = |&Delta;G| / heavy atoms. &nbsp;
    <b>ΔΔG</b> relative to reference compound.
  </div>
  <footer>
    <div>Generated by SmileRender Suite &mdash; ${date}</div>
    <div>&copy; ${new Date().getFullYear()} SmileRender &mdash; Professional Research Edition</div>
  </footer>
</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drugdesign_report_${receptor?.id||'screening'}_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  React.useEffect(() => {
    if (initialSmiles) {
      handleLoad(initialSmiles);
    }
  }, [initialSmiles]);

  const handleNameSearch = async () => {
    if (!nameQuery.trim()) return;
    setIsSearching(true);
    setNameError('');
    setNameResult(null);
    try {
      const res = await fetch('/api/pubchem/name-to-smiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameQuery.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.error || 'Not found');
      } else {
        setNameResult(data);
      }
    } catch (err) {
      setNameError('Network error');
    } finally {
      setIsSearching(false);
    }
  };

  const appendSmiles = (smiles: string, label?: string) => {
    const line = label ? `${smiles} ${label}` : smiles;
    setInputText(prev => prev ? `${prev.trim()}\n${line}` : line);
    setInputMode('smiles');
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const rows = parseCSV(content);
        if (rows.length < 2) return;

        const smilesIndex = detectSmilesColumn(rows);
        if (smilesIndex === -1) { alert("SMILES column not found in CSV."); return; }

        const headers = rows[0].map((h: string) => h.replace(/^\ufeff/, '').trim().toLowerCase());
        const nameCol = autoDetect(headers, /name|nome|id|label|drug|molecule/i);
        const nameIndex = nameCol ? headers.indexOf(nameCol) : -1;

        const formattedStr = rows.slice(1)
          .map((r: string[]) => {
            const s = (r[smilesIndex] || '').trim();
            const n = nameIndex !== -1 ? (r[nameIndex] || '').trim().replace(/\n/g, ' ') : '';
            return s ? `${s} ${n}`.trim() : '';
          })
          .filter((s: string) => s.length > 0)
          .join('\n');

        setInputText(formattedStr);
        onSmilesChange?.(formattedStr);
        handleLoad(formattedStr);
        setInputMode('smiles');
      } catch (err) {
        alert('Error parsing CSV');
      }
    };
    reader.readAsText(file);
  };

  const render3DViewer = () => {
    if (!receptor) return (
      <div style={{
        height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.bg, borderRadius: radius.md, border: `1px dashed ${colors.border}`,
        color: colors.textMuted, fontSize: '14px'
      }}>
        No structure loaded. Use Fetch Receptor to begin.
      </div>
    );

    const cacheBust = new Date().getTime();
    const poseIdx = plipData?.poseIdx ?? 0;
    const bestAff = dockingResults.length > 0 ? dockingResults[poseIdx]?.affinity ?? dockingResults[0]?.affinity : '';

    let viewerUrl = `/api/docking/viewer?pdb=${receptor.id}&cx=${grid.cx}&cy=${grid.cy}&cz=${grid.cz}&sx=${grid.sx}&sy=${grid.sy}&sz=${grid.sz}&color=${boxColor}&v=${cacheBust}`.replace(/,/g, '.');
    if (sessionInfo?.sessionId) {
      viewerUrl += `&session=${sessionInfo.sessionId}&pose=${poseIdx}`;
      if (bestAff) viewerUrl += `&aff=${encodeURIComponent(bestAff)}`;
    }

    return (
      <div style={{ position: 'relative' }}>
        <iframe
          key={receptor.id + '_' + (sessionInfo?.sessionId || '') + '_' + poseIdx + '_' + grid.cx}
          src={viewerUrl}
          style={{ width: '100%', height: '420px', border: 'none', borderRadius: radius.md, backgroundColor: '#1a1a2e' }}
        />
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', gap: '5px' }}>
          <button
            onClick={() => window.open(viewerUrl, "_blank")}
            style={{
              padding: '4px 8px', fontSize: '10px', fontWeight: 600,
              backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', cursor: 'pointer'
            }}
          >
            <i className="bi bi-arrows-fullscreen"></i> Full View
          </button>
        </div>
      </div>
    );
  };

  const inputModeBtn = (mode: InputMode, icon: string, label: string) => (
    <button
      onClick={() => setInputMode(mode)}
      style={{
        flex: 1, padding: '7px 4px', border: 'none', borderRadius: radius.md, fontSize: '12px',
        fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
        backgroundColor: inputMode === mode ? '#14b8a6' : colors.bg,
        color: inputMode === mode ? '#fff' : colors.textMuted,
      }}
    >
      <i className={`bi ${icon}`} style={{ marginRight: '4px' }}></i>{label}
    </button>
  );

  return (
    <PageShell
      icon="bi-box-arrow-in-right"
      title="Docking LibPrep"
      subtitle="Prepare molecular libraries for virtual screening"
      accentColor="#14b8a6"
      onBack={onBack}
    >
      <div style={{ display: 'flex', gap: '30px' }}>
        {/* Sidebar */}
        <div style={{ flex: '0 0 320px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: radius.lg, padding: '24px', boxShadow: shadow.sm, border: `1px solid ${colors.border}` }}>
            <h6 style={{ fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-folder2-open" style={{ color: '#14b8a6' }}></i> Load Library
            </h6>

            <div style={{ display: 'flex', gap: '4px', backgroundColor: colors.bg, padding: '4px', borderRadius: radius.md, marginBottom: '20px' }}>
              {inputModeBtn('smiles', 'bi-code', 'SMILES')}
              {inputModeBtn('csv', 'bi-file-earmark-excel', 'CSV/Excel')}
              {inputModeBtn('name', 'bi-search', 'Name')}
              {inputModeBtn('draw', 'bi-pencil', 'Draw')}
            </div>

            {/* SMILES Input */}
            {inputMode === 'smiles' && (
              <div style={{ marginBottom: '24px' }}>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Enter SMILES (one per line)..."
                  style={{ width: '100%', height: '140px', padding: '12px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '13px', fontFamily: font.mono, marginBottom: '12px', resize: 'vertical' }}
                />
                <button
                  style={{ width: '100%', padding: '10px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => handleLoad()}
                >
                  Load SMILES
                </button>
              </div>
            )}

            {/* CSV mode */}
            {inputMode === 'csv' && (
              <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                <div style={{
                  padding: '32px 16px', backgroundColor: colors.bg, borderRadius: radius.md,
                  border: `2px dashed ${colors.border}`, marginBottom: '12px', cursor: 'pointer'
                }} onClick={() => document.getElementById('csv-upload')?.click()}>
                  <i className="bi bi-cloud-upload" style={{ fontSize: '36px', color: '#14b8a6', display: 'block', marginBottom: '12px' }}></i>
                  <p style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>Click to Upload CSV</p>
                  <p style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px' }}>Supports SMILES and Name columns</p>
                  <input id="csv-upload" type="file" accept=".csv,.xlsx,.xls" hidden onChange={handleCSVUpload} />
                </div>
              </div>
            )}

            {/* Name search mode */}
            {inputMode === 'name' && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input
                    type="text"
                    value={nameQuery}
                    onChange={e => setNameQuery(e.target.value)}
                    placeholder="Molecule Name (e.g. Aspirin)"
                    style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '13px' }}
                    onKeyDown={e => e.key === 'Enter' && handleNameSearch()}
                  />
                  <button
                    onClick={handleNameSearch}
                    disabled={isSearching}
                    style={{ padding: '10px', backgroundColor: colors.navy, color: '#fff', border: 'none', borderRadius: radius.md, cursor: 'pointer' }}
                  >
                    {isSearching ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-search"></i>}
                  </button>
                </div>

                {nameError && <div style={{ fontSize: '11px', color: colors.danger, marginBottom: '10px' }}>{nameError}</div>}

                {nameResult && (
                  <div style={{ padding: '12px', backgroundColor: '#f0fdfa', border: '1px solid #5eead4', borderRadius: radius.md }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>{nameResult.iupac}</div>
                    <div style={{ fontSize: '11px', color: colors.textMuted, wordBreak: 'break-all', marginBottom: '8px' }}>{nameResult.smiles}</div>
                    <button
                      onClick={() => {
                        appendSmiles(nameResult.smiles, nameQuery.trim());
                        setNameQuery('');
                        setNameResult(null);
                      }}
                      style={{
                        marginTop: '10px', width: '100%', padding: '8px', backgroundColor: '#14b8a6',
                        color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 600, cursor: 'pointer', fontSize: '12px'
                      }}
                    >
                      <i className="bi bi-plus-circle" style={{ marginRight: '6px' }}></i>Add to Library
                    </button>
                  </div>
                )}

                {!nameResult && !nameError && (
                  <p style={{ fontSize: '11px', color: colors.textMuted, textAlign: 'center', marginTop: '8px' }}>
                    Search by common name, IUPAC name, or synonym via PubChem
                  </p>
                )}
              </div>
            )}

            {/* Draw mode */}
            {inputMode === 'draw' && (
              <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                <div style={{
                  padding: '32px 16px', backgroundColor: colors.bg, borderRadius: radius.md,
                  border: `2px dashed ${colors.border}`, marginBottom: '12px'
                }}>
                  <i className="bi bi-pencil-square" style={{ fontSize: '36px', color: '#14b8a6', display: 'block', marginBottom: '12px' }}></i>
                  <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '14px' }}>
                    Open the molecular sketcher to draw a structure. The SMILES will be added to your library.
                  </p>
                  <button
                    onClick={() => setIsDrawerOpen(true)}
                    style={{
                      padding: '10px 20px', backgroundColor: '#14b8a6', color: '#fff', border: 'none',
                      borderRadius: radius.md, fontWeight: 700, cursor: 'pointer', fontSize: '13px'
                    }}
                  >
                    <i className="bi bi-pencil" style={{ marginRight: '8px' }}></i>Open Sketcher
                  </button>
                </div>
                {inputText && (
                  <p style={{ fontSize: '11px', color: colors.success }}>
                    <i className="bi bi-check-circle" style={{ marginRight: '4px' }}></i>
                    {inputText.trim().split('\n').length} molecule(s) in queue
                  </p>
                )}
              </div>
            )}

            {/* Current queue count (shown in all modes) */}
            {inputText && inputMode !== 'smiles' && (
              <div style={{ marginBottom: '12px' }}>
                <button
                  onClick={() => setInputMode('smiles')}
                  style={{
                    width: '100%', padding: '8px', backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`, borderRadius: radius.md,
                    fontSize: '12px', color: colors.textMuted, cursor: 'pointer'
                  }}
                >
                  <i className="bi bi-list-ul" style={{ marginRight: '6px' }}></i>
                  View / edit queue ({inputText.trim().split('\n').length} entries)
                </button>
              </div>
            )}

            {/* Load button for non-smiles modes */}
            {inputMode !== 'smiles' && (
              <button
                style={{
                  width: '100%', padding: '10px', backgroundColor: inputText ? colors.blue : colors.textMuted,
                  color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 600,
                  cursor: inputText ? 'pointer' : 'default', marginBottom: '24px'
                }}
                onClick={handleLoad}
                disabled={!inputText}
              >
                Load Library ({inputText.trim().split('\n').filter(Boolean).length} entries)
              </button>
            )}

            <div style={{ height: '1px', backgroundColor: colors.border, margin: '0 -24px 24px' }}></div>

            <h6 style={{ fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-gear" style={{ color: colors.warning }}></i> Preparation
            </h6>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: colors.textMuted, marginBottom: '6px' }}>Force Field</label>
              <select
                style={{ width: '100%', padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '13px' }}
                value={config.ff}
                onChange={e => setConfig({ ...config, ff: e.target.value })}
              >
                <option value="MMFF94">MMFF94 (Best for Drugs)</option>
                <option value="MMFF94s">MMFF94s</option>
                <option value="UFF">UFF (General)</option>
              </select>
            </div>
            <button
              onClick={() => setIsPreparing(true)}
              style={{ width: '100%', padding: '12px', backgroundColor: colors.success, color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 700 }}
            >
              <i className="bi bi-play-fill" style={{ marginRight: '6px' }}></i> Prepare Library
            </button>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: radius.lg, padding: '24px', boxShadow: shadow.sm, border: `1px solid ${colors.border}`, marginTop: '24px' }}>
            <h6 style={{ fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bi bi-download" style={{ color: colors.blue }}></i> Export
            </h6>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button style={{ padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '12px', cursor: 'pointer' }}>CSV (Meta)</button>
              <button style={{ padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '12px', cursor: 'pointer' }}>SDF (3D Lib)</button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            {['overview', 'simulation'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                style={{
                  padding: '8px 24px', borderRadius: '100px', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                  backgroundColor: activeTab === tab ? colors.navy : 'transparent',
                  color: activeTab === tab ? '#fff' : colors.textMuted
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: radius.lg, padding: '24px', boxShadow: shadow.sm, border: `1px solid ${colors.border}`, minHeight: '600px' }}>
            {activeTab === 'overview' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: `2px solid ${colors.border}` }}>
                      <th style={{ padding: '12px' }}>Molecule</th>
                      <th style={{ padding: '12px' }}>SMILES</th>
                      <th style={{ padding: '12px' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Best Score</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Rel. to Ctrl</th>
                      <th style={{ padding: '12px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((m, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${colors.bg}`, backgroundColor: selectedIdx === i ? '#f0f9ff' : 'transparent' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{m.name || `mol_${i + 1}`}</td>
                        <td style={{ padding: '12px', color: colors.textMuted, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.smiles}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ padding: '4px 8px', borderRadius: '100px', fontSize: '11px', fontWeight: 700, backgroundColor: m.status === 'ok' ? colors.successBg : colors.bg, color: m.status === 'ok' ? colors.success : colors.textLight }}>
                            {m.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700 }}>
                          {(() => {
                            const res = accumulated.find(r => r.smiles === m.smiles);
                            return res ? (
                              <span style={{ color: colors.danger }}>{res.affinity} <small style={{ fontWeight: 400, color: colors.textMuted }}>kcal/mol</small></span>
                            ) : '—';
                          })()}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {(() => {
                            const res = accumulated.find(r => r.smiles === m.smiles);
                            const ctrl = accumulated.find(c => c.isControl);
                            if (!res || !ctrl || res.isControl) return '—';
                            const diff = parseFloat(res.affinity) - parseFloat(ctrl.affinity);
                            const better = diff < -0.1;
                            const worse = diff > 0.1;
                            return (
                              <span style={{ fontWeight: 700, color: better ? '#16a34a' : worse ? '#dc2626' : '#92400e', fontSize: '11px' }}>
                                {better ? '▲' : worse ? '▼' : '≈'} {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => { setSelectedIdx(i); setActiveTab('simulation'); }}
                            style={{ padding: '4px 10px', borderRadius: radius.sm, border: `1px solid ${colors.border}`, backgroundColor: '#fff', cursor: 'pointer' }}
                          >
                            Docking
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entries.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '80px 0', color: colors.textLight }}>
                    <i className="bi bi-inbox" style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}></i>
                    No molecules loaded. Use the sidebar to start.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'simulation' && (
              <div>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Receptor PDB ID</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      <input
                        id="pdb-id-input"
                        type="text"
                        placeholder="PDB ID (e.g. 5KIR)"
                        style={{ flex: '1 1 150px', padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border}` }}
                        onKeyDown={e => e.key === 'Enter' && handleLoadReceptor(e.currentTarget.value)}
                      />
                      <button
                        onClick={() => handleLoadReceptor((document.getElementById('pdb-id-input') as HTMLInputElement).value)}
                        disabled={isLoadingReceptor}
                        style={{ padding: '10px 20px', backgroundColor: colors.navy, color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                        {isLoadingReceptor ? 'Loading...' : 'Fetch Receptor'}
                      </button>
                    </div>
                  </div>
                  {receptor && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ padding: '10px', backgroundColor: colors.successBg, border: `1px solid ${colors.success}`, borderRadius: radius.md, fontSize: '12px', color: colors.success }}>
                        <i className="bi bi-check-circle-fill me-2"></i> Receptor <b>{receptor.id}</b> Loaded
                      </div>
                      {!dismissRedocking && receptor.pocket?.inhibitor && (
                        <div style={{
                          padding: '12px 16px', backgroundColor: '#fff7ed', border: '1px solid #fdba74', 
                          borderRadius: radius.md, position: 'relative', minWidth: '300px',
                          animation: 'slideIn 0.3s ease-out'
                        }}>
                          <button 
                            onClick={() => setDismissRedocking(true)}
                            style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: '#9a3412', cursor: 'pointer', fontSize: '14px' }}
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', backgroundColor: '#ffedd5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}>
                              <i className="bi bi-magic"></i>
                            </div>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: '#9a3412' }}>Redocking Suggestion</div>
                              <p style={{ fontSize: '11px', color: '#c2410c', margin: 0 }}>
                                We found <b>{receptor.pocket.inhibitor}</b>. Add it for validation?
                              </p>
                              <button 
                                onClick={handleAddInhibitorForRedocking}
                                style={{ marginTop: '8px', padding: '4px 10px', backgroundColor: '#ea580c', color: '#fff', border: 'none', borderRadius: radius.sm, fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                Yes, Prepare Redocking
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {receptor && (
                  <div style={{ display: 'flex', gap: '24px' }}>
                    <div style={{ flex: '1 1 500px' }}>
                      <h6 style={{ fontWeight: 700, marginBottom: '12px' }}>Grid Box Configuration</h6>

                      {/* Ligand-based pocket detection */}
                      <div style={{ backgroundColor: '#f8fafc', border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: '12px', marginBottom: '16px' }}>
                        <p style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, marginBottom: '8px' }}>
                          <i className="bi bi-crosshair" style={{ marginRight: '5px' }}></i>
                          Detect Box from PDB Ligand
                        </p>
                        {rcsbLigands.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                            {rcsbLigands.map((lig, i) => (
                              <button
                                key={i}
                                onClick={() => handleDetectBox(lig.id, lig.chain)}
                                disabled={isDetectingPocket}
                                style={{
                                  padding: '4px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '100px',
                                  border: `1px solid ${targetLigand === lig.id && targetChain === (lig.chain || '') ? colors.navy : colors.border}`,
                                  backgroundColor: targetLigand === lig.id && targetChain === (lig.chain || '') ? colors.navy : '#fff',
                                  color: targetLigand === lig.id && targetChain === (lig.chain || '') ? '#fff' : colors.text,
                                  cursor: 'pointer'
                                }}
                              >
                                {lig.id}{lig.chain ? ' / ' + lig.chain : ''}
                              </button>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Ligand ID (e.g. RCX)"
                            value={targetLigand}
                            onChange={e => setTargetLigand(e.target.value.toUpperCase())}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '12px', fontFamily: 'monospace' }}
                          />
                          <input
                            type="text"
                            placeholder="Chain"
                            value={targetChain}
                            onChange={e => setTargetChain(e.target.value.toUpperCase())}
                            style={{ width: '70px', padding: '7px 10px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '12px' }}
                          />
                          <button
                            onClick={() => handleDetectBox()}
                            disabled={isDetectingPocket || !targetLigand.trim()}
                            style={{
                              padding: '7px 14px', backgroundColor: colors.navy, color: '#fff',
                              border: 'none', borderRadius: radius.md, fontSize: '12px', fontWeight: 700,
                              cursor: isDetectingPocket || !targetLigand.trim() ? 'not-allowed' : 'pointer',
                              opacity: isDetectingPocket || !targetLigand.trim() ? 0.6 : 1,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isDetectingPocket ? '...' : 'Detect Box'}
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                        {['cx', 'cy', 'cz'].map(k => (
                          <div key={k}>
                            <label style={{ fontSize: '11px', color: colors.textMuted }}>Center {k.slice(1).toUpperCase()}</label>
                            <input type="number" step="0.1" value={(grid as any)[k]} onChange={e => setGrid({ ...grid, [k]: parseFloat(e.target.value) })}
                              style={{ width: '100%', padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}` }} />
                          </div>
                        ))}
                        {['sx', 'sy', 'sz'].map(k => (
                          <div key={k}>
                            <label style={{ fontSize: '11px', color: colors.textMuted }}>Size {k.slice(1).toUpperCase()}</label>
                            <input type="number" step="1" value={(grid as any)[k]} onChange={e => setGrid({ ...grid, [k]: parseFloat(e.target.value) })}
                              style={{ width: '100%', padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}` }} />
                          </div>
                        ))}
                        <div>
                          <label style={{ fontSize: '11px', color: colors.textMuted }}>Box Color</label>
                          <select 
                            value={boxColor} 
                            onChange={e => setBoxColor(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: '12px' }}
                          >
                            <option value="yellow">Yellow</option>
                            <option value="lime">Lime Green</option>
                            <option value="darkblue">Dark Blue</option>
                            <option value="red">Red</option>
                            <option value="cyan">Cyan</option>
                            <option value="magenta">Magenta</option>
                            <option value="blue">Blue</option>
                            <option value="orange">Orange</option>
                          </select>
                        </div>
                      </div>
                      {render3DViewer()}
                    </div>
                    <div style={{ flex: '0 0 300px' }}>
                      <h6 style={{ fontWeight: 700, marginBottom: '12px' }}>Docking Controls</h6>
                      <p style={{ fontSize: '12px', color: colors.textMuted, marginBottom: '16px' }}>
                        Selected: <b>{entries[selectedIdx]?.name || 'None'}</b>
                      </p>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: colors.textMuted, marginBottom: '4px' }}>Exhaustiveness</label>
                          <input type="number" min="1" max="64" value={exhaustiveness} onChange={e => setExhaustiveness(parseInt(e.target.value))}
                            style={{ width: '100%', padding: '8px', border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: '13px' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: colors.textMuted, marginBottom: '4px' }}>Max Poses</label>
                          <input type="number" min="1" max="20" value={numModes} onChange={e => setNumModes(parseInt(e.target.value))}
                            style={{ width: '100%', padding: '8px', border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: '13px' }} />
                        </div>
                      </div>
                      <button
                        onClick={() => runDocking(selectedIdx)}
                        disabled={isDocking || isBatchRunning || !receptor || entries.length === 0}
                        style={{ width: '100%', padding: '12px', backgroundColor: colors.success, color: '#fff', border: 'none', borderRadius: radius.md, fontWeight: 700, fontSize: '14px', marginBottom: '8px', marginTop: '16px' }}
                      >
                        {isDocking ? 'Simulating...' : '▶ Run AutoDock Vina'}
                      </button>

                      <button
                        onClick={isBatchRunning ? () => { batchAbortRef.current = true; } : runBatchDocking}
                        disabled={!isBatchRunning && (!receptor || entries.length === 0)}
                        style={{
                          width: '100%', padding: '10px', border: 'none', borderRadius: radius.md,
                          fontWeight: 700, fontSize: '13px', marginBottom: '12px', cursor: 'pointer',
                          backgroundColor: isBatchRunning ? '#dc2626' : '#7c3aed', color: '#fff',
                          opacity: !isBatchRunning && (!receptor || entries.length === 0) ? 0.5 : 1
                        }}
                      >
                        {isBatchRunning
                          ? `⬛ Cancel (${batchProgress.current}/${batchProgress.total})`
                          : `⚡ Dock All Library (${entries.length})`
                        }
                      </button>

                      {isBatchRunning && batchProgress.total > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: colors.textMuted, marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                              {batchProgress.name}
                            </span>
                            <span>{batchProgress.current}/{batchProgress.total}</span>
                          </div>
                          <div style={{ height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: '3px', transition: 'width 0.4s ease',
                              backgroundColor: '#7c3aed',
                              width: `${(batchProgress.current / batchProgress.total) * 100}%`
                            }} />
                          </div>
                        </div>
                      )}

                      {sessionInfo && (
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                          <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            style={{ flex: 1, padding: '8px', backgroundColor: colors.navy, color: '#fff', border: 'none', borderRadius: radius.md, fontSize: '11px', fontWeight: 700 }}
                          >
                            {isAnalyzing ? 'Analyzing...' : '🔍 PLIP Analysis'}
                          </button>
                          <button
                            onClick={handleDownloadResults}
                            style={{ padding: '8px 10px', backgroundColor: colors.blue, color: '#fff', border: 'none', borderRadius: radius.md, fontSize: '11px', fontWeight: 700 }}
                          >
                            <i className="bi bi-download"></i>
                          </button>
                        </div>
                      )}

                      {/* Accumulated results for comparison report */}
                      {accumulated.length > 0 && (
                        <div style={{ backgroundColor: '#f8fafc', border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: '12px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, margin: 0 }}>
                              <i className="bi bi-collection" style={{ marginRight: 5 }}></i>
                              Comparison ({accumulated.length} mol{accumulated.length > 1 ? 's' : ''})
                            </p>
                            <button
                              onClick={handleDownloadReport}
                              style={{ padding: '5px 10px', backgroundColor: '#1e3a5f', color: '#fff', border: 'none', borderRadius: radius.sm, fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              <i className="bi bi-file-earmark-medical me-1"></i> Drug Report
                            </button>
                          </div>
                          {!accumulated.some(r => r.isControl) && (
                             <div style={{ fontSize: '10px', color: '#b45309', backgroundColor: '#fffbeb', padding: '6px 8px', borderRadius: '4px', marginBottom: '8px', border: '1px solid #fcd34d' }}>
                               <i className="bi bi-info-circle-fill me-1"></i> Click the star <b>☆</b> to set a reference for comparison.
                             </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {(() => {
                              const ctrl = accumulated.find(r => r.isControl);
                              const ctrlAff = ctrl ? parseFloat(ctrl.affinity) : null;
                              return accumulated.map((r, i) => {
                                const aff = parseFloat(r.affinity);
                                const delta = ctrlAff !== null && !r.isControl ? aff - ctrlAff : null;
                                const isBetter = delta !== null && delta < -0.1;
                                const isWorse  = delta !== null && delta > 0.1;
                                const bg = r.isControl ? '#e0f2fe' : isBetter ? '#f0fdf4' : isWorse ? '#fff7f7' : '#fff';
                                const borderColor = r.isControl ? '#0ea5e9' : isBetter ? '#86efac' : isWorse ? '#fca5a5' : colors.border;
                                return (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 8px', backgroundColor: bg, borderRadius: radius.sm, border: `1px solid ${borderColor}` }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '11px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.isControl && <span style={{ fontSize: '9px', backgroundColor: '#0ea5e9', color: '#fff', borderRadius: '100px', padding: '1px 5px', marginRight: 4 }}>CTRL</span>}
                                        {r.name}
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: 2 }}>
                                        <span style={{ fontSize: '10px', color: colors.danger, fontWeight: 700 }}>{r.affinity} kcal/mol</span>
                                        {delta !== null && (
                                          <span style={{ fontSize: '10px', fontWeight: 700, color: isBetter ? '#16a34a' : isWorse ? '#dc2626' : '#92400e' }}>
                                            {isBetter ? '▲' : isWorse ? '▼' : '≈'} {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleSetControl(i)}
                                      title={r.isControl ? 'Remove control' : 'Set as control'}
                                      style={{ padding: '3px 7px', fontSize: '11px', border: `1px solid ${r.isControl ? '#0ea5e9' : colors.border}`, borderRadius: radius.sm, backgroundColor: r.isControl ? '#0ea5e9' : '#fff', color: r.isControl ? '#fff' : '#94a3b8', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
                                    >
                                      {r.isControl ? '★' : '☆'}
                                    </button>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {dockingResults.length > 0 && (
                        <div style={{ marginTop: '0' }}>
                          <h6 style={{ fontWeight: 700, fontSize: '13px', marginBottom: '10px' }}>Results (Scores)</h6>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                            {dockingResults.map((r, i) => (
                              <div key={i} style={{ padding: '10px', backgroundColor: i === (plipData?.poseIdx || 0) ? '#f0fdf4' : colors.bg, border: `1px solid ${i === (plipData?.poseIdx || 0) ? colors.success : colors.border}`, borderRadius: radius.md, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700 }}>Pose {r.mode}</span>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ color: colors.danger, fontWeight: 700, fontSize: '14px' }}>{r.affinity} kcal/mol</div>
                                    <div style={{ fontSize: '11px', color: colors.success, fontWeight: 700 }}>Est. Ki: {r.ki}</div>
                                    {r.rmsd !== null && (
                                      <div style={{ fontSize: '10px', color: colors.primary, fontWeight: 700 }}>
                                        RMSD: {r.rmsd}Å
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleAnalyze(i)}
                                  disabled={isAnalyzing}
                                  style={{ width: '100%', padding: '4px', fontSize: '10px', backgroundColor: colors.navy, color: '#fff', border: 'none', borderRadius: radius.sm, cursor: 'pointer' }}
                                >
                                  {isAnalyzing && (plipData?.poseIdx === i) ? 'Analyzing...' : '🔍 Analyze Interactions'}
                                </button>
                              </div>
                            ))}
                          </div>
                          
                          {sessionInfo?.le > 0 && (
                            <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: radius.md, border: '1px solid #bfdbfe', marginBottom: '20px' }}>
                               <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700, marginBottom: '2px' }}>LIGAND EFFICIENCY (LE)</div>
                               <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e40af' }}>{sessionInfo.le} <span style={{ fontSize: '11px', fontWeight: 400 }}>kcal/mol/HA</span></div>
                               <p style={{ fontSize: '10px', color: '#60a5fa', marginTop: '4px' }}>Higher is better. > 0.3 is considered a good lead.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {plipData?.diagram && (
                        <div style={{ marginTop: '24px', backgroundColor: '#fff', padding: '16px', borderRadius: radius.md, border: `1px solid ${colors.border}`, textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h6 style={{ fontWeight: 700, fontSize: '13px', margin: 0 }}>2D Interaction Map</h6>
                            <button
                              onClick={() => {
                                const svgStr = plipData.diagram as string;
                                const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                                const url = URL.createObjectURL(blob);
                                const img = new Image();
                                img.onload = () => {
                                  const canvas = document.createElement('canvas');
                                  canvas.width = img.naturalWidth || 700;
                                  canvas.height = img.naturalHeight || 680;
                                  const ctx = canvas.getContext('2d')!;
                                  ctx.fillStyle = '#ffffff';
                                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                                  ctx.drawImage(img, 0, 0);
                                  URL.revokeObjectURL(url);
                                  const a = document.createElement('a');
                                  a.download = `interaction_map_${entries[selectedIdx]?.name || 'ligand'}.png`;
                                  a.href = canvas.toDataURL('image/png');
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                };
                                img.src = url;
                              }}
                              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#f1f5f9', border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <i className="bi bi-download"></i> PNG
                            </button>
                          </div>
                          <div dangerouslySetInnerHTML={{ __html: plipData.diagram }} style={{ maxWidth: '100%' }} />
                        </div>
                      )}

                      {plipData && (
                        <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
                          <h6 style={{ fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>Structural Interactions</h6>
                          {plipData.interactions.hbonds.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <p style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px', color: '#16a34a' }}>Hydrogen Bonds ({plipData.interactions.hbonds.length})</p>
                              {plipData.interactions.hbonds.map((h: any, i: number) => (
                                <div key={i} style={{ fontSize: '10px', color: colors.textMuted }}>• {h.residue} ({h.dist}Å)</div>
                              ))}
                            </div>
                          )}
                          {plipData.interactions.hydrophobic.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <p style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px', color: '#2563eb' }}>Hydrophobic ({plipData.interactions.hydrophobic.length})</p>
                              {plipData.interactions.hydrophobic.map((h: any, i: number) => (
                                <div key={i} style={{ fontSize: '10px', color: colors.textMuted }}>• {h.residue} ({h.dist}Å)</div>
                              ))}
                            </div>
                          )}
                          {plipData.interactions.pi_stacking.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <p style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px', color: '#9333ea' }}>π-Stacking ({plipData.interactions.pi_stacking.length})</p>
                              {plipData.interactions.pi_stacking.map((h: any, i: number) => (
                                <div key={i} style={{ fontSize: '10px', color: colors.textMuted }}>• {h.residue} ({h.dist}Å)</div>
                              ))}
                            </div>
                          )}
                          {plipData.interactions.hbonds.length === 0 && plipData.interactions.hydrophobic.length === 0 && plipData.interactions.pi_stacking.length === 0 && (
                            <p style={{ fontSize: '11px', color: colors.textMuted }}>No significant interactions detected.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <MoleculeDrawerModal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSave={(smiles) => {
          appendSmiles(smiles, 'Drawn Molecule');
          setIsDrawerOpen(false);
        }}
      />
    </PageShell>
  );
};

export default DockingPage;
