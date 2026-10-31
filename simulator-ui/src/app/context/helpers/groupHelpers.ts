import type { GroupState, FlowState } from '../../core/types';
import type { Group, Flow } from '../../types';
import { formatRate } from '../../core/metricsFormat';
import { normalizeOutputMode, normalizeSequentialOrder } from '../../core/outputMode';
import { normalizeConnectionStatus, normalizeGroupStatus } from '../../core/entityStatus';

/**
 * Maps a raw Flow object from the Java Core to a UI-compatible Flow object.
 * Handles formatting numerical metrics (throughput) into user-friendly strings.
 * An unknown connection status keeps the previous one (or 'disconnected').
 */
export function mapFlowFromCore(flow: FlowState, previousFlow?: Flow): Flow {
  return {
    id: flow.id || 'unknown',
    name: flow.name || 'Unnamed Flow',
    technology: flow.technology || 'Generic',
    connectionStatus: normalizeConnectionStatus(flow.connectionStatus, previousFlow?.connectionStatus),
    throughput: `${formatRate(flow.throughput || 0)} msg/s`,
    latency: flow.latency || 0,
    hasError: flow.hasError ?? false,
    errorMessage: flow.errorMessage,
    interval: flow.interval ?? 1000,
    burst: flow.burst ?? 1,
    everyTicks: flow.everyTicks ?? 1,
    lossPercent: flow.lossPercent ?? 0,
    outageEveryTicks: flow.outageEveryTicks ?? 0,
    outageDurationTicks: flow.outageDurationTicks ?? 0,
    topic: flow.topic || '',
    host: flow.host || 'localhost',
    port: flow.port || 80,
    template: flow.template || '{}',
    format: flow.format || 'json',
    connectorConfig: flow.connectorConfig || {},
    enabled: flow.enabled ?? true,
  };
}

/**
 * Maps a raw Group object from the Java Core to a UI-compatible Group object.
 * Preserves local UI state like 'expanded' if a previous version of the group exists.
 * An unknown status (e.g. the command status "ok" of a response) keeps the previous one
 * (or 'stopped'), so the components never index their status tables with an unknown key.
 */
export function mapGroupFromCore(group: GroupState, previousGroup?: Group): Group {
  return {
    id: group.id || 'unknown',
    name: group.name || 'Unnamed Group',
    status: normalizeGroupStatus(group.status, previousGroup?.status),
    throughput: `${formatRate(group.throughput || 0)} msg/s`,
    description: group.description || '',
    threads: group.threads || 1,
    outputMode: normalizeOutputMode(group.outputMode),
    sequentialOrder: normalizeSequentialOrder(group.sequentialOrder),
    enabled: group.enabled ?? true,
    expanded: previousGroup?.expanded ?? true,
    flows: (group.flows || []).map((flow) =>
      mapFlowFromCore(flow, previousGroup?.flows.find((existing) => existing.id === flow.id)),
    ),
  };
}

/**
 * Maps a list of raw Group objects from the Java Core to UI-compatible Group objects.
 * Maintains persistent UI state across the transformation.
 */
export function mapGroupsFromCore(groups: GroupState[], previousGroups: Group[] = []): Group[] {
  return groups.map((group) => {
    const previous = previousGroups.find((existing) => existing.id === group.id);
    return mapGroupFromCore(group, previous);
  });
}

/**
 * Reorders flows like the Core: the listed flows go first, in the given order, and the others
 * keep their relative order after them. Unknown or repeated ids are ignored.
 */
export function reorderFlows(flows: Flow[], flowIds: string[]): Flow[] {
  const byId = new Map(flows.map(flow => [flow.id, flow]));
  const ordered = new Set<Flow>();
  for (const id of flowIds) {
    const flow = byId.get(id);
    if (flow) ordered.add(flow);
  }
  flows.forEach(flow => ordered.add(flow));
  return [...ordered];
}
