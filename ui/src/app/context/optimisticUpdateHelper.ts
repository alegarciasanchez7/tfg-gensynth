/**
 * Optimistic Update Helper
 *
 * Provides utilities for managing optimistic updates with automatic rollback on errors.
 */

import type { Group, Flow, Variable } from '../types';
import { OptimisticManager, entityTypeOfCommand, type OptimisticOperation } from './optimisticManager';

export interface OptimisticUpdateContext {
  optimisticManager: OptimisticManager | null;
  commandType: string;
  resourceId: string;
}

/**
 * Manages optimistic update flow with automatic rollback
 */
export async function executeOptimisticUpdate(
  context: OptimisticUpdateContext,
  handlers: {
    applyOptimistic: () => void;
    rollback: () => void;
    send: () => Promise<void>;
  },
): Promise<void> {
  const commandId = `${context.commandType}:${context.resourceId}:${Date.now()}`;

  try {
    // 1. Register operation with OptimisticManager BEFORE applying
    if (context.optimisticManager) {
      const operation: OptimisticOperation = {
        commandId,
        kind: 'update',
        entityType: entityTypeOfCommand(context.commandType),
        entityId: context.resourceId,
        createdAt: Date.now(),
        ttlMs: 5000, // 5 second TTL
        applied: false,
      };
      context.optimisticManager.register(operation);
    }

    // 2. Apply optimistic update immediately
    handlers.applyOptimistic();

    // 3. Mark as applied
    if (context.optimisticManager) {
      context.optimisticManager.markApplied(commandId);
    }

    // 4. Send command to server
    await handlers.send();

    // 5. Remove from pending operations (successfully confirmed)
    if (context.optimisticManager) {
      context.optimisticManager.remove(commandId);
    }
  } catch (error) {
    // Rollback on error
    handlers.rollback();

    // Mark as failed in OptimisticManager
    if (context.optimisticManager) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.optimisticManager.markFailed(commandId, errorMessage);
    }

    throw error;
  }
}

/** Optimistic payload (the update) and rollback payload (the previous values) of an entity update. */
export interface UpdatePayloads<T extends { id: string }> {
  optimistic: Partial<T> & { id: string };
  rollback: Partial<T> & { id: string };
}

/** Build the payloads of an update, keeping in the rollback only the fields that change. */
function createUpdatePayloads<T extends { id: string }>(previousState: T, updates: Partial<T>): UpdatePayloads<T> {
  const rollbackState: Partial<T> = {};
  for (const key of Object.keys(updates) as Array<keyof T>) {
    rollbackState[key] = previousState[key];
  }
  return {
    optimistic: { id: previousState.id, ...updates },
    rollback: { id: previousState.id, ...rollbackState },
  };
}

/**
 * Helper to create optimistic update payload for group updates
 */
export function createGroupUpdatePayload(
  previousState: Group,
  updates: Partial<Omit<Group, 'id' | 'flows'>>,
): UpdatePayloads<Group> {
  return createUpdatePayloads<Group>(previousState, updates);
}

/**
 * Helper to create optimistic update payload for flow updates
 */
export function createFlowUpdatePayload(
  previousState: Flow,
  updates: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>>,
): UpdatePayloads<Flow> {
  return createUpdatePayloads<Flow>(previousState, updates);
}

/**
 * Helper to create optimistic update payload for variable updates
 */
export function createVariableUpdatePayload(
  previousState: Variable,
  updates: Partial<Omit<Variable, 'id'>>,
): UpdatePayloads<Variable> {
  return createUpdatePayloads<Variable>(previousState, updates);
}
