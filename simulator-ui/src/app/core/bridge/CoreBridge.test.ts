import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CoreBridge } from './CoreBridge';
import { ConnectionManager } from './ConnectionManager';

describe('CoreBridge command timeouts', () => {
  let sendRaw: MockInstance<(data: string) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    sendRaw = vi.spyOn(ConnectionManager.prototype, 'sendRaw').mockImplementation(() => undefined);
  });

  afterEach(() => {
    sendRaw.mockRestore();
    vi.useRealTimers();
  });

  const sentTypes = () => sendRaw.mock.calls.map(([raw]) => (JSON.parse(raw) as { type: string }).type);

  it.each(['LOAD_STATE', 'SAVE_STATE'] as const)(
    'never resends %s while the file dialog is open, however long it takes',
    async (type) => {
      const bridge = new CoreBridge({ mode: 'websocket' });
      let settled = false;
      bridge.send(type).then(() => { settled = true; }, () => { settled = true; });

      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(sentTypes()).toEqual([type]);
      expect(settled).toBe(false);
    },
  );

  it('still resends other commands that get no answer', async () => {
    const bridge = new CoreBridge({ mode: 'websocket', commandTimeoutMs: 1000, retryBackoffMs: 10 });
    bridge.send('GET_INITIAL_STATE').catch(() => undefined);

    await vi.advanceTimersByTimeAsync(1100);

    expect(sentTypes()).toEqual(['GET_INITIAL_STATE', 'GET_INITIAL_STATE']);
  });
});
