import type { GroupState, FlowState } from '../../core/types';
import type { Group, Flow } from '../../types';

/**
 * Maps a raw Flow object from the Java Core to a UI-compatible Flow object.
 * Handles formatting numerical metrics (throughput) into user-friendly strings.
 */
export function mapFlowFromCore(flow: FlowState): Flow {
  return {
    id: flow.id || 'unknown',
    name: flow.name || 'Unnamed Flow',
    technology: flow.technology || 'Generic',
    connectionStatus: flow.connectionStatus || 'disconnected',
    throughput: `${flow.throughput || 0} msg/s`,
    latency: flow.latency || 0,
    hasError: flow.hasError ?? false,
    errorMessage: flow.errorMessage,
    interval: flow.interval ?? 1000,
    burst: flow.burst ?? 1,
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
 */
export function mapGroupFromCore(group: GroupState, previousGroup?: Group): Group {
  return {
    id: group.id || 'unknown',
    name: group.name || 'Unnamed Group',
    status: group.status || 'stopped',
    throughput: `${group.throughput || 0} msg/s`,
    description: group.description || '',
    threads: group.threads || 1,
    outputMode: group.outputMode || 'serial',
    enabled: group.enabled ?? true,
    expanded: previousGroup?.expanded ?? true,
    flows: (group.flows || []).map(mapFlowFromCore),
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
