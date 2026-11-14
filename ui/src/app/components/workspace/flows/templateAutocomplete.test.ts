import { describe, expect, it } from 'vitest';
import type { ListItemConfig, Variable } from '../../../types';
import {
  autocompleteQuery,
  buildAutocompleteOptions,
  filterAutocompleteOptions,
  getEffectiveListItems,
  isVariableAccessible,
  variableAutocompleteOptions,
} from './templateAutocomplete';

const options = [
  { name: 'uuid', scope: 'system' },
  { name: 'ts', scope: 'system' },
  { name: 'flow.name', scope: 'system' },
  { name: 'site', scope: 'group' },
  { name: 'temperature', scope: 'local' },
  { name: 'temperature.round', scope: 'local' },
];

const names = (query: string) => filterAutocompleteOptions(options, query).map(o => o.name);

describe('filterAutocompleteOptions', () => {
  it('does not match built-ins through the word "system"', () => {
    expect(names('te')).toEqual(['temperature', 'temperature.round', 'site']);
  });

  it('puts prefix matches before substring matches', () => {
    expect(names('s')).toEqual(['site', 'ts']);
    expect(names('round')).toEqual(['temperature.round']);
  });

  it('matches the inserted reference (scope.name) and keeps everything for an empty query', () => {
    expect(names('local.temp')).toEqual(['temperature', 'temperature.round']);
    expect(names('')).toHaveLength(options.length);
  });
});

const variable = (overrides: Partial<Variable>): Variable => ({
  id: overrides.name ?? 'v',
  name: 'v',
  type: 'numeric',
  scope: 'global',
  config: {},
  ...overrides,
});

const optionNames = (v: Variable) => variableAutocompleteOptions(v).map(o => o.name);

describe('variableAutocompleteOptions', () => {
  it('offers the value and the sub-properties of simple types', () => {
    expect(optionNames(variable({ name: 'n', type: 'numeric' }))).toEqual([
      'n', 'n.integerPart', 'n.decimalPart', 'n.abs', 'n.round', 'n.floor', 'n.ceil', 'n.sign',
    ]);
    expect(variableAutocompleteOptions(variable({ name: 's', type: 'string', scope: 'local' }))[0])
      .toEqual({ name: 's', scope: 'local', detail: 'String Value' });
    expect(optionNames(variable({ name: 'b', type: 'boolean' }))).toEqual(['b', 'b.inverse', 'b.asNumber', 'b.asString', 'b.upper']);
    expect(optionNames(variable({ name: 't', type: 'temporal' }))).toHaveLength(13);
  });

  it('offers only the value for an unknown type', () => {
    const custom = { ...variable({ name: 'c' }), type: 'custom' } as unknown as Variable;
    expect(variableAutocompleteOptions(custom)).toEqual([{ name: 'c', scope: 'global' }]);
  });

  it('offers size/first/last and items only for Fixed Subset lists', () => {
    expect(variableAutocompleteOptions(variable({ name: 'l', type: 'list' }))).toEqual([
      { name: 'l', scope: 'global', detail: 'Single Item Selection' },
    ]);
    const fixed = variable({
      name: 'l',
      type: 'list',
      config: {
        selectionStrategy: 'FIXED_SUBSET',
        items: [{ id: 'a', value: 'red' }, { id: 'b', value: '', embeddedType: 'numeric' }, { id: 'c' }],
        itemOrder: ['c', 'a'],
      },
    });
    expect(variableAutocompleteOptions(fixed)).toEqual([
      { name: 'l', scope: 'global', detail: 'Fixed Subset / Entire List' },
      { name: 'l.size', scope: 'global', detail: 'List Item Count' },
      { name: 'l.first', scope: 'global', detail: 'First List Item' },
      { name: 'l.last', scope: 'global', detail: 'Last List Item' },
      { name: 'l.item0', scope: 'global', detail: 'item0 (Item 3)' },
      { name: 'l.item1', scope: 'global', detail: 'item1 (red)' },
      { name: 'l.item2', scope: 'global', detail: 'item2 (numeric)' },
    ]);
  });

  it('offers the coordinates of the point coordinate system and the graph properties', () => {
    expect(optionNames(variable({ name: 'p', type: 'point' }))).toEqual(['p', 'p.x', 'p.y', 'p.z']);
    expect(optionNames(variable({ name: 'p', type: 'point', config: { coordinateSystem: 'CARTESIAN_2D' } })))
      .toEqual(['p', 'p.x', 'p.y']);
    expect(optionNames(variable({ name: 'p', type: 'point', config: { coordinateSystem: 'GEOSPATIAL' } })))
      .toEqual(['p', 'p.latitude', 'p.longitude', 'p.altitude', 'p.altitudeUnit', 'p.altitudeReference']);
    expect(optionNames(variable({
      name: 'p', type: 'point', config: { coordinateSystem: 'GEOSPATIAL', geospatialFormat: 'DEGREES_MINUTES_SECONDS' },
    }))).toContain('p.longitudeDecimal');
    expect(optionNames(variable({ name: 'p', type: 'point', config: { pattern: 'GRAPH_ROUTE' } }))).toContain('p.isPaused');
    expect(optionNames(variable({ name: 'p', type: 'point', config: { graphNodes: [{ id: 'n', x: 0, y: 0 }] } })))
      .toContain('p.nodeId');
  });
});

