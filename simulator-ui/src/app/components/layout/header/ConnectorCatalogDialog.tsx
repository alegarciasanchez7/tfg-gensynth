import { useState } from 'react';
import { Loader2, Package, Plug, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../ui/dialog';
import type { ConnectorHealthSummary } from '../../../types';
import type { ConnectorFieldDescriptor, ConnectorFieldType, ConnectorPluginDescriptor } from '../../../core/types';
import { CoreCommands } from '../../../core/bridge';

interface ConnectorCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  latestConnectors: ConnectorPluginDescriptor[];
  connectorHealthSummary: ConnectorHealthSummary[];
  /** Opens the plugin import panel. */
  onImportPlugin: () => void;
}

const TYPE_LABELS: Record<ConnectorFieldType, string> = {
  TEXT: 'Text',
  PASSWORD: 'Secret',
  INTEGER: 'Integer',
  DECIMAL: 'Decimal',
  BOOLEAN: 'Yes / No',
  SELECT: 'Choice',
};

const HEALTH_STYLES: Record<ConnectorHealthSummary['status'], { badge: string; dot: string }> = {
  healthy: { badge: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10', dot: 'bg-emerald-400' },
  degraded: { badge: 'text-amber-500 border-amber-500/30 bg-amber-500/10', dot: 'bg-amber-400' },
  offline: { badge: 'text-slate-400 border-slate-400/30 bg-slate-500/10', dot: 'bg-slate-400' },
};

const connectorKey = (connector: ConnectorPluginDescriptor) => `${connector.pluginId}@${connector.pluginVersion}`;

/** Human-readable default value of a field, or null when it has none. */
function formatDefault(field: ConnectorFieldDescriptor): string | null {
  if (field.defaultValue === null || field.defaultValue === '') return null;
  if (field.type === 'PASSWORD') return '••••••';
  if (field.type === 'BOOLEAN') return field.defaultValue ? 'Yes' : 'No';
  if (field.type === 'SELECT') {
    return field.options.find((option) => option.value === field.defaultValue)?.label ?? String(field.defaultValue);
  }
  return String(field.defaultValue);
}

/** Allowed range of a numeric field, or null when it is unbounded. */
function formatRange(field: ConnectorFieldDescriptor): string | null {
  if (field.min === undefined && field.max === undefined) return null;
  if (field.min !== undefined && field.max !== undefined) return `${field.min} – ${field.max}`;
  return field.min !== undefined ? `≥ ${field.min}` : `≤ ${field.max}`;
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-[var(--c-br2)] bg-[var(--c-bg1)] px-1.5 py-0.5 text-[10px] text-[var(--c-tx4)]">
      {label}: <span className="text-[var(--c-tx2)]">{value}</span>
    </span>
  );
}

function FieldRow({ field }: { field: ConnectorFieldDescriptor }) {
  const defaultValue = formatDefault(field);
  const range = formatRange(field);
  return (
    <li className="py-3 first:pt-0 last:pb-0" data-testid={`catalog-field-${field.key}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--c-tx1)] font-medium">{field.label}</span>
        {field.required ? (
          <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-red-500 bg-red-500/10">Required</span>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--c-tx4)] bg-[var(--c-bg4)]">Optional</span>
        )}
        <span className="ml-auto text-[10px] text-cyan-500">{TYPE_LABELS[field.type]}</span>
      </div>
      {field.tooltip && <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-tx3)]">{field.tooltip}</p>}
      {(defaultValue || range || field.options.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {defaultValue && <MetaChip label="Default" value={defaultValue} />}
          {range && <MetaChip label="Range" value={range} />}
          {field.options.length > 0 && (
            <MetaChip label="Options" value={field.options.map((option) => option.label).join(', ')} />
          )}
        </div>
      )}
    </li>
  );
}

function UsageStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex-1 min-w-[90px] rounded-md border border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-2">
      <div className={`text-base font-semibold ${tone ?? 'text-[var(--c-tx1)]'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--c-tx4)]">{label}</div>
    </div>
  );
}

/**
 * Large centered dialog listing the loaded connectors on the left and the details of the
 * selected one on the right: description, usage, configuration fields and uninstall.
 */
