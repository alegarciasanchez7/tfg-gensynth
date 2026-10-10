import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutoSave } from './useAutoSave';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing while auto-save is disabled', async () => {
    const save = vi.fn().mockResolvedValue(true);
    renderHook(() => useAutoSave({ enabled: false, intervalSeconds: 5, isDirty: true, save }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('saves on every interval only while there are unsaved changes', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { rerender } = renderHook((props: { isDirty: boolean }) =>
      useAutoSave({ enabled: true, intervalSeconds: 10, isDirty: props.isDirty, save }),
      { initialProps: { isDirty: false } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(save).not.toHaveBeenCalled();

    rerender({ isDirty: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(true);
  });

  it('does not restart the timer on unrelated re-renders', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { rerender } = renderHook(() =>
      useAutoSave({ enabled: true, intervalSeconds: 10, isDirty: true, save }),
    );

    // Frequent re-renders (e.g. metrics updates) must not postpone the save
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      rerender();
    }
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('uses the configured interval', async () => {
    const save = vi.fn().mockResolvedValue(true);
    renderHook(() => useAutoSave({ enabled: true, intervalSeconds: 60, isDirty: true, save }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
