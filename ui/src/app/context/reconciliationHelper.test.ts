import { describe, expect, it } from 'vitest';
import { logReconciliationResults, reconcileState } from './reconciliationHelper';
import { OptimisticManager } from './optimisticManager';
import type { Group, Variable } from '../types';

const group = (id: string): Group => ({ id, name: id, flows: [] }) as unknown as Group;
const variable = (id: string): Variable => ({ id, name: id, type: 'numeric', scope: 'global', config: {} });

function pendingCreate(manager: OptimisticManager, entityType: 'group' | 'variable', entityId: string) {
  manager.register({
    commandId: `create:${entityId}`,
    kind: 'create',
    entityType,
    entityId,
    createdAt: Date.now(),
    ttlMs: 5000,
    applied: true,
  });
}

describe('reconcileState', () => {
  it('keeps a fresh optimistic create that the server does not know yet, once', () => {
    const manager = new OptimisticManager();
    pendingCreate(manager, 'group', 'g-tmp');
    pendingCreate(manager, 'variable', 'v-tmp');
    const result = reconcileState({
      optimisticManager: manager,
      localState: { groups: [group('g-tmp')], variables: [variable('v-tmp')] },
      serverState: { groups: [group('g1')], variables: [] },
    });
    expect(result.groupsToUpdate.map((g) => g.id)).toEqual(['g1', 'g-tmp']);
    expect(result.variablesToUpdate.map((v) => v.id)).toEqual(['v-tmp']);
  });

  it('summarizes the result', () => {
    const text = logReconciliationResults({
      groupsToUpdate: [],
      variablesToUpdate: [],
      operationsResolved: [{ commandId: 'c1', success: true }, { commandId: 'c2', success: false }],
      conflicts: [{ resourceId: 'g1', type: 'group', localValue: null, serverValue: null }],
    });
    expect(text.split('\n')).toEqual([
      'Reconciliation Results:',
      '  Resolved Operations: 2',
      '  - Success: 1',
      '  - Failed: 1',
      '  Conflicts Detected: 1',
      '  Conflict Details:',
      '    - group g1: local vs server',
    ]);
  });
});
