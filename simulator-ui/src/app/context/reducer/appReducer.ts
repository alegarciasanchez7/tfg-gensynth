import type {
  MetricsPayload,
  FlowMetricsPayload,
  ConnectorPluginDescriptor,
  RollbackReportPayload,
} from '../../core/types';
import type { Selection, Group, Variable, LogEntry, SystemStatus } from '../../types';
import type { ConnectorHealthSummary } from '../../types';

export interface AppState {
  // Connection
  isConnected: boolean;
  connectionMode: 'websocket' | 'jcef' | 'mock';
  
  // System
  systemStatus: SystemStatus;
  projectName: string;
  
  // UI
  isDark: boolean;
  selection: Selection;
  bottomTab: 'logs' | 'stats' | 'preview';
  
  // Data
  groups: Group[];
  variables: Variable[];
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
  isDark: typeof localStorage !== 'undefined' ? localStorage.getItem('gensynth-theme') === 'dark' : false,
  selection: { type: 'none' },
  bottomTab: 'logs',
  groups: [],
  variables: [],
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
  | { type: 'ADD_LOG'; payload: LogEntry }
  | { type: 'SET_LOGS'; payload: LogEntry[] }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_FORMAT_TEMPLATE'; payload: { flowId: string; template: string } }
  | { type: 'SET_CONNECTOR_CATALOG'; payload: ConnectorPluginDescriptor[] }
  | { type: 'SET_FLOW_CONNECTOR_SELECTION'; payload: { flowId: string; pluginId: string; pluginVersion: string } }
  | { type: 'SET_FLOW_CONNECTOR_CONFIG'; payload: { flowId: string; config: Record<string, unknown> } }
  | { type: 'SET_METRICS'; payload: MetricsPayload }
  | { type: 'SET_FLOW_METRICS'; payload: FlowMetricsPayload }
  | { type: 'SET_RESTARTING'; payload: boolean }
  | {
      type: 'LOAD_INITIAL_STATE';
      payload: {
        groups: Group[];
        variables: Variable[];
        logs?: LogEntry[];
        connectorCatalog?: ConnectorPluginDescriptor[];
        metrics?: MetricsPayload | null;
        systemStatus?: SystemStatus;
        rollbackReport?: RollbackReportPayload;
      };
    };
