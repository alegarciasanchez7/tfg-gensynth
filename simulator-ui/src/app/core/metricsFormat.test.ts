import { describe, it, expect } from 'vitest';
import { formatCount, formatRate, groupRate } from './metricsFormat';
import type { FlowMetricsPayload } from './types';

const metrics = (flowId: string, throughput: number): FlowMetricsPayload => ({
  flowId,
  groupId: 'g1',
  throughput,
  generated: 0,
  sent: 0,
  failed: 0,
  latency: 0,
  errorRate: 0,
  connectionStatus: 'connected',
});

describe('metricsFormat', () => {
  it('formats rates with a precision that fits their size', () => {
    expect(formatRate(0)).toBe('0');
    expect(formatRate(Number.NaN)).toBe('0');
    expect(formatRate(0.2)).toBe('0.20');
    expect(formatRate(0.0166)).toBe('0.02');
    expect(formatRate(1.5)).toBe('1.5');
    expect(formatRate(12.4)).toBe('12');
    expect(formatRate(1234)).toBe('1.2K');
    expect(formatRate(3_400_000)).toBe('3.4M');
  });

  it('formats counters compactly', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1200)).toBe('1.2K');
    expect(formatCount(3_400_000)).toBe('3.4M');
  });

  it('sums the rates of the flows of a group', () => {
    const group = { flows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } as Parameters<typeof groupRate>[0];
    expect(groupRate(group, { a: metrics('a', 1.5), b: metrics('b', 0.5) })).toBe(2);
    expect(groupRate(group, undefined)).toBe(0);
  });
});
