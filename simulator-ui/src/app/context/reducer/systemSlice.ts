import type { AppState, AppAction } from './appReducer';

export function systemReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { 
        ...state, 
        isConnected: action.payload.connected,
        connectionMode: action.payload.mode,
      };

    case 'SET_SYSTEM_STATUS':
      return { ...state, systemStatus: action.payload };

    default:
      return state;
  }
}
