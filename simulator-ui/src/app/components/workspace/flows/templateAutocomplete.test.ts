import { describe, expect, it } from 'vitest';
import { filterAutocompleteOptions } from './templateAutocomplete';

const options = [
  { name: 'uuid', scope: 'system' },
  { name: 'ts', scope: 'system' },
  { name: 'flow.name', scope: 'system' },
  { name: 'site', scope: 'group' },
  { name: 'temperature', scope: 'local' },
  { name: 'temperature.round', scope: 'local' },
];

const names = (query: string) => filterAutocompleteOptions(options, query).map(o => o.name);

describe('filterAutocompleteOptions', () => {
  it('does not match built-ins through the word "system"', () => {
    expect(names('te')).toEqual(['temperature', 'temperature.round', 'site']);
  });

  it('puts prefix matches before substring matches', () => {
    expect(names('s')).toEqual(['site', 'ts']);
    expect(names('round')).toEqual(['temperature.round']);
  });

  it('matches the inserted reference (scope.name) and keeps everything for an empty query', () => {
    expect(names('local.temp')).toEqual(['temperature', 'temperature.round']);
    expect(names('')).toHaveLength(options.length);
  });
});
