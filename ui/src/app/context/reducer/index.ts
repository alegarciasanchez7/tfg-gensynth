import { clampAutoSaveInterval, type AppState, type AppAction } from './appReducer';
import { uiReducer } from './uiSlice';
import { systemReducer } from './systemSlice';
import { groupsReducer } from './groupsSlice';
import { variablesReducer } from './variablesSlice';
import { connectorsReducer } from './connectorsSlice';
import { logsReducer } from './logsSlice';
import { metricsReducer } from './metricsSlice';
import { settingsReducer } from './settingsSlice';
import { updateReducer } from './updateSlice';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';
import { normalizeVariableListFromCore } from '../variableNormalization';
import {
  normalizeConnectorState,
  latestConnectorsFromCatalog,
} from '../helpers/connectorHelpers';
import { computeDirtyState, createEmptyDirtyItems } from '../helpers/dirtyStateHelper';
import { selectionExists } from '../helpers/selectionHelpers';
import { legacyGroupFields } from '../../core/legacyFields';
import type { LogEntry, Group, Flow, Variable } from '../../types';

/** Runtime/UI fields (status, throughput, expanded) of a live group, kept when it is reverted. */
function runtimeGroupFields(live: Group): Pick<Group, 'status' | 'throughput' | 'expanded'> {
  return { status: live.status, throughput: legacyGroupFields(live).throughput, expanded: live.expanded };
}

/** Flow ids of a group both in the saved baseline and in the current state. */
function collectGroupFlowIds(state: AppState, groupId: string): string[] {
  const ids = new Set<string>();
  const groupsWithId = [
    ...(state.savedState?.groups ?? []),
    ...state.groups,
  ].filter((group) => group.id === groupId);
  groupsWithId.forEach((group) => group.flows.forEach((flow) => ids.add(flow.id)));
  return [...ids];
}

/**
 * Resets the per-flow editor state (template buffer, connector selection and config) of the given
 * flows so the editors show the reverted values instead of the discarded ones.
 */
function resetFlowEditorState(
  state: AppState,
  nextGroups: Group[],
  flowIds: string[],
): Pick<AppState, 'formatTemplates' | 'flowConnectorSelections' | 'flowConnectorConfigs' | 'connectorHealthSummary'> {
  const formatTemplates = { ...state.formatTemplates };
  const previousSelections = { ...state.flowConnectorSelections };
  const previousConfigs = { ...state.flowConnectorConfigs };
  const nextFlows = new Map(nextGroups.flatMap((group) => group.flows).map((flow) => [flow.id, flow]));

  for (const flowId of flowIds) {
    const flow = nextFlows.get(flowId);
    delete previousSelections[flowId];
    delete previousConfigs[flowId];
    if (flow?.template !== undefined) {
      formatTemplates[flowId] = flow.template;
    } else {
      delete formatTemplates[flowId];
    }
    if (flow?.connectorConfig && Object.keys(flow.connectorConfig).length > 0) {
      previousConfigs[flowId] = flow.connectorConfig;
    }
  }

  const { selections, configs, healthSummary } = normalizeConnectorState(
    nextGroups,
    state.connectorCatalog,
    previousSelections,
    previousConfigs,
  );
  return {
    formatTemplates,
    flowConnectorSelections: selections,
    flowConnectorConfigs: configs,
    connectorHealthSummary: healthSummary,
  };
}

/** Flow ids whose editor state is reset when an item is discarded. */
function discardedFlowIds(state: AppState, itemType: 'group' | 'flow' | 'variable', itemId: string): string[] {
  if (itemType === 'group') return collectGroupFlowIds(state, itemId);
  if (itemType === 'flow') return [itemId];
  return [];
}

/** The payload of an action type. */
type ActionPayload<T extends AppAction['type']> = Extract<AppAction, { type: T }> extends { payload: infer P } ? P : never;

