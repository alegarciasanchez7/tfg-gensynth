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
} from '../types';

import { OptimisticManager } from './optimisticManager';

// Slices and actions
import { rootReducer, initialState, type AppState, type AppAction } from './reducer';
import * as selectionActions from './actions/selectionActions';
import * as systemActions from './actions/systemActions';
import * as projectActions from './actions/projectActions';
import * as templateActions from './actions/templateActions';

// Hooks
import { useCrudActions } from './hooks/useCrudActions';
import { useBridgeSubscriptions } from './hooks/useBridgeSubscriptions';

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
    loadProjectState: () => Promise<void>;
    saveProjectState: () => Promise<void>;
    
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
  const preserveLocalSnapshotRef = useRef(false);
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
    systemActions.startSystem(dispatch, state.connectionMode, reportCommandError),
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

  // Project snapshots
  const loadProjectState = useCallback(
    projectActions.loadProjectState(dispatch, state.connectionMode, state.connectorCatalog, state.selection, preserveLocalSnapshotRef),
    [state.connectionMode, state.connectorCatalog, state.selection]
  );

  const saveProjectState = useCallback(
    projectActions.saveProjectState(dispatch, state.connectionMode, state.groups, state.variables),
    [state.connectionMode, state.groups, state.variables]
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

  const actions = {
    startSystem,
    stopSystem,
    toggleSystem,
    loadProjectState,
    saveProjectState,
    selectGroup,
    selectFlow,
    selectVariable,
    clearVariableSelection,
    clearSelection,
    toggleGroupExpanded,
    startGroup,
    stopGroup,
    ...crudActions,
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
