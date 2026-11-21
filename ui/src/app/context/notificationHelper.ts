/**
 * Notification Helper
 *
 * Manages user notifications for CRUD operations.
 * Uses sonner for toast notifications.
 *
 * Types of notifications:
 * - Optimistic: Operation started (hidden by default)
 * - Success: Operation completed successfully
 * - Error: Operation failed with details
 * - Reconciliation: State synced after reconnect
 */

import { toast } from 'sonner';

export interface NotificationOptions {
  showOptimistic?: boolean; // Show toast for optimistic updates (default: false)
  duration?: number; // Toast duration in ms (default: 3000)
}

/**
 * Show success notification for CREATE operation
 */
export function notifyCreateSuccess(
  resourceType: string,
  resourceName: string,
  options?: NotificationOptions,
): void {
  const message = `${resourceType} "${resourceName}" created successfully`;
  toast.success(message, {
    duration: options?.duration ?? 3000,
  });
}

/**
 * Show optimistic notification for CREATE operation
 */
export function notifyCreateOptimistic(
  resourceType: string,
  _resourceName: string,
  options?: NotificationOptions,
): void {
  if (!options?.showOptimistic) return;

  const message = `Creating ${resourceType}...`;
  toast.loading(message, {
    id: `create_${resourceType}_${Date.now()}`,
  });
}

/**
 * Show error notification for CREATE operation
 */
export function notifyCreateError(
  resourceType: string,
  resourceName: string,
  error: string,
  options?: NotificationOptions,
): void {
  const message = `Failed to create ${resourceType} "${resourceName}": ${error}`;
  toast.error(message, {
    duration: options?.duration ?? 5000,
  });
}

/**
 * Show success notification for UPDATE operation
 */
export function notifyUpdateSuccess(
  resourceType: string,
  resourceName: string,
  options?: NotificationOptions,
): void {
  const message = `${resourceType} "${resourceName}" updated successfully`;
  toast.success(message, {
    duration: options?.duration ?? 3000,
  });
}

/**
 * Show optimistic notification for UPDATE operation
 */
export function notifyUpdateOptimistic(
  resourceType: string,
  _resourceName: string,
  options?: NotificationOptions,
): void {
  if (!options?.showOptimistic) return;

  const message = `Updating ${resourceType}...`;
  toast.loading(message, {
    id: `update_${resourceType}_${Date.now()}`,
  });
}

/**
 * Show error notification for UPDATE operation
 */
export function notifyUpdateError(
  resourceType: string,
  resourceName: string,
  error: string,
  options?: NotificationOptions,
): void {
  const message = `Failed to update ${resourceType} "${resourceName}": ${error}`;
  toast.error(message, {
    duration: options?.duration ?? 5000,
  });
}

/**
 * Show success notification for DELETE operation
 */
export function notifyDeleteSuccess(
  resourceType: string,
  resourceName: string,
  options?: NotificationOptions,
): void {
  const message = `${resourceType} "${resourceName}" deleted successfully`;
  toast.success(message, {
    duration: options?.duration ?? 3000,
  });
}

/**
 * Show optimistic notification for DELETE operation
 */
export function notifyDeleteOptimistic(
  resourceType: string,
  _resourceName: string,
  options?: NotificationOptions,
): void {
  if (!options?.showOptimistic) return;

  const message = `Deleting ${resourceType}...`;
  toast.loading(message, {
    id: `delete_${resourceType}_${Date.now()}`,
  });
}

/**
 * Show error notification for DELETE operation
 */
export function notifyDeleteError(
  resourceType: string,
  resourceName: string,
  error: string,
  options?: NotificationOptions,
): void {
  const message = `Failed to delete ${resourceType} "${resourceName}": ${error}`;
  toast.error(message, {
    duration: options?.duration ?? 5000,
  });
}

/**
 * Show notification for reconciliation
 */
export function notifyReconciliation(
  successCount: number,
  failureCount: number,
  conflictCount: number,
): void {
  const parts = [];
  if (successCount > 0) parts.push(`${successCount} resolved`);
  if (failureCount > 0) parts.push(`${failureCount} failed`);
  if (conflictCount > 0) parts.push(`${conflictCount} conflicts`);

  const level = failureCount > 0 ? 'warning' : 'info';
  const message = `State synchronized: ${parts.join(', ')}`;

  if (level === 'warning') {
    toast.warning(message, { duration: 4000 });
  } else {
    toast.info(message, { duration: 3000 });
  }
}

/**
 * Show connection status notifications
 */
export function notifyConnectionStatus(status: 'connected' | 'disconnected'): void {
  if (status === 'connected') {
    toast.success('Connected to server', { duration: 2000 });
  } else {
    toast.error('Disconnected from server', { duration: 5000 });
  }
}

/**
 * Show batch operation notification
 */
export function notifyBatchOperation(
  operationType: 'create' | 'update' | 'delete',
  count: number,
  status: 'started' | 'success' | 'error',
): void {
  const opName = operationType.charAt(0).toUpperCase() + operationType.slice(1);
  
  switch (status) {
    case 'started':
      toast.loading(`${opName}ing ${count} items...`);
      break;
    case 'success':
      toast.success(`${opName}d ${count} items successfully`);
      break;
    case 'error':
      toast.error(`Failed to ${operationType} some items`);
      break;
  }
}
