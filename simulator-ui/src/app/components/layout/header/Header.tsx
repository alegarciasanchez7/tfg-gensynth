import { useState, useRef, useEffect } from 'react';
import { Power, Square, FolderOpen, Save, Settings, Zap, Activity, Moon, Sun, X, Package } from 'lucide-react';
import type { SystemStatus, ConnectorHealthSummary } from '../../../types';
import type { ConnectorPluginDescriptor } from '../../../core/types';

interface HeaderProps {
  systemStatus: SystemStatus;
  onStatusToggle: () => void;
  onLoadProject: () => Promise<void>;
  onSaveProject: () => Promise<void>;
  projectName: string;
  isDark: boolean;
  onThemeToggle: () => void;
  latestConnectors: ConnectorPluginDescriptor[];
  connectorHealthSummary: ConnectorHealthSummary[];
}

const StatusBadge = ({ status }: { status: SystemStatus }) => {
  const cfg = {
    running:    { color: 'text-emerald-400', dot: 'bg-emerald-400', label: 'RUNNING',    pulse: true },
    stopped:    { color: 'text-slate-500',   dot: 'bg-slate-400',   label: 'STOPPED',    pulse: false },
    processing: { color: 'text-amber-400',   dot: 'bg-amber-400',   label: 'PROCESSING', pulse: true },
  }[status];

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded"
      style={{ minWidth: 130 }}
    >
      <span className="relative flex h-2 w-2">
        <span className={`${cfg.dot} rounded-full w-2 h-2 ${cfg.pulse ? 'animate-pulse' : ''}`} />
      </span>
      <span className={`text-xs tracking-widest ${cfg.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {cfg.label}
      </span>
    </div>
  );
};

function ConnectorCatalogPanel({ latestConnectors, connectorHealthSummary, onClose }: {
  latestConnectors: ConnectorPluginDescriptor[];
  connectorHealthSummary: ConnectorHealthSummary[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

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

            return (
              <div
                key={connector.pluginId}
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
                  <span className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] uppercase whitespace-nowrap ${
                    health ? healthColor(health.status) : 'text-[var(--c-tx4)] border-[var(--c-br1)] bg-transparent'
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

function SettingsPanel({ isDark, onThemeToggle, onClose }: {
  isDark: boolean;
  onThemeToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 min-w-52 py-2"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--c-br2)] mb-1">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase">Settings</span>
        <button onClick={onClose} className="text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors">
          <X size={10} />
        </button>
      </div>

      {/* Theme toggle */}
      <div className="px-3 py-1 text-[10px] text-[var(--c-tx4)] tracking-wider uppercase mb-0.5">
        Appearance
      </div>
      <button
        onClick={() => { onThemeToggle(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--c-bg5)] transition-colors group"
      >
        <span className="flex items-center justify-center w-6 h-6 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] group-hover:border-cyan-500/40 group-hover:bg-cyan-500/10 transition-all">
          {isDark ? <Sun size={11} className="text-amber-400" /> : <Moon size={11} className="text-violet-400" />}
        </span>
        <div className="flex flex-col gap-0">
          <span className="text-[11px] text-[var(--c-tx2)]">
            {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </span>
          <span className="text-[10px] text-[var(--c-tx4)]">
            Currently: {isDark ? 'Dark' : 'Light'}
          </span>
        </div>
      </button>

      {/* Divider */}
      <div className="h-px bg-[var(--c-br2)] my-1.5" />

      {/* Version info */}
      <div className="px-3 py-1.5">
        <span className="text-[10px] text-[var(--c-tx5)]">SYN·GEN v0.9.1-alpha</span>
      </div>
    </div>
  );
}

export function Header({ systemStatus, onStatusToggle, onLoadProject, onSaveProject, projectName, isDark, onThemeToggle, latestConnectors, connectorHealthSummary }: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [loadingState, setLoadingState] = useState(false);
  const isRunning = systemStatus === 'running';

  return (
    <div
      className="flex items-center gap-3 px-4 border-b border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0 relative"
      style={{ height: 52 }}
    >
      {/* Logo + Name */}
      <div className="flex items-center gap-2.5 mr-2">
        <div className="flex items-center justify-center w-7 h-7 bg-cyan-500/10 border border-cyan-500/40 rounded">
          <Zap size={14} className="text-cyan-400" />
        </div>
        <span
          className="text-sm font-bold text-[var(--c-tx1)] tracking-tight"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {projectName}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-7 bg-[var(--c-br1)]" />

      {/* Status badge */}
      <StatusBadge status={systemStatus} />

      {/* Power controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onStatusToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-all ${
            isRunning
              ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
          }`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          {isRunning ? (
            <><Square size={11} fill="currentColor" /> STOP</>
          ) : (
            <><Power size={11} /> START</>
          )}
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-7 bg-[var(--c-br1)]" />

      {/* File actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={async () => {
            setLoadingState(true);
            try {
              await onLoadProject();
            } catch (error) {
              console.error('[Header] Load project error:', error);
            } finally {
              setLoadingState(false);
            }
          }}
          disabled={loadingState}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[var(--c-br1)] text-xs text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FolderOpen size={12} /> Load
        </button>
        <button
          onClick={async () => {
            setLoadingState(true);
            try {
              await onSaveProject();
            } catch (error) {
              console.error('[Header] Save project error:', error);
            } finally {
              setLoadingState(false);
            }
          }}
          disabled={loadingState}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[var(--c-br1)] text-xs text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={12} /> Save
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-7 bg-[var(--c-br1)]" />

      {/* Connector catalog button */}
      <div className="relative">
        <button
          onClick={() => setShowCatalog(s => !s)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-all ${
            showCatalog
              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
              : 'border-[var(--c-br1)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]'
          }`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          <Package size={12} /> Connectors ({latestConnectors.length})
        </button>
        {showCatalog && (
          <ConnectorCatalogPanel
            latestConnectors={latestConnectors}
            connectorHealthSummary={connectorHealthSummary}
            onClose={() => setShowCatalog(false)}
          />
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Activity icon */}
      <Activity size={13} className={isRunning ? 'text-emerald-400 animate-pulse' : 'text-slate-400'} />

      {/* Settings */}
      <div className="relative">
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`flex items-center justify-center w-7 h-7 rounded border transition-all ${
            showSettings
              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
              : 'border-[var(--c-br1)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]'
          }`}
        >
          <Settings size={13} />
        </button>
        {showSettings && (
          <SettingsPanel
            isDark={isDark}
            onThemeToggle={onThemeToggle}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  );
}
