import { describe, expect, it } from 'vitest';
import { normalizeVariableFromCore, normalizeVariableListFromCore } from './variableNormalization';

describe('normalizeVariableFromCore', () => {
  it('lower-cases the scope and maps the legacy date type to temporal', () => {
    const v = normalizeVariableFromCore({ id: 'v1', name: 'when', type: 'date', scope: 'GLOBAL', config: { dateFormat: 'yyyy' } });
    expect(v).toEqual({ id: 'v1', name: 'when', type: 'temporal', scope: 'global', config: { dateFormat: 'yyyy' } });
  });

  it('reads the config from a JSON defaultValue when the config is empty', () => {
    const v = normalizeVariableFromCore({ id: 'v1', name: 'n', type: 'numeric', scope: 'local', config: {}, defaultValue: ' {"min": 3} ' });
    expect(v.config).toEqual({ min: 3 });
  });

  it('keeps an empty config when the defaultValue is not valid JSON', () => {
    const v = normalizeVariableFromCore({ id: 'v1', name: 'n', type: 'numeric', scope: 'local', defaultValue: '{not json}' });
    expect(v.config).toEqual({});
  });

  it('normalizes a list', () => {
    const list = normalizeVariableListFromCore([
      { id: 'a', name: 'a', type: 'string', scope: 'group', config: {} },
    ]);
    expect(list[0].scope).toBe('group');
  });
});
