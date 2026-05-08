import { useEffect, useState } from 'react';
import {
  Layers, ChevronRight,
  Clock, Cpu, AlertCircle, CheckCircle, Wifi, WifiOff,
  Save, Trash2, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Group, Flow, ConnectionStatus } from '../../types';
import { useApp } from '../../context';

const connBadge: Record<ConnectionStatus, { color: string; bg: string; label: string }> = {
  connected:    { color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'CONNECTED' },
  disconnected: { color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-400/30',    label: 'DISCONNECTED' },
  error:        { color: 'text-red-500',     bg: 'bg-red-500/10 border-red-500/30',        label: 'ERROR' },
  warning:      { color: 'text-amber-500',   bg: 'bg-amber-500/10 border-amber-500/30',    label: 'WARNING' },
};


function EditableField({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${wide ? 'col-span-2' : ''}`}>
      <label className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-xs text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 focus:bg-[var(--c-bg4)] transition-all"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      />
    </div>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-xs text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all appearance-none"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function NumberField({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange?: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {label}
      </label>
      <div className="flex items-center">
        <input
          type="number"
          value={value}
          readOnly={!onChange}
          onChange={e => onChange?.(Number(e.target.value))}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded-l px-2.5 py-1.5 text-xs text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />
        {unit && (
          <span className="px-2 py-1.5 bg-[var(--c-bg4)] border border-l-0 border-[var(--c-br1)] rounded-r text-[10px] text-[var(--c-tx4)] shrink-0"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function FlowSummaryRow({ flow }: { flow: Flow }) {
  const badge = connBadge[flow.connectionStatus];
  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-[var(--c-br1)] rounded bg-[var(--c-bg1)] hover:border-[var(--c-br3)] transition-colors">
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] ${badge.bg} ${badge.color}`}
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {flow.connectionStatus === 'connected' ? <Wifi size={8} /> : <WifiOff size={8} />}
        {badge.label}
      </div>
      <span className="text-xs text-[var(--c-tx2)] flex-1 truncate" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {flow.name}
      </span>
      <span className="text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {flow.throughput}
      </span>
      {flow.hasError && <AlertCircle size={11} className="text-red-500" />}
      {!flow.hasError && flow.connectionStatus === 'connected' && <CheckCircle size={11} className="text-emerald-500" />}
      <ChevronRight size={11} className="text-[var(--c-tx5)]" />
    </div>
  );
}

interface GroupWorkspaceProps {
  group: Group;
}

export function GroupWorkspace({ group }: GroupWorkspaceProps) {
  const { actions } = useApp();
  const [draft, setDraft] = useState({
    name: group.name,
    description: group.description,
    threads: group.threads,
    outputMode: group.outputMode,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setDraft({
      name: group.name,
      description: group.description,
      threads: group.threads,
      outputMode: group.outputMode,
    });
  }, [group.description, group.id, group.name, group.outputMode, group.threads]);

  const statusCfg = {
    running: { color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/40', label: 'RUNNING' },
    stopped: { color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-400/30',    label: 'STOPPED' },
    paused:  { color: 'text-amber-500',   bg: 'bg-amber-500/10 border-amber-500/40',    label: 'PAUSED' },
  }[group.status];

  const hasChanges =
    draft.name !== group.name ||
    draft.description !== group.description ||
    draft.threads !== group.threads ||
    draft.outputMode !== group.outputMode;

  const handleSave = async () => {
    if (!hasChanges || isSaving || isDeleting) {
      return;
    }

    setIsSaving(true);
    try {
      await actions.updateGroupConfig(group.id, {
        name: draft.name.trim(),
        description: draft.description,
        threads: draft.threads,
        outputMode: draft.outputMode,
      });
      toast.success('Group changes saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save group changes';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (isSaving || isDeleting) {
      return;
    }

    setDraft({
      name: group.name,
      description: group.description,
      threads: group.threads,
      outputMode: group.outputMode,
    });
  };

  const handleDelete = async () => {
    if (isSaving || isDeleting) {
      return;
    }

    const confirmed = window.confirm(`Delete group \"${group.name}\"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await actions.deleteGroup(group.id);
      toast.success('Group deleted');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete group';
      toast.error(message);
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      {/* Group header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-cyan-500" />
            <h2 className="text-sm text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {group.name}
            </h2>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${statusCfg.bg} ${statusCfg.color} tracking-widest`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-xs text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {group.description}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving || isDeleting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              hasChanges 
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' 
                : 'border-[var(--c-br1)] text-[var(--c-tx4)]'
            }`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <Save size={11} /> {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={handleDiscard}
            disabled={!hasChanges || isSaving || isDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] text-[var(--c-tx4)] text-xs hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <RotateCcw size={11} /> Discard
          </button>
          <button
            onClick={handleDelete}
            disabled={isSaving || isDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-500 text-xs hover:bg-red-500/20 transition-all disabled:opacity-50"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <Trash2 size={11} /> {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="flex gap-3">
        {[
          { label: 'THROUGHPUT', value: group.throughput, color: 'text-cyan-500' },
          { label: 'THREADS',    value: String(group.threads), color: 'text-violet-500' },
          { label: 'FLOWS',      value: String(group.flows.length), color: 'text-[var(--c-tx2)]' },
          { label: 'ERRORS',     value: String(group.flows.filter(f => f.hasError).length), color: group.flows.some(f => f.hasError) ? 'text-red-500' : 'text-slate-400' },
        ].map(m => (
          <div key={m.label} className="flex-1 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded px-3 py-2 flex flex-col gap-0.5">
            <span className="text-[9px] text-[var(--c-tx4)] tracking-widest" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {m.label}
            </span>
            <span className={`text-sm ${m.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {/* Configuration */}
      <div className="bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded p-3 flex flex-col gap-3">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase flex items-center gap-1.5"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <Cpu size={10} /> Configuration
        </span>
        <div className="grid grid-cols-2 gap-3">
          <EditableField
            label="Group Name"
            value={draft.name}
            onChange={name => setDraft(current => ({ ...current, name }))}
          />
          <SelectField
            label="Output Mode"
            options={['parallel', 'sequential', 'round-robin']}
            value={draft.outputMode}
            onChange={outputMode => setDraft(current => ({ ...current, outputMode }))}
          />
          <NumberField
            label="Threads"
            value={draft.threads}
            unit="threads"
            onChange={threads => setDraft(current => ({ ...current, threads }))}
          />
          <NumberField label="Global Rate Limit" value={5000} unit="msg/s" onChange={() => {}} />
          <EditableField
            label="Description"
            value={draft.description}
            onChange={description => setDraft(current => ({ ...current, description }))}
            wide
          />
        </div>
      </div>

      {/* Timing */}
      <div className="bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded p-3 flex flex-col gap-3">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase flex items-center gap-1.5"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <Clock size={10} /> Timing &amp; Scheduling
        </span>
        <div className="grid grid-cols-3 gap-3">
          <SelectField label="Schedule Mode" options={['continuous', 'interval', 'cron', 'burst']} value="continuous" onChange={() => {}} />
          <NumberField label="Warmup Delay" value={0} unit="ms" onChange={() => {}} />
          <NumberField label="Shutdown Grace" value={2000} unit="ms" onChange={() => {}} />
        </div>
      </div>

      {/* Flows summary */}
      <div className="bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded p-3 flex flex-col gap-2">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Flows in this group
        </span>
        <div className="flex flex-col gap-1.5">
          {group.flows.map(f => <FlowSummaryRow key={f.id} flow={f} />)}
        </div>
      </div>


    </div>
  );
}
