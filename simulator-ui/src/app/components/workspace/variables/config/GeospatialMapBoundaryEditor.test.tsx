import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import editorSource from './GeospatialMapBoundaryEditor.tsx?raw';
import { GeospatialMapBoundaryEditor } from './GeospatialMapBoundaryEditor';
import { TooltipProvider } from '../../../ui/tooltip';
import type { Point3DCoord } from '../../../../types';

type Handler = (event: unknown) => void;
type HandlerMap = Record<string, Handler | undefined>;

// jsdom cannot run Leaflet maps: react-leaflet is replaced by light stand-ins that expose the
// registered event handlers so the tests can fire map / marker / tile events directly.
const h = vi.hoisted(() => {
  const container = document.createElement('div');
  return {
    container,
    mapHandlers: new Set<Record<string, ((event: unknown) => void) | undefined>>(),
    markers: new Map<string, { handlers: Record<string, ((event: unknown) => void) | undefined>; iconUrl: string }>(),
    tileHandlers: null as Record<string, ((event: unknown) => void) | undefined> | null,
    map: {
      dragging: { enable: vi.fn(), disable: vi.fn() },
      getContainer: () => container,
      mouseEventToLatLng: vi.fn(),
      // Simple screen projection: x grows with longitude, y grows southwards
      latLngToLayerPoint: ([lat, lng]: [number, number]) => ({ x: lng * 10, y: -lat * 10 }),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      getBounds: () => ({ getSouth: () => 40, getNorth: () => 41, getWest: () => -4, getEast: () => -3 }),
      getZoom: () => 5,
      on: vi.fn(),
      off: vi.fn(),
    },
  };
});

