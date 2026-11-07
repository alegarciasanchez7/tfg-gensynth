import { describe, it, expect } from 'vitest';
import { applyNamingPattern, buildPatternNames } from './namingPattern';

describe('namingPattern', () => {
  it('replaces the name and index tokens', () => {
    expect(applyNamingPattern('${name} ${index}', 'Sensor', 3)).toBe('Sensor 3');
    expect(applyNamingPattern('${name} (Clone ${index})', 'Flow', 1)).toBe('Flow (Clone 1)');
  });

  it('replaces every occurrence, like the Core', () => {
    expect(applyNamingPattern('${name}-${index}-${index}', 'x', 2)).toBe('x-2-2');
  });

  it('builds one name per item', () => {
    expect(buildPatternNames('${name} ${index}', 'Sensor', 3)).toEqual(['Sensor 1', 'Sensor 2', 'Sensor 3']);
    expect(buildPatternNames('${name}', 'x', 0)).toEqual([]);
  });

  it('applies index offsets, so clones of H1 can be H2 and H3', () => {
    expect(buildPatternNames('H${index+1}', 'H1', 2)).toEqual(['H2', 'H3']);
    expect(applyNamingPattern('Room ${index - 1}', 'R', 1)).toBe('Room 0');
    expect(applyNamingPattern('${other} ${index}', 'n', 4)).toBe('${other} 4');
  });
});
