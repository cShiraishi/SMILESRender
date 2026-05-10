import React, { useState } from 'react';
import PageShell from '../components/PageShell';
import { colors, font, radius, shadow } from '../styles/themes';

interface Dataset {
  id: string;
  name: string;
  description: string;
  size: string;
  task: string;
  taskType: 'classification' | 'regression' | 'multi' | 'general';
  targets: string[];
  source: string;
  license: string;
  category: Category;
  url: string;
  year: number;
  usedBy?: string;
}

type Category = 'admet' | 'toxicity' | 'bioactivity' | 'physChem' | 'generative';

const CATEGORIES: { id: Category | 'all'; label: string; icon: string; color: string }[] = [
  { id: 'all',        label: 'All',                icon: 'bi-grid-fill',       color: '#64748b' },
  { id: 'admet',      label: 'ADMET',              icon: 'bi-activity',         color: '#10b981' },
  { id: 'toxicity',   label: 'Toxicity',           icon: 'bi-exclamation-octagon', color: '#ef4444' },
  { id: 'bioactivity',label: 'Bioactivity',        icon: 'bi-capsule',          color: '#8b5cf6' },
  { id: 'physChem',   label: 'Phys-Chem',          icon: 'bi-droplet-half',     color: '#f59e0b' },
  { id: 'generative', label: 'Generative',         icon: 'bi-stars',            color: '#3b82f6' },
];

const TASK_COLOR: Record<string, [string, string]> = {
  classification: ['#eff6ff', '#2563eb'],
  regression:     ['#fef9c3', '#b45309'],
  multi:          ['#f5f3ff', '#7c3aed'],
  general:        ['#f0fdf4', '#15803d'],
};

