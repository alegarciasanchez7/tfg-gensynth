import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialogEscape } from './useDialogEscape';

const pressEscape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('useDialogEscape', () => {
  const outer = vi.fn();
  afterEach(() => {
    window.removeEventListener('keydown', outer);
    outer.mockReset();
  });

  it('calls onClose on Escape while open and hides the key from bubbling listeners', () => {
    window.addEventListener('keydown', outer);
    const onClose = vi.fn();
    renderHook(() => useDialogEscape(true, onClose));

    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const onClose = vi.fn();
    renderHook(() => useDialogEscape(true, onClose));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does nothing while closed and lets Escape through', () => {
    window.addEventListener('keydown', outer);
    const onClose = vi.fn();
    renderHook(() => useDialogEscape(false, onClose));

    pressEscape();

    expect(onClose).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the dialog closes or unmounts', () => {
    const onClose = vi.fn();
    const { rerender, unmount } = renderHook(({ open }) => useDialogEscape(open, onClose), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();

    rerender({ open: true });
    unmount();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls the latest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useDialogEscape(true, cb), { initialProps: { cb: first } });
    rerender({ cb: second });

    pressEscape();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
