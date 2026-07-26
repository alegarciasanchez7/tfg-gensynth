import { useState, useMemo } from 'react';
import { Power, Square, FolderOpen, Save, Settings, Package, Plus } from 'lucide-react';
import type { SystemStatus, ConnectorHealthSummary, Variable } from '../../../types';
import type { ConnectorPluginDescriptor } from '../../../core/types';
import { PluginImportPanel } from './PluginImportPanel';
import { ConnectorCatalogPanel } from './ConnectorCatalogPanel';
import { SettingsPanel } from './SettingsPanel';

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
  variables: Variable[];
}

const StatusBadge = ({ status }: { status: SystemStatus }) => {
  const cfg = {
    running: { color: 'text-emerald-400', dot: 'bg-emerald-400', label: 'RUNNING', pulse: true },
    stopped: { color: 'text-slate-500', dot: 'bg-slate-400', label: 'STOPPED', pulse: false },
    processing: { color: 'text-amber-400', dot: 'bg-amber-400', label: 'PROCESSING', pulse: true },
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

export function Header({
  systemStatus,
  onStatusToggle,
  onLoadProject,
  onSaveProject,
  projectName,
  isDark,
  onThemeToggle,
  latestConnectors,
  connectorHealthSummary,
  variables = [],
}: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showPluginImport, setShowPluginImport] = useState(false);
  const [loadingState, setLoadingState] = useState(false);
  const isRunning = systemStatus === 'running';

  // Perform a pre-start check to highlight interlock/cycle/broken-references errors by turning the start button yellow/orange
  const hasPreStartErrors = useMemo(() => {
    if (variables.length === 0) return false;
    const varNames = new Set(variables.map(v => v.name));
    const getDeps = (formula?: string): string[] => {
      if (!formula) return [];
      const deps: string[] = [];
      const regex = /(?:\[|{{)([a-zA-Z0-9_-]+)(?:\]|}})/g;
      let match;
      while ((match = regex.exec(formula)) !== null) {
        deps.push(match[1]);
      }
      return deps;
    };

    // Check broken references
    for (const v of variables) {
      const config = v.config || {};
      if (v.type === 'numeric' && config.pattern === 'FORMULA' && config.formula) {
        const formulaDeps = getDeps(config.formula);
        for (const dep of formulaDeps) {
          if (dep.toLowerCase() !== 'pi' && dep.toLowerCase() !== 'e' && !varNames.has(dep)) {
            return true;
          }
        }
      }
      if (config.conditionalRules && Array.isArray(config.conditionalRules)) {
        for (const rule of config.conditionalRules) {
          if (rule.targetVariable && rule.targetVariable.trim()) {
            if (!varNames.has(rule.targetVariable.trim())) {
              return true;
            }
          }
        }
      }
    }

    // Check cycles
    const detectCycle = (
      varsList: any[],
      currentVarId: string,
      currentVarName: string,
      formula?: string
    ): boolean => {
      const adjList = new Map<string, string[]>();
      for (const v of varsList) {
        if (v.id === currentVarId) {
          adjList.set(v.name, getDeps(formula));
        } else {
          adjList.set(v.name, getDeps(v.config?.formula));
        }
      }
      const visited = new Set<string>();
      const recStack = new Set<string>();
      const dfs = (node: string): boolean => {
        visited.add(node);
        recStack.add(node);
        const neighbors = adjList.get(node) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            if (dfs(neighbor)) return true;
          } else if (recStack.has(neighbor)) {
            return true;
          }
        }
        recStack.delete(node);
        return false;
      };
      return dfs(currentVarName);
    };

    for (const v of variables) {
      if (v.type === 'numeric' && v.config?.formula) {
        if (detectCycle(variables, v.id, v.name, v.config.formula)) {
          return true;
        }
      }
    }

    return false;
  }, [variables]);

  return (
    <div
      className="flex items-center gap-3 px-4 border-b border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0 relative"
      style={{ height: 52 }}
    >
      {/* Logo + Name */}
      <div className="flex items-center gap-2.5 mr-2">
        <div className="flex items-center justify-center w-7 h-7 overflow-hidden">
          <img src="/logo_azul.png" alt="GenSynth Logo" className="w-full h-full object-contain" />
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
          title={!isRunning && hasPreStartErrors ? 'Warning: Validation errors or circular dependencies detected! Click to try starting anyway.' : isRunning ? 'Stop simulator' : 'Start simulator'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-all ${isRunning
              ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : hasPreStartErrors
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
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
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-all ${showCatalog
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

      {/* Plugin import button */}
      <div className="relative">
        <button
          id="plugin-import-toggle"
          onClick={() => setShowPluginImport(s => !s)}
          className={`flex items-center justify-center w-7 h-7 rounded border transition-all ${showPluginImport
              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
              : 'border-[var(--c-br1)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]'
            }`}
          title="Import Plugin"
        >
          <Plus size={13} />
        </button>
        {showPluginImport && (
          <PluginImportPanel onClose={() => setShowPluginImport(false)} />
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <div className="relative">
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`flex items-center justify-center w-7 h-7 rounded border transition-all ${showSettings
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
