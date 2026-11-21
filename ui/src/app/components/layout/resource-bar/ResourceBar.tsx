import { Cpu, MemoryStick, ArrowUpRight, ArrowDownLeft, Server, Clock4, Timer } from 'lucide-react';
import { useSystemStatus, useMetrics } from '../../../context';
import { barColorClass, buildResourceMetrics, type MetricLabel } from './resourceMetrics';

/** Icon of each metric. */
const METRIC_ICONS: Record<MetricLabel, React.ReactNode> = {
  CPU: <Cpu size={11} />,
  RAM: <MemoryStick size={11} />,
  'NET↑': <ArrowUpRight size={11} />,
  'NET↓': <ArrowDownLeft size={11} />,
  'MSG/S': <Server size={11} />,
  TICK: <Timer size={11} />,
  UPTIME: <Clock4 size={11} />,
};

export function ResourceBar() {
  const systemStatus = useSystemStatus();
  const { metrics } = useMetrics();
  const running = systemStatus === 'running';

  const uiMetrics = buildResourceMetrics(metrics, running);

  return (
    <div
      className="flex items-center gap-2.5 px-4 border-b border-[var(--c-br2)] bg-[var(--c-bg2)] shrink-0 overflow-x-auto select-none"
      style={{ height: 28 }}
      data-testid="resource-bar"
    >
      {uiMetrics.map((m) => (
        <div key={m.label} title={m.title} className="flex shrink-0 items-center gap-2 pr-2.5 mr-0.5 border-r border-[var(--c-br2)] last:border-r-0">
          <div className="flex items-center gap-1">
            <span className={`${m.color} opacity-70`}>{METRIC_ICONS[m.label]}</span>
            <span className="text-[10px] text-[var(--c-tx4)] tracking-wider" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {m.label}
            </span>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className={`text-[11px] ${m.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {m.value}
            </span>
            {m.unit && (
              <span className="text-[9px] text-[var(--c-tx4)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {m.unit}
              </span>
            )}
          </div>
          {m.barPct !== undefined && (
            <div className="w-9 h-1 bg-[var(--c-br2)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${barColorClass(m.barPct, m.color)}`}
                style={{ width: `${m.barPct}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
