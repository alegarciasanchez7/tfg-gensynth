import { describe, expect, it } from 'vitest';
import { isSystemPlaceholder, SYSTEM_PLACEHOLDERS } from './templatePlaceholders';

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
});
