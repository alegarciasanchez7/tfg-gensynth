/**
 * Optimistic Operations Manager
 * 
 * Tracks pending optimistic operations by commandId.
 * Handles snapshot/rollback and TTL expiration.
 */

export type OptimisticKind = 'update' | 'create' | 'delete';
export type EntityType = 'group' | 'flow' | 'variable';

/**
 * Record of an optimistic operation.
 */
export interface OptimisticOperation {
  /** Unique ID of the command that initiated the operation */
  commandId: string;

  /** Type of operation: update, create, delete */
  kind: OptimisticKind;

  /** Type of entity affected */
  entityType: EntityType;

  /** ID of the entity (or tempId if CREATE) */
  entityId: string;

  /**
   * For CREATE: mapping of tempId → real entityId
   * Updated when creation is confirmed.
   */
  tempIdMapping?: { tempId: string; realId?: string };

  /**
   * Snapshot of the previous state (for UPDATE and DELETE)
   */
  snapshot?: unknown;

  /**
   * Restore context (for DELETE)
   * Includes parentId and index for reinserting in order
   */
  restoreContext?: {
    parentId?: string;
    index?: number;
  };

  /** Timestamp of operation creation */
  createdAt: number;

  /** TTL in ms for this operation */
  ttlMs: number;

  /** If true, the operation has already been applied to local state */
  applied: boolean;

  /** Reason for rejection if it fails */
  failureReason?: string;
}

/**
 * Centralized manager for optimistic operations.
 */
export class OptimisticManager {
  private operations: Map<string, OptimisticOperation> = new Map();

  /**
   * Register an optimistic operation.
   */
  register(op: OptimisticOperation): void {
    this.operations.set(op.commandId, op);
  }

  /**
   * Get an operation by commandId.
   */
  get(commandId: string): OptimisticOperation | undefined {
    return this.operations.get(commandId);
  }

  /**
   * Mark operation as applied.
   */
  markApplied(commandId: string): void {
    const op = this.operations.get(commandId);
    if (op) {
      op.applied = true;
    }
  }

  /**
   * Update tempId → realId mapping in CREATE.
   */
  updateTempIdMapping(commandId: string, realId: string): void {
    const op = this.operations.get(commandId);
    if (op && op.tempIdMapping) {
      op.tempIdMapping.realId = realId;
    }
  }

  /**
   * Mark operation as failed.
   */
  markFailed(commandId: string, reason: string): void {
    const op = this.operations.get(commandId);
    if (op) {
      op.failureReason = reason;
    }
  }

  /**
   * Get expired operations (created more than their TTL ago).
   */
  getExpiredOperations(): OptimisticOperation[] {
    const now = Date.now();
    return Array.from(this.operations.values()).filter(
      op => (now - op.createdAt) > op.ttlMs
    );
  }

  /**
   * Get pending operations (applied but not yet confirmed by backend).
   */
  getPendingOperations(): OptimisticOperation[] {
    return Array.from(this.operations.values()).filter(
      op => op.applied && !op.failureReason
    );
  }

  /**
   * Clean an operation from the registry (successfully confirmed).
   */
  remove(commandId: string): void {
    this.operations.delete(commandId);
  }

  /**
   * Clear all operations.
   */
  clear(): void {
    this.operations.clear();
  }

  /**
   * Get all operations (for debugging).
   */
  getAll(): OptimisticOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Find a command ID by its associated temporary ID.
   */
  findCommandIdByTempId(tempId: string): string | undefined {
    for (const [cmdId, op] of this.operations.entries()) {
      if (op.entityId === tempId || op.tempIdMapping?.tempId === tempId) {
        return cmdId;
      }
    }
    return undefined;
  }
}

/**
 * Factory for creating typed optimistic operations.
 */
export const OptimisticOps = {
  /**
   * Create an UPDATE operation.
   */
  update(
    commandId: string,
    entityType: EntityType,
    entityId: string,
    snapshot: unknown,
    ttlMs: number,
  ): OptimisticOperation {
    return {
      commandId,
      kind: 'update',
      entityType,
      entityId,
      snapshot,
      createdAt: Date.now(),
      ttlMs,
      applied: false,
    };
  },

  /**
   * Create a CREATE operation.
   */
  create(
    commandId: string,
    entityType: EntityType,
    tempId: string,
    ttlMs: number,
  ): OptimisticOperation {
    return {
      commandId,
      kind: 'create',
      entityType,
      entityId: tempId,
      tempIdMapping: { tempId },
      createdAt: Date.now(),
      ttlMs,
      applied: false,
    };
  },

  /**
   * Create a DELETE operation.
   */
  delete(
    commandId: string,
    entityType: EntityType,
    entityId: string,
    snapshot: unknown,
    ttlMs: number,
    restoreContext?: OptimisticOperation['restoreContext'],
  ): OptimisticOperation {
    return {
      commandId,
      kind: 'delete',
      entityType,
      entityId,
      snapshot,
      restoreContext,
      createdAt: Date.now(),
      ttlMs,
      applied: false,
    };
  },
};
