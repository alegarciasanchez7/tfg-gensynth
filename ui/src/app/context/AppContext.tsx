/**
 * Global application context
 * 
 * Manages centralized state and communication with Core Java
 */

import {
  useReducer,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CoreCommands } from '../core/bridge';
import type { TickSettings } from '../types';

import { toast } from 'sonner';
import { OptimisticManager } from './optimisticManager';
import type { PickedProjectFile } from '../core/fileStorage';

// Slices and actions
import { rootReducer, initialState } from './reducer';
import { AppContext, type AppContextValue } from './appContextValue';
import * as selectionActions from './actions/selectionActions';
import * as systemActions from './actions/systemActions';
import * as projectActions from './actions/projectActions';
import * as templateActions from './actions/templateActions';
import * as discardActions from './actions/discardActions';
import * as settingsActions from './actions/settingsActions';
import * as updateActions from './actions/updateActions';

// Hooks
import { useCrudActions } from './hooks/useCrudActions';
import { useBridgeSubscriptions } from './hooks/useBridgeSubscriptions';
import { useAutoSave } from './hooks/useAutoSave';
import { findInvalidItemReference } from './helpers/itemReferenceValidation';

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

interface AppProviderProps {
  children: ReactNode;
  useMockData?: boolean;
}

export function AppProvider({ children, useMockData = false }: Readonly<AppProviderProps>) {
  const [state, dispatch] = useReducer(rootReducer, initialState);
  // Created once for the lifetime of the provider
  const [optimisticManager] = useState(() => new OptimisticManager());
  const stateRef = useRef(state);
  const activeEditorRef = useRef<((name: string, scope?: string) => void) | null>(null);

  // The async actions and the Bridge handlers read the latest state through stateRef. It is
  // updated in a layout effect so it is already fresh when the passive effects of the
  // children run (they run before a passive effect of this provider would).
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Subscribe to WebSocket bridge events and connection lifecycle
  useBridgeSubscriptions({
    state,
    stateRef,
    dispatch,
    optimisticManager,
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
  // The action modules build each action from its dependencies; they keep no state between calls,
  // so building the action when it is called is the same as building it once per dependency change.
  const startSystem = useCallback(
    () => systemActions.startSystem(
      dispatch,
      state.connectionMode,
      reportCommandError,
      () => stateRef.current.variables,
      () => stateRef.current.groups,
      () => stateRef.current.formatTemplates
    )(),
    [state.connectionMode, reportCommandError]
  );

  const stopSystem = useCallback(
    () => systemActions.stopSystem(dispatch, state.connectionMode, reportCommandError)(),
    [state.connectionMode, reportCommandError]
  );

  const toggleSystem = useCallback(
    () => systemActions.toggleSystem(state.systemStatus, startSystem, stopSystem)(),
    [state.systemStatus, startSystem, stopSystem]
  );

  // Selection Actions
  const selectGroup = useCallback(
    (groupId: string) => selectionActions.selectGroup(dispatch)(groupId),
    []
  );

  const selectFlow = useCallback(
    (groupId: string, flowId: string) => selectionActions.selectFlow(dispatch)(groupId, flowId),
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
    () => selectionActions.clearSelection(dispatch)(),
    []
  );

  // Groups: expand and run control
  const toggleGroupExpanded = useCallback((groupId: string) => {
    dispatch({ type: 'TOGGLE_GROUP_EXPANDED', payload: groupId });
  }, []);

  const startGroup = useCallback(async (groupId: string) => {
    // Validate list strategy item access in group templates
    const current = stateRef.current;
    const errText = findInvalidItemReference(
      current.groups.find(g => g.id === groupId),
      current.variables,
      current.formatTemplates,
    );
    if (errText) {
      toast.error(errText);
      reportCommandError('GROUPS', `startGroup(${groupId})`, new Error(errText));
      return;
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
    (flowId: string, template: string) => templateActions.setFormatTemplate(dispatch)(flowId, template),
    []
  );

  const setFlowConnectorSelection = useCallback(
    (flowId: string, pluginId: string, pluginVersion: string) =>
      templateActions.setFlowConnectorSelection(dispatch)(flowId, pluginId, pluginVersion),
    []
  );

  const setFlowConnectorConfig = useCallback(
    (flowId: string, config: Record<string, unknown>) => templateActions.setFlowConnectorConfig(dispatch)(flowId, config),
    []
  );

  const registerTemplateEditor = useCallback(
    (insertFn: ((name: string, scope?: string) => void) | null) => templateActions.registerTemplateEditor(activeEditorRef)(insertFn),
    []
  );

  const insertVariable = useCallback(
    (name: string, scope?: string) => templateActions.insertVariable(activeEditorRef)(name, scope),
    []
  );

  // Project files & save state management.
  // These read the latest state through stateRef so they stay stable across renders.
  const newProjectState = useCallback(
    () => projectActions.newProjectState({ dispatch, isConnected: stateRef.current.isConnected }),
    []
  );

  const loadProjectState = useCallback((file?: PickedProjectFile | null, filePath?: string) => {
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
      filePath,
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
        settings: current.settings,
      },
      type,
      id,
    );
  }, []);

  const discardAllChanges = useCallback(() => {
    const current = stateRef.current;
    return discardActions.discardAllChanges({
      dispatch,
      isConnected: current.isConnected,
      savedState: current.savedState,
      groups: current.groups,
      variables: current.variables,
      settings: current.settings,
    });
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

  const updateContext = useCallback((): updateActions.UpdateActionContext => ({
    dispatch,
    getConnectionMode: () => stateRef.current.connectionMode,
    getSkippedVersion: () => stateRef.current.skippedUpdateVersion,
    getUnsavedWork: () => ({
      isDirty: stateRef.current.isDirty,
      isRunning: stateRef.current.systemStatus === 'running',
    }),
    reportCommandError,
  }), [reportCommandError]);

  const checkForUpdates = useCallback(
    (options: { silent: boolean }) => updateActions.checkForUpdates(updateContext())(options),
    [updateContext]
  );
  const installUpdate = useCallback(
    (version: string) => updateActions.installUpdate(updateContext())(version),
    [updateContext]
  );
  const cancelUpdate = useCallback(() => updateActions.cancelUpdate(updateContext())(), [updateContext]);

  const setUpdateDialogOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_UPDATE_DIALOG_OPEN', payload: open });
  }, []);

  const skipUpdateVersion = useCallback((version: string) => {
    dispatch({ type: 'SKIP_UPDATE_VERSION', payload: version });
  }, []);

  const setCheckUpdatesAtStartup = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_CHECK_UPDATES_AT_STARTUP', payload: enabled });
  }, []);

  const clearUpdateStatus = useCallback(() => {
    dispatch({ type: 'SET_UPDATE_STATUS', payload: null });
  }, []);

  const setOutputFolder = useCallback(
    (path: string | null) =>
      settingsActions.setOutputFolder({
        dispatch,
        getConnectionMode: () => stateRef.current.connectionMode,
        getOutputFolder: () => stateRef.current.outputFolder,
        reportCommandError,
      })(path),
    [reportCommandError]
  );

  const openOutputFolder = useCallback(
    () =>
      settingsActions.openOutputFolder({
        getConnectionMode: () => stateRef.current.connectionMode,
        reportCommandError,
      })(),
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
    optimisticManager,
    reportCommandError,
  });

  const getVariables = useCallback(() => {
    return stateRef.current.variables;
  }, []);

  const actions: AppContextValue['actions'] = useMemo(() => ({
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
      setOutputFolder,
      openOutputFolder,
      checkForUpdates,
      installUpdate,
      cancelUpdate,
      setUpdateDialogOpen,
      skipUpdateVersion,
      setCheckUpdatesAtStartup,
      clearUpdateStatus,
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
  }), [
    startSystem, stopSystem, toggleSystem, newProjectState, loadProjectState, saveProjectState,
    saveProjectStateAs, discardItemChanges, discardAllChanges, setAutoSave, setAutoSaveInterval,
    updateTickSettings, setOutputFolder, openOutputFolder, checkForUpdates, installUpdate, cancelUpdate,
    setUpdateDialogOpen, skipUpdateVersion, setCheckUpdatesAtStartup, clearUpdateStatus,
    selectGroup, selectFlow, selectVariable, clearVariableSelection, clearSelection,
    toggleGroupExpanded, startGroup, stopGroup, crudActions, getVariables, setFormatTemplate,
    setFlowConnectorSelection, setFlowConnectorConfig, insertVariable, registerTemplateEditor,
    setBottomTab, toggleTheme, clearLogs,
  ]);

  // Memoized so consumers only re-render when the state or an action changes
  const contextValue: AppContextValue = useMemo(() => ({ state, dispatch, actions }), [state, actions]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}