const DATASETS: Dataset[] = [
  {
    id: 'tox21',
    name: 'Tox21',
    description: 'Toxicology in the 21st Century. 12 qualitative toxicity assays covering nuclear receptor and stress-response pathways. Benchmark of NCI/EPA collaborative challenge.',
    size: '12,707',
    task: 'classification',
    taskType: 'classification',
    targets: ['NR-AR', 'NR-ER', 'NR-AhR', 'SR-HSE', 'SR-MMP', '+7'],
    source: 'NIH · NCI · EPA',
    license: 'Public Domain',
    category: 'toxicity',
    url: 'https://tripod.nih.gov/tox21/',
    year: 2014,
    usedBy: 'Tox21 panel',
  },
  {
    id: 'clintox',
    name: 'ClinTox',
    description: 'Clinical toxicity from FDA drug approval data. Contrasts drugs that failed clinical trials due to toxicity with approved drugs. Used in MoleculeNet benchmark.',
    size: '1,478',
    task: 'classification',
    taskType: 'classification',
    targets: ['CT_TOX', 'FDA_APPROVED'],
    source: 'MoleculeNet · FDA',
    license: 'MIT',
    category: 'toxicity',
    url: 'https://moleculenet.org/datasets-1',
    year: 2017,
    usedBy: 'ClinTox filter',
  },
  {
    id: 'sider',
    name: 'SIDER',
    description: 'Side Effect Resource. Drug-side effect associations for marketed drugs extracted from public documents. 27 system-organ classes as multi-label targets.',
    size: '1,427',
    task: 'multi',
    taskType: 'multi',
    targets: ['Hepatic disorders', 'Cardiac disorders', '+25 SOC'],
    source: 'EMBL-EBI',
    license: 'CC BY-SA 4.0',
    category: 'toxicity',
    url: 'https://sideeffects.embl.de/',
    year: 2015,
  },
  {
    id: 'bbbp',
    name: 'BBBP',
    description: 'Blood-Brain Barrier Penetration. Binary classification of CNS-active vs CNS-inactive drugs based on membrane permeability data. Key target for CNS drug design.',
    size: '2,039',
    task: 'classification',
    taskType: 'classification',
    targets: ['BBB Penetration'],
    source: 'MoleculeNet',
    license: 'MIT',
    category: 'admet',
    url: 'https://moleculenet.org/datasets-1',
    year: 2017,
    usedBy: 'BBB prediction',
  },
  {
    id: 'hiv',
    name: 'HIV',
    description: 'DTP AIDS Antiviral Screen. Screening of 40k+ compounds for inhibition of HIV replication. Classes: confirmed inactive (CI), confirmed active (CA), confirmed moderately active (CM).',
    size: '41,913',
    task: 'classification',
    taskType: 'classification',
    targets: ['HIV_active'],
    source: 'DTP / NCI',
    license: 'Public Domain',
    category: 'bioactivity',
    url: 'https://wiki.nci.nih.gov/display/NCIDTPdata/AIDS+Antiviral+Screen+Data',
    year: 2004,
  },
  {
    id: 'esol',
    name: 'ESOL',
    description: 'Estimated SOLubility. Aqueous solubility data for 1,128 compounds. One of the most used regression benchmarks in molecular ML. Original Delaney dataset.',
    size: '1,128',
    task: 'regression',
    taskType: 'regression',
    targets: ['log(mol/L)'],
    source: 'Delaney, JCICS 2004',
    license: 'Academic',
    category: 'physChem',
    url: 'https://moleculenet.org/datasets-1',
    year: 2004,
    usedBy: 'Solubility (LogS)',
  },
  {
    id: 'freesolv',
    name: 'FreeSolv',
    description: 'Free energies of hydration for neutral molecules in water. Calculated by FEP/MD alchemical simulations and validated against experimental measurements.',
    size: '643',
    task: 'regression',
    taskType: 'regression',
    targets: ['ΔGhyd (kcal/mol)'],
    source: 'Mobley & Guthrie, JCAMD 2014',
    license: 'CC0',
    category: 'physChem',
    url: 'https://github.com/MobleyLab/FreeSolv',
    year: 2014,
  },
  {
    id: 'lipo',
    name: 'Lipophilicity',
    description: 'Experimental LogD7.4 (octanol/water distribution coefficient at pH 7.4) for drug-like compounds, sourced from AstraZeneca and ChEMBL. Key ADMET property.',
    size: '4,200',
    task: 'regression',
    taskType: 'regression',
    targets: ['LogD7.4'],
    source: 'AstraZeneca · ChEMBL',
    license: 'CC BY-SA 4.0',
    category: 'admet',
    url: 'https://moleculenet.org/datasets-1',
    year: 2018,
    usedBy: 'LogD / LogP',
  },
  {
    id: 'chembl',
    name: 'ChEMBL',
    description: 'Manually curated bioactivity database of drug-like molecules from scientific literature. Contains IC50, Ki, Kd, EC50 data across thousands of protein targets.',
    size: '2.4M+',
    task: 'multi',
    taskType: 'multi',
    targets: ['IC50', 'Ki', 'Kd', 'EC50', '14k+ targets'],
    source: 'EMBL-EBI',
    license: 'CC BY-SA 4.0',
    category: 'bioactivity',
    url: 'https://www.ebi.ac.uk/chembl/',
    year: 2012,
    usedBy: 'Similarity search',
  },
  {
    id: 'pubchem',
    name: 'PubChem BioAssay',
    description: 'NIH open chemical repository with biological activity data from high-throughput screening programs. Covers millions of substances across thousands of bioassays.',
    size: '300M+ substances',
    task: 'general',
    taskType: 'general',
    targets: ['Multiple endpoints'],
    source: 'NCBI · NIH',
    license: 'Public Domain',
    category: 'bioactivity',
    url: 'https://pubchem.ncbi.nlm.nih.gov/',
    year: 2004,
  },
  {
    id: 'qm9',
    name: 'QM9',
    description: 'Quantum-mechanical properties of 134k stable small organic molecules. 12 computed properties (HOMO/LUMO energies, dipole moment, atomization energy, etc.) at DFT level.',
    size: '134,000',
    task: 'regression',
    taskType: 'regression',
    targets: ['ε_HOMO', 'ε_LUMO', 'μ', 'α', 'ΔE', '+7'],
    source: 'Ramakrishnan et al., Sci. Data 2014',
    license: 'CC BY 4.0',
    category: 'physChem',
    url: 'https://figshare.com/collections/Quantum_chemistry_structures_and_properties_of_134_kilo_molecules/978904',
    year: 2014,
  },
  {
    id: 'zinc250k',
    name: 'ZINC-250K',
    description: 'Subset of 250k drug-like molecules from the ZINC database with 2D/3D structures. Widely used benchmark for molecular generation models and virtual screening.',
    size: '250,000',
    task: 'general',
    taskType: 'general',
    targets: ['Drug-likeness', 'LogP', 'SA score'],
    source: 'UCSF · Irwin et al.',
    license: 'CC BY 4.0',
    category: 'generative',
    url: 'https://zinc.docking.org/',
    year: 2012,
    usedBy: 'Mol Generation',
  },
  {
    id: 'moses',
    name: 'MOSES',
    description: 'Molecular Sets benchmark for molecular generation models. Curated from ZINC to ensure drug-likeness (MW ≤ 600, TPSA ≤ 140, Lipinski rules). Includes evaluation metrics.',
    size: '1.9M',
    task: 'general',
    taskType: 'general',
    targets: ['Validity', 'Novelty', 'Diversity', 'FCD'],
    source: 'Polykovskiy et al., 2020',
    license: 'MIT',
    category: 'generative',
    url: 'https://github.com/molecularsets/moses',
    year: 2020,
    usedBy: 'Mol Generation',
  },
  {
    id: 'guacamol',
    name: 'GuacaMol',
    description: 'Goal-directed molecule generation benchmark. 20 tasks testing distribution learning and goal-directed generation using ChEMBL-derived molecular distributions.',
    size: '1.6M (ChEMBL)',
    task: 'general',
    taskType: 'general',
    targets: ['Validity', 'Uniqueness', 'KL divergence', 'FCD'],
    source: 'Brown et al., JCIM 2019',
    license: 'MIT',
    category: 'generative',
    url: 'https://github.com/BenevolentAI/guacamol',
    year: 2019,
    usedBy: 'Mol Generation',
  },
  {
    id: 'admetlab',
    name: 'ADMETlab 3.0',
    description: 'Curated training set behind the ADMETlab prediction engine. Covers 110+ ADMET endpoints including solubility, permeability, metabolism, toxicity and clinical outcomes.',
    size: '96,000+',
    task: 'multi',
    taskType: 'multi',
    targets: ['Caco-2', 'hERG', 'CYP', 'T½', '+106'],
    source: 'Dong et al., NAR 2024',
    license: 'Academic use',
    category: 'admet',
    url: 'https://admetlab3.scbdd.com/',
    year: 2024,
    usedBy: 'ADMET Profiling',
  },
];

