import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Layers,
  Play,
  Square,
  Pause,
  Trash2,
  Lock,
  Unlock,
  Copy,
  MoreVertical,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../../ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../../ui/dropdown-menu';
import type { Group, Flow, Selection, GroupStatus } from '../../../../types';
import type { ConnectorPluginDescriptor } from '../../../../core/types';
import { CloneDialog } from './CloneDialog';
import { ConfirmDeleteDialog } from '../../../common/ConfirmDeleteDialog';
import { FlowItem } from './FlowItem';
import { CreateFlowDialog } from './CreateFlowDialog';

interface GroupItemProps {
  group: Group;
  selection: Selection;
  formatTemplate: Record<string, string>;
  onSelectGroup: (id: string) => void;
  onSelectFlow: (gId: string, fId: string) => void;
  onToggleGroup: (id: string) => void;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onCreateFlow: (
    groupId: string,
    name: string,
    technology: string,
    host: string,
    port: number,
    topic?: string,
    interval?: number,
    burst?: number,
    template?: string,
    connectorConfig?: Record<string, unknown>,
  ) => Promise<Flow>;
  onUpdateGroupConfig: (groupId: string, config: any, name?: string) => Promise<void>;
  onUpdateFlowConfig: (groupId: string, flowId: string, config: any, name?: string) => Promise<void>;
  onCloneGroup: (groupId: string, count: number, namingPattern?: string) => void;
  onCloneFlow: (groupId: string, flowId: string, count: number, namingPattern?: string) => void;
  onDeleteFlow: (groupId: string, flowId: string) => Promise<void>;
  latestConnectors: ConnectorPluginDescriptor[];
}

const groupStatusCfg: Record<GroupStatus, { color: string; icon: React.ReactNode; bg: string }> = {
  running: { color: 'text-emerald-500', icon: <Play size={9} fill="currentColor" />, bg: 'bg-emerald-400' },
  stopped: { color: 'text-slate-400',   icon: <Square size={9} fill="currentColor" />, bg: 'bg-slate-400' },
  paused:  { color: 'text-amber-500',   icon: <Pause size={9} fill="currentColor" />, bg: 'bg-amber-400' },
};

export function GroupItem({
  group,
  selection,
  formatTemplate,
  onSelectGroup,
  onSelectFlow,
  onToggleGroup,
  onDeleteGroup,
  onCreateFlow,
  onUpdateGroupConfig,
  onUpdateFlowConfig,
  onCloneGroup,
  onCloneFlow,
  onDeleteFlow,
  latestConnectors,
}: GroupItemProps) {
  const gCfg = groupStatusCfg[group.status];
  const selectedGroup = selection.type === 'group' && selection.groupId === group.id;
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [isCreateFlowOpen, setIsCreateFlowOpen] = useState(false);

  const handleDeleteConfirm = async () => {
    try {
      await onDeleteGroup(group.id);
      toast.success(`Group "${group.name}" deleted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete group';
      toast.error(message);
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  return (
    <div className="mb-px">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`flex items-center gap-1.5 px-2 py-2 cursor-pointer transition-all ${
              selectedGroup
                ? 'bg-cyan-500/10 border-l-2 border-l-cyan-500'
                : 'hover:bg-cyan-500/5 border-l-2 border-l-transparent'
            } ${!group.enabled ? 'opacity-40' : ''}`}
          >
            <button
              onClick={() => onToggleGroup(group.id)}
              className="text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors p-0.5"
              aria-label={group.expanded ? 'Collapse group' : 'Expand group'}
            >
              {group.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            <div
              onClick={() => onSelectGroup(group.id)}
              className="flex-1 flex flex-col gap-0.5 text-left cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                    selectedGroup
                      ? 'border-cyan-500/40 text-cyan-500 bg-cyan-500/10'
                      : 'border-[var(--c-br1)] text-cyan-400 bg-[var(--c-bg1)]'
                  }`}
                  title="Group"
                >
                  <Layers size={9} />
                </span>
                <span
                  className={`text-xs truncate ${selectedGroup ? 'text-[var(--c-tx1)]' : 'text-[var(--c-tx2)]'}`}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {group.name}
                </span>

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
                        onUpdateGroupConfig(group.id, { enabled: !group.enabled }, group.name);
                      }}
                      className="text-xs text-[var(--c-tx2)] focus:bg-cyan-500/10 focus:text-cyan-400"
                    >
                      {group.enabled ? <Lock size={12} className="mr-2" /> : <Unlock size={12} className="mr-2" />}
                      {group.enabled ? 'Lock group' : 'Unlock group'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCloneOpen(true);
                      }}
                      className="text-xs text-[var(--c-tx2)] focus:bg-violet-500/10 focus:text-violet-400"
                    >
                      <Copy size={12} className="mr-2" />
                      Clone group
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
                      Delete group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <CloneDialog
                  isOpen={isCloneOpen}
                  onOpenChange={setIsCloneOpen}
                  onConfirm={(count, pattern) => onCloneGroup(group.id, count, pattern)}
                  title="Clone Group"
                  itemName={group.name}
                />
              </div>
              <div className="flex items-center gap-2 pl-3">
                <span className={`text-[10px] ${gCfg.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {group.throughput}
                </span>
                <span className="text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {group.flows.length} flows
                </span>
                {group.flows.some(f => f.hasError) && (
                  <AlertCircle size={9} className="text-red-500" />
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48 bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]">
          <ContextMenuLabel>Group actions</ContextMenuLabel>
          <ContextMenuSeparator className="bg-[var(--c-br1)]" />
          <ContextMenuItem onSelect={() => setIsDeleteConfirmOpen(true)} className="text-red-500 focus:text-red-500 focus:bg-red-500/10">
            <Trash2 size={14} className="mr-2" />
            Delete group
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <ConfirmDeleteDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="Delete group"
        description={`This will permanently delete "${group.name}" and all of its flows. This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
      />

      {/* Flows List */}
      {group.expanded && (
        <div className="pl-4 border-l border-cyan-500/20 ml-4 bg-gradient-to-r from-cyan-500/5 to-transparent">
          {group.flows.map(flow => (
            <FlowItem
              key={flow.id}
              flow={flow}
              groupId={group.id}
              selected={selection.type === 'flow' && selection.flowId === flow.id}
              onSelect={onSelectFlow}
              onToggleEnabled={(gId, fId, en, name) => onUpdateFlowConfig(gId, fId, { enabled: en }, name)}
              onClone={onCloneFlow}
              onDelete={onDeleteFlow}
              formatTemplate={formatTemplate}
            />
          ))}
          <button
            onClick={() => setIsCreateFlowOpen(true)}
            className="w-full text-left px-3 py-1.5 flex items-center gap-1.5 text-[10px] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors"
          >
            <Plus size={9} /> add flow
          </button>

          <CreateFlowDialog
            open={isCreateFlowOpen}
            onOpenChange={setIsCreateFlowOpen}
            groupId={group.id}
            latestConnectors={latestConnectors}
            onCreateFlow={onCreateFlow}
            onSelectFlow={onSelectFlow}
          />
        </div>
      )}
    </div>
  );
}
