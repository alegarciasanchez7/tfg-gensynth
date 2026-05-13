import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Radio, Globe, Wifi, Zap, Cpu, Layers, AlertTriangle,
  CheckCircle, Code2, Settings2, Hash,
  AlignLeft, Copy, RotateCcw, Save, Trash2, Braces, TableProperties, FileCode, FileText, FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import type { Flow, Group, ConnectionStatus } from '../../types';
import { defaultTemplates } from '../../data/mockData';
import { useApp } from '../../context';
import { TemplateEditor } from './flows/TemplateEditor';
import type { ConnectorPluginDescriptor } from '../../core/types';
import { Button } from '../ui/button';
import { isRunningInJCEF } from '../../core/jcef';
import { CoreCommands } from '../../core/bridge';

const connCfg: Record<ConnectionStatus, { color: string; bg: string; dot: string; label: string }> = {
  connected:    { color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/40', dot: 'bg-emerald-400', label: 'CONNECTED' },
  disconnected: { color: 'text-slate-400',   bg: 'bg-slate-500/10 border-slate-400/30',    dot: 'bg-slate-400',   label: 'DISCONNECTED' },
  error:        { color: 'text-red-500',     bg: 'bg-red-500/10 border-red-500/40',        dot: 'bg-red-400',     label: 'ERROR' },
  warning:      { color: 'text-amber-500',   bg: 'bg-amber-500/10 border-amber-500/40',    dot: 'bg-amber-400',   label: 'WARNING' },
};

const techIcon: Record<string, React.ReactNode> = {
  Kafka: <Radio size={12} />, HTTP: <Globe size={12} />, MQTT: <Wifi size={12} />,
  WebSocket: <Zap size={12} />, gRPC: <Cpu size={12} />, TCP: <Layers size={12} />,
};

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}>{label}</label>
      {children}
    </div>
  );
}

function TNumber({ value, unit }: { value: number; unit?: string }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex">
      <input
        type="number"
        value={v}
        onChange={e => setV(Number(e.target.value))}
        className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded-l px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      />
      {unit && (
        <span className="px-2 py-1.5 bg-[var(--c-bg4)] border border-l-0 border-[var(--c-br1)] rounded-r text-[10px] text-[var(--c-tx4)] shrink-0 flex items-center"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {unit}
        </span>
      )}
    </div>
  );
}

