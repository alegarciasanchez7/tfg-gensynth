/**
 * Global application context
 * 
 * Manages centralized state and communication with Core Java
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { CoreCommands } from '../core/bridge';
import type {
  Group,
  Flow,
  VariableType,
  VariableScope,
  Variable,
  TickSettings,
} from '../types';

import { toast } from 'sonner';
import { OptimisticManager } from './optimisticManager';
import type { PickedProjectFile } from '../core/fileStorage';

// Slices and actions
import { rootReducer, initialState, type AppState, type AppAction } from './reducer';
import * as selectionActions from './actions/selectionActions';
import * as systemActions from './actions/systemActions';
import * as projectActions from './actions/projectActions';
import * as templateActions from './actions/templateActions';
import * as discardActions from './actions/discardActions';
import * as settingsActions from './actions/settingsActions';

// Hooks
import { useCrudActions } from './hooks/useCrudActions';
import { useBridgeSubscriptions } from './hooks/useBridgeSubscriptions';
import { useAutoSave } from './hooks/useAutoSave';

// ─────────────────────────────────────────────────────────────
// Context Value Interface
// ─────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    // System
    startSystem: () => Promise<void>;
    stopSystem: () => Promise<void>;
    toggleSystem: () => Promise<void>;
    newProjectState: () => Promise<void>;
    loadProjectState: (file?: PickedProjectFile | null) => Promise<boolean>;
    saveProjectState: (isAutoSave?: boolean) => Promise<boolean>;
    saveProjectStateAs: () => Promise<boolean>;
    discardItemChanges: (type: 'group' | 'flow' | 'variable', id: string) => Promise<void>;
    discardAllChanges: () => void;
    setAutoSave: (enabled: boolean) => void;
    setAutoSaveInterval: (seconds: number) => void;

    // Project settings
    updateTickSettings: (tick: TickSettings) => Promise<void>;
    
    // Selection
    selectGroup: (groupId: string) => void;
    selectFlow: (groupId: string, flowId: string) => void;
    selectVariable: (variableId: string) => void;
    clearVariableSelection: () => void;
    clearSelection: () => void;
    
    // Groups: basic actions
    toggleGroupExpanded: (groupId: string) => void;
    startGroup: (groupId: string) => Promise<void>;
    stopGroup: (groupId: string) => Promise<void>;
    
    // Groups: CRUD
    createGroup: (name: string, description?: string) => Promise<Group>;
    deleteGroup: (groupId: string) => Promise<void>;
    updateGroupConfig: (groupId: string, config: Partial<Omit<Group, 'id' | 'flows'>>, name?: string) => Promise<void>;
    cloneGroup: (groupId: string, count: number, namingPattern?: string) => void;
    
    // Flows: CRUD
    createFlow: (
      groupId: string,
      name: string,
      technology: string,
      host: string,
      port: number,
      topic?: string,
      interval?: number,
      burst?: number,
      template?: string,
      connectorConfig?: Record<string, unknown>,
      everyTicks?: number,
    ) => Promise<Flow>;
    deleteFlow: (groupId: string, flowId: string) => Promise<void>;
    updateFlowConfig: (
      groupId: string,
      flowId: string,
      config: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>> & { template?: string },
    ) => Promise<void>;
    cloneFlow: (groupId: string, flowId: string, count: number, namingPattern?: string) => void;
    
    // Variables: CRUD
    createVariable: (
      name: string,
      type: VariableType,
      scope: VariableScope,
      config?: Record<string, unknown>,
      flowId?: string,
      groupId?: string,
      variableId?: string,
    ) => Promise<Variable>;
    deleteVariable: (variableId: string) => Promise<void>;
    updateVariable: (variableId: string, updates: Partial<Omit<Variable, 'id'>>) => Promise<void>;
    getVariables: () => Variable[];
    
    // Templates
    setFormatTemplate: (flowId: string, template: string) => void;
    setFlowConnectorSelection: (flowId: string, pluginId: string, pluginVersion: string) => void;
    setFlowConnectorConfig: (flowId: string, config: Record<string, unknown>) => void;
    
    // Variables: insertion into templates
    insertVariable: (name: string, scope?: string) => void;
    registerTemplateEditor: (insertFn: ((name: string, scope?: string) => void) | null) => void;
    
    // UI
    setBottomTab: (tab: 'logs' | 'stats' | 'preview') => void;
    toggleTheme: () => void;
    clearLogs: () => void;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

interface AppProviderProps {
  children: ReactNode;
  useMockData?: boolean;
}

export function AppProvider({ children, useMockData = false }: AppProviderProps) {
  const [state, dispatch] = useReducer(rootReducer, initialState);
  const optimisticManager = useRef<OptimisticManager | null>(null);
  const stateRef = useRef(state);
  const activeEditorRef = useRef<((name: string, scope?: string) => void) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Initialize OptimisticManager once
  if (!optimisticManager.current) {
    optimisticManager.current = new OptimisticManager();
  }

  // Subscribe to WebSocket bridge events and connection lifecycle
  useBridgeSubscriptions({
    state,
    stateRef,
    dispatch,
    optimisticManager: optimisticManager.current,
    useMockData,
  });

  // Helper for reporting command execution errors in logs
  const reportCommandError = useCallback((source: string, action: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AppContext] ${action} failed:`, error);
    dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `cmd_error_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'error',
        source,
        message,
      },
    });
  }, []);

  // System Actions
  const startSystem = useCallback(
    systemActions.startSystem(
      dispatch,
      state.connectionMode,
      reportCommandError,
      () => stateRef.current.variables,
      () => stateRef.current.groups,
      () => stateRef.current.formatTemplates
    ),
    [state.connectionMode, reportCommandError]
  );

  const stopSystem = useCallback(
    systemActions.stopSystem(dispatch, state.connectionMode, reportCommandError),
    [state.connectionMode, reportCommandError]
  );

  const toggleSystem = useCallback(
    systemActions.toggleSystem(state.systemStatus, startSystem, stopSystem),
    [state.systemStatus, startSystem, stopSystem]
  );

  // Selection Actions
  const selectGroup = useCallback(
    selectionActions.selectGroup(dispatch),
    []
  );

  const selectFlow = useCallback(
    selectionActions.selectFlow(dispatch),
    []
  );

  const selectVariable = useCallback(
    (variableId: string) => selectionActions.selectVariable(dispatch, state.selection)(variableId),
    [state.selection]
  );

  const clearVariableSelection = useCallback(
    () => selectionActions.clearVariableSelection(dispatch, state.selection)(),
    [state.selection]
  );

  const clearSelection = useCallback(
    selectionActions.clearSelection(dispatch),
    []
  );

  // Groups: expand and run control
  const toggleGroupExpanded = useCallback((groupId: string) => {
    dispatch({ type: 'TOGGLE_GROUP_EXPANDED', payload: groupId });
  }, []);

  const startGroup = useCallback(async (groupId: string) => {
    // Validate list strategy item access in group templates
    const targetGroup = stateRef.current.groups.find(g => g.id === groupId);
    const variables = stateRef.current.variables;
    const formatTemplates = stateRef.current.formatTemplates;

    if (targetGroup) {
      for (const flow of targetGroup.flows || []) {
        const template = formatTemplates[flow.id] ?? flow.template ?? '';
        if (!template) continue;

        const regex = /\{\{([^}]+)\}\}/g;
        let match;
        while ((match = regex.exec(template)) !== null) {
          const fullSpec = match[1].trim();
          if (['uuid', 'ts', 'n'].includes(fullSpec)) continue;

          let scope: string | null = null;
          let name = fullSpec;
          let isItemAccess = false;

          if (fullSpec.includes('.')) {
            const parts = fullSpec.split('.');
            if (parts.length >= 3 && parts[parts.length - 1].toLowerCase().startsWith('item')) {
              scope = parts[0].toLowerCase();
              name = parts[1];
              isItemAccess = true;
            } else if (parts.length === 2 && parts[1].toLowerCase().startsWith('item')) {
              scope = null;
              name = parts[0];
              isItemAccess = true;
            }
          }

          if (isItemAccess) {
            const targetVar = variables.find((v: any) => {
              if (v.name !== name) return false;
              if (scope && v.scope !== scope) return false;
              if (v.scope === 'global') return true;
              if (v.scope === 'group') return v.groupId === groupId;
              if (v.scope === 'local') return v.flowId === flow.id;
              return false;
            });

            if (targetVar && targetVar.type === 'list') {
              const strategy = targetVar.config?.selectionStrategy;
              if (strategy && strategy !== 'FIXED_SUBSET') {
                const errText = `Invalid item reference in flow '${flow.name}': Variable '${targetVar.name}' uses strategy '${strategy}' (not 'FIXED_SUBSET') and cannot be referenced with sub-item index (.itemX).`;
                toast.error(errText);
                reportCommandError('GROUPS', `startGroup(${groupId})`, new Error(errText));
                return;
              }
            }
          }
        }
      }
    }

    try {
      if (state.connectionMode !== 'mock') {
        await CoreCommands.startGroup(groupId);
      }
      dispatch({ type: 'UPDATE_GROUP', payload: { id: groupId, status: 'running' } });
    } catch (error) {
      reportCommandError('GROUPS', `startGroup(${groupId})`, error);
    }
  }, [reportCommandError, state.connectionMode]);

  const stopGroup = useCallback(async (groupId: string) => {
    try {
      if (state.connectionMode !== 'mock') {
        await CoreCommands.stopGroup(groupId);
      }
      dispatch({ type: 'UPDATE_GROUP', payload: { id: groupId, status: 'stopped' } });
    } catch (error) {
      reportCommandError('GROUPS', `stopGroup(${groupId})`, error);
    }
  }, [reportCommandError, state.connectionMode]);

  // Templates
  const setFormatTemplate = useCallback(
    templateActions.setFormatTemplate(dispatch),
    []
  );

  const setFlowConnectorSelection = useCallback(
    templateActions.setFlowConnectorSelection(dispatch),
    []
  );

  const setFlowConnectorConfig = useCallback(
    templateActions.setFlowConnectorConfig(dispatch),
    []
  );

  const registerTemplateEditor = useCallback(
    templateActions.registerTemplateEditor(activeEditorRef),
    []
  );

  const insertVariable = useCallback(
    templateActions.insertVariable(activeEditorRef),
    []
  );

  // Project files & save state management.
  // These read the latest state through stateRef so they stay stable across renders.
  const newProjectState = useCallback(
    () => projectActions.newProjectState({ dispatch, isConnected: stateRef.current.isConnected }),
    []
  );

  const loadProjectState = useCallback((file?: PickedProjectFile | null) => {
    const current = stateRef.current;
    return projectActions.loadProjectState(
      {
        dispatch,
        connectionMode: current.connectionMode,
        isConnected: current.isConnected,
        connectorCatalog: current.connectorCatalog,
        selection: current.selection,
      },
      file,
    );
  }, []);

  const getSaveContext = useCallback((): projectActions.ProjectSaveContext => {
    const current = stateRef.current;
    return {
      dispatch,
      connectionMode: current.connectionMode,
      groups: current.groups,
      variables: current.variables,
      settings: current.settings,
      file: {
        fileName: current.currentFileName,
        filePath: current.currentFilePath,
        fileHandle: current.currentFileHandle,
      },
    };
  }, []);

  const saveProjectState = useCallback(
    (isAutoSave = false) => projectActions.saveProjectState(getSaveContext(), isAutoSave),
    [getSaveContext]
  );

  const saveProjectStateAs = useCallback(
    () => projectActions.saveProjectStateAs(getSaveContext()),
    [getSaveContext]
  );

  useAutoSave({
    enabled: state.autoSaveEnabled,
    intervalSeconds: state.autoSaveIntervalSeconds,
    isDirty: state.isDirty,
    save: saveProjectState,
  });

  const discardItemChanges = useCallback((type: 'group' | 'flow' | 'variable', id: string) => {
    const current = stateRef.current;
    return discardActions.discardItemChanges(
      {
        dispatch,
        isConnected: current.isConnected,
        savedState: current.savedState,
        groups: current.groups,
        variables: current.variables,
      },
      type,
      id,
    );
  }, []);

  const discardAllChanges = useCallback(() => {
    dispatch({ type: 'DISCARD_ALL_CHANGES' });
  }, []);

  const setAutoSave = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_AUTO_SAVE', payload: enabled });
  }, []);

  const setAutoSaveInterval = useCallback((seconds: number) => {
    dispatch({ type: 'SET_AUTO_SAVE_INTERVAL', payload: seconds });
  }, []);

  const updateTickSettings = useCallback(
    (tick: TickSettings) =>
      settingsActions.updateTickSettings({
        dispatch,
        getConnectionMode: () => stateRef.current.connectionMode,
        getSettings: () => stateRef.current.settings,
        reportCommandError,
      })(tick),
    [reportCommandError]
  );

  // UI / Logs
  const setBottomTab = useCallback((tab: 'logs' | 'stats' | 'preview') => {
    dispatch({ type: 'SET_BOTTOM_TAB', payload: tab });
  }, []);

  const toggleTheme = useCallback(() => {
    dispatch({ type: 'TOGGLE_THEME' });
  }, []);

  const clearLogs = useCallback(() => {
    dispatch({ type: 'CLEAR_LOGS' });
  }, []);

  // CRUD actions hook delegate
  const crudActions = useCrudActions({
    state,
    stateRef,
    dispatch,
    optimisticManager: optimisticManager.current,
    reportCommandError,
  });

  const getVariables = useCallback(() => {
    return stateRef.current.variables;
  }, []);

  const actions = {
    startSystem,
    stopSystem,
    toggleSystem,
    newProjectState,
    loadProjectState,
    saveProjectState,
    saveProjectStateAs,
    discardItemChanges,
    discardAllChanges,
    setAutoSave,
    setAutoSaveInterval,
    updateTickSettings,
    selectGroup,
    selectFlow,
    selectVariable,
    clearVariableSelection,
    clearSelection,
    toggleGroupExpanded,
    startGroup,
    stopGroup,
    ...crudActions,
    getVariables,
    setFormatTemplate,
    setFlowConnectorSelection,
    setFlowConnectorConfig,
    insertVariable,
    registerTemplateEditor,
    setBottomTab,
    toggleTheme,
    clearLogs,
  };

  return (
    <AppContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp debe usarse dentro de AppProvider');
  }
  return context;
}

export function useSystemStatus() {
  const { state } = useApp();
  return state.systemStatus;
}

export function useGroups() {
  const { state } = useApp();
  return state.groups;
}

export function useVariables() {
  const { state } = useApp();
  return state.variables;
}

export function useSelection() {
  const { state, actions } = useApp();
  return {
    selection: state.selection,
    selectGroup: actions.selectGroup,
    selectFlow: actions.selectFlow,
    selectVariable: actions.selectVariable,
    clearVariableSelection: actions.clearVariableSelection,
  };
}

export function useMetrics() {
  const { state } = useApp();
  return {
    metrics: state.metrics,
    flowMetrics: state.flowMetrics,
  };
}

export function useLogs() {
  const { state, actions } = useApp();
  return {
    logs: state.logs,
    clearLogs: actions.clearLogs,
  };
}

export function useConnection() {
  const { state } = useApp();
  return {
    isConnected: state.isConnected,
    mode: state.connectionMode,
  };
}

export function useConnectorCatalog() {
  const { state } = useApp();
  return {
    connectorCatalog: state.connectorCatalog,
    latestConnectors: state.latestConnectors,
  };
}

export function useConnectorHealthSummary() {
  const { state } = useApp();
  return state.connectorHealthSummary;
}

export function useFlowConnectorState(flowId: string) {
  const { state, actions } = useApp();
  return {
    connectorSelection: state.flowConnectorSelections[flowId] ?? null,
    connectorConfig: state.flowConnectorConfigs[flowId] ?? {},
    setConnectorSelection: actions.setFlowConnectorSelection,
    setConnectorConfig: actions.setFlowConnectorConfig,
  };
}
