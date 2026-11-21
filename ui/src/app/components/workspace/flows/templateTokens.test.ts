import { describe, expect, it } from 'vitest';
import type { Variable } from '../../../types';
import { isPlaceholderValid, isReferenceValid, parsePlaceholderReference, tokenizeTemplate } from './templateTokens';

const variable = (overrides: Partial<Variable>): Variable => ({
  id: overrides.name ?? 'v',
  name: 'v',
  type: 'numeric',
  scope: 'global',
  config: {},
  ...overrides,
});

const variables: Variable[] = [
  variable({ id: 'temp', name: 'temp', type: 'numeric', scope: 'local', flowId: 'f1' }),
  variable({ id: 'site', name: 'site', type: 'string', scope: 'group', groupId: 'g1' }),
  variable({ id: 'when', name: 'when', type: 'temporal', scope: 'global' }),
  variable({ id: 'pos', name: 'pos', type: 'point', scope: 'global' }),
  variable({ id: 'flag', name: 'flag', type: 'boolean', scope: 'global' }),
  variable({ id: 'colors', name: 'colors', type: 'list', scope: 'global', config: { selectionStrategy: 'FIXED_SUBSET' } }),
  variable({ id: 'pick', name: 'pick', type: 'list', scope: 'global' }),
];

const valid = (spec: string) => isPlaceholderValid(spec, variables, 'f1', 'g1');

describe('parsePlaceholderReference', () => {
  it('reads a bare name', () => {
    expect(parsePlaceholderReference('temp')).toEqual({ scope: null, name: 'temp', subProperty: null, isItemAccess: false });
  });

  it('reads a scope in any case, the name and the sub-property', () => {
    expect(parsePlaceholderReference('LOCAL.temp.round')).toEqual({
      scope: 'local', name: 'temp', subProperty: 'round', isItemAccess: false,
    });
    expect(parsePlaceholderReference('group.site')).toEqual({ scope: 'group', name: 'site', subProperty: null, isItemAccess: false });
  });

  it('reads a sub-property without a scope and detects item access', () => {
    expect(parsePlaceholderReference('colors.Item2')).toEqual({
      scope: null, name: 'colors', subProperty: 'Item2', isItemAccess: true,
    });
    expect(parsePlaceholderReference('temp.')).toEqual({ scope: null, name: 'temp', subProperty: '', isItemAccess: false });
  });
});

describe('isReferenceValid', () => {
  it('accepts any sub-property of a type without a known list', () => {
    const custom = { ...variable({}), type: 'custom' } as unknown as Variable;
    expect(isReferenceValid(custom, parsePlaceholderReference('v.anything'))).toBe(true);
  });
});

describe('isPlaceholderValid', () => {
  it('accepts built-ins and reachable variables', () => {
    expect(valid('uuid')).toBe(true);
    expect(valid('temp')).toBe(true);
    expect(valid('group.site')).toBe(true);
    expect(valid('temp.')).toBe(true);
  });

  it('rejects unknown and unreachable variables', () => {
    expect(valid('missing')).toBe(false);
    expect(isPlaceholderValid('temp', variables, 'other-flow', 'g1')).toBe(false);
    expect(valid('global.temp')).toBe(false);
  });

  it('checks the sub-properties of each type, ignoring case', () => {
    expect(valid('temp.ROUND')).toBe(true);
    expect(valid('temp.month')).toBe(false);
    expect(valid('site.upper')).toBe(true);
    expect(valid('site.round')).toBe(false);
    expect(valid('when.dayOfWeek')).toBe(true);
    expect(valid('when.abs')).toBe(false);
    expect(valid('pos.latitude')).toBe(true);
    expect(valid('pos.nodeName')).toBe(true);
    expect(valid('pos.year')).toBe(false);
    expect(valid('flag.asNumber')).toBe(true);
    expect(valid('flag.length')).toBe(false);
    expect(valid('colors.size')).toBe(true);
    expect(valid('colors.middle')).toBe(false);
  });

  it('accepts item access only on Fixed Subset lists (the default is Weighted Random)', () => {
    expect(valid('colors.item0')).toBe(true);
    expect(valid('global.colors.item1')).toBe(true);
    expect(valid('pick.item0')).toBe(false);
    expect(valid('pick.size')).toBe(true);
    expect(valid('temp.item0')).toBe(false);
  });
});

describe('tokenizeTemplate', () => {
  it('splits text and placeholders with their offsets and validity', () => {
    expect(tokenizeTemplate('a {{ temp }} b {{nope}}', variables, 'f1', 'g1')).toEqual([
      { start: 0, text: 'a ' },
      { start: 2, text: '{{ temp }}', isValid: true, isVariable: true },
      { start: 12, text: ' b ' },
      { start: 15, text: '{{nope}}', isValid: false, isVariable: true },
    ]);
  });

  it('handles adjacent placeholders and an empty template', () => {
    expect(tokenizeTemplate('{{uuid}}{{ts}}', variables, 'f1', 'g1')).toEqual([
      { start: 0, text: '{{uuid}}', isValid: true, isVariable: true },
      { start: 8, text: '{{ts}}', isValid: true, isVariable: true },
    ]);
    expect(tokenizeTemplate('', variables, 'f1', 'g1')).toEqual([]);
  });
});
