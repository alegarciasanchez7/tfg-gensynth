/**
 * Optimistic Update Helper
 *
 * Provides utilities for managing optimistic updates with automatic rollback on errors.
 * Handles state management for:
 * - Groups updates
 * - Flows updates  
 * - Variables updates
 */

import type { Group, Flow, Variable } from '../types';
import { OptimisticManager, type OptimisticOperation } from './optimisticManager';

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
        entityType: (context.commandType.includes('GROUP') ? 'group' : 
                    context.commandType.includes('FLOW') ? 'flow' : 'variable') as any,
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

/**
 * Helper to create optimistic update payload for group updates
 */
export function createGroupUpdatePayload(
  previousState: Group,
  updates: Partial<Omit<Group, 'id' | 'flows'>>,
): { optimistic: Partial<Group>; rollback: Partial<Group> } {
  const rollbackState: Partial<Group> = {};
  
  // Only track fields that changed
  for (const key of Object.keys(updates) as Array<keyof Omit<Group, 'id' | 'flows'>>) {
    rollbackState[key] = previousState[key];
  }

  return {
    optimistic: { id: previousState.id, ...updates },
    rollback: { id: previousState.id, ...rollbackState },
  };
}

/**
 * Helper to create optimistic update payload for flow updates
 */
export function createFlowUpdatePayload(
  previousState: Flow,
  updates: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>>,
): { optimistic: Partial<Flow>; rollback: Partial<Flow> } {
  const rollbackState: Partial<Flow> = {};
  
  // Only track fields that changed
  for (const key of Object.keys(updates) as Array<keyof Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>>) {
    rollbackState[key] = previousState[key];
  }

  return {
    optimistic: { id: previousState.id, ...updates },
    rollback: { id: previousState.id, ...rollbackState },
  };
}

/**
 * Helper to create optimistic update payload for variable updates
 */
export function createVariableUpdatePayload(
  previousState: Variable,
  updates: Partial<Omit<Variable, 'id'>>,
): { optimistic: Partial<Variable>; rollback: Partial<Variable> } {
  const rollbackState: Partial<Variable> = {};
  
  // Only track fields that changed
  for (const key of Object.keys(updates) as Array<keyof Omit<Variable, 'id'>>) {
    rollbackState[key] = previousState[key];
  }

  return {
    optimistic: { id: previousState.id, ...updates },
    rollback: { id: previousState.id, ...rollbackState },
  };
}
