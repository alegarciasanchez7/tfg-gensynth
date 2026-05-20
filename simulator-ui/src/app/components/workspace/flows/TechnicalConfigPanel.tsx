import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import type { Flow, ConnectorHealthSummary } from '../../../types';
import type { ConnectorPluginDescriptor } from '../../../core/types';
import { FieldRow } from '../../common/FieldRow';
import { ConnectorSchemaField } from '../../common/ConnectorSchemaField';

export function compareVersions(leftVersion: string, rightVersion: string): number {
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

function TNumber({ value, unit }: { value: number; unit?: string }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex">
      <input
        type="number"
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded-l px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      />
      {unit && (
        <span
          className="px-2 py-1.5 bg-[var(--c-bg4)] border border-l-0 border-[var(--c-br1)] rounded-r text-[10px] text-[var(--c-tx4)] shrink-0 flex items-center"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
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
      onChange={(e) => setV(e.target.value)}
      className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
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
      <div
        className="flex flex-col gap-2 rounded border border-dashed border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-4 text-[10px] text-[var(--c-tx4)]"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
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
      <div
        className="rounded border border-dashed border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-4 text-[10px] text-[var(--c-tx4)]"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
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

interface TechnicalConfigPanelProps {
  flow: Flow;
  activeTab: 'technical' | 'format';
  draftHost: string;
  setDraftHost: (val: string) => void;
  draftPort: number;
  setDraftPort: (val: number) => void;
  draftTopic: string;
  setDraftTopic: (val: string) => void;
  draftInterval: number;
  setDraftInterval: (val: number) => void;
  draftBurst: number;
  setDraftBurst: (val: number) => void;
  connectorSelection: { pluginId: string; pluginVersion: string } | null;
  latestConnectorForFlow: ConnectorPluginDescriptor | null;
  connectorVersions: ConnectorPluginDescriptor[];
  availableConnectors: ConnectorPluginDescriptor[];
  selectedHealth: ConnectorHealthSummary | null;
  connectorCatalog: ConnectorPluginDescriptor[];
  connectorConfig: Record<string, unknown>;
  onConnectorChange: (pluginId: string) => void;
  onConnectorVersionChange: (pluginVersion: string) => void;
  onConnectorConfigChange: (nextConfig: Record<string, unknown>) => void;
}

export function TechnicalConfigPanel({
  flow,
  activeTab,
  draftHost,
  setDraftHost,
  draftPort,
  setDraftPort,
  draftTopic,
  setDraftTopic,
  draftInterval,
  setDraftInterval,
  draftBurst,
  setDraftBurst,
  connectorSelection,
  latestConnectorForFlow,
  connectorVersions,
  availableConnectors,
  selectedHealth,
  connectorCatalog,
  connectorConfig,
  onConnectorChange,
  onConnectorVersionChange,
  onConnectorConfigChange,
}: TechnicalConfigPanelProps) {
  return (
    <div
      className={`flex flex-col border-r border-[var(--c-br1)] overflow-y-auto ${
        activeTab === 'format' ? 'hidden md:flex' : 'flex'
      }`}
      style={{ width: '46%', minWidth: 280 }}
    >
      <div className="px-4 py-3 border-b border-[var(--c-br2)] shrink-0">
        <span
          className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase flex items-center gap-1.5"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <Settings2 size={10} /> Technical Configuration · {flow.technology}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Connector selection */}
        <div className="flex flex-col gap-2">
          <span
            className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            CONNECTOR
          </span>
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Connector">
              <select
                value={connectorSelection?.pluginId ?? latestConnectorForFlow?.pluginId ?? ''}
                onChange={(event) => onConnectorChange(event.target.value)}
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
                onChange={(event) => onConnectorVersionChange(event.target.value)}
                className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                {connectorVersions.map((connector) => (
                  <option
                    key={`${connector.pluginId}@${connector.pluginVersion}`}
                    value={connector.pluginVersion}
                  >
                    {connector.pluginVersion}
                  </option>
                ))}
              </select>
            </FieldRow>
          </div>
          {latestConnectorForFlow && (
            <div
              className="flex flex-wrap items-center gap-2 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2.5 py-2 text-[10px] text-[var(--c-tx4)]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              <span className="text-[var(--c-tx2)]">{latestConnectorForFlow.displayName}</span>
              <span>pluginId: {latestConnectorForFlow.pluginId}</span>
              <span>core API: {latestConnectorForFlow.coreApiVersion}</span>
              {selectedHealth && (
                <span
                  className={`rounded border px-1.5 py-0.5 uppercase ${
                    selectedHealth.status === 'healthy'
                      ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10'
                      : selectedHealth.status === 'degraded'
                      ? 'border-amber-500/30 text-amber-500 bg-amber-500/10'
                      : 'border-slate-400/30 text-slate-400 bg-slate-500/10'
                  }`}
                >
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
              onChange={onConnectorConfigChange}
            />
          ) : (
            <ConnectorConfigEditor
              flowId={flow.id}
              connector={null}
              config={connectorConfig}
              fallbackFlow={flow}
              onChange={onConnectorConfigChange}
            />
          )}
        </div>

        {/* Generation */}
        <div className="h-px bg-[var(--c-br2)]" />
        <div className="flex flex-col gap-2">
          <span
            className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            CONNECTION
          </span>
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
          <span
            className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            GENERATION
          </span>
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
            <FieldRow label="Pattern">
              <TSelect options={['random', 'sequential', 'gaussian', 'spike']} value="random" />
            </FieldRow>
            <FieldRow label="Jitter">
              <TNumber value={0} unit="ms" />
            </FieldRow>
          </div>
          <FieldRow label="Rate Limit">
            <TNumber value={0} unit="msg/s (0=unlimited)" />
          </FieldRow>
        </div>

        {/* Error handling */}
        <div className="h-px bg-[var(--c-br2)]" />
        <div className="flex flex-col gap-2">
          <span
            className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            ERROR HANDLING
          </span>
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="On Error">
              <TSelect options={['retry', 'skip', 'stop', 'log']} value="retry" />
            </FieldRow>
            <FieldRow label="Max Retries">
              <TNumber value={3} />
            </FieldRow>
          </div>
          <FieldRow label="Retry Backoff">
            <TSelect options={['linear', 'exponential', 'fixed']} value="exponential" />
          </FieldRow>
        </div>
      </div>
    </div>
  );
}
