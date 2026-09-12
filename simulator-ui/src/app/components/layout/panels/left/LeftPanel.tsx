import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Plus, ChevronDown, Layers, Radio, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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
  const [width, setWidth] = useState(260);
  const [collapsed, setCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isCreateFlowOpen, setIsCreateFlowOpen] = useState(false);

  const startX = useRef(0);
  const startW = useRef(0);

  const handleMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startW.current = width;
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(180, Math.min(500, startW.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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

  if (collapsed) {
    return (
      <div className="flex flex-col border-r border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0 z-20">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand Groups & Flows"
          className="flex items-center gap-2 px-2 py-3 text-[10px] font-bold text-[var(--c-tx3)] hover:text-cyan-400 hover:bg-[var(--c-bg5)] transition-all tracking-widest uppercase border-b border-[var(--c-br2)]"
          style={{ writingMode: 'vertical-rl', fontFamily: 'JetBrains Mono, monospace' }}
        >
          <PanelLeftOpen size={13} className="rotate-90" />
          <span>GROUPS &amp; FLOWS</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-r border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0 relative"
      style={{ width }}
    >
        {/* Panel Header */}
        <div className="p-3 border-b border-[var(--c-br2)] bg-[var(--c-bg2)]/50 flex items-center justify-between shrink-0 relative gap-2">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--c-tx3)] truncate"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              GROUPS &amp; FLOWS
            </h2>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse Groups & Flows"
              className="p-1 rounded text-[var(--c-tx4)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all shrink-0"
            >
              <PanelLeftClose size={13} />
            </button>
          </div>

        {/* Add dropdown menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1.5 px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-bold transition-all shadow-lg shadow-cyan-500/10"
            aria-label="Add group or flow"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <Plus size={12} /> ADD
            <ChevronDown size={10} className={`transition-transform duration-200 ${showAddMenu ? 'rotate-180' : ''}`} />
          </button>

          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1.5 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-2xl py-1 min-w-36 animate-in fade-in zoom-in-95 duration-150">
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  setIsCreateGroupOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[10px] text-[var(--c-tx2)] hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-500">
                  <Layers size={9} />
                </span>
                <span className="capitalize">Add Group</span>
              </button>
              <button
                onClick={() => {
                  setShowAddMenu(false);
                  setIsCreateFlowOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[10px] text-[var(--c-tx2)] hover:bg-violet-500/10 hover:text-violet-400 transition-colors"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-violet-500/20 bg-violet-500/10 text-violet-500">
                  <Radio size={8} />
                </span>
                <span className="capitalize">Add Flow</span>
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
      {/* Ultrafine Resizer Handle on Right Edge */}
      <div
        onMouseDown={handleMouseDownResizer}
        className="absolute top-0 bottom-0 -right-1 w-2 cursor-col-resize z-40 group flex justify-center"
        title="Drag to resize width"
      >
        <div
          className={`w-[2px] h-full transition-colors ${
            isResizing ? 'bg-cyan-500' : 'bg-transparent group-hover:bg-cyan-500/60'
          }`}
        />
      </div>

      {isResizing && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize select-none" />
      )}
    </div>
  );
}
