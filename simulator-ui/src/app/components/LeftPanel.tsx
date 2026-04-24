import { useEffect, useState, type FormEvent } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  AlertTriangle,
  Radio,
  Layers,
  Wifi,
  AlertCircle,
  Globe,
  Cpu,
  Zap,
  Play,
  Square,
  Pause,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/context-menu';
import type { Group, Flow, Selection, ConnectionStatus, GroupStatus, Variable } from '../types';
import type { ConnectorHealthSummary } from '../types';
import type { ConnectorPluginDescriptor } from '../core/types';

interface LeftPanelProps {
  groups: Group[];
  selection: Selection;
  variables: Variable[];
  formatTemplate: Record<string, string>;
  connectorCatalog: ConnectorPluginDescriptor[];
  latestConnectors: ConnectorPluginDescriptor[];
  connectorHealthSummary: ConnectorHealthSummary[];
  onSelectGroup: (groupId: string) => void;
  onSelectFlow: (groupId: string, flowId: string) => void;
  onToggleGroup: (groupId: string) => void;
  onCreateGroup: (name: string, description?: string) => Promise<Group>;
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
  ) => Promise<Flow>;
}

const connColor: Record<ConnectionStatus, string> = {
  connected: 'text-emerald-500',
  disconnected: 'text-slate-400',
  error: 'text-red-500',
  warning: 'text-amber-500',
};

const connBg: Record<ConnectionStatus, string> = {
  connected: 'bg-emerald-400',
  disconnected: 'bg-slate-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
};

