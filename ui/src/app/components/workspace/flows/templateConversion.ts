import { findTemplatePlaceholders } from '../../../core/templatePlaceholders';
import {
  isTemplateInFormat,
  looksLikeTemplateFormat,
  neutralizePlaceholders,
  parseCsv,
  resolveTemplateFormat,
  type TemplateFormat,
} from './templateFormat';

/** A value of a parsed template (JSON data model). */
type TemplateValue = string | number | boolean | null | TemplateValue[] | { [key: string]: TemplateValue };
type TemplateObject = { [key: string]: TemplateValue };

/** Result of converting a template: the converted text, or why it cannot be converted. */
export type TemplateConversion = { ok: true; content: string } | { ok: false; reason: string };

/** Element name our XML output wraps the document in (removed again when converting back). */
const XML_ROOT = 'root';
/** Element name our XML output gives to the entries of an array. */
const XML_ITEM = 'item';
/** Field that holds the whole text when plain text is converted to a structured format. */
const PLAIN_FIELD = 'message';

class ConversionError extends Error {}

/* ───────────────────────────── Placeholders ───────────────────────────── */

const sentinel = (index: number): string => `__gsph_${index}__`;
const SENTINEL_PATTERN = /__gsph_(\d+)__/g;

/**
 * Replaces every `{{...}}` placeholder with a sentinel token that survives parsing and
 * re-serialising in every format. In a JSON template, a bare placeholder such as
 * `{"t": {{temp}}}` becomes a quoted sentinel so the template parses; inside a string it is
 * replaced as is.
 */
function protectPlaceholders(template: string, json: boolean): { text: string; restore: (text: string) => string } {
  const placeholders = findTemplatePlaceholders(template);
  const originals = placeholders.map((p) => template.slice(p.start, p.end));
  let text = '';
  let last = 0;
  let inString = false;
  let escaped = false;
  const trackStrings = (chunk: string) => {
    for (const char of chunk) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = inString;
      else if (char === '"') inString = !inString;
    }
  };
  placeholders.forEach((placeholder, index) => {
    const before = template.slice(last, placeholder.start);
    if (json) trackStrings(before);
    const token = sentinel(index);
    text += before + (json && !inString ? `"${token}"` : token);
    last = placeholder.end;
  });
  text += template.slice(last);
  const restore = (converted: string) =>
    converted.replace(SENTINEL_PATTERN, (match, index: string) => originals[Number(index)] ?? match);
  return { text, restore };
}

/* ───────────────────────────── Scalars ───────────────────────────── */

/** Text read from CSV or XML: numbers and booleans are typed only when no character would be lost ("007" stays text). */
function typedScalar(text: string): TemplateValue {
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text !== '' && text.trim() === text && String(Number(text)) === text) return Number(text);
  return text;
}

const isObject = (value: TemplateValue): value is TemplateObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/* ───────────────────────────── CSV ───────────────────────────── */

/** A CSV table: a header and at least one row, every record with the same number of fields. */
function csvTable(text: string, minColumns: number): string[][] | null {
  const records = parseCsv(text);
  if (!records || records.length < 2) return null;
  const columns = records[0].length;
  if (columns < minColumns || records.some((r) => r.length !== columns)) return null;
  return records;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) || value.trim() !== value ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(value: TemplateValue): string {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length === 0 || !rows.every(isObject)) {
    throw new ConversionError('CSV needs an object (or a list of objects) whose fields become the columns.');
  }
  const objects = rows as TemplateObject[];
  const headers = Array.from(new Set(objects.flatMap((row) => Object.keys(row))));
  if (headers.length === 0) throw new ConversionError('The template has no fields to turn into CSV columns.');
  const nested = headers.find((h) => objects.some((row) => typeof row[h] === 'object' && row[h] !== null));
  if (nested !== undefined) {
    throw new ConversionError(
      `CSV only holds flat fields, but "${nested}" contains a nested object or list. Flatten the template before converting.`,
    );
  }
  // Nested values were rejected above: every cell is a scalar (or missing)
  const cell = (v: TemplateValue | undefined) => csvCell(v === undefined || v === null || typeof v === 'object' ? '' : String(v));
  return [headers.map(csvCell).join(','), ...objects.map((row) => headers.map((h) => cell(row[h])).join(','))].join('\n');
}

function fromCsv(records: string[][]): TemplateValue {
  const [headers, ...rows] = records;
  const objects = rows.map((row) => {
    const obj: TemplateObject = {};
    headers.forEach((header, index) => {
      obj[header.trim()] = typedScalar(row[index].trim());
    });
    return obj;
  });
  return objects.length === 1 ? objects[0] : objects;
}

