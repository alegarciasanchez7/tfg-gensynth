import type { Group, Variable, Flow, ProjectSettings } from '../../types';
import { tickSettingsEqual } from '../../core/tickSettings';

export interface DirtyItems {
  groupIds: Set<string>;
  flowIds: Set<string>;
  variableIds: Set<string>;
}

/** Returns a dirty-items set with nothing marked as changed. */
export function createEmptyDirtyItems(): DirtyItems {
  return {
    groupIds: new Set<string>(),
    flowIds: new Set<string>(),
    variableIds: new Set<string>(),
  };
}

export interface DirtyStateResult {
  isDirty: boolean;
  dirtyItems: DirtyItems;
}

/**
 * Normalizes a flow for deep comparison by keeping only its configuration.
 * Runtime metrics reported by the Core while simulating (connectionStatus, throughput,
 * latency, hasError, errorMessage) are left out, so running a simulation never marks
 * the project as modified.
 */
export function getFlowComparable(flow: Flow) {
  return {
    id: flow.id,
    name: flow.name,
    technology: flow.technology,
    interval: flow.interval,
    burst: flow.burst,
    everyTicks: flow.everyTicks,
    topic: flow.topic,
    host: flow.host,
    port: flow.port,
    enabled: flow.enabled,
    template: flow.template,
    format: flow.format,
    connectorConfig: flow.connectorConfig,
    connectorVersion: flow.connectorVersion,
  };
}

/**
 * Normalizes a group for deep comparison.
 */
export function getGroupComparable(group: Group) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    threads: group.threads,
    outputMode: group.outputMode,
    enabled: group.enabled,
    flows: (group.flows || []).map(getFlowComparable),
  };
}

/**
 * Normalizes a variable for deep comparison.
 */
export function getVariableComparable(variable: Variable) {
  return {
    id: variable.id,
    name: variable.name,
    type: variable.type,
    scope: variable.scope,
    flowId: variable.flowId,
    groupId: variable.groupId,
    config: variable.config,
    description: variable.description,
  };
}

/**
 * Computes which specific entities (groups, flows, variables) are dirty
 * and whether the project overall has unsaved changes. Project settings only affect
 * the overall flag, since they are not tied to a specific entity.
 */
export function computeDirtyState(
  savedState: { groups: Group[]; variables: Variable[]; settings?: ProjectSettings } | null,
  currentGroups: Group[],
  currentVariables: Variable[],
  currentSettings?: ProjectSettings,
): DirtyStateResult {
  const dirtyItems = createEmptyDirtyItems();

  if (!savedState) {
    // If no saved state exists yet, check if there's any non-empty configuration
    const isDirty = currentGroups.length > 0 || currentVariables.length > 0;
    if (isDirty) {
      currentGroups.forEach((g) => {
        dirtyItems.groupIds.add(g.id);
        (g.flows || []).forEach((f) => dirtyItems.flowIds.add(f.id));
      });
      currentVariables.forEach((v) => dirtyItems.variableIds.add(v.id));
    }
    return { isDirty, dirtyItems };
  }

  const savedGroupsMap = new Map<string, Group>(savedState.groups.map((g) => [g.id, g]));
  const savedVarsMap = new Map<string, Variable>(savedState.variables.map((v) => [v.id, v]));

  let isDirtyOverall = false;

  if (savedState.settings && currentSettings && !tickSettingsEqual(savedState.settings.tick, currentSettings.tick)) {
    isDirtyOverall = true;
  }

  // Check deleted groups or variables
  if (currentGroups.length !== savedState.groups.length) {
    isDirtyOverall = true;
  }
  if (currentVariables.length !== savedState.variables.length) {
    isDirtyOverall = true;
  }

  // Check current groups
  for (const group of currentGroups) {
    const savedGroup = savedGroupsMap.get(group.id);
    if (!savedGroup) {
      // New group created
      isDirtyOverall = true;
      dirtyItems.groupIds.add(group.id);
      (group.flows || []).forEach((f) => dirtyItems.flowIds.add(f.id));
      continue;
    }

    const savedFlowsMap = new Map<string, Flow>((savedGroup.flows || []).map((f) => [f.id, f]));
    let groupIsDirty = false;

    // Compare group top-level properties
    const currGroupComp = { ...getGroupComparable(group), flows: undefined };
    const savedGroupComp = { ...getGroupComparable(savedGroup), flows: undefined };
    if (JSON.stringify(currGroupComp) !== JSON.stringify(savedGroupComp)) {
      groupIsDirty = true;
      isDirtyOverall = true;
    }

    if ((group.flows || []).length !== (savedGroup.flows || []).length) {
      groupIsDirty = true;
      isDirtyOverall = true;
    }

    // Compare flows within group
    for (const flow of group.flows || []) {
      const savedFlow = savedFlowsMap.get(flow.id);
      if (!savedFlow) {
        groupIsDirty = true;
        isDirtyOverall = true;
        dirtyItems.flowIds.add(flow.id);
        continue;
      }

      if (JSON.stringify(getFlowComparable(flow)) !== JSON.stringify(getFlowComparable(savedFlow))) {
        groupIsDirty = true;
        isDirtyOverall = true;
        dirtyItems.flowIds.add(flow.id);
      }
    }

    if (groupIsDirty) {
      dirtyItems.groupIds.add(group.id);
    }
  }

  // Check current variables
  for (const variable of currentVariables) {
    const savedVar = savedVarsMap.get(variable.id);
    if (!savedVar) {
      isDirtyOverall = true;
      dirtyItems.variableIds.add(variable.id);
      continue;
    }

    if (JSON.stringify(getVariableComparable(variable)) !== JSON.stringify(getVariableComparable(savedVar))) {
      isDirtyOverall = true;
      dirtyItems.variableIds.add(variable.id);
    }
  }

  return {
    isDirty: isDirtyOverall,
    dirtyItems,
  };
}
