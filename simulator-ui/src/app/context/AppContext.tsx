/**
 * Contexto global de la aplicación
 * 
 * Maneja el estado centralizado y la comunicación con el Core Java
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
  VariableState,
} from '../core/types';
import type { Selection, Group, Variable, LogEntry, SystemStatus } from '../types';
import { mockGroups, mockVariables, mockLogs } from '../data/mockData';

// ─────────────────────────────────────────────────────────────
// Estado de la aplicación
// ─────────────────────────────────────────────────────────────

interface AppState {
  // Conexión
  isConnected: boolean;
  connectionMode: 'websocket' | 'jcef' | 'mock';
  
  // Sistema
  systemStatus: SystemStatus;
  projectName: string;
  
  // UI
  isDark: boolean;
  selection: Selection;
  bottomTab: 'logs' | 'stats' | 'preview';
  
  // Datos
  groups: Group[];
  variables: Variable[];
  logs: LogEntry[];
  formatTemplates: Record<string, string>;
  
  // Métricas
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
  metrics: null,
  flowMetrics: {},
};

// ─────────────────────────────────────────────────────────────
// Acciones
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
  | { type: 'SET_METRICS'; payload: MetricsPayload }
  | { type: 'SET_FLOW_METRICS'; payload: FlowMetricsPayload }
  | { type: 'LOAD_INITIAL_STATE'; payload: { groups: Group[]; variables: Variable[]; logs: LogEntry[] } };

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
      return { ...state, groups: action.payload };

    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map(g =>
          g.id === action.payload.id ? { ...g, ...action.payload } : g
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
        logs: [...state.logs.slice(-999), action.payload], // Mantener máx 1000 logs
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
      return {
        ...state,
        groups: action.payload.groups,
        variables: action.payload.variables,
        logs: action.payload.logs,
      };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────
// Contexto
// ─────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  actions: {
    // Sistema
    startSystem: () => Promise<void>;
    stopSystem: () => Promise<void>;
    toggleSystem: () => Promise<void>;
    
    // Selección
    selectGroup: (groupId: string) => void;
    selectFlow: (groupId: string, flowId: string) => void;
    selectVariable: (variableId: string) => void;
    clearVariableSelection: () => void;
    
    // Grupos
    toggleGroupExpanded: (groupId: string) => void;
    startGroup: (groupId: string) => Promise<void>;
    stopGroup: (groupId: string) => Promise<void>;
    
    // Templates
    setFormatTemplate: (flowId: string, template: string) => void;
    
    // Variables
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

  // Conexión inicial al Core
  useEffect(() => {
    if (connectionAttempted.current) return;
    connectionAttempted.current = true;

    const initConnection = async () => {
      if (useMockData) {
        // Modo desarrollo: usar datos mock
        dispatch({
          type: 'LOAD_INITIAL_STATE',
          payload: {
            groups: mockGroups,
            variables: mockVariables,
            logs: mockLogs,
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

        // Solicitar estado inicial
        await CoreCommands.getInitialState();
        await CoreCommands.subscribeMetrics();
      } catch (error) {
        console.error('[AppContext] Error conectando con el Core:', error);
        // Fallback a datos mock si falla la conexión
        dispatch({
          type: 'LOAD_INITIAL_STATE',
          payload: {
            groups: mockGroups,
            variables: mockVariables,
            logs: mockLogs,
          },
        });
        dispatch({ type: 'SET_CONNECTED', payload: { connected: false, mode: 'mock' } });
      }
    };

    initConnection();
  }, [useMockData]);

  // Suscribirse a eventos del bridge
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
        // Convertir GroupState del core a Group de la UI
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
  // Acciones
  // ─────────────────────────────────────────────────────────

  const startSystem = useCallback(async () => {
    if (state.connectionMode !== 'mock') {
      await CoreCommands.startSystem();
    }
    dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'running' });
  }, [state.connectionMode]);

  const stopSystem = useCallback(async () => {
    if (state.connectionMode !== 'mock') {
      await CoreCommands.stopSystem();
    }
    dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'stopped' });
  }, [state.connectionMode]);

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
    if (state.connectionMode !== 'mock') {
      await CoreCommands.startGroup(groupId);
    }
    dispatch({ type: 'UPDATE_GROUP', payload: { id: groupId, status: 'running' } });
  }, [state.connectionMode]);

  const stopGroup = useCallback(async (groupId: string) => {
    if (state.connectionMode !== 'mock') {
      await CoreCommands.stopGroup(groupId);
    }
    dispatch({ type: 'UPDATE_GROUP', payload: { id: groupId, status: 'stopped' } });
  }, [state.connectionMode]);

  const setFormatTemplate = useCallback((flowId: string, template: string) => {
    dispatch({ type: 'SET_FORMAT_TEMPLATE', payload: { flowId, template } });
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
    setFormatTemplate,
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

// Hooks de conveniencia
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
