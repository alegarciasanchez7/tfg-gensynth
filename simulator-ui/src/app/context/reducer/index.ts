import type { AppState, AppAction } from './appReducer';
import { uiReducer } from './uiSlice';
import { systemReducer } from './systemSlice';
import { groupsReducer } from './groupsSlice';
import { variablesReducer } from './variablesSlice';
import { connectorsReducer } from './connectorsSlice';
import { logsReducer } from './logsSlice';
import { metricsReducer } from './metricsSlice';
import { normalizeVariableListFromCore } from '../variableNormalization';
import {
  normalizeConnectorState,
  latestConnectorsFromCatalog,
} from '../helpers/connectorHelpers';
import type { LogEntry, Group, Flow } from '../../types';

export function rootReducer(state: AppState, action: AppAction): AppState {
  if (action.type === 'LOAD_INITIAL_STATE') {
    const connectorCatalog = action.payload.connectorCatalog ?? state.connectorCatalog;
    
    // Inject a critical recovery log if a rollback occurred
    let rollbackLog: LogEntry | null = null;
    if (action.payload.rollbackReport) {
      const report = action.payload.rollbackReport;
      rollbackLog = {
        id: `rollback_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        level: 'error',
        source: 'SYSTEM',
        message: `CRITICAL RECOVERY: ${report.message} (Plugin ID: ${report.pluginId})`,
      };
    }

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

    // Ensure logs are not lost if multiple initial state calls happen
    const baseLogs = action.payload.logs ?? state.logs;
    const finalLogs = rollbackLog ? [...baseLogs, rollbackLog] : baseLogs;

    return {
      ...state,
      groups: action.payload.groups,
      variables: normalizeVariableListFromCore(action.payload.variables),
      logs: finalLogs,
      connectorCatalog,
      latestConnectors: latestConnectorsFromCatalog(connectorCatalog),
      flowConnectorSelections: selections,
      flowConnectorConfigs: configs,
      connectorHealthSummary: healthSummary,
      metrics: action.payload.metrics ?? state.metrics,
      systemStatus: action.payload.systemStatus ?? state.systemStatus,
      formatTemplates: newTemplates,
    };
  }

  // Delegate to individual slice reducers
  let newState = state;
  newState = uiReducer(newState, action);
  newState = systemReducer(newState, action);
  newState = groupsReducer(newState, action);
  newState = variablesReducer(newState, action);
  newState = connectorsReducer(newState, action);
  newState = logsReducer(newState, action);
  newState = metricsReducer(newState, action);

  return newState;
}

export * from './appReducer';