describe('getEffectiveListItems', () => {
  it('labels plain values, objects without id and no config', () => {
    expect(getEffectiveListItems(variable({ type: 'list', config: { items: ['x', 5] as unknown as ListItemConfig[] } })))
      .toEqual([{ id: 'item_1', label: 'x' }, { id: 'item_2', label: '5' }]);
    expect(getEffectiveListItems({ ...variable({ type: 'list' }), config: undefined } as unknown as Variable)).toEqual([]);
  });

  it('orders by id, then by value, unordered items last', () => {
    const v = variable({
      type: 'list',
      config: { items: [{ id: 'a', value: 'one' }, { id: 'b', value: 'two' }, { id: 'c', value: 'three' }], itemOrder: ['three', 'b'] },
    });
    expect(getEffectiveListItems(v).map(i => i.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('buildAutocompleteOptions', () => {
  const variables = [
    variable({ name: 'mine', scope: 'local', flowId: 'f1' }),
    variable({ name: 'other', scope: 'local', flowId: 'f2' }),
    variable({ name: 'grp', scope: 'group', groupId: 'g1' }),
    variable({ name: 'otherGrp', scope: 'group', groupId: 'g2' }),
    variable({ name: 'all', scope: 'global' }),
  ];

  it('lists the built-ins first, then the variables the flow can reach', () => {
    const options = buildAutocompleteOptions(variables, 'f1', 'g1');
    expect(options[0]).toEqual({ name: 'uuid', scope: 'system', detail: 'Random UUID' });
    const roots = options.filter(o => o.scope !== 'system' && !o.name.includes('.')).map(o => o.name);
    expect(roots).toEqual(['mine', 'grp', 'all']);
  });

  it('tells which variables a flow can reach', () => {
    expect(isVariableAccessible(variables[0], 'f1', 'g1')).toBe(true);
    expect(isVariableAccessible(variables[1], 'f1', 'g1')).toBe(false);
    expect(isVariableAccessible(variables[3], 'f1', 'g1')).toBe(false);
    expect(isVariableAccessible({ ...variables[0], scope: 'other' } as unknown as Variable, 'f1', 'g1')).toBe(false);
  });
});

describe('autocompleteQuery', () => {
  it('returns the text typed after the last {{ before the cursor', () => {
    expect(autocompleteQuery('a {{x}} {{ Te', 13)).toBe('te');
    expect(autocompleteQuery('{{', 2)).toBe('');
    expect(autocompleteQuery('no braces', 9)).toBeNull();
    expect(autocompleteQuery('{{late', 0)).toBeNull();
  });
});