/* ───────────────────────────── XML ───────────────────────────── */

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toXmlNode(key: string, value: TemplateValue, indent: string): string {
  if (value === null) return `${indent}<${key}/>\n`;
  if (Array.isArray(value)) {
    const inner = value.map((item) => toXmlNode(XML_ITEM, item, `${indent}  `)).join('');
    return `${indent}<${key}>\n${inner}${indent}</${key}>\n`;
  }
  if (isObject(value)) {
    const inner = Object.entries(value).map(([k, v]) => toXmlNode(k, v, `${indent}  `)).join('');
    return `${indent}<${key}>\n${inner}${indent}</${key}>\n`;
  }
  return `${indent}<${key}>${escapeXml(String(value))}</${key}>\n`;
}

function toXml(value: TemplateValue): string {
  let body: string;
  if (Array.isArray(value)) body = value.map((item) => toXmlNode(XML_ITEM, item, '  ')).join('');
  else if (isObject(value)) body = Object.entries(value).map(([k, v]) => toXmlNode(k, v, '  ')).join('');
  else body = toXmlNode('value', value, '  ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${XML_ROOT}>\n${body}</${XML_ROOT}>`;
}

function parseXmlDocument(text: string): Document | null {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  return doc.getElementsByTagName('parsererror').length > 0 ? null : doc;
}

/** Maps an element back to a value: text becomes a scalar, child elements an object (or a list). */
function fromXmlElement(element: Element): TemplateValue {
  if (element.attributes.length > 0) {
    throw new ConversionError(`XML attributes (on <${element.tagName}>) have no JSON or CSV equivalent: remove them before converting.`);
  }
  const children = Array.from(element.childNodes);
  if (children.some((node) => node.nodeType === Node.COMMENT_NODE)) {
    throw new ConversionError('XML comments would be lost: remove them before converting.');
  }
  const elements = children.filter((node): node is Element => node.nodeType === Node.ELEMENT_NODE);
  const text = children
    .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
    .map((node) => node.textContent ?? '')
    .join('');
  if (elements.length === 0) return typedScalar(text.trim());
  if (text.trim() !== '') {
    throw new ConversionError(`<${element.tagName}> mixes text and elements, which has no JSON or CSV equivalent.`);
  }
  if (elements.every((child) => child.tagName === XML_ITEM)) return elements.map(fromXmlElement);
  // A repeated child name becomes a list, so no element is lost
  const obj: TemplateObject = {};
  for (const name of new Set(elements.map((child) => child.tagName))) {
    const values = elements.filter((child) => child.tagName === name).map(fromXmlElement);
    obj[name] = values.length === 1 ? values[0] : values;
  }
  return obj;
}

function fromXml(text: string): TemplateValue {
  const doc = parseXmlDocument(text);
  if (!doc) throw new ConversionError('The template is not valid XML yet: finish it before converting it.');
  const root = doc.documentElement;
  const value = fromXmlElement(root);
  // Our own wrapper is dropped; any other root element keeps its name
  return root.tagName === XML_ROOT ? value : { [root.tagName]: value };
}

/* ───────────────────────────── Validation ───────────────────────────── */

/**
 * Whether a template is valid content of a format, ignoring the `{{...}}` placeholders:
 * a JSON object or array, a well-formed XML document, or a CSV header with at least one row
 * of the same width. Any text is valid plain text.
 */
export function isValidTemplateFormat(template: string, format: TemplateFormat): boolean {
  const text = neutralizePlaceholders(template).trim();
  if (format === 'plain') return true;
  if (!text) return false;
  if (format === 'json') {
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }
  if (format === 'xml') return text.startsWith('<') && parseXmlDocument(text) !== null;
  return csvTable(text, 1) !== null;
}

/* ───────────────────────────── Conversion ───────────────────────────── */

function parseSource(text: string, source: TemplateFormat): TemplateValue {
  if (source === 'json') {
    try {
      return JSON.parse(text) as TemplateValue;
    } catch {
      throw new ConversionError('The template is not valid JSON yet: finish it before converting it.');
    }
  }
  if (source === 'xml') return fromXml(text);
  // CSV and plain text are both lines of text: a table is converted as CSV whatever its label, and
  // anything else (e.g. a single line) as plain text, so the same text always gives the same result
  const table = csvTable(text, 2);
  return table ? fromCsv(table) : { [PLAIN_FIELD]: text.trim() };
}

/**
 * Converts a flow template between formats. A conversion never loses content or produces text
 * that is invalid in the target format: when it would, the reason is returned instead.
 * Placeholders are kept as written, including the bare JSON form `{"t": {{temp}}}`.
 *
 * @param content the template
 * @param source its current format
 * @param target the format to convert to
 * @returns the converted template, or the reason why it cannot be converted
 */
export function convertTemplate(content: string, source: TemplateFormat, target: TemplateFormat): TemplateConversion {
  if (!content.trim() || source === target) return { ok: true, content };
  if (target === 'plain') {
    // Plain text is sent exactly as written: there is nothing to convert
    return { ok: true, content };
  }
  const { text, restore } = protectPlaceholders(content, source === 'json');
  try {
    const value = parseSource(text, source);
    let converted: string;
    if (target === 'json') converted = JSON.stringify(value, null, 2);
    else if (target === 'xml') converted = toXml(value);
    else converted = toCsv(value);
    const restored = restore(converted);
    if (!isValidTemplateFormat(restored, target)) {
      return { ok: false, reason: `The result would not be valid ${target.toUpperCase()}.` };
    }
    return { ok: true, content: restored };
  } catch (error) {
    if (error instanceof ConversionError) return { ok: false, reason: error.message };
    return { ok: false, reason: `The template could not be converted to ${target.toUpperCase()}.` };
  }
}

/* ───────────────────────────── Format buttons ───────────────────────────── */

/**
 * Result of choosing a format on the editor: the template in that format (`converted` tells
 * whether its text changed), or why the format cannot change.
 */
export type TemplateFormatChange = { ok: true; content: string; converted: boolean } | { ok: false; reason: string };

/**
 * What choosing another format does to a template. The format alone changes when the template is
 * empty, already is valid in the target, or is that format still being written (`{"a": ` for
 * JSON). Otherwise the text is converted, unless that would lose content or the result would not be
 * recognised as the target (JSON or XML content is always sent as JSON or XML, never as PLAIN).
 *
 * @param content the template
 * @param source  its current format
 * @param target  the chosen format
 * @returns the template in the target format, or the reason why the format cannot change
 */
export function changeTemplateFormat(content: string, source: TemplateFormat, target: TemplateFormat): TemplateFormatChange {
  const recognised = (text: string) => resolveTemplateFormat(target, text) === target;
  const name = target.toUpperCase();
  if (source === target) return { ok: true, content, converted: false };
  if (!content.trim() || isTemplateInFormat(content, target) || looksLikeTemplateFormat(content, target)) {
    if (recognised(content)) return { ok: true, content, converted: false };
    const current = source.toUpperCase();
    return { ok: false, reason: `${current} content is always sent as ${current}, so it cannot be ${name}.` };
  }
  const result = convertTemplate(content, source, target);
  if (!result.ok) return result;
  if (!recognised(result.content)) return { ok: false, reason: `The result would not be recognised as ${name}.` };
  return { ok: true, content: result.content, converted: true };
}

/**
 * The template a flow had before its format buttons were clicked: every other format is converted
 * from it, so each format always gives the same text, and its own format gives it back exactly.
 */
export interface TemplateFormatOrigin {
  content: string;
  format: TemplateFormat;
  /** Texts converted from it: while the template is one of them, it still comes from this origin. */
  converted: string[];
}

/**
 * Switches a template to another format from its origin (see {@link TemplateFormatOrigin}), never
 * from the last conversion, which may have lost what the target format can hold (such as a
 * number without quotes in JSON). A template that is not the origin or one of its conversions,
 * because it was edited, becomes the new origin.
 *
 * @param origin  origin of the flow's template, if its format was switched before
 * @param content the current template
 * @param format  its current format
 * @param target  the chosen format
 * @returns the change, and the origin to keep for the next switch
 */
export function switchTemplateFormat(
  origin: TemplateFormatOrigin | undefined,
  content: string,
  format: TemplateFormat,
  target: TemplateFormat,
): { change: TemplateFormatChange; origin: TemplateFormatOrigin } {
  const current = origin && (content === origin.content || origin.converted.includes(content))
    ? origin
    : { content, format, converted: [] };
  if (target === current.format) {
    return { change: { ok: true, content: current.content, converted: current.content !== content }, origin: current };
  }
  let change = changeTemplateFormat(current.content, current.format, target);
  if (!change.ok && target === 'plain') {
    // JSON or XML cannot be plain text, but its CSV form can: plain text only changes the label, so
    // it takes the current text as it is
    const labelOnly = changeTemplateFormat(content, format, target);
    if (labelOnly.ok) change = labelOnly;
  }
  if (!change.ok) return { change, origin: current };
  let next: TemplateFormatOrigin;
  if (change.content === current.content) {
    // Only the label changed: the origin is now read in the chosen format (JSON being written that
    // was labelled plain is JSON from now on)
    next = { ...current, format: target };
  } else if (current.converted.includes(change.content)) {
    next = current;
  } else {
    next = { ...current, converted: [...current.converted, change.content] };
  }
  return { change: { ...change, converted: change.content !== content }, origin: next };
}
