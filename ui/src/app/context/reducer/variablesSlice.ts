import type { AppState, AppAction } from './appReducer';
import { normalizeVariableListFromCore } from '../variableNormalization';

export function variablesReducer(state: AppState, action: AppAction): AppState {
  if (action.type === 'SET_VARIABLES') {
    return { ...state, variables: normalizeVariableListFromCore(action.payload) };
  }
  return state;
}