/** NEW_PROJECT: an empty project, which is also the saved baseline. */
function newProjectState(state: AppState): AppState {
  return {
    ...state,
    groups: [],
    variables: [],
    settings: DEFAULT_PROJECT_SETTINGS,
    formatTemplates: {},
    flowConnectorSelections: {},
    flowConnectorConfigs: {},
    connectorHealthSummary: [],
    flowMetrics: {},
    savedState: { groups: [], variables: [], settings: DEFAULT_PROJECT_SETTINGS },
    isDirty: false,
    dirtyItems: createEmptyDirtyItems(),
    currentFilePath: null,
    currentFileName: null,
    currentFileHandle: null,
    selection: { type: 'none' },
  };
}

/** MARK_SAVED: the saved snapshot becomes the baseline of the given file. */
function markSavedState(state: AppState, payload: ActionPayload<'MARK_SAVED'>): AppState {
  const { savedState, file } = payload;
  // Compare against the current state: edits made while the save was in flight stay dirty
  const { isDirty, dirtyItems } = computeDirtyState(savedState, state.groups, state.variables, state.settings);
  return {
    ...state,
    savedState,
    isDirty,
    dirtyItems,
    currentFilePath: file.filePath,
    currentFileName: file.fileName,
    currentFileHandle: file.fileHandle,
  };
}

/** SET_AUTO_SAVE: remembers the choice in localStorage. */
function setAutoSaveState(state: AppState, enabled: boolean): AppState {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('gensynth-autosave', enabled ? 'true' : 'false');
  }
  return {
    ...state,
    autoSaveEnabled: enabled,
  };
}

/** SET_AUTO_SAVE_INTERVAL: clamps the interval and remembers it in localStorage. */
function setAutoSaveIntervalState(state: AppState, requestedSeconds: number): AppState {
  const seconds = clampAutoSaveInterval(requestedSeconds);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('gensynth-autosave-interval', String(seconds));
  }
  return {
    ...state,
    autoSaveIntervalSeconds: seconds,
  };
}

/** DISCARD_ALL_CHANGES: back to the saved baseline, keeping the runtime fields of live groups. */
function discardAllChangesState(state: AppState): AppState {
  if (!state.savedState) {
    return state;
  }
  const saved = state.savedState;
  // Keep runtime/UI fields (status, throughput, expanded) of the groups that still exist
  const liveGroups = new Map(state.groups.map((group) => [group.id, group]));
  const nextGroups = saved.groups.map((savedGroup) => {
    const live = liveGroups.get(savedGroup.id);
    return live
      ? { ...savedGroup, ...runtimeGroupFields(live) }
      : savedGroup;
  });
  const flowIds = [...state.groups, ...saved.groups].flatMap((group) => group.flows.map((flow) => flow.id));
  const flowState = resetFlowEditorState(state, nextGroups, [...new Set(flowIds)]);

  return {
    ...state,
    ...flowState,
    groups: nextGroups,
    variables: saved.variables,
    settings: saved.settings,
    isDirty: false,
    dirtyItems: createEmptyDirtyItems(),
    selection: selectionExists(state.selection, nextGroups, saved.variables) ? state.selection : { type: 'none' },
  };
}

/** Groups with one group reverted to its saved copy (keeping its runtime fields), or without it when it is new. */
function revertGroup(groups: Group[], savedGroups: Group[], groupId: string): Group[] {
  const savedGroup = savedGroups.find((g) => g.id === groupId);
  if (!savedGroup) {
    // Group was newly created, discard means remove it
    return groups.filter((g) => g.id !== groupId);
  }
  // Keep runtime/UI fields (status, throughput, expanded) from the live group
  return groups.map((g) =>
    g.id === groupId
      ? { ...savedGroup, ...runtimeGroupFields(g) }
      : g,
  );
}

/** Groups with one flow reverted to its saved copy, or without it when it is new. */
function revertFlow(groups: Group[], savedGroups: Group[], flowId: string): Group[] {
  const savedFlow: Flow | undefined = savedGroups
    .map((g) => g.flows.find((f) => f.id === flowId))
    .find((found) => found !== undefined);

  return groups.map((g) => {
    if (!g.flows.some((f) => f.id === flowId)) return g;
    return {
      ...g,
      flows: savedFlow
        ? g.flows.map((f) => (f.id === flowId ? savedFlow : f))
        // Flow was newly created, remove it
        : g.flows.filter((f) => f.id !== flowId),
    };
  });
}

