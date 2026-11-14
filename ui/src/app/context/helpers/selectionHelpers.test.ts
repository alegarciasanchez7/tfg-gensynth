import { describe, expect, it } from 'vitest';
import { selectionExists } from './selectionHelpers';
import type { Group, Variable } from '../../types';

const groups = [{ id: 'g1', flows: [{ id: 'f1' }] }] as unknown as Group[];
const variables = [{ id: 'v1' }] as unknown as Variable[];

describe('selectionExists', () => {
  it('finds the selected group, flow and variable', () => {
    expect(selectionExists({ type: 'group', groupId: 'g1' }, groups, variables)).toBe(true);
    expect(selectionExists({ type: 'flow', groupId: 'g1', flowId: 'f1' }, groups, variables)).toBe(true);
    expect(selectionExists({ type: 'variable', variableId: 'v1' }, groups, variables)).toBe(true);
  });

  it('reports a selection whose item was removed', () => {
    expect(selectionExists({ type: 'group', groupId: 'g2' }, groups, variables)).toBe(false);
    expect(selectionExists({ type: 'flow', groupId: 'g1', flowId: 'f2' }, groups, variables)).toBe(false);
    expect(selectionExists({ type: 'flow', groupId: 'g2', flowId: 'f1' }, groups, variables)).toBe(false);
    expect(selectionExists({ type: 'variable', variableId: 'v2' }, groups, variables)).toBe(false);
  });

  it('always keeps an empty selection', () => {
    expect(selectionExists({ type: 'none' }, [], [])).toBe(true);
  });
});
