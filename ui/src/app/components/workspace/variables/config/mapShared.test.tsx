import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapAutoFit, OfflineGridOverlay } from './mapShared';
import { cachedDivIcon } from './mapIcons';
import { DARK_CANVAS_PALETTE, LIGHT_CANVAS_PALETTE } from './canvasPalette';

// jsdom cannot run Leaflet maps: useMap returns a stub and Polyline renders its positions
const h = vi.hoisted(() => ({
  map: {
    fitBounds: vi.fn(),
    getBounds: () => ({ getSouth: () => 40.2, getNorth: () => 40.6, getWest: () => -3.9, getEast: () => -3.5 }),
    getZoom: () => 9, // 0.1° grid
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('react-leaflet', () => ({
  useMap: () => h.map,
  Polyline: ({ positions, pathOptions }: { positions: [number, number][]; pathOptions: { color?: string } }) => (
    <div data-testid="grid-line" data-positions={JSON.stringify(positions)} data-color={pathOptions.color} />
  ),
}));

beforeEach(() => {
  h.map.fitBounds.mockClear();
  h.map.on.mockClear();
  h.map.off.mockClear();
});

describe('OfflineGridOverlay', () => {
  it('draws latitude and longitude lines over the visible area and follows the map', () => {
    const { unmount } = render(<OfflineGridOverlay />);

    // 0.1° steps over latitudes 40.2..40.6 and longitudes -3.9..-3.5
    const lines = screen.getAllByTestId('grid-line').map((el) => el.getAttribute('data-positions'));
    expect(lines).toContain(JSON.stringify([[40.3, -180], [40.3, 180]]));
    expect(lines).toContain(JSON.stringify([[-85, -3.7], [85, -3.7]]));
    expect(h.map.on).toHaveBeenCalledWith('moveend zoomend', expect.any(Function));

    unmount();
    expect(h.map.off).toHaveBeenCalledWith('moveend zoomend', expect.any(Function));
  });

  it('draws the grid in the colour of the light and the dark theme', async () => {
    try {
      render(<OfflineGridOverlay />);
      expect(screen.getAllByTestId('grid-line')[0]).toHaveAttribute('data-color', LIGHT_CANVAS_PALETTE.mapGrid);

      await act(async () => {
        document.documentElement.classList.add('dark');
      });
      expect(screen.getAllByTestId('grid-line')[0]).toHaveAttribute('data-color', DARK_CANVAS_PALETTE.mapGrid);
    } finally {
      document.documentElement.classList.remove('dark');
    }
  });
});

describe('MapAutoFit', () => {
  const minPoint = { x: 40, y: -4 };
  const maxPoint = { x: 41, y: -3 };

  it('fits the min/max region once', () => {
    const { rerender } = render(<MapAutoFit polygon={[]} minPoint={minPoint} maxPoint={maxPoint} enabled />);
    rerender(<MapAutoFit polygon={[]} minPoint={{ x: 10, y: 10 }} maxPoint={{ x: 11, y: 11 }} enabled />);

    expect(h.map.fitBounds).toHaveBeenCalledTimes(1);
    const bounds = h.map.fitBounds.mock.calls[0][0];
    expect(bounds.getSouth()).toBe(40);
    expect(bounds.getEast()).toBe(-3);
  });

  it('prefers the polygon when it has at least three points', () => {
    const polygon = [{ x: 40.1, y: -3.8 }, { x: 40.3, y: -3.8 }, { x: 40.2, y: -3.6 }];
    render(<MapAutoFit polygon={polygon} minPoint={minPoint} maxPoint={maxPoint} enabled />);

    const bounds = h.map.fitBounds.mock.calls[0][0];
    expect(bounds.getNorth()).toBe(40.3);
    expect(bounds.getWest()).toBe(-3.8);
  });

  it('does nothing when disabled', () => {
    render(<MapAutoFit polygon={[]} minPoint={minPoint} maxPoint={maxPoint} enabled={false} />);
    expect(h.map.fitBounds).not.toHaveBeenCalled();
  });
});

describe('cachedDivIcon', () => {
  it('returns the same icon object for the same key', () => {
    const a = cachedDivIcon('test-1', '<b>1</b>');
    expect(cachedDivIcon('test-1', '<b>1</b>')).toBe(a);
    expect(cachedDivIcon('test-2', '<b>2</b>')).not.toBe(a);
    expect(a.options.iconSize).toEqual([22, 22]);
    expect(a.options.iconAnchor).toEqual([11, 11]);
  });
});
