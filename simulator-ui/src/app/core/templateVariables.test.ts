import { describe, expect, it } from 'vitest';
import type { Variable } from '../types';
import { findReachableVariable, findTemplateVariableRefs } from './templateVariables';

const variable = (id: string, name: string, scope: Variable['scope'], extra: Partial<Variable> = {}): Variable => ({
  id, name, scope, type: 'numeric', config: {}, ...extra,
});

const variables: Variable[] = [
  variable('g', 'temperature', 'global'),
  variable('gr', 'temperature', 'group', { groupId: 'g1' }),
  variable('l', 'temperature', 'local', { flowId: 'f1', groupId: 'g1' }),
  variable('other', 'humidity', 'local', { flowId: 'f2', groupId: 'g1' }),
  variable('site', 'site', 'group', { groupId: 'g1' }),
];

describe('templateVariables', () => {
  it('resolves an unscoped name to the closest scope', () => {
    expect(findReachableVariable(variables, 'temperature', null, 'f1', 'g1')?.id).toBe('l');
    expect(findReachableVariable(variables, 'temperature', null, 'f9', 'g1')?.id).toBe('gr');
    expect(findReachableVariable(variables, 'temperature', null, 'f9', 'g9')?.id).toBe('g');
    expect(findReachableVariable(variables, 'temperature', 'global', 'f1', 'g1')?.id).toBe('g');
    expect(findReachableVariable(variables, 'humidity', null, 'f1', 'g1')).toBeUndefined();
  });

  it('lists scoped and unscoped references once, skipping built-ins and unknown names', () => {
    const refs = findTemplateVariableRefs(
      '{"t": {{temperature}}, "r": {{temperature.round}}, "s": "{{site}}", "g": {{global.temperature}}, '
        + '"id": "{{uuid}}", "f": "{{flow.name}}", "h": {{humidity}}, "x": {{typo}}}',
      variables, 'f1', 'g1',
    );
    expect(refs.map(r => r.key)).toEqual(['local.temperature', 'group.site', 'global.temperature']);
  });
});
