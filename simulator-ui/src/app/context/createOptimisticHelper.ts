/**
 * Create Optimistic Update Helper
 *
 * Handles optimistic creation with automatic rollback and ID reconciliation.
 * Since the server may assign different IDs:
 * 1. Generate optimistic ID locally
 * 2. Apply optimistic create immediately
 * 3. Send command to server
 * 4. Reconcile if server returns different ID
 * 5. Rollback on error
 */

import type { Group, Flow, Variable } from '../types';
import { OptimisticManager, type OptimisticOperation } from './optimisticManager';

export interface CreateOptimisticContext {
  optimisticManager: OptimisticManager | null;
  commandType: string;
  optimisticId: string;
}

/**
 * Execute CREATE with optimistic UI and ID reconciliation
 *
 * Usage:
 * ```tsx
 * const optimisticId = generateId();
 * const optimisticGroup = { id: optimisticId, name, ... };
 *
 * const createdGroup = await executeCreateOptimistic(
 *   {
 *     optimisticManager,
 *     commandType: 'CREATE_GROUP',
 *     optimisticId,
 *   },
 *   {
 *     applyOptimistic: () => dispatch({ type: 'SET_GROUPS', payload: [...groups, optimisticGroup] }),
 *     rollback: () => dispatch({ type: 'SET_GROUPS', payload: groups.filter(g => g.id !== optimisticId) }),
 *     send: () => bridge.send('CREATE_GROUP', { name, description }),
 *     reconcileId: (serverCreated) => createdGroup.id !== optimisticId
 *       ? dispatch({ type: 'SET_GROUPS', payload: groups.map(g => g.id === optimisticId ? serverCreated : g) })
 *       : null,
 *   }
 * );
 * ```
 */
/**
 * Generate client-side temporary ID with prefix and random suffix
 */
export function generateOptimisticId(entityType: 'group' | 'flow' | 'var'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `opt_${entityType}_${timestamp}_${random}`;
}

/**
 * Execute CREATE with optimistic UI and ID reconciliation
 */
export async function executeCreateOptimistic<T>(
  context: CreateOptimisticContext,
  handlers: {
    applyOptimistic: () => void;
    rollback: () => void;
    send: () => Promise<T>;
    reconcileId: (serverEntity: T) => void;
  },
): Promise<T> {
  const commandId = `${context.commandType}:${context.optimisticId}:${Date.now()}`;

  try {
    // 1. Register operation with OptimisticManager
    if (context.optimisticManager) {
      const operation: OptimisticOperation = {
        commandId,
        kind: 'create',
        entityType: (context.commandType.includes('GROUP') ? 'group' : 
                    context.commandType.includes('FLOW') ? 'flow' : 'variable') as any,
        entityId: context.optimisticId,
        tempIdMapping: {
          tempId: context.optimisticId,
          realId: undefined,
        },
        createdAt: Date.now(),
        ttlMs: 5000,
        applied: false,
      };
      context.optimisticManager.register(operation);
    }

    // 2. Apply optimistic UI immediately (show with temp ID)
    handlers.applyOptimistic();

    // 3. Mark as applied
    if (context.optimisticManager) {
      context.optimisticManager.markApplied(commandId);
    }

    // 4. Send to server and get real ID
    const serverEntity = await handlers.send();

    // 5. Reconcile: replace temp ID with real ID if different
    if (serverEntity && typeof serverEntity === 'object' && 'id' in serverEntity) {
      const realId = (serverEntity as any).id;
      if (realId && realId !== context.optimisticId) {
        // Update OptimisticManager with real ID
        if (context.optimisticManager) {
          context.optimisticManager.updateTempIdMapping(commandId, realId);
        }
        // Update UI with real ID
        handlers.reconcileId(serverEntity);
      }
    }

    // 6. Remove from pending operations
    if (context.optimisticManager) {
      context.optimisticManager.remove(commandId);
    }

    return serverEntity;
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
 * Create default Group with optimistic ID
 */
export function createOptimisticGroup(
  id: string,
  name: string,
  description: string = '',
): Group {
  return {
    id,
    name,
    description,
    status: 'stopped',
    throughput: '0 msg/s',
    threads: 1,
    outputMode: 'serial',
    expanded: true,
    flows: [],
  };
}

/**
 * Create default Flow with optimistic ID
 */
export function createOptimisticFlow(
  id: string,
  name: string,
  technology: string,
  host: string,
  port: number,
  topic: string = '',
  interval: number = 1000,
  burst: number = 1,
): Flow {
  return {
    id,
    name,
    technology,
    connectionStatus: 'disconnected',
    throughput: '0 msg/s',
    hasError: false,
    errorMessage: undefined,
    interval,
    burst,
    topic,
    host,
    port,
  };
}

/**
 * Create default Variable with optimistic ID
 */
export function createOptimisticVariable(
  id: string,
  name: string,
  type: 'numeric' | 'string' | 'boolean' | 'temporal' | 'point' | 'list',
  scope: 'global' | 'group' | 'local',
): Variable {
  return {
    id,
    name,
    type,
    scope,
    config: {},
    value: undefined,
  };
}
