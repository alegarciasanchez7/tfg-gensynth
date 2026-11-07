import { describe, expect, it } from 'vitest';
import { convertTemplate, isValidTemplateFormat } from './templateConversion';
import { parseCsv } from './templateFormat';
import type { TemplateConversion } from './templateConversion';

const converted = (result: TemplateConversion): string => {
  if (!result.ok) throw new Error(`Unexpected block: ${result.reason}`);
  return result.content;
};

describe('convertTemplate', () => {
  it('converts flat JSON to XML and CSV', () => {
    const json = '{"id": 123, "name": "test"}';

    const xml = converted(convertTemplate(json, 'json', 'xml'));
    expect(xml).toContain('<root>');
    expect(xml).toContain('<id>123</id>');
    expect(xml).toContain('<name>test</name>');

    expect(converted(convertTemplate(json, 'json', 'csv'))).toBe('id,name\n123,test');
  });

  it('keeps bare numeric placeholders when converting JSON to CSV and XML', () => {
    const json = '{"id": "{{uuid}}", "t": {{temp}}}';

    expect(converted(convertTemplate(json, 'json', 'csv'))).toBe('id,t\n{{uuid}},{{temp}}');
    expect(converted(convertTemplate(json, 'json', 'xml'))).toContain('<t>{{temp}}</t>');
  });

  it('blocks nested JSON to CSV instead of producing invalid CSV', () => {
    const result = convertTemplate('{"id": 1, "tags": ["a", "b"]}', 'json', 'csv');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('"tags"');
  });

  it('converts text labelled CSV without data rows as plain text, keeping it whole', () => {
    const json = converted(convertTemplate('hello {{temp}}', 'csv', 'json'));

    expect(JSON.parse(json)).toEqual({ message: 'hello {{temp}}' });
  });

  it('converts a CSV table to JSON, keeping text such as leading zeros', () => {
    const json = converted(convertTemplate('id,code,t\n{{uuid}},007,21.5', 'csv', 'json'));

    expect(JSON.parse(json)).toEqual({ id: '{{uuid}}', code: '007', t: 21.5 });
  });

  it('converts a CSV table with a quoted comma to JSON', () => {
    const json = converted(convertTemplate('a,b\n"x,y",2', 'csv', 'json'));

    expect(JSON.parse(json)).toEqual({ a: 'x,y', b: 2 });
  });

  it('round-trips JSON through its own XML', () => {
    const original = { id: '{{uuid}}', t: 21.5, ok: true, pos: { lat: 1, lon: 2 }, tags: ['a', 'b'] };
    const xml = converted(convertTemplate(JSON.stringify(original), 'json', 'xml'));

    expect(JSON.parse(converted(convertTemplate(xml, 'xml', 'json')))).toEqual(original);
  });

  it('maps simple flat XML to JSON fields, keeping the root name and repeated elements', () => {
    const json = converted(convertTemplate('<reading><sensor>s1</sensor><v>1</v><v>2</v></reading>', 'xml', 'json'));

    expect(JSON.parse(json)).toEqual({ reading: { sensor: 's1', v: [1, 2] } });
  });

  it('converts XML to CSV', () => {
    expect(converted(convertTemplate('<root><id>{{uuid}}</id><t>{{temp}}</t></root>', 'xml', 'csv'))).toBe('id,t\n{{uuid}},{{temp}}');
  });

  it('blocks XML that would lose content', () => {
    expect(convertTemplate('<root><id unit="c">1</id></root>', 'xml', 'json').ok).toBe(false);
    expect(convertTemplate('<root><!-- note --><id>1</id></root>', 'xml', 'json').ok).toBe(false);
    expect(convertTemplate('<root><id>1</root>', 'xml', 'json').ok).toBe(false);
  });

  it('escapes XML special characters and quotes CSV cells that need it', () => {
    expect(converted(convertTemplate('{"m": "a < b & c"}', 'json', 'xml'))).toContain('<m>a &lt; b &amp; c</m>');
    expect(converted(convertTemplate('{"m": "a, \\"b\\"", "n": 1}', 'json', 'csv'))).toBe('m,n\n"a, ""b""",1');
  });

  it('blocks keys that are not valid XML element names', () => {
    expect(convertTemplate('{"my key": 1}', 'json', 'xml').ok).toBe(false);
  });

  it('converts plain text to every structured format without losing it', () => {
    const text = 'Temperature is {{temp}}, all good';

    expect(JSON.parse(converted(convertTemplate(text, 'plain', 'json')))).toEqual({ message: text });
    expect(converted(convertTemplate(text, 'plain', 'xml'))).toContain(`<message>${text}</message>`);
    expect(converted(convertTemplate(text, 'plain', 'csv'))).toBe(`message\n"${text}"`);
  });
});

describe('isValidTemplateFormat', () => {
  it('validates each format ignoring placeholders', () => {
    expect(isValidTemplateFormat('{"t": {{temp}}}', 'json')).toBe(true);
    expect(isValidTemplateFormat('[]', 'json')).toBe(true);
    expect(isValidTemplateFormat('<a>{{x}}</a>', 'xml')).toBe(true);
    expect(isValidTemplateFormat('<a>', 'xml')).toBe(false);
    expect(isValidTemplateFormat('a,b\n1,2', 'csv')).toBe(true);
    expect(isValidTemplateFormat('a,b', 'csv')).toBe(false);
    expect(isValidTemplateFormat('a,b\n1,{"x": 1, "y": 2}', 'csv')).toBe(false);
    expect(isValidTemplateFormat('anything', 'plain')).toBe(true);
  });
});

describe('parseCsv', () => {
  it('handles quoted fields and rejects an unclosed quote', () => {
    expect(parseCsv('a,b\n"x, ""y""",2\n')).toEqual([['a', 'b'], ['x, "y"', '2']]);
    expect(parseCsv('a\n"open')).toBeNull();
  });
});
