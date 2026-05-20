import { useApp } from '../../../../context';

function formatShortNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + ' M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + ' K';
  }
  return num.toString();
}

interface StatsViewProps {
  running: boolean;
}

export function StatsView({ running }: StatsViewProps) {
  const { state } = useApp();
  const { metrics, groups, flowMetrics } = state;

  // Group flows by technology to show throughput
  const techStats = new Map<string, { label: string; throughput: number; color: string }>();
  
  const techColors: Record<string, string> = {
    kafka: 'bg-cyan-500',
    rabbitmq: 'bg-orange-500',
    mqtt: 'bg-emerald-500',
    http: 'bg-violet-500',
    websocket: 'bg-amber-500',
    tcp: 'bg-blue-500',
    grpc: 'bg-indigo-500',
    file: 'bg-slate-500',
  };

  groups.forEach(group => {
    group.flows.forEach(flow => {
      const tech = flow.technology.toLowerCase();
      const current = techStats.get(tech) || { 
        label: flow.technology.toUpperCase(), 
        throughput: 0, 
        color: techColors[tech] || 'bg-slate-400' 
      };
      
      const metricsForFlow = flowMetrics[flow.id];
      if (metricsForFlow) {
        current.throughput += metricsForFlow.throughput;
      } else {
        // Fallback to parsing the string throughput if metrics not available yet
        const match = flow.throughput.match(/^(\d+)/);
        if (match) current.throughput += parseInt(match[1], 10);
      }
      
      techStats.set(tech, current);
    });
  });

  const bars = Array.from(techStats.values()).sort((a, b) => b.throughput - a.throughput);
  const maxThroughput = Math.max(1, ...bars.map(b => b.throughput));

  // Latency calculation (average across all running flows)
  const activeFlowMetrics = Object.values(flowMetrics).filter(fm => fm.throughput > 0);
  const avgLatency = activeFlowMetrics.length > 0
    ? Math.round(activeFlowMetrics.reduce((acc, curr) => acc + curr.latency, 0) / activeFlowMetrics.length)
    : 0;

  const counters = [
    { label: 'TOTAL SENT',  value: running ? formatShortNumber(metrics?.totalMessages ?? 0) : '0',  color: 'text-cyan-500' },
    { label: 'ERRORS',      value: running ? (metrics?.errorCount ?? 0).toLocaleString() : '0', color: (metrics?.errorCount ?? 0) > 0 ? 'text-red-500' : 'text-slate-400' },
    { label: 'ACTIVE FLOWS', value: activeFlowMetrics.length.toString(), color: 'text-violet-500' },
    { label: 'AVG LATENCY', value: running && avgLatency > 0 ? `${avgLatency}ms` : '--', color: 'text-emerald-500' },
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
            <span className={`text-sm font-bold ${c.color}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
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
        {bars.length > 0 ? bars.map(b => (
          <div key={b.label} className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--c-tx4)] w-20 shrink-0 text-right" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {b.label}
            </span>
            <div className="flex-1 h-3 bg-[var(--c-bg1)] border border-[var(--c-br2)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${b.color}`}
                style={{ width: `${(b.throughput / maxThroughput) * 100}%`, opacity: b.throughput === 0 ? 0.3 : 1 }}
              />
            </div>
            <span className="text-[10px] text-[var(--c-tx4)] w-20 shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {b.throughput.toLocaleString()} msg/s
            </span>
          </div>
        )) : (
          <div className="flex items-center justify-center h-20 text-[var(--c-tx5)] text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            No technologies detected
          </div>
        )}
      </div>
    </div>
  );
}
