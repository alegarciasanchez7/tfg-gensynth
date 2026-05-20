import { useState, useRef, useEffect } from 'react';
import { X, Trash2, Loader2 } from 'lucide-react';
import type { ConnectorHealthSummary } from '../../../types';
import type { ConnectorPluginDescriptor } from '../../../core/types';
import { CoreCommands } from '../../../core/bridge';
import { toast } from 'sonner';

interface ConnectorCatalogPanelProps {
  latestConnectors: ConnectorPluginDescriptor[];
  connectorHealthSummary: ConnectorHealthSummary[];
  onClose: () => void;
}

export function ConnectorCatalogPanel({
  latestConnectors,
  connectorHealthSummary,
  onClose,
}: ConnectorCatalogPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleUninstall = async (pluginId: string, pluginVersion: string) => {
    setUninstalling(pluginId + '@' + pluginVersion);
    try {
      const response = await CoreCommands.uninstallPlugin(pluginId, pluginVersion);
      if (response.success) {
        toast.success(response.message || 'Plugin uninstalled successfully. Restarting...');
      } else {
        toast.error(response.message || 'Failed to uninstall plugin');
        setUninstalling(null);
        setConfirmUninstall(null);
      }
    } catch (err) {
      toast.error('An error occurred while communicating with the core');
      setUninstalling(null);
      setConfirmUninstall(null);
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
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 max-w-md max-h-96 overflow-y-auto py-2"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--c-br2)] mb-1 sticky top-0 bg-[var(--c-bg2)]">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase">Connector Catalog</span>
        <button onClick={onClose} className="text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors">
          <X size={10} />
        </button>
      </div>

      {/* Connectors list */}
      {latestConnectors.length > 0 ? (
        <div className="flex flex-col gap-2 px-3">
          {latestConnectors.map((connector) => {
            const health = connectorHealthSummary.find(
              (entry) => entry.pluginId === connector.pluginId && entry.pluginVersion === connector.pluginVersion,
            );
            const key = connector.pluginId + '@' + connector.pluginVersion;

            return (
              <div
                key={key}
                className="flex flex-col gap-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="text-[10px] text-[var(--c-tx2)] block" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {connector.displayName}
                    </span>
                    <span className="text-[9px] text-cyan-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {connector.pluginId}@{connector.pluginVersion}
                    </span>
                  </div>
                  <span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] uppercase whitespace-nowrap ${health ? healthColor(health.status) : 'text-[var(--c-tx4)] border-[var(--c-br1)] bg-transparent'
                    }`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {health ? health.status : 'unknown'}
                  </span>
                </div>
                {health && (
                  <div className="text-[9px] text-[var(--c-tx4)] flex items-center gap-2">
                    <span>{health.connectedCount}/{health.flowCount} flows</span>
                    {health.warningCount > 0 && <span className="text-amber-500">⚠ {health.warningCount} warn</span>}
                    {health.errorCount > 0 && <span className="text-red-500">✕ {health.errorCount} err</span>}
                  </div>
                )}

                {/* Uninstall button for external plugins only */}
                {connector.external && (
                  <div className="mt-2 pt-2 border-t border-[var(--c-br2)]/50">
                    {confirmUninstall === key ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-[8px] text-red-400/80 uppercase tracking-tight text-center">Are you sure?</span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setConfirmUninstall(null)}
                            className="flex-1 text-[8px] px-2 py-1 rounded bg-[var(--c-bg4)] border border-[var(--c-br1)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleUninstall(connector.pluginId, connector.pluginVersion)}
                            disabled={uninstalling === key}
                            className="flex-1 flex items-center justify-center gap-1 text-[8px] px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                          >
                            {uninstalling === key ? (
                              <Loader2 size={9} className="animate-spin" />
                            ) : (
                              <Trash2 size={9} />
                            )}
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmUninstall(key);
                        }}
                        className="group flex items-center gap-1.5 text-[8px] text-[var(--c-tx4)] hover:text-red-400 transition-all px-2 py-1 rounded border border-transparent hover:border-red-500/20 hover:bg-red-500/5 w-full justify-center"
                      >
                        <Trash2 size={9} className="opacity-50 group-hover:opacity-100" />
                        <span>Uninstall Plugin</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          No connectors loaded
        </div>
      )}
    </div>
  );
}
