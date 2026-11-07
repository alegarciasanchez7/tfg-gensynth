import { describe, expect, it } from 'vitest';
import { detectTemplateFormat, isTemplateInFormat, resolveTemplateFormat } from './templateFormat';

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

  it('tells whether a template already is valid in a format', () => {
    expect(isTemplateInFormat(JSON_TEMPLATE, 'json')).toBe(true);
    expect(isTemplateInFormat(JSON_TEMPLATE, 'csv')).toBe(false);
    expect(isTemplateInFormat('id,t\n1,2', 'csv')).toBe(true);
    expect(isTemplateInFormat('anything', 'plain')).toBe(true);
  });
});
