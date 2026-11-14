import { describe, expect, it } from 'vitest';
import type { Flow, Group, Variable } from '../../types';
import { findInvalidItemReference } from './itemReferenceValidation';
import { parseItemAccess } from '../actions/startValidation';

const flow = (id: string, template?: string): Flow => ({
  id,
  name: `Flow ${id}`,
  technology: 'file',
  connectionStatus: 'disconnected',
  throughput: '0 msg/s',
  latency: 0,
  hasError: false,
  interval: 1000,
  burst: 1,
  everyTicks: 1,
  topic: '',
  host: '',
  port: 0,
  enabled: true,
  template,
});

const group = (flows: Flow[]): Group => ({
  id: 'g1',
  name: 'Group',
  status: 'stopped',
  throughput: '0 msg/s',
  description: '',
  threads: 1,
  outputMode: 'parallel',
  sequentialOrder: 'flow',
  flows,
  expanded: false,
  enabled: true,
});

const list = (overrides: Partial<Variable> & { strategy?: string }): Variable => {
  const { strategy, ...rest } = overrides;
  return {
    id: 'v1',
    name: 'colors',
    type: 'list',
    scope: 'global',
    config: strategy ? { selectionStrategy: strategy } : {},
    ...rest,
  } as Variable;
};

const errorFor = (flowName: string, varName: string, strategy: string) =>
  `Invalid item reference in flow '${flowName}': Variable '${varName}' uses strategy '${strategy}' (not 'FIXED_SUBSET') and cannot be referenced with sub-item index (.itemX).`;

describe('parseItemAccess', () => {
  it('reads name.itemX without a scope', () => {
    expect(parseItemAccess('colors.item1')).toEqual({ scope: null, name: 'colors' });
  });

  it('reads scope.name.itemX with a lower-cased scope', () => {
    expect(parseItemAccess('GLOBAL.colors.Item2')).toEqual({ scope: 'global', name: 'colors' });
  });

  it('ignores specs that do not read a sub-item', () => {
    expect(parseItemAccess('colors')).toBeNull();
    expect(parseItemAccess('global.colors')).toBeNull();
    expect(parseItemAccess('a.b.c')).toBeNull();
  });
});

describe('findInvalidItemReference', () => {
  it('accepts a missing group or flows without template', () => {
    expect(findInvalidItemReference(undefined, [], {})).toBeNull();
    expect(findInvalidItemReference(group([flow('f1')]), [list({ strategy: 'SEQUENTIAL' })], {})).toBeNull();
  });

  it('rejects an item access to a list that is not FIXED_SUBSET', () => {
    const g = group([flow('f1', '{"c": "{{colors.item1}}"}')]);
    expect(findInvalidItemReference(g, [list({ strategy: 'SEQUENTIAL' })], {}))
      .toBe(errorFor('Flow f1', 'colors', 'SEQUENTIAL'));
  });

  it('accepts FIXED_SUBSET lists, lists without strategy and non-list variables', () => {
    const g = group([flow('f1', '{{colors.item1}}')]);
    expect(findInvalidItemReference(g, [list({ strategy: 'FIXED_SUBSET' })], {})).toBeNull();
    expect(findInvalidItemReference(g, [list({})], {})).toBeNull();
    expect(findInvalidItemReference(g, [list({ type: 'string', strategy: 'SEQUENTIAL' })], {})).toBeNull();
  });

  it('skips system placeholders and plain references', () => {
    const g = group([flow('f1', '{{colors}} {{global.colors}}')]);
    expect(findInvalidItemReference(g, [list({ strategy: 'SEQUENTIAL' })], {})).toBeNull();
  });

  it('prefers the edited template of the flow', () => {
    const g = group([flow('f1', '{{colors.item1}}')]);
    const variables = [list({ strategy: 'SHUFFLE' })];
    expect(findInvalidItemReference(g, variables, { f1: '{{other}}' })).toBeNull();
    expect(findInvalidItemReference(group([flow('f1')]), variables, { f1: '{{colors.item1}}' }))
      .toBe(errorFor('Flow f1', 'colors', 'SHUFFLE'));
  });

  it('resolves the variable by scope and visibility from the flow', () => {
    const g = group([flow('f1', '{{local.colors.item1}}')]);
    const otherFlow = list({ scope: 'local', flowId: 'f2', strategy: 'SEQUENTIAL' });
    const ownFlow = list({ id: 'v2', scope: 'local', flowId: 'f1', strategy: 'SEQUENTIAL' });
    const global = list({ id: 'v3', strategy: 'SEQUENTIAL' });
    expect(findInvalidItemReference(g, [otherFlow, global], {})).toBeNull();
    expect(findInvalidItemReference(g, [otherFlow, ownFlow], {})).toBe(errorFor('Flow f1', 'colors', 'SEQUENTIAL'));

    const groupScoped = group([flow('f1', '{{colors.item1}}')]);
    expect(findInvalidItemReference(groupScoped, [list({ scope: 'group', groupId: 'g2', strategy: 'SEQUENTIAL' })], {})).toBeNull();
    expect(findInvalidItemReference(groupScoped, [list({ scope: 'group', groupId: 'g1', strategy: 'SEQUENTIAL' })], {}))
      .toBe(errorFor('Flow f1', 'colors', 'SEQUENTIAL'));
  });

  it('reports the first invalid flow of the group', () => {
    const g = group([flow('f1', '{{ok}}'), flow('f2', '{{colors.item1}}'), flow('f3', '{{colors.item2}}')]);
    expect(findInvalidItemReference(g, [list({ strategy: 'MARKOV_CHAIN' })], {}))
      .toBe(errorFor('Flow f2', 'colors', 'MARKOV_CHAIN'));
  });
});
