import { describe, expect, it } from 'vitest';
import { normalizeConnectionStatus, normalizeGroupStatus } from './entityStatus';

describe('normalizeGroupStatus', () => {
  it('keeps known statuses', () => {
    expect(normalizeGroupStatus('running')).toBe('running');
    expect(normalizeGroupStatus('paused')).toBe('paused');
  });

  it('falls back for unknown values', () => {
    expect(normalizeGroupStatus('ok')).toBe('stopped');
    expect(normalizeGroupStatus(undefined)).toBe('stopped');
    expect(normalizeGroupStatus('ok', 'running')).toBe('running');
  });
});

describe('normalizeConnectionStatus', () => {
  it('keeps known statuses and falls back for unknown values', () => {
    expect(normalizeConnectionStatus('warning')).toBe('warning');
    expect(normalizeConnectionStatus('ok')).toBe('disconnected');
    expect(normalizeConnectionStatus(null, 'connected')).toBe('connected');
  });
});
