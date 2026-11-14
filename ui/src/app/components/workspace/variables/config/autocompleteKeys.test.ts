import { describe, expect, it } from 'vitest';
import { autocompleteKeyAction, cycleIndex, opensVariableAutocomplete } from './autocompleteKeys';

describe('autocompleteKeyAction', () => {
  it('maps the navigation keys', () => {
    expect(autocompleteKeyAction('ArrowDown')).toBe('next');
    expect(autocompleteKeyAction('ArrowUp')).toBe('previous');
    expect(autocompleteKeyAction('Enter')).toBe('insert');
    expect(autocompleteKeyAction('Tab')).toBe('insert');
    expect(autocompleteKeyAction('Escape')).toBe('close');
  });

  it('lets any other key be typed', () => {
    expect(autocompleteKeyAction('a')).toBeNull();
    expect(autocompleteKeyAction('{')).toBeNull();
    expect(autocompleteKeyAction('constructor')).toBeNull();
  });
});

describe('cycleIndex', () => {
  it('wraps around both ends', () => {
    expect(cycleIndex(0, 1, 3)).toBe(1);
    expect(cycleIndex(2, 1, 3)).toBe(0);
    expect(cycleIndex(0, -1, 3)).toBe(2);
  });
});

describe('opensVariableAutocomplete', () => {
  it('opens when the text before the cursor ends with {', () => {
    expect(opensVariableAutocomplete('a + {', 5)).toBe(true);
    expect(opensVariableAutocomplete('{x', 1)).toBe(true);
  });

  it('stays closed otherwise', () => {
    expect(opensVariableAutocomplete('a + ', 4)).toBe(false);
    expect(opensVariableAutocomplete('x{', 1)).toBe(false);
  });
});
