import { describe, expect, it } from 'vitest';
import type { Variable } from '../types';
import { normalizeVariableFromCore, normalizeVariableListFromCore, withChangedVariable } from './variableNormalization';

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

describe('withChangedVariable', () => {
  const speed: Variable = { id: 'v1', name: 'speed', type: 'numeric', scope: 'global', config: { min: 0, max: 10 } };
  const label: Variable = { id: 'v2', name: 'label', type: 'string', scope: 'global', config: {} };

  it('replaces the variable with the same id and keeps the order', () => {
    const changed: Variable = { ...speed, name: 'speed_kmh', config: { min: 0, max: 120 } };

    const list = withChangedVariable([speed, label], changed);

    expect(list).toEqual([changed, label]);
  });

  it('keeps the objects of the other variables, so they do not render again', () => {
    const list = withChangedVariable([speed, label], { ...speed, name: 'renamed' });

    expect(list[1]).toBe(label);
  });

  it('adds a variable the list does not have at the end', () => {
    const list = withChangedVariable([speed], label);

    expect(list).toEqual([speed, label]);
  });

  it('does not change the list it was given', () => {
    const original = [speed, label];

    withChangedVariable(original, { ...speed, name: 'renamed' });

    expect(original[0]).toBe(speed);
    expect(original).toHaveLength(2);
  });
});
