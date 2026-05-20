import type { AppState, AppAction } from './appReducer';
import { normalizeVariableListFromCore } from '../variableNormalization';

export function variablesReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VARIABLES':
      return { ...state, variables: normalizeVariableListFromCore(action.payload) };

    default:
      return state;
  }
}
