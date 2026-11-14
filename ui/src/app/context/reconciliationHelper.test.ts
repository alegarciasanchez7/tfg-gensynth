import { describe, expect, it, vi } from 'vitest';
import { applyReconciliation, logReconciliationResults, reconcileState } from './reconciliationHelper';
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

function pending(
  manager: OptimisticManager,
  kind: 'create' | 'update' | 'delete',
  entityType: 'group' | 'variable' | 'flow',
  entityId: string,
  fresh = true,
) {
  manager.register({
    commandId: `${kind}:${entityId}`,
    kind,
    entityType,
    entityId,
    createdAt: fresh ? Date.now() : Date.now() - 10_000,
    ttlMs: 5000,
    applied: true,
  });
}

describe('reconcileState', () => {
  it('returns the server state when there is no optimistic manager', () => {
    const result = reconcileState({
      optimisticManager: null,
      localState: { groups: [group('g-tmp')], variables: [] },
      serverState: { groups: [group('g1')], variables: [variable('v1')] },
    });
    expect(result).toEqual({
      groupsToUpdate: [group('g1')],
      variablesToUpdate: [variable('v1')],
      operationsResolved: [],
      conflicts: [],
    });
  });

  it('resolves creates and updates confirmed by the server and logs the conflicts', () => {
    const manager = new OptimisticManager();
    pending(manager, 'create', 'group', 'g1');
    pending(manager, 'update', 'variable', 'v1');
    const localGroup = { ...group('g1'), name: 'local name' };
    const result = reconcileState({
      optimisticManager: manager,
      localState: { groups: [localGroup], variables: [variable('v1')] },
      serverState: { groups: [group('g1')], variables: [variable('v1')] },
    });
    expect(result.operationsResolved).toEqual([
      { commandId: 'create:g1', success: true, reason: 'Entity created on server' },
      { commandId: 'update:v1', success: true, reason: 'Variable updated on server' },
    ]);
    expect(result.conflicts).toEqual([
      { resourceId: 'g1', type: 'group', localValue: localGroup, serverValue: group('g1') },
    ]);
  });

  it('re-attaches the flow or group of a variable before logging its conflict', () => {
    const manager = new OptimisticManager();
    pending(manager, 'update', 'variable', 'v1');
    pending(manager, 'update', 'variable', 'v2');
    const local1: Variable = { ...variable('v1'), scope: 'local', flowId: 'f1', description: 'x' };
    const local2: Variable = { ...variable('v2'), scope: 'group', groupId: 'g1', description: 'x' };
    const server1: Variable = { ...variable('v1'), scope: 'local' };
    const server2: Variable = { ...variable('v2'), scope: 'group' };
    const result = reconcileState({
      optimisticManager: manager,
      localState: { groups: [], variables: [local1, local2] },
      serverState: { groups: [], variables: [server1, server2] },
    });
    expect(result.conflicts.map((c) => c.resourceId)).toEqual(['v1', 'v2']);
    expect(server1.flowId).toBe('f1');
    expect(server2.groupId).toBe('g1');
  });

  it('matches a server entity by the real id of a temporary id', () => {
    const manager = new OptimisticManager();
    manager.register({
      commandId: 'create:tmp',
      kind: 'create',
      entityType: 'group',
      entityId: 'tmp',
      tempIdMapping: { tempId: 'tmp', realId: 'g1' },
      createdAt: Date.now(),
      ttlMs: 5000,
      applied: true,
    });
    const result = reconcileState({
      optimisticManager: manager,
      localState: { groups: [], variables: [] },
      serverState: { groups: [group('g1')], variables: [] },
    });
    expect(result.operationsResolved).toEqual([{ commandId: 'create:tmp', success: true, reason: 'Entity created on server' }]);
  });

  it('fails expired creates and updates that the server does not know', () => {
    const manager = new OptimisticManager();
    pending(manager, 'create', 'group', 'g1', false);
    pending(manager, 'update', 'variable', 'v1', false);
    const result = reconcileState({
      optimisticManager: manager,
      localState: { groups: [group('g1')], variables: [variable('v1')] },
      serverState: { groups: [], variables: [] },
    });
    expect(result.operationsResolved).toEqual([
      { commandId: 'create:g1', success: false, reason: 'Create timed out' },
      { commandId: 'update:v1', success: false, reason: 'Update timed out' },
    ]);
    expect(result.groupsToUpdate).toEqual([]);
  });

  it('resolves, hides or fails the pending deletes', () => {
    const manager = new OptimisticManager();
    pending(manager, 'delete', 'group', 'gone');
    pending(manager, 'delete', 'variable', 'v-gone');
    pending(manager, 'delete', 'group', 'g1');
    pending(manager, 'delete', 'variable', 'v1');
    pending(manager, 'delete', 'group', 'g2', false);
    pending(manager, 'delete', 'flow', 'f1');
    const result = reconcileState({
      optimisticManager: manager,
      localState: { groups: [], variables: [] },
      serverState: { groups: [group('g1'), group('g2')], variables: [variable('v1')] },
    });
    expect(result.operationsResolved).toEqual([
      { commandId: 'delete:gone', success: true, reason: 'Entity deleted on server' },
      { commandId: 'delete:v-gone', success: true, reason: 'Variable deleted on server' },
      { commandId: 'delete:g2', success: false, reason: 'Delete timed out' },
    ]);
    expect(result.groupsToUpdate.map((g) => g.id)).toEqual(['g2']);
    expect(result.variablesToUpdate).toEqual([]);
  });

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

describe('applyReconciliation', () => {
  it('removes the resolved operations and marks the failed ones', () => {
    const manager = new OptimisticManager();
    pending(manager, 'create', 'group', 'g1');
    pending(manager, 'update', 'group', 'g2');
    const markFailed = vi.spyOn(manager, 'markFailed');
    const remove = vi.spyOn(manager, 'remove');
    applyReconciliation({
      groupsToUpdate: [],
      variablesToUpdate: [],
      operationsResolved: [
        { commandId: 'create:g1', success: true },
        { commandId: 'update:g2', success: false },
      ],
      conflicts: [],
    }, manager);
    expect(remove).toHaveBeenCalledWith('create:g1');
    expect(markFailed).toHaveBeenCalledWith('update:g2', 'Reconciliation failed');
  });

  it('does nothing without an optimistic manager', () => {
    expect(() => applyReconciliation({ groupsToUpdate: [], variablesToUpdate: [], operationsResolved: [{ commandId: 'c', success: true }], conflicts: [] }, null)).not.toThrow();
  });
});
