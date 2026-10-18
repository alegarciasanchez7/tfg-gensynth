/**
 * Naming patterns used to create several items at once (Clone, Repeater).
 * `${name}` is replaced by the base name and `${index}` by the 1-based position.
 * An offset such as `${index+1}` shifts the numbering (clones of "H1" can be "H2", "H3").
 * Every occurrence is replaced, like NamingPattern.apply in the Core.
 */

export const NAME_TOKEN = '${name}';
export const INDEX_TOKEN = '${index}';

const INDEX_PATTERN = /\$\{index(?:\s*([+-])\s*(\d+))?\}/g;

export function applyNamingPattern(pattern: string, name: string, index: number): string {
  return pattern.split(NAME_TOKEN).join(name).replace(INDEX_PATTERN, (_, sign?: string, offset?: string) => {
    if (!sign || !offset) return String(index);
    return String(sign === '+' ? index + Number(offset) : index - Number(offset));
  });
}

export function buildPatternNames(pattern: string, name: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => applyNamingPattern(pattern, name, i + 1));
}
