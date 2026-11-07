import type { ConnectionStatus, GroupStatus } from '../types';

/** Every group status the UI knows how to display. */
export const GROUP_STATUSES: readonly GroupStatus[] = ['running', 'stopped', 'paused'];

/** Every flow connection status the UI knows how to display. */
export const CONNECTION_STATUSES: readonly ConnectionStatus[] = ['connected', 'disconnected', 'error', 'warning'];

/**
 * Narrows a value received from the Core (or a project file) to a known group status.
 * Anything else, such as the command status "ok" of a response, falls back so that the
 * status tables of the components never receive an unknown key.
 *
 * @param value the raw status
 * @param fallback the status to use when the value is not a known one
 * @returns a known group status
 */
export function normalizeGroupStatus(value: unknown, fallback: GroupStatus = 'stopped'): GroupStatus {
  return GROUP_STATUSES.find((status) => status === value) ?? fallback;
}

/**
 * Narrows a value received from the Core (or a project file) to a known connection status.
 *
 * @param value the raw connection status
 * @param fallback the status to use when the value is not a known one
 * @returns a known connection status
 */
export function normalizeConnectionStatus(
  value: unknown,
  fallback: ConnectionStatus = 'disconnected',
): ConnectionStatus {
  return CONNECTION_STATUSES.find((status) => status === value) ?? fallback;
}
