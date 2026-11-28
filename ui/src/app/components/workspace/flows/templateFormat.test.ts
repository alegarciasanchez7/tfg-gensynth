import { describe, expect, it } from 'vitest';
import { detectTemplateFormat, isTemplateInFormat, looksLikeTemplateFormat, parseCsv, resolveTemplateFormat } from './templateFormat';

const JSON_TEMPLATE = '{\n  "id": "{{uuid}}",\n  "t": {{temperature}}\n}';

describe('templateFormat', () => {
  it('detects the format from the content, ignoring placeholders', () => {
    expect(detectTemplateFormat(JSON_TEMPLATE)).toBe('json');
    expect(detectTemplateFormat('[{{a}}, {{b}}]')).toBe('json');
    expect(detectTemplateFormat('<reading><t>{{temperature}}</t></reading>')).toBe('xml');
    expect(detectTemplateFormat('id,t\n{{uuid}},{{temperature}}')).toBe('csv');
    expect(detectTemplateFormat('Temperature is {{temperature}}')).toBe('plain');
    expect(detectTemplateFormat('a,b')).toBe('plain');
    expect(detectTemplateFormat('a,b\n"x,y",2')).toBe('csv');
    expect(detectTemplateFormat('a,b\n"open,2')).toBe('plain');
    expect(detectTemplateFormat('  ')).toBeNull();
  });

  it('ignores a stored "plain" label on a JSON template (File Output default)', () => {
    expect(resolveTemplateFormat('plain', JSON_TEMPLATE)).toBe('json');
    expect(resolveTemplateFormat('plain', '<a/>')).toBe('xml');
  });

  it('keeps the stored label when the content fits it', () => {
    expect(resolveTemplateFormat('json', JSON_TEMPLATE)).toBe('json');
    expect(resolveTemplateFormat('plain', 'id,t\n1,2')).toBe('plain');
    expect(resolveTemplateFormat('csv', 'value')).toBe('csv');
    expect(resolveTemplateFormat(undefined, 'hello')).toBe('plain');
    expect(resolveTemplateFormat('xml', '')).toBe('xml');
    expect(resolveTemplateFormat(undefined, '')).toBe('json');
  });

  it('keeps the chosen format while the template is being written', () => {
    expect(resolveTemplateFormat('json', '{"id": ')).toBe('json');
    expect(resolveTemplateFormat('xml', 'hello')).toBe('xml');
    expect(resolveTemplateFormat('json', 'id,t\n1,2')).toBe('json');
    // A complete JSON document or XML is always sent as such
    expect(resolveTemplateFormat('csv', JSON_TEMPLATE)).toBe('json');
    expect(resolveTemplateFormat('json', '<a/>')).toBe('xml');
  });

  it('tells whether a template starts like a document of a format', () => {
    expect(looksLikeTemplateFormat('  {"id": ', 'json')).toBe(true);
    expect(looksLikeTemplateFormat('[{{n}}', 'json')).toBe(true);
    expect(looksLikeTemplateFormat('<root', 'xml')).toBe(true);
    expect(looksLikeTemplateFormat('hello', 'json')).toBe(false);
    expect(looksLikeTemplateFormat('{"id": 1}', 'csv')).toBe(false);
  });

  it('tells whether a template already is valid in a format', () => {
    expect(isTemplateInFormat(JSON_TEMPLATE, 'json')).toBe(true);
    expect(isTemplateInFormat(JSON_TEMPLATE, 'csv')).toBe(false);
    expect(isTemplateInFormat('id,t\n1,2', 'csv')).toBe(true);
    expect(isTemplateInFormat('anything', 'plain')).toBe(true);
  });
});

describe('parseCsv', () => {
  it('splits CRLF, LF and CR line breaks and skips blank lines', () => {
    expect(parseCsv('a,b\r\n1,2\n\n3,4\r5,6')).toEqual([['a', 'b'], ['1', '2'], ['3', '4'], ['5', '6']]);
  });

  it('keeps commas, escaped quotes and line breaks inside quoted fields', () => {
    expect(parseCsv('"x,y","say ""hi""","two\nlines"')).toEqual([['x,y', 'say "hi"', 'two\nlines']]);
  });

  it('opens quotes only at the start of a field and rejects an unclosed one', () => {
    expect(parseCsv('a"b,c')).toEqual([['a"b', 'c']]);
    expect(parseCsv('  "q",c')).toEqual([['q', 'c']]);
    expect(parseCsv('"open')).toBeNull();
    expect(parseCsv('')).toEqual([]);
  });
});
