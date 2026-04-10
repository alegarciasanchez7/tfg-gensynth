import { useState } from 'react';
import {
  Hash, List, Type, ToggleLeft, Clock, MapPin,
  ChevronLeft, Plus, Trash2, GripVertical,
} from 'lucide-react';
import type { Variable, VariableType } from '../../types';

const typeInfo: Record<VariableType, { icon: React.ReactNode; color: string; description: string }> = {
  numeric:  { icon: <Hash size={13} />,      color: 'text-cyan-500',    description: 'Random or distributed numeric value' },
  list:     { icon: <List size={13} />,      color: 'text-violet-500',  description: 'Value sampled from a defined list' },
  string:   { icon: <Type size={13} />,      color: 'text-emerald-500', description: 'Patterned or random string generation' },
  temporal: { icon: <Clock size={13} />,     color: 'text-sky-500',     description: 'Timestamp or datetime within a configurable range' },
  point:    { icon: <MapPin size={13} />,    color: 'text-teal-500',    description: 'Geographic or cartesian coordinate point' },
  boolean:  { icon: <ToggleLeft size={13} />, color: 'text-pink-500',   description: 'True/false with configurable probability' },
};

const scopeColors = {
  local:  { badge: 'bg-sky-500/10 border-sky-500/30 text-sky-500' },
  group:  { badge: 'bg-violet-500/10 border-violet-500/30 text-violet-500' },
  global: { badge: 'bg-amber-500/10 border-amber-500/30 text-amber-500' },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TInput({ value, mono = true }: { value: string; mono?: boolean }) {
  const [v, setV] = useState(value);
  return (
    <input value={v} onChange={e => setV(e.target.value)}
      className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all"
      style={{ fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter, sans-serif' }}
    />
  );
}

function TNumber({ value, min, max, step, unit }: { value: number; min?: number; max?: number; step?: number; unit?: string }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex items-stretch">
      <input type="number" value={v} min={min} max={max} step={step}
        onChange={e => setV(Number(e.target.value))}
        className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded-l px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      />
      {unit && (
        <span className="px-2 bg-[var(--c-bg4)] border border-l-0 border-[var(--c-br1)] rounded-r text-[10px] text-[var(--c-tx4)] flex items-center"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {unit}
        </span>
      )}
    </div>
  );
}

function TSelect({ options, value }: { options: string[]; value: string }) {
  const [v, setV] = useState(value);
  return (
    <select value={v} onChange={e => setV(e.target.value)}
      className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

function RangeSlider({ value, min, max }: { value: number; min: number; max: number }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={1} value={v}
        onChange={e => setV(Number(e.target.value))}
        className="flex-1 accent-cyan-500 h-1"
      />
      <span className="text-[11px] text-cyan-500 w-10 text-right" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {v}%
      </span>
    </div>
  );
}

function PreviewBadge({ value }: { value: string }) {
  return (
    <div className="px-3 py-2 bg-[var(--c-bg1)] border border-cyan-500/20 rounded flex items-center gap-2">
      <span className="text-[9px] text-[var(--c-tx4)] tracking-widest" style={{ fontFamily: 'JetBrains Mono, monospace' }}>SAMPLE →</span>
      <span className="text-[11px] text-cyan-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </div>
  );
}

// --- Type-specific editors ---

function NumericEditor({ config }: { config: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Min"><TNumber value={Number(config.min ?? 0)} /></Field>
        <Field label="Max"><TNumber value={Number(config.max ?? 100)} /></Field>
        <Field label="Decimals"><TNumber value={Number(config.decimals ?? 0)} min={0} max={10} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Distribution"><TSelect options={['uniform', 'gaussian', 'exponential', 'fixed', 'walk']} value={String(config.distribution ?? 'uniform')} /></Field>
        <Field label="Seed (optional)"><TInput value="" /></Field>
      </div>
      {config.distribution === 'gaussian' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Mean (μ)"><TNumber value={Number(config.mean ?? 50)} /></Field>
          <Field label="Std Dev (σ)"><TNumber value={Number(config.stddev ?? 10)} /></Field>
        </div>
      )}
      <PreviewBadge value="67.34" />
    </div>
  );
}

function ListEditor({ config }: { config: Record<string, unknown> }) {
  const [items, setItems] = useState<string[]>((config.values as string[]) ?? ['value_a', 'value_b']);
  const [newItem, setNewItem] = useState('');

  const addItem = () => {
    if (newItem.trim()) { setItems([...items, newItem.trim()]); setNewItem(''); }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label="Selection Mode">
        <TSelect options={['random', 'sequential', 'weighted']} value={String(config.mode ?? 'random')} />
      </Field>

      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>Values ({items.length})</label>
        <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded group">
              <GripVertical size={10} className="text-[var(--c-tx5)] shrink-0" />
              <span className="flex-1 text-[11px] text-[var(--c-tx2)] truncate"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item}</span>
              {config.mode === 'weighted' && (
                <input type="number" defaultValue={10} min={0} max={100}
                  className="w-12 bg-transparent border border-[var(--c-br1)] rounded px-1 py-0.5 text-[10px] text-[var(--c-tx3)] outline-none text-right"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                />
              )}
              <button onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="opacity-0 group-hover:opacity-100 text-[var(--c-tx4)] hover:text-red-500 transition-all">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input value={newItem} onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="add value…"
            className="flex-1 bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 placeholder:text-[var(--c-tx5)] transition-all"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />
          <button onClick={addItem}
            className="px-2 py-1 rounded border border-[var(--c-br1)] text-[var(--c-tx4)] hover:text-cyan-500 hover:border-cyan-500/40 hover:bg-cyan-500/10 transition-all">
            <Plus size={11} />
          </button>
        </div>
      </div>
      <PreviewBadge value={`"${items[0] ?? 'value_a'}"`} />
    </div>
  );
}

function StringEditor({ config }: { config: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Pattern (# = digit, @ = alpha, * = any)"><TInput value={String(config.pattern ?? 'SEN-####')} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Min Length"><TNumber value={Number(config.minLen ?? 4)} /></Field>
        <Field label="Max Length"><TNumber value={Number(config.maxLen ?? 32)} /></Field>
      </div>
      <Field label="Character Set"><TSelect options={['alphanumeric', 'alpha', 'numeric', 'hex', 'ascii', 'custom']} value="alphanumeric" /></Field>
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded">
        <input type="checkbox" defaultChecked id="cs-upper" className="accent-cyan-500" />
        <label htmlFor="cs-upper" className="text-[11px] text-[var(--c-tx3)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Uppercase
        </label>
        <input type="checkbox" id="cs-special" className="accent-cyan-500 ml-3" />
        <label htmlFor="cs-special" className="text-[11px] text-[var(--c-tx3)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Special chars
        </label>
      </div>
      <PreviewBadge value='"SEN-4821"' />
    </div>
  );
}

function TemporalEditor({ config }: { config: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Range Start"><TInput value={String(config.start ?? '2024-01-01T00:00:00Z')} /></Field>
        <Field label="Range End"><TInput value={String(config.end ?? '2026-12-31T23:59:59Z')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Output Format">
          <TSelect
            options={['ISO8601', 'Unix (s)', 'Unix (ms)', 'RFC2822', 'YYYY-MM-DD', 'HH:mm:ss', 'custom']}
            value={String(config.format ?? 'ISO8601')}
          />
        </Field>
        <Field label="Timezone">
          <TSelect
            options={['UTC', 'local', 'Europe/Madrid', 'America/New_York', 'Asia/Tokyo']}
            value={String(config.timezone ?? 'UTC')}
          />
        </Field>
      </div>
      <Field label="Generation Mode">
        <TSelect
          options={['random in range', 'now', 'now + offset', 'sequential (step)', 'fixed']}
          value={String(config.mode ?? 'random in range')}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Step / Offset"><TNumber value={0} unit="ms" /></Field>
        <Field label="Seed (optional)"><TInput value="" /></Field>
      </div>
      <PreviewBadge value="2025-07-14T14:32:08.441Z" />
    </div>
  );
}

function PointEditor({ config }: { config: Record<string, unknown> }) {
  const [space, setSpace] = useState('Geographic (lat/lng)');
  return (
    <div className="flex flex-col gap-3">
      <Field label="Coordinate Space">
        <select
          value={space}
          onChange={e => setSpace(e.target.value)}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {['Geographic (lat/lng)', 'Cartesian (x/y)', 'Polar (r/θ)'].map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>

      {space === 'Geographic (lat/lng)' ? (
        <>
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded">
            <span className="text-[10px] text-[var(--c-tx4)] flex-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Latitude range (−90° to +90°)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Lat Min"><TNumber value={Number(config.latMin ?? -90)} min={-90} max={90} /></Field>
            <Field label="Lat Max"><TNumber value={Number(config.latMax ?? 90)} min={-90} max={90} /></Field>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded">
            <span className="text-[10px] text-[var(--c-tx4)] flex-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Longitude range (−180° to +180°)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Lng Min"><TNumber value={Number(config.lngMin ?? -180)} min={-180} max={180} /></Field>
            <Field label="Lng Max"><TNumber value={Number(config.lngMax ?? 180)} min={-180} max={180} /></Field>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X Min"><TNumber value={0} /></Field>
            <Field label="X Max"><TNumber value={1000} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Y Min"><TNumber value={0} /></Field>
            <Field label="Y Max"><TNumber value={1000} /></Field>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Precision (decimals)">
          <TNumber value={Number(config.precision ?? 4)} min={0} max={10} />
        </Field>
        <Field label="Output Format">
          <TSelect
            options={['[lat, lng]', '(lat, lng)', 'lat,lng', 'GeoJSON Point', 'WKT POINT']}
            value={String(config.format ?? '[lat, lng]')}
          />
        </Field>
      </div>
      <PreviewBadge value="[40.4168, -3.7038]" />
    </div>
  );
}

function BooleanEditor({ config }: { config: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Probability of TRUE">
        <RangeSlider value={Number(config.probabilityTrue ?? 0.5) * 100} min={0} max={100} />
      </Field>
      <Field label="Output Format">
        <TSelect options={['true/false', '1/0', 'yes/no', 'on/off', 'enabled/disabled']} value="true/false" />
      </Field>
      <PreviewBadge value="true" />
    </div>
  );
}

const editorMap: Record<VariableType, (config: Record<string, unknown>) => React.ReactNode> = {
  numeric:  (c) => <NumericEditor config={c} />,
  list:     (c) => <ListEditor config={c} />,
  string:   (c) => <StringEditor config={c} />,
  temporal: (c) => <TemporalEditor config={c} />,
  point:    (c) => <PointEditor config={c} />,
  boolean:  (c) => <BooleanEditor config={c} />,
};

interface VariableEditorProps {
  variable: Variable;
  onBack: () => void;
}

export function VariableEditorWorkspace({ variable, onBack }: VariableEditorProps) {
  const info = typeInfo[variable.type];
  const sc = scopeColors[variable.scope];

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 max-w-2xl">
      {/* Breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[10px] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors w-fit"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <ChevronLeft size={10} /> back to selection
      </button>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={`flex items-center justify-center w-9 h-9 rounded border ${info.color.replace('text-', 'border-').replace('500', '500/40')} bg-[var(--c-bg4)]`}
        >
          <span className={info.color}>{info.icon}</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {variable.name}
            </h2>
            <span className={`text-[9px] px-2 py-0.5 rounded border ${sc.badge} tracking-wider uppercase`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {variable.scope}
            </span>
            <span className={`text-[9px] px-2 py-0.5 rounded border border-current/30 bg-current/10 ${info.color} tracking-wider uppercase`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {variable.type}
            </span>
          </div>
          <p className="text-xs text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {info.description}
          </p>
        </div>
      </div>

      {/* Base config */}
      <div className="bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded p-3 flex flex-col gap-3">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>Identity</span>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name"><TInput value={variable.name} /></Field>
          <Field label="Scope">
            <TSelect options={['local', 'group', 'global']} value={variable.scope} />
          </Field>
        </div>
        <Field label="Description"><TInput value={variable.description ?? ''} mono={false} /></Field>
      </div>

      {/* Type-specific editor */}
      <div className="bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded p-3 flex flex-col gap-3">
        <span className={`text-[10px] tracking-widest uppercase flex items-center gap-1.5 ${info.color}`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {info.icon} {variable.type} configuration
        </span>
        {editorMap[variable.type](variable.config)}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-500 text-xs hover:bg-cyan-500/20 transition-all"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Save changes
        </button>
        <button className="px-3 py-1.5 rounded border border-[var(--c-br1)] text-[var(--c-tx3)] text-xs hover:bg-[var(--c-bg6)] transition-all"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Discard
        </button>
        <div className="flex-1" />
        <button className="px-3 py-1.5 rounded border border-red-500/30 text-red-500 text-xs hover:bg-red-500/10 transition-all flex items-center gap-1.5"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <Trash2 size={10} /> Delete
        </button>
      </div>
    </div>
  );
}
