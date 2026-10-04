import { clampAutoSaveInterval, type AppState, type AppAction } from './appReducer';
import { uiReducer } from './uiSlice';
import { systemReducer } from './systemSlice';
import { groupsReducer } from './groupsSlice';
import { variablesReducer } from './variablesSlice';
import { connectorsReducer } from './connectorsSlice';
import { logsReducer } from './logsSlice';
import { metricsReducer } from './metricsSlice';
import { settingsReducer } from './settingsSlice';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';
import { normalizeVariableListFromCore } from '../variableNormalization';
import {
  normalizeConnectorState,
  latestConnectorsFromCatalog,
} from '../helpers/connectorHelpers';
import { computeDirtyState, createEmptyDirtyItems } from '../helpers/dirtyStateHelper';
import type { LogEntry, Group, Flow } from '../../types';

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

function selectionExists(selection: AppState['selection'], groups: Group[], variables: AppState['variables']): boolean {
  switch (selection.type) {
    case 'group':
      return groups.some((group) => group.id === selection.groupId);
    case 'flow':
      return groups.some((group) => group.id === selection.groupId && group.flows.some((flow) => flow.id === selection.flowId));
    case 'variable':
      return variables.some((variable) => variable.id === selection.variableId);
    default:
      return true;
  }
}

