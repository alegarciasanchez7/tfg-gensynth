import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDocumentTheme } from './useDocumentTheme';

describe('useDocumentTheme', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('puts the dark class on <html> so portaled overlays inherit it', () => {
    renderHook(() => useDocumentTheme(true));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('removes the dark class when switching to the light theme', () => {
    const { rerender } = renderHook((isDark: boolean) => useDocumentTheme(isDark), { initialProps: true });

    rerender(false);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
