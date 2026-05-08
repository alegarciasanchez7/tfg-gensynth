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
import { toast } from 'sonner';
import bridge, { CoreCommands } from '../core/bridge';
import {
  createProjectSnapshot,
  downloadProjectSnapshot,
  loadProjectSnapshotFromFile,
  triggerFileSelection,
  normalizeGroupFromSnapshot,
  normalizeVariableFromSnapshot,
} from '../core/fileStorage';
import type {
  SystemStatusPayload,
  MetricsPayload,
  LogPayload,
  GroupState,
  FlowMetricsPayload,
  VariableState,
  ConnectorPluginDescriptor,
  InitialStatePayload,
  TracePayload,
} from '../core/types';
import type { Selection, Group, Variable, LogEntry, SystemStatus, Flow, ConnectorHealthStatus } from '../types';
import type { ConnectorHealthSummary } from '../types';
import { mockGroups, mockVariables, mockLogs, mockConnectorCatalog } from '../data/mockData';
import * as CRUDActions from './crudActions';
import type { CRUDActionContext } from './crudActions';
import { normalizeVariableFromCore, normalizeVariableListFromCore } from './variableNormalization';
import { OptimisticManager } from './optimisticManager';
import { 
  executeOptimisticUpdate, 
  createGroupUpdatePayload,
  createFlowUpdatePayload,
  createVariableUpdatePayload,
} from './optimisticUpdateHelper';
import {
  executeCreateOptimistic,
  generateOptimisticId,
  createOptimisticGroup,
  createOptimisticFlow,
  createOptimisticVariable,
} from './createOptimisticHelper';
import { executeDeleteOptimistic } from './deleteOptimisticHelper';
import {
  reconcileState,
  applyReconciliation,
  logReconciliationResults,
} from './reconciliationHelper';

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
};

// ─────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────

type AppAction =
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
  | {
      type: 'LOAD_INITIAL_STATE';
      payload: {
        groups: Group[];
        variables: Variable[];
        logs?: LogEntry[];
        connectorCatalog?: ConnectorPluginDescriptor[];
        metrics?: MetricsPayload | null;
        systemStatus?: SystemStatus;
      };
    };

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

