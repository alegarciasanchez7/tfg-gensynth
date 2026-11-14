import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTUP_CHECK_DELAY_MS, useUpdateCheck } from './useUpdateCheck';

type HookState = { isConnected: boolean; connectionMode: 'websocket' | 'jcef' | 'mock'; checkUpdatesAtStartup: boolean };

describe('useUpdateCheck', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const desktop: HookState = { isConnected: true, connectionMode: 'jcef', checkUpdatesAtStartup: true };

  it('checks once, silently, a few seconds after the desktop app connects', () => {
    const check = vi.fn().mockResolvedValue(null);
    const { rerender } = renderHook(({ state }) => useUpdateCheck(state, check), { initialProps: { state: desktop } });

    vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS - 1);
    expect(check).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(check).toHaveBeenCalledWith({ silent: true });

    // A reconnection does not check again
    rerender({ state: { ...desktop, isConnected: false } });
    rerender({ state: desktop });
    vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS * 2);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('does not check in the browser, while disconnected or when the user turned it off', () => {
    const check = vi.fn();
    for (const state of [
      { ...desktop, connectionMode: 'websocket' as const },
      { ...desktop, isConnected: false },
      { ...desktop, checkUpdatesAtStartup: false },
    ]) {
      renderHook(() => useUpdateCheck(state, check));
    }
    vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS * 2);
    expect(check).not.toHaveBeenCalled();
  });
});
