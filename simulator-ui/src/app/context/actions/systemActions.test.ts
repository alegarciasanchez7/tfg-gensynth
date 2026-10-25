import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import type { AppAction } from '../reducer';

const startSystemCommand = vi.fn();

vi.mock('../../core/bridge', () => ({
  CoreCommands: { startSystem: () => startSystemCommand() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const { startSystem } = await import('./systemActions');

function setup() {
  const dispatched: AppAction[] = [];
  const reportCommandError = vi.fn();
  const action = startSystem((a) => dispatched.push(a), 'websocket', reportCommandError);
  return { action, dispatched, reportCommandError };
}

describe('startSystem', () => {
  beforeEach(() => {
    startSystemCommand.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('marks the system as running when the Core accepts the start', async () => {
    startSystemCommand.mockResolvedValue({ status: 'ok' });
    const { action, dispatched } = setup();

    await action();

    expect(dispatched).toEqual([{ type: 'SET_SYSTEM_STATUS', payload: 'running' }]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows why the Core rejected the start and stays stopped', async () => {
    const reason = { code: 'INTERNAL_ERROR', message: "Invalid configuration for variable 'date': Invalid timezone" };
    startSystemCommand.mockRejectedValue(reason);
    const { action, dispatched, reportCommandError } = setup();

    await action();

    expect(dispatched).toEqual([]);
    expect(reportCommandError).toHaveBeenCalledWith('SYSTEM', 'startSystem', reason);
    expect(toast.error).toHaveBeenCalledWith(
      "Cannot start the simulation: Invalid configuration for variable 'date': Invalid timezone",
    );
  });

  it('shows the local validation error without contacting the Core', async () => {
    const reportCommandError = vi.fn();
    const action = startSystem(
      vi.fn(),
      'websocket',
      reportCommandError,
      () => [{ id: 'v1', name: 'a', type: 'numeric', scope: 'global', config: { pattern: 'FORMULA', formula: '{{missing}}' } }],
      () => [],
      () => ({}),
    );

    await action();

    expect(startSystemCommand).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/^Cannot start the simulation: /);
  });
});
