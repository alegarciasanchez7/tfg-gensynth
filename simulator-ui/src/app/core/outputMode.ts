/**
 * Group output modes. Mirrors OutputMode in the Core.
 */

import type { OutputMode } from '../types';

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
