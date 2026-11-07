import type { AppState, AppAction } from './appReducer';
import { normalizeConnectorState, buildConnectorHealthSummary } from '../helpers/connectorHelpers';

export function groupsReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_GROUPS': {
      const payload = action.payload || [];
      const { selections, configs, healthSummary } = normalizeConnectorState(
        payload,
        state.connectorCatalog,
        state.flowConnectorSelections,
        state.flowConnectorConfigs,
      );

      return {
        ...state,
        groups: payload,
        flowConnectorSelections: selections,
        flowConnectorConfigs: configs,
        connectorHealthSummary: healthSummary,
      };
    }

    case 'UPDATE_GROUP': {
      const nextGroups = state.groups.map(g =>
        g.id === action.payload.id ? { ...g, ...action.payload } : g
      );
      return {
        ...state,
        groups: nextGroups,
        connectorHealthSummary: buildConnectorHealthSummary(
          nextGroups,
          state.connectorCatalog,
          state.flowConnectorSelections,
        ),
      };
    }

    case 'TOGGLE_GROUP_EXPANDED':
      return {
        ...state,
        groups: state.groups.map(g =>
          g.id === action.payload ? { ...g, expanded: !g.expanded } : g
        ),
      };

    default:
      return state;
  }
}
