import { describe, it, expect } from 'vitest';
import { defaultConnectorConfig, mergeWithDefaults, validateConnectorConfig } from './connectorFields';
import type { ConnectorFieldDescriptor } from './types';

const field = (overrides: Partial<ConnectorFieldDescriptor> & Pick<ConnectorFieldDescriptor, 'key' | 'type'>): ConnectorFieldDescriptor => ({
  label: overrides.key,
  tooltip: '',
  required: false,
  defaultValue: null,
  placeholder: '',
  options: [],
  ...overrides,
});

const fields: ConnectorFieldDescriptor[] = [
  field({ key: 'host', type: 'TEXT', label: 'Host', required: true }),
  field({ key: 'port', type: 'INTEGER', label: 'Port', defaultValue: 5672, min: 1, max: 65535 }),
  field({ key: 'durable', type: 'BOOLEAN', label: 'Durable', defaultValue: true }),
  field({ key: 'mode', type: 'SELECT', label: 'Mode', defaultValue: 'fast', options: [{ value: 'fast', label: 'Fast' }, { value: 'safe', label: 'Safe' }] }),
  field({ key: 'ratio', type: 'DECIMAL', label: 'Ratio' }),
];

describe('connectorFields', () => {
  it('builds the default configuration', () => {
    expect(defaultConnectorConfig(fields)).toEqual({ port: 5672, durable: true, mode: 'fast' });
  });

  it('completes a saved configuration with the defaults and keeps unknown keys', () => {
    expect(mergeWithDefaults(fields, { host: 'broker', port: '', legacy: 'x' })).toEqual({
      host: 'broker', port: 5672, durable: true, mode: 'fast', legacy: 'x',
    });
    expect(mergeWithDefaults(fields, undefined)).toEqual(defaultConnectorConfig(fields));
  });

  it('accepts a valid configuration', () => {
    expect(validateConnectorConfig(fields, { host: 'broker', port: '1234', ratio: '0.5' })).toEqual({});
  });

  it('reports the same errors as the Core', () => {
    expect(validateConnectorConfig(fields, { host: '  ', port: 70000, durable: 'maybe', mode: 'slow', ratio: 'x' })).toEqual({
      host: 'Host is required',
      port: 'Port must be at most 65535',
      durable: 'Durable must be true or false',
      mode: 'Mode must be one of: fast, safe',
      ratio: 'Ratio must be a number',
    });
    expect(validateConnectorConfig(fields, { host: 'h', port: 1.5 })).toEqual({ port: 'Port must be a whole number' });
    expect(validateConnectorConfig(fields, { host: 'h', port: 0 })).toEqual({ port: 'Port must be at least 1' });
  });
});
