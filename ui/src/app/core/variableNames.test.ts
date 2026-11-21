import { describe, expect, it } from 'vitest';
import type { Variable } from '../types';
import { findVariableNameConflict } from './variableNames';

const variables: Variable[] = [
  { id: 'a', name: 'temp', type: 'numeric', scope: 'local', flowId: 'f1', groupId: 'g1', config: {} },
  { id: 'b', name: 'site', type: 'string', scope: 'group', groupId: 'g1', config: {} },
  { id: 'c', name: 'clock', type: 'temporal', scope: 'global', config: {} },
];

describe('findVariableNameConflict', () => {
  it('rejects a name already used in the same flow, group or global scope', () => {
    expect(findVariableNameConflict(variables, { name: 'temp', scope: 'local', flowId: 'f1', groupId: 'g1' }))
      .toBe('A variable named "temp" already exists in this flow');
    expect(findVariableNameConflict(variables, { name: 'site ', scope: 'group', groupId: 'g1' })).toContain('in this group');
    expect(findVariableNameConflict(variables, { name: 'clock', scope: 'global' })).toContain('as a global variable');
  });

  it('allows the same name in another flow or group, and the variable itself', () => {
    expect(findVariableNameConflict(variables, { name: 'temp', scope: 'local', flowId: 'f2', groupId: 'g1' })).toBeNull();
    expect(findVariableNameConflict(variables, { name: 'site', scope: 'group', groupId: 'g2' })).toBeNull();
    expect(findVariableNameConflict(variables, { id: 'a', name: 'temp', scope: 'local', flowId: 'f1' })).toBeNull();
    expect(findVariableNameConflict(variables, { name: '', scope: 'global' })).toBeNull();
  });
});