export function ConnectorCatalogDialog({
  open,
  onOpenChange,
  latestConnectors,
  connectorHealthSummary,
  onImportPlugin,
}: ConnectorCatalogDialogProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const selected = latestConnectors.find((connector) => connectorKey(connector) === selectedKey) ?? latestConnectors[0];
  const healthOf = (connector: ConnectorPluginDescriptor) =>
    connectorHealthSummary.find(
      (entry) => entry.pluginId === connector.pluginId && entry.pluginVersion === connector.pluginVersion,
    );
  const health = selected ? healthOf(selected) : undefined;

  const select = (key: string) => {
    setSelectedKey(key);
    setConfirmUninstall(false);
  };

  const handleUninstall = async (connector: ConnectorPluginDescriptor) => {
    setUninstalling(true);
    try {
      const response = await CoreCommands.uninstallPlugin(connector.pluginId, connector.pluginVersion);
      if (response.success) {
        toast.success(response.message || 'Plugin uninstalled successfully. Restarting...');
        return;
      }
      toast.error(response.message || 'Failed to uninstall plugin');
    } catch {
      toast.error('An error occurred while communicating with the core');
    }
    setUninstalling(false);
    setConfirmUninstall(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl w-[90vw] h-[75vh] max-h-[680px] min-h-[400px] p-0 gap-0 flex overflow-hidden rounded-xl bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <nav
          aria-label="Connectors"
          className="w-52 sm:w-64 shrink-0 flex flex-col border-r border-[var(--c-br1)] bg-[var(--c-bg3)]"
        >
          <DialogTitle className="px-4 pt-4 pb-3 text-[9px] font-normal leading-none text-[var(--c-tx5)] tracking-widest uppercase">
            Connector Catalog
          </DialogTitle>
          <div className="flex-1 overflow-y-auto">
            {latestConnectors.map((connector) => {
              const key = connectorKey(connector);
              const isSelected = selected !== undefined && key === connectorKey(selected);
              const connectorHealth = healthOf(connector);
              return (
                <button
                  key={key}
                  type="button"
                  aria-current={isSelected ? 'page' : undefined}
                  onClick={() => select(key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-l-2 transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/10 border-l-cyan-500'
                      : 'border-l-transparent hover:bg-cyan-500/5'
                  }`}
                >
                  <Plug size={14} className={isSelected ? 'text-cyan-400 shrink-0' : 'text-[var(--c-tx4)] shrink-0'} />
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate text-xs ${isSelected ? 'text-[var(--c-tx1)]' : 'text-[var(--c-tx2)]'}`}>
                      {connector.displayName}
                    </span>
                    <span className="block text-[10px] text-[var(--c-tx4)]">
                      v{connector.pluginVersion} · {connector.external ? 'Plugin' : 'Built-in'}
                    </span>
                  </span>
                  {connectorHealth && (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_STYLES[connectorHealth.status].dot}`}
                      title={connectorHealth.status}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="p-3 border-t border-[var(--c-br2)]">
            <button
              type="button"
              onClick={onImportPlugin}
              className="w-full flex items-center justify-center gap-1.5 rounded border border-[var(--c-br1)] px-3 py-2 text-[11px] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)] transition-all"
            >
              <Plus size={12} /> Import plugin
            </button>
          </div>
        </nav>

        {selected ? (
          <section className="flex-1 min-w-0 flex flex-col">
            <header className="px-6 pt-5 pb-4 pr-12 border-b border-[var(--c-br2)]">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm text-[var(--c-tx1)] font-semibold">{selected.displayName}</h2>
                <span className="text-[11px] text-cyan-500">v{selected.pluginVersion}</span>
                <span className="rounded border border-[var(--c-br2)] bg-[var(--c-bg1)] px-1.5 py-0.5 text-[9px] text-[var(--c-tx4)] uppercase tracking-wider">
                  {selected.external ? 'Plugin' : 'Built-in'}
                </span>
                {health && (
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${HEALTH_STYLES[health.status].badge}`}>
                    {health.status}
                  </span>
                )}
              </div>
              <DialogDescription className="mt-1.5 text-[11px] leading-relaxed text-[var(--c-tx3)]">
                {selected.description || 'No description provided.'}
              </DialogDescription>
              <div className="mt-2 text-[10px] text-[var(--c-tx5)]">
                id: {selected.pluginId}
                {selected.apiVersion && <> · plugin API {selected.apiVersion}</>}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
              <section aria-label="Usage">
                <h3 className="mb-2 text-[10px] uppercase tracking-widest text-[var(--c-tx4)]">Usage</h3>
                {health ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <UsageStat label="Flows" value={health.flowCount} />
                      <UsageStat label="Connected" value={health.connectedCount} tone="text-emerald-500" />
                      <UsageStat label="Warnings" value={health.warningCount} tone={health.warningCount > 0 ? 'text-amber-500' : undefined} />
                      <UsageStat label="Errors" value={health.errorCount} tone={health.errorCount > 0 ? 'text-red-500' : undefined} />
                    </div>
                    {health.lastMessage && (
                      <p className="mt-2 text-[11px] text-[var(--c-tx3)] break-words">Last message: {health.lastMessage}</p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-[var(--c-tx4)]">No running flow uses this connector.</p>
                )}
              </section>

              <section aria-label="Configuration fields">
                <h3 className="mb-1 text-[10px] uppercase tracking-widest text-[var(--c-tx4)]">
                  Configuration fields ({selected.fields.length})
                </h3>
                <p className="mb-3 text-[11px] text-[var(--c-tx4)]">Shown in this order when a flow uses the connector.</p>
                {selected.fields.length > 0 ? (
                  <ul className="divide-y divide-[var(--c-br2)] rounded-md border border-[var(--c-br2)] bg-[var(--c-bg8)] px-4 py-3">
                    {selected.fields.map((field) => (
                      <FieldRow key={field.key} field={field} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-[var(--c-tx4)]">This connector needs no configuration.</p>
                )}
              </section>

              {selected.external && (
                <section aria-label="Uninstall" className="rounded-md border border-red-500/20 bg-red-500/5 px-4 py-3">
                  {confirmUninstall ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="flex-1 min-w-[200px] text-[11px] text-red-400">
                        Uninstalling restarts GenSynth and stops the active flows. Continue?
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmUninstall(false)}
                        className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] px-3 py-1.5 text-[11px] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUninstall(selected)}
                        disabled={uninstalling}
                        className="flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                      >
                        {uninstalling ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Uninstall
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="flex-1 min-w-[200px] text-[11px] text-[var(--c-tx3)]">
                        Remove this plugin from GenSynth. Flows that use it will need another connector.
                      </p>
                      <button
                        type="button"
                        onClick={() => setConfirmUninstall(true)}
                        className="flex items-center gap-1.5 rounded border border-red-500/30 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 size={12} /> Uninstall plugin
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
          </section>
        ) : (
          <section className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <Package size={28} className="text-[var(--c-tx5)]" />
            <p className="text-xs text-[var(--c-tx2)]">No connectors loaded</p>
            <DialogDescription className="text-[11px] text-[var(--c-tx4)]">
              Start the GenSynth core, or import a connector plugin.
            </DialogDescription>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
