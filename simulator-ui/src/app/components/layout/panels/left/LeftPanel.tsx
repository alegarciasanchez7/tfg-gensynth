import { useState, type FormEvent } from 'react';
import { Plus, ChevronDown, Layers, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../ui/dialog';
import { Input } from '../../../ui/input';
import { Textarea } from '../../../ui/textarea';
import type { Group, Flow, Selection, Variable } from '../../../../types';
import type { ConnectorPluginDescriptor } from '../../../../core/types';
import { GroupItem } from './GroupItem';
import { CreateFlowDialog } from './CreateFlowDialog';

interface LeftPanelProps {
  groups: Group[];
  variables: Variable[];
  selection: Selection;
  formatTemplate: Record<string, string>;
  latestConnectors: ConnectorPluginDescriptor[];
  onSelectGroup: (groupId: string) => void;
  onSelectFlow: (groupId: string, flowId: string) => void;
  onToggleGroup: (groupId: string) => void;
  onCreateGroup: (name: string, description?: string) => Promise<Group>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onDeleteFlow: (groupId: string, flowId: string) => Promise<void>;
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
}

export function LeftPanel({
  groups,
  variables: _variables,
  selection,
  formatTemplate,
  latestConnectors,
  onSelectGroup,
  onSelectFlow,
  onToggleGroup,
  onCreateGroup,
  onDeleteGroup,
  onCreateFlow,
  onUpdateGroupConfig,
  onUpdateFlowConfig,
  onCloneGroup,
  onCloneFlow,
  onDeleteFlow,
}: LeftPanelProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isCreateFlowOpen, setIsCreateFlowOpen] = useState(false);

  const resetCreateGroupForm = () => {
    setGroupName('');
    setGroupDescription('');
  };

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await onCreateGroup(groupName.trim(), groupDescription.trim() || undefined);
      toast.success(`Group "${groupName.trim()}" created`);
      setIsCreateGroupOpen(false);
      resetCreateGroupForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create group';
      toast.error(message);
    }
  };

  return (
    <div
      className="flex flex-col border-r border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0 overflow-hidden"
      style={{ width: 260 }}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-br2)] shrink-0 relative gap-2">
        <span
          className="inline-flex items-center rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2 py-1 text-[10px] text-[var(--c-tx4)] tracking-widest uppercase shrink-0"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          Groups &amp; Flows
        </span>

        {/* Add dropdown menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] transition-all whitespace-nowrap ${
              showAddMenu
                ? 'border-cyan-500/50 text-cyan-500 bg-cyan-500/10'
                : 'border-[var(--c-br1)] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]'
            }`}
            aria-label="Add group or flow"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <Plus size={11} />
            <span>add</span>
            <ChevronDown size={10} className={`transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
          </button>

          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--c-bg8)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 min-w-40 py-1">
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  setIsCreateGroupOpen(true);
                }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[10px] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-cyan-500/5 transition-colors"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-500">
                  <Layers size={9} />
                </span>
                <span>add group</span>
              </button>
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  setIsCreateFlowOpen(true);
                }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[10px] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-violet-500/5 transition-colors"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-violet-500/20 bg-violet-500/10 text-violet-500">
                  <Radio size={8} />
                </span>
                <span>add flow</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
        <DialogContent className="bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]">
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-[var(--c-tx1)]">Create group</DialogTitle>
              <DialogDescription className="text-[var(--c-tx4)]">
                Define a new group with a name and an optional description.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-xs text-[var(--c-tx3)]" htmlFor="group-name">
                Name
              </label>
              <Input
                id="group-name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Sensor Ingestion"
                className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--c-tx3)]" htmlFor="group-description">
                Description
              </label>
              <Textarea
                id="group-description"
                value={groupDescription}
                onChange={(event) => setGroupDescription(event.target.value)}
                placeholder="Optional description for this group"
                className="bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx1)] placeholder-[var(--c-tx4)]"
                rows={4}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateGroupOpen(false)}
                className="border-[var(--c-br1)] hover:bg-[var(--c-bg5)] text-[var(--c-tx2)]"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!groupName.trim()} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                Create group
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Global Create Flow Dialog */}
      <CreateFlowDialog
        open={isCreateFlowOpen}
        onOpenChange={setIsCreateFlowOpen}
        groups={groups}
        latestConnectors={latestConnectors}
        onCreateFlow={onCreateFlow}
        onSelectFlow={onSelectFlow}
      />

      {/* Scope legend */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--c-br2)] shrink-0">
        {(['local', 'group', 'global'] as const).map(s => (
          <div key={s} className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${
              s === 'local' ? 'bg-sky-400' : s === 'group' ? 'bg-violet-400' : 'bg-amber-400'
            }`} />
            <span className="text-[9px] text-[var(--c-tx5)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto py-1">
        {groups.map(group => (
          <GroupItem
            key={group.id}
            group={group}
            selection={selection}
            formatTemplate={formatTemplate}
            onSelectGroup={onSelectGroup}
            onSelectFlow={onSelectFlow}
            onToggleGroup={onToggleGroup}
            onDeleteGroup={onDeleteGroup}
            onCreateFlow={onCreateFlow}
            onUpdateGroupConfig={onUpdateGroupConfig}
            onUpdateFlowConfig={onUpdateFlowConfig}
            onCloneGroup={onCloneGroup}
            onCloneFlow={onCloneFlow}
            onDeleteFlow={onDeleteFlow}
            latestConnectors={latestConnectors}
          />
        ))}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-2 border-t border-[var(--c-br2)] flex items-center gap-3 shrink-0">
        <span className="text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {groups.filter(g => g.status === 'running').length}/{groups.length} running
        </span>
        <span className="text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {groups.reduce((s, g) => s + g.flows.length, 0)} flows total
        </span>
      </div>
    </div>
  );
}