/** Variables with one variable reverted to its saved copy, or without it when it is new. */
function revertVariable(variables: Variable[], savedVariables: Variable[], variableId: string): Variable[] {
  const savedVar = savedVariables.find((v) => v.id === variableId);
  if (savedVar) {
    return variables.map((v) => (v.id === variableId ? savedVar : v));
  }
  // Variable was newly created, remove it
  return variables.filter((v) => v.id !== variableId);
}

/** DISCARD_ITEM_CHANGES: reverts one group, flow or variable to the saved baseline. */
function discardItemChangesState(state: AppState, payload: ActionPayload<'DISCARD_ITEM_CHANGES'>): AppState {
  if (!state.savedState) return state;

  const { type: itemType, id: itemId } = payload;
  const saved = state.savedState;
  let nextGroups = state.groups;
  let nextVariables = state.variables;

  if (itemType === 'group') {
    nextGroups = revertGroup(state.groups, saved.groups, itemId);
  } else if (itemType === 'flow') {
    nextGroups = revertFlow(state.groups, saved.groups, itemId);
  } else if (itemType === 'variable') {
    nextVariables = revertVariable(state.variables, saved.variables, itemId);
  }

  const { isDirty, dirtyItems } = computeDirtyState(saved, nextGroups, nextVariables, state.settings);
  const flowState = resetFlowEditorState(state, nextGroups, discardedFlowIds(state, itemType, itemId));

  return {
    ...state,
    ...flowState,
    groups: nextGroups,
    variables: nextVariables,
    isDirty,
    dirtyItems,
    selection: selectionExists(state.selection, nextGroups, nextVariables) ? state.selection : { type: 'none' },
  };
}

