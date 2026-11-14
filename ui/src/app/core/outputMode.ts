/**
 * Group output modes and the order of sequential groups. Mirror OutputMode and SequentialOrder in the Core.
 */

import type { OutputMode, SequentialOrder } from '../types';

export const OUTPUT_MODE_OPTIONS: readonly { value: OutputMode; label: string }[] = [
  { value: 'sequential', label: 'Sequential' },
  { value: 'parallel', label: 'Parallel' },
];

/**
 * Normalizes an untrusted output mode (files, older cores). Only "sequential" is kept;
 * legacy or unknown values ("serial", "TEXT", "round-robin") become "parallel", like the Core.
 */
export function normalizeOutputMode(raw: unknown): OutputMode {
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'sequential' ? 'sequential' : 'parallel';
}

export const SEQUENTIAL_ORDER_OPTIONS: readonly { value: SequentialOrder; label: string; hint: string }[] = [
  { value: 'flow', label: 'Flow order', hint: 'Messages of a tick are sent in the order of the flow list below.' },
  { value: 'random', label: 'Random', hint: 'Messages of a tick are sent in a new random order every tick.' },
  { value: 'generated', label: 'First generated', hint: 'Flows generate at the same time; each message is sent as soon as it is ready.' },
];

/**
 * Normalizes an untrusted sequential order (files, older cores): unknown or missing values
 * become "flow", like the Core.
 */
export function normalizeSequentialOrder(raw: unknown): SequentialOrder {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'random' || value === 'generated' ? value : 'flow';
}
