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
  Lock,
  Unlock,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../ui/dialog';
import { Input } from '../../../ui/input';
import { Textarea } from '../../../ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../../ui/context-menu';
import type { Group, Flow, Selection, ConnectionStatus, GroupStatus } from '../../../../types';
import type { ConnectorPluginDescriptor } from '../../../../core/types';
import { isRunningInJCEF } from '../../../../core/jcef';
import { CoreCommands } from '../../../../core/bridge';

interface LeftPanelProps {
  groups: Group[];
  selection: Selection;
  formatTemplate: Record<string, string>;
  latestConnectors: ConnectorPluginDescriptor[];
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
    connectorConfig?: Record<string, unknown>,
  ) => Promise<Flow>;
  onUpdateGroupConfig: (groupId: string, config: any, name?: string) => Promise<void>;
  onUpdateFlowConfig: (groupId: string, flowId: string, config: any, name?: string) => Promise<void>;
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

function FlowItem({ flow, selected, groupId, onSelect, onToggleEnabled, formatTemplate }: {
  flow: Flow;
  selected: boolean;
  groupId: string;
  onSelect: (gId: string, fId: string) => void;
  onToggleEnabled: (gId: string, fId: string, enabled: boolean, name: string) => void;
  formatTemplate: Record<string, string>;
}) {
  const connCfg = connColor[flow.connectionStatus];
  const dotCfg = connBg[flow.connectionStatus];
  const template = formatTemplate[flow.id] ?? '';
  const usedVars = parseTemplateVars(template);

  return (
    <div
      onClick={() => onSelect(groupId, flow.id)}
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
          {flow.name.split('·')[1]?.trim() || flow.name}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleEnabled(groupId, flow.id, !flow.enabled, flow.name);
          }}
          className={`ml-auto p-1 rounded hover:bg-black/10 transition-colors ${!flow.enabled ? 'text-red-400' : 'text-[var(--c-tx4)] hover:text-[var(--c-tx2)]'}`}
          title={flow.enabled ? 'Lock flow' : 'Unlock flow'}
        >
          {flow.enabled ? <Unlock size={10} /> : <Lock size={10} />}
        </button>
      </div>

      {/* Row 2: status dot + throughput + error */}
      <div className={`flex items-center gap-2 pl-0.5 transition-opacity ${!flow.enabled ? 'opacity-40' : ''}`}>
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
    </div>
  );
}

