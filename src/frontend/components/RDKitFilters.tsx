import React, { useEffect, useState } from 'react';

const wrap: React.CSSProperties = {
  margin: '10px', padding: '15px',
  boxShadow: '2px 4px 10px rgba(0,0,0,0.15)',
  borderRadius: '10px', backgroundColor: '#fff',
  border: '1px solid #e0e0e0',
};

const ACCENT = '#0d9488';

type FilterResult = {
  pass: boolean;
  violations?: string[];
  alerts?: string[];
  n?: number;
};

type Data = {
  pains:    FilterResult;
  brenk:    FilterResult;
  nih:      FilterResult;
  lipinski: FilterResult;
  ghose:    FilterResult;
  veber:    FilterResult;
  egan:     FilterResult;
  muegge:   FilterResult;
  values: {
    mw: number; logp: number; mr: number;
    hbd: number; hba: number; tpsa: number;
    rotb: number; n_atoms: number;
  };
  esol?: {
    logs: number;
    sol_mgl: number;
    category: string;
  };
};

const FILTER_META: { key: keyof Omit<Data,'values'>; label: string; desc: string }[] = [
  { key: 'lipinski', label: 'Lipinski Ro5',   desc: 'Oral drug-likeness (≤1 violation)' },
  { key: 'ghose',    label: 'Ghose',          desc: 'Drug-like physicochemical space' },
  { key: 'veber',    label: 'Veber',          desc: 'Oral bioavailability (RotB, TPSA)' },
  { key: 'egan',     label: 'Egan',           desc: 'Passive intestinal absorption' },
  { key: 'muegge',   label: 'Muegge',         desc: 'Lead-like filter' },
  { key: 'pains',    label: 'PAINS',          desc: 'Pan-assay interference compounds' },
  { key: 'brenk',    label: 'Brenk alerts',   desc: 'Reactive / metabolically unstable groups' },
  { key: 'nih',      label: 'NIH alerts',     desc: 'NIH structural alerts' },
];

function Badge({ pass }: { pass: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '11px',
      fontWeight: 'bold',
      backgroundColor: pass ? '#dcfce7' : '#fee2e2',
      color: pass ? '#16a34a' : '#dc2626',
    }}>
      {pass ? 'PASS' : 'FAIL'}
    </span>
  );
}

