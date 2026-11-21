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

/** A `{{...}}` placeholder found in a flow template. */
export interface TemplatePlaceholderMatch {
  /** Index of the opening `{{`. */
  start: number;
  /** Index right after the closing `}}`. */
  end: number;
  /** Text between the braces, untrimmed (never empty and never containing `}`). */
  spec: string;
}

/**
 * Finds every `{{...}}` placeholder of a template, from left to right.
 *
 * It returns the same matches as the regex `/\{\{([^}]+)\}\}/g`, but scans the template in
 * linear time: that regex backtracks quadratically on templates with many unclosed `{{`.
 */
export const findTemplatePlaceholders = (template: string): TemplatePlaceholderMatch[] => {
  const placeholders: TemplatePlaceholderMatch[] = [];
  let open = template.indexOf('{{');
  while (open !== -1) {
    // The spec cannot contain '}', so a placeholder ends at the first '}' after its '{{'.
    const close = template.indexOf('}', open + 2);
    if (close === -1) break;
    const matched = close > open + 2 && template[close + 1] === '}';
    if (matched) {
      placeholders.push({ start: open, end: close + 2, spec: template.slice(open + 2, close) });
    }
    // Every other '{{' before `close` shares that same '}', so the next match starts after it.
    open = template.indexOf('{{', matched ? close + 2 : close + 1);
  }
  return placeholders;
};
