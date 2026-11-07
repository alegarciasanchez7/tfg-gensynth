import { useMemo, useState } from 'react';
import {
  Radio,
  Layers,
  Globe,
  Wifi,
  Zap,
  Cpu,
  AlertTriangle,
  MoreVertical,
  Lock,
  Unlock,
  Copy,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../../../../context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../../ui/dropdown-menu';
import type { Flow, ConnectionStatus } from '../../../../types';
import { CloneDialog } from './CloneDialog';
import { ConfirmDeleteDialog } from '../../../common/ConfirmDeleteDialog';
import { StatusDot } from '../../../common/StatusDot';
import { formatCount, formatRate } from '../../../../core/metricsFormat';
import { commandErrorMessage } from '../../../../core/errorMessage';
import { findTemplateVariableRefs } from '../../../../core/templateVariables';
import { normalizeConnectionStatus } from '../../../../core/entityStatus';

interface FlowItemProps {
  flow: Flow;
  selected: boolean;
  groupId: string;
  onSelect: (gId: string, fId: string) => void;
  onToggleEnabled: (gId: string, fId: string, enabled: boolean, name: string) => void;
  onClone: (gId: string, fId: string, count: number, namingPattern?: string) => void;
  onDelete: (gId: string, fId: string) => Promise<void>;
  formatTemplate: Record<string, string>;
  /** Names of the flows of the group, to preview clone names that collide. */
  siblingNames?: readonly string[];
}

const connColor: Record<ConnectionStatus, string> = {
  connected: 'text-emerald-500',
  disconnected: 'text-slate-400',
  error: 'text-red-500',
  warning: 'text-amber-500',
};

const techIcon: Record<string, React.ReactNode> = {
  Kafka:     <Radio size={10} />,
  HTTP:      <Globe size={10} />,
  MQTT:      <Wifi size={10} />,
  WebSocket: <Zap size={10} />,
  gRPC:      <Cpu size={10} />,
  TCP:       <Layers size={10} />,
};

const scopeVarColor: Record<string, string> = {
  local:  'text-sky-500',
  group:  'text-violet-500',
  global: 'text-amber-500',
};

export function FlowItem({
  flow,
  selected,
  groupId,
  onSelect,
  onToggleEnabled,
  onClone,
  onDelete,
  formatTemplate,
  siblingNames,
}: FlowItemProps) {
  const { state } = useApp();
  const isDirty = state?.dirtyItems?.flowIds?.has(flow.id) ?? false;
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  
  const connCfg = connColor[normalizeConnectionStatus(flow.connectionStatus)];
  const liveMetrics = state?.flowMetrics?.[flow.id];
  const fails = liveMetrics?.failed ?? 0;
  const dropped = liveMetrics?.dropped ?? 0;
  const template = formatTemplate[flow.id] ?? '';
  // Unscoped placeholders ({{temperature}}) resolve to the closest scope, like the Core
  const variables = state?.variables;
  const usedVars = useMemo(
    () => findTemplateVariableRefs(template, variables ?? [], flow.id, groupId),
    [template, variables, flow.id, groupId],
  );

  // The badge already shows the technology, so a "Kafka · topic" name (mock data) drops that
  // prefix; any other name, even one containing "·", is shown as typed
  const techPrefix = `${flow.technology} · `;
  const displayName = flow.name.startsWith(techPrefix) ? flow.name.slice(techPrefix.length) : flow.name;

  const handleDeleteConfirm = async () => {
    try {
      await onDelete(groupId, flow.id);
      toast.success(`Flow "${flow.name}" deleted`);
    } catch (error) {
      const message = commandErrorMessage(error, 'Unable to delete flow');
      toast.error(message);
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(groupId, flow.id)}
      onKeyDown={(e) => {
        // Only the row itself: keys pressed on its menu button or menu items bubble up here too
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onSelect(groupId, flow.id);
      }}
      className={`w-full text-left px-3 py-2 flex flex-col gap-1 border-l-2 transition-all cursor-pointer ${
        selected
          ? 'bg-violet-500/10 border-l-violet-500'
          : 'border-l-transparent hover:bg-violet-500/5 hover:border-l-violet-400/60'
      }`}
    >
      {/* Row 1: tech badge + name + lock */}
      <div className={`flex items-center gap-1.5 transition-opacity ${!flow.enabled ? 'opacity-40' : ''}`}>
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
            selected
              ? 'border-violet-500/40 text-violet-500 bg-violet-500/10'
              : 'border-[var(--c-br1)] text-violet-400 bg-[var(--c-bg1)]'
          }`}
          title="Flow"
        >
          <Radio size={9} />
        </span>
        <span
          className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] border ${
            selected
              ? 'border-violet-500/40 text-violet-500 bg-violet-500/10'
              : 'border-[var(--c-br1)] text-[var(--c-tx3)] bg-[var(--c-bg1)]'
          }`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {techIcon[flow.technology] ?? <Layers size={9} />}
          <span className="ml-0.5">{flow.technology}</span>
        </span>
        <span
          className={`text-[11px] truncate ${selected ? 'text-[var(--c-tx1)]' : 'text-[var(--c-tx3)]'}`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {displayName}
        </span>
        {isDirty && <span className="text-amber-400 font-bold text-xs" title="Unsaved changes">*</span>}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="ml-auto p-1 rounded text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-black/10 transition-colors"
            >
              <MoreVertical size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 bg-[var(--c-bg2)] border-[var(--c-br1)]">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onToggleEnabled(groupId, flow.id, !flow.enabled, flow.name);
              }}
              className="text-xs text-[var(--c-tx2)] focus:bg-violet-500/10 focus:text-violet-400"
            >
              {flow.enabled ? <Lock size={12} className="mr-2" /> : <Unlock size={12} className="mr-2" />}
              {flow.enabled ? 'Lock flow' : 'Unlock flow'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsCloneOpen(true);
              }}
              className="text-xs text-[var(--c-tx2)] focus:bg-violet-500/10 focus:text-violet-400"
            >
              <Copy size={12} className="mr-2" />
              Clone flow
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[var(--c-br1)]" />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteConfirmOpen(true);
              }}
              className="text-xs text-red-500 focus:bg-red-500/10 focus:text-red-400"
            >
              <Trash2 size={12} className="mr-2" />
              Delete flow
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <CloneDialog
          isOpen={isCloneOpen}
          onOpenChange={setIsCloneOpen}
          onConfirm={(count, pattern) => onClone(groupId, flow.id, count, pattern)}
          title="Clone Flow"
          itemName={flow.name}
          existingNames={siblingNames}
        />

        <ConfirmDeleteDialog
          open={isDeleteConfirmOpen}
          onOpenChange={setIsDeleteConfirmOpen}
          title="Delete flow"
          description={`This will permanently delete flow "${flow.name}". This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
        />
      </div>

      {/* Row 2: status dot + live metrics (msg/s · sent · fails · dropped) + error */}
      <div
        className={`flex flex-wrap items-center gap-x-1.5 pl-0.5 text-[10px] transition-opacity [&>span]:whitespace-nowrap ${!flow.enabled ? 'opacity-40' : ''}`}
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
        data-testid="flow-metrics"
      >
        <StatusDot status={flow.connectionStatus} />
        <span className={connCfg} title="Messages sent per second">
          {formatRate(liveMetrics?.throughput ?? 0)} <span className="text-[var(--c-tx4)]">msg/s</span>
        </span>
        <span className="text-[var(--c-tx5)]">·</span>
        <span className="text-[var(--c-tx2)]" title="Messages sent (publish completed without error)">
          {formatCount(liveMetrics?.sent ?? 0)} <span className="text-[var(--c-tx4)]">sent</span>
        </span>
        <span className="text-[var(--c-tx5)]">·</span>
        <span
          className={fails > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--c-tx2)]'}
          title="Messages that could not be sent (generation or publish error)"
        >
          {formatCount(fails)} <span className="text-[var(--c-tx4)]">fails</span>
        </span>
        {dropped > 0 && (
          <>
            <span className="text-[var(--c-tx5)]">·</span>
            <span className="text-amber-600 dark:text-amber-400" title="Generated but lost on purpose (event loss)">
              {formatCount(dropped)} <span className="text-[var(--c-tx4)]">dropped</span>
            </span>
          </>
        )}
        {flow.hasError && (
          <AlertTriangle size={10} className="text-red-500 ml-auto" />
        )}
      </div>

      {/* Row 3: Variables referenced in the template */}
      {usedVars.length > 0 && (
        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 pl-0.5 pt-0.5">
          {usedVars.map((v, idx) => (
            <span
              key={v.key}
              className={`text-[9px] ${scopeVarColor[v.scope] ?? scopeVarColor.global}`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
              title={`${v.scope} · {{${v.scope}.${v.name}}}`}
            >
              {v.name}{idx < usedVars.length - 1 && <span className="text-[var(--c-tx5)] ml-0.5">,</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
