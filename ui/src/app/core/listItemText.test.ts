import { describe, expect, it } from 'vitest';
import { listItemText } from './listItemText';

describe('listItemText', () => {
  it('shows strings, numbers and booleans as they are', () => {
    expect(listItemText('red')).toBe('red');
    expect(listItemText(3)).toBe('3');
    expect(listItemText(false)).toBe('false');
  });

  it('shows a structured value as JSON', () => {
    expect(listItemText({ a: 1 })).toBe('{"a":1}');
    expect(listItemText(null)).toBe('null');
  });
});