export function rootReducer(state: AppState, action: AppAction): AppState {
  if (action.type === 'NEW_PROJECT') {
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

  if (action.type === 'MARK_SAVED') {
    const { savedState, file } = action.payload;
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

  if (action.type === 'SET_FILE_INFO') {
    return {
      ...state,
      currentFilePath: action.payload.filePath,
      currentFileName: action.payload.fileName,
      currentFileHandle: action.payload.fileHandle,
    };
  }

  if (action.type === 'SET_BASELINE_SYNC') {
    return { ...state, baselineSyncPending: action.payload };
  }

  if (action.type === 'SET_AUTO_SAVE') {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gensynth-autosave', action.payload ? 'true' : 'false');
    }
    return {
      ...state,
      autoSaveEnabled: action.payload,
    };
  }

  if (action.type === 'SET_AUTO_SAVE_INTERVAL') {
    const seconds = clampAutoSaveInterval(action.payload);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gensynth-autosave-interval', String(seconds));
    }
    return {
      ...state,
      autoSaveIntervalSeconds: seconds,
    };
  }

  if (action.type === 'DISCARD_ALL_CHANGES') {
    if (!state.savedState) {
      return state;
    }
    return {
      ...state,
      groups: state.savedState.groups,
      variables: state.savedState.variables,
      isDirty: false,
      dirtyItems: createEmptyDirtyItems(),
    };
  }

  if (action.type === 'DISCARD_ITEM_CHANGES') {
    if (!state.savedState) return state;

    const { type: itemType, id: itemId } = action.payload;
    let nextGroups = state.groups;
    let nextVariables = state.variables;

    if (itemType === 'group') {
      const savedGroup = state.savedState.groups.find((g) => g.id === itemId);
      if (savedGroup) {
        // Keep runtime/UI fields (status, throughput, expanded) from the live group
        nextGroups = state.groups.map((g) =>
          g.id === itemId
            ? { ...savedGroup, status: g.status, throughput: g.throughput, expanded: g.expanded }
            : g,
        );
      } else {
        // Group was newly created, discard means remove it
        nextGroups = state.groups.filter((g) => g.id !== itemId);
      }
    } else if (itemType === 'flow') {
      let savedFlow: Flow | undefined;
      for (const g of state.savedState.groups) {
        const found = g.flows.find((f) => f.id === itemId);
        if (found) {
          savedFlow = found;
          break;
        }
      }

      nextGroups = state.groups.map((g) => {
        const hasFlow = g.flows.some((f) => f.id === itemId);
        if (!hasFlow) return g;

        if (savedFlow) {
          return {
            ...g,
            flows: g.flows.map((f) => (f.id === itemId ? savedFlow! : f)),
          };
        } else {
          // Flow was newly created, remove it
          return {
            ...g,
            flows: g.flows.filter((f) => f.id !== itemId),
          };
        }
      });
    } else if (itemType === 'variable') {
      const savedVar = state.savedState.variables.find((v) => v.id === itemId);
      if (savedVar) {
        nextVariables = state.variables.map((v) => (v.id === itemId ? savedVar : v));
      } else {
        // Variable was newly created, remove it
        nextVariables = state.variables.filter((v) => v.id !== itemId);
      }
    }

    const { isDirty, dirtyItems } = computeDirtyState(state.savedState, nextGroups, nextVariables, state.settings);
    const flowState = resetFlowEditorState(state, nextGroups, itemType === 'group' ? collectGroupFlowIds(state, itemId) : itemType === 'flow' ? [itemId] : []);

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

  if (action.type === 'LOAD_INITIAL_STATE') {
    const connectorCatalog = action.payload.connectorCatalog ?? state.connectorCatalog;
    
    // Inject a critical recovery log if a rollback occurred
    let rollbackLog: LogEntry | null = null;
    if (action.payload.rollbackReport) {
      const report = action.payload.rollbackReport;
      rollbackLog = {
        id: `rollback_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'error',
        source: 'SYSTEM',
        message: `CRITICAL RECOVERY: ${report.message} (Plugin ID: ${report.pluginId})`,
      };
    }

    const { selections, configs, healthSummary } = normalizeConnectorState(
      action.payload.groups,
      connectorCatalog,
      state.flowConnectorSelections,
      state.flowConnectorConfigs,
    );

    const newTemplates = { ...state.formatTemplates };
    action.payload.groups.forEach((group: Group) => {
      group.flows.forEach((flow: Flow) => {
        if (flow.template) {
          newTemplates[flow.id] = flow.template;
        }
      });
    });

    // Ensure logs are not lost if multiple initial state calls happen
    const baseLogs = action.payload.logs ?? state.logs;
    const finalLogs = rollbackLog ? [...baseLogs, rollbackLog] : baseLogs;

    const normalizedGroups = action.payload.groups;
    const normalizedVars = normalizeVariableListFromCore(action.payload.variables);
    const settings = action.payload.settings ?? state.settings;
    const file = action.payload.file;

    // The loaded state becomes the saved baseline when opening a file, on the very first sync
    // with the Core, or while a load/new-project is being applied. Any other resync (e.g. after
    // a reconnection) must keep the baseline so unsaved changes are not silently forgotten.
    const resetsBaseline = Boolean(file) || state.savedState === null || state.baselineSyncPending;
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
      metrics: action.payload.metrics ?? state.metrics,
      systemStatus: action.payload.systemStatus ?? state.systemStatus,
      formatTemplates: newTemplates,
    };
  }

  // Delegate to individual slice reducers
  let newState = state;
  newState = uiReducer(newState, action);
  newState = systemReducer(newState, action);
  newState = groupsReducer(newState, action);
  newState = variablesReducer(newState, action);
  newState = connectorsReducer(newState, action);
  newState = logsReducer(newState, action);
  newState = metricsReducer(newState, action);
  newState = settingsReducer(newState, action);

  // Automatically recalculate dirty state if groups, variables or settings changed
  if (
    newState.groups !== state.groups
    || newState.variables !== state.variables
    || newState.settings !== state.settings
    || newState.savedState !== state.savedState
  ) {
    if (newState.baselineSyncPending) {
      // Core echoes of a load/new-project are not user changes: adopt them as the baseline
      newState = {
        ...newState,
        savedState: { groups: newState.groups, variables: newState.variables, settings: newState.settings },
        isDirty: false,
        dirtyItems: createEmptyDirtyItems(),
      };
    } else {
      const { isDirty, dirtyItems } = computeDirtyState(newState.savedState, newState.groups, newState.variables, newState.settings);
      newState = {
        ...newState,
        isDirty,
        dirtyItems,
      };
    }
  }

  return newState;
}

export * from './appReducer';

