import { useState } from 'react';
import { Layers, ChevronRight, Cpu, AlertCircle, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { Group, Flow, OutputMode } from '../../types';
import { useApp } from '../../context';
import { StatusDot } from '../common/StatusDot';
import { OUTPUT_MODE_OPTIONS } from '../../core/outputMode';
import { formatRate, groupRate } from '../../core/metricsFormat';

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

function OutputModeField({
  value,
  onChange,
}: {
  value: OutputMode;
  onChange: (value: OutputMode) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="group-output-mode" className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        Output Mode
      </label>
      <select
        id="group-output-mode"
        value={value}
        onChange={e => onChange(e.target.value as OutputMode)}
        className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-xs text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        {OUTPUT_MODE_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <span className="text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {value === 'sequential'
          ? 'One FIFO queue: messages are sent in generation order by a single sender.'
          : 'Each flow runs on its own thread and sends as soon as it generates.'}
        {' '}Applies on next start.
      </span>
    </div>
  );
}

function FlowSummaryRow({ flow, onSelect }: { flow: Flow; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`Open ${flow.name}`}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left hover:bg-[var(--c-bg5)] transition-colors group"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      <StatusDot status={flow.connectionStatus} />
      <span className="text-[11px] text-[var(--c-tx2)] flex-1 truncate group-hover:text-[var(--c-tx1)]">{flow.name}</span>
      {flow.hasError && <AlertCircle size={10} className="text-red-500 shrink-0" />}
      <span className="text-[9px] text-[var(--c-tx4)] uppercase shrink-0">{flow.technology}</span>
      <ChevronRight size={11} className="text-[var(--c-tx5)] group-hover:text-cyan-500 shrink-0" />
    </button>
  );
}

interface GroupWorkspaceProps {
  group: Group;
}

export function GroupWorkspace({ group }: GroupWorkspaceProps) {
  const { state, actions } = useApp();
  const [isDeleting, setIsDeleting] = useState(false);
  const isDirty = state.dirtyItems.groupIds.has(group.id);

  const statusCfg = {
    running: { color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/40', label: 'RUNNING' },
    stopped: { color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-400/30',    label: 'STOPPED' },
    paused:  { color: 'text-amber-500',   bg: 'bg-amber-500/10 border-amber-500/40',    label: 'PAUSED' },
  }[group.status];

  const handleUpdate = (updates: Partial<Omit<Group, 'id' | 'flows'>>) => {
    actions.updateGroupConfig(group.id, updates, group.name);
  };

  const handleDiscard = () => {
    actions.discardItemChanges('group', group.id);
    toast.info(`Changes discarded for group "${group.name}"`);
  };

  const handleDelete = async () => {
    if (isDeleting) return;

    const confirmed = window.confirm(`Delete group "${group.name}"? This action cannot be undone.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await actions.deleteGroup(group.id);
      toast.success(`Group "${group.name}" deleted`);
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
            <h2 className="text-sm text-[var(--c-tx1)] flex items-center gap-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {group.name}
              {isDirty && <span className="text-amber-400 font-bold text-xs" title="Unsaved changes">*</span>}
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
            onClick={handleDiscard}
            disabled={!isDirty || isDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] text-[var(--c-tx4)] text-xs hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
            title="Revert group configuration to last saved state (Ctrl+Z)"
          >
            <RotateCcw size={11} /> Discard
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
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
          { label: 'THROUGHPUT', value: `${formatRate(groupRate(group, state.flowMetrics))} msg/s`, color: 'text-cyan-500' },
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
            value={group.name}
            onChange={name => handleUpdate({ name })}
          />
          <OutputModeField
            value={group.outputMode}
            onChange={outputMode => handleUpdate({ outputMode })}
          />
          <EditableField
            label="Description"
            value={group.description}
            onChange={description => handleUpdate({ description })}
            wide
          />
        </div>
      </div>

      {/* Flows summary */}
      <div className="bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded p-3 flex flex-col gap-2">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Flows in this group ({group.flows.length})
        </span>
        {group.flows.length === 0 ? (
          <span className="text-[10px] text-[var(--c-tx4)] italic px-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            No flows yet
          </span>
        ) : (
          <div className="flex flex-col">
            {group.flows.map(f => (
              <FlowSummaryRow key={f.id} flow={f} onSelect={() => actions.selectFlow(group.id, f.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
