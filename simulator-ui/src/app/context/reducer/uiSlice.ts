import type { AppState, AppAction } from './appReducer';

export function uiReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'TOGGLE_THEME': {
      const nextIsDark = !state.isDark;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('gensynth-theme', nextIsDark ? 'dark' : 'light');
      }
      return { ...state, isDark: nextIsDark };
    }

    case 'SET_SELECTION':
      return { ...state, selection: action.payload };

    case 'SET_BOTTOM_TAB':
      return { ...state, bottomTab: action.payload };

    case 'SET_RESTARTING':
      return { ...state, isRestarting: action.payload };

    default:
      return state;
  }
}
