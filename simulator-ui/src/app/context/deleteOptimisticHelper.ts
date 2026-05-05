/**
 * Delete Optimistic Update Helper
 *
 * Handles optimistic deletion with automatic rollback on errors.
 * DELETE operations are straightforward:
 * 1. Remove from UI immediately (optimistic)
 * 2. Send delete command to server
 * 3. Rollback if error
 */

import { OptimisticManager, type OptimisticOperation } from './optimisticManager';

export interface DeleteOptimisticContext {
  optimisticManager: OptimisticManager | null;
  commandType: string;
  resourceId: string;
}

/**
 * Execute DELETE with optimistic UI and error recovery
 */
export async function executeDeleteOptimistic(
  context: DeleteOptimisticContext,
  handlers: {
    applyOptimistic: () => void; // Remove from UI
    rollback: () => void; // Restore to UI
    send: () => Promise<void>;
  },
): Promise<void> {
  const commandId = `${context.commandType}:${context.resourceId}:${Date.now()}`;

  try {
    // 1. Register operation with OptimisticManager
    if (context.optimisticManager) {
      const operation: OptimisticOperation = {
        commandId,
        kind: 'delete',
        entityType: (context.commandType.includes('GROUP') ? 'group' : 
                    context.commandType.includes('FLOW') ? 'flow' : 'variable') as any,
        entityId: context.resourceId,
        createdAt: Date.now(),
        ttlMs: 5000,
        applied: false,
      };
      context.optimisticManager.register(operation);
    }

    // 2. Remove from UI immediately
    handlers.applyOptimistic();

    // 3. Mark as applied
    if (context.optimisticManager) {
      context.optimisticManager.markApplied(commandId);
    }

    // 4. Send delete command to server
    await handlers.send();

    // 5. Remove from pending operations
    if (context.optimisticManager) {
      context.optimisticManager.remove(commandId);
    }
  } catch (error) {
    // Restore to UI on error
    handlers.rollback();

    // Mark as failed in OptimisticManager
    if (context.optimisticManager) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.optimisticManager.markFailed(commandId, errorMessage);
    }

    throw error;
  }
}
