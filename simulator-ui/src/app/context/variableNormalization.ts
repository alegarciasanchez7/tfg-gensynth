import type { Variable } from '../types';

export function normalizeVariableFromCore(variable: Variable): Variable {
  return {
    ...variable,
    type: (variable.type as string) === 'date' ? 'temporal' : variable.type,
    scope: variable.scope.toLowerCase() as Variable['scope'],
  };
}

export function normalizeVariableListFromCore(variables: Variable[]): Variable[] {
  return variables.map(normalizeVariableFromCore);
}
