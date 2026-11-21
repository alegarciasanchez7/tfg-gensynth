import { describe, expect, it } from 'vitest';
import type { Flow, Group, Variable } from '../../types';
import {
  brokenReferenceErrors,
  findItemAccessTarget,
  formulaDependencies,
  itemReferenceErrors,
  parseItemAccess,
} from './startValidation';

const variable = (overrides: Partial<Variable>): Variable => ({
  id: overrides.name ?? 'v',
  name: 'v',
  type: 'numeric',
  scope: 'global',
  config: {},
  ...overrides,
});

const flow = (id: string, template?: string): Flow => ({ id, name: `flow ${id}`, template }) as unknown as Flow;
const group = (id: string, flows: Flow[]): Group => ({ id, name: id, flows }) as unknown as Group;

describe('formulaDependencies', () => {
  it('returns the [name] and {{name}} references in order', () => {
    expect(formulaDependencies('[a] + {{b}} * [c-1]')).toEqual(['a', 'b', 'c-1']);
  });

  it('returns nothing without a formula', () => {
    expect(formulaDependencies()).toEqual([]);
    expect(formulaDependencies('')).toEqual([]);
  });
});

describe('brokenReferenceErrors', () => {
  it('reports formula references to nonexistent variables, except pi and e', () => {
    const variables = [
      variable({ name: 'a', config: { pattern: 'FORMULA', formula: '[PI] * [e] + [missing] + [b]' } }),
      variable({ name: 'b' }),
    ];
    expect(brokenReferenceErrors(variables)).toEqual([
      "Variable 'a' references nonexistent 'missing' in its formula.",
    ]);
  });

  it('ignores formulas of variables that are not numeric formulas', () => {
    const variables = [
      variable({ name: 'a', config: { pattern: 'RANDOM', formula: '[missing]' } }),
      variable({ name: 's', type: 'string', config: { pattern: 'FORMULA', formula: '[missing]' } }),
    ];
    expect(brokenReferenceErrors(variables)).toEqual([]);
  });

  it('reports conditional rules whose trimmed target does not exist', () => {
    const variables = [
      variable({
        name: 'a',
        config: {
          conditionalRules: [
            { targetVariable: ' ghost ', operator: 'EQUALS', value: 1, overrides: {} },
            { targetVariable: 'a', operator: 'EQUALS', value: 1, overrides: {} },
            { targetVariable: '  ', operator: 'EQUALS', value: 1, overrides: {} },
          ],
        },
      }),
    ];
    expect(brokenReferenceErrors(variables)).toEqual([
      "Variable 'a' references nonexistent 'ghost' in conditional rules.",
    ]);
  });
});

describe('parseItemAccess', () => {
  it('reads list.itemX and scope.list.itemX', () => {
    expect(parseItemAccess('colors.item2')).toEqual({ scope: null, name: 'colors' });
    expect(parseItemAccess('Global.colors.ITEM1')).toEqual({ scope: 'global', name: 'colors' });
  });

  it('returns null for specs that do not read an item', () => {
    expect(parseItemAccess('colors')).toBeNull();
    expect(parseItemAccess('global.colors')).toBeNull();
    expect(parseItemAccess('a.b.c')).toBeNull();
  });
});

describe('findItemAccessTarget', () => {
  const g1 = group('g1', []);
  const f1 = flow('f1');

  it('finds the variable visible from the flow', () => {
    const local = variable({ id: 'l', name: 'x', scope: 'local', flowId: 'f1' });
    const otherLocal = variable({ id: 'o', name: 'x', scope: 'local', flowId: 'f2' });
    expect(findItemAccessTarget([otherLocal, local], { scope: null, name: 'x' }, g1, f1)).toBe(local);
  });

  it('matches the scope written in the placeholder', () => {
    const global = variable({ id: 'gl', name: 'x', scope: 'global' });
    const grouped = variable({ id: 'gr', name: 'x', scope: 'group', groupId: 'g1' });
    expect(findItemAccessTarget([global, grouped], { scope: 'group', name: 'x' }, g1, f1)).toBe(grouped);
    expect(findItemAccessTarget([grouped], { scope: 'group', name: 'x' }, group('g2', []), f1)).toBeUndefined();
  });
});

describe('itemReferenceErrors', () => {
  const list = (strategy?: string) =>
    variable({ name: 'colors', type: 'list', config: strategy ? { selectionStrategy: strategy } : {} });

  it('reports item access to a list that is not FIXED_SUBSET', () => {
    const groups = [group('g1', [flow('f1', '{"c": "{{colors.item1}}", "id": "{{uuid}}"}')])];
    expect(itemReferenceErrors([list('SEQUENTIAL')], groups, {})).toEqual([
      "Invalid item reference in flow 'flow f1': Variable 'colors' uses strategy 'SEQUENTIAL' (not 'FIXED_SUBSET') and cannot be referenced with sub-item index (.itemX).",
    ]);
  });

  it('accepts FIXED_SUBSET lists, lists without strategy and non-list variables', () => {
    const groups = [group('g1', [flow('f1', '{{colors.item1}}')])];
    expect(itemReferenceErrors([list('FIXED_SUBSET')], groups, {})).toEqual([]);
    expect(itemReferenceErrors([list()], groups, {})).toEqual([]);
    expect(itemReferenceErrors([variable({ name: 'colors' })], groups, {})).toEqual([]);
  });

  it('checks the edited template before the saved one and skips empty templates', () => {
    const groups = [group('g1', [flow('f1', '{{colors.item1}}'), flow('f2')])];
    expect(itemReferenceErrors([list('SHUFFLE')], groups, { f1: '{{colors}}' })).toEqual([]);
    expect(itemReferenceErrors([list('SHUFFLE')], groups, { f2: '{{colors.item3}}' })).toHaveLength(2);
  });
});
