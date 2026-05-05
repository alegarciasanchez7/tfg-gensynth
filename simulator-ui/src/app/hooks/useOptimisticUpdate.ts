/**
 * useOptimisticUpdate Hook
 *
 * Provides optimistic update functionality with automatic rollback on errors.
 * Manages:
 * - Immediate UI state update (optimistic)
 * - Correlation tracking via OptimisticManager
 * - Automatic rollback on server errors
 * - Error notification
 */

import { useCallback, useRef } from 'react';
import type { OptimisticManager } from '../core/optimisticManager';

export interface OptimisticUpdateOptions<T> {
  /** Function to dispatch the optimistic update to state */
  dispatchOptimistic: (newState: T) => void;
  
  /** Function to revert to previous state on error */
  rollback: (previousState: T) => void;
  
  /** Async function that sends the command to the server */
  send: () => Promise<void>;
  
  /** Command type for correlation tracking */
  commandType: string;
  
  /** Unique identifier for the resource being updated */
  resourceId: string;
  
  /** Callback on error (optional) */
  onError?: (error: Error) => void;
}

/**
 * Hook for managing optimistic updates
 *
 * Usage:
 * ```tsx
 * const { executeOptimistic } = useOptimisticUpdate(optimisticManager);
 *
 * const handleUpdate = async () => {
 *   await executeOptimistic({
 *     dispatchOptimistic: () => dispatch({ type: 'UPDATE_VARIABLE', ... }),
 *     rollback: () => dispatch({ type: 'ROLLBACK_VARIABLE', ... }),
 *     send: () => bridge.send('UPDATE_VARIABLE', { ... }),
 *     commandType: 'UPDATE_VARIABLE',
 *     resourceId: variableId,
 *   });
 * };
 * ```
 */
export function useOptimisticUpdate(optimisticManager: OptimisticManager | null) {
  const pendingUpdatesRef = useRef<Map<string, AbortController>>(new Map());

  const executeOptimistic = useCallback(
    async <T,>(options: OptimisticUpdateOptions<T>) => {
      if (!optimisticManager) {
        // Fallback: just send without optimistic updates
        try {
          await options.send();
        } catch (error) {
          options.onError?.(error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
        return;
      }

      const operationId = `${options.commandType}:${options.resourceId}:${Date.now()}`;
      const abortController = new AbortController();
      pendingUpdatesRef.current.set(operationId, abortController);

      try {
        // 1. Apply optimistic update immediately
        options.dispatchOptimistic(options as any);

        // 2. Register operation with OptimisticManager
        optimisticManager.registerOptimisticUpdate({
          operationId,
          commandType: options.commandType,
          resourceId: options.resourceId,
          timestamp: Date.now(),
        });

        // 3. Send command to server
        await options.send();

        // 4. Mark as successfully resolved
        optimisticManager.resolveOptimisticUpdate(operationId, { success: true });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // Rollback on error
        options.rollback(options as any);

        // Mark as failed in OptimisticManager
        optimisticManager.resolveOptimisticUpdate(operationId, { 
          success: false, 
          error: err.message 
        });

        options.onError?.(err);
        throw err;
      } finally {
        pendingUpdatesRef.current.delete(operationId);
      }
    },
    [optimisticManager]
  );

  const cancelPending = useCallback((commandType?: string) => {
    if (!commandType) {
      pendingUpdatesRef.current.forEach(controller => controller.abort());
      pendingUpdatesRef.current.clear();
      return;
    }

    const toDelete: string[] = [];
    for (const [key, controller] of pendingUpdatesRef.current.entries()) {
      if (key.startsWith(commandType)) {
        controller.abort();
        toDelete.push(key);
      }
    }
    toDelete.forEach(key => pendingUpdatesRef.current.delete(key));
  }, []);

  return {
    executeOptimistic,
    cancelPending,
    hasPending: () => pendingUpdatesRef.current.size > 0,
  };
}
