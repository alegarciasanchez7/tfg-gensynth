import type { AppState, AppAction } from './appReducer';

export function metricsReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
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

    default:
      return state;
  }
}
