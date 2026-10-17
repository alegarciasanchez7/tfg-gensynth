/**
 * Built-in template placeholders resolved by the Core TemplateEngine,
 * with the description shown in the template autocomplete.
 */
export const SYSTEM_PLACEHOLDERS: ReadonlyArray<{ name: string; detail: string }> = [
  { name: 'uuid', detail: 'Random UUID' },
  { name: 'ts', detail: 'Current time (ISO-8601)' },
  { name: 'n', detail: 'Message sequence number' },
  { name: 'flow.name', detail: 'Name of this flow' },
];

/** Whether a placeholder spec (the text between the braces, trimmed) is a built-in. */
export const isSystemPlaceholder = (spec: string): boolean =>
  SYSTEM_PLACEHOLDERS.some(p => p.name === spec);
