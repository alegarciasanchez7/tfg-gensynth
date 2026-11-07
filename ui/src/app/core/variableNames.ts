import type { Variable } from '../types';

type NameTarget = Pick<Variable, 'name' | 'scope' | 'flowId' | 'groupId'> & { id?: string };

/**
 * Message shown when another variable already uses the same name in the same place
 * (same flow for local, same group for group, anywhere for global), or null if the name is free.
 * Duplicate names make template references ambiguous.
 */
export function findVariableNameConflict(variables: Variable[], target: NameTarget): string | null {
  const name = target.name.trim();
  if (!name) return null;
  const clash = variables.find(v =>
    v.id !== target.id
    && v.name === name
    && v.scope === target.scope
    && (target.scope === 'global'
      || (target.scope === 'group' && v.groupId === target.groupId)
      || (target.scope === 'local' && v.flowId === target.flowId)));
  if (!clash) return null;
  const where = target.scope === 'local' ? 'in this flow' : target.scope === 'group' ? 'in this group' : 'as a global variable';
  return `A variable named "${name}" already exists ${where}`;
}
