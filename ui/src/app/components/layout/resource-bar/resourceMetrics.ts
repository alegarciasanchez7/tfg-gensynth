import type { MetricsPayload } from '../../../core/types';
import { formatTickRate } from '../../../core/tickSettings';
import { formatRate } from '../../../core/metricsFormat';

/** Label of a metric of the resource bar (also its key). */
export type MetricLabel = 'CPU' | 'RAM' | 'NET↑' | 'NET↓' | 'MSG/S' | 'TICK' | 'UPTIME';

/** One metric of the resource bar, ready to render. */
export interface ResourceMetric {
  label: MetricLabel;
  value: string;
  unit: string;
  color: string;
  barPct?: number;
  title?: string;
}

/** A byte rate with a binary unit (B/s, KB/s, MB/s, GB/s), one decimal at most. */
export function formatBytes(bytes: number): { value: string; unit: string } {
  if (bytes === 0) return { value: '0.0', unit: 'B/s' };
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return {
    value: Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)).toString(),
    unit: sizes[i],
  };
}

/** Uptime as hh:mm:ss, or --:--:-- when there is none. */
export function formatUptime(seconds: number): string {
  if (!seconds) return '--:--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** A count shortened with K or M. */
export function formatShortNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + ' M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + ' K';
  }
  return num.toString();
}

/** Bar colour: red above 80 %, amber above 50 %, otherwise the colour of the metric. */
export function barColorClass(barPct: number, textColor: string): string {
  if (barPct > 80) return 'bg-red-500';
  if (barPct > 50) return 'bg-amber-500';
  return textColor.replace('text-', 'bg-');
}

/** The live value while the simulation runs, the idle one otherwise. */
function liveOr<T>(running: boolean, live: T, idle: T): T {
  return running ? live : idle;
}

/** The metrics shown by the resource bar; all of them read as idle while the simulation is stopped. */
export function buildResourceMetrics(metrics: MetricsPayload | null | undefined, running: boolean): ResourceMetric[] {
  const cpuValue = metrics?.cpu ?? 0;
  const memoryValue = metrics?.memory ?? 0;
  // The RAM bar is measured against the most the JVM may use, a fixed limit; the reserved heap
  // (older cores) grows on demand, so a full bar against it says nothing
  const memoryLimit = metrics?.maxHeap || metrics?.heap || 1;
  const networkUp = metrics?.networkUp ?? 0;
  const networkDown = metrics?.networkDown ?? 0;
  const msgs = metrics?.messagesPerSecond ?? 0;
  const totalMsgs = metrics?.totalMessages ?? 0;
  const uptime = metrics?.uptime ?? 0;
  const ticksPerSecond = metrics?.ticksPerSecond ?? 0;
  const totalTicks = metrics?.totalTicks ?? 0;

  const formattedNetUp = formatBytes(networkUp);
  const formattedNetDown = formatBytes(networkDown);

  const memoryPct = Math.min(100, (memoryValue / memoryLimit) * 100);

  return [
    {
      label: 'CPU',
      value: liveOr(running, cpuValue.toFixed(1), '0.0'),
      unit: '%',
      color: liveOr(running, 'text-cyan-500', 'text-slate-400'),
      barPct: liveOr(running, Math.min(100, cpuValue), 0),
      title: "Share of the computer's whole CPU (all cores) used by GenSynth",
    },
    {
      label: 'RAM',
      value: liveOr(running, memoryValue.toString(), '0'),
      unit: 'MB',
      color: liveOr(running, 'text-violet-500', 'text-slate-400'),
      barPct: liveOr(running, memoryPct, 0),
      title: `Memory used by GenSynth out of the most it may use (${memoryLimit} MB)`,
    },
    {
      label: 'NET↑',
      value: liveOr(running, formattedNetUp.value, '0.0'),
      unit: formattedNetUp.unit,
      color: liveOr(running, 'text-emerald-500', 'text-slate-400'),
    },
    {
      label: 'NET↓',
      value: liveOr(running, formattedNetDown.value, '0.0'),
      unit: formattedNetDown.unit,
      color: liveOr(running, 'text-sky-500', 'text-slate-400'),
    },
    {
      label: 'MSG/S',
      // Compact like the flow rates (18.4K), never locale separators: "18.441" read as 18 msg/s
      value: liveOr(running, formatRate(msgs), '0'),
      unit: liveOr(running, `(${formatShortNumber(totalMsgs)} total)`, ''),
      color: liveOr(running, 'text-amber-500', 'text-slate-400'),
    },
    {
      label: 'TICK',
      value: liveOr(running, formatTickRate(ticksPerSecond), '0'),
      unit: liveOr(running, `/s (${formatShortNumber(totalTicks)} total)`, ''),
      color: liveOr(running, 'text-fuchsia-500', 'text-slate-400'),
    },
    {
      label: 'UPTIME',
      value: liveOr(running, formatUptime(uptime), '--:--:--'),
      unit: '',
      color: liveOr(running, 'text-slate-500', 'text-slate-400'),
    },
  ];
}
