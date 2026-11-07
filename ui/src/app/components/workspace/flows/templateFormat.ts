import { findTemplatePlaceholders } from '../../../core/templatePlaceholders';

/** Message format label of a flow template. */
export type TemplateFormat = 'json' | 'xml' | 'csv' | 'plain';

/**
 * Replaces every `{{...}}` placeholder with `0`, a value that is valid both inside quotes and as a
 * bare JSON value, so `{"t": {{temp}}}` and `{"id": "{{uuid}}"}` both parse as JSON.
 */
export function neutralizePlaceholders(template: string): string {
  let result = '';
  let last = 0;
  for (const placeholder of findTemplatePlaceholders(template)) {
    result += template.slice(last, placeholder.start) + '0';
    last = placeholder.end;
  }
  return result + template.slice(last);
}

function isJsonDocument(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

/**
 * Parses CSV text (RFC 4180: quoted fields may contain commas, quotes as `""` and line breaks).
 * Returns null when a quoted field is never closed. Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] | null {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRecord = () => {
    record.push(field);
    if (record.length > 1 || record[0].trim() !== '') records.push(record);
    record = [];
    field = '';
  };
  while (i < text.length) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRecord();
    } else {
      field += char;
    }
    i += 1;
  }
  if (quoted) return null;
  endRecord();
  return records;
}

/**
 * A header line and at least one row, every record with the same number of fields (2 or more).
 * Quoted fields may contain commas, as in `"x,y"`.
 */
function isCsvTable(text: string): boolean {
  const records = parseCsv(text);
  if (!records || records.length < 2) return false;
  const columns = records[0].length;
  return columns >= 2 && records.every(record => record.length === columns);
}

/**
 * Detects the format of a template from its content, ignoring the `{{...}}` placeholders:
 * a JSON object or array is `json`, text starting with `<` is `xml`, a comma-separated table with a
 * header is `csv` and anything else is `plain`. Returns null for an empty template.
 */
export function detectTemplateFormat(template: string): TemplateFormat | null {
  const text = neutralizePlaceholders(template).trim();
  if (!text) return null;
  if (isJsonDocument(text)) return 'json';
  if (text.startsWith('<')) return 'xml';
  if (isCsvTable(text)) return 'csv';
  return 'plain';
}

/** CSV and plain text are both lines of text: either label fits the other content. */
const isTextFormat = (format: TemplateFormat): boolean => format === 'csv' || format === 'plain';

/**
 * Format label of a flow: the stored format when the template content fits it, otherwise the
 * format detected from the content. The stored format is not always a user choice (the Core
 * stores `plain` for every new File Output flow), so it never wins over a JSON or XML template.
 *
 * @param stored   format saved with the flow, if any
 * @param template current template text
 */
export function resolveTemplateFormat(stored: TemplateFormat | undefined, template: string): TemplateFormat {
  const detected = detectTemplateFormat(template);
  if (!detected) return stored ?? 'json';
  if (stored && (stored === detected || (isTextFormat(stored) && isTextFormat(detected)))) return stored;
  return detected;
}

/**
 * Whether the template already is valid content of `format`, so switching to that format only
 * changes the label. Any text is valid plain text.
 */
export function isTemplateInFormat(template: string, format: TemplateFormat): boolean {
  return format === 'plain' || detectTemplateFormat(template) === format;
}
