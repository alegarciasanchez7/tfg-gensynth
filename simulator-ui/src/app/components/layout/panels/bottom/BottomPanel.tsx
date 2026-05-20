import { useState, useRef, useEffect } from 'react';
import { Terminal, BarChart2, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import { useApp } from '../../../../context';
import type { SystemStatus } from '../../../../types';
import { LogsView } from './LogsView';
import { StatsView } from './StatsView';
import { PreviewView } from './PreviewView';

type Tab = 'logs' | 'stats' | 'preview';

interface BottomPanelProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  systemStatus: SystemStatus;
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
            {(state.metrics?.messagesPerSecond ?? 0).toLocaleString()} msg/s
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
