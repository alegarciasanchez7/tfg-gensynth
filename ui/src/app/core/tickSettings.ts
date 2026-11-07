/**
 * Helpers for the global simulation tick clock settings.
 * Validation rules mirror TickSettings in the Core (integer value >= 1, period <= 24 h).
 */

import type { ProjectSettings, TickMode, TickSettings, TickUnit } from '../types';

export const TICK_MODES: readonly TickMode[] = ['FIXED_RATE', 'AS_FAST_AS_POSSIBLE'];
export const TICK_UNITS: readonly TickUnit[] = ['MILLISECONDS', 'SECONDS', 'MINUTES'];

/** Human-readable labels for the tick units. */
export const TICK_UNIT_LABELS: Record<TickUnit, string> = {
  MILLISECONDS: 'Milliseconds',
  SECONDS: 'Seconds',
  MINUTES: 'Minutes',
};

/** Largest accepted value per unit (24 hours). */
export const TICK_MAX_VALUE_BY_UNIT: Record<TickUnit, number> = {
  MILLISECONDS: 86_400_000,
  SECONDS: 86_400,
  MINUTES: 1_440,
};

export const DEFAULT_TICK_SETTINGS: TickSettings = { mode: 'FIXED_RATE', value: 1, unit: 'SECONDS' };
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = { tick: DEFAULT_TICK_SETTINGS };

/**
 * Validates tick settings. Returns an error message, or null when the settings are valid.
 */
export function validateTickSettings(tick: TickSettings): string | null {
  if (!TICK_MODES.includes(tick.mode)) return `Unknown tick mode: ${tick.mode}`;
  if (!TICK_UNITS.includes(tick.unit)) return `Unknown tick unit: ${tick.unit}`;
  if (!Number.isInteger(tick.value)) return 'The period must be a whole number';
  if (tick.value < 1) return 'The period must be at least 1';
  const max = TICK_MAX_VALUE_BY_UNIT[tick.unit];
  if (tick.value > max) return `The period cannot exceed 24 hours (${max} ${TICK_UNIT_LABELS[tick.unit].toLowerCase()})`;
  return null;
}

/**
 * Normalizes untrusted project settings (from a file or the Core). Invalid or missing
 * values fall back to the defaults, like ProjectSettings.fromPayload in the Core.
 */
export function normalizeProjectSettings(raw: unknown): ProjectSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PROJECT_SETTINGS;
  const tick = (raw as { tick?: unknown }).tick;
  if (typeof tick !== 'object' || tick === null) return DEFAULT_PROJECT_SETTINGS;

  const { mode, value, unit } = tick as Record<string, unknown>;
  if (typeof mode !== 'string' || typeof value !== 'number' || typeof unit !== 'string') {
    return DEFAULT_PROJECT_SETTINGS;
  }
  const candidate: TickSettings = { mode: mode as TickMode, value, unit: unit as TickUnit };
  return validateTickSettings(candidate) === null ? { tick: candidate } : DEFAULT_PROJECT_SETTINGS;
}

export function tickSettingsEqual(a: TickSettings, b: TickSettings): boolean {
  return a.mode === b.mode && a.value === b.value && a.unit === b.unit;
}

/**
 * Short description of the tick settings, e.g. "Every 500 ms" or "As Fast As You Can".
 */
export function describeTickSettings(tick: TickSettings): string {
  if (tick.mode === 'AS_FAST_AS_POSSIBLE') return 'As Fast As You Can';
  const suffix: Record<TickUnit, string> = { MILLISECONDS: 'ms', SECONDS: 's', MINUTES: 'min' };
  return `Every ${tick.value} ${suffix[tick.unit]}`;
}

/**
 * Formats a measured tick rate for the metrics bar.
 */
export function formatTickRate(ticksPerSecond: number): string {
  if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) return '0';
  if (ticksPerSecond >= 1_000_000) return `${(ticksPerSecond / 1_000_000).toFixed(1)}M`;
  if (ticksPerSecond >= 1_000) return `${(ticksPerSecond / 1_000).toFixed(1)}K`;
  if (ticksPerSecond >= 10) return Math.round(ticksPerSecond).toString();
  if (ticksPerSecond >= 1) return ticksPerSecond.toFixed(2);
  return ticksPerSecond.toFixed(3);
}