interface Props {
  onBack: () => void;
}

function TaskBadge({ type }: { type: Dataset['taskType'] }) {
  const labels = { classification: 'Classification', regression: 'Regression', multi: 'Multi-task', general: 'General' };
  const [bg, fg] = TASK_COLOR[type];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, backgroundColor: bg, color: fg, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {labels[type]}
    </span>
  );
}

function DatasetCard({ ds }: { ds: Dataset }) {
  const cat = CATEGORIES.find(c => c.id === ds.category)!;
  return (
    <div style={{
      backgroundColor: '#fff',
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      boxShadow: shadow.sm,
      transition: 'box-shadow 0.15s, transform 0.15s',
      position: 'relative',
      overflow: 'hidden',
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = shadow.md;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = shadow.sm;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: cat.color, borderRadius: `${radius.lg} ${radius.lg} 0 0` }} />

      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: `${cat.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className={`bi ${cat.icon}`} style={{ color: cat.color, fontSize: 14 }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: colors.text, lineHeight: 1.2 }}>{ds.name}</div>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>{ds.source} · {ds.year}</div>
          </div>
        </div>
        <TaskBadge type={ds.taskType} />
      </div>

      {/* description */}
      <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.55, margin: 0 }}>{ds.description}</p>

      {/* targets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {ds.targets.map(tgt => (
          <span key={tgt} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textMuted, fontWeight: 600 }}>
            {tgt}
          </span>
        ))}
      </div>

      {/* footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', align: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: colors.text }}>
            <span style={{ fontWeight: 700 }}>{ds.size}</span>
            <span style={{ color: colors.textMuted }}> molecules</span>
          </div>
          <span style={{ fontSize: 10, color: colors.textLight, border: `1px solid ${colors.borderLight}`, borderRadius: 4, padding: '1px 6px' }}>
            {ds.license}
          </span>
          {ds.usedBy && (
            <span style={{ fontSize: 10, color: cat.color, fontWeight: 700, backgroundColor: `${cat.color}12`, borderRadius: 4, padding: '1px 6px' }}>
              ↳ {ds.usedBy}
            </span>
          )}
        </div>
        <a
          href={ds.url}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 11, fontWeight: 700, color: '#fff',
            backgroundColor: cat.color,
            padding: '4px 12px', borderRadius: 6,
            textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'opacity 0.15s',
          }}
          onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseOut={e => (e.currentTarget.style.opacity = '1')}
        >
          <i className="bi bi-box-arrow-up-right" style={{ fontSize: 10 }} /> Access
        </a>
      </div>
    </div>
  );
}

function DatasetsPage({ onBack }: Props) {
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [search, setSearch] = useState('');

  const q = search.toLowerCase();
  const filtered = DATASETS.filter(ds => {
    const matchCat = activeCategory === 'all' || ds.category === activeCategory;
    const matchSearch = !q || ds.name.toLowerCase().includes(q) || ds.description.toLowerCase().includes(q) || ds.targets.some(t => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const totalMols = '≥ 4 million';

  return (
    <PageShell
      icon="bi-database"
      title="Datasets"
      subtitle="Training and benchmark datasets used by this platform"
      accentColor="#0ea5e9"
      onBack={onBack}
    >
      {/* summary strip */}
      <div style={{
        display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 24,
        padding: '14px 20px',
        backgroundColor: '#fff',
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        boxShadow: shadow.sm,
      }}>
        {[
          { value: String(DATASETS.length), label: 'Datasets' },
          { value: totalMols, label: 'Molecules' },
          { value: '5', label: 'Categories' },
          { value: DATASETS.filter(d => d.usedBy).length.toString(), label: 'Used by tools' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0ea5e9' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: colors.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
            Public datasets used for training prediction models or as benchmarks for the tools available on this platform. All datasets are open-access or available under academic licenses.
          </p>
        </div>
      </div>

      {/* filters + search */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as any)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: font,
                  border: `1px solid ${active ? cat.color : colors.border}`,
                  backgroundColor: active ? `${cat.color}14` : '#fff',
                  color: active ? cat.color : colors.textMuted,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <i className={`bi ${cat.icon}`} style={{ fontSize: 11 }} />
                {cat.label}
                <span style={{ fontSize: 10, fontWeight: 700, color: active ? cat.color : colors.textLight }}>
                  {cat.id === 'all' ? DATASETS.length : DATASETS.filter(d => d.category === cat.id).length}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textLight, fontSize: 13 }} />
          <input
            type="text"
            placeholder="Search datasets, targets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 12px 7px 30px',
              borderRadius: radius.md, border: `1px solid ${colors.border}`,
              fontSize: 13, fontFamily: font, color: colors.text,
              outline: 'none', backgroundColor: '#fff',
            }}
          />
        </div>
      </div>

      {/* grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: colors.textMuted, fontSize: 14 }}>
          <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 12 }} />
          No datasets found
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16,
        }}>
          {filtered.map(ds => <DatasetCard key={ds.id} ds={ds} />)}
        </div>
      )}

      {/* footnote */}
      <p style={{ fontSize: 11, color: colors.textLight, marginTop: 32, textAlign: 'center', lineHeight: 1.6 }}>
        If you use any of these datasets in your research, please cite the original authors.<br />
        License information is provided for guidance — always verify with the original source.
      </p>
    </PageShell>
  );
}

export default DatasetsPage;
