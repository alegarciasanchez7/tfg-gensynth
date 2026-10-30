import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppAction } from '../reducer';

const { checkForUpdatesCommand, installUpdateCommand, cancelUpdateCommand } = vi.hoisted(() => ({
  checkForUpdatesCommand: vi.fn(),
  installUpdateCommand: vi.fn(),
  cancelUpdateCommand: vi.fn(),
}));

vi.mock('../../core/bridge', () => ({
  CoreCommands: {
    checkForUpdates: () => checkForUpdatesCommand(),
    installUpdate: (version: string) => installUpdateCommand(version),
    cancelUpdate: () => cancelUpdateCommand(),
  },
}));

import { checkForUpdates, installUpdate } from './updateActions';

const available = {
  supported: true, available: true, currentVersion: '0.5.2', latestVersion: '0.5.3',
  releaseUrl: 'https://github.com/x/releases/tag/v0.5.3', assetSize: 100,
};
const info = { currentVersion: '0.5.2', latestVersion: '0.5.3', releaseUrl: available.releaseUrl, assetSize: 100 };

function setup({ skipped = null as string | null, isDirty = false, isRunning = false, mode = 'jcef' } = {}) {
  const dispatched: AppAction[] = [];
  const reportCommandError = vi.fn();
  const ctx = {
    dispatch: (action: AppAction) => dispatched.push(action),
    getConnectionMode: () => mode,
    getSkippedVersion: () => skipped,
    getUnsavedWork: () => ({ isDirty, isRunning }),
    reportCommandError,
  };
  return { ctx, dispatched, reportCommandError };
}

describe('checkForUpdates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the dialog when the startup check finds a newer version', async () => {
    checkForUpdatesCommand.mockResolvedValue(available);
    const { ctx, dispatched } = setup();

    await checkForUpdates(ctx)({ silent: true });

    expect(dispatched).toEqual([{ type: 'SET_AVAILABLE_UPDATE', payload: { update: info, openDialog: true } }]);
  });

  it('does not offer a skipped version at startup, but a manual check still shows it', async () => {
    checkForUpdatesCommand.mockResolvedValue(available);
    const skipped = setup({ skipped: '0.5.3' });
    await checkForUpdates(skipped.ctx)({ silent: true });
    expect(skipped.dispatched).toEqual([]);

    const manual = setup({ skipped: '0.5.3' });
    const result = await checkForUpdates(manual.ctx)({ silent: false });
    expect(result?.available).toBe(true);
    expect(manual.dispatched).toEqual([{ type: 'SET_AVAILABLE_UPDATE', payload: { update: info, openDialog: false } }]);
  });

  it('is silent at startup when offline or unsupported, and reports errors of a manual check', async () => {
    checkForUpdatesCommand.mockRejectedValue(new Error('offline'));
    const silent = setup();
    await expect(checkForUpdates(silent.ctx)({ silent: true })).resolves.toBeNull();
    expect(silent.reportCommandError).not.toHaveBeenCalled();

    const manual = setup();
    await expect(checkForUpdates(manual.ctx)({ silent: false })).rejects.toThrow('offline');
    expect(manual.reportCommandError).toHaveBeenCalled();

    checkForUpdatesCommand.mockResolvedValue({ supported: false, available: false, reason: 'Development build' });
    const unsupported = setup();
    await checkForUpdates(unsupported.ctx)({ silent: true });
    expect(unsupported.dispatched).toEqual([{ type: 'SET_AVAILABLE_UPDATE', payload: { update: null, openDialog: true } }]);
  });

  it('does nothing in mock mode', async () => {
    const { ctx, dispatched } = setup({ mode: 'mock' });
    await expect(checkForUpdates(ctx)({ silent: true })).resolves.toBeNull();
    expect(checkForUpdatesCommand).not.toHaveBeenCalled();
    expect(dispatched).toEqual([]);
  });
});

describe('installUpdate', () => {
  const confirm = vi.spyOn(window, 'confirm');

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => confirm.mockReset());

  it('installs nothing when the user cancels the confirmation', async () => {
    confirm.mockReturnValue(false);
    const { ctx, dispatched } = setup();

    await expect(installUpdate(ctx)('0.5.3')).resolves.toBe(false);

    expect(installUpdateCommand).not.toHaveBeenCalled();
    expect(dispatched).toEqual([]);
  });

  it('warns about unsaved changes and running groups, then starts the update', async () => {
    confirm.mockReturnValue(true);
    installUpdateCommand.mockResolvedValue({ status: 'ok' });
    const { ctx, dispatched } = setup({ isDirty: true, isRunning: true });

    await expect(installUpdate(ctx)('0.5.3')).resolves.toBe(true);

    const message = confirm.mock.calls[0][0] as string;
    expect(message).toMatch(/unsaved changes/);
    expect(message).toMatch(/running groups will stop/);
    expect(installUpdateCommand).toHaveBeenCalledWith('0.5.3');
    expect(dispatched[0]).toEqual({ type: 'SET_UPDATE_DIALOG_OPEN', payload: false });
    expect(dispatched[1]).toMatchObject({ type: 'SET_UPDATE_STATUS', payload: { phase: 'downloading', version: '0.5.3' } });
  });

  it('shows a failure when the Core refuses to start the update', async () => {
    confirm.mockReturnValue(true);
    installUpdateCommand.mockRejectedValue(new Error('An update is already in progress'));
    const { ctx, dispatched } = setup();

    await installUpdate(ctx)('0.5.3');

    expect(dispatched[dispatched.length - 1]).toMatchObject({
      type: 'SET_UPDATE_STATUS',
      payload: { phase: 'failed', message: 'An update is already in progress' },
    });
  });
});
