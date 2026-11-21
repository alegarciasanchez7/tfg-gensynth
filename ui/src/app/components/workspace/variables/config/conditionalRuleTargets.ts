import type { Group, Variable, VariableScope } from '../../../../types';

/** Where the variable that owns the conditional rules lives. */
export interface RuleOwnerContext {
  variableScope?: VariableScope;
  currentVariableName?: string;
  flowId?: string;
  groupId?: string;
}

/** Whether a variable is visible from a local variable of the flow (or its group). */
function visibleFromLocal(v: Variable, flowId: string | undefined, effectiveGroupId: string | undefined): boolean {
  if (v.scope === 'local') return Boolean(flowId) && v.flowId === flowId;
  if (v.scope === 'group') return Boolean(effectiveGroupId) && v.groupId === effectiveGroupId;
  return v.scope === 'global';
}

/**
 * Whether a variable is visible from a group variable: the group and the globals. A group
 * variable gives the same value to every flow on each tick, so it cannot read their locals.
 */
function visibleFromGroup(v: Variable, effectiveGroupId: string | undefined): boolean {
  if (v.scope === 'group') return Boolean(effectiveGroupId) && v.groupId === effectiveGroupId;
  return v.scope === 'global';
}

/**
 * Names of the variables a conditional rule may target, following the scope rules: a local
 * variable sees its flow's locals, its group and the globals; a group variable sees its group and
 * the globals; a global variable sees only the globals (GROUP and GLOBAL variables give one value
 * per tick to every flow, so they cannot read the variables of one flow). An unknown scope sees
 * everything. The owner itself is never a target.
 */
export function ruleTargetNames(
  variables: Variable[] | undefined,
  groups: Group[] | undefined,
  { variableScope, currentVariableName, flowId, groupId }: RuleOwnerContext,
): string[] {
  if (!variables) return [];

  const srcGroup = groups?.find(g =>
    (groupId && g.id === groupId) ||
    (flowId && g.flows.some(f => f.id === flowId))
  );
  const effectiveGroupId = groupId || srcGroup?.id;

  return variables
    .filter(v => {
      if (currentVariableName && v.name === currentVariableName) return false;
      if (variableScope === 'local') return visibleFromLocal(v, flowId, effectiveGroupId);
      if (variableScope === 'group') return visibleFromGroup(v, effectiveGroupId);
      if (variableScope === 'global') return v.scope === 'global';
      return true;
    })
    .map(v => v.name);
}
