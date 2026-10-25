import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphRouteCanvas } from './GraphRouteCanvas';
import type { PointVariableConfig } from '../../../../types';

type Handler = (event: unknown) => void;
type HandlerMap = Record<string, Handler | undefined>;

// jsdom cannot run Leaflet maps: react-leaflet is replaced by light stand-ins that render the
// layers as plain elements and expose the map event handlers.
const h = vi.hoisted(() => ({
  mapHandlers: new Set<Record<string, ((event: unknown) => void) | undefined>>(),
  map: {
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    getContainer: () => document.createElement('div'),
    getBounds: () => ({ getSouth: () => 40, getNorth: () => 41, getWest: () => -4, getEast: () => -3 }),
    getZoom: () => 9,
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('react-leaflet', async () => {
  const ReactMod = await import('react');
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    Polygon: ({ positions }: { positions: [number, number][] }) => (
      <div data-testid="region-polygon" data-positions={JSON.stringify(positions)} />
    ),
    // interactive must be a prop: react-leaflet only applies pathOptions as a style, after creating the layer
    Rectangle: ({ bounds, pathOptions, interactive }: { bounds: [number, number][]; pathOptions: { color?: string }; interactive?: boolean }) => (
      <div
        data-testid="region-box"
        data-bounds={JSON.stringify(bounds)}
        data-interactive={String(interactive)}
        data-color={pathOptions.color}
      />
    ),
    Polyline: () => <div data-testid="polyline" />,
    Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="node-marker">{children}</div>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useMap: () => h.map,
    useMapEvents: (handlers: HandlerMap) => {
      ReactMod.useEffect(() => {
        h.mapHandlers.add(handlers);
        return () => {
          h.mapHandlers.delete(handlers);
        };
      }, [handlers]);
      return h.map;
    },
  };
});

const geoConfig = (extra: Partial<PointVariableConfig> = {}): PointVariableConfig => ({
  coordinateSystem: 'GEOSPATIAL',
  pattern: 'GRAPH_ROUTE',
  minPoint: { x: 40.3, y: -3.8, z: 0 },
  maxPoint: { x: 40.55, y: -3.55, z: 100 },
  graphNodes: [],
  graphEdges: [],
  graphSequence: [],
  ...extra,
});

describe('GraphRouteCanvas on the map', () => {
  beforeEach(() => {
    h.mapHandlers.clear();
    vi.clearAllMocks();
  });

  it('draws the min/max box when there is no region polygon', () => {
    render(<GraphRouteCanvas config={geoConfig()} onChange={vi.fn()} />);

    const box = screen.getByTestId('region-box');
    expect(JSON.parse(box.dataset.bounds ?? '[]')).toEqual([[40.3, -3.8], [40.55, -3.55]]);
    // Not interactive, so a click inside it still reaches the map and adds a node
    expect(box.dataset.interactive).toBe('false');
    expect(box.dataset.color).toBe('#06b6d4');
    expect(screen.queryByTestId('region-polygon')).not.toBeInTheDocument();
  });

  it('draws the polygon instead of the box when there is one', () => {
    const polygon = [{ x: 40.3, y: -3.8 }, { x: 40.5, y: -3.8 }, { x: 40.4, y: -3.6 }];
    render(<GraphRouteCanvas config={geoConfig({ boundaryPolygon: polygon })} onChange={vi.fn()} />);

    expect(screen.getByTestId('region-polygon')).toBeInTheDocument();
    expect(screen.queryByTestId('region-box')).not.toBeInTheDocument();
  });

  it('adds a node inside the box with one onChange and rejects one outside it', () => {
    const onChange = vi.fn();
    render(<GraphRouteCanvas config={geoConfig()} onChange={onChange} />);
    const clickMap = (lat: number, lng: number) =>
      act(() => {
        for (const handlers of [...h.mapHandlers]) handlers.click?.({ latlng: { lat, lng } });
      });

    clickMap(41, -3.7);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/outside allowed boundary limits/i)).toBeInTheDocument();

    clickMap(40.4, -3.7);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].graphNodes[0]).toMatchObject({ x: 40.4, y: -3.7 });
  });
});
