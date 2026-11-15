/**
 * The application context object and the shape of its value (state, dispatch and actions).
 * Kept apart from AppProvider so the provider file only exports components (fast refresh).
 */

import { createContext } from 'react';
import type React from 'react';
import type { Group, TickSettings, Variable, VariableScope, VariableType } from '../types';
import type { PickedProjectFile } from '../core/fileStorage';
import type { UpdateCheckPayload } from '../core/types';
import type { AppAction, AppState } from './reducer';
import type { CreateFlowHandler, FlowConfigUpdate, GroupConfigUpdate } from './crudTypes';

// ─────────────────────────────────────────────────────────────
// Context Value Interface
// ─────────────────────────────────────────────────────────────

export interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    // System
    startSystem: () => Promise<void>;
    stopSystem: () => Promise<void>;
    toggleSystem: () => Promise<void>;
    newProjectState: () => Promise<void>;
    loadProjectState: (file?: PickedProjectFile | null, filePath?: string) => Promise<boolean>;
    saveProjectState: (isAutoSave?: boolean) => Promise<boolean>;
    saveProjectStateAs: () => Promise<boolean>;
    discardItemChanges: (type: 'group' | 'flow' | 'variable', id: string) => Promise<void>;
    discardAllChanges: () => Promise<void>;
    setAutoSave: (enabled: boolean) => void;
    setAutoSaveInterval: (seconds: number) => void;

    // Project settings
    updateTickSettings: (tick: TickSettings) => Promise<void>;
    /** Changes the folder of the generated files on this computer (null = default one). */
    setOutputFolder: (path: string | null) => Promise<void>;
    /** Shows the folder of the current session in the file explorer. */
    openOutputFolder: () => Promise<void>;

    // Updates: nothing is downloaded or installed unless the user asks for it
    checkForUpdates: (options: { silent: boolean }) => Promise<UpdateCheckPayload | null>;
    /** Asks for confirmation, then downloads and installs the version; false if the user cancelled. */
    installUpdate: (version: string) => Promise<boolean>;
    cancelUpdate: () => Promise<void>;
    /** Shows or hides the "update available" dialog ("Not now" hides it). */
    setUpdateDialogOpen: (open: boolean) => void;
    /** Never offers this version again at startup. */
    skipUpdateVersion: (version: string) => void;
    setCheckUpdatesAtStartup: (enabled: boolean) => void;
    clearUpdateStatus: () => void;
    
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
    updateGroupConfig: (groupId: string, config: GroupConfigUpdate, name?: string) => Promise<void>;
    /** Changes the order of a group's flows (the order of the messages of a sequential group). */
    reorderGroupFlows: (groupId: string, flowIds: string[]) => Promise<void>;
    cloneGroup: (groupId: string, count: number, namingPattern?: string) => void;
    
    // Flows: CRUD
    createFlow: CreateFlowHandler;
    deleteFlow: (groupId: string, flowId: string) => Promise<void>;
    updateFlowConfig: (
      groupId: string,
      flowId: string,
      config: FlowConfigUpdate,
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

/** The application context; provided by AppProvider and read with useApp. */
export const AppContext = createContext<AppContextValue | null>(null);
