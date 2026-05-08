import { Cpu, MemoryStick, ArrowUpRight, ArrowDownLeft, Server, Clock4 } from 'lucide-react';
import { useSystemStatus, useMetrics } from '../../../context';

interface Metric {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  color: string;
  barPct?: number;
}

function formatBytes(bytes: number): { value: string; unit: string } {
  if (bytes === 0) return { value: '0.0', unit: 'B/s' };
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return {
    value: parseFloat((bytes / Math.pow(k, i)).toFixed(1)).toString(),
    unit: sizes[i],
  };
}

function formatUptime(seconds: number): string {
  if (!seconds) return '--:--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatShortNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + ' M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + ' K';
  }
  return num.toString();
}

export function ResourceBar() {
  const systemStatus = useSystemStatus();
  const { metrics } = useMetrics();
  const running = systemStatus === 'running';

  const cpuValue = metrics?.cpu ?? 0;
  const memoryValue = metrics?.memory ?? 0;
  const heapValue = metrics?.heap ?? 1; // avoid division by zero
  const networkUp = metrics?.networkUp ?? 0;
  const networkDown = metrics?.networkDown ?? 0;
  const msgs = metrics?.messagesPerSecond ?? 0;
  const totalMsgs = metrics?.totalMessages ?? 0;
  const uptime = metrics?.uptime ?? 0;

  const formattedNetUp = formatBytes(networkUp);
  const formattedNetDown = formatBytes(networkDown);

  const memoryPct = Math.min(100, (memoryValue / heapValue) * 100);

  const uiMetrics: Metric[] = [
    {
      icon: <Cpu size={11} />,
      label: 'CPU',
      value: running ? cpuValue.toFixed(1) : '0.0',
      unit: '%',
      color: running ? 'text-cyan-500' : 'text-slate-400',
      barPct: running ? Math.min(100, cpuValue) : 0,
    },
    {
      icon: <MemoryStick size={11} />,
      label: 'RAM',
      value: running ? memoryValue.toString() : '0',
      unit: 'MB',
      color: running ? 'text-violet-500' : 'text-slate-400',
      barPct: running ? memoryPct : 0,
    },
    {
      icon: <ArrowUpRight size={11} />,
      label: 'NET↑',
      value: running ? formattedNetUp.value : '0.0',
      unit: formattedNetUp.unit,
      color: running ? 'text-emerald-500' : 'text-slate-400',
    },
    {
      icon: <ArrowDownLeft size={11} />,
      label: 'NET↓',
      value: running ? formattedNetDown.value : '0.0',
      unit: formattedNetDown.unit,
      color: running ? 'text-sky-500' : 'text-slate-400',
    },
    {
      icon: <Server size={11} />,
      label: 'MSG/S',
      value: running ? `${msgs.toLocaleString()}` : '0',
      unit: running ? `(${formatShortNumber(totalMsgs)} total)` : '',
      color: running ? 'text-amber-500' : 'text-slate-400',
    },
    {
      icon: <Clock4 size={11} />,
      label: 'UPTIME',
      value: running ? formatUptime(uptime) : '--:--:--',
      unit: '',
      color: running ? 'text-slate-500' : 'text-slate-400',
    },
  ];

  return (
    <div
      className="flex items-center gap-0 px-4 border-b border-[var(--c-br2)] bg-[var(--c-bg2)] shrink-0 overflow-x-auto"
      style={{ height: 34 }}
    >
      {uiMetrics.map((m, i) => (
        <div key={i} className="flex items-center gap-3 pr-4 mr-4 border-r border-[var(--c-br2)] last:border-r-0">
          <div className="flex items-center gap-1.5">
            <span className={`${m.color} opacity-70`}>{m.icon}</span>
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
            <div className="w-12 h-1 bg-[var(--c-br2)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${m.barPct > 80 ? 'bg-red-500' : m.barPct > 50 ? 'bg-amber-500' : m.color.replace('text-', 'bg-')
                  }`}
                style={{ width: `${m.barPct}%` }}
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex-1" />

      <div className="text-[10px] text-[var(--c-tx5)] tracking-wider" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        GenSynth 0.5.0-alpha
      </div>
    </div>
  );
}
