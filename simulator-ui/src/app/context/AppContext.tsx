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
import bridge, { CoreCommands } from '../core/bridge';
import type {
  SystemStatusPayload,
  MetricsPayload,
  LogPayload,
  GroupState,
  FlowMetricsPayload,
  ConnectorPluginDescriptor,
} from '../core/types';
import type { Selection, Group, Variable, LogEntry, SystemStatus, Flow, ConnectorHealthStatus } from '../types';
import type { ConnectorHealthSummary } from '../types';
import { mockGroups, mockVariables, mockLogs, mockConnectorCatalog } from '../data/mockData';
import * as CRUDActions from './crudActions';
import type { CRUDActionContext } from './crudActions';

// ─────────────────────────────────────────────────────────────
// Application State
// ─────────────────────────────────────────────────────────────

interface AppState {
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
}

const initialState: AppState = {
  isConnected: false,
  connectionMode: 'mock',
  systemStatus: 'stopped',
  projectName: 'SYN·GEN Project',
  isDark: false,
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
};

// ─────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────

type AppAction =
  | { type: 'SET_CONNECTED'; payload: { connected: boolean; mode: 'websocket' | 'jcef' | 'mock' } }
  | { type: 'SET_SYSTEM_STATUS'; payload: SystemStatus }
  | { type: 'SET_PROJECT_NAME'; payload: string }
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
  | { type: 'LOAD_INITIAL_STATE'; payload: { groups: Group[]; variables: Variable[]; logs: LogEntry[] } };

function compareVersions(leftVersion: string, rightVersion: string): number {
  const leftParts = leftVersion.split('.').map((part) => Number(part) || 0);
  const rightParts = rightVersion.split('.').map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const comparison = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return leftVersion.localeCompare(rightVersion);
}

function latestConnectorsFromCatalog(catalog: ConnectorPluginDescriptor[]): ConnectorPluginDescriptor[] {
  const latestByPluginId = new Map<string, ConnectorPluginDescriptor>();

  for (const descriptor of catalog) {
    const current = latestByPluginId.get(descriptor.pluginId);
    if (!current || compareVersions(descriptor.pluginVersion, current.pluginVersion) > 0) {
      latestByPluginId.set(descriptor.pluginId, descriptor);
    }
  }

  return Array.from(latestByPluginId.values()).sort((left, right) =>
    left.displayName.localeCompare(right.displayName) ||
    left.pluginId.localeCompare(right.pluginId)
  );
}

function getConnectorProperties(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return ((schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {});
}

function getDefaultConfigFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = getConnectorProperties(schema);
  const defaults: Record<string, unknown> = {};

  for (const [name, definition] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(definition, 'default')) {
      defaults[name] = definition.default;
      continue;
    }

    if (Array.isArray(definition.enum) && definition.enum.length > 0) {
      defaults[name] = definition.enum[0];
      continue;
    }

    switch (definition.type) {
      case 'number':
      case 'integer':
        defaults[name] = 0;
        break;
      case 'boolean':
        defaults[name] = false;
        break;
      case 'array':
        defaults[name] = [];
        break;
      case 'object':
        defaults[name] = {};
        break;
      default:
        defaults[name] = '';
        break;
    }
  }

  return defaults;
}

function findDescriptor(
  catalog: ConnectorPluginDescriptor[],
  pluginId: string,
  pluginVersion?: string,
): ConnectorPluginDescriptor | null {
  if (pluginVersion) {
    return catalog.find((descriptor) => descriptor.pluginId === pluginId && descriptor.pluginVersion === pluginVersion) ?? null;
  }

  return catalog
    .filter((descriptor) => descriptor.pluginId === pluginId)
    .sort((left, right) => compareVersions(right.pluginVersion, left.pluginVersion))[0] ?? null;
}

