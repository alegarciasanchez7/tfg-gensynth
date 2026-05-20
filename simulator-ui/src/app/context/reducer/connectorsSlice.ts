import type { AppState, AppAction } from './appReducer';
import {
  findDescriptor,
  getDefaultConfigFromSchema,
  normalizeConnectorState,
  buildConnectorHealthSummary,
  latestConnectorsFromCatalog
} from '../helpers/connectorHelpers';

export function connectorsReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CONNECTOR_CATALOG': {
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
    }

    case 'SET_FLOW_CONNECTOR_SELECTION': {
      const nextSelections = {
        ...state.flowConnectorSelections,
        [action.payload.flowId]: {
          pluginId: action.payload.pluginId,
          pluginVersion: action.payload.pluginVersion,
        },
      };

      const descriptor = findDescriptor(
        state.connectorCatalog,
        action.payload.pluginId,
        action.payload.pluginVersion,
      );

      const nextConfigs = {
        ...state.flowConnectorConfigs,
        [action.payload.flowId]: descriptor
          ? getDefaultConfigFromSchema(descriptor.configSchema)
          : {},
      };

      const nextHealth = buildConnectorHealthSummary(
        state.groups,
        state.connectorCatalog,
        nextSelections,
      );

      return {
        ...state,
        flowConnectorSelections: nextSelections,
        flowConnectorConfigs: nextConfigs,
        connectorHealthSummary: nextHealth,
      };
    }

    case 'SET_FLOW_CONNECTOR_CONFIG':
      return {
        ...state,
        flowConnectorConfigs: {
          ...state.flowConnectorConfigs,
          [action.payload.flowId]: action.payload.config,
        },
      };

    default:
      return state;
  }
}
