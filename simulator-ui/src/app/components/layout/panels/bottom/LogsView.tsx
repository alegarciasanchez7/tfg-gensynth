import { useState, useRef, useEffect } from 'react';
import {
  Circle, AlertTriangle, AlertCircle, Bug, Trash2, Send, ChevronDown
} from 'lucide-react';
import type { ConnectorHealthSummary, Group } from '../../../../types';

const levelCfg = {
  info:  { color: 'text-sky-500',     dot: 'bg-sky-500',     label: 'INFO ' },
  warn:  { color: 'text-amber-500',   dot: 'bg-amber-500',   label: 'WARN ' },
  error: { color: 'text-red-500',     dot: 'bg-red-500',     label: 'ERROR' },
  debug: { color: 'text-[var(--c-tx4)]', dot: 'bg-[var(--c-tx4)]', label: 'DEBUG' },
  data:  { color: 'text-emerald-500', dot: 'bg-emerald-500', label: 'DATA ' },
};

const levelIcon = {
  info:  <Circle size={9} fill="currentColor" />,
  warn:  <AlertTriangle size={9} />,
  error: <AlertCircle size={9} />,
  debug: <Bug size={9} />,
  data:  <Send size={9} />,
};

interface LogsViewProps {
  entries: Array<{ id: string; timestamp: string; level: 'info' | 'warn' | 'error' | 'debug' | 'data'; source: string; message: string }>;
  connectorHealthSummary: ConnectorHealthSummary[];
  groups: Group[];
}

export function LogsView({ entries, connectorHealthSummary, groups }: LogsViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<string>('all');
  const [onlyFile, setOnlyFile] = useState<boolean>(false);
  const [atBottom, setAtBottom] = useState(true);

  const allFlows = groups.flatMap((g) => g.flows.map((f) => ({
    id: f.id,
    name: f.name,
    groupId: g.id,
    groupName: g.name,
  })));

  const availableFlows = groupFilter === 'all'
    ? allFlows
    : allFlows.filter((f) => f.groupId === groupFilter);

  const flowIdsInGroup = groupFilter === 'all'
    ? new Set<string>()
    : new Set((groups.find((g) => g.id === groupFilter)?.flows ?? []).map((f) => f.id));

  const filtered = entries.filter((entry) => {
    if (filter !== 'all' && entry.level !== filter) {
      return false;
    }

    if (onlyFile) {
      if (entry.level !== 'data') {
        return false;
      }
    }

    if (groupFilter !== 'all') {
      const isGroupSource = entry.source === groupFilter;
      const isFlowInGroup = flowIdsInGroup.has(entry.source);
      if (!isGroupSource && !isFlowInGroup) {
        return false;
      }
    }

    if (flowFilter !== 'all' && entry.source !== flowFilter) {
      return false;
    }

    return true;
  });

  useEffect(() => {
    setFlowFilter('all');
  }, [groupFilter]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const nearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 80;
      setAtBottom(nearBottom);
    }
  };

  useEffect(() => {
    if (atBottom && endRef.current) {
      endRef.current.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [filtered, atBottom]);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    setAtBottom(true);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--c-br2)] bg-[var(--c-bg1)]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Connector Health
          </span>
          <span className="text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {connectorHealthSummary.length} monitored
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {connectorHealthSummary.length > 0 ? connectorHealthSummary.map((entry) => (
            <div key={`${entry.pluginId}@${entry.pluginVersion}`} className="flex items-center gap-2 rounded border border-[var(--c-br1)] px-2 py-1 text-[9px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <span className="text-[var(--c-tx2)]">{entry.displayName}</span>
              <span className="text-cyan-500">{entry.pluginVersion}</span>
              <span className={`uppercase ${entry.status === 'healthy' ? 'text-emerald-500' : entry.status === 'degraded' ? 'text-amber-500' : 'text-slate-400'}`}>
                {entry.status}
              </span>
            </div>
          )) : (
            <span className="text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              no connector health available
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--c-br2)] shrink-0">
        {(['all', 'info', 'warn', 'error', 'debug', 'data'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[10px] transition-all ${
              filter === f
                ? f === 'all' ? 'bg-[var(--c-bg7)] text-[var(--c-tx1)] border border-[var(--c-br3)]'
                  : f === 'error' ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                  : f === 'warn' ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  : f === 'data' ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                  : f === 'debug' ? 'bg-[var(--c-bg7)] text-[var(--c-tx4)] border border-[var(--c-br3)]'
                  : 'bg-sky-500/15 text-sky-500 border border-sky-500/30'
                : 'text-[var(--c-tx4)] hover:text-[var(--c-tx2)]'
            }`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <select
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
          className="h-6 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2 text-[10px] text-[var(--c-tx2)]"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
          aria-label="filter-group"
        >
          <option value="all">Group: all</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{`Group: ${g.name}`}</option>
          ))}
        </select>
        <select
          value={flowFilter}
          onChange={(event) => setFlowFilter(event.target.value)}
          className="h-6 rounded border border-[var(--c-br1)] bg-[var(--c-bg1)] px-2 text-[10px] text-[var(--c-tx2)]"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
          aria-label="filter-flow"
        >
          <option value="all">Flow: all</option>
          {availableFlows.map((f) => (
            <option key={f.id} value={f.id}>{`Flow: ${f.name}`}</option>
          ))}
        </select>
        <button
          onClick={() => setOnlyFile(!onlyFile)}
          className={`px-2 py-0.5 rounded text-[10px] transition-all ${
            onlyFile
              ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-500'
              : 'text-[var(--c-tx4)] hover:text-[var(--c-tx2)]'
          }`}
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        >
          only data
        </button>
        <div className="flex-1" />
        <button className="p-1 rounded text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg6)] transition-all">
          <Trash2 size={10} />
        </button>
      </div>

      {/* Log entries */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-1 font-mono"
        >
          {(() => {
            const sourceNameMap = new Map<string, string>();
            groups.forEach(g => {
              sourceNameMap.set(g.id, g.name);
              g.flows.forEach(f => sourceNameMap.set(f.id, f.name));
            });

            return filtered.map(entry => {
              const cfg = levelCfg[entry.level];
              const sourceDisplay = sourceNameMap.get(entry.source) || entry.source;
              return (
                <div key={entry.id} className="flex items-start gap-2 py-0.5 group hover:bg-[var(--c-bg4)] px-1 rounded">
                  <span className="text-[10px] text-[var(--c-tx5)] shrink-0 pt-px" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {entry.timestamp}
                  </span>
                  <span className={`flex items-center gap-0.5 text-[10px] shrink-0 pt-px ${cfg.color}`}
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {levelIcon[entry.level]}
                    {cfg.label}
                  </span>
                  <span className="text-[10px] text-[var(--c-tx4)] shrink-0 pt-px" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    [{sourceDisplay}]
                  </span>
                  <span className="text-[11px] text-[var(--c-tx3)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {entry.message}
                  </span>
                </div>
              );
            });
          })()}
          <div ref={endRef} />
        </div>

        {/* Scroll bottom button */}
        {!atBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-6 flex items-center gap-2 px-3 py-1.5 bg-cyan-500 text-white rounded-full shadow-lg hover:bg-cyan-600 transition-all text-[10px] animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            <ChevronDown size={12} />
            <span>Latest logs</span>
          </button>
        )}
      </div>
    </div>
  );
}
