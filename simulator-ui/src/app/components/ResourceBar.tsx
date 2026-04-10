import { Cpu, MemoryStick, ArrowUpRight, ArrowDownLeft, Server, Clock4 } from 'lucide-react';
import type { SystemStatus } from '../types';

interface Metric {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  color: string;
  barPct?: number;
}

interface ResourceBarProps {
  systemStatus: SystemStatus;
}

export function ResourceBar({ systemStatus }: ResourceBarProps) {
  const running = systemStatus === 'running';

  const metrics: Metric[] = [
    {
      icon: <Cpu size={11} />,
      label: 'CPU',
      value: running ? '14.2' : '0.4',
      unit: '%',
      color: running ? 'text-cyan-500' : 'text-slate-400',
      barPct: running ? 14 : 1,
    },
    {
      icon: <MemoryStick size={11} />,
      label: 'RAM',
      value: running ? '312' : '48',
      unit: 'MB',
      color: running ? 'text-violet-500' : 'text-slate-400',
      barPct: running ? 38 : 6,
    },
    {
      icon: <ArrowUpRight size={11} />,
      label: 'NET↑',
      value: running ? '4.8' : '0.0',
      unit: 'MB/s',
      color: running ? 'text-emerald-500' : 'text-slate-400',
    },
    {
      icon: <ArrowDownLeft size={11} />,
      label: 'NET↓',
      value: running ? '0.2' : '0.0',
      unit: 'KB/s',
      color: running ? 'text-sky-500' : 'text-slate-400',
    },
    {
      icon: <Server size={11} />,
      label: 'MSG/S',
      value: running ? '4,950' : '0',
      unit: '',
      color: running ? 'text-amber-500' : 'text-slate-400',
    },
    {
      icon: <Clock4 size={11} />,
      label: 'UPTIME',
      value: running ? '00:08:43' : '--:--:--',
      unit: '',
      color: running ? 'text-slate-500' : 'text-slate-400',
    },
  ];

  return (
    <div
      className="flex items-center gap-0 px-4 border-b border-[var(--c-br2)] bg-[var(--c-bg2)] shrink-0 overflow-x-auto"
      style={{ height: 34 }}
    >
      {metrics.map((m, i) => (
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
                className={`h-full rounded-full transition-all duration-1000 ${
                  m.barPct > 80 ? 'bg-red-500' : m.barPct > 50 ? 'bg-amber-500' : m.color.replace('text-', 'bg-')
                }`}
                style={{ width: `${m.barPct}%` }}
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex-1" />

      <div className="text-[10px] text-[var(--c-tx5)] tracking-wider" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        SYN·GEN v0.9.1-alpha
      </div>
    </div>
  );
}
