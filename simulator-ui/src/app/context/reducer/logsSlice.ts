import type { AppState, AppAction } from './appReducer';

export function logsReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
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

    default:
      return state;
  }
}
