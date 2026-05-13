/**
 * Reconciliation Helper
 *
 * Handles state reconciliation after reconnection or errors.
 * Compares local state with server state and resolves conflicts.
 */

import type { Group, Variable } from '../types';
import type { OptimisticManager } from './optimisticManager';

export interface ReconciliationContext {
  optimisticManager: OptimisticManager | null;
  localState: {
    groups: Group[];
    variables: Variable[];
  };
  serverState: {
    groups: Group[];
    variables: Variable[];
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
    localValue: any;
    serverValue: any;
  }>;
}

/**
 * Reconcile state between local and server
 */
export function reconcileState(context: ReconciliationContext): ReconciliationResult {
  const result: ReconciliationResult = {
    groupsToUpdate: [...context.serverState.groups],
    variablesToUpdate: [...context.serverState.variables],
    operationsResolved: [],
    conflicts: [],
  };

  if (!context.optimisticManager) {
    return result;
  }

  // Get pending operations from OptimisticManager
  const pendingOps = context.optimisticManager.getPendingOperations();

  const now = Date.now();
  for (const op of pendingOps) {
    const isFresh = (now - op.createdAt) < op.ttlMs;
    const isGroupOp = op.entityType === 'group';
    const isVariableOp = op.entityType === 'variable';
    const isCreate = op.kind === 'create';
    const isUpdate = op.kind === 'update';
    const isDelete = op.kind === 'delete';

    if (isGroupOp) {
      const serverEntity = context.serverState.groups.find(g => g.id === op.entityId || (op.tempIdMapping?.realId === g.id));
      const localEntity = context.localState.groups.find(g => g.id === op.entityId);

      if (isCreate || isUpdate) {
        if (serverEntity) {
          // Confirmed by server
          result.operationsResolved.push({
            commandId: op.commandId,
            success: true,
            reason: isCreate ? 'Entity created on server' : 'Entity updated on server',
          });

          // Check for conflicts (server state wins but we log it)
          if (localEntity && JSON.stringify(localEntity) !== JSON.stringify(serverEntity)) {
            result.conflicts.push({
              resourceId: op.entityId,
              type: 'group',
              localValue: localEntity,
              serverValue: serverEntity,
            });
          }
        } else if (isFresh) {
          // Not yet on server, but still fresh: Keep the optimistic entity in the results
          if (isCreate && localEntity && !result.groupsToUpdate.find(g => g.id === localEntity.id)) {
            result.groupsToUpdate.push(localEntity);
          }
        } else {
          // Expired and not on server: Mark as failed
          result.operationsResolved.push({
            commandId: op.commandId,
            success: false,
            reason: isCreate ? 'Create timed out' : 'Update timed out',
          });
        }
      } else if (isDelete) {
        if (!serverEntity) {
          result.operationsResolved.push({
            commandId: op.commandId,
            success: true,
            reason: 'Entity deleted on server',
          });
        } else if (isFresh) {
          // Still pending delete: ensure it's REMOVED from the update list
          result.groupsToUpdate = result.groupsToUpdate.filter(g => g.id !== op.entityId);
        } else {
          result.operationsResolved.push({
            commandId: op.commandId,
            success: false,
            reason: 'Delete timed out',
          });
        }
      }
    }

    if (isVariableOp) {
      const serverEntity = context.serverState.variables.find(v => v.id === op.entityId || (op.tempIdMapping?.realId === v.id));
      const localEntity = context.localState.variables.find(v => v.id === op.entityId);

      if (isCreate || isUpdate) {
        if (serverEntity) {
          result.operationsResolved.push({
            commandId: op.commandId,
            success: true,
            reason: isCreate ? 'Variable created on server' : 'Variable updated on server',
          });

          if (localEntity && JSON.stringify(localEntity) !== JSON.stringify(serverEntity)) {
            result.conflicts.push({
              resourceId: op.entityId,
              type: 'variable',
              localValue: localEntity,
              serverValue: serverEntity,
            });
          }
        } else if (isFresh) {
          if (isCreate && localEntity && !result.variablesToUpdate.find(v => v.id === localEntity.id)) {
            result.variablesToUpdate.push(localEntity);
          }
        } else {
          result.operationsResolved.push({
            commandId: op.commandId,
            success: false,
            reason: isCreate ? 'Create timed out' : 'Update timed out',
          });
        }
      } else if (isDelete) {
        if (!serverEntity) {
          result.operationsResolved.push({
            commandId: op.commandId,
            success: true,
            reason: 'Variable deleted on server',
          });
        } else if (isFresh) {
          result.variablesToUpdate = result.variablesToUpdate.filter(v => v.id !== op.entityId);
        } else {
          result.operationsResolved.push({
            commandId: op.commandId,
            success: false,
            reason: 'Delete timed out',
          });
        }
      }
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
  
  lines.push(`Reconciliation Results:`);
  lines.push(`  Resolved Operations: ${result.operationsResolved.length}`);
  lines.push(`  - Success: ${result.operationsResolved.filter(r => r.success).length}`);
  lines.push(`  - Failed: ${result.operationsResolved.filter(r => !r.success).length}`);
  lines.push(`  Conflicts Detected: ${result.conflicts.length}`);
  
  if (result.conflicts.length > 0) {
    lines.push(`  Conflict Details:`);
    for (const conflict of result.conflicts) {
      lines.push(`    - ${conflict.type} ${conflict.resourceId}: local vs server`);
    }
  }

  return lines.join('\n');
}
