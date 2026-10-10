/**
 * Naming patterns used to create several items at once (Clone, Repeater).
 * `${name}` is replaced by the base name and `${index}` by the 1-based position.
 * Every occurrence is replaced, like String.replace in the Core.
 */

export const NAME_TOKEN = '${name}';
export const INDEX_TOKEN = '${index}';

export function applyNamingPattern(pattern: string, name: string, index: number): string {
  return pattern.split(NAME_TOKEN).join(name).split(INDEX_TOKEN).join(String(index));
}

export function buildPatternNames(pattern: string, name: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => applyNamingPattern(pattern, name, i + 1));
}
