import type { Variable } from '../../../types';
import { brokenReferenceErrors, formulaDependencies, formulaOf } from '../../../context/actions/startValidation';

/** Whether the formula dependency graph has a cycle reachable from the given variable. */
export function hasFormulaCycleFrom(variables: Variable[], start: Variable): boolean {
  const adjList = new Map<string, string[]>();
  for (const v of variables) {
    adjList.set(v.name, formulaDependencies(formulaOf(v.id === start.id ? start.config : v.config)));
  }
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const dfs = (node: string): boolean => {
    visited.add(node);
    recStack.add(node);
    for (const neighbor of adjList.get(node) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }
    recStack.delete(node);
    return false;
  };
  return dfs(start.name);
}

/**
 * Pre-start check shown on the START button: broken references (formula names or conditional
 * rule targets that do not exist) or circular formula dependencies.
 */
export function hasPreStartErrors(variables: Variable[]): boolean {
  if (variables.length === 0) return false;
  if (brokenReferenceErrors(variables).length > 0) return true;
  return variables.some(v => v.type === 'numeric' && Boolean(formulaOf(v.config)) && hasFormulaCycleFrom(variables, v));
}
