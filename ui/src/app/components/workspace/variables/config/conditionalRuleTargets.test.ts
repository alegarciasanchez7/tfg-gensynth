import { describe, expect, it } from 'vitest';
import type { Flow, Group, Variable } from '../../../../types';
import { ruleTargetNames } from './conditionalRuleTargets';

const flow = (id: string) => ({ id }) as Flow;
const groups = [
  { id: 'g1', flows: [flow('f1'), flow('f2')] },
  { id: 'g2', flows: [flow('f3')] },
] as Group[];

const variable = (name: string, scope: Variable['scope'], extra: Partial<Variable> = {}): Variable =>
  ({ id: name, name, type: 'numeric', scope, config: {}, ...extra });

const variables: Variable[] = [
  variable('owner', 'local', { flowId: 'f1' }),
  variable('localF1', 'local', { flowId: 'f1' }),
  variable('localF2', 'local', { flowId: 'f2' }),
  variable('localF3', 'local', { flowId: 'f3' }),
  variable('groupG1', 'group', { groupId: 'g1' }),
  variable('groupG2', 'group', { groupId: 'g2' }),
  variable('global', 'global'),
];

describe('ruleTargetNames', () => {
  it('returns nothing without variables', () => {
    expect(ruleTargetNames(undefined, groups, {})).toEqual([]);
  });

  it('lets a local variable target its flow, its group and the globals, never itself', () => {
    expect(ruleTargetNames(variables, groups, { variableScope: 'local', flowId: 'f1', currentVariableName: 'owner' }))
      .toEqual(['localF1', 'groupG1', 'global']);
  });

  it('lets a group variable target its group and the globals, never the locals of its flows', () => {
    expect(ruleTargetNames(variables, groups, { variableScope: 'group', groupId: 'g1' }))
      .toEqual(['groupG1', 'global']);
  });

  it('finds the group of a local variable from its flow', () => {
    expect(ruleTargetNames(variables, groups, { variableScope: 'local', flowId: 'f3' }))
      .toEqual(['localF3', 'groupG2', 'global']);
  });

  it('only sees globals when the owner has no flow or group', () => {
    expect(ruleTargetNames(variables, undefined, { variableScope: 'local' })).toEqual(['global']);
    expect(ruleTargetNames(variables, groups, { variableScope: 'group' })).toEqual(['global']);
  });

  it('lets a global variable target only the other globals', () => {
    const withAnotherGlobal = [...variables, variable('otherGlobal', 'global')];
    expect(ruleTargetNames(withAnotherGlobal, groups, { variableScope: 'global', currentVariableName: 'global' }))
      .toEqual(['otherGlobal']);
  });

  it('lets an unknown scope target everything', () => {
    expect(ruleTargetNames(variables, groups, {})).toEqual(variables.map(v => v.name));
  });
});
