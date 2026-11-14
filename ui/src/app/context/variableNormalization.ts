import type { Variable, VariableConfig } from '../types';

/**
 * A variable as the Core sends it (or a UI variable being re-normalized): the scope may come in
 * upper case, the legacy type 'date' means 'temporal', and an old Core may send the config as a
 * JSON `defaultValue` instead of `config`.
 */
export interface RawVariable extends Omit<Variable, 'type' | 'scope' | 'config'> {
  type: string;
  scope: string;
  config?: VariableConfig | Record<string, unknown>;
  defaultValue?: unknown;
}

export function normalizeVariableFromCore(variable: RawVariable): Variable {
  let config = variable.config || {};
  if ((!config || Object.keys(config).length === 0) && typeof variable.defaultValue === 'string') {
    const trimmed = variable.defaultValue.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        config = JSON.parse(trimmed);
      } catch {
        // ignore
      }
    }
  }

  return {
    ...variable,
    config: config as VariableConfig,
    type: (variable.type === 'date' ? 'temporal' : variable.type) as Variable['type'],
    scope: variable.scope.toLowerCase() as Variable['scope'],
  };
}

export function normalizeVariableListFromCore(variables: Variable[]): Variable[] {
  return variables.map(normalizeVariableFromCore);
}
