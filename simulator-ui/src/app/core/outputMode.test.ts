import { describe, it, expect } from 'vitest';
import { OUTPUT_MODE_OPTIONS, SEQUENTIAL_ORDER_OPTIONS, normalizeOutputMode, normalizeSequentialOrder } from './outputMode';

describe('outputMode', () => {
  it('offers only Sequential and Parallel', () => {
    expect(OUTPUT_MODE_OPTIONS.map((option) => option.value)).toEqual(['sequential', 'parallel']);
  });

  it('keeps sequential and maps legacy or unknown values to parallel', () => {
    expect(normalizeOutputMode('sequential')).toBe('sequential');
    expect(normalizeOutputMode(' Sequential ')).toBe('sequential');
    expect(normalizeOutputMode('parallel')).toBe('parallel');
    expect(normalizeOutputMode('serial')).toBe('parallel');
    expect(normalizeOutputMode('TEXT')).toBe('parallel');
    expect(normalizeOutputMode('round-robin')).toBe('parallel');
    expect(normalizeOutputMode(undefined)).toBe('parallel');
  });

  it('offers the three sequential orders and maps unknown values to flow order', () => {
    expect(SEQUENTIAL_ORDER_OPTIONS.map((option) => option.value)).toEqual(['flow', 'random', 'generated']);
    expect(normalizeSequentialOrder('random')).toBe('random');
    expect(normalizeSequentialOrder(' Generated ')).toBe('generated');
    expect(normalizeSequentialOrder('fifo')).toBe('flow');
    expect(normalizeSequentialOrder(undefined)).toBe('flow');
  });
});