function findBestDescriptorForFlow(flow: Flow, catalog: ConnectorPluginDescriptor[]): ConnectorPluginDescriptor | null {
  const normalizedTechnology = flow.technology.toLowerCase();
  return findDescriptor(catalog, normalizedTechnology) ?? findDescriptor(catalog, flow.technology) ?? catalog[0] ?? null;
}

function normalizeConnectorState(
  groups: Group[],
  catalog: ConnectorPluginDescriptor[],
  previousSelections: Record<string, { pluginId: string; pluginVersion: string }> = {},
  previousConfigs: Record<string, Record<string, unknown>> = {},
) {
  const selections: Record<string, { pluginId: string; pluginVersion: string }> = {};
  const configs: Record<string, Record<string, unknown>> = {};

  for (const group of groups) {
    for (const flow of group.flows) {
      const existingSelection = previousSelections[flow.id];
      const existingDescriptor = existingSelection
        ? findDescriptor(catalog, existingSelection.pluginId, existingSelection.pluginVersion)
        : null;
      const selectedDescriptor = existingDescriptor ?? findBestDescriptorForFlow(flow, catalog);

      if (!selectedDescriptor) {
        continue;
      }

      selections[flow.id] = {
        pluginId: selectedDescriptor.pluginId,
        pluginVersion: selectedDescriptor.pluginVersion,
      };

      configs[flow.id] = previousConfigs[flow.id] ?? getDefaultConfigFromSchema(selectedDescriptor.configSchema);
    }
  }

  return { selections, configs, healthSummary: buildConnectorHealthSummary(groups, catalog, selections) };
}

