/** An entry of the template autocomplete. */
export interface AutocompleteOption {
  name: string;
  scope: string;
  detail?: string;
}

/** Text an option inserts between the braces: built-ins as is, variables with their scope. */
export const optionReference = (option: AutocompleteOption): string =>
  option.scope === 'system' ? option.name : `${option.scope}.${option.name}`;

/**
 * Options that match what the user typed after `{{`, matched against the text the option shows
 * (its name) and inserts (`scope.name`): prefix matches first, then substring matches, each group
 * in its original order. An empty query keeps every option.
 */
export function filterAutocompleteOptions<T extends AutocompleteOption>(options: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  const prefix: T[] = [];
  const substring: T[] = [];
  for (const option of options) {
    const texts = [option.name.toLowerCase(), optionReference(option).toLowerCase()];
    if (texts.some(text => text.startsWith(q))) prefix.push(option);
    else if (texts.some(text => text.includes(q))) substring.push(option);
  }
  return [...prefix, ...substring];
}
