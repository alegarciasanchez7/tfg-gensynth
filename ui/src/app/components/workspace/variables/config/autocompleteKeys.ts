/** What a key does while the variable autocomplete list of a formula or template input is open. */
export type AutocompleteKeyAction = 'next' | 'previous' | 'insert' | 'close';

const KEY_ACTIONS = new Map<string, AutocompleteKeyAction>([
  ['ArrowDown', 'next'],
  ['ArrowUp', 'previous'],
  ['Enter', 'insert'],
  ['Tab', 'insert'],
  ['Escape', 'close'],
]);

/** The autocomplete action of a key, or null when the key is typed normally. */
export function autocompleteKeyAction(key: string): AutocompleteKeyAction | null {
  return KEY_ACTIONS.get(key) ?? null;
}

/** Moves a selection index by delta, wrapping around a list of the given length. */
export function cycleIndex(index: number, delta: number, length: number): number {
  return (index + delta + length) % length;
}

/** Whether typing `{` at the cursor completes a `{{` and so should open the autocomplete list. */
export function opensVariableAutocomplete(value: string, cursor: number): boolean {
  return value.substring(0, cursor).endsWith('{');
}
