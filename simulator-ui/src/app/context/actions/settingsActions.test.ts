import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppAction } from '../reducer';
import type { ProjectSettings, TickSettings } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';

const updateSettings = vi.fn();

vi.mock('../../core/bridge', () => ({
  CoreCommands: { updateSettings: (...args: unknown[]) => updateSettings(...args) },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const { updateTickSettings } = await import('./settingsActions');

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