function buildConnectorHealthSummary(
  groups: Group[],
  catalog: ConnectorPluginDescriptor[],
  selections: Record<string, { pluginId: string; pluginVersion: string }>,
): ConnectorHealthSummary[] {
  const summaryByKey = new Map<string, ConnectorHealthSummary>();

  for (const group of groups) {
    for (const flow of group.flows) {
      const selection = selections[flow.id];
      const descriptor = selection
        ? findDescriptor(catalog, selection.pluginId, selection.pluginVersion)
        : findBestDescriptorForFlow(flow, catalog);

      if (!descriptor) {
        continue;
      }

      const key = `${descriptor.pluginId}@${descriptor.pluginVersion}`;
      const entry = summaryByKey.get(key) ?? {
        pluginId: descriptor.pluginId,
        pluginVersion: descriptor.pluginVersion,
        displayName: descriptor.displayName,
        status: 'offline',
        flowCount: 0,
        connectedCount: 0,
        warningCount: 0,
        errorCount: 0,
        lastMessage: undefined,
      };

      entry.flowCount += 1;

      if (flow.connectionStatus === 'connected' && !flow.hasError) {
        entry.connectedCount += 1;
      } else if (flow.connectionStatus === 'warning') {
        entry.warningCount += 1;
        entry.lastMessage = flow.errorMessage ?? entry.lastMessage;
      } else {
        entry.errorCount += 1;
        entry.lastMessage = flow.errorMessage ?? entry.lastMessage ?? `Flow ${flow.name} is ${flow.connectionStatus}`;
      }

      summaryByKey.set(key, entry);
    }
  }

  return Array.from(summaryByKey.values())
    .map((entry) => {
      const allConnected = entry.connectedCount === entry.flowCount && entry.flowCount > 0;
      const hasProblems = entry.errorCount > 0 || entry.warningCount > 0;
      const status: ConnectorHealthStatus = allConnected ? 'healthy' : hasProblems ? 'degraded' : 'offline';

      return {
        ...entry,
        status,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.pluginVersion.localeCompare(right.pluginVersion));
}

function formatConnectorHealthMessage(summary: ConnectorHealthSummary[]): string {
  if (summary.length === 0) {
    return 'Connector health unavailable';
  }

  return summary
    .map((entry) => `${entry.displayName}@${entry.pluginVersion}:${entry.status}`)
    .join(' | ');
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { 
        ...state, 
        isConnected: action.payload.connected,
        connectionMode: action.payload.mode,
      };

    case 'SET_SYSTEM_STATUS':
      return { ...state, systemStatus: action.payload };

    case 'SET_PROJECT_NAME':
      return { ...state, projectName: action.payload };

    case 'TOGGLE_THEME':
      return { ...state, isDark: !state.isDark };

    case 'SET_SELECTION':
      return { ...state, selection: action.payload };

    case 'SET_BOTTOM_TAB':
      return { ...state, bottomTab: action.payload };

    case 'SET_GROUPS':
      return (() => {
        const { selections, configs, healthSummary } = normalizeConnectorState(
          action.payload,
          state.connectorCatalog,
          state.flowConnectorSelections,
          state.flowConnectorConfigs,
        );

        return {
          ...state,
          groups: action.payload,
          flowConnectorSelections: selections,
          flowConnectorConfigs: configs,
          connectorHealthSummary: healthSummary,
        };
      })();

    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map(g =>
          g.id === action.payload.id ? { ...g, ...action.payload } : g
        ),
        connectorHealthSummary: buildConnectorHealthSummary(
          state.groups.map(g => (g.id === action.payload.id ? { ...g, ...action.payload } : g)),
          state.connectorCatalog,
          state.flowConnectorSelections,
        ),
      };

    case 'TOGGLE_GROUP_EXPANDED':
      return {
        ...state,
        groups: state.groups.map(g =>
          g.id === action.payload ? { ...g, expanded: !g.expanded } : g
        ),
      };

    case 'SET_VARIABLES':
      return { ...state, variables: action.payload };

    case 'ADD_LOG':
      return { 
        ...state, 
        logs: [...state.logs.slice(-999), action.payload], // Keep at most 1000 logs
      };

    case 'SET_LOGS':
      return { ...state, logs: action.payload };

    case 'CLEAR_LOGS':
      return { ...state, logs: [] };

    case 'SET_FORMAT_TEMPLATE':
      return {
        ...state,
        formatTemplates: {
          ...state.formatTemplates,
          [action.payload.flowId]: action.payload.template,
        },
      };

    case 'SET_CONNECTOR_CATALOG':
      return (() => {
        const { selections, configs, healthSummary } = normalizeConnectorState(
          state.groups,
          action.payload,
          state.flowConnectorSelections,
          state.flowConnectorConfigs,
        );

        return {
          ...state,
          connectorCatalog: action.payload,
          latestConnectors: latestConnectorsFromCatalog(action.payload),
          flowConnectorSelections: selections,
          flowConnectorConfigs: configs,
          connectorHealthSummary: healthSummary,
        };
      })();

    case 'SET_FLOW_CONNECTOR_SELECTION':
      return {
        ...state,
        flowConnectorSelections: {
          ...state.flowConnectorSelections,
          [action.payload.flowId]: {
            pluginId: action.payload.pluginId,
            pluginVersion: action.payload.pluginVersion,
          },
        },
        flowConnectorConfigs: (() => {
          const descriptor = findDescriptor(
            state.connectorCatalog,
            action.payload.pluginId,
            action.payload.pluginVersion,
          );

          return {
            ...state.flowConnectorConfigs,
            [action.payload.flowId]: descriptor
              ? getDefaultConfigFromSchema(descriptor.configSchema)
              : {},
          };
        })(),
        connectorHealthSummary: buildConnectorHealthSummary(
          state.groups,
          state.connectorCatalog,
          {
            ...state.flowConnectorSelections,
            [action.payload.flowId]: {
              pluginId: action.payload.pluginId,
              pluginVersion: action.payload.pluginVersion,
            },
          },
        ),
      };

    case 'SET_FLOW_CONNECTOR_CONFIG':
      return {
        ...state,
        flowConnectorConfigs: {
          ...state.flowConnectorConfigs,
          [action.payload.flowId]: action.payload.config,
        },
      };

    case 'SET_METRICS':
      return { ...state, metrics: action.payload };

    case 'SET_FLOW_METRICS':
      return {
        ...state,
        flowMetrics: {
          ...state.flowMetrics,
          [action.payload.flowId]: action.payload,
        },
      };

    case 'LOAD_INITIAL_STATE':
      return (() => {
        const { selections, configs, healthSummary } = normalizeConnectorState(
          action.payload.groups,
          state.connectorCatalog,
          state.flowConnectorSelections,
          state.flowConnectorConfigs,
        );

        return {
          ...state,
          groups: action.payload.groups,
          variables: action.payload.variables,
          logs: action.payload.logs,
          flowConnectorSelections: selections,
          flowConnectorConfigs: configs,
          connectorHealthSummary: healthSummary,
        };
      })();

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    // System
    startSystem: () => Promise<void>;
    stopSystem: () => Promise<void>;
    toggleSystem: () => Promise<void>;
    
    // Selection
    selectGroup: (groupId: string) => void;
    selectFlow: (groupId: string, flowId: string) => void;
    selectVariable: (variableId: string) => void;
    clearVariableSelection: () => void;
    
    // Groups: basic actions
    toggleGroupExpanded: (groupId: string) => void;
    startGroup: (groupId: string) => Promise<void>;
    stopGroup: (groupId: string) => Promise<void>;
    
    // Groups: CRUD
    createGroup: (name: string, description?: string) => Promise<Group>;
    deleteGroup: (groupId: string) => Promise<void>;
    updateGroupConfig: (groupId: string, config: Partial<Omit<Group, 'id' | 'flows'>>) => Promise<void>;
    
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
    ) => Promise<Flow>;
    deleteFlow: (groupId: string, flowId: string) => Promise<void>;
    updateFlowConfig: (
      groupId: string,
      flowId: string,
      config: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>>,
    ) => Promise<void>;
    
    // Variables: CRUD
    createVariable: (
      name: string,
      type: 'numeric' | 'string' | 'boolean' | 'temporal' | 'point' | 'list',
      scope: 'global' | 'group' | 'local',
      config?: Record<string, unknown>,
    ) => Promise<Variable>;
    deleteVariable: (variableId: string) => Promise<void>;
    updateVariable: (variableId: string, updates: Partial<Omit<Variable, 'id'>>) => Promise<void>;
    
    // Templates
    setFormatTemplate: (flowId: string, template: string) => void;
    setFlowConnectorSelection: (flowId: string, pluginId: string, pluginVersion: string) => void;
    setFlowConnectorConfig: (flowId: string, config: Record<string, unknown>) => void;
    
    // Variables: insertion into templates
    insertVariable: (name: string, scope: string) => void;
    
    // UI
    setBottomTab: (tab: 'logs' | 'stats' | 'preview') => void;
    toggleTheme: () => void;
    setProjectName: (name: string) => void;
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

export function AppProvider({ children, useMockData = true }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const connectionAttempted = useRef(false);
  const lastConnectorHealthSignature = useRef('');

  // Initial connection to the Core
  useEffect(() => {
    if (connectionAttempted.current) return;
    connectionAttempted.current = true;

    const initConnection = async () => {
      if (useMockData) {
        // Dev mode: load mock data without connecting to Core
        dispatch({
          type: 'LOAD_INITIAL_STATE',
          payload: {
            groups: mockGroups,
            variables: mockVariables,
            logs: mockLogs,
          },
        });
        dispatch({ type: 'SET_CONNECTOR_CATALOG', payload: mockConnectorCatalog });
        dispatch({ type: 'SET_CONNECTED', payload: { connected: true, mode: 'mock' } });
        return;
      }

      try {
        await bridge.connect();
        dispatch({ 
          type: 'SET_CONNECTED', 
          payload: { connected: true, mode: bridge.getMode() } 
        });

        // Get initial state and catalog from Core
        await CoreCommands.getInitialState();
        await CoreCommands.subscribeMetrics();

        const catalogResponse = await CoreCommands.getConnectorCatalog();
        const catalogPayload = Array.isArray(catalogResponse)
          ? catalogResponse
          : (catalogResponse as { catalog?: ConnectorPluginDescriptor[] } | null)?.catalog ?? [];
        dispatch({ type: 'SET_CONNECTOR_CATALOG', payload: catalogPayload });
      } catch (error) {
        console.error('[AppContext] Error connecting to the Core:', error);
        // Data fallback if connection fails
        dispatch({
          type: 'LOAD_INITIAL_STATE',
          payload: {
            groups: mockGroups,
            variables: mockVariables,
            logs: mockLogs,
          },
        });
        dispatch({ type: 'SET_CONNECTOR_CATALOG', payload: mockConnectorCatalog });
        dispatch({ type: 'SET_CONNECTED', payload: { connected: false, mode: 'mock' } });
      }
    };

    initConnection();
  }, [useMockData]);

  useEffect(() => {
    const signature = state.connectorHealthSummary
      .map((entry) => `${entry.pluginId}@${entry.pluginVersion}:${entry.status}:${entry.flowCount}:${entry.connectedCount}:${entry.warningCount}:${entry.errorCount}`)
      .join('|');

    if (!signature || signature === lastConnectorHealthSignature.current) {
      return;
    }

    lastConnectorHealthSignature.current = signature;

    const overallStatus = state.connectorHealthSummary.some((entry) => entry.status === 'degraded') ? 'warn' : 'info';
    dispatch({
      type: 'ADD_LOG',
      payload: {
        id: `health_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: overallStatus,
        source: 'CONNECTORS',
        message: formatConnectorHealthMessage(state.connectorHealthSummary),
      },
    });
  }, [state.connectorHealthSummary]);

  // Subscribers for Core events
  useEffect(() => {
    if (useMockData) return;

    const unsubscribers = [
      bridge.on('system-status', (status: SystemStatusPayload) => {
        dispatch({ type: 'SET_SYSTEM_STATUS', payload: status.status });
      }),
      
      bridge.on('metrics', (metrics: MetricsPayload) => {
        dispatch({ type: 'SET_METRICS', payload: metrics });
      }),
      
      bridge.on('log', (log: LogPayload) => {
        dispatch({ type: 'ADD_LOG', payload: log });
      }),
      
      bridge.on('groups-update', (groups: GroupState[]) => {
        // Convert GroupState from Core to Group for UI, preserving expanded state and normalizing connector info
        const uiGroups: Group[] = groups.map(g => ({
          id: g.id,
          name: g.name,
          status: g.status,
          throughput: `${g.throughput} msg/s`,
          description: g.description,
          threads: g.threads,
          outputMode: g.outputMode,
          expanded: state.groups.find(sg => sg.id === g.id)?.expanded ?? false,
          flows: g.flows.map(f => ({
            id: f.id,
            name: f.name,
            technology: f.technology,
            connectionStatus: f.connectionStatus,
            throughput: `${f.throughput} msg/s`,
            hasError: f.hasError,
            errorMessage: f.errorMessage,
            interval: f.interval,
            burst: f.burst,
            topic: f.topic,
            host: f.host,
            port: f.port,
          })),
        }));
        dispatch({ type: 'SET_GROUPS', payload: uiGroups });
      }),
      
      bridge.on('flow-update', (flowMetrics: FlowMetricsPayload) => {
        dispatch({ type: 'SET_FLOW_METRICS', payload: flowMetrics });
      }),
      
      bridge.on('disconnected', () => {
        dispatch({ type: 'SET_CONNECTED', payload: { connected: false, mode: 'mock' } });
      }),
      
      bridge.on('connected', () => {
        dispatch({ type: 'SET_CONNECTED', payload: { connected: true, mode: bridge.getMode() } });
      }),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [useMockData, state.groups]);

  // ─────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────

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

  const startSystem = useCallback(async () => {
    try {
      if (state.connectionMode !== 'mock') {
        await CoreCommands.startSystem();
      }
      dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'running' });
    } catch (error) {
      reportCommandError('SYSTEM', 'startSystem', error);
    }
  }, [reportCommandError, state.connectionMode]);

  const stopSystem = useCallback(async () => {
    try {
      if (state.connectionMode !== 'mock') {
        await CoreCommands.stopSystem();
      }
      dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'stopped' });
    } catch (error) {
      reportCommandError('SYSTEM', 'stopSystem', error);
    }
  }, [reportCommandError, state.connectionMode]);

  const toggleSystem = useCallback(async () => {
    if (state.systemStatus === 'stopped') {
      await startSystem();
    } else {
      await stopSystem();
    }
  }, [state.systemStatus, startSystem, stopSystem]);

  const selectGroup = useCallback((groupId: string) => {
    dispatch({ type: 'SET_SELECTION', payload: { type: 'group', groupId } });
  }, []);

  const selectFlow = useCallback((groupId: string, flowId: string) => {
    dispatch({ type: 'SET_SELECTION', payload: { type: 'flow', groupId, flowId } });
  }, []);

  const selectVariable = useCallback((variableId: string) => {
    dispatch({
      type: 'SET_SELECTION',
      payload: { ...state.selection, type: 'variable', variableId },
    });
  }, [state.selection]);

  const clearVariableSelection = useCallback(() => {
    const { selection } = state;
    if (selection.flowId) {
      dispatch({
        type: 'SET_SELECTION',
        payload: { type: 'flow', groupId: selection.groupId, flowId: selection.flowId },
      });
    } else if (selection.groupId) {
      dispatch({
        type: 'SET_SELECTION',
        payload: { type: 'group', groupId: selection.groupId },
      });
    } else {
      dispatch({ type: 'SET_SELECTION', payload: { type: 'none' } });
    }
  }, [state]);

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

  const setFormatTemplate = useCallback((flowId: string, template: string) => {
    dispatch({ type: 'SET_FORMAT_TEMPLATE', payload: { flowId, template } });
  }, []);

  const setFlowConnectorSelection = useCallback((flowId: string, pluginId: string, pluginVersion: string) => {
    dispatch({
      type: 'SET_FLOW_CONNECTOR_SELECTION',
      payload: { flowId, pluginId, pluginVersion },
    });
  }, []);

  const setFlowConnectorConfig = useCallback((flowId: string, config: Record<string, unknown>) => {
    dispatch({
      type: 'SET_FLOW_CONNECTOR_CONFIG',
      payload: { flowId, config },
    });
  }, []);

  const insertVariable = useCallback((name: string, scope: string) => {
    const varRef = `{{${scope}.${name}}}`;
    const insertFn = (window as unknown as Record<string, unknown>).__insertIntoFlow;
    if (typeof insertFn === 'function') {
      (insertFn as (ref: string) => void)(varRef);
    }
  }, []);

  const setBottomTab = useCallback((tab: 'logs' | 'stats' | 'preview') => {
    dispatch({ type: 'SET_BOTTOM_TAB', payload: tab });
  }, []);

  const toggleTheme = useCallback(() => {
    dispatch({ type: 'TOGGLE_THEME' });
  }, []);

  const setProjectName = useCallback((name: string) => {
    dispatch({ type: 'SET_PROJECT_NAME', payload: name });
  }, []);

  const clearLogs = useCallback(() => {
    dispatch({ type: 'CLEAR_LOGS' });
  }, []);

  // ─────────────────────────────────────────────────────────
  // CRUD Actions: Groups, Flows, Variables
  // ─────────────────────────────────────────────────────────

  const crudContext: CRUDActionContext = {
    dispatch,
    reportError: reportCommandError,
    connectionMode: state.connectionMode,
  };

  const createGroupAction = useCallback(async (name: string, description?: string) => {
    const createdGroup = await CRUDActions.createGroup(crudContext, name, description);

    if (state.connectionMode === 'mock') {
      dispatch({
        type: 'SET_GROUPS',
        payload: [...state.groups, createdGroup],
      });
    }

    return createdGroup;
  }, [crudContext, state.connectionMode, state.groups]);

  const deleteGroupAction = useCallback(async (groupId: string) => {
    await CRUDActions.deleteGroup(crudContext, groupId);

    if (state.connectionMode === 'mock') {
      dispatch({
        type: 'SET_GROUPS',
        payload: state.groups.filter((group) => group.id !== groupId),
      });
    }
  }, [crudContext, state.connectionMode, state.groups]);

  const updateGroupConfigAction = useCallback(
    (groupId: string, config: Partial<Omit<Group, 'id' | 'flows'>>) =>
      CRUDActions.updateGroupConfig(crudContext, groupId, config),
    [crudContext, state.connectionMode],
  );

  const createFlowAction = useCallback(async (
    groupId: string,
    name: string,
    technology: string,
    host: string,
    port: number,
    topic?: string,
    interval?: number,
    burst?: number,
    template?: string,
  ) => {
    const createdFlow = await CRUDActions.createFlow(crudContext, groupId, name, technology, host, port, topic, interval, burst, template);

    if (state.connectionMode === 'mock') {
      dispatch({
        type: 'SET_GROUPS',
        payload: state.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                flows: [...group.flows, createdFlow],
              }
            : group,
        ),
      });
    }

    return createdFlow;
  }, [crudContext, state.connectionMode, state.groups]);

  const deleteFlowAction = useCallback((groupId: string, flowId: string) =>
    CRUDActions.deleteFlow(crudContext, groupId, flowId),
    [crudContext, state.connectionMode],
  );

  const updateFlowConfigAction = useCallback(
    (
      groupId: string,
      flowId: string,
      config: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>>,
    ) =>
      CRUDActions.updateFlowConfig(crudContext, groupId, flowId, config),
    [crudContext, state.connectionMode],
  );

  const createVariableAction = useCallback(
    (
      name: string,
      type: 'numeric' | 'string' | 'boolean' | 'temporal' | 'point' | 'list',
      scope: 'global' | 'group' | 'local',
      config?: Record<string, unknown>,
    ) =>
      CRUDActions.createVariable(crudContext, name, type, scope, config),
    [crudContext, state.connectionMode],
  );

  const deleteVariableAction = useCallback((variableId: string) =>
    CRUDActions.deleteVariable(crudContext, variableId),
    [crudContext, state.connectionMode],
  );

  const updateVariableAction = useCallback(
    (variableId: string, updates: Partial<Omit<Variable, 'id'>>) =>
      CRUDActions.updateVariable(crudContext, variableId, updates),
    [crudContext, state.connectionMode],
  );

  const actions = {
    startSystem,
    stopSystem,
    toggleSystem,
    selectGroup,
    selectFlow,
    selectVariable,
    clearVariableSelection,
    toggleGroupExpanded,
    startGroup,
    stopGroup,
    createGroup: createGroupAction,
    deleteGroup: deleteGroupAction,
    updateGroupConfig: updateGroupConfigAction,
    createFlow: createFlowAction,
    deleteFlow: deleteFlowAction,
    updateFlowConfig: updateFlowConfigAction,
    createVariable: createVariableAction,
    deleteVariable: deleteVariableAction,
    updateVariable: updateVariableAction,
    setFormatTemplate,
    setFlowConnectorSelection,
    setFlowConnectorConfig,
    insertVariable,
    setBottomTab,
    toggleTheme,
    setProjectName,
    clearLogs,
  };

  return (
    <AppContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp debe usarse dentro de AppProvider');
  }
  return context;
}

// Hooks of specific slices of state for convenience
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
