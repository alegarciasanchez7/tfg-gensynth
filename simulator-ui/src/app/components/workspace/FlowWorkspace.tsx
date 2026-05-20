import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Radio, Globe, Wifi, Zap, Cpu, Layers, AlertTriangle,
  CheckCircle, Code2, Hash,
  AlignLeft, Copy, RotateCcw, Save, Trash2, Braces, TableProperties, FileCode, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import type { Flow, Group, ConnectionStatus } from '../../types';
import { defaultTemplates } from '../../data/mockData';
import { useApp } from '../../context';
import { TemplateEditor } from './flows/TemplateEditor';
import { TechnicalConfigPanel, compareVersions } from './flows/TechnicalConfigPanel';
import type { ConnectorPluginDescriptor } from '../../core/types';

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
        <TechnicalConfigPanel
          flow={flow}
          activeTab={activeTab}
          draftHost={draftHost}
          setDraftHost={setDraftHost}
          draftPort={draftPort}
          setDraftPort={setDraftPort}
          draftTopic={draftTopic}
          setDraftTopic={setDraftTopic}
          draftInterval={draftInterval}
          setDraftInterval={setDraftInterval}
          draftBurst={draftBurst}
          setDraftBurst={setDraftBurst}
          connectorSelection={connectorSelection}
          latestConnectorForFlow={latestConnectorForFlow}
          connectorVersions={connectorVersions}
          availableConnectors={availableConnectors}
          selectedHealth={selectedHealth}
          connectorCatalog={connectorCatalog}
          connectorConfig={connectorConfig}
          onConnectorChange={handleConnectorChange}
          onConnectorVersionChange={handleConnectorVersionChange}
          onConnectorConfigChange={handleConnectorConfigChange}
        />

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
