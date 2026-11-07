import { beforeEach, describe, expect, it } from 'vitest';
import { initialState, CHECK_UPDATES_KEY, SKIPPED_UPDATE_KEY } from './appReducer';
import { updateReducer } from './updateSlice';

const info = { currentVersion: '0.5.2', latestVersion: '0.5.3', releaseUrl: 'https://github.com/x', assetSize: 1 };

describe('updateReducer', () => {
  beforeEach(() => localStorage.clear());

  it('shows the dialog only when asked and only with an update', () => {
    const shown = updateReducer(initialState, { type: 'SET_AVAILABLE_UPDATE', payload: { update: info, openDialog: true } });
    expect(shown.updateDialogOpen).toBe(true);

    const hidden = updateReducer(shown, { type: 'SET_UPDATE_DIALOG_OPEN', payload: false });
    expect(hidden.updateDialogOpen).toBe(false);
    expect(hidden.availableUpdate).toEqual(info);

    const none = updateReducer(initialState, { type: 'SET_UPDATE_DIALOG_OPEN', payload: true });
    expect(none.updateDialogOpen).toBe(false);
  });

  it('remembers on this device the skipped version and the startup check preference', () => {
    const skipped = updateReducer(
      { ...initialState, availableUpdate: info, updateDialogOpen: true },
      { type: 'SKIP_UPDATE_VERSION', payload: '0.5.3' },
    );
    expect(skipped.skippedUpdateVersion).toBe('0.5.3');
    expect(skipped.updateDialogOpen).toBe(false);
    expect(localStorage.getItem(SKIPPED_UPDATE_KEY)).toBe('0.5.3');

    const off = updateReducer(initialState, { type: 'SET_CHECK_UPDATES_AT_STARTUP', payload: false });
    expect(off.checkUpdatesAtStartup).toBe(false);
    expect(localStorage.getItem(CHECK_UPDATES_KEY)).toBe('false');
  });
});
