import { useState } from 'react';
import { Layers, ChevronRight, ChevronUp, ChevronDown, Cpu, AlertCircle, Trash2, RotateCcw, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { Group, Flow, OutputMode, SequentialOrder } from '../../types';
import { useApp } from '../../context';
import { StatusDot } from '../common/StatusDot';
import { OUTPUT_MODE_OPTIONS, SEQUENTIAL_ORDER_OPTIONS } from '../../core/outputMode';
import { Button } from '../ui/button';
import { formatRate, groupRate } from '../../core/metricsFormat';
import { commandErrorMessage } from '../../core/errorMessage';
import { normalizeGroupStatus } from '../../core/entityStatus';

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

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value as T)}
        className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-xs text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <span className="text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {hint}
      </span>
    </div>
  );
}

function FlowSummaryRow({
  flow,
  position,
  isFirst,
  isLast,
  onSelect,
  onMove,
}: {
  flow: Flow;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onMove: (direction: 'up' | 'down') => void;
}) {
  const moveClass = 'h-6 w-6 p-0 text-[var(--c-tx4)] hover:text-[var(--c-tx1)] disabled:opacity-30';
  return (
    <div className="flex items-center gap-1">
      <span className="w-5 text-right text-[10px] text-[var(--c-tx4)] shrink-0" title={`Position ${position}`}
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {position}
      </span>
      <button
        type="button"
        onClick={onSelect}
        title={`Open ${flow.name}`}
        className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 rounded text-left hover:bg-[var(--c-bg5)] transition-colors group"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <StatusDot status={flow.connectionStatus} />
        <span className="text-[11px] text-[var(--c-tx2)] flex-1 truncate group-hover:text-[var(--c-tx1)]">{flow.name}</span>
        {flow.hasError && <AlertCircle size={10} className="text-red-500 shrink-0" />}
        <span className="text-[9px] text-[var(--c-tx4)] uppercase shrink-0">{flow.technology}</span>
        <ChevronRight size={11} className="text-[var(--c-tx5)] group-hover:text-cyan-500 shrink-0" />
      </button>
      <Button type="button" variant="ghost" size="icon" className={moveClass} disabled={isFirst}
        onClick={() => onMove('up')} title="Move Up" aria-label={`Move ${flow.name} up`}>
        <ChevronUp className="w-3.5 h-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className={moveClass} disabled={isLast}
        onClick={() => onMove('down')} title="Move Down" aria-label={`Move ${flow.name} down`}>
        <ChevronDown className="w-3.5 h-3.5" />
      </Button>
    </div>
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
  }[normalizeGroupStatus(group.status)];

  const handleUpdate = (updates: Partial<Omit<Group, 'id' | 'flows'>>) => {
    actions.updateGroupConfig(group.id, updates, group.name);
  };

  const handleMoveFlow = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= group.flows.length) return;
    const ids = group.flows.map(f => f.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    actions.reorderGroupFlows(group.id, ids).catch(error => {
      toast.error(commandErrorMessage(error, 'Unable to change the order of the flows'));
    });
  };

  const isSequential = group.outputMode === 'sequential';
  const sequentialOrderHint = isSequential
    ? `${SEQUENTIAL_ORDER_OPTIONS.find(option => option.value === group.sequentialOrder)?.hint ?? ''} Applies on next start.`
    : 'Only for sequential groups.';

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
      const message = commandErrorMessage(error, 'Unable to delete group');
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
            {/* A locked group generates nothing, so LOCKED replaces its run status */}
            {group.enabled && (
              <span className={`text-[10px] px-2 py-0.5 rounded border ${statusCfg.bg} ${statusCfg.color} tracking-widest`}
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {statusCfg.label}
              </span>
            )}
            {!group.enabled && (
              <span
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border bg-amber-500/10 border-amber-500/40 text-amber-500 tracking-widest"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
                title="Locked: its flows do not generate messages. Unlock it from the group menu (⋮)."
              >
                <Lock size={9} /> LOCKED
              </span>
            )}
          </div>
          {!group.enabled && (
            <p className="text-[10px] text-amber-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Locked: its flows do not generate messages. Unlock it from the group menu (⋮).
            </p>
          )}
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
          <SelectField<OutputMode>
            id="group-output-mode"
            label="Output Mode"
            value={group.outputMode}
            options={OUTPUT_MODE_OPTIONS}
            onChange={outputMode => handleUpdate({ outputMode })}
            hint={`${isSequential
              ? 'One FIFO queue: messages are sent one after another by a single sender.'
              : 'Each flow runs on its own thread and sends as soon as it generates.'} Applies on next start.`}
          />
          <SelectField<SequentialOrder>
            id="group-sequential-order"
            label="Sequential Order"
            value={group.sequentialOrder}
            options={SEQUENTIAL_ORDER_OPTIONS}
            onChange={sequentialOrder => handleUpdate({ sequentialOrder })}
            hint={sequentialOrderHint}
            disabled={!isSequential}
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
        {isSequential && group.sequentialOrder === 'flow' && group.flows.length > 1 && (
          <span className="text-[9px] text-[var(--c-tx4)] px-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Messages of a tick are sent in this order. Use the arrows to change it.
          </span>
        )}
        {group.flows.length === 0 ? (
          <span className="text-[10px] text-[var(--c-tx4)] italic px-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            No flows yet
          </span>
        ) : (
          <div className="flex flex-col">
            {group.flows.map((f, index) => (
              <FlowSummaryRow
                key={f.id}
                flow={f}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === group.flows.length - 1}
                onSelect={() => actions.selectFlow(group.id, f.id)}
                onMove={direction => handleMoveFlow(index, direction)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
