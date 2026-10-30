import type {
  MetricsPayload,
  FlowMetricsPayload,
  ConnectorPluginDescriptor,
  RollbackReportPayload,
  UpdateStatusPayload,
} from '../../core/types';
import type { Selection, Group, Variable, LogEntry, SystemStatus, ProjectSettings, OutputFolderInfo, UpdateInfo } from '../../types';
import type { ConnectorHealthSummary } from '../../types';
import { createEmptyDirtyItems, type DirtyItems } from '../helpers/dirtyStateHelper';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';

export interface SavedStateSnapshot {
  groups: Group[];
  variables: Variable[];
  settings: ProjectSettings;
}

/**
 * The configuration file currently open. `filePath` is known in desktop mode (written by the Core);
 * `fileHandle` is available in browsers supporting the File System Access API.
 */
export interface ProjectFileInfo {
  fileName: string | null;
  filePath: string | null;
  fileHandle: FileSystemFileHandle | null;
}

export const AUTO_SAVE_DEFAULT_SECONDS = 30;
export const AUTO_SAVE_MIN_SECONDS = 5;
export const AUTO_SAVE_MAX_SECONDS = 3600;

/** Clamps an auto-save interval to the supported range. */
export function clampAutoSaveInterval(seconds: number): number {
  if (!Number.isFinite(seconds)) return AUTO_SAVE_DEFAULT_SECONDS;
  return Math.min(AUTO_SAVE_MAX_SECONDS, Math.max(AUTO_SAVE_MIN_SECONDS, Math.round(seconds)));
}

/** localStorage keys of the update preferences of this device. */
export const CHECK_UPDATES_KEY = 'gensynth-check-updates';
export const SKIPPED_UPDATE_KEY = 'gensynth-skipped-version';

function readStoredAutoSaveInterval(): number {
  if (typeof localStorage === 'undefined') return AUTO_SAVE_DEFAULT_SECONDS;
  const stored = localStorage.getItem('gensynth-autosave-interval');
  return stored === null ? AUTO_SAVE_DEFAULT_SECONDS : clampAutoSaveInterval(Number(stored));
}

export interface AppState {
  // Connection
  isConnected: boolean;
  connectionMode: 'websocket' | 'jcef' | 'mock';
  
  // System
  systemStatus: SystemStatus;
  projectName: string;
  
  // Save & Dirty State Tracking
  savedState: SavedStateSnapshot | null;
  isDirty: boolean;
  dirtyItems: DirtyItems;
  currentFilePath: string | null;
  currentFileName: string | null;
  currentFileHandle: FileSystemFileHandle | null;
  autoSaveEnabled: boolean;
  autoSaveIntervalSeconds: number;
  /**
   * True while the Core is applying a load/new-project. Its state echoes (which may differ in shape
   * from the file contents) are adopted as the saved baseline instead of being flagged as changes.
   */
  baselineSyncPending: boolean;
  
  // UI
  isDark: boolean;
  selection: Selection;
  bottomTab: 'logs' | 'stats' | 'preview';
  
  // Data
  groups: Group[];
  variables: Variable[];
  /** Project-wide simulation settings (tick clock), saved with the project. */
  settings: ProjectSettings;
  /** Folder of the generated files on this computer; null until the Core reports it. */
  outputFolder: OutputFolderInfo | null;

  // Updates (the user always decides whether to install)
  /** Newer release found by the last check, or null. */
  availableUpdate: UpdateInfo | null;
  /** Whether the "update available" dialog is shown. */
  updateDialogOpen: boolean;
  /** Progress of an update the user started, or null. */
  updateStatus: UpdateStatusPayload | null;
  /** Check for updates when the app starts (stored on this device). */
  checkUpdatesAtStartup: boolean;
  /** Version the user chose to skip: the startup check does not offer it again. */
  skippedUpdateVersion: string | null;
  logs: LogEntry[];
  formatTemplates: Record<string, string>;
  connectorCatalog: ConnectorPluginDescriptor[];
  latestConnectors: ConnectorPluginDescriptor[];
  flowConnectorSelections: Record<string, { pluginId: string; pluginVersion: string }>;
  flowConnectorConfigs: Record<string, Record<string, unknown>>;
  connectorHealthSummary: ConnectorHealthSummary[];
  
  // Metrics
  metrics: MetricsPayload | null;
  flowMetrics: Record<string, FlowMetricsPayload>;
  isRestarting: boolean;
}

