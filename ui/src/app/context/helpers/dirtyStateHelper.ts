import type { Group, Variable, Flow, ProjectSettings } from '../../types';
import { tickSettingsEqual } from '../../core/tickSettings';
import { legacyFlowFields, legacyGroupFields } from '../../core/legacyFields';

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
  const { interval, burst } = legacyFlowFields(flow);
  return {
    id: flow.id,
    name: flow.name,
    technology: flow.technology,
    interval,
    burst,
    everyTicks: flow.everyTicks,
    // Missing event loss fields mean "off", same as 0
    lossPercent: flow.lossPercent ?? 0,
    outageEveryTicks: flow.outageEveryTicks ?? 0,
    outageDurationTicks: flow.outageDurationTicks ?? 0,
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
    threads: legacyGroupFields(group).threads,
    outputMode: group.outputMode,
    sequentialOrder: group.sequentialOrder,
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

/** Without a saved baseline, any group or variable makes the project dirty (all of them are marked). */
function dirtyStateWithoutBaseline(currentGroups: Group[], currentVariables: Variable[]): DirtyStateResult {
  const dirtyItems = createEmptyDirtyItems();
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

/** Whether both project settings are known and their tick clocks differ. */
function settingsChanged(saved?: ProjectSettings, current?: ProjectSettings): boolean {
  if (!saved || !current) return false;
  return !tickSettingsEqual(saved.tick, current.tick);
}

/** Whether two values differ once serialized (the comparables keep a stable key order). */
function differs(current: unknown, saved: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved);
}

/**
 * Marks a group and its flows when they differ from the saved copy (a new group and all its
 * flows are marked).
 *
 * @returns whether the group changed
 */
function markDirtyGroup(group: Group, savedGroup: Group | undefined, dirtyItems: DirtyItems): boolean {
  if (!savedGroup) {
    // New group created
    dirtyItems.groupIds.add(group.id);
    (group.flows || []).forEach((f) => dirtyItems.flowIds.add(f.id));
    return true;
  }

  const savedFlowsMap = new Map<string, Flow>((savedGroup.flows || []).map((f) => [f.id, f]));

  // Compare group top-level properties
  const currGroupComp = { ...getGroupComparable(group), flows: undefined };
  const savedGroupComp = { ...getGroupComparable(savedGroup), flows: undefined };
  let groupIsDirty = differs(currGroupComp, savedGroupComp)
    || (group.flows || []).length !== (savedGroup.flows || []).length;

  // Compare flows within group
  for (const flow of group.flows || []) {
    const savedFlow = savedFlowsMap.get(flow.id);
    if (!savedFlow || differs(getFlowComparable(flow), getFlowComparable(savedFlow))) {
      groupIsDirty = true;
      dirtyItems.flowIds.add(flow.id);
    }
  }

  if (groupIsDirty) {
    dirtyItems.groupIds.add(group.id);
  }
  return groupIsDirty;
}

/**
 * Marks a variable when it is new or differs from the saved copy.
 *
 * @returns whether the variable changed
 */
function markDirtyVariable(variable: Variable, savedVar: Variable | undefined, dirtyItems: DirtyItems): boolean {
  if (savedVar && !differs(getVariableComparable(variable), getVariableComparable(savedVar))) {
    return false;
  }
  dirtyItems.variableIds.add(variable.id);
  return true;
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
  if (!savedState) {
    // If no saved state exists yet, check if there's any non-empty configuration
    return dirtyStateWithoutBaseline(currentGroups, currentVariables);
  }

  const dirtyItems = createEmptyDirtyItems();
  const savedGroupsMap = new Map<string, Group>(savedState.groups.map((g) => [g.id, g]));
  const savedVarsMap = new Map<string, Variable>(savedState.variables.map((v) => [v.id, v]));

  // Check deleted groups or variables
  let isDirtyOverall = settingsChanged(savedState.settings, currentSettings)
    || currentGroups.length !== savedState.groups.length
    || currentVariables.length !== savedState.variables.length;

  // Check current groups, then current variables (every entity is checked to mark all of them)
  for (const group of currentGroups) {
    isDirtyOverall = markDirtyGroup(group, savedGroupsMap.get(group.id), dirtyItems) || isDirtyOverall;
  }
  for (const variable of currentVariables) {
    isDirtyOverall = markDirtyVariable(variable, savedVarsMap.get(variable.id), dirtyItems) || isDirtyOverall;
  }

  return {
    isDirty: isDirtyOverall,
    dirtyItems,
  };
}
