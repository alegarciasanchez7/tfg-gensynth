import { describe, expect, it } from 'vitest';
import { changeTemplateFormat, convertTemplate, isValidTemplateFormat, switchTemplateFormat } from './templateConversion';
import type { TemplateFormatOrigin } from './templateConversion';
import type { TemplateFormat } from './templateFormat';
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

describe('changeTemplateFormat', () => {
  it('only changes the format of an empty template', () => {
    expect(changeTemplateFormat('', 'json', 'xml')).toEqual({ ok: true, content: '', converted: false });
    expect(changeTemplateFormat('  ', 'xml', 'plain')).toEqual({ ok: true, content: '  ', converted: false });
  });

  it('only changes the format of a template already valid in the target, or being written in it', () => {
    expect(changeTemplateFormat('id,t\n1,2', 'plain', 'csv')).toEqual({ ok: true, content: 'id,t\n1,2', converted: false });
    // Unfinished JSON is not wrapped as {"message": ...}
    expect(changeTemplateFormat('{"id": ', 'plain', 'json')).toEqual({ ok: true, content: '{"id": ', converted: false });
  });

  it('converts the text otherwise', () => {
    expect(changeTemplateFormat('{"id": {{n}}}', 'json', 'csv')).toEqual({ ok: true, content: 'id\n{{n}}', converted: true });
    expect(changeTemplateFormat('hello', 'plain', 'json')).toEqual({
      ok: true,
      content: '{\n  "message": "hello"\n}',
      converted: true,
    });
  });

  it('explains why the format cannot change', () => {
    expect(changeTemplateFormat('{"id": ', 'json', 'xml')).toEqual({
      ok: false,
      reason: 'The template is not valid JSON yet: finish it before converting it.',
    });
    expect(changeTemplateFormat('{"id": 1}', 'json', 'plain')).toEqual({
      ok: false,
      reason: 'JSON content is always sent as JSON, so it cannot be PLAIN.',
    });
    expect(changeTemplateFormat('{"a": {"b": 1}}', 'json', 'csv').ok).toBe(false);
  });
});

describe('switchTemplateFormat', () => {
  const JSON_TEMPLATE = '{\n  "id": "{{uuid}}",\n  "t": {{temperature}},\n  "station": "{{flow.name}}"\n}';

  /** Clicks the formats in order, starting from a template, and returns the text after each click. */
  const goRound = (content: string, format: TemplateFormat, targets: TemplateFormat[]) => {
    let origin: TemplateFormatOrigin | undefined;
    let current = { content, format };
    const texts: string[] = [];
    for (const target of targets) {
      const result = switchTemplateFormat(origin, current.content, current.format, target);
      origin = result.origin;
      if (!result.change.ok) throw new Error(`${current.format} → ${target}: ${result.change.reason}`);
      current = { content: result.change.content, format: target };
      texts.push(current.content);
    }
    return texts;
  };

  it('gives the same text for each format on every round, and the original one back', () => {
    const round: TemplateFormat[] = ['xml', 'csv', 'plain', 'json'];
    const texts = goRound(JSON_TEMPLATE, 'json', [...round, ...round, ...round]);

    expect(texts.slice(4, 8)).toEqual(texts.slice(0, 4));
    expect(texts.slice(8, 12)).toEqual(texts.slice(0, 4));
    // Back to JSON: the number placeholder has no quotes again, as written
    expect(texts[3]).toBe(JSON_TEMPLATE);
    // Plain text is the CSV text with another label
    expect(texts[2]).toBe(texts[1]);
  });

  it('also goes round in any order, starting from any format', () => {
    const csv = 'id,t\n{{uuid}},{{temperature}}';
    const texts = goRound(csv, 'plain', ['json', 'xml', 'csv', 'json', 'plain', 'xml', 'plain']);
    // A CSV table labelled plain is converted as CSV, not wrapped in a "message" field
    expect(texts[0]).toBe('{\n  "id": "{{uuid}}",\n  "t": "{{temperature}}"\n}');
    expect(texts[2]).toBe(csv);
    expect(texts[3]).toBe(texts[0]);
    expect(texts[4]).toBe(csv);
    expect(texts[5]).toBe(texts[1]);
    expect(texts[6]).toBe(csv);
  });

  it('starts again from an edited template', () => {
    const first = switchTemplateFormat(undefined, '{"a": 1}', 'json', 'xml');
    const edited = switchTemplateFormat(first.origin, '{"b": 2}', 'json', 'xml');
    expect(edited.origin.content).toBe('{"b": 2}');
    expect(edited.change).toEqual({
      ok: true,
      content: '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <b>2</b>\n</root>',
      converted: true,
    });
  });
});

describe('switchTemplateFormat with only a new label', () => {
  it('reads the origin in the chosen format from then on', () => {
    const labelled = switchTemplateFormat(undefined, '{"id": ', 'plain', 'json');
    expect(labelled.change).toEqual({ ok: true, content: '{"id": ', converted: false });
    expect(labelled.origin.format).toBe('json');
    // Unfinished JSON is not converted to XML as if it were plain text
    expect(switchTemplateFormat(labelled.origin, '{"id": ', 'json', 'xml').change.ok).toBe(false);
  });
});
