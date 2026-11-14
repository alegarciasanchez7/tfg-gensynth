import { describe, expect, it } from 'vitest';
import {
  dropZoneStateClass,
  notAJarResult,
  requestFailedResult,
  validationIdentity,
  withUniqueKeys,
} from './pluginImportHelpers';

describe('validationIdentity', () => {
  it('uses the typed name and version, trimmed', () => {
    expect(validationIdentity('kafka.jar', '  My Kafka ', ' 2.0.1 ')).toEqual({ name: 'My Kafka', version: '2.0.1' });
  });

  it('falls back to the file name without .jar and to version 1.0.0', () => {
    expect(validationIdentity('mqtt-connector.jar', '   ', '')).toEqual({ name: 'mqtt-connector', version: '1.0.0' });
  });
});

describe('validation results', () => {
  it('rejects files that are not a .jar', () => {
    expect(notAJarResult()).toEqual({
      status: 'error',
      valid: false,
      logs: [{ level: 'ERROR', message: 'Only .jar files are accepted.', context: 'Validation' }],
    });
  });

  it('reports a failed validation request', () => {
    const result = requestFailedResult();
    expect(result.valid).toBe(false);
    expect(result.logs).toEqual([{ level: 'ERROR', message: 'Validation request failed. Is the backend running?' }]);
  });

  it('returns a new object every time', () => {
    expect(notAJarResult()).not.toBe(notAJarResult());
  });
});

describe('withUniqueKeys', () => {
  it('gives repeated entries different keys, keeping the order', () => {
    const entry = { level: 'WARN' as const, message: 'same' };
    const keyed = withUniqueKeys([entry, { level: 'INFO', message: 'other', context: 'ctx' }, entry]);
    expect(keyed.map(k => k.entry)).toEqual([entry, { level: 'INFO', message: 'other', context: 'ctx' }, entry]);
    expect(new Set(keyed.map(k => k.key)).size).toBe(3);
  });
});

describe('dropZoneStateClass', () => {
  it('prefers dragging, then validating, success, picked file and idle', () => {
    expect(dropZoneStateClass(true, 'success', 'a.jar')).toContain('border-cyan-400');
    expect(dropZoneStateClass(false, 'validating', 'a.jar')).toContain('border-amber-400/50');
    expect(dropZoneStateClass(false, 'success', 'a.jar')).toContain('border-emerald-500/40');
    expect(dropZoneStateClass(false, 'error', 'a.jar')).toBe('border-[var(--c-br2)] bg-[var(--c-bg1)]');
    expect(dropZoneStateClass(false, 'idle', null)).toContain('hover:bg-[var(--c-bg5)]');
  });
});
