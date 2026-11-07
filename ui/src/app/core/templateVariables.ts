import type { Variable, VariableScope } from '../types';
import { findTemplatePlaceholders, isSystemPlaceholder } from './templatePlaceholders';

const SCOPES: readonly VariableScope[] = ['local', 'group', 'global'];

/** Whether a variable can be reached from the flow `flowId` of the group `groupId`. */
function isReachable(variable: Variable, flowId: string, groupId: string): boolean {
  if (variable.scope === 'local') return variable.flowId === flowId;
  if (variable.scope === 'group') return variable.groupId === groupId;
  return variable.scope === 'global';
}

/**
 * Finds the variable a flow reaches by name, like TemplateEngine.findAccessibleVariable in the Core:
 * with a scope, only that scope; without one, the closest scope wins (LOCAL, then GROUP, then GLOBAL).
 */
export function findReachableVariable(
  variables: readonly Variable[],
  name: string,
  scope: VariableScope | null,
  flowId: string,
  groupId: string,
): Variable | undefined {
  const scopes = scope ? [scope] : SCOPES;
  for (const candidateScope of scopes) {
    const match = variables.find(v => v.name === name && v.scope === candidateScope && isReachable(v, flowId, groupId));
    if (match) return match;
  }
  return undefined;
}

/** A variable referenced by a template placeholder. */
export interface TemplateVariableRef {
  scope: VariableScope;
  name: string;
  /** `scope.name`, unique per variable. */
  key: string;
}

/**
 * Variables referenced by a template, in order of first use and without repetitions.
 * `{{scope.name...}}` placeholders are listed as written; `{{name...}}` placeholders are resolved to
 * the closest reachable variable and left out when no variable has that name. Sub-properties
 * (`{{temperature.round}}`) count as a use of the variable; built-ins (`{{uuid}}`) are skipped.
 */
export function findTemplateVariableRefs(
  template: string,
  variables: readonly Variable[],
  flowId: string,
  groupId: string,
): TemplateVariableRef[] {
  const refs: TemplateVariableRef[] = [];
  const seen = new Set<string>();
  for (const placeholder of findTemplatePlaceholders(template)) {
    const spec = placeholder.spec.trim();
    if (!spec || isSystemPlaceholder(spec)) continue;
    const parts = spec.split('.');
    const explicitScope = SCOPES.find(s => s === parts[0].toLowerCase()) ?? null;
    let ref: TemplateVariableRef | null = null;
    if (explicitScope) {
      const name = parts[1]?.trim();
      if (name) ref = { scope: explicitScope, name, key: `${explicitScope}.${name}` };
    } else {
      const variable = findReachableVariable(variables, parts[0].trim(), null, flowId, groupId);
      if (variable) ref = { scope: variable.scope, name: variable.name, key: `${variable.scope}.${variable.name}` };
    }
    if (ref && !seen.has(ref.key)) {
      seen.add(ref.key);
      refs.push(ref);
    }
  }
  return refs;
}
