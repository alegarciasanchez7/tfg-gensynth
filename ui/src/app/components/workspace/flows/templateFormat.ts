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

/** State of the CSV parser while it walks the text. */
interface CsvParseState {
  records: string[][];
  record: string[];
  field: string;
  quoted: boolean;
}

/** Closes the current record, skipping it when it is a blank line. */
function endCsvRecord(state: CsvParseState): void {
  state.record.push(state.field);
  if (state.record.length > 1 || state.record[0].trim() !== '') state.records.push(state.record);
  state.record = [];
  state.field = '';
}

/** Reads the character at `i` inside a quoted field; returns the index of the next one. */
function readQuotedChar(state: CsvParseState, text: string, i: number): number {
  const char = text[i];
  if (char === '"' && text[i + 1] === '"') {
    state.field += '"';
    return i + 2;
  }
  if (char === '"') {
    state.quoted = false;
  } else {
    state.field += char;
  }
  return i + 1;
}

/** Reads the character at `i` outside quotes; returns the index of the next one. */
function readUnquotedChar(state: CsvParseState, text: string, i: number): number {
  const char = text[i];
  if (char === '"' && state.field.trim() === '') {
    state.quoted = true;
    state.field = '';
  } else if (char === ',') {
    state.record.push(state.field);
    state.field = '';
  } else if (char === '\n' || char === '\r') {
    endCsvRecord(state);
    // A CRLF line break is a single break
    if (char === '\r' && text[i + 1] === '\n') return i + 2;
  } else {
    state.field += char;
  }
  return i + 1;
}

/**
 * Parses CSV text (RFC 4180: quoted fields may contain commas, quotes as `""` and line breaks).
 * Returns null when a quoted field is never closed. Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] | null {
  const state: CsvParseState = { records: [], record: [], field: '', quoted: false };
  let i = 0;
  while (i < text.length) {
    i = state.quoted ? readQuotedChar(state, text, i) : readUnquotedChar(state, text, i);
  }
  if (state.quoted) return null;
  endCsvRecord(state);
  return state.records;
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

/**
 * Format of a flow, shown on the editor and used for the File Output extension: the stored
 * format, unless the template is a complete JSON document or XML, which is always sent as such.
 * So text still being written keeps the chosen format, and flows stored as `plain` with a JSON
 * template (new File Output flows up to 0.6.0) are JSON. The Core applies the same rule
 * (`FlowFormats.effectiveFormat`).
 *
 * @param stored   format saved with the flow, if any
 * @param template current template text
 */
export function resolveTemplateFormat(stored: TemplateFormat | undefined, template: string): TemplateFormat {
  const detected = detectTemplateFormat(template);
  if (detected === 'json' || detected === 'xml') return detected;
  return stored ?? detected ?? 'json';
}

/**
 * Whether the template starts like a document of the format (`{` or `[` for JSON, `<` for XML)
 * without being one yet, as while it is being written.
 */
export function looksLikeTemplateFormat(template: string, format: TemplateFormat): boolean {
  const text = neutralizePlaceholders(template).trim();
  if (format === 'json') return text.startsWith('{') || text.startsWith('[');
  if (format === 'xml') return text.startsWith('<');
  return false;
}

/**
 * Whether the template already is valid content of `format`, so switching to that format only
 * changes the label. Any text is valid plain text.
 */
export function isTemplateInFormat(template: string, format: TemplateFormat): boolean {
  return format === 'plain' || detectTemplateFormat(template) === format;
}