function RDKitFilters(props: { smiles: string; onDataLoaded?: (data: any[]) => void }) {
  const [data,      setData]      = useState<Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError,   setIsError]   = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setIsError(false);
    setData(null);

    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 30_000);

    fetch(`/predict/rdkit-filters/base64/${encodeURIComponent(btoa(props.smiles))}`,
          { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Data) => {
        clearTimeout(t);
        setData(d);
        setIsLoading(false);

        if (props.onDataLoaded) {
          const rows: any[] = [];
          const push = (cat: string, prop: string, val: string) =>
            rows.push({ SMILES: props.smiles, Tool: 'RDKit Filters', Category: cat, Property: prop, Value: val, Unit: '-' });

          // Rule-based filters
          FILTER_META.forEach(({ key, label }) => {
            const f = d[key] as FilterResult;
            push('Drug-likeness & Alerts', label, f.pass ? 'PASS' : 'FAIL');
            (f.violations ?? f.alerts ?? []).forEach(v => push(label, 'Alert', v));
          });

          // Raw values
          push('Physicochemical', 'MW',          `${d.values.mw} Da`);
          push('Physicochemical', 'LogP',         String(d.values.logp));
          push('Physicochemical', 'MR',           String(d.values.mr));
          push('Physicochemical', 'HBD',          String(d.values.hbd));
          push('Physicochemical', 'HBA',          String(d.values.hba));
          push('Physicochemical', 'TPSA',         `${d.values.tpsa} Å²`);
          push('Physicochemical', 'RotBonds',     String(d.values.rotb));
          push('Physicochemical', 'Heavy Atoms',  String(d.values.n_atoms));

          // ESOL
          if (d.esol) {
            push('Solubility (QSAR)', 'LogS (ESOL)', String(d.esol.logs));
            push('Solubility (QSAR)', 'Aqueous Sol.', `${d.esol.sol_mgl} mg/L`);
            push('Solubility (QSAR)', 'Class',        d.esol.category);
          }

          props.onDataLoaded(rows);
        }
      })
      .catch(err => {
        clearTimeout(t);
        if (err.name !== 'AbortError') console.error('RDKit Filters Error:', err);
        setIsError(true);
        setIsLoading(false);
        if (props.onDataLoaded) props.onDataLoaded([]);
      });

    return () => { clearTimeout(t); ctrl.abort(); };
  }, [props.smiles]);

  if (isLoading) return (
    <div style={{ margin: '20px' }}>
      <p>Calculando filtros RDKit para <strong>{props.smiles}</strong>...</p>
    </div>
  );

  if (isError || !data) return (
    <div style={{ margin: '20px', color: 'red' }}>
      <p>Erro ao calcular filtros RDKit.</p>
    </div>
  );

  const passCount = FILTER_META.filter(({ key }) => (data[key] as FilterResult).pass).length;
  const totalCount = FILTER_META.length;
  const overallOk = passCount === totalCount;

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `2px solid ${ACCENT}`, paddingBottom: '10px', marginBottom: '14px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: ACCENT }}>RDKit Filters</h3>
        <span style={{
          padding: '4px 14px', borderRadius: '20px', fontWeight: 'bold', fontSize: '13px',
          backgroundColor: overallOk ? '#dcfce7' : '#fff7ed',
          color: overallOk ? '#16a34a' : '#d97706',
        }}>
          {passCount}/{totalCount} filters passed
        </span>
      </div>

      {/* Filters grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {FILTER_META.map(({ key, label, desc }) => {
          const f = data[key] as FilterResult;
          const issues = f.violations ?? f.alerts ?? [];
          return (
            <div key={key} style={{
              border: `1px solid ${f.pass ? '#86efac' : '#fca5a5'}`,
              borderRadius: '8px', padding: '10px 12px',
              backgroundColor: f.pass ? '#f0fdf4' : '#fff5f5',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <strong style={{ fontSize: '13px', color: '#1e293b' }}>{label}</strong>
                <Badge pass={f.pass} />
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: issues.length ? '6px' : 0 }}>{desc}</div>
              {issues.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: '#dc2626' }}>
                  {issues.slice(0, 4).map((v, i) => <li key={i}>{v}</li>)}
                  {issues.length > 4 && <li style={{ color: '#64748b' }}>+{issues.length - 4} more</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Physicochemical values */}
      <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Physicochemical Values
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {([
            ['MW',       `${data.values.mw} Da`],
            ['LogP',     data.values.logp],
            ['MR',       data.values.mr],
            ['HBD',      data.values.hbd],
            ['HBA',      data.values.hba],
            ['TPSA',     `${data.values.tpsa} Å²`],
            ['RotBonds', data.values.rotb],
            ['HvyAtoms', data.values.n_atoms],
          ] as [string, any][]).map(([k, v]) => (
            <span key={k} style={{ fontSize: '12px', backgroundColor: '#f1f5f9', padding: '3px 10px', borderRadius: '20px', color: '#334155' }}>
              <strong>{k}</strong> {v}
            </span>
          ))}
        </div>
      </div>

      {/* ESOL Solubility Section */}
      {data.esol && (
        <div style={{ borderTop: '1px solid #e0e0e0', marginTop: '14px', paddingTop: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Predicted Solubility (ESOL QSAR)
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <div style={{ flex: 1, backgroundColor: '#f0f9ff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <div style={{ fontSize: '11px', color: '#0369a1' }}>LogS (mol/L)</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c4a6e' }}>{data.esol.logs}</div>
            </div>
            <div style={{ flex: 1, backgroundColor: '#f0f9ff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
              <div style={{ fontSize: '11px', color: '#0369a1' }}>mg/L</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c4a6e' }}>{data.esol.sol_mgl}</div>
            </div>
            <div style={{ flex: 1.5, backgroundColor: '#f0f9ff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bae6fd', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#0369a1' }}>Category</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0c4a6e', textTransform: 'uppercase' }}>{data.esol.category}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RDKitFilters;
