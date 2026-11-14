import { describe, expect, it } from 'vitest';
import type { MetricsPayload } from '../../../core/types';
import { barColorClass, buildResourceMetrics, formatBytes, formatShortNumber, formatUptime } from './resourceMetrics';

const sample = {
  cpu: 12.345, memory: 600, heap: 1024, maxHeap: 2000, networkUp: 2048, networkDown: 0, messagesPerSecond: 10,
  totalMessages: 1500, uptime: 3725, ticksPerSecond: 4, totalTicks: 2_500_000,
} as MetricsPayload;

describe('resource bar formatting', () => {
  it('formats byte rates with binary units', () => {
    expect(formatBytes(0)).toEqual({ value: '0.0', unit: 'B/s' });
    expect(formatBytes(512)).toEqual({ value: '512', unit: 'B/s' });
    expect(formatBytes(1536)).toEqual({ value: '1.5', unit: 'KB/s' });
    expect(formatBytes(3 * 1024 * 1024)).toEqual({ value: '3', unit: 'MB/s' });
  });

  it('formats the uptime as hh:mm:ss', () => {
    expect(formatUptime(0)).toBe('--:--:--');
    expect(formatUptime(3725)).toBe('01:02:05');
  });

  it('shortens big counts', () => {
    expect(formatShortNumber(999)).toBe('999');
    expect(formatShortNumber(1500)).toBe('1.5 K');
    expect(formatShortNumber(2_500_000)).toBe('2.50 M');
  });

  it('colours the bar by load', () => {
    expect(barColorClass(81, 'text-cyan-500')).toBe('bg-red-500');
    expect(barColorClass(51, 'text-cyan-500')).toBe('bg-amber-500');
    expect(barColorClass(50, 'text-cyan-500')).toBe('bg-cyan-500');
  });
});

describe('buildResourceMetrics', () => {
  it('lists every metric in order', () => {
    expect(buildResourceMetrics(sample, true).map(m => m.label)).toEqual(['CPU', 'RAM', 'NET↑', 'NET↓', 'MSG/S', 'TICK', 'UPTIME']);
  });

  it('shows the live values while running', () => {
    const [cpu, ram, up, down, msgs, ticks, uptime] = buildResourceMetrics(sample, true);
    expect(cpu).toMatchObject({ value: '12.3', unit: '%', color: 'text-cyan-500', barPct: 12.345 });
    expect(ram).toMatchObject({ value: '600', unit: 'MB', barPct: 30 });
    expect(ram.title).toContain('(2000 MB)');
    expect(up).toMatchObject({ value: '2', unit: 'KB/s' });
    expect(down).toMatchObject({ value: '0.0', unit: 'B/s' });
    expect(msgs).toMatchObject({ unit: '(1.5 K total)', color: 'text-amber-500' });
    expect(ticks).toMatchObject({ unit: '/s (2.50 M total)', color: 'text-fuchsia-500' });
    expect(uptime).toMatchObject({ value: '01:02:05', color: 'text-slate-500' });
  });

  it('measures the RAM against the reserved heap when the core sends no limit', () => {
    const [, ram] = buildResourceMetrics({ ...sample, maxHeap: undefined }, true);
    expect(ram.barPct).toBeCloseTo((600 / 1024) * 100);
  });

  it('shows idle values while stopped or without metrics', () => {
    for (const metrics of [sample, null]) {
      const list = buildResourceMetrics(metrics, false);
      expect(list.every(m => m.color === 'text-slate-400')).toBe(true);
      expect(list.map(m => m.value)).toEqual(['0.0', '0', '0.0', '0.0', '0', '0', '--:--:--']);
      expect(list[0].barPct).toBe(0);
      expect(list[4].unit).toBe('');
    }
  });

  it('caps the CPU bar at 100 %', () => {
    expect(buildResourceMetrics({ ...sample, cpu: 140 }, true)[0].barPct).toBe(100);
  });
});