function GroupItem({
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
  latestConnectors,
}: {
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
  latestConnectors: ConnectorPluginDescriptor[];
}) {
  const gCfg = groupStatusCfg[group.status];
  const selectedGroup = selection.type === 'group' && selection.groupId === group.id;
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isCreateFlowOpen, setIsCreateFlowOpen] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [flowTechnology, setFlowTechnology] = useState('');
  const [flowHost, setFlowHost] = useState('localhost');
  const [flowPort, setFlowPort] = useState('8080');
  const [flowTopic, setFlowTopic] = useState('');
  const [flowInterval, setFlowInterval] = useState('1000');
  const [flowBurst, setFlowBurst] = useState('1');
  const [flowTemplate, setFlowTemplate] = useState('{}');
  const [flowOutputDir, setFlowOutputDir] = useState('./outputs');
  const [flowFileFormat, setFlowFileFormat] = useState<'json' | 'txt'>('json');

  useEffect(() => {
    if (!flowTechnology && latestConnectors[0]) {
      setFlowTechnology(latestConnectors[0].pluginId);
    }
  }, [flowTechnology, latestConnectors]);

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
    setFlowOutputDir('./outputs');
    setFlowFileFormat('json');
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

    // Build connector config if needed
    const connectorConfig = flowTechnology.trim() === 'file' ? {
      outputDir: flowOutputDir.trim() || './outputs',
      format: flowFileFormat,
    } : undefined;

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
        connectorConfig,
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

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateGroupConfig(group.id, { enabled: !group.enabled }, group.name);
                  }}
                  className={`ml-auto p-1 rounded hover:bg-black/10 transition-colors ${!group.enabled ? 'text-red-400' : 'text-[var(--c-tx4)] hover:text-[var(--c-tx2)]'}`}
                  title={group.enabled ? 'Lock group' : 'Unlock group'}
                >
                  {group.enabled ? <Unlock size={10} /> : <Lock size={10} />}
                </button>
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
        <div className="pl-4 border-l border-cyan-500/20 ml-4 bg-gradient-to-r from-cyan-500/5 to-transparent">
          {group.flows.map(flow => (
            <FlowItem
              key={flow.id}
              flow={flow}
              groupId={group.id}
              selected={selection.type === 'flow' && selection.flowId === flow.id}
              onSelect={onSelectFlow}
              onToggleEnabled={(gId, fId, en, name) => onUpdateFlowConfig(gId, fId, { enabled: en }, name)}
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

                  {/* File-specific configuration */}
                  {flowTechnology.trim() === 'file' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-output-dir-${group.id}`}>
                          Output Directory
                        </label>
                        <div className="flex gap-2">
                          <Input
                            id={`flow-output-dir-${group.id}`}
                            value={flowOutputDir}
                            onChange={(event) => setFlowOutputDir(event.target.value)}
                            placeholder="./outputs"
                            className="flex-1"
                          />
                          {isRunningInJCEF() && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={async () => {
                                const response = await CoreCommands.pickDirectory();
                                if (response && response.status === 'success' && (response as any).path) {
                                  setFlowOutputDir((response as any).path);
                                }
                              }}
                              className="shrink-0"
                              title="Browse directory"
                            >
                              <FolderOpen size={14} />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-[var(--c-tx3)]" htmlFor={`flow-file-format-${group.id}`}>
                          File Format
                        </label>
                        <select
                          id={`flow-file-format-${group.id}`}
                          value={flowFileFormat}
                          onChange={(event) => setFlowFileFormat(event.target.value as 'json' | 'txt')}
                          className="flex h-9 w-full rounded-md border border-[var(--c-br1)] bg-[var(--c-bg1)] px-3 py-2 text-sm text-[var(--c-tx1)] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
                        >
                          <option value="json">JSON Lines (.json)</option>
                          <option value="txt">Pipe-delimited (.txt)</option>
                        </select>
                      </div>
                    </>
                  )}

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
}: LeftPanelProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isCreateFlowOpen, setIsCreateFlowOpen] = useState(false);
  const [selectedGroupForFlow, setSelectedGroupForFlow] = useState<string | null>(null);
  const [flowName, setFlowName] = useState('');
  const [flowTechnology, setFlowTechnology] = useState('');
  const [flowHost, setFlowHost] = useState('localhost');
  const [flowPort, setFlowPort] = useState('8080');
  const [flowTopic, setFlowTopic] = useState('');
  const [flowInterval, setFlowInterval] = useState('1000');
  const [flowBurst, setFlowBurst] = useState('1');
  const [flowTemplate, setFlowTemplate] = useState('{}');
  const [flowOutputDir, setFlowOutputDir] = useState('./outputs');
  const [flowFileFormat, setFlowFileFormat] = useState<'json' | 'txt'>('json');

  const resetCreateGroupForm = () => {
    setGroupName('');
    setGroupDescription('');
  };

  const resetCreateFlowForm = () => {
    setFlowName('');
    setFlowTechnology(latestConnectors[0]?.pluginId ?? 'HTTP');
    setFlowHost('localhost');
    setFlowPort('8080');
    setFlowTopic('');
    setFlowInterval('1000');
    setFlowBurst('1');
    setFlowTemplate('{}');
    setFlowOutputDir('./outputs');
    setFlowFileFormat('json');
    setSelectedGroupForFlow(null);
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

  const handleCreateFlow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedGroupForFlow) {
      toast.error('Please select a group first');
      return;
    }

    const port = Number(flowPort);
    const interval = flowInterval.trim() ? Number(flowInterval) : undefined;
    const burst = flowBurst.trim() ? Number(flowBurst) : undefined;

    // Build connector config if needed
    const connectorConfig = flowTechnology.trim() === 'file' ? {
      outputDir: flowOutputDir.trim() || './outputs',
      format: flowFileFormat,
    } : undefined;

    try {
      const createdFlow = await onCreateFlow(
        selectedGroupForFlow,
        flowName.trim(),
        flowTechnology.trim(),
        flowHost.trim(),
        port,
        flowTopic.trim() || undefined,
        Number.isNaN(interval) ? undefined : interval,
        Number.isNaN(burst) ? undefined : burst,
        flowTemplate.trim() || '{}',
        connectorConfig,
      );

      toast.success(`Flow "${createdFlow.name}" created`);
      onSelectFlow(selectedGroupForFlow, createdFlow.id);
      setIsCreateFlowOpen(false);
      resetCreateFlowForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create flow';
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

      {/* Create Flow Dialog */}
      <Dialog open={isCreateFlowOpen} onOpenChange={setIsCreateFlowOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleCreateFlow} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add flow</DialogTitle>
              <DialogDescription>
                Create a new flow. Select a group first.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-group-select">
                Group
              </label>
              <select
                id="flow-group-select"
                value={selectedGroupForFlow ?? ''}
                onChange={(event) => setSelectedGroupForFlow(event.target.value || null)}
                className="flex h-9 w-full rounded-md border border-[var(--c-br1)] bg-[var(--c-bg1)] px-3 py-2 text-sm text-[var(--c-tx1)] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
                required
              >
                <option value="">Select a group...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-name">
                  Name
                </label>
                <Input
                  id="flow-name"
                  value={flowName}
                  onChange={(event) => setFlowName(event.target.value)}
                  placeholder="Orders → Kafka"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-technology">
                  Technology
                </label>
                {latestConnectors.length > 0 ? (
                  <select
                    id="flow-technology"
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
                    id="flow-technology"
                    value={flowTechnology}
                    onChange={(event) => setFlowTechnology(event.target.value)}
                    placeholder="HTTP"
                    required
                  />
                )}
              </div>

              {/* File-specific configuration */}
              {flowTechnology.trim() === 'file' && (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-output-dir">
                      Output Directory
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="flow-output-dir"
                        value={flowOutputDir}
                        onChange={(event) => setFlowOutputDir(event.target.value)}
                        placeholder="./outputs"
                        className="flex-1"
                      />
                      {isRunningInJCEF() && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={async () => {
                            const response = await CoreCommands.pickDirectory();
                            if (response && response.status === 'success' && (response as any).path) {
                              setFlowOutputDir((response as any).path);
                            }
                          }}
                          className="shrink-0"
                          title="Browse directory"
                        >
                          <FolderOpen size={14} />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-file-format">
                      File Format
                    </label>
                    <select
                      id="flow-file-format"
                      value={flowFileFormat}
                      onChange={(event) => setFlowFileFormat(event.target.value as 'json' | 'txt')}
                      className="flex h-9 w-full rounded-md border border-[var(--c-br1)] bg-[var(--c-bg1)] px-3 py-2 text-sm text-[var(--c-tx1)] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
                    >
                      <option value="json">JSON Lines (.json)</option>
                      <option value="txt">Pipe-delimited (.txt)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-host">
                  Host
                </label>
                <Input
                  id="flow-host"
                  value={flowHost}
                  onChange={(event) => setFlowHost(event.target.value)}
                  placeholder="localhost"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-port">
                  Port
                </label>
                <Input
                  id="flow-port"
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
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-topic">
                  Topic
                </label>
                <Input
                  id="flow-topic"
                  value={flowTopic}
                  onChange={(event) => setFlowTopic(event.target.value)}
                  placeholder="orders.events"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-interval">
                  Interval (ms)
                </label>
                <Input
                  id="flow-interval"
                  type="number"
                  min={1}
                  value={flowInterval}
                  onChange={(event) => setFlowInterval(event.target.value)}
                  placeholder="1000"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-burst">
                  Burst
                </label>
                <Input
                  id="flow-burst"
                  type="number"
                  min={1}
                  value={flowBurst}
                  onChange={(event) => setFlowBurst(event.target.value)}
                  placeholder="1"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs text-[var(--c-tx3)]" htmlFor="flow-template">
                  Template
                </label>
                <Textarea
                  id="flow-template"
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
              <Button type="submit" disabled={!selectedGroupForFlow || !flowName.trim() || !flowTechnology.trim() || !flowHost.trim()}>
                Create flow
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