export const initialState: AppState = {
  isConnected: false,
  connectionMode: 'websocket',
  systemStatus: 'stopped',
  projectName: 'GenSynth',
  savedState: null,
  isDirty: false,
  dirtyItems: createEmptyDirtyItems(),
  currentFilePath: null,
  currentFileName: null,
  currentFileHandle: null,
  autoSaveEnabled: typeof localStorage !== 'undefined' ? localStorage.getItem('gensynth-autosave') === 'true' : false,
  autoSaveIntervalSeconds: readStoredAutoSaveInterval(),
  baselineSyncPending: false,
  isDark: typeof localStorage !== 'undefined' ? localStorage.getItem('gensynth-theme') === 'dark' : false,
  selection: { type: 'none' },
  bottomTab: 'logs',
  groups: [],
  variables: [],
  settings: DEFAULT_PROJECT_SETTINGS,
  outputFolder: null,
  availableUpdate: null,
  updateDialogOpen: false,
  updateStatus: null,
  checkUpdatesAtStartup: typeof localStorage !== 'undefined' ? localStorage.getItem(CHECK_UPDATES_KEY) !== 'false' : true,
  skippedUpdateVersion: typeof localStorage !== 'undefined' ? localStorage.getItem(SKIPPED_UPDATE_KEY) : null,
  logs: [],
  formatTemplates: {},
  connectorCatalog: [],
  latestConnectors: [],
  flowConnectorSelections: {},
  flowConnectorConfigs: {},
  connectorHealthSummary: [],
  metrics: null,
  flowMetrics: {},
  isRestarting: false,
};

export type AppAction =
  | { type: 'SET_CONNECTED'; payload: { connected: boolean; mode: 'websocket' | 'jcef' | 'mock' } }
  | { type: 'SET_SYSTEM_STATUS'; payload: SystemStatus }
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_SELECTION'; payload: Selection }
  | { type: 'SET_BOTTOM_TAB'; payload: 'logs' | 'stats' | 'preview' }
  | { type: 'SET_GROUPS'; payload: Group[] }
  | { type: 'UPDATE_GROUP'; payload: Partial<Group> & { id: string } }
  | { type: 'TOGGLE_GROUP_EXPANDED'; payload: string }
  | { type: 'SET_VARIABLES'; payload: Variable[] }
  | { type: 'SET_SETTINGS'; payload: ProjectSettings }
  | { type: 'SET_OUTPUT_FOLDER'; payload: OutputFolderInfo }
  | { type: 'SET_AVAILABLE_UPDATE'; payload: { update: UpdateInfo | null; openDialog: boolean } }
  | { type: 'SET_UPDATE_DIALOG_OPEN'; payload: boolean }
  | { type: 'SET_UPDATE_STATUS'; payload: UpdateStatusPayload | null }
  | { type: 'SET_CHECK_UPDATES_AT_STARTUP'; payload: boolean }
  | { type: 'SKIP_UPDATE_VERSION'; payload: string }
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'SET_LOGS'; payload: LogEntry[] }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_FORMAT_TEMPLATE'; payload: { flowId: string; template: string } }
  | { type: 'SET_CONNECTOR_CATALOG'; payload: ConnectorPluginDescriptor[] }
  | { type: 'SET_FLOW_CONNECTOR_SELECTION'; payload: { flowId: string; pluginId: string; pluginVersion: string } }
  | { type: 'SET_FLOW_CONNECTOR_CONFIG'; payload: { flowId: string; config: Record<string, unknown> } }
  | { type: 'SET_METRICS'; payload: MetricsPayload }
  | { type: 'SET_FLOWS_METRICS'; payload: FlowMetricsPayload[] }
  | { type: 'SET_RESTARTING'; payload: boolean }
  | { type: 'NEW_PROJECT' }
  | { type: 'MARK_SAVED'; payload: { savedState: SavedStateSnapshot; file: ProjectFileInfo } }
  | { type: 'SET_FILE_INFO'; payload: ProjectFileInfo }
  | { type: 'SET_BASELINE_SYNC'; payload: boolean }
  | { type: 'SET_AUTO_SAVE'; payload: boolean }
  | { type: 'SET_AUTO_SAVE_INTERVAL'; payload: number }
  | { type: 'DISCARD_ITEM_CHANGES'; payload: { type: 'group' | 'flow' | 'variable'; id: string } }
  | { type: 'DISCARD_ALL_CHANGES' }
  | {
      type: 'LOAD_INITIAL_STATE';
      payload: {
        groups: Group[];
        variables: Variable[];
        /** Project settings; the current ones are kept when omitted (e.g. older cores). */
        settings?: ProjectSettings;
        /** Folder of the generated files; the current one is kept when omitted (e.g. older cores). */
        outputFolder?: OutputFolderInfo;
        logs?: LogEntry[];
        connectorCatalog?: ConnectorPluginDescriptor[];
        metrics?: MetricsPayload | null;
        systemStatus?: SystemStatus;
        rollbackReport?: RollbackReportPayload;
        /** Present when the state comes from opening a file: resets the saved baseline. */
        file?: ProjectFileInfo;
      };
    };
