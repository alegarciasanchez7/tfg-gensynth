import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaypointMap } from './WaypointMap';
import type { FullPoint } from '../../../../core/pointDefaults';
import type { MoveCheck, PathIssues } from '../../../../core/waypointPath';

type HandlerMap = Record<string, ((event: unknown) => void) | undefined>;

// jsdom cannot run Leaflet maps: react-leaflet is replaced by light stand-ins that expose the
// registered event handlers so the tests can fire map and marker events directly.
const h = vi.hoisted(() => ({
  mapHandlers: new Set<Record<string, ((event: unknown) => void) | undefined>>(),
  markers: [] as { position: [number, number]; handlers: Record<string, ((event: unknown) => void) | undefined>; html: string }[],
  map: {
    fitBounds: vi.fn(),
    getBounds: () => ({ getSouth: () => 40, getNorth: () => 41, getWest: () => -4, getEast: () => -3 }),
    getZoom: () => 10,
    on: vi.fn(),
    off: vi.fn(),
    // 1000 px per degree, y down like a screen
    latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: lng * 1000, y: -lat * 1000 }),
  },
}));

vi.mock('react-leaflet', async () => {
  const ReactMod = await import('react');
  return {
    MapContainer: ({ children, doubleClickZoom }: { children: React.ReactNode; doubleClickZoom: boolean }) => (
      <div data-testid="map" data-double-click-zoom={String(doubleClickZoom)}>{children}</div>
    ),
    TileLayer: () => <div data-testid="tiles" />,
    Polygon: () => <div data-testid="polygon" />,
    Rectangle: ({ bounds }: { bounds: [number, number][] }) => (
      <div data-testid="region-box" data-bounds={JSON.stringify(bounds)} />
    ),
    Polyline: ({ positions, pathOptions }: { positions: [number, number][]; pathOptions: { dashArray?: string; color?: string } }) => (
      <div
        data-testid={pathOptions.dashArray ? 'dashed-line' : 'line'}
        data-positions={JSON.stringify(positions)}
        data-color={pathOptions.color}
      />
    ),
    Marker: ({ position, eventHandlers, icon }: { position: [number, number]; eventHandlers: HandlerMap; icon: { options: { html?: string } } }) => {
      h.markers.push({ position, handlers: eventHandlers, html: icon.options.html ?? '' });
      return <div data-testid="waypoint-marker" />;
    },
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

/** Latest render of the marker drawn at a position. */
const latestMarkerAt = (lat: number, lon: number) => {
  const found = [...h.markers].reverse().find((m) => m.position[0] === lat && m.position[1] === lon);
  if (!found) throw new Error(`No marker at ${lat},${lon}`);
  return found;
};
/** Latest handlers of the marker drawn at a position. */
const markerAt = (lat: number, lon: number) => latestMarkerAt(lat, lon).handlers;

/** A stand-in for a dragged Leaflet marker with a real marker element. */
const fakeMarker = (lat: number, lng: number) => {
  const element = document.createElement('div');
  element.innerHTML = '<div><div data-waypoint-dot style="background: rgb(15, 23, 42);">2</div></div>';
  const marker = {
    latlng: { lat, lng },
    getLatLng: () => marker.latlng,
    setLatLng: vi.fn((ll: [number, number]) => {
      marker.latlng = { lat: ll[0], lng: ll[1] };
    }),
    getElement: () => element,
  };
  return { marker, element, dot: element.querySelector('[data-waypoint-dot]') as HTMLElement };
};

const waypoints: FullPoint[] = [
  { x: 40.4, y: -3.7, z: 10 },
  { x: 40.45, y: -3.65, z: 10 },
  { x: 40.5, y: -3.7, z: 10 },
];

const renderMap = (overrides: Partial<React.ComponentProps<typeof WaypointMap>> = {}) => {
  const props = {
    waypoints,
    minPoint: { x: 40.3, y: -3.8, z: 0 },
    maxPoint: { x: 40.55, y: -3.55, z: 100 },
    polygon: [],
    obstacles: [],
    loopPath: true,
    onAppend: vi.fn(() => true),
    onMove: vi.fn(() => true),
    onDelete: vi.fn(),
    issues: { points: [], segments: [] } as PathIssues,
    checkMove: vi.fn((): MoveCheck => ({ error: null, pointBad: false, badSegments: [] })),
    ...overrides,
  };
  render(<WaypointMap {...props} />);
  return props;
};

describe('WaypointMap', () => {
  beforeEach(() => {
    h.mapHandlers.clear();
    h.markers.length = 0;
    h.map.fitBounds.mockClear();
  });

  it('draws the region box, the path with its closing segment and one marker per waypoint', () => {
    renderMap();

    expect(screen.getByTestId('region-box')).toHaveAttribute('data-bounds', JSON.stringify([[40.3, -3.8], [40.55, -3.55]]));
    expect(screen.getAllByTestId('waypoint-marker')).toHaveLength(3);
    expect(screen.getByTestId('dashed-line')).toHaveAttribute('data-positions', JSON.stringify([[40.5, -3.7], [40.4, -3.7]]));
    expect(screen.getByTestId('map')).toHaveAttribute('data-double-click-zoom', 'false');
    expect(h.map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('appends a waypoint where the map is clicked, rounded and clamped', () => {
    const props = renderMap();

    fireMap('click', { latlng: { lat: 40.4123456, lng: -3.6987654 } });
    expect(props.onAppend).toHaveBeenCalledWith(40.41235, -3.69877);

    fireMap('click', { latlng: { lat: 95, lng: 200 } });
    expect(props.onAppend).toHaveBeenLastCalledWith(90, 180);
  });

  it('commits a marker drag once on dragend and puts it back when rejected', () => {
    const onMove = vi.fn(() => false);
    renderMap({ onMove });
    const setLatLng = vi.fn();

    act(() => {
      markerAt(40.45, -3.65).dragend?.({ target: { getLatLng: () => ({ lat: 40.46, lng: -3.66 }), setLatLng } });
    });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(1, 40.46, -3.66);
    expect(setLatLng).toHaveBeenCalledWith([40.45, -3.65]);
  });

  it('deletes a waypoint from its marker context menu', () => {
    const props = renderMap();

    act(() => {
      markerAt(40.5, -3.7).contextmenu?.({});
    });

    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith(2);
  });

  it('deletes the selected waypoint with the Delete key pressed inside the map', () => {
    const props = renderMap();
    fireEvent.keyDown(screen.getByTestId('map'), { key: 'Delete' });
    expect(props.onDelete).not.toHaveBeenCalled();

    act(() => {
      markerAt(40.45, -3.65).click?.({});
    });
    fireEvent.keyDown(screen.getByTestId('map'), { key: 'Delete' });

    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith(1);
  });
  it('stops a dragged marker at the region border, paints it red while rejected and commits once', () => {
    const checkMove = vi.fn((): MoveCheck => ({ error: 'Cannot draw path segment crossing forbidden wall barrier: "Wall"', pointBad: false, badSegments: [0] }));
    const props = renderMap({ checkMove });
    const { marker, element, dot } = fakeMarker(40.7, -3.66);
    const baseStyle = dot.style.cssText;

    act(() => {
      markerAt(40.45, -3.65).drag?.({ target: marker });
    });
    // Clamped to the top of the region box (lat 40.55)
    expect(marker.setLatLng).toHaveBeenCalledWith([40.55, -3.66]);
    expect(checkMove).toHaveBeenLastCalledWith(1, 40.55, -3.66);
    expect(element).toHaveAttribute('data-state', 'rejected');
    expect(dot.style.cssText).not.toBe(baseStyle);
    // The moved segment is drawn in red
    expect(screen.getAllByTestId('line').some((l) => l.getAttribute('data-color') === '#ef4444')).toBe(true);

    act(() => {
      markerAt(40.45, -3.65).dragend?.({ target: marker });
    });
    expect(element).not.toHaveAttribute('data-state');
    expect(dot.style.cssText).toBe(baseStyle);
    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(props.onMove).toHaveBeenCalledWith(1, 40.55, -3.66);
  });

  it('does not commit a drag dropped where it started', () => {
    const props = renderMap();
    const { marker } = fakeMarker(40.45, -3.65);
    act(() => {
      markerAt(40.45, -3.65).dragend?.({ target: marker });
    });
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('snaps a click just outside the border onto it, and passes farther clicks on unchanged', () => {
    const props = renderMap();

    // 3 px above the top of the region (1000 px per degree in the stand-in map)
    fireMap('click', { latlng: { lat: 40.553, lng: -3.7 } });
    expect(props.onAppend).toHaveBeenLastCalledWith(40.55, -3.7);

    fireMap('click', { latlng: { lat: 40.6, lng: -3.7 } });
    expect(props.onAppend).toHaveBeenLastCalledWith(40.6, -3.7);
  });

  it('draws stored invalid waypoints and segments in rose', () => {
    renderMap({ issues: { points: [null, null, 'Cannot place waypoint outside allowed boundary limits.'], segments: [null, 'Crosses "Wall"', null] } });

    expect(latestMarkerAt(40.5, -3.7).html).toContain('#fb7185');
    expect(latestMarkerAt(40.4, -3.7).html).not.toContain('#fb7185');
    const rose = screen.getAllByTestId('line').filter((l) => l.getAttribute('data-color') === '#fb7185');
    expect(rose).toHaveLength(1);
    expect(rose[0]).toHaveAttribute('data-positions', JSON.stringify([[40.45, -3.65], [40.5, -3.7]]));
  });

  it('opens on a remembered view without fitting the region, and reports view changes', () => {
    const onViewChange = vi.fn();
    renderMap({ initialView: { center: [40.4, -3.7], zoom: 12 }, onViewChange });
    expect(h.map.fitBounds).not.toHaveBeenCalled();

    fireMap('moveend', { target: { getCenter: () => ({ lat: 40.41, lng: -3.71 }), getZoom: () => 13 } });
    expect(onViewChange).toHaveBeenCalledWith({ center: [40.41, -3.71], zoom: 13 });
  });
});