function TSelect({ options, value }: { options: string[]; value: string }) {
  const [v, setV] = useState(value);
  return (
    <select
      value={v}
      onChange={e => setV(e.target.value)}
      className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

type ConnectorSchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: Array<string | number | boolean>;
  items?: ConnectorSchemaProperty;
  properties?: Record<string, ConnectorSchemaProperty>;
};

function getConnectorProperties(schema: Record<string, unknown>): Record<string, ConnectorSchemaProperty> {
  return (schema.properties as Record<string, ConnectorSchemaProperty> | undefined) ?? {};
}

function getDefaultValue(definition: ConnectorSchemaProperty): unknown {
  if (Object.prototype.hasOwnProperty.call(definition, 'default')) {
    return definition.default;
  }

  if (definition.enum?.length) {
    return definition.enum[0];
  }

  switch (definition.type) {
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}

function stringifyConnectorValue(value: unknown, definition: ConnectorSchemaProperty): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (definition.type === 'array') {
    return Array.isArray(value) ? value.join(', ') : String(value);
  }

  if (definition.type === 'object') {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function compareVersions(leftVersion: string, rightVersion: string): number {
  const leftParts = leftVersion.split('.').map((part) => Number(part) || 0);
  const rightParts = rightVersion.split('.').map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const comparison = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return leftVersion.localeCompare(rightVersion);
}

function ConnectorSchemaField({
  name,
  definition,
  value,
  onChange,
}: {
  name: string;
  definition: ConnectorSchemaProperty;
  value: unknown;
  onChange: (name: string, nextValue: unknown) => void;
}) {
  const label = definition.title ?? name;
  const description = definition.description;

  if (definition.enum && definition.enum.length > 0) {
    return (
      <FieldRow label={label}>
        <select
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => onChange(name, event.target.value)}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {definition.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
        {description && <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>}
      </FieldRow>
    );
  }

  if (definition.type === 'boolean') {
    return (
      <FieldRow label={label}>
        <button
          type="button"
          onClick={() => onChange(name, !Boolean(value))}
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border text-[11px] transition-all ${
            Boolean(value)
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-[var(--c-bg1)] border-[var(--c-br1)] text-[var(--c-tx3)]'
          }`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <span>{Boolean(value) ? 'true' : 'false'}</span>
          <span className="text-[9px] uppercase">toggle</span>
        </button>
        {description && <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>}
      </FieldRow>
    );
  }

  if (definition.type === 'number' || definition.type === 'integer') {
    return (
      <FieldRow label={label}>
        <input
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => onChange(name, event.target.value === '' ? '' : Number(event.target.value))}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />
        {description && <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>}
      </FieldRow>
    );
  }

  if (definition.type === 'array') {
    return (
      <FieldRow label={label}>
        <textarea
          value={stringifyConnectorValue(value, definition)}
          onChange={(event) => onChange(name, event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
          rows={3}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full resize-none"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />
        {description && <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>}
      </FieldRow>
    );
  }

  if (definition.type === 'object') {
    return (
      <FieldRow label={label}>
        <textarea
          value={stringifyConnectorValue(value, definition)}
          onChange={(event) => {
            try {
              onChange(name, event.target.value ? JSON.parse(event.target.value) : {});
            } catch {
              onChange(name, event.target.value);
            }
          }}
          rows={4}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full resize-none"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />
        {description && <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>}
      </FieldRow>
    );
  }

  const isDirectoryField = 
    name.toLowerCase().includes('dir') || 
    name.toLowerCase().includes('path') || 
    label.toLowerCase().includes('directory') || 
    label.toLowerCase().includes('path');

  return (
    <FieldRow label={label}>
      <div className="flex gap-2">
        <input
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => onChange(name, event.target.value)}
          className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />
        {isDirectoryField && isRunningInJCEF() && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={async () => {
              const response = await CoreCommands.pickDirectory();
              if (response && response.status === 'success' && (response as any).path) {
                onChange(name, (response as any).path);
              }
            }}
            className="h-8 w-8 shrink-0 border-[var(--c-br1)] bg-[var(--c-bg1)] hover:bg-[var(--c-bg5)]"
            title="Browse directory"
          >
            <FolderOpen size={14} />
          </Button>
        )}
      </div>
      {description && <span className="text-[9px] text-[var(--c-tx4)]">{description}</span>}
    </FieldRow>
  );
}

function ConnectorConfigEditor({
  flowId,
  connector,
  config,
  fallbackFlow,
  onChange,
}: {
  flowId: string;
  connector: ConnectorPluginDescriptor | null;
  config: Record<string, unknown>;
  fallbackFlow: Flow;
  onChange: (nextConfig: Record<string, unknown>) => void;
}) {
  if (!connector) {
    return (
      <div className="flex flex-col gap-2 rounded border border-dashed border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-4 text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        <span className="text-[var(--c-tx2)]">No connectors available yet.</span>
        <span>The flow will keep its legacy connection data visible until the catalog is loaded.</span>
        <div className="grid grid-cols-2 gap-2 pt-2 text-[9px]">
          <div className="rounded border border-[var(--c-br1)] px-2 py-1">
            <div className="text-[var(--c-tx5)] uppercase">Host</div>
            <div className="text-[var(--c-tx2)]">{fallbackFlow.host}</div>
          </div>
          <div className="rounded border border-[var(--c-br1)] px-2 py-1">
            <div className="text-[var(--c-tx5)] uppercase">Port</div>
            <div className="text-[var(--c-tx2)]">{fallbackFlow.port}</div>
          </div>
          <div className="rounded border border-[var(--c-br1)] px-2 py-1 col-span-2">
            <div className="text-[var(--c-tx5)] uppercase">Endpoint / Topic</div>
            <div className="text-[var(--c-tx2)]">{fallbackFlow.topic}</div>
          </div>
        </div>
      </div>
    );
  }

  const properties = getConnectorProperties(connector.configSchema);

  if (Object.keys(properties).length === 0) {
    return (
      <div className="rounded border border-dashed border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-4 text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        El schema de {connector.displayName} no expone propiedades editables.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {Object.entries(properties).map(([fieldName, fieldDefinition]) => (
        <ConnectorSchemaField
          key={`${flowId}:${fieldName}`}
          name={fieldName}
          definition={fieldDefinition}
          value={config[fieldName] ?? getDefaultValue(fieldDefinition)}
          onChange={(_fieldName, nextValue) => {
            onChange({
              ...config,
              [_fieldName]: nextValue,
            });
          }}
        />
      ))}
    </div>
  );
}

interface FlowWorkspaceProps {
  flow: Flow;
  group: Group;
  template: string;
  onTemplateChange: (t: string) => void;
}

export function FlowWorkspace({ flow, group, template, onTemplateChange }: FlowWorkspaceProps) {
  const conn = connCfg[flow.connectionStatus];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [formatMode, setFormatMode] = useState<'json' | 'xml' | 'csv' | 'plain'>(flow.format || (flow.technology === 'file' ? 'plain' : 'json'));
  const [activeTab, setActiveTab] = useState<'technical' | 'format'>('technical');
  const { state, actions } = useApp();

  const connectorSelection = state.flowConnectorSelections[flow.id] ?? null;
  const connectorConfig = state.flowConnectorConfigs[flow.id] ?? {};
  const connectorCatalog = state.connectorCatalog;

  const latestConnectorForFlow = useMemo(() => {
    if (connectorSelection) {
      const selected = connectorCatalog.find(
        (descriptor) => descriptor.pluginId === connectorSelection.pluginId && descriptor.pluginVersion === connectorSelection.pluginVersion,
      );
      if (selected) {
        return selected;
      }
    }

    const normalizedTechnology = flow.technology.toLowerCase();
    return connectorCatalog.find((descriptor) => descriptor.pluginId === normalizedTechnology) ?? connectorCatalog[0] ?? null;
  }, [connectorCatalog, connectorSelection, flow.technology]);

  const connectorVersions = useMemo(() => {
    if (!latestConnectorForFlow) {
      return [];
    }

    return connectorCatalog
      .filter((descriptor) => descriptor.pluginId === latestConnectorForFlow.pluginId)
      .sort((left, right) => compareVersions(right.pluginVersion, left.pluginVersion));
  }, [connectorCatalog, latestConnectorForFlow]);

  const availableConnectors = useMemo(() => {
    const byPluginId = new Map<string, ConnectorPluginDescriptor>();
    for (const descriptor of connectorCatalog) {
      if (!byPluginId.has(descriptor.pluginId)) {
        byPluginId.set(descriptor.pluginId, descriptor);
      }
    }
    return Array.from(byPluginId.values()).sort((left, right) =>
      left.displayName.localeCompare(right.displayName) || left.pluginId.localeCompare(right.pluginId)
    );
  }, [connectorCatalog]);

  const selectedHealth = state.connectorHealthSummary.find(
    (entry) => entry.pluginId === (connectorSelection?.pluginId ?? latestConnectorForFlow?.pluginId) && entry.pluginVersion === (connectorSelection?.pluginVersion ?? latestConnectorForFlow?.pluginVersion),
  ) ?? null;

  const currentTemplate = template ?? flow.template ?? '';
  const [draftHost, setDraftHost] = useState(flow.host);
  const [draftPort, setDraftPort] = useState(flow.port);
  const [draftTopic, setDraftTopic] = useState(flow.topic);
  const [draftInterval, setDraftInterval] = useState(flow.interval);
  const [draftBurst, setDraftBurst] = useState(flow.burst);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingFlow, setIsDeletingFlow] = useState(false);

  const hasChanges = useMemo(() => {
    const templateChanged = currentTemplate !== flow.template;
    const formatChanged = formatMode !== (flow.format || 'json');
    const configChanged = 
      draftHost !== flow.host ||
      draftPort !== flow.port ||
      draftTopic !== flow.topic ||
      draftInterval !== flow.interval ||
      draftBurst !== flow.burst;
    
    // Check if connector selection or its config changed
    const connectorChanged = 
      (connectorSelection !== null && (
        connectorSelection.pluginId !== flow.technology || 
        connectorSelection.pluginVersion !== (flow.connectorVersion ?? '')
      )) ||
      JSON.stringify(connectorConfig) !== JSON.stringify(flow.connectorConfig ?? {});

    return templateChanged || formatChanged || configChanged || connectorChanged;
  }, [currentTemplate, flow, formatMode, draftHost, draftPort, draftTopic, draftInterval, draftBurst, connectorSelection, connectorConfig]);

  useEffect(() => {
    setDraftHost(flow.host);
    setDraftPort(flow.port);
    setDraftTopic(flow.topic);
    setDraftInterval(flow.interval);
    setDraftBurst(flow.burst);
    setFormatMode(flow.format || (flow.technology === 'file' ? 'plain' : 'json'));
  }, [flow.host, flow.port, flow.topic, flow.interval, flow.burst, flow.format, flow.technology, flow.id]);

  const handleFormatModeChange = (mode: 'json' | 'xml' | 'csv' | 'plain') => {
    setFormatMode(mode);
    if (mode === flow.format) {
      onTemplateChange(flow.template || '');
    } else {
      onTemplateChange('');
    }
  };

  const handleConnectorChange = (pluginId: string) => {
    const descriptor = connectorCatalog
      .filter((entry) => entry.pluginId === pluginId)
      .sort((left, right) => compareVersions(right.pluginVersion, left.pluginVersion))[0];

    if (!descriptor) {
      return;
    }

    actions.setFlowConnectorSelection(flow.id, descriptor.pluginId, descriptor.pluginVersion);
  };

  const handleConnectorVersionChange = (pluginVersion: string) => {
    if (!latestConnectorForFlow) {
      return;
    }

    const descriptor = connectorVersions.find((entry) => entry.pluginVersion === pluginVersion);
    if (!descriptor) {
      return;
    }

    actions.setFlowConnectorSelection(flow.id, descriptor.pluginId, descriptor.pluginVersion);
  };

  const handleConnectorConfigChange = (nextConfig: Record<string, unknown>) => {
    actions.setFlowConnectorConfig(flow.id, nextConfig);
  };

  const handleDiscard = () => {
    setDraftHost(flow.host);
    setDraftPort(flow.port);
    setDraftTopic(flow.topic);
    setDraftInterval(flow.interval);
    setDraftBurst(flow.burst);
    onTemplateChange(flow.template || '');
    setFormatMode(flow.format || (flow.technology === 'file' ? 'plain' : 'json'));
  };

  const handleSaveChanges = async () => {
    if (!draftHost.trim()) {
      toast.error('Host is required');
      return;
    }

    try {
      setIsSaving(true);
      await actions.updateFlowConfig(group.id, flow.id, {
        template: currentTemplate,
        format: formatMode,
        technology: connectorSelection?.pluginId ?? latestConnectorForFlow?.pluginId ?? flow.technology,
        host: draftHost.trim(),
        port: draftPort,
        topic: draftTopic.trim(),
        interval: draftInterval,
        burst: draftBurst,
        connectorConfig: connectorConfig,
      });
      toast.success('Flow changes saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save flow changes';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFlow = async () => {
    const confirmed = window.confirm(`Delete flow "${flow.name}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setIsDeletingFlow(true);
      await actions.deleteFlow(group.id, flow.id);
      actions.selectGroup(group.id);
      toast.success(`Flow "${flow.name}" deleted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete flow';
      toast.error(message);
    } finally {
      setIsDeletingFlow(false);
    }
  };

  // Exposed globally for variable insertion
  (window as unknown as Record<string, unknown>).__insertIntoFlow = (varRef: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = currentTemplate.slice(0, start) + varRef + currentTemplate.slice(end);
    onTemplateChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + varRef.length, start + varRef.length);
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Flow header */}
      <div className="px-4 py-3 border-b border-[var(--c-br2)] flex items-center gap-3 shrink-0 bg-[var(--c-bg2)]">
        <div className="flex items-center gap-2">
          <span className="text-cyan-500">{techIcon[flow.technology] ?? <Layers size={12} />}</span>
          <span className="text-sm text-[var(--c-tx1)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {flow.name}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] ${conn.bg} ${conn.color}`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <span className={`w-1.5 h-1.5 rounded-full ${conn.dot} ${flow.connectionStatus === 'connected' ? 'animate-pulse' : ''}`} />
          {conn.label}
        </div>
        <span className={`text-xs ${conn.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {flow.throughput}
        </span>
        {flow.hasError && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-[10px] text-red-500"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <AlertTriangle size={10} /> {flow.errorMessage}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={handleSaveChanges}
            disabled={!hasChanges || isSaving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
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
            disabled={!hasChanges || isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] text-[var(--c-tx4)] text-[10px] tracking-wider hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <RotateCcw size={11} /> Discard
          </button>
          <button
            onClick={handleDeleteFlow}
            disabled={isSaving || isDeletingFlow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-500 text-[10px] tracking-wider hover:bg-red-500/20 transition-all disabled:opacity-50"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <Trash2 size={11} /> {isDeletingFlow ? 'Deleting...' : 'Delete'}
          </button>
        </div>
        {!flow.hasError && flow.connectionStatus === 'connected' && (
          <CheckCircle size={12} className="text-emerald-500" />
        )}
      </div>

      {/* Mobile tab switcher */}
      <div className="flex border-b border-[var(--c-br2)] shrink-0 md:hidden">
        {(['technical', 'format'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-[10px] tracking-widest uppercase border-b-2 transition-all ${
              activeTab === tab
                ? 'text-cyan-500 border-cyan-500 bg-[var(--c-bg4)]'
                : 'text-[var(--c-tx4)] border-transparent hover:text-[var(--c-tx2)]'
            }`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {tab === 'technical' ? 'Technical Config' : 'Message Format'}
          </button>
        ))}
      </div>

      {/* Main content: two columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Technical config */}
        <div className={`flex flex-col border-r border-[var(--c-br1)] overflow-y-auto ${activeTab === 'format' ? 'hidden md:flex' : 'flex'}`}
          style={{ width: '46%', minWidth: 280 }}>
          <div className="px-4 py-3 border-b border-[var(--c-br2)] shrink-0">
            <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase flex items-center gap-1.5"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <Settings2 size={10} /> Technical Configuration · {flow.technology}
            </span>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* Connector selection */}
            <div className="flex flex-col gap-2">
              <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>CONNECTOR</span>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Connector">
                  <select
                    value={connectorSelection?.pluginId ?? latestConnectorForFlow?.pluginId ?? ''}
                    onChange={(event) => handleConnectorChange(event.target.value)}
                    className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {availableConnectors.map((connector) => (
                      <option key={connector.pluginId} value={connector.pluginId}>
                        {connector.displayName}
                      </option>
                    ))}
                  </select>
                </FieldRow>
                <FieldRow label="Version">
                  <select
                    value={connectorSelection?.pluginVersion ?? latestConnectorForFlow?.pluginVersion ?? ''}
                    onChange={(event) => handleConnectorVersionChange(event.target.value)}
                    className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {connectorVersions.map((connector) => (
                      <option key={`${connector.pluginId}@${connector.pluginVersion}`} value={connector.pluginVersion}>
                        {connector.pluginVersion}
                      </option>
                    ))}
                  </select>
                </FieldRow>
              </div>
              {latestConnectorForFlow && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2.5 py-2 text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  <span className="text-[var(--c-tx2)]">{latestConnectorForFlow.displayName}</span>
                  <span>pluginId: {latestConnectorForFlow.pluginId}</span>
                  <span>core API: {latestConnectorForFlow.coreApiVersion}</span>
                  {selectedHealth && (
                    <span className={`rounded border px-1.5 py-0.5 uppercase ${selectedHealth.status === 'healthy' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10' : selectedHealth.status === 'degraded' ? 'border-amber-500/30 text-amber-500 bg-amber-500/10' : 'border-slate-400/30 text-slate-400 bg-slate-500/10'}`}>
                      {selectedHealth.status}
                    </span>
                  )}
                </div>
              )}
              {connectorCatalog.length > 0 ? (
                <ConnectorConfigEditor
                  flowId={flow.id}
                  connector={latestConnectorForFlow}
                  config={connectorConfig}
                  fallbackFlow={flow}
                  onChange={handleConnectorConfigChange}
                />
              ) : (
                <ConnectorConfigEditor
                  flowId={flow.id}
                  connector={null}
                  config={connectorConfig}
                  fallbackFlow={flow}
                  onChange={handleConnectorConfigChange}
                />
              )}
            </div>

            {/* Generation */}
            <div className="h-px bg-[var(--c-br2)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>CONNECTION</span>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Host">
                  <input
                    value={draftHost}
                    onChange={(event) => setDraftHost(event.target.value)}
                    className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  />
                </FieldRow>
                <FieldRow label="Port">
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={draftPort}
                    onChange={(event) => setDraftPort(Number(event.target.value))}
                    className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  />
                </FieldRow>
              </div>
              <FieldRow label="Topic / Endpoint">
                <input
                  value={draftTopic}
                  onChange={(event) => setDraftTopic(event.target.value)}
                  className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                />
              </FieldRow>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>GENERATION</span>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Interval">
                  <input
                    type="number"
                    min={1}
                    value={draftInterval}
                    onChange={(event) => setDraftInterval(Number(event.target.value))}
                    className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  />
                </FieldRow>
                <FieldRow label="Burst">
                  <input
                    type="number"
                    min={1}
                    value={draftBurst}
                    onChange={(event) => setDraftBurst(Number(event.target.value))}
                    className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  />
                </FieldRow>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Pattern"><TSelect options={['random', 'sequential', 'gaussian', 'spike']} value="random" /></FieldRow>
                <FieldRow label="Jitter"><TNumber value={0} unit="ms" /></FieldRow>
              </div>
              <FieldRow label="Rate Limit"><TNumber value={0} unit="msg/s (0=unlimited)" /></FieldRow>
            </div>

            {/* Error handling */}
            <div className="h-px bg-[var(--c-br2)]" />
            <div className="flex flex-col gap-2">
              <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}>ERROR HANDLING</span>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="On Error"><TSelect options={['retry', 'skip', 'stop', 'log']} value="retry" /></FieldRow>
                <FieldRow label="Max Retries"><TNumber value={3} /></FieldRow>
              </div>
              <FieldRow label="Retry Backoff"><TSelect options={['linear', 'exponential', 'fixed']} value="exponential" /></FieldRow>
            </div>
          </div>
        </div>

        {/* RIGHT: Format editor */}
        <div className={`flex flex-col overflow-hidden ${activeTab === 'technical' ? 'hidden md:flex' : 'flex'} flex-1`}>
          <div className="px-4 py-2.5 border-b border-[var(--c-br2)] flex items-center gap-3 shrink-0">
            <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase flex items-center gap-1.5"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <Code2 size={10} /> Message Format
            </span>
            <div className="flex items-center gap-1 ml-auto">
              {(['json', 'xml', 'csv', 'plain'] as const).map(mode => {
                const icons = {
                  json: <Braces size={10} />,
                  xml: <FileCode size={10} />,
                  csv: <TableProperties size={10} />,
                  plain: <FileText size={10} />,
                };
                return (
                  <button
                    key={mode}
                    onClick={() => handleFormatModeChange(mode)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] tracking-wider transition-all border ${
                      formatMode === mode
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-500'
                        : 'text-[var(--c-tx4)] border-transparent hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg5)]'
                    }`}
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {icons[mode]}
                    {mode.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1">
              <button className="p-1.5 rounded border border-[var(--c-br1)] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg6)] transition-all">
                <Copy size={10} />
              </button>
              <button
                onClick={() => onTemplateChange(defaultTemplates[formatMode])}
                className="p-1.5 rounded border border-[var(--c-br1)] text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg6)] transition-all"
              >
                <RotateCcw size={10} />
              </button>
            </div>
          </div>

          {/* Variable hint bar */}
          <div className="px-3 py-1.5 bg-[var(--c-bg1)] border-b border-[var(--c-br2)] flex items-center gap-2 shrink-0">
            <Hash size={9} className="text-cyan-500" />
            <span className="text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              Variables: use{' '}
              <code className="text-cyan-500">{'{{scope.name}}'}</code>
              {' · click '}
              <span className="text-cyan-500">→</span>
              {' on any variable to insert'}
            </span>
            <AlignLeft size={9} className="text-[var(--c-tx4)] ml-auto" />
          </div>

          {/* Smart Template Editor */}
          <div className="flex-1 overflow-hidden relative">
            <TemplateEditor
              value={currentTemplate}
              onChange={onTemplateChange}
              variables={state.variables}
              flowId={flow.id}
              groupId={group.id}
              className="absolute inset-0 w-full h-full bg-[var(--c-bg1)]"
            />
          </div>

          {/* Preview label */}
          <div className="px-3 py-1.5 border-t border-[var(--c-br2)] bg-[var(--c-bg2)] flex items-center gap-2 shrink-0">
            <span className="text-[9px] text-[var(--c-tx5)] tracking-widest" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              LIVE PREVIEW ↓ see bottom panel
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