function mapGroupsFromCore(groups: GroupState[], previousGroups: Group[] = []): Group[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    status: group.status,
    throughput: `${group.throughput} msg/s`,
    description: group.description,
    threads: group.threads,
    outputMode: group.outputMode,
    expanded: previousGroups.find((existing) => existing.id === group.id)?.expanded ?? false,
    flows: group.flows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      technology: flow.technology,
      connectionStatus: flow.connectionStatus,
      throughput: `${flow.throughput} msg/s`,
      latency: flow.latency,
      hasError: flow.hasError,
      errorMessage: flow.errorMessage,
      interval: flow.interval,
      burst: flow.burst,
      topic: flow.topic,
      host: flow.host,
      port: flow.port,
      template: flow.template,
      connectorConfig: flow.connectorConfig,
    })),
  }));
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

      if (flow.hasError || flow.connectionStatus === 'error') {
        entry.errorCount += 1;
        entry.lastMessage = flow.errorMessage ?? entry.lastMessage ?? `Flow ${flow.name} is in error state`;
      } else if (flow.connectionStatus === 'warning') {
        entry.warningCount += 1;
        entry.lastMessage = flow.errorMessage ?? entry.lastMessage;
      } else if (flow.connectionStatus === 'connected') {
        entry.connectedCount += 1;
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


    case 'TOGGLE_THEME': {
      const nextIsDark = !state.isDark;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('gensynth-theme', nextIsDark ? 'dark' : 'light');
      }
      return { ...state, isDark: nextIsDark };
    }

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
      return { ...state, variables: normalizeVariableListFromCore(action.payload) };

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
        const connectorCatalog = action.payload.connectorCatalog ?? state.connectorCatalog;
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

        return {
          ...state,
          groups: action.payload.groups,
          variables: normalizeVariableListFromCore(action.payload.variables),
          logs: action.payload.logs ?? state.logs,
          connectorCatalog,
          latestConnectors: latestConnectorsFromCatalog(connectorCatalog),
          flowConnectorSelections: selections,
          flowConnectorConfigs: configs,
          connectorHealthSummary: healthSummary,
          metrics: action.payload.metrics ?? state.metrics,
          systemStatus: action.payload.systemStatus ?? state.systemStatus,
          formatTemplates: newTemplates,
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
    loadProjectState: () => Promise<void>;
    saveProjectState: () => Promise<void>;
    
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
      connectorConfig?: Record<string, unknown>,
    ) => Promise<Flow>;
    deleteFlow: (groupId: string, flowId: string) => Promise<void>;
    updateFlowConfig: (
      groupId: string,
      flowId: string,
      config: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>> & { template?: string },
    ) => Promise<void>;
    
    // Variables: CRUD
    createVariable: (
      name: string,
      type: 'numeric' | 'string' | 'boolean' | 'temporal' | 'point' | 'list',
      scope: 'global' | 'group' | 'local',
      config?: Record<string, unknown>,
      variableId?: string,
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
  const preserveLocalSnapshotRef = useRef(false);
  const optimisticManager = useRef<OptimisticManager | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Initialize OptimisticManager once
  if (!optimisticManager.current) {
    optimisticManager.current = new OptimisticManager();
  }

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
            connectorCatalog: mockConnectorCatalog,
          },
        });
        dispatch({ type: 'SET_CONNECTED', payload: { connected: true, mode: 'mock' } });
        return;
      }

      try {
        await bridge.connect();
        dispatch({ 
          type: 'SET_CONNECTED', 
          payload: { connected: true, mode: bridge.getMode() } 
        });

        // Get initial state from Core; the listener below will hydrate state.
        await CoreCommands.getInitialState();
        await CoreCommands.subscribeMetrics();
      } catch (error) {
        console.error('[AppContext] Error connecting to the Core:', error);
        // Data fallback if connection fails
        dispatch({
          type: 'LOAD_INITIAL_STATE',
          payload: {
            groups: mockGroups,
            variables: mockVariables,
            logs: mockLogs,
            connectorCatalog: mockConnectorCatalog,
          },
        });
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

      bridge.on('initial-state', (snapshot: InitialStatePayload) => {
        const currentState = stateRef.current;
        const serverGroups = mapGroupsFromCore(snapshot.groups, currentState.groups);
        const serverVariables = normalizeVariableListFromCore(snapshot.variables);

        // Reconcile state between local and server
        const reconciliation = reconcileState({
          optimisticManager: optimisticManager.current,
          localState: {
            groups: currentState.groups,
            variables: currentState.variables,
          },
          serverState: {
            groups: serverGroups,
            variables: serverVariables,
          },
        });

        // Apply reconciliation results to OptimisticManager
        applyReconciliation(reconciliation, optimisticManager.current);

        // Log reconciliation results if there are conflicts or resolved operations
        if (reconciliation.operationsResolved.length > 0 || reconciliation.conflicts.length > 0) {
          const reconciliationLog = logReconciliationResults(reconciliation);
          dispatch({
            type: 'ADD_LOG',
            payload: {
              id: `reconciliation_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
              level: reconciliation.conflicts.length > 0 ? 'warn' : 'info',
              source: 'RECONCILIATION',
              message: reconciliationLog,
            },
          });
        }

        // Update state with server state
        dispatch({
          type: 'LOAD_INITIAL_STATE',
          payload: {
            groups: serverGroups,
            variables: serverVariables,
            connectorCatalog: snapshot.connectorCatalog,
            metrics: snapshot.metrics,
            systemStatus: snapshot.systemStatus.status,
          },
        });
      }),
      
      bridge.on('log', (log: LogPayload) => {
        let formattedTime = log.timestamp;
        const date = new Date(log.timestamp);
        if (!isNaN(date.getTime())) {
          formattedTime = date.toLocaleTimeString('en-GB', { hour12: false });
        }
        dispatch({ type: 'ADD_LOG', payload: { ...log, timestamp: formattedTime } });
      }),

      bridge.on('trace', (trace: TracePayload) => {
        dispatch({
          type: 'ADD_LOG',
          payload: {
            id: `trace_${trace.commandId}_${trace.type}`,
            timestamp: new Date(trace.timestamp).toLocaleTimeString('en-GB', { hour12: false }),
            level: trace.status === 'error' ? 'error' : 'debug',
            source: 'TRACE',
            message: `[${trace.type}] ${trace.operation} ${trace.durationMs ? `(${trace.durationMs}ms)` : ''}`,
            commandId: trace.commandId,
          },
        });
      }),
      
      bridge.on('groups-update', (groups: GroupState[]) => {
        // Convert GroupState from Core to Group for UI, preserving expanded state and normalizing connector info.
        // If a local snapshot was imported, keep current UI groups that the backend does not know about yet.
        const uiGroups = mapGroupsFromCore(groups, stateRef.current.groups);
        const nextGroups = preserveLocalSnapshotRef.current
          ? [
              ...stateRef.current.groups.map((currentGroup) => {
                const matchingCoreGroup = uiGroups.find((group) => group.id === currentGroup.id);
                return matchingCoreGroup ? { ...matchingCoreGroup, expanded: currentGroup.expanded } : currentGroup;
              }),
              ...uiGroups.filter(
                (incomingGroup) => !stateRef.current.groups.some((currentGroup) => currentGroup.id === incomingGroup.id),
              ),
            ]
          : uiGroups;

        dispatch({ type: 'SET_GROUPS', payload: nextGroups });
      }),

      bridge.on('variables-update', (variables: VariableState[]) => {
        dispatch({
          type: 'SET_VARIABLES',
          payload: normalizeVariableListFromCore(variables as unknown as Variable[]),
        });
      }),
      
      bridge.on('flow-update', (flowMetrics: FlowMetricsPayload) => {
        dispatch({ type: 'SET_FLOW_METRICS', payload: flowMetrics });
      }),

      bridge.on('error', ({ error, commandId, code, details, recoverable }) => {
        dispatch({
          type: 'ADD_LOG',
          payload: {
            id: `bridge_error_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            level: recoverable ? 'warn' : 'error',
            source: 'BRIDGE',
            message: `${code ?? 'BRIDGE_ERROR'}: ${error.message}`,
            commandId,
          },
        });
        if (details && Object.keys(details).length > 0) {
          dispatch({
            type: 'ADD_LOG',
            payload: {
              id: `bridge_error_details_${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
              level: 'debug',
              source: 'BRIDGE',
              message: JSON.stringify(details),
            },
          });
        }
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


  const clearLogs = useCallback(() => {
    dispatch({ type: 'CLEAR_LOGS' });
  }, []);

  const loadProjectState = useCallback(async () => {
    try {
      // Open file selector
      const file = await triggerFileSelection();
      if (!file) {
        // User cancelled the file selection
        return;
      }

      // Load and parse the snapshot
      const snapshot = await loadProjectSnapshotFromFile(file);
        console.log('[loadProjectState] Snapshot cargado:', { groups: snapshot.groups.length, variables: snapshot.variables.length });
        console.log('[loadProjectState] Grupos cargados:', snapshot.groups);

      // Normalize all data to ensure valid structure
      const normalizedGroups = snapshot.groups.map(normalizeGroupFromSnapshot);
      const normalizedVariables = snapshot.variables.map(normalizeVariableFromSnapshot);
        console.log('[loadProjectState] Grupos normalizados:', normalizedGroups);

      // Dispatch state update
      dispatch({
        type: 'LOAD_INITIAL_STATE',
        payload: {
          groups: normalizedGroups,
          variables: normalizedVariables,
          connectorCatalog: state.connectorCatalog,
        },
      });
      preserveLocalSnapshotRef.current = true;

      const selectionStillExists =
        state.selection.type === 'group'
          ? normalizedGroups.some((group) => group.id === state.selection.groupId)
          : state.selection.type === 'flow'
            ? normalizedGroups.some((group) =>
                group.id === state.selection.groupId && group.flows.some((flow) => flow.id === state.selection.flowId),
              )
            : state.selection.type === 'variable'
              ? normalizedVariables.some((variable) => variable.id === state.selection.variableId)
              : true;

      if (!selectionStillExists) {
        dispatch({ type: 'SET_SELECTION', payload: { type: 'none' } });
      }

        // Log success with details
        const totalFlows = normalizedGroups.reduce((acc, g) => acc + g.flows.length, 0);
        dispatch({
          type: 'ADD_LOG',
          payload: {
            id: `load_success_${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            level: 'info',
            source: 'SYSTEM',
            message: `Proyecto cargado: ${normalizedGroups.length} grupos, ${totalFlows} flows, ${normalizedVariables.length} variables`,
          },
        });
      // Log success
      toast.success(`Proyecto cargado desde: ${file.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar proyecto';
      dispatch({
        type: 'ADD_LOG',
        payload: {
          id: `load_error_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          level: 'error',
          source: 'SYSTEM',
          message: `Error al cargar proyecto: ${message}`,
        },
      });
      toast.error(message);
    }
  }, [state.connectorCatalog]);

  const saveProjectState = useCallback(async () => {
    try {
      // Create snapshot from current state
      const snapshot = createProjectSnapshot(state.groups, state.variables);

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `gen-synth-${timestamp}.json`;

      // Download to local file
      downloadProjectSnapshot(snapshot, filename);

      // Log success
      dispatch({
        type: 'ADD_LOG',
        payload: {
          id: `save_success_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          level: 'info',
          source: 'SYSTEM',
          message: `Proyecto guardado en: ${filename}`,
        },
      });

      toast.success(`Proyecto guardado: ${filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al guardar proyecto';
      dispatch({
        type: 'ADD_LOG',
        payload: {
          id: `save_error_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
          level: 'error',
          source: 'SYSTEM',
          message: `Error al guardar proyecto: ${message}`,
        },
      });
      toast.error(message);
    }
  }, [state.groups, state.variables]);

  // ─────────────────────────────────────────────────────────
  // CRUD Actions: Groups, Flows, Variables
  // ─────────────────────────────────────────────────────────

  const crudContext: CRUDActionContext = {
    dispatch,
    reportError: reportCommandError,
    connectionMode: state.connectionMode,
    optimisticManager: optimisticManager.current,
  };

  const createGroupAction = useCallback(async (name: string, description?: string) => {
    const optimisticId = generateOptimisticId('group');
    const optimisticGroup = createOptimisticGroup(optimisticId, name, description);

    try {
      const applyOptimisticGroup = () => {
        const currentGroups = stateRef.current.groups;
        const nextGroups = currentGroups.some((g) => g.id === optimisticId)
          ? currentGroups
          : [...currentGroups, optimisticGroup];

        dispatch({
          type: 'SET_GROUPS',
          payload: nextGroups,
        });
      };

      const rollbackOptimisticGroup = () => {
        dispatch({
          type: 'SET_GROUPS',
          payload: stateRef.current.groups.filter((g) => g.id !== optimisticId),
        });
      };

      const createdGroup = await executeCreateOptimistic(
        {
          optimisticManager: optimisticManager.current,
          commandType: 'CREATE_GROUP',
          optimisticId,
        },
        {
          applyOptimistic: applyOptimisticGroup,
          rollback: rollbackOptimisticGroup,
          send: () => CRUDActions.createGroup(crudContext, name, description),
          reconcileId: (serverGroup) => {
            // If server returned different ID, replace optimistic with real
            dispatch({
              type: 'SET_GROUPS',
              payload: stateRef.current.groups.map((g) =>
                g.id === optimisticId ? serverGroup : g
              ),
            });
          },
        }
      );

      return createdGroup;
    } catch (error) {
      reportCommandError('GROUPS', `createGroup(${name})`, error);
      throw error;
    }
  }, [crudContext, reportCommandError]);

  const deleteGroupAction = useCallback(async (groupId: string) => {
    const previousGroup = state.groups.find(g => g.id === groupId);
    if (!previousGroup) {
      throw new Error(`Group ${groupId} not found`);
    }

    try {
      await executeDeleteOptimistic(
        {
          optimisticManager: optimisticManager.current,
          commandType: 'DELETE_GROUP',
          resourceId: groupId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.filter(g => g.id !== groupId),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: [...state.groups, previousGroup],
            });
          },
          send: () => CRUDActions.deleteGroup(crudContext, groupId),
        }
      );
    } catch (error) {
      reportCommandError('GROUPS', `deleteGroup(${groupId})`, error);
      throw error;
    }
  }, [crudContext, state.groups, reportCommandError]);

  const updateGroupConfigAction = useCallback(
    async (groupId: string, config: Partial<Omit<Group, 'id' | 'flows'>>) => {
      const previousGroup = state.groups.find(g => g.id === groupId);
      if (!previousGroup) {
        throw new Error(`Group ${groupId} not found`);
      }

      const { optimistic: optimisticPayload, rollback: rollbackPayload } = 
        createGroupUpdatePayload(previousGroup, config);

      try {
        await executeOptimisticUpdate(
          {
            optimisticManager: optimisticManager.current,
            commandType: 'UPDATE_GROUP_CONFIG',
            resourceId: groupId,
          },
          {
            applyOptimistic: () => {
              dispatch({
                type: 'UPDATE_GROUP',
                payload: optimisticPayload as any,
              });
            },
            rollback: () => {
              dispatch({
                type: 'UPDATE_GROUP',
                payload: rollbackPayload as any,
              });
            },
            send: () => CRUDActions.updateGroupConfig(crudContext, groupId, config),
          }
        );
      } catch (error) {
        reportCommandError('GROUPS', `updateGroupConfig(${groupId})`, error);
        throw error;
      }
    },
    [crudContext, state.groups, reportCommandError],
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
    connectorConfig?: Record<string, unknown>,
  ) => {
    const optimisticId = generateOptimisticId('flow');
    const optimisticFlow = createOptimisticFlow(
      optimisticId,
      name,
      technology,
      host,
      port,
      topic,
      interval,
      burst
    );

    try {
      const applyOptimisticFlow = () => {
        dispatch({
          type: 'SET_GROUPS',
          payload: stateRef.current.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  flows: g.flows.some((f) => f.id === optimisticId)
                    ? g.flows
                    : [...g.flows, optimisticFlow],
                }
              : g
          ),
        });
      };

      const rollbackOptimisticFlow = () => {
        dispatch({
          type: 'SET_GROUPS',
          payload: stateRef.current.groups.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  flows: g.flows.filter((f) => f.id !== optimisticId),
                }
              : g
          ),
        });
      };

      const createdFlow = await executeCreateOptimistic(
        {
          optimisticManager: optimisticManager.current,
          commandType: 'CREATE_FLOW',
          optimisticId,
        },
        {
          applyOptimistic: applyOptimisticFlow,
          rollback: rollbackOptimisticFlow,
          send: () =>
            CRUDActions.createFlow(
              crudContext,
              groupId,
              name,
              technology,
              host,
              port,
              topic,
              interval,
              burst,
              template,
              connectorConfig
            ),
          reconcileId: (serverFlow) => {
            // If server returned different ID, replace optimistic with real
            dispatch({
              type: 'SET_GROUPS',
              payload: stateRef.current.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: g.flows.map((f) =>
                        f.id === optimisticId ? serverFlow : f
                      ),
                    }
                  : g
              ),
            });
          },
        }
      );

      return createdFlow;
    } catch (error) {
      reportCommandError('FLOWS', `createFlow(${name})`, error);
      throw error;
    }
  }, [crudContext, reportCommandError]);

  const deleteFlowAction = useCallback(async (groupId: string, flowId: string) => {
    const group = state.groups.find(g => g.id === groupId);
    const flow = group?.flows.find(f => f.id === flowId);
    
    if (!flow) {
      throw new Error(`Flow ${flowId} not found in group ${groupId}`);
    }

    try {
      await executeDeleteOptimistic(
        {
          optimisticManager: optimisticManager.current,
          commandType: 'DELETE_FLOW',
          resourceId: flowId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: g.flows.filter(f => f.id !== flowId),
                    }
                  : g
              ),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: [...g.flows, flow],
                    }
                  : g
              ),
            });
          },
          send: () => CRUDActions.deleteFlow(crudContext, groupId, flowId, flow.name),
        }
      );
    } catch (error) {
      reportCommandError('FLOWS', `deleteFlow(${flowId})`, error);
      throw error;
    }
  }, [crudContext, state.groups, reportCommandError]);

  const updateFlowConfigAction = useCallback(async (
    groupId: string,
    flowId: string,
    config: Partial<Omit<Flow, 'id' | 'connectionStatus' | 'throughput' | 'hasError' | 'errorMessage'>> & { template?: string },
  ) => {
    const group = state.groups.find(g => g.id === groupId);
    const flow = group?.flows.find(f => f.id === flowId);
    
    if (!flow) {
      throw new Error(`Flow ${flowId} not found in group ${groupId}`);
    }

    const { optimistic: optimisticPayload, rollback: rollbackPayload } = 
      createFlowUpdatePayload(flow, config as any);

    try {
      await executeOptimisticUpdate(
        {
          optimisticManager: optimisticManager.current,
          commandType: 'UPDATE_FLOW_CONFIG',
          resourceId: flowId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: g.flows.map((f) =>
                        f.id === flowId
                          ? { ...f, ...optimisticPayload }
                          : f,
                      ),
                    }
                  : g,
              ),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_GROUPS',
              payload: state.groups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      flows: g.flows.map((f) =>
                        f.id === flowId
                          ? { ...f, ...rollbackPayload }
                          : f,
                      ),
                    }
                  : g,
              ),
            });
          },
          send: () => CRUDActions.updateFlowConfig(crudContext, groupId, flowId, config, flow.name),
        }
      );
    } catch (error) {
      reportCommandError('FLOWS', `updateFlowConfig(${flowId})`, error);
      throw error;
    }
  }, [crudContext, state.groups, reportCommandError]);

  const createVariableAction = useCallback(async (
    name: string,
    type: 'numeric' | 'string' | 'boolean' | 'temporal' | 'point' | 'list',
    scope: 'global' | 'group' | 'local',
    config?: Record<string, unknown>,
    variableId?: string,
  ) => {
    const optimisticId = variableId || generateOptimisticId('var');
    const optimisticVariable = createOptimisticVariable(optimisticId, name, type, scope);

    try {
      const applyOptimisticVariable = () => {
        const currentVariables = stateRef.current.variables;
        const nextVariables = currentVariables.some((v) => v.id === optimisticId)
          ? currentVariables
          : [...currentVariables, optimisticVariable];

        dispatch({
          type: 'SET_VARIABLES',
          payload: nextVariables,
        });
      };

      const rollbackOptimisticVariable = () => {
        dispatch({
          type: 'SET_VARIABLES',
          payload: stateRef.current.variables.filter((v) => v.id !== optimisticId),
        });
      };

      const createdVariable = await executeCreateOptimistic(
        {
          optimisticManager: optimisticManager.current,
          commandType: 'CREATE_VARIABLE',
          optimisticId,
        },
        {
          applyOptimistic: applyOptimisticVariable,
          rollback: rollbackOptimisticVariable,
          send: () =>
            CRUDActions.createVariable(crudContext, name, type, scope, config, variableId),
          reconcileId: (serverVariable) => {
            // If server returned different ID, replace optimistic with real
            const normalizedServer = normalizeVariableFromCore(serverVariable);
            dispatch({
              type: 'SET_VARIABLES',
              payload: stateRef.current.variables.map((v) =>
                v.id === optimisticId ? normalizedServer : v
              ),
            });
          },
        }
      );

      return normalizeVariableFromCore(createdVariable);
    } catch (error) {
      reportCommandError('VARIABLES', `createVariable(${name})`, error);
      throw error;
    }
  }, [crudContext, reportCommandError]);

  const deleteVariableAction = useCallback(async (variableId: string) => {
    const previousVariable = state.variables.find(v => v.id === variableId);
    if (!previousVariable) {
      throw new Error(`Variable ${variableId} not found`);
    }

    try {
      await executeDeleteOptimistic(
        {
          optimisticManager: optimisticManager.current,
          commandType: 'DELETE_VARIABLE',
          resourceId: variableId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_VARIABLES',
              payload: state.variables.filter(v => v.id !== variableId),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_VARIABLES',
              payload: [...state.variables, previousVariable],
            });
          },
          send: () => CRUDActions.deleteVariable(crudContext, variableId, previousVariable.name),
        }
      );
    } catch (error) {
      reportCommandError('VARIABLES', `deleteVariable(${variableId})`, error);
      throw error;
    }
  }, [crudContext, state.variables, reportCommandError]);

  const updateVariableAction = useCallback(async (
    variableId: string,
    updates: Partial<Omit<Variable, 'id'>>,
  ) => {
    const previousVariable = state.variables.find(v => v.id === variableId);
    if (!previousVariable) {
      throw new Error(`Variable ${variableId} not found`);
    }

    const { optimistic: optimisticPayload, rollback: rollbackPayload } = 
      createVariableUpdatePayload(previousVariable, updates);

    try {
      await executeOptimisticUpdate(
        {
          optimisticManager: optimisticManager.current,
          commandType: 'UPDATE_VARIABLE',
          resourceId: variableId,
        },
        {
          applyOptimistic: () => {
            dispatch({
              type: 'SET_VARIABLES',
              payload: state.variables.map((v) =>
                v.id === variableId
                  ? normalizeVariableFromCore({ ...v, ...optimisticPayload })
                  : v
              ),
            });
          },
          rollback: () => {
            dispatch({
              type: 'SET_VARIABLES',
              payload: state.variables.map((v) =>
                v.id === variableId
                  ? normalizeVariableFromCore({ ...v, ...rollbackPayload })
                  : v
              ),
            });
          },
          send: () => CRUDActions.updateVariable(crudContext, variableId, updates, previousVariable.name),
        }
      );
    } catch (error) {
      reportCommandError('VARIABLES', `updateVariable(${variableId})`, error);
      throw error;
    }
  }, [crudContext, state.variables, reportCommandError]);

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
