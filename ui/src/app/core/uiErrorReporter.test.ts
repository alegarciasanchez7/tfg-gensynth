import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();

vi.mock('./bridge', () => ({
  default: { send: (...args: unknown[]) => send(...args) },
}));

const { reportUiErrorToCore } = await import('./uiErrorReporter');

describe('reportUiErrorToCore', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('sends the error to the Core log', async () => {
    send.mockResolvedValue(undefined);

    await reportUiErrorToCore('[UI CRASH] boom');

    expect(send).toHaveBeenCalledWith('UI_LOG', { level: 'error', source: 'UI_RUNTIME', message: '[UI CRASH] boom' });
  });

  it('swallows a failed send so it cannot trigger another unhandled rejection', async () => {
    send.mockRejectedValue(new Error('Core unreachable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reportUiErrorToCore('[UI CRASH] boom')).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
