import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppAction } from '../reducer';
import type { OutputFolderInfo, ProjectSettings, TickSettings } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';

const updateSettings = vi.fn();
const updateOutputFolder = vi.fn();

vi.mock('../../core/bridge', () => ({
  CoreCommands: {
    updateSettings: (...args: unknown[]) => updateSettings(...args),
    updateOutputFolder: (...args: unknown[]) => updateOutputFolder(...args),
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const { updateTickSettings, setOutputFolder } = await import('./settingsActions');

const fastTick: TickSettings = { mode: 'FIXED_RATE', value: 100, unit: 'MILLISECONDS' };

function setup(connectionMode = 'websocket', settings: ProjectSettings = DEFAULT_PROJECT_SETTINGS) {
  const dispatched: AppAction[] = [];
  const reportCommandError = vi.fn();
  const action = updateTickSettings({
    dispatch: (a) => dispatched.push(a),
    getConnectionMode: () => connectionMode,
    getSettings: () => settings,
    reportCommandError,
  });
  return { action, dispatched, reportCommandError };
}

describe('updateTickSettings', () => {
  beforeEach(() => {
    updateSettings.mockReset();
  });

  it('applies the new settings optimistically and sends them to the Core', async () => {
    updateSettings.mockResolvedValue({ status: 'ok' });
    const { action, dispatched } = setup();

    await action(fastTick);

    expect(dispatched).toEqual([{ type: 'SET_SETTINGS', payload: { tick: fastTick } }]);
    expect(updateSettings).toHaveBeenCalledWith({ tick: fastTick });
  });

  it('rolls back and reports the error when the Core rejects the change', async () => {
    updateSettings.mockRejectedValue(new Error('INVALID_PAYLOAD'));
    const { action, dispatched, reportCommandError } = setup();

    await expect(action(fastTick)).rejects.toThrow('INVALID_PAYLOAD');

    expect(dispatched).toEqual([
      { type: 'SET_SETTINGS', payload: { tick: fastTick } },
      { type: 'SET_SETTINGS', payload: DEFAULT_PROJECT_SETTINGS },
    ]);
    expect(reportCommandError).toHaveBeenCalledWith('SETTINGS', expect.stringContaining('updateTickSettings'), expect.any(Error));
  });

  it('only updates the local state in mock mode', async () => {
    const { action, dispatched } = setup('mock');

    await action(fastTick);

    expect(updateSettings).not.toHaveBeenCalled();
    expect(dispatched).toHaveLength(1);
  });

  it('rejects invalid settings without touching the state', async () => {
    const { action, dispatched } = setup();

    await expect(action({ ...fastTick, value: 0 })).rejects.toThrow(/at least 1/);

    expect(dispatched).toHaveLength(0);
    expect(updateSettings).not.toHaveBeenCalled();
  });
});

describe('setOutputFolder', () => {
  const defaultFolder: OutputFolderInfo = { path: '/home/ana/GenSynth', defaultPath: '/home/ana/GenSynth', custom: false };

  function setupFolder(connectionMode = 'websocket') {
    const dispatched: AppAction[] = [];
    const reportCommandError = vi.fn();
    const action = setOutputFolder({
      dispatch: (a) => dispatched.push(a),
      getConnectionMode: () => connectionMode,
      getOutputFolder: () => defaultFolder,
      reportCommandError,
    });
    return { action, dispatched, reportCommandError };
  }

  beforeEach(() => {
    updateOutputFolder.mockReset();
  });

  it('stores the folder the Core accepted', async () => {
    const accepted: OutputFolderInfo = { path: '/home/ana/results', defaultPath: '/home/ana/GenSynth', custom: true };
    updateOutputFolder.mockResolvedValue({ status: 'ok', outputFolder: accepted });
    const { action, dispatched } = setupFolder();

    await action(' /home/ana/results ');

    expect(updateOutputFolder).toHaveBeenCalledWith('/home/ana/results');
    expect(dispatched).toEqual([{ type: 'SET_OUTPUT_FOLDER', payload: accepted }]);
  });

  it('keeps the current folder and reports the error when the Core rejects it', async () => {
    updateOutputFolder.mockRejectedValue(new Error('You do not have permission to write in /opt'));
    const { action, dispatched, reportCommandError } = setupFolder();

    await expect(action('/opt')).rejects.toThrow('permission');

    expect(dispatched).toEqual([]);
    expect(reportCommandError).toHaveBeenCalledWith('SETTINGS', expect.stringContaining('setOutputFolder'), expect.any(Error));
  });

  it('only updates the local state in mock mode, and an empty path means the default folder', async () => {
    const { action, dispatched } = setupFolder('mock');

    await action('');

    expect(updateOutputFolder).not.toHaveBeenCalled();
    expect(dispatched).toEqual([{ type: 'SET_OUTPUT_FOLDER', payload: defaultFolder }]);
  });
});
