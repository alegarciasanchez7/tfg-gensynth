/**
 * Formatting helpers for the live flow metrics (FLOWS_METRICS).
 */

import type { FlowMetricsPayload } from './types';
import type { Group } from '../types';

/**
 * Formats a rate (messages per second): `0`, `0.20`, `1.5`, `12`, `1.2K`, `3.4M`.
 */
export function formatRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value >= 10) return Math.round(value).toString();
  if (value >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * Formats a counter: `0`, `999`, `1.2K`, `3.4M`.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toString();
}

/**
 * Live send rate of a group: the sum of its flows' rates.
 */
export function groupRate(group: Pick<Group, 'flows'>, flowMetrics: Record<string, FlowMetricsPayload> | undefined): number {
  if (!flowMetrics) return 0;
  return group.flows.reduce((sum, flow) => sum + (flowMetrics[flow.id]?.throughput ?? 0), 0);
}
