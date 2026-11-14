import type { Flow, Group, Variable } from '../../types';
import { findTemplatePlaceholders, isSystemPlaceholder } from '../../core/templatePlaceholders';

/** Variable names referenced by a formula, as `[name]` or `{{name}}`, in order. */
export function formulaDependencies(formula?: string): string[] {
  if (!formula) return [];
  const deps: string[] = [];
  const regex = /(?:\[|{{)([a-zA-Z0-9_-]+)(?:\]|}})/g;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    deps.push(match[1]);
  }
  return deps;
}

/** Whether a formula dependency is a built-in constant (pi or e) instead of a variable. */
function isFormulaConstant(dep: string): boolean {
  const lower = dep.toLowerCase();
  return lower === 'pi' || lower === 'e';
}

/** Errors of the formula and conditional rule references of a variable to nonexistent variables. */
function variableReferenceErrors(variable: Variable, varNames: Set<string>): string[] {
  const errors: string[] = [];
  const config = variable.config || {};
  if (variable.type === 'numeric' && config.pattern === 'FORMULA' && config.formula) {
    for (const dep of formulaDependencies(config.formula)) {
      if (!isFormulaConstant(dep) && !varNames.has(dep)) {
        errors.push(`Variable '${variable.name}' references nonexistent '${dep}' in its formula.`);
      }
    }
  }
  if (Array.isArray(config.conditionalRules)) {
    for (const rule of config.conditionalRules) {
      const target = rule.targetVariable?.trim();
      if (target && !varNames.has(target)) {
        errors.push(`Variable '${variable.name}' references nonexistent '${target}' in conditional rules.`);
      }
    }
  }
  return errors;
}

/** Errors of every variable that references a nonexistent variable, in variable order. */
export function brokenReferenceErrors(variables: Variable[]): string[] {
  const varNames = new Set(variables.map(v => v.name));
  return variables.flatMap(v => variableReferenceErrors(v, varNames));
}

/** A template placeholder that reads one item of a list (`list.itemX` or `scope.list.itemX`). */
export interface ItemAccess {
  /** Scope written in the placeholder (lower case), or null when it has none. */
  scope: string | null;
  name: string;
}

/** The list item access of a placeholder spec, or null when the spec does not read an item. */
export function parseItemAccess(spec: string): ItemAccess | null {
  if (!spec.includes('.')) return null;
  const parts = spec.split('.');
  if (parts.length >= 3 && parts[parts.length - 1].toLowerCase().startsWith('item')) {
    return { scope: parts[0].toLowerCase(), name: parts[1] };
  }
  if (parts.length === 2 && parts[1].toLowerCase().startsWith('item')) {
    return { scope: null, name: parts[0] };
  }
  return null;
}

/** Whether a variable is visible from a flow of a group (global, its group or the flow itself). */
function isVisibleFrom(variable: Variable, group: Group, flow: Flow): boolean {
  if (variable.scope === 'global') return true;
  if (variable.scope === 'group') return variable.groupId === group.id;
  if (variable.scope === 'local') return variable.flowId === flow.id;
  return false;
}

/** The variable an item access resolves to from a flow, if any. */
export function findItemAccessTarget(
  variables: Variable[],
  access: ItemAccess,
  group: Group,
  flow: Flow,
): Variable | undefined {
  return variables.find(v => {
    if (v.name !== access.name) return false;
    if (access.scope && v.scope !== access.scope) return false;
    return isVisibleFrom(v, group, flow);
  });
}

/** The error of an item access to a list whose strategy cannot be read by item, or null. */
function itemAccessError(target: Variable | undefined, flow: Flow): string | null {
  if (target?.type !== 'list') return null;
  const strategy = target.config?.selectionStrategy;
  if (!strategy || strategy === 'FIXED_SUBSET') return null;
  return `Invalid item reference in flow '${flow.name}': Variable '${target.name}' uses strategy '${strategy}' (not 'FIXED_SUBSET') and cannot be referenced with sub-item index (.itemX).`;
}

/** Errors of the item references (`.itemX`) of one flow template. */
function flowItemReferenceErrors(variables: Variable[], group: Group, flow: Flow, template: string): string[] {
  const errors: string[] = [];
  for (const placeholder of findTemplatePlaceholders(template)) {
    const fullSpec = placeholder.spec.trim();
    const access = isSystemPlaceholder(fullSpec) ? null : parseItemAccess(fullSpec);
    if (!access) continue;
    const error = itemAccessError(findItemAccessTarget(variables, access, group, flow), flow);
    if (error) errors.push(error);
  }
  return errors;
}

/**
 * Errors of the flow templates that read one item (`.itemX`) of a list whose selection strategy
 * is not FIXED_SUBSET. The template being edited (formatTemplates) wins over the saved one.
 */
export function itemReferenceErrors(
  variables: Variable[],
  groups: Group[],
  formatTemplates: Record<string, string>,
): string[] {
  const errors: string[] = [];
  for (const group of groups || []) {
    for (const flow of group.flows || []) {
      const template = formatTemplates[flow.id] ?? flow.template ?? '';
      if (template) {
        errors.push(...flowItemReferenceErrors(variables, group, flow, template));
      }
    }
  }
  return errors;
}
