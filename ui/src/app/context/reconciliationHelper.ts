/**
 * Reconciliation Helper
 *
 * Handles state reconciliation after reconnection or errors.
 * Compares local state with server state and resolves conflicts.
 */

import type { Group, Variable } from '../types';
import type { OptimisticManager, OptimisticOperation } from './optimisticManager';

export interface ReconciliationContext {
  optimisticManager: OptimisticManager | null;
  localState: {
    groups: Group[];
    variables: Variable[];
  };
  serverState: {
    groups?: Group[];
    variables?: Variable[];
  };
}

export interface ReconciliationResult {
  groupsToUpdate: Group[];
  variablesToUpdate: Variable[];
  operationsResolved: Array<{
    commandId: string;
    success: boolean;
    reason?: string;
  }>;
  conflicts: Array<{
    resourceId: string;
    type: 'group' | 'variable';
    localValue: unknown;
    serverValue: unknown;
  }>;
}

/** How the pending operations of one entity kind (groups or variables) are reconciled. */
interface EntityReconcileSpec<T extends { id: string; }> {
  type: 'group' | 'variable';
  /** First word of the success reasons ("Entity created on server", "Variable deleted on server"). */
  label: 'Entity' | 'Variable';
  server: T[];
  local: T[];
  /** Fixes the server entity before a conflict is recorded (variables re-attach their flow/group). */
  beforeConflict?: (localEntity: T, serverEntity: T) => void;
}

/**
 * Robustness: if the server returns a variable without flowId/groupId but we have them locally,
 * and it is a local/group variable, re-attach them before flagging the conflict.
 */
function reattachVariableOwner(localEntity: Variable, serverEntity: Variable): void {
  if (localEntity.scope === 'local' && !serverEntity.flowId && localEntity.flowId) {
    serverEntity.flowId = localEntity.flowId;
  }
  if (localEntity.scope === 'group' && !serverEntity.groupId && localEntity.groupId) {
    serverEntity.groupId = localEntity.groupId;
  }
}

/**
 * Reconciles a pending create or update. Confirmed on the server: resolved (and a conflict is
 * logged when the local copy differs, the server wins). Not on the server yet: a fresh create
 * keeps its optimistic entity, an expired operation fails.
 *
 * @returns the entities to update, with the optimistic entity added when kept
 */
function reconcileCreateOrUpdate<T extends { id: string; }>(
  op: OptimisticOperation,
  spec: EntityReconcileSpec<T>,
  toUpdate: T[],
  result: ReconciliationResult,
  isFresh: boolean,
): T[] {
  const isCreate = op.kind === 'create';
  const serverEntity = spec.server.find(e => e && (e.id === op.entityId || (op.tempIdMapping?.realId === e.id)));
  const localEntity = spec.local.find(e => e?.id === op.entityId);

  if (serverEntity) {
    // Confirmed by server
    const verb = isCreate ? 'created' : 'updated';
    result.operationsResolved.push({ commandId: op.commandId, success: true, reason: `${spec.label} ${verb} on server` });

    // Check for conflicts (server state wins but we log it)
    if (localEntity && JSON.stringify(localEntity) !== JSON.stringify(serverEntity)) {
      spec.beforeConflict?.(localEntity, serverEntity);
      result.conflicts.push({ resourceId: op.entityId, type: spec.type, localValue: localEntity, serverValue: serverEntity });
    }
    return toUpdate;
  }

  if (isFresh) {
    // Not yet on server, but still fresh: Keep the optimistic entity in the results
    if (isCreate && localEntity && !toUpdate.some(e => e.id === localEntity.id)) {
      toUpdate.push(localEntity);
    }
    return toUpdate;
  }

  // Expired and not on server: Mark as failed
  result.operationsResolved.push({
    commandId: op.commandId,
    success: false,
    reason: isCreate ? 'Create timed out' : 'Update timed out',
  });
  return toUpdate;
}

/**
 * Reconciles a pending delete: gone from the server means resolved, a fresh delete keeps the
 * entity out of the update list, an expired one fails.
 *
 * @returns the entities to update, without the entity while its delete is pending
 */