const groupStatusCfg: Record<GroupStatus, { color: string; icon: React.ReactNode; bg: string }> = {
  running: { color: 'text-emerald-500', icon: <Play size={9} fill="currentColor" />, bg: 'bg-emerald-400' },
  stopped: { color: 'text-slate-400',   icon: <Square size={9} fill="currentColor" />, bg: 'bg-slate-400' },
  paused:  { color: 'text-amber-500',   icon: <Pause size={9} fill="currentColor" />, bg: 'bg-amber-400' },
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

/** Parse {{scope.name}} tokens from a template string */
function parseTemplateVars(template: string): Array<{ scope: string; name: string; key: string }> {
  const regex = /\{\{(local|group|global)\.(\w+)\}\}/g;
  const seen = new Set<string>();
  const result: Array<{ scope: string; name: string; key: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    const key = `${match[1]}.${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ scope: match[1], name: match[2], key });
    }
  }
  return result;
}

function FlowItem({ flow, selected, groupId, onSelect, formatTemplate }: {
  flow: Flow;
  selected: boolean;
  groupId: string;
  onSelect: (gId: string, fId: string) => void;
  formatTemplate: Record<string, string>;
}) {
  const connCfg = connColor[flow.connectionStatus];
  const dotCfg = connBg[flow.connectionStatus];
  const template = formatTemplate[flow.id] ?? '';
  const usedVars = parseTemplateVars(template);

  return (
    <button
      onClick={() => onSelect(groupId, flow.id)}
      className={`w-full text-left px-3 py-2 flex flex-col gap-1 border-l-2 transition-all ${
        selected
          ? 'bg-cyan-500/10 border-l-cyan-500'
          : 'border-l-transparent hover:bg-[var(--c-bg5)] hover:border-l-[var(--c-br3)]'
      }`}
    >
      {/* Row 1: tech badge + name */}
      <div className="flex items-center gap-1.5">
        <span
          className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] border ${
            selected
              ? 'border-cyan-500/40 text-cyan-500 bg-cyan-500/10'
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
          {flow.name.split('·')[1]?.trim() || flow.name}
        </span>
      </div>

      {/* Row 2: status dot + throughput + error */}
      <div className="flex items-center gap-2 pl-0.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className={`${dotCfg} rounded-full w-1.5 h-1.5 ${flow.connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
        </span>
        <span className={`text-[10px] ${connCfg}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {flow.throughput}
        </span>
        {flow.hasError && (
          <AlertTriangle size={10} className="text-red-500 ml-auto" />
        )}
      </div>

      {/* Row 3: Variables referenced in the template (color = scope) */}
      {usedVars.length > 0 && (
        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 pl-0.5 pt-0.5">
          {usedVars.map((v, idx) => (
            <span
              key={v.key}
              className={`text-[9px] ${scopeVarColor[v.scope]}`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
              title={`${v.scope} · {{${v.scope}.${v.name}}}`}
            >
              {v.name}{idx < usedVars.length - 1 && <span className="text-[var(--c-tx5)] ml-0.5">,</span>}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function GroupItem({
  group,
  selection,
  variables,
  formatTemplate,
  onSelectGroup,
  onSelectFlow,
  onToggleGroup,
  onDeleteGroup,
  onCreateFlow,
  latestConnectors,
}: {
  group: Group;
  selection: Selection;
  variables: Variable[];
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
  ) => Promise<Flow>;
  latestConnectors: ConnectorPluginDescriptor[];
}) {
  const gCfg = groupStatusCfg[group.status];
  const selectedGroup = selection.type === 'group' && selection.groupId === group.id;
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCreateFlowOpen, setIsCreateFlowOpen] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [flowTechnology, setFlowTechnology] = useState(latestConnectors[0]?.pluginId ?? '');
  const [flowHost, setFlowHost] = useState('localhost');
  const [flowPort, setFlowPort] = useState('8080');
  const [flowTopic, setFlowTopic] = useState('');
  const [flowInterval, setFlowInterval] = useState('1000');
  const [flowBurst, setFlowBurst] = useState('1');
  const [flowTemplate, setFlowTemplate] = useState('{}');

  useEffect(() => {
    if (!flowTechnology && latestConnectors[0]) {
      setFlowTechnology(latestConnectors[0].pluginId);
    }
  }, [flowTechnology, latestConnectors]);

  const resetCreateFlowForm = () => {
    setFlowName('');
    setFlowTechnology(latestConnectors[0]?.pluginId ?? '');
    setFlowHost('localhost');
    setFlowPort('8080');
    setFlowTopic('');
    setFlowInterval('1000');
    setFlowBurst('1');
    setFlowTemplate('{}');
  };

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

  const handleCreateFlow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const port = Number(flowPort);
    const interval = flowInterval.trim() ? Number(flowInterval) : undefined;
    const burst = flowBurst.trim() ? Number(flowBurst) : undefined;

    try {
      const createdFlow = await onCreateFlow(
        group.id,
        flowName.trim(),
        flowTechnology.trim(),
        flowHost.trim(),
        port,
        flowTopic.trim() || undefined,
        Number.isNaN(interval) ? undefined : interval,
        Number.isNaN(burst) ? undefined : burst,
        flowTemplate.trim() || '{}',
      );

      toast.success(`Flow "${createdFlow.name}" created`);
      onSelectFlow(group.id, createdFlow.id);
      setIsCreateFlowOpen(false);
      resetCreateFlowForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create flow';
      toast.error(message);
    }
  };

  return (
    <div className="mb-px">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`flex items-center gap-1.5 px-2 py-2 cursor-pointer transition-all ${
              selectedGroup
                ? 'bg-[var(--c-bg7)] border-l-2 border-l-cyan-500'
                : 'hover:bg-[var(--c-bg5)] border-l-2 border-l-transparent'
            }`}
          >
            <button
              onClick={() => onToggleGroup(group.id)}
              className="text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors p-0.5"
              aria-label={group.expanded ? 'Collapse group' : 'Expand group'}
            >
              {group.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            <button
              onClick={() => onSelectGroup(group.id)}
              className="flex-1 flex flex-col gap-0.5 text-left"
            >
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className={`${gCfg.bg} rounded-full w-1.5 h-1.5 ${group.status === 'running' ? 'animate-pulse' : ''}`} />
                </span>
                <span
                  className={`text-xs truncate ${selectedGroup ? 'text-[var(--c-tx1)]' : 'text-[var(--c-tx2)]'}`}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {group.name}
                </span>
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
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuLabel>Group actions</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => setIsDeleteConfirmOpen(true)} className="text-red-500 focus:text-red-500">
            <Trash2 size={14} />
            Delete group
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{group.name}" and all of its flows. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Flows */}
      {group.expanded && (
        <div className="pl-4 border-l border-[var(--c-br2)] ml-4">
          {group.flows.map(flow => (
            <FlowItem
              key={flow.id}
              flow={flow}
              groupId={group.id}
              selected={selection.type === 'flow' && selection.flowId === flow.id}
              onSelect={onSelectFlow}
              formatTemplate={formatTemplate}
            />
          ))}
          <Dialog open={isCreateFlowOpen} onOpenChange={setIsCreateFlowOpen}>
            <DialogTrigger asChild>
              <button className="w-full text-left px-3 py-1.5 flex items-center gap-1.5 text-[10px] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors">
                <Plus size={9} /> add flow
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleCreateFlow} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Add flow</DialogTitle>
                  <DialogDescription>
                    Create a new flow inside {group.name}.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-name-${group.id}`}>
                      Name
                    </label>
                    <Input
                      id={`flow-name-${group.id}`}
                      value={flowName}
                      onChange={(event) => setFlowName(event.target.value)}
                      placeholder="Orders → Kafka"
                      autoFocus
                      required
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-technology-${group.id}`}>
                      Technology
                    </label>
                    {latestConnectors.length > 0 ? (
                      <select
                        id={`flow-technology-${group.id}`}
                        value={flowTechnology}
                        onChange={(event) => setFlowTechnology(event.target.value)}
                        className="flex h-9 w-full rounded-md border border-[var(--c-br1)] bg-[var(--c-bg1)] px-3 py-2 text-sm text-[var(--c-tx1)] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
                        required
                      >
                        {latestConnectors.map((connector) => (
                          <option key={connector.pluginId} value={connector.pluginId}>
                            {connector.displayName} ({connector.pluginId}@{connector.pluginVersion})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id={`flow-technology-${group.id}`}
                        value={flowTechnology}
                        onChange={(event) => setFlowTechnology(event.target.value)}
                        placeholder="HTTP"
                        required
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-host-${group.id}`}>
                      Host
                    </label>
                    <Input
                      id={`flow-host-${group.id}`}
                      value={flowHost}
                      onChange={(event) => setFlowHost(event.target.value)}
                      placeholder="localhost"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-port-${group.id}`}>
                      Port
                    </label>
                    <Input
                      id={`flow-port-${group.id}`}
                      type="number"
                      min={1}
                      max={65535}
                      value={flowPort}
                      onChange={(event) => setFlowPort(event.target.value)}
                      placeholder="8080"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-topic-${group.id}`}>
                      Topic
                    </label>
                    <Input
                      id={`flow-topic-${group.id}`}
                      value={flowTopic}
                      onChange={(event) => setFlowTopic(event.target.value)}
                      placeholder="orders.events"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-interval-${group.id}`}>
                      Interval (ms)
                    </label>
                    <Input
                      id={`flow-interval-${group.id}`}
                      type="number"
                      min={1}
                      value={flowInterval}
                      onChange={(event) => setFlowInterval(event.target.value)}
                      placeholder="1000"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-burst-${group.id}`}>
                      Burst
                    </label>
                    <Input
                      id={`flow-burst-${group.id}`}
                      type="number"
                      min={1}
                      value={flowBurst}
                      onChange={(event) => setFlowBurst(event.target.value)}
                      placeholder="1"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-template-${group.id}`}>
                      Template
                    </label>
                    <Textarea
                      id={`flow-template-${group.id}`}
                      value={flowTemplate}
                      onChange={(event) => setFlowTemplate(event.target.value)}
                      rows={5}
                      placeholder="{}"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateFlowOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!flowName.trim() || !flowTechnology.trim() || !flowHost.trim()}>
                    Create flow
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

export function LeftPanel({
  groups,
  selection,
  variables,
  formatTemplate,
  connectorCatalog,
  latestConnectors,
  connectorHealthSummary,
  onSelectGroup,
  onSelectFlow,
  onToggleGroup,
  onCreateGroup,
  onDeleteGroup,
  onCreateFlow,
}: LeftPanelProps) {
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

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

  const healthColor = (status: ConnectorHealthSummary['status']) => {
    switch (status) {
      case 'healthy':
        return 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10';
      case 'degraded':
        return 'text-amber-500 border-amber-500/30 bg-amber-500/10';
      default:
        return 'text-slate-400 border-slate-400/30 bg-slate-500/10';
    }
  };

  return (
    <div
      className="flex flex-col border-r border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0 overflow-hidden"
      style={{ width: 260 }}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-br2)] shrink-0">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Groups &amp; Flows
        </span>
        <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
          <DialogTrigger asChild>
            <button
              className="text-[var(--c-tx4)] hover:text-cyan-500 transition-colors p-0.5"
              aria-label="Create group"
            >
              <Plus size={12} />
            </button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Create group</DialogTitle>
                <DialogDescription>
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
                  rows={4}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateGroupOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!groupName.trim()}>
                  Create group
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
            variables={variables}
            formatTemplate={formatTemplate}
            onSelectGroup={onSelectGroup}
            onSelectFlow={onSelectFlow}
            onToggleGroup={onToggleGroup}
            onDeleteGroup={onDeleteGroup}
            onCreateFlow={onCreateFlow}
            latestConnectors={latestConnectors}
          />
        ))}
      </div>

      {/* Connector catalog summary */}
      <div className="px-3 py-2 border-t border-[var(--c-br2)] shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Connector Catalog
          </span>
          <span className="text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {connectorCatalog.length} entries
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {latestConnectors.length > 0 ? (
            latestConnectors.map((connector) => {
              const health = connectorHealthSummary.find(
                (entry) => entry.pluginId === connector.pluginId && entry.pluginVersion === connector.pluginVersion,
              );

              return (
                <div
                  key={connector.pluginId}
                  className="flex flex-col gap-1 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2 py-1.5 min-w-[110px]"
                >
                  <span className="text-[10px] text-[var(--c-tx2)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {connector.displayName}
                  </span>
                  <span className="text-[9px] text-cyan-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {connector.pluginId}@{connector.pluginVersion}
                  </span>
                  <span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] uppercase ${health ? healthColor(health.status) : 'text-[var(--c-tx4)] border-[var(--c-br1)] bg-transparent'}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {health ? health.status : 'unknown'}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="rounded border border-dashed border-[var(--c-br2)] bg-[var(--c-bg1)] px-2 py-2 text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              No connectors loaded. The flow editor will show a fallback state until the catalog is available.
            </div>
          )}
        </div>
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
