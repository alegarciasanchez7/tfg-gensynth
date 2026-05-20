import { useEffect, useRef } from 'react';
import bridge, { CoreCommands } from '../../core/bridge';
import type {
  SystemStatusPayload,
  MetricsPayload,
  LogPayload,
  GroupState,
  VariableState,
  FlowMetricsPayload,
  InitialStatePayload,
  TracePayload,
} from '../../core/types';
import type { Variable } from '../../types';
import type { AppState, AppAction } from '../reducer';
import { mapGroupsFromCore } from '../helpers/groupHelpers';
import { formatConnectorHealthMessage } from '../helpers/connectorHelpers';
import { normalizeVariableListFromCore } from '../variableNormalization';
import { reconcileState, applyReconciliation, logReconciliationResults } from '../reconciliationHelper';
import type { OptimisticManager } from '../optimisticManager';

interface UseBridgeSubscriptionsProps {
  state: AppState;
  stateRef: React.MutableRefObject<AppState>;
  dispatch: React.Dispatch<AppAction>;
  optimisticManager: OptimisticManager | null;
  useMockData?: boolean;
}

export function useBridgeSubscriptions({
  state,
  stateRef,
  dispatch,
  optimisticManager,
  useMockData = false,
}: UseBridgeSubscriptionsProps) {
  const connectionAttempted = useRef(false);
  const lastConnectorHealthSignature = useRef('');

  // Initial connection to the Core
  useEffect(() => {
    if (connectionAttempted.current) return;
    connectionAttempted.current = true;

    const initConnection = async () => {
      if (useMockData) {
        return;
      }

      try {
        await bridge.connect();
        dispatch({ 
          type: 'SET_CONNECTED', 
          payload: { connected: true, mode: bridge.getMode() } 
        });

        await CoreCommands.getInitialState();
        await CoreCommands.subscribeMetrics();
      } catch (error) {
        console.error('[AppContext] Error connecting to the Core:', error);
        dispatch({ type: 'SET_CONNECTED', payload: { connected: false, mode: 'websocket' } });
      }
    };

    initConnection();
  }, [useMockData, dispatch]);

  // Health logging
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
  }, [state.connectorHealthSummary, dispatch]);

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

        const reconciliation = reconcileState({
          optimisticManager,
          localState: {
            groups: currentState.groups,
            variables: currentState.variables,
          },
          serverState: {
            groups: serverGroups,
            variables: serverVariables,
          },
        });

        applyReconciliation(reconciliation, optimisticManager);

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

        dispatch({
          type: 'LOAD_INITIAL_STATE',
          payload: {
            groups: serverGroups,
            variables: serverVariables,
            connectorCatalog: snapshot.connectorCatalog,
            metrics: snapshot.metrics,
            systemStatus: snapshot.systemStatus.status,
            rollbackReport: snapshot.rollbackReport,
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
        const serverGroups = mapGroupsFromCore(groups, stateRef.current.groups);
        const reconciliation = reconcileState({
          optimisticManager,
          localState: { groups: stateRef.current.groups, variables: stateRef.current.variables },
          serverState: { groups: serverGroups, variables: stateRef.current.variables },
        });

        if (optimisticManager) {
          reconciliation.operationsResolved.forEach(op => {
            if (op.success) {
              optimisticManager.remove(op.commandId);
            }
          });
        }

        dispatch({ type: 'SET_GROUPS', payload: reconciliation.groupsToUpdate });
      }),

      bridge.on('variables-update', (variables: VariableState[]) => {
        const serverVariables = normalizeVariableListFromCore(variables as unknown as Variable[]);
        const reconciliation = reconcileState({
          optimisticManager,
          localState: { groups: stateRef.current.groups, variables: stateRef.current.variables },
          serverState: { groups: stateRef.current.groups, variables: serverVariables },
        });

        if (optimisticManager) {
          reconciliation.operationsResolved.forEach(op => {
            if (op.success) {
              optimisticManager.remove(op.commandId);
            }
          });
        }

        dispatch({ type: 'SET_VARIABLES', payload: reconciliation.variablesToUpdate });
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
        const currentState = stateRef.current;
        dispatch({ type: 'SET_CONNECTED', payload: { connected: true, mode: bridge.getMode() } });
        
        if (currentState.isRestarting) {
          console.log('[AppContext] Reconnected after restart. Reloading UI...');
          window.location.reload();
        }
      }),

      bridge.on('restart-required', () => {
        dispatch({ type: 'SET_RESTARTING', payload: true });
      }),
    ];

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [useMockData, dispatch, stateRef, optimisticManager]);
}
