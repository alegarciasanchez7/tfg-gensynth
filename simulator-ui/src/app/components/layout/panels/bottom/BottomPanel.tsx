import { useState, useRef, useEffect } from 'react';
import {
  Terminal, BarChart2, Eye, ChevronUp, ChevronDown,
  Circle, AlertTriangle, AlertCircle, Bug, Trash2, RefreshCw, Send
} from 'lucide-react';
import { mockPreviewSamples } from '../../../../data/mockData';
import { useApp } from '../../../../context';
import type { ConnectorHealthSummary } from '../../../../types';
import type { SystemStatus } from '../../../../types';
import type { Group } from '../../../../types';

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

type Tab = 'logs' | 'stats' | 'preview';

interface BottomPanelProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  systemStatus: SystemStatus;
}

function LogsView({ entries, connectorHealthSummary, groups }: { entries: Array<{ id: string; timestamp: string; level: 'info' | 'warn' | 'error' | 'debug' | 'data'; source: string; message: string }>; connectorHealthSummary: ConnectorHealthSummary[]; groups: Group[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<string>('all');
  const [onlyFile, setOnlyFile] = useState<boolean>(false);

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
      // Allow only logs where the level is 'data' to act as the "only data" equivalent
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

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filtered]);

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
      <div className="flex-1 overflow-y-auto px-3 py-1 font-mono">
        {filtered.map(entry => {
          const cfg = levelCfg[entry.level];
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
                [{entry.source}]
              </span>
              <span className="text-[11px] text-[var(--c-tx3)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {entry.message}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function StatsView({ running }: { running: boolean }) {
  const bars = [
    { label: 'Kafka',     value: running ? 78 : 0, color: 'bg-cyan-500',   msgs: running ? '1.65K/s' : '0' },
    { label: 'HTTP',      value: running ? 47 : 0, color: 'bg-violet-500', msgs: running ? '1.07K/s' : '0' },
    { label: 'MQTT',      value: 0,                color: 'bg-red-500',    msgs: '0 (error)' },
    { label: 'TCP',       value: running ? 34 : 0, color: 'bg-amber-500',  msgs: running ? '770/s' : '0' },
    { label: 'WebSocket', value: 0,                color: 'bg-slate-400',  msgs: '0 (stopped)' },
    { label: 'gRPC',      value: 0,                color: 'bg-slate-400',  msgs: '0 (stopped)' },
  ];

  const counters = [
    { label: 'TOTAL SENT',  value: running ? '2,847,394' : '0',  color: 'text-cyan-500' },
    { label: 'ERRORS',      value: running ? '3' : '0',          color: running ? 'text-red-500' : 'text-slate-400' },
    { label: 'DROPPED',     value: '0',                          color: 'text-slate-400' },
    { label: 'AVG LATENCY', value: running ? '12ms' : '--',      color: 'text-emerald-500' },
  ];

  return (
    <div className="flex-1 overflow-y-auto flex gap-4 p-3">
      {/* Counters */}
      <div className="flex flex-col gap-2 shrink-0" style={{ width: 200 }}>
        {counters.map(c => (
          <div key={c.label} className="bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded px-3 py-2 flex flex-col gap-0.5">
            <span className="text-[9px] text-[var(--c-tx4)] tracking-widest" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {c.label}
            </span>
            <span className={`text-sm ${c.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {c.value}
            </span>
          </div>
        ))}
      </div>

      {/* Throughput bars */}
      <div className="flex flex-col gap-2 flex-1">
        <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Throughput by technology
        </span>
        {bars.map(b => (
          <div key={b.label} className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--c-tx4)] w-20 shrink-0 text-right" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {b.label}
            </span>
            <div className="flex-1 h-3 bg-[var(--c-bg1)] border border-[var(--c-br2)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${b.color}`}
                style={{ width: `${b.value}%`, opacity: b.value === 0 ? 0.3 : 1 }}
              />
            </div>
            <span className="text-[10px] text-[var(--c-tx4)] w-20 shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {b.msgs}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewView({ running }: { running: boolean }) {
  const [selectedFlow, setSelectedFlow] = useState<string>('f1');
  const flows = [
    { id: 'f1', label: 'Kafka · sensor.temp' },
    { id: 'f2', label: 'HTTP · telemetry' },
    { id: 'f6', label: 'Kafka · access.raw' },
    { id: 'f9', label: 'TCP · syslog' },
  ];

  const sample = mockPreviewSamples[selectedFlow] ?? '// no preview available';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--c-br2)] shrink-0">
        <span className="text-[10px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          Flow:
        </span>
        <div className="flex gap-1">
          {flows.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFlow(f.id)}
              className={`px-2 py-0.5 rounded text-[10px] transition-all ${
                selectedFlow === f.id
                  ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-500'
                  : 'text-[var(--c-tx4)] hover:text-[var(--c-tx2)]'
              }`}
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {running && (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            live
          </span>
        )}
        <button className="p-1 rounded text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg6)] transition-all">
          <RefreshCw size={10} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {running ? (
          <pre className="text-[11px] text-[var(--c-tx2)] leading-relaxed" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {sample}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--c-tx5)] text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            Start the system to see live preview
          </div>
        )}
      </div>
    </div>
  );
}

export function BottomPanel({ tab, onTabChange, systemStatus }: BottomPanelProps) {
  const { state } = useApp();
  const [height, setHeight] = useState(220);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);
  const running = systemStatus === 'running';

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'logs',    icon: <Terminal size={11} />,  label: 'Logs' },
    { id: 'stats',   icon: <BarChart2 size={11} />, label: 'Statistics' },
    { id: 'preview', icon: <Eye size={11} />,       label: 'Preview' },
  ];

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      setHeight(Math.max(120, Math.min(500, startH.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return (
    <div
      className="flex flex-col border-t border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0"
      style={{ height: collapsed ? 32 : height }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        className="h-1 bg-[var(--c-bg3)] hover:bg-cyan-500/20 cursor-row-resize transition-colors shrink-0"
      />

      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--c-br2)] shrink-0 px-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { onTabChange(t.id); setCollapsed(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] border-b-2 transition-all ${
              tab === t.id && !collapsed
                ? 'border-cyan-500 text-cyan-500'
                : 'border-transparent text-[var(--c-tx4)] hover:text-[var(--c-tx2)]'
            }`}
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {running && (
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 mr-3" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            4,950 msg/s
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg6)] transition-all"
        >
          {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-hidden flex">
          {tab === 'logs'    && <LogsView entries={state.logs} connectorHealthSummary={state.connectorHealthSummary} groups={state.groups ?? []} />}
          {tab === 'stats'   && <StatsView running={running} />}
          {tab === 'preview' && <PreviewView running={running} />}
        </div>
      )}
    </div>
  );
}