function reconcileDelete<T extends { id: string; }>(
  op: OptimisticOperation,
  spec: EntityReconcileSpec<T>,
  toUpdate: T[],
  result: ReconciliationResult,
  isFresh: boolean,
): T[] {
  const onServer = spec.server.some(e => e && (e.id === op.entityId || (op.tempIdMapping?.realId === e.id)));
  if (!onServer) {
    result.operationsResolved.push({ commandId: op.commandId, success: true, reason: `${spec.label} deleted on server` });
    return toUpdate;
  }
  if (isFresh) {
    // Still pending delete: ensure it's REMOVED from the update list
    return toUpdate.filter(e => e.id !== op.entityId);
  }
  result.operationsResolved.push({ commandId: op.commandId, success: false, reason: 'Delete timed out' });
  return toUpdate;
}

/** Reconciles one pending operation of an entity kind; returns the new list of entities to update. */
function reconcileOperation<T extends { id: string; }>(
  op: OptimisticOperation,
  spec: EntityReconcileSpec<T>,
  toUpdate: T[],
  result: ReconciliationResult,
  now: number,
): T[] {
  const isFresh = (now - op.createdAt) < op.ttlMs;
  if (op.kind === 'create' || op.kind === 'update') {
    return reconcileCreateOrUpdate(op, spec, toUpdate, result, isFresh);
  }
  if (op.kind === 'delete') {
    return reconcileDelete(op, spec, toUpdate, result, isFresh);
  }
  return toUpdate;
}

/**
 * Reconcile state between local and server
 */
export function reconcileState(context: ReconciliationContext): ReconciliationResult {
  const serverGroups = context.serverState?.groups || [];
  const serverVariables = context.serverState?.variables || [];
  const localGroups = context.localState?.groups || [];
  const localVariables = context.localState?.variables || [];

  const result: ReconciliationResult = {
    groupsToUpdate: [...serverGroups],
    variablesToUpdate: [...serverVariables],
    operationsResolved: [],
    conflicts: [],
  };

  if (!context.optimisticManager) {
    return result;
  }

  const groupSpec: EntityReconcileSpec<Group> = { type: 'group', label: 'Entity', server: serverGroups, local: localGroups };
  const variableSpec: EntityReconcileSpec<Variable> = {
    type: 'variable',
    label: 'Variable',
    server: serverVariables,
    local: localVariables,
    beforeConflict: reattachVariableOwner,
  };

  // Get pending operations from OptimisticManager
  const pendingOps = context.optimisticManager.getPendingOperations();
  const now = Date.now();
  for (const op of pendingOps) {
    if (op.entityType === 'group') {
      result.groupsToUpdate = reconcileOperation(op, groupSpec, result.groupsToUpdate, result, now);
    } else if (op.entityType === 'variable') {
      result.variablesToUpdate = reconcileOperation(op, variableSpec, result.variablesToUpdate, result, now);
    }
  }

  return result;
}

/**
 * Apply reconciliation result to local state
 */
export function applyReconciliation(
  reconciliation: ReconciliationResult,
  optimisticManager: OptimisticManager | null,
): void {
  if (!optimisticManager) {
    return;
  }

  for (const resolved of reconciliation.operationsResolved) {
    if (resolved.success) {
      optimisticManager.remove(resolved.commandId);
    } else {
      optimisticManager.markFailed(resolved.commandId, resolved.reason || 'Reconciliation failed');
    }
  }
}

/**
 * Log reconciliation results for debugging
 */
export function logReconciliationResults(result: ReconciliationResult): string {
  const lines: string[] = [];
  
  lines.push(
    `Reconciliation Results:`,
    `  Resolved Operations: ${result.operationsResolved.length}`,
    `  - Success: ${result.operationsResolved.filter(r => r.success).length}`,
    `  - Failed: ${result.operationsResolved.filter(r => !r.success).length}`,
    `  Conflicts Detected: ${result.conflicts.length}`,
  );
  
  if (result.conflicts.length > 0) {
    lines.push(`  Conflict Details:`);
    for (const conflict of result.conflicts) {
      lines.push(`    - ${conflict.type} ${conflict.resourceId}: local vs server`);
    }
  }

  return lines.join('\n');
}
