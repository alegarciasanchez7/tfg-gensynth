import type { Variable, VariableScope, VariableType } from '../../../types';
import { findTemplatePlaceholders, isSystemPlaceholder } from '../../../core/templatePlaceholders';
import { findReachableVariable } from '../../../core/templateVariables';

/** A piece of a template for the highlight overlay: plain text or a `{{...}}` placeholder. */
export interface TemplateToken {
  /** Offset of the token in the template (unique, used as React key). */
  start: number;
  text: string;
  isValid?: boolean;
  isVariable?: boolean;
}

/** A variable reference written inside `{{...}}`: `[scope.]name[.subProperty]`. */
export interface PlaceholderReference {
  scope: VariableScope | null;
  name: string;
  subProperty: string | null;
  /** Whether the sub-property is an item access (`.itemN`). */
  isItemAccess: boolean;
}

const KNOWN_SCOPES: readonly string[] = ['local', 'group', 'global'];

/** Sub-properties the Core resolves for each variable type (lower case). */
const VALID_SUB_PROPERTIES: Partial<Record<VariableType, readonly string[]>> = {
  point: [
    'latitude', 'longitude', 'altitude',
    'latitudedecimal', 'longitudedecimal',
    'altitudeunit', 'altitudereference',
    'x', 'y', 'z',
    'nodename', 'node_name', 'node', 'nodeid', 'node_id',
    'targetnode', 'targetnodename', 'target_node_name', 'targetnodeid', 'target_node_id',
    'ispaused', 'stepinedge', 'totaledgesteps',
  ],
  temporal: [
    'month', 'monthtext', 'month_text', 'monthname', 'month_name',
    'monthshort', 'month_short', 'monthnumber', 'monthvalue', 'month_number', 'month_val',
    'year', 'day', 'dayofmonth', 'day_of_month', 'dayofweek', 'day_of_week', 'dayofweekname',
    'dayofweeknumber', 'dayofweekvalue',
    'hour', 'hours', 'minute', 'minutes', 'second', 'seconds',
    'millisecond', 'millis', 'timestamp', 'epochmilli', 'epoch_milli', 'timezone', 'time_zone', 'tz',
  ],
  numeric: [
    'integerpart', 'int', 'integer', 'integer_part', 'fractionalpart', 'fractional_part', 'decimalpart',
    'fraction', 'decimal', 'abs', 'absolute', 'round', 'floor', 'ceil', 'ceiling', 'sign', 'signum',
  ],
  string: [
    'length', 'size', 'upper', 'uppercase', 'lower', 'lowercase', 'trim',
    'firstchar', 'first_char', 'lastchar', 'last_char',
  ],
  boolean: ['inverse', 'negation', 'not', 'asnumber', 'binary', 'int', 'asstring', 'text', 'asupper', 'upper'],
  list: ['size', 'length', 'count', 'first', 'firstitem', 'last', 'lastitem'],
};

/**
 * Splits the text inside `{{...}}` into scope, name and sub-property. A first segment that is a
 * scope (local, group, global, any case) is the scope; otherwise the reference has no scope.
 */
export function parsePlaceholderReference(spec: string): PlaceholderReference {
  if (!spec.includes('.')) {
    return { scope: null, name: spec, subProperty: null, isItemAccess: false };
  }
  const parts = spec.split('.');
  const head = parts[0].toLowerCase();
  const hasScope = KNOWN_SCOPES.includes(head);
  const name = hasScope ? parts[1] : parts[0];
  // A missing segment (e.g. `local.name`) is undefined at run time, hence the explicit type
  const subProperty: string | null = (hasScope ? parts[2] : parts[1]) ?? null;
  return {
    scope: hasScope ? (head as VariableScope) : null,
    name,
    subProperty,
    isItemAccess: subProperty?.toLowerCase().startsWith('item') ?? false,
  };
}

/** Whether a variable resolves the sub-property (types without a known list accept any). */
function isValidSubProperty(variable: Variable, subProperty: string): boolean {
  const valid = VALID_SUB_PROPERTIES[variable.type];
  if (!valid) return true;
  const lowerProp = subProperty.toLowerCase();
  return valid.includes(lowerProp) || (variable.type === 'list' && lowerProp.startsWith('item'));
}

/** Whether a reference to an existing variable is valid (its sub-property, its item access). */
export function isReferenceValid(variable: Variable, reference: PlaceholderReference): boolean {
  if (reference.isItemAccess && variable.type === 'list') {
    // Item access needs a whole list: only Fixed Subset yields one (the default is Weighted Random)
    const strategy = variable.config?.selectionStrategy || 'WEIGHTED_RANDOM';
    return strategy === 'FIXED_SUBSET';
  }
  if (reference.subProperty) return isValidSubProperty(variable, reference.subProperty);
  return true;
}

/**
 * Whether the text inside a `{{...}}` placeholder resolves: a built-in placeholder, or a variable
 * reachable from the flow with a valid sub-property.
 */
export function isPlaceholderValid(
  spec: string,
  variables: readonly Variable[],
  flowId: string,
  groupId: string,
): boolean {
  if (isSystemPlaceholder(spec)) return true;
  const reference = parsePlaceholderReference(spec);
  // Same lookup as the Core: without a scope, the closest one wins (local, group, global)
  const variable = findReachableVariable(variables, reference.name, reference.scope, flowId, groupId);
  return variable ? isReferenceValid(variable, reference) : false;
}

/** Splits a template into plain text and placeholder tokens, each placeholder marked valid or not. */
export function tokenizeTemplate(
  value: string,
  variables: readonly Variable[],
  flowId: string,
  groupId: string,
): TemplateToken[] {
  const parts: TemplateToken[] = [];
  let lastIndex = 0;
  for (const placeholder of findTemplatePlaceholders(value)) {
    if (placeholder.start > lastIndex) {
      parts.push({ start: lastIndex, text: value.substring(lastIndex, placeholder.start) });
    }
    parts.push({
      start: placeholder.start,
      text: value.substring(placeholder.start, placeholder.end),
      isValid: isPlaceholderValid(placeholder.spec.trim(), variables, flowId, groupId),
      isVariable: true,
    });
    lastIndex = placeholder.end;
  }
  if (lastIndex < value.length) {
    parts.push({ start: lastIndex, text: value.substring(lastIndex) });
  }
  return parts;
}
