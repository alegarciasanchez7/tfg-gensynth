/**
 * Reconciliation Helper
 *
 * Handles state reconciliation after reconnection or errors.
 * Compares local state with server state and resolves conflicts.
 *
 * Strategy:
 * 1. On reconnect, load server state
 * 2. Compare local state with server state
 * 3. For each pending operation:
 *    - If entity exists on server → operation succeeded
 *    - If entity missing on server → operation failed (rollback)
 *    - If entity different → reconcile fields
 * 4. Mark operations as resolved in OptimisticManager
 */

import type { Group, Variable } from '../types';
import type { OptimisticManager } from '../core/optimisticManager';

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
    operationId: string;
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
 *
 * Returns groups and variables that should be updated in local state.
 * Also marks pending operations in OptimisticManager as resolved.
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

  for (const op of pendingOps) {
    // Determine operation type from commandType
    const isGroupOp = op.commandType.includes('GROUP');
    const isVariableOp = op.commandType.includes('VARIABLE');
    const isCreate = op.commandType.includes('CREATE');
    const isUpdate = op.commandType.includes('UPDATE');
    const isDelete = op.commandType.includes('DELETE');

    if (isGroupOp) {
      const serverEntity = context.serverState.groups.find(g => g.id === op.resourceId);
      const localEntity = context.localState.groups.find(g => g.id === op.resourceId);

      if (isCreate || isUpdate) {
        if (serverEntity) {
          // Entity exists on server → operation succeeded
          result.operationsResolved.push({
            operationId: op.operationId,
            success: true,
            reason: isCreate ? 'Entity created on server' : 'Entity updated on server',
          });

          // Check for conflicts in fields
          if (localEntity && localEntity !== serverEntity) {
            result.conflicts.push({
              resourceId: op.resourceId,
              type: 'group',
              localValue: localEntity,
              serverValue: serverEntity,
            });
          }
        } else {
          // Entity missing on server → operation failed
          result.operationsResolved.push({
            operationId: op.operationId,
            success: false,
            reason: isCreate ? 'Create failed' : 'Update failed - entity not found',
          });
        }
      } else if (isDelete) {
        if (!serverEntity) {
          // Entity successfully deleted
          result.operationsResolved.push({
            operationId: op.operationId,
            success: true,
            reason: 'Entity deleted on server',
          });
        } else {
          // Entity still exists → delete failed
          result.operationsResolved.push({
            operationId: op.operationId,
            success: false,
            reason: 'Delete failed - entity still exists on server',
          });
        }
      }
    }

    if (isVariableOp) {
      const serverEntity = context.serverState.variables.find(v => v.id === op.resourceId);
      const localEntity = context.localState.variables.find(v => v.id === op.resourceId);

      if (isCreate || isUpdate) {
        if (serverEntity) {
          result.operationsResolved.push({
            operationId: op.operationId,
            success: true,
            reason: isCreate ? 'Variable created on server' : 'Variable updated on server',
          });

          if (localEntity && localEntity !== serverEntity) {
            result.conflicts.push({
              resourceId: op.resourceId,
              type: 'variable',
              localValue: localEntity,
              serverValue: serverEntity,
            });
          }
        } else {
          result.operationsResolved.push({
            operationId: op.operationId,
            success: false,
            reason: isCreate ? 'Create failed' : 'Update failed - variable not found',
          });
        }
      } else if (isDelete) {
        if (!serverEntity) {
          result.operationsResolved.push({
            operationId: op.operationId,
            success: true,
            reason: 'Variable deleted on server',
          });
        } else {
          result.operationsResolved.push({
            operationId: op.operationId,
            success: false,
            reason: 'Delete failed - variable still exists on server',
          });
        }
      }
    }
  }

  return result;
}

/**
 * Apply reconciliation result to local state
 *
 * Updates OptimisticManager with reconciliation results.
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
      optimisticManager.remove(resolved.operationId);
    } else {
      optimisticManager.markFailed(resolved.operationId, resolved.reason);
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
