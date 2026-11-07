/**
 * Operation Logging Helper
 *
 * Creates detailed logs for all CRUD operations with:
 * - Timestamps
 * - Operation state (optimistic, success, error)
 * - Resource details
 * - Error information
 * - Performance metrics (optional)
 */

import type { LogEntry } from '../types';

export interface OperationLog {
  type: 'create' | 'update' | 'delete';
  resourceType: 'group' | 'flow' | 'variable';
  resourceId: string;
  resourceName?: string;
  state: 'optimistic' | 'success' | 'error' | 'reconciled';
  startTime?: number;
  duration?: number;
  error?: string;
}

/**
 * Create a log entry for an operation
 */
export function createOperationLog(
  operation: OperationLog,
  timestamp: string,
): LogEntry {
  const resourceTypeName = operation.resourceType === 'variable'
    ? 'Variable'
    : operation.resourceType === 'flow'
    ? 'Flow'
    : 'Group';

  const levelMap = {
    optimistic: 'info',
    success: 'info',
    error: 'error',
    reconciled: 'info',
  } as const;

  const stateMessages = {
    optimistic: `${operation.type.charAt(0).toUpperCase() + operation.type.slice(1)}ing optimistically`,
    success: `${operation.type.charAt(0).toUpperCase() + operation.type.slice(1)} successful`,
    error: `${operation.type.charAt(0).toUpperCase() + operation.type.slice(1)} failed`,
    reconciled: `Reconciled after error/reconnect`,
  };

  const baseParts = [
    resourceTypeName,
    operation.resourceName ? `"${operation.resourceName}"` : `(${operation.resourceId})`,
    stateMessages[operation.state],
  ];

  const details = [];
  if (operation.duration !== undefined) {
    details.push(`${operation.duration}ms`);
  }
  if (operation.error) {
    details.push(`Error: ${operation.error}`);
  }

  const message = `${baseParts.join(' ')} ${details.length > 0 ? `[${details.join(', ')}]` : ''}`.trim();

  return {
    id: `op_${operation.resourceId}_${Date.now()}`,
    timestamp,
    level: levelMap[operation.state] as any,
    source: operation.resourceType.toUpperCase(),
    message,
  };
}

/**
 * Create optimistic operation log
 */
export function createOptimisticLog(
  type: 'create' | 'update' | 'delete',
  resourceType: 'group' | 'flow' | 'variable',
  resourceName: string,
  timestamp: string,
): LogEntry {
  return createOperationLog(
    {
      type,
      resourceType,
      resourceId: `${type}_${resourceType}`,
      resourceName,
      state: 'optimistic',
    },
    timestamp,
  );
}

/**
 * Create success operation log
 */
export function createSuccessLog(
  type: 'create' | 'update' | 'delete',
  resourceType: 'group' | 'flow' | 'variable',
  resourceId: string,
  resourceName: string,
  duration?: number,
  timestamp: string = new Date().toLocaleTimeString('en-GB', { hour12: false }),
): LogEntry {
  return createOperationLog(
    {
      type,
      resourceType,
      resourceId,
      resourceName,
      state: 'success',
      duration,
    },
    timestamp,
  );
}

/**
 * Create error operation log
 */
export function createErrorLog(
  type: 'create' | 'update' | 'delete',
  resourceType: 'group' | 'flow' | 'variable',
  resourceId: string,
  resourceName: string,
  error: string,
  duration?: number,
  timestamp: string = new Date().toLocaleTimeString('en-GB', { hour12: false }),
): LogEntry {
  return createOperationLog(
    {
      type,
      resourceType,
      resourceId,
      resourceName,
      state: 'error',
      error,
      duration,
    },
    timestamp,
  );
}

/**
 * Create reconciliation log
 */
export function createReconciliationLog(
  successCount: number,
  failureCount: number,
  conflictCount: number,
  timestamp: string = new Date().toLocaleTimeString('en-GB', { hour12: false }),
): LogEntry {
  const parts = [];
  if (successCount > 0) parts.push(`${successCount} resolved`);
  if (failureCount > 0) parts.push(`${failureCount} failed`);
  if (conflictCount > 0) parts.push(`${conflictCount} conflicts`);

  const level = failureCount > 0 || conflictCount > 0 ? 'warn' : 'info';
  const message = `State reconciliation: ${parts.join(', ')}`;

  return {
    id: `reconcile_${Date.now()}`,
    timestamp,
    level: level as any,
    source: 'RECONCILIATION',
    message,
  };
}

/**
 * Format operation log for display
 */
export function formatOperationLog(log: LogEntry): string {
  return `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`;
}
