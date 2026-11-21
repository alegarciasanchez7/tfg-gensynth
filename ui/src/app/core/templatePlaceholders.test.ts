import { describe, expect, it } from 'vitest';
import { findTemplatePlaceholders, isSystemPlaceholder, SYSTEM_PLACEHOLDERS } from './templatePlaceholders';

describe('templatePlaceholders', () => {
  it('recognises every built-in, including flow.name', () => {
    expect(SYSTEM_PLACEHOLDERS.map(p => p.name)).toEqual(['uuid', 'ts', 'n', 'flow.name']);
    for (const p of SYSTEM_PLACEHOLDERS) {
      expect(isSystemPlaceholder(p.name)).toBe(true);
    }
  });

  it('does not treat variables or other flow properties as built-ins', () => {
    expect(isSystemPlaceholder('temperature')).toBe(false);
    expect(isSystemPlaceholder('flow.id')).toBe(false);
    expect(isSystemPlaceholder('local.flow')).toBe(false);
  });

  describe('findTemplatePlaceholders', () => {
    it('finds every placeholder with its position and untrimmed spec', () => {
      expect(findTemplatePlaceholders('{"t": {{ local.temp }}, "id": "{{uuid}}"}')).toEqual([
        { start: 6, end: 22, spec: ' local.temp ' },
        { start: 31, end: 39, spec: 'uuid' },
      ]);
    });

    it('returns nothing for templates without complete placeholders', () => {
      expect(findTemplatePlaceholders('')).toEqual([]);
      expect(findTemplatePlaceholders('plain text')).toEqual([]);
      expect(findTemplatePlaceholders('{{}}')).toEqual([]);
      expect(findTemplatePlaceholders('{{open')).toEqual([]);
      expect(findTemplatePlaceholders('{{a} b}}')).toEqual([]);
    });

    it.each([
      ['{{a}}{{b}}', [{ start: 0, end: 5, spec: 'a' }, { start: 5, end: 10, spec: 'b' }]],
      ['{{{a}}}', [{ start: 0, end: 6, spec: '{a' }]],
      ['{{{{a}}', [{ start: 0, end: 7, spec: '{{a' }]],
      ['{{}}{{x}}', [{ start: 4, end: 9, spec: 'x' }]],
      ['{{a}}}}{{', [{ start: 0, end: 5, spec: 'a' }]],
      ['{{a{{b}}', [{ start: 0, end: 8, spec: 'a{{b' }]],
      ['{ {a}} {{b} }} {{c\nd}}', [{ start: 15, end: 22, spec: 'c\nd' }]],
    ])('matches what /\\{\\{([^}]+)\\}\\}/g matched in %j', (template, expected) => {
      expect(findTemplatePlaceholders(template)).toEqual(expected);
    });

    it('scans many unclosed openings quickly', () => {
      const template = '{{'.repeat(50_000) + 'x}';
      const started = performance.now();
      expect(findTemplatePlaceholders(template)).toEqual([]);
      expect(performance.now() - started).toBeLessThan(1000);
    });
  });
});
