import { Settings2 } from 'lucide-react';
import type { Flow, ConnectorHealthSummary } from '../../../types';
import type { ConnectorPluginDescriptor } from '../../../core/types';
import { FieldRow } from '../../common/FieldRow';
import { ConnectorConfigForm } from '../../common/ConnectorConfigForm';

export { compareVersions } from '../../../context/helpers/connectorHelpers';

interface TechnicalConfigPanelProps {
  flow: Flow;
  activeTab: 'technical' | 'format';
  draftName: string;
  setDraftName: (val: string) => void;
  /** Raw text of the "Every N ticks" input (may be temporarily invalid while typing). */
  draftEveryTicks: string;
  setDraftEveryTicks: (val: string) => void;
  onEveryTicksBlur: () => void;
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
  draftName,
  setDraftName,
  draftEveryTicks,
  setDraftEveryTicks,
  onEveryTicksBlur,
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
        {/* Flow details */}
        <div className="flex flex-col gap-2">
          <span
            className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            FLOW INFORMATION
          </span>
          <FieldRow label="Flow Name">
            <input
              aria-label="Flow name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Flow name"
              className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </FieldRow>
          <FieldRow label="Every N ticks" description="1 message every N ticks · tick rate in Settings → Simulation">
            <input
              type="number"
              min={1}
              step={1}
              aria-label="Every N ticks"
              value={draftEveryTicks}
              onChange={(event) => setDraftEveryTicks(event.target.value)}
              onBlur={onEveryTicksBlur}
              className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-2.5 py-1.5 text-[11px] text-[var(--c-tx1)] outline-none focus:border-cyan-500/50 transition-all w-full"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </FieldRow>
        </div>

        <div className="h-px bg-[var(--c-br2)]" />

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
              <span className="text-[var(--c-tx2)]">{latestConnectorForFlow.pluginId}@{latestConnectorForFlow.pluginVersion}</span>
              <span>plugin API {latestConnectorForFlow.apiVersion}</span>
              {latestConnectorForFlow.external && <span>installed plugin</span>}
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
          {latestConnectorForFlow ? (
            <ConnectorConfigForm
              key={`${flow.id}:${latestConnectorForFlow.pluginId}@${latestConnectorForFlow.pluginVersion}`}
              connector={latestConnectorForFlow}
              config={connectorConfig}
              onChange={onConnectorConfigChange}
              showAllErrors
            />
          ) : (
            <div
              className="rounded border border-dashed border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-3 text-[10px] text-[var(--c-tx4)]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {connectorCatalog.length === 0
                ? 'No connectors loaded yet.'
                : `No connector "${flow.technology}" is installed. Import its plugin from Connectors → Import plugin.`}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
