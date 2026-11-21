/**
 * Text of a literal list item value. Literal values are strings (or numbers and booleans from
 * old files); a structured value is shown as JSON instead of "[object Object]".
 */
export function listItemText(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}
