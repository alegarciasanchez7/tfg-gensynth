import type { AppState, AppAction } from './appReducer';
import { tickSettingsEqual } from '../../core/tickSettings';

export function settingsReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SETTINGS':
      // Keep the same object when nothing changed (e.g. the Core echoing our own update)
      return tickSettingsEqual(state.settings.tick, action.payload.tick)
        ? state
        : { ...state, settings: action.payload };

    default:
      return state;
  }
}
