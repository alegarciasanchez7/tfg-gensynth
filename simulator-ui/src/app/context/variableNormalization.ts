import type { Variable } from '../types';

export function normalizeVariableFromCore(variable: any): Variable {
  let config = variable.config || {};
  if ((!config || Object.keys(config).length === 0) && typeof variable.defaultValue === 'string') {
    const trimmed = variable.defaultValue.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        config = JSON.parse(trimmed);
      } catch (e) {
        // ignore
      }
    }
  }

  return {
    ...variable,
    config,
    type: (variable.type as string) === 'date' ? 'temporal' : variable.type,
    scope: variable.scope.toLowerCase() as Variable['scope'],
  };
}

export function normalizeVariableListFromCore(variables: Variable[]): Variable[] {
  return variables.map(normalizeVariableFromCore);
}
