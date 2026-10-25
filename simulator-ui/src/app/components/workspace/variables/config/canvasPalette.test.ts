import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DARK_CANVAS_PALETTE, LIGHT_CANVAS_PALETTE, useCanvasPalette } from './canvasPalette';

describe('useCanvasPalette', () => {
  afterEach(() => document.documentElement.classList.remove('dark'));

  it('follows the theme of the app, also when it changes', async () => {
    const { result } = renderHook(() => useCanvasPalette());
    expect(result.current).toBe(LIGHT_CANVAS_PALETTE);

    await act(async () => {
      document.documentElement.classList.add('dark');
    });
    expect(result.current).toBe(DARK_CANVAS_PALETTE);

    await act(async () => {
      document.documentElement.classList.remove('dark');
    });
    expect(result.current).toBe(LIGHT_CANVAS_PALETTE);
  });

  it('gives each theme its own background, grid and text colours', () => {
    for (const key of ['background', 'deepBackground', 'grid', 'mapGrid', 'gridLabel', 'ink', 'tooltipBackground', 'tooltipText'] as const) {
      expect(LIGHT_CANVAS_PALETTE[key], key).not.toBe(DARK_CANVAS_PALETTE[key]);
    }
  });
});