/** The log of a plugin rollback done by the Core at startup, or null without a rollback. */
function rollbackLogEntry(report: ActionPayload<'LOAD_INITIAL_STATE'>['rollbackReport']): LogEntry | null {
  if (!report) return null;
  return {
    id: `rollback_${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    level: 'error',
    source: 'SYSTEM',
    message: `CRITICAL RECOVERY: ${report.message} (Plugin ID: ${report.pluginId})`,
  };
}

/** The template buffers updated with the saved template of every loaded flow that has one. */
function templatesWithLoadedFlows(formatTemplates: Record<string, string>, groups: Group[]): Record<string, string> {
  const newTemplates = { ...formatTemplates };
  groups.forEach((group: Group) => {
    group.flows.forEach((flow: Flow) => {
      if (flow.template) {
        newTemplates[flow.id] = flow.template;
      }
    });
  });
  return newTemplates;
}

/** LOAD_INITIAL_STATE: the full state sent by the Core (on connection, resync or file load). */
function loadInitialState(state: AppState, payload: ActionPayload<'LOAD_INITIAL_STATE'>): AppState {
  const connectorCatalog = payload.connectorCatalog ?? state.connectorCatalog;

  // Inject a critical recovery log if a rollback occurred
  const rollbackLog = rollbackLogEntry(payload.rollbackReport);
  const file = payload.file;

  // The loaded state becomes the saved baseline when opening a file, on the very first sync
  // with the Core, or while a load/new-project is being applied. Any other resync (e.g. after
  // a reconnection) must keep the baseline so unsaved changes are not silently forgotten.
  const resetsBaseline = Boolean(file) || state.savedState === null || state.baselineSyncPending;

  // A new project rebuilds the connector editors from its flows: a flow with the same id in the
  // previous project (e.g. another copy of the same file) must not keep that project's settings
  const { selections, configs, healthSummary } = normalizeConnectorState(
    payload.groups,
    connectorCatalog,
    resetsBaseline ? {} : state.flowConnectorSelections,
    resetsBaseline ? {} : state.flowConnectorConfigs,
  );

  const newTemplates = templatesWithLoadedFlows(state.formatTemplates, payload.groups);

  // Ensure logs are not lost if multiple initial state calls happen
  const baseLogs = payload.logs ?? state.logs;
  const finalLogs = rollbackLog ? [...baseLogs, rollbackLog] : baseLogs;

  const normalizedGroups = payload.groups;
  const normalizedVars = normalizeVariableListFromCore(payload.variables);
  const settings = payload.settings ?? state.settings;
  const savedState = resetsBaseline
    ? { groups: normalizedGroups, variables: normalizedVars, settings }
    : state.savedState;
  const { isDirty, dirtyItems } = resetsBaseline
    ? { isDirty: false, dirtyItems: createEmptyDirtyItems() }
    : computeDirtyState(savedState, normalizedGroups, normalizedVars, settings);

  return {
    ...state,
    groups: normalizedGroups,
    variables: normalizedVars,
    settings,
    outputFolder: payload.outputFolder ?? state.outputFolder,
    sessionOutputDir: payload.sessionOutputDir === undefined ? state.sessionOutputDir : payload.sessionOutputDir,
    savedState,
    isDirty,
    dirtyItems,
    currentFileName: file ? file.fileName : state.currentFileName,
    currentFilePath: file ? file.filePath : state.currentFilePath,
    currentFileHandle: file ? file.fileHandle : state.currentFileHandle,
    logs: finalLogs,
    connectorCatalog,
    latestConnectors: latestConnectorsFromCatalog(connectorCatalog),
    flowConnectorSelections: selections,
    flowConnectorConfigs: configs,
    connectorHealthSummary: healthSummary,
    metrics: payload.metrics ?? state.metrics,
    systemStatus: payload.systemStatus ?? state.systemStatus,
    formatTemplates: newTemplates,
  };
}

/** Runs the action through every slice reducer, in order. */
function reduceSlices(state: AppState, action: AppAction): AppState {
  let newState = state;
  newState = uiReducer(newState, action);
  newState = systemReducer(newState, action);
  newState = groupsReducer(newState, action);
  newState = variablesReducer(newState, action);
  newState = connectorsReducer(newState, action);
  newState = logsReducer(newState, action);
  newState = metricsReducer(newState, action);
  newState = settingsReducer(newState, action);
  newState = updateReducer(newState, action);
  return newState;
}

/**
 * Recalculates the dirty state after a slice changed the groups, variables, settings or baseline.
 * While a load/new-project is being applied, the Core echoes become the baseline instead.
 */
function withDirtyState(previous: AppState, newState: AppState): AppState {
  const changed = newState.groups !== previous.groups
    || newState.variables !== previous.variables
    || newState.settings !== previous.settings
    || newState.savedState !== previous.savedState;
  if (!changed) {
    return newState;
  }
  if (newState.baselineSyncPending) {
    // Core echoes of a load/new-project are not user changes: adopt them as the baseline
    return {
      ...newState,
      savedState: { groups: newState.groups, variables: newState.variables, settings: newState.settings },
      isDirty: false,
      dirtyItems: createEmptyDirtyItems(),
    };
  }
  const { isDirty, dirtyItems } = computeDirtyState(newState.savedState, newState.groups, newState.variables, newState.settings);
  return {
    ...newState,
    isDirty,
    dirtyItems,
  };
}

export function rootReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'NEW_PROJECT':
      return newProjectState(state);
    case 'MARK_SAVED':
      return markSavedState(state, action.payload);
    case 'SET_FILE_INFO':
      return {
        ...state,
        currentFilePath: action.payload.filePath,
        currentFileName: action.payload.fileName,
        currentFileHandle: action.payload.fileHandle,
      };
    case 'SET_BASELINE_SYNC':
      return { ...state, baselineSyncPending: action.payload };
    case 'SET_AUTO_SAVE':
      return setAutoSaveState(state, action.payload);
    case 'SET_AUTO_SAVE_INTERVAL':
      return setAutoSaveIntervalState(state, action.payload);
    case 'DISCARD_ALL_CHANGES':
      return discardAllChangesState(state);
    case 'DISCARD_ITEM_CHANGES':
      return discardItemChangesState(state, action.payload);
    case 'LOAD_INITIAL_STATE':
      return loadInitialState(state, action.payload);
    default:
      // Delegate to individual slice reducers, then recalculate the dirty state if needed
      return withDirtyState(state, reduceSlices(state, action));
  }
}

export * from './appReducer';

