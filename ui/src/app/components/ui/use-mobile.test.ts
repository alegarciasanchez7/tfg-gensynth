import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from './use-mobile';

const listeners = new Set<() => void>();

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

vi.stubGlobal('matchMedia', (query: string) => ({
  media: query,
  matches: false,
  addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
  removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
}));

describe('useIsMobile', () => {
  afterEach(() => {
    listeners.clear();
    setWidth(1024);
  });

  it('reads the width on the first render', () => {
    setWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('follows the media query changes and unsubscribes on unmount', () => {
    setWidth(1024);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    setWidth(600);
    act(() => listeners.forEach(cb => cb()));
    expect(result.current).toBe(true);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
