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
} from 'lucide-react';
import type { Group, Flow, Selection, ConnectionStatus, GroupStatus, Variable } from '../types';
import type { ConnectorPluginDescriptor } from '../core/types';

interface LeftPanelProps {
  groups: Group[];
  selection: Selection;
  variables: Variable[];
  formatTemplate: Record<string, string>;
  connectorCatalog: ConnectorPluginDescriptor[];
  latestConnectors: ConnectorPluginDescriptor[];
  onSelectGroup: (groupId: string) => void;
  onSelectFlow: (groupId: string, flowId: string) => void;
  onToggleGroup: (groupId: string) => void;
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

function GroupItem({ group, selection, variables, formatTemplate, onSelectGroup, onSelectFlow, onToggleGroup }: {
  group: Group;
  selection: Selection;
  variables: Variable[];
  formatTemplate: Record<string, string>;
  onSelectGroup: (id: string) => void;
  onSelectFlow: (gId: string, fId: string) => void;
  onToggleGroup: (id: string) => void;
}) {
  const gCfg = groupStatusCfg[group.status];
  const selectedGroup = selection.type === 'group' && selection.groupId === group.id;

  return (
    <div className="mb-px">
      {/* Group Header */}
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
          <button className="w-full text-left px-3 py-1.5 flex items-center gap-1.5 text-[10px] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors">
            <Plus size={9} /> add flow
          </button>
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
  onSelectGroup,
  onSelectFlow,
  onToggleGroup,
}: LeftPanelProps) {
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
        <button className="text-[var(--c-tx4)] hover:text-cyan-500 transition-colors p-0.5">
          <Plus size={12} />
        </button>
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
            latestConnectors.map((connector) => (
              <div
                key={connector.pluginId}
                className="flex flex-col gap-0.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2 py-1"
              >
                <span className="text-[10px] text-[var(--c-tx2)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {connector.displayName}
                </span>
                <span className="text-[9px] text-cyan-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {connector.pluginId}@{connector.pluginVersion}
                </span>
              </div>
            ))
          ) : (
            <span className="text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              no connectors loaded
            </span>
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
