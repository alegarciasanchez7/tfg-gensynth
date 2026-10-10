import type { AppState, AppAction } from './appReducer';

export function metricsReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_METRICS':
      return { ...state, metrics: action.payload };

    case 'SET_FLOWS_METRICS':
      // Each event carries every flow: replace the map so deleted flows disappear
      return {
        ...state,
        flowMetrics: Object.fromEntries(action.payload.map((metrics) => [metrics.flowId, metrics])),
      };

    default:
      return state;
  }
}