vi.mock('react-leaflet', async () => {
  const ReactMod = await import('react');
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: ({ eventHandlers }: { eventHandlers: HandlerMap }) => {
      h.tileHandlers = eventHandlers;
      return null;
    },
    Polygon: ({ positions }: { positions: [number, number][] }) => (
      <div data-testid="polygon" data-positions={JSON.stringify(positions)} />
    ),
    Marker: ({
      position,
      eventHandlers,
      icon,
      children,
    }: {
      position: [number, number];
      eventHandlers: HandlerMap;
      icon: { options: { iconUrl: string } };
      children: React.ReactNode;
    }) => {
      h.markers.set(position.join(','), { handlers: eventHandlers, iconUrl: icon.options.iconUrl });
      return <div data-testid="vertex-marker">{children}</div>;
    },
    Rectangle: () => <div data-testid="selection-box" />,
    Polyline: () => <div data-testid="grid-line" />,
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

const fireMap = (type: string, event: unknown) => {
  act(() => {
    for (const handlers of [...h.mapHandlers]) handlers[type]?.(event);
  });
};

const mouseEvent = (lat: number, lng: number, button = 0) => ({
  latlng: { lat, lng },
  originalEvent: { button, target: h.container },
});

const fakeMarker = (lat: number, lng: number) => ({ target: { getLatLng: () => ({ lat, lng }), setLatLng: vi.fn() } });

const fireMarker = (key: string, type: string, event: unknown = {}) => {
  const marker = h.markers.get(key);
  if (!marker) throw new Error(`No marker at ${key}`);
  act(() => {
    marker.handlers[type]?.(event);
  });
};

const square: Point3DCoord[] = [
  { x: 40, y: -4, z: 0 },
  { x: 41, y: -4, z: 0 },
  { x: 41, y: -3, z: 0 },
  { x: 40, y: -3, z: 0 },
];

const renderEditor = (props: Partial<React.ComponentProps<typeof GeospatialMapBoundaryEditor>> = {}) => {
  const onChange = vi.fn();
  const utils = render(
    <TooltipProvider>
      <GeospatialMapBoundaryEditor minLat={40} maxLat={41} minLon={-4} maxLon={-3} polygon={square} onChange={onChange} {...props} />
    </TooltipProvider>
  );
  return { onChange, ...utils };
};

const lastChange = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls[onChange.mock.calls.length - 1][0];

describe('GeospatialMapBoundaryEditor', () => {
  beforeEach(() => {
    h.mapHandlers.clear();
    h.markers.clear();
    h.tileHandlers = null;
    vi.clearAllMocks();
    if (!h.container.isConnected) document.body.appendChild(h.container);
  });

  it('does not load marker icons from a CDN', () => {
    renderEditor();
    expect(editorSource).not.toMatch(/cdnjs/i);
    expect(h.markers.size).toBe(4);
    for (const { iconUrl } of h.markers.values()) {
      expect(iconUrl).not.toMatch(/^https?:/);
    }
  });

  it('follows a vertex drag live and commits once on dragend, clamping lat/lon', () => {
    const { onChange } = renderEditor();

    fireMarker('40,-4', 'dragstart', fakeMarker(40, -4));
    fireMarker('40,-4', 'drag', fakeMarker(39.5, -4.5));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/MOVING POINT #1/)).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('polygon').dataset.positions ?? '[]')[0]).toEqual([39.5, -4.5]);

    fireMarker('40,-4', 'dragend', fakeMarker(95.123456, 200));
    expect(onChange).toHaveBeenCalledTimes(1);
    const change = lastChange(onChange);
    expect(change.polygon[0]).toMatchObject({ x: 90, y: 180 });
    expect(change.maxLat).toBe(90);
    expect(change.maxLon).toBe(180);
    expect(screen.queryByText(/MOVING POINT/)).not.toBeInTheDocument();
    // A drag never moves the view
    expect(h.map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('keeps the current region until a New Box Region is completed, then clamps and refits', () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /New Box Region/i }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Proceed/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(h.map.dragging.disable).toHaveBeenCalled();
    expect(screen.getAllByTestId('vertex-marker')).toHaveLength(4);

    fireMap('mousedown', mouseEvent(-100, -200));
    fireMap('mousemove', mouseEvent(10, 10));
    expect(screen.getByTestId('selection-box')).toBeInTheDocument();
    h.map.mouseEventToLatLng.mockReturnValue({ lat: 50, lng: 20 });
    // Released over the map: the release point is used
    act(() => {
      h.container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const change = lastChange(onChange);
    expect(change.polygon).toHaveLength(4);
    expect(change.minLat).toBe(-90);
    expect(change.minLon).toBe(-180);
    expect(onChange.mock.calls.every(([b]) => (b.polygon?.length ?? 4) >= 3)).toBe(true);
    expect(h.map.dragging.enable).toHaveBeenCalled();
    expect(screen.queryByTestId('selection-box')).not.toBeInTheDocument();
    expect(h.map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('finishes the box with the last previewed corner when released outside the map', () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /New Box Region/i }));
    fireEvent.click(screen.getByRole('button', { name: /Proceed/i }));

    fireMap('mousedown', mouseEvent(40, -4));
    fireMap('mousemove', mouseEvent(42, -2));
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(h.map.mouseEventToLatLng).not.toHaveBeenCalled();
    expect(lastChange(onChange)).toMatchObject({ minLat: 40, maxLat: 42, minLon: -4, maxLon: -2 });
  });

  it('inserts a right-clicked vertex after the start of the nearest segment', () => {
    const { onChange } = renderEditor();
    // Close to the east edge (41,-3)-(40,-3), between vertices 3 and 4
    fireMap('contextmenu', mouseEvent(40.5, -3.05));
    const change = lastChange(onChange);
    expect(change.polygon).toHaveLength(5);
    expect(change.polygon[3]).toMatchObject({ x: 40.5, y: -3.05 });
  });

  it('ignores right-click insertion while drawing a box', () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /New Box Region/i }));
    fireEvent.click(screen.getByRole('button', { name: /Proceed/i }));
    fireMap('contextmenu', mouseEvent(40.5, -3.05));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('deletes a vertex on right-click but keeps at least 3', () => {
    const triangle = square.slice(0, 3);
    const { onChange } = renderEditor({ polygon: triangle });
    fireMarker('40,-4', 'contextmenu');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 3 vertices/)).toBeInTheDocument();
  });

  it('applies a preset and refits the view', () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'IBERIA' }));
    expect(lastChange(onChange)).toMatchObject({ minLat: 36, maxLat: 43.8, minLon: -9.5, maxLon: 3.3 });
    expect(h.map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('commits altitude on blur, swapping min and max when needed, and accepts 0', () => {
    const { onChange } = renderEditor({ altitudePattern: 'RANDOM_UNIFORM', minAlt: 10, maxAlt: 100 });
    const minInput = screen.getByLabelText('Min Altitude');

    fireEvent.change(minInput, { target: { value: '250' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(minInput);
    expect(lastChange(onChange)).toMatchObject({ minAlt: 100, maxAlt: 250 });

    fireEvent.change(minInput, { target: { value: '0' } });
    fireEvent.keyDown(minInput, { key: 'Enter' });
    expect(lastChange(onChange)).toMatchObject({ minAlt: 0, maxAlt: 100 });

    onChange.mockClear();
    fireEvent.change(minInput, { target: { value: 'abc' } });
    fireEvent.blur(minInput);
    expect(onChange).not.toHaveBeenCalled();
    expect(minInput).toHaveValue('10');
  });

  it('switches to the offline grid only after several tile errors', () => {
    renderEditor();
    act(() => {
      h.tileHandlers?.tileerror?.({});
      h.tileHandlers?.tileerror?.({});
    });
    expect(screen.queryByText(/OFFLINE MODE ACTIVE/)).not.toBeInTheDocument();
    act(() => {
      h.tileHandlers?.tileerror?.({});
    });
    expect(screen.getByText(/OFFLINE MODE ACTIVE/)).toBeInTheDocument();
  });

  it('shows the cursor coordinates and the pan hint', () => {
    renderEditor();
    fireMap('mousemove', mouseEvent(40.25, -3.5));
    expect(screen.getByText(/40\.2500° N, 3\.5000° W/)).toBeInTheDocument();
    expect(screen.getByText(/Drag to pan/)).toBeInTheDocument();
  });
});
