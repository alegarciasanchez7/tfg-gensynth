import type { Variable } from '../../../types';

/** References to other variables in a formula: `[name]` or `{{name}}`. */
const REFERENCE_REGEX = /(?:\[|{{)([a-zA-Z0-9_-]+)(?:\]|}})/g;

/** Names referenced by a formula, in order of appearance (duplicates kept). */
export function formulaDependencies(formula?: string): string[] {
  if (!formula) return [];
  const deps: string[] = [];
  const regex = new RegExp(REFERENCE_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(formula)) !== null) {
    deps.push(match[1]);
  }
  return deps;
}

/** Whether a formula reference is a known constant (`pi`, `e`) rather than a variable. */
function isFormulaConstant(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'pi' || lower === 'e';
}

/** Whether a numeric FORMULA variable references a name that is neither a variable nor a constant. */
function hasBrokenFormulaReference(variable: Variable, varNames: Set<string>): boolean {
  const config = variable.config || {};
  if (variable.type !== 'numeric' || config.pattern !== 'FORMULA' || !config.formula) return false;
  return formulaDependencies(config.formula).some(dep => !isFormulaConstant(dep) && !varNames.has(dep));
}

/** Whether a conditional rule of the variable targets a variable that does not exist. */
function hasBrokenRuleTarget(variable: Variable, varNames: Set<string>): boolean {
  const rules = variable.config?.conditionalRules;
  if (!rules || !Array.isArray(rules)) return false;
  return rules.some(rule => {
    const target = rule.targetVariable?.trim();
    return Boolean(target) && !varNames.has(target as string);
  });
}

/** Whether the formula dependency graph has a cycle reachable from the given variable. */
export function hasFormulaCycleFrom(variables: Variable[], start: Variable): boolean {
  const adjList = new Map<string, string[]>();
  for (const v of variables) {
    adjList.set(v.name, formulaDependencies(v.id === start.id ? start.config.formula : v.config?.formula));
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
  const varNames = new Set(variables.map(v => v.name));

  for (const v of variables) {
    if (hasBrokenFormulaReference(v, varNames) || hasBrokenRuleTarget(v, varNames)) {
      return true;
    }
  }

  return variables.some(v => v.type === 'numeric' && Boolean(v.config?.formula) && hasFormulaCycleFrom(variables, v));
}
