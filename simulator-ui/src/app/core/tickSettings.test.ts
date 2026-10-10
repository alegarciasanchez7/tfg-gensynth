import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_SETTINGS,
  describeTickSettings,
  formatTickRate,
  normalizeProjectSettings,
  tickSettingsEqual,
  validateTickSettings,
} from './tickSettings';
import type { TickSettings } from '../types';

const fixed = (value: number, unit: TickSettings['unit'] = 'SECONDS'): TickSettings => ({ mode: 'FIXED_RATE', value, unit });

describe('tickSettings', () => {
  it('defaults to one tick per second', () => {
    expect(DEFAULT_PROJECT_SETTINGS.tick).toEqual({ mode: 'FIXED_RATE', value: 1, unit: 'SECONDS' });
  });

  it('accepts valid settings', () => {
    expect(validateTickSettings(fixed(1, 'MILLISECONDS'))).toBeNull();
    expect(validateTickSettings(fixed(1440, 'MINUTES'))).toBeNull();
    expect(validateTickSettings({ mode: 'AS_FAST_AS_POSSIBLE', value: 1, unit: 'SECONDS' })).toBeNull();
  });

  it('rejects values that are not whole, below 1 or above 24 hours', () => {
    expect(validateTickSettings(fixed(0))).toMatch(/at least 1/);
    expect(validateTickSettings(fixed(-3))).toMatch(/at least 1/);
    expect(validateTickSettings(fixed(1.5))).toMatch(/whole number/);
    expect(validateTickSettings(fixed(Number.NaN))).toMatch(/whole number/);
    expect(validateTickSettings(fixed(1441, 'MINUTES'))).toMatch(/24 hours/);
    expect(validateTickSettings(fixed(86_400_001, 'MILLISECONDS'))).toMatch(/24 hours/);
  });

  it('normalizes untrusted settings, falling back to the defaults', () => {
    expect(normalizeProjectSettings(undefined)).toEqual(DEFAULT_PROJECT_SETTINGS);
    expect(normalizeProjectSettings('fast')).toEqual(DEFAULT_PROJECT_SETTINGS);
    expect(normalizeProjectSettings({ tick: { mode: 'SOMETIMES', value: 1, unit: 'SECONDS' } })).toEqual(DEFAULT_PROJECT_SETTINGS);
    expect(normalizeProjectSettings({ tick: { mode: 'FIXED_RATE', value: '5', unit: 'SECONDS' } })).toEqual(DEFAULT_PROJECT_SETTINGS);
    expect(normalizeProjectSettings({ tick: fixed(250, 'MILLISECONDS') })).toEqual({ tick: fixed(250, 'MILLISECONDS') });
  });

  it('compares tick settings by value', () => {
    expect(tickSettingsEqual(fixed(5), fixed(5))).toBe(true);
    expect(tickSettingsEqual(fixed(5), fixed(5, 'MINUTES'))).toBe(false);
    expect(tickSettingsEqual(fixed(5), { ...fixed(5), mode: 'AS_FAST_AS_POSSIBLE' })).toBe(false);
  });

  it('describes the tick settings', () => {
    expect(describeTickSettings(fixed(500, 'MILLISECONDS'))).toBe('Every 500 ms');
    expect(describeTickSettings(fixed(2, 'MINUTES'))).toBe('Every 2 min');
    expect(describeTickSettings({ mode: 'AS_FAST_AS_POSSIBLE', value: 1, unit: 'SECONDS' })).toBe('As Fast As You Can');
  });

  it('formats measured tick rates compactly', () => {
    expect(formatTickRate(0)).toBe('0');
    expect(formatTickRate(Number.NaN)).toBe('0');
    expect(formatTickRate(0.5)).toBe('0.500');
    expect(formatTickRate(1)).toBe('1.00');
    expect(formatTickRate(42.4)).toBe('42');
    expect(formatTickRate(12_345)).toBe('12.3K');
    expect(formatTickRate(2_500_000)).toBe('2.5M');
  });
});
