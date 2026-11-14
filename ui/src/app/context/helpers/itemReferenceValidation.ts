import { itemReferenceErrors } from '../actions/startValidation';
import type { Group, Variable } from '../../types';

/**
 * Check the list item references (`.itemX`) of the templates of a group before starting it:
 * only a list with the FIXED_SUBSET strategy can be read by item index.
 *
 * @param group the group to start (undefined when it does not exist: nothing to check)
 * @param variables all the variables of the project
 * @param formatTemplates the edited templates by flow id (they take precedence over the flow's own template)
 * @returns the error message of the first invalid reference, or null when all are valid
 */
export function findInvalidItemReference(
  group: Group | undefined,
  variables: Variable[],
  formatTemplates: Record<string, string>,
): string | null {
  if (!group) return null;
  return itemReferenceErrors(variables, [group], formatTemplates)[0] ?? null;
}
