import { describe, expect, it } from 'vitest';
import { findFormulaMatches } from './formulaTokens';

// The regex this helper replaces, used as the reference behaviour.
const regexFormulaMatches = (text: string) =>
  [...text.matchAll(/(\{\{[^}]+\}\})|\b(pi|e)\b/gi)].map((m) => ({
    kind: m[1] ? 'reference' : 'constant',
    start: m.index,
    end: m.index + m[0].length,
    text: m[0],
  }));

const SAMPLES = [
  '',
  'plain text',
  '{{a}}',
  'ID-{{counter}}-{{ name }}',
  '{{}}',
  '{{a}',
  '{{a}b}}',
  '{{{a}}}',
  '{{{{a}}',
  '{{}{{a}}',
  '{{a{{b}}',
  '}}{{x}}{{',
  '{{ {{x}} }}',
  '{{a}}}}',
  '{{temp}} * pi + e',
  'sin(pi/2) + {{pi}} + {{E}} + PI',
  'speed*e2 + pie + e',
  '{{x}}pi{{y}}e',
];

/** Small deterministic generator so the fuzz cases are reproducible. */
const randomStrings = (count: number, alphabet: string, maxLength: number): string[] => {
  let seed = 42;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed;
  };
  return Array.from({ length: count }, () => {
    const length = next() % (maxLength + 1);
    return Array.from({ length }, () => alphabet[next() % alphabet.length]).join('');
  });
};

describe('findFormulaMatches', () => {
  it('finds the same tokens as the original regex on representative formulas', () => {
    for (const sample of SAMPLES) {
      expect(findFormulaMatches(sample)).toEqual(regexFormulaMatches(sample));
    }
  });

  it('matches the original regex on random formula-like inputs', () => {
    for (const sample of randomStrings(5000, '{}piPe x', 16)) {
      expect(findFormulaMatches(sample)).toEqual(regexFormulaMatches(sample));
    }
  });

  it('handles many unclosed braces between constants quickly', () => {
    const formula = '{{ pi '.repeat(20_000);
    const started = performance.now();
    expect(findFormulaMatches(formula)).toHaveLength(20_000);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
