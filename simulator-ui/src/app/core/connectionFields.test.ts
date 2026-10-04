import { describe, it, expect } from 'vitest';
import { deriveConnectionFields } from './connectionFields';

describe('deriveConnectionFields', () => {
  it('reads host, port and topic using the connector key aliases', () => {
    expect(deriveConnectionFields({ host: 'rabbit', port: 5672, exchange: 'ex' })).toEqual({ host: 'rabbit', port: 5672, topic: 'ex' });
    expect(deriveConnectionFields({ bootstrapServers: 'kafka:9092', topic: 'events' })).toEqual({ host: 'kafka:9092', topic: 'events' });
    expect(deriveConnectionFields({ endpoint: 'http://x', queue: 'q' })).toEqual({ host: 'http://x', topic: 'q' });
  });

  it('only returns the fields the config defines', () => {
    expect(deriveConnectionFields({ outputDir: './out', format: 'json' })).toEqual({});
    expect(deriveConnectionFields({ host: '', port: 'abc' })).toEqual({});
  });
});
