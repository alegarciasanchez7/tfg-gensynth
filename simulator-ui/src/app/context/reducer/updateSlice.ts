import type { AppState, AppAction } from './appReducer';
import { CHECK_UPDATES_KEY, SKIPPED_UPDATE_KEY } from './appReducer';

/**
 * Update state: the newer release found, its dialog, the progress of an update the user
 * started and the update preferences of this device.
 */
export function updateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_AVAILABLE_UPDATE':
      return {
        ...state,
        availableUpdate: action.payload.update,
        updateDialogOpen: action.payload.update !== null && action.payload.openDialog,
      };

    case 'SET_UPDATE_DIALOG_OPEN':
      return { ...state, updateDialogOpen: action.payload && state.availableUpdate !== null };

    case 'SET_UPDATE_STATUS':
      return { ...state, updateStatus: action.payload };

    case 'SET_CHECK_UPDATES_AT_STARTUP':
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CHECK_UPDATES_KEY, action.payload ? 'true' : 'false');
      }
      return { ...state, checkUpdatesAtStartup: action.payload };

    case 'SKIP_UPDATE_VERSION':
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SKIPPED_UPDATE_KEY, action.payload);
      }
      return { ...state, skippedUpdateVersion: action.payload, updateDialogOpen: false };

    default:
      return state;
  }
}
