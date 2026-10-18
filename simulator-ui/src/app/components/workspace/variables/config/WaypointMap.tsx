import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon as LeafletPolygon,
  Polyline as LeafletPolyline,
  Rectangle as LeafletRectangle,
  Marker as LeafletMarker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WifiOff } from 'lucide-react';
import type { BoundaryObstacle, Point3DCoord } from '../../../../types';
import { centerOf, type FullPoint } from '../../../../core/pointDefaults';
import { clampToRegion, isInsideRegion, roundIntoRegion } from '../../../../core/routeGeometry';
import type { MoveCheck, PathIssues } from '../../../../core/waypointPath';
import { MapAutoFit, OfflineGridOverlay } from './mapShared';
import { cachedDivIcon } from './mapIcons';

interface WaypointMapProps {
  waypoints: FullPoint[];
  minPoint: Point3DCoord;
  maxPoint: Point3DCoord;
  polygon: Point3DCoord[];
  obstacles: BoundaryObstacle[];
  loopPath: boolean;
  /** Each callback commits one change and returns false when it was rejected. */
  onAppend: (lat: number, lon: number) => boolean;
  onMove: (index: number, lat: number, lon: number) => boolean;
  onDelete: (index: number) => void;
  /** Problems of the stored path, drawn in rose. */
  issues: PathIssues;
  /** Checks a move without committing it, for the live feedback while dragging. */
  checkMove: (index: number, lat: number, lon: number) => MoveCheck;
  /** Fills the height of its container (fullscreen) instead of the fixed height. */
  fill?: boolean;
  /** View to open with instead of fitting the region (kept across the fullscreen toggle). */
  initialView?: MapView | null;
  /** Reports the view after every pan or zoom. */
  onViewChange?: (view: MapView) => void;
}

/** Map centre and zoom. */
export interface MapView {
  center: [number, number];
  zoom: number;
}

const HEIGHT = 300;
/** A click outside the region this close (px) to its border lands on the border. */
const SNAP_PX = 6;
const DECIMALS = 5;
const PATH_COLOR = '#22d3ee';
/** Stored waypoints and segments that break the rules. */
const INVALID_COLOR = '#fb7185';
/** The dragged waypoint and segments while the drop would be rejected. */
const REJECTED_COLOR = '#ef4444';
const REGION_STYLE: L.PathOptions = { color: '#06b6d4', fillColor: '#06b6d4', fillOpacity: 0.12, weight: 2, interactive: false };
const PATH_STYLE: L.PathOptions = { color: PATH_COLOR, weight: 3, interactive: false };
const CLOSING_STYLE: L.PathOptions = { color: PATH_COLOR, weight: 2, dashArray: '6, 6', opacity: 0.7, interactive: false };
/** Inline style added to the dot of a dragged marker while its drop would be rejected. */
const REJECTED_DOT_CSS = `background:${REJECTED_COLOR}; color:#ffffff; border-color:#ffffff; box-shadow:0 0 10px rgba(239,68,68,0.9);`;

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

type MarkerState = 'normal' | 'selected' | 'invalid';

/** Numbered marker icon, cached per (number, state) so a drag is never interrupted by setIcon. */
const waypointIcon = (index: number, state: MarkerState): L.DivIcon => {
  const dot =
    state === 'selected'
      ? 'background:#22d3ee; color:#0f172a; border:1.5px solid #ffffff; box-shadow:0 0 10px rgba(34,211,238,0.9);'
      : state === 'invalid'
        ? `background:#0f172a; color:#fecdd3; border:2px solid ${INVALID_COLOR};`
        : 'background:#0f172a; color:#a5f3fc; border:1.5px solid #22d3ee;';
  return cachedDivIcon(
    `waypoint-${index}-${state}`,
    `<div style="display:flex; align-items:center; justify-content:center; width:22px; height:22px; cursor:grab;"><div data-waypoint-dot style="display:flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:9999px; box-sizing:border-box; font:700 8px monospace; ${dot}">${index + 1}</div></div>`,
    22,
    'custom-waypoint-marker',
  );
};

/**
 * Paints the dot of a dragged marker red while its drop would be rejected. The marker element is
 * changed directly: a new icon would recreate it and end the drag.
 */
const paintRejected = (marker: L.Marker, rejected: boolean) => {
  const el = marker.getElement?.();
  const dot = el?.querySelector<HTMLElement>('[data-waypoint-dot]');
  if (!el || !dot) return;
  if (dot.dataset.baseStyle === undefined) dot.dataset.baseStyle = dot.style.cssText;
  dot.style.cssText = rejected ? `${dot.dataset.baseStyle} ${REJECTED_DOT_CSS}` : dot.dataset.baseStyle;
  if (rejected) el.setAttribute('data-state', 'rejected');
  else el.removeAttribute('data-state');
};

/** Map click → append a waypoint; also reports the pixel distance between two positions for snapping. */
function WaypointMapClicks({
  onClick,
}: {
  onClick: (lat: number, lon: number, pixelDistance: (a: [number, number], b: [number, number]) => number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng, (a, b) => {
        const pa = map.latLngToContainerPoint(a);
        const pb = map.latLngToContainerPoint(b);
        return Math.hypot(pa.x - pb.x, pa.y - pb.y);
      });
    },
  });
  return null;
}

/** Keeps the map size in sync with its container (fullscreen, window resize). */
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer?.();
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** Reports the map view after every pan or zoom. */
function MapViewTracker({ onViewChange }: { onViewChange: (view: MapView) => void }) {
  useMapEvents({
    moveend(e) {
      const map = e.target as L.Map;
      const c = map.getCenter();
      onViewChange({ center: [c.lat, c.lng], zoom: map.getZoom() });
    },
  });
  return null;
}

/** Draggable numbered marker of one waypoint. Takes primitives so it only re-renders when they change. */
const WaypointMarker = React.memo(function WaypointMarker({
  index,
  lat,
  lon,
  state,
  onSelect,
  onDrag,
  onDragEnd,
  onDelete,
}: {
  index: number;
  lat: number;
  lon: number;
  state: MarkerState;
  onSelect: (index: number) => void;
  /** Live position: returns where the marker may be (inside the region) and whether a drop there is rejected. */
  onDrag: (index: number, lat: number, lon: number) => { lat: number; lon: number; rejected: boolean };
  /** Returns false when the move is rejected, so the marker goes back to its position. */
  onDragEnd: (index: number, lat: number, lon: number) => boolean;
  onDelete: (index: number) => void;
}) {
  const position = useMemo<[number, number]>(() => [lat, lon], [lat, lon]);
  const eventHandlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        onSelect(index);
      },
      drag: (e) => {
        const marker = e.target as L.Marker;
        const current = marker.getLatLng();
        const live = onDrag(index, current.lat, current.lng);
        // The marker stops at the region border
        if (live.lat !== current.lat || live.lon !== current.lng) marker.setLatLng([live.lat, live.lon]);
        paintRejected(marker, live.rejected);
      },
      dragend: (e) => {
        const marker = e.target as L.Marker;
        paintRejected(marker, false);
        const dropped = marker.getLatLng();
        if (!onDragEnd(index, dropped.lat, dropped.lng)) marker.setLatLng(position);
      },
      contextmenu: (e) => {
        L.DomEvent.stopPropagation(e);
        onDelete(index);
      },
    }),
    [index, onSelect, onDrag, onDragEnd, onDelete, position]
  );

  return <LeafletMarker position={position} icon={waypointIcon(index, state)} draggable eventHandlers={eventHandlers} />;
});

/** Live drag shown on the map, with the check of its position. */
interface LiveDrag {
  index: number;
  lat: number;
  lon: number;
  baseKey: string;
  check: MoveCheck;
}

/**
 * Map editor of the waypoint path (x = latitude, y = longitude). Click the map to append a waypoint,
 * drag a marker to move it (committed once on release), right-click it or select it and press
 * Delete to remove it. A drag stops at the region border and turns red while its drop would be
 * rejected; stored waypoints and segments that break the rules are drawn in rose.
 */
export const WaypointMap: React.FC<WaypointMapProps> = ({
  waypoints,
  minPoint,
  maxPoint,
  polygon,
  obstacles,
  loopPath,
  onAppend,
  onMove,
  onDelete,
  issues,
  checkMove,
  fill = false,
  initialView = null,
  onViewChange,
}) => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [selected, setSelected] = useState<number | null>(null);
  const selectedIndex = selected !== null && selected < waypoints.length ? selected : null;

  // Live drag: kept until the updated waypoints come back, so the path does not flicker back
  const waypointsKey = JSON.stringify(waypoints);
  const [liveDrag, setLiveDrag] = useState<LiveDrag | null>(null);
  const live = liveDrag && liveDrag.baseKey === waypointsKey ? liveDrag : null;

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /** Clamps a position to the valid lat/lon range and to the region, rounded to 5 decimals (about 1 m). */
  const placeInRegion = (lat: number, lon: number) =>
    roundIntoRegion(clampToRegion({ x: clamp(lat, 90), y: clamp(lon, 180) }, polygon, minPoint, maxPoint), DECIMALS, polygon, minPoint, maxPoint);

  // Stable callbacks for the memoised markers, delegating to the latest props
  const latest = { onAppend, onMove, onDelete, checkMove, placeInRegion, waypoints, waypointsKey, polygon, minPoint, maxPoint };
  const handlersRef = useRef(latest);
  useLayoutEffect(() => {
    handlersRef.current = latest;
  });
  const handleMapClick = useCallback(
    (lat: number, lon: number, pixelDistance: (a: [number, number], b: [number, number]) => number) => {
      const h = handlersRef.current;
      let p = { x: clamp(lat, 90), y: clamp(lon, 180) };
      // Just outside the border: snap onto it; further away the editor rejects the click
      if (!isInsideRegion(p, h.polygon, h.minPoint, h.maxPoint)) {
        const onBorder = clampToRegion(p, h.polygon, h.minPoint, h.maxPoint);
        if (pixelDistance([p.x, p.y], [onBorder.x, onBorder.y]) <= SNAP_PX) p = onBorder;
      }
      const rounded = roundIntoRegion(p, DECIMALS, h.polygon, h.minPoint, h.maxPoint);
      if (h.onAppend(rounded.x, rounded.y)) setSelected(h.waypoints.length);
    },
    []
  );
  const handleDrag = useCallback((index: number, lat: number, lon: number) => {
    const h = handlersRef.current;
    const p = h.placeInRegion(lat, lon);
    const check = h.checkMove(index, p.x, p.y);
    setLiveDrag({ index, lat: p.x, lon: p.y, baseKey: h.waypointsKey, check });
    return { lat: p.x, lon: p.y, rejected: check.error !== null };
  }, []);
  const handleDragEnd = useCallback((index: number, lat: number, lon: number) => {
    const h = handlersRef.current;
    setSelected(index);
    const p = h.placeInRegion(lat, lon);
    const stored = h.waypoints[index];
    if (stored && stored.x === p.x && stored.y === p.y) {
      setLiveDrag(null);
      return true;
    }
    const accepted = h.onMove(index, p.x, p.y);
    if (accepted) setLiveDrag((prev) => (prev && prev.index === index ? { ...prev, lat: p.x, lon: p.y } : prev));
    else setLiveDrag(null);
    return accepted;
  }, []);
  const handleDelete = useCallback((index: number) => {
    setSelected(null);
    handlersRef.current.onDelete(index);
  }, []);

  // Delete / Backspace removes the selected waypoint while the map (or the editor) has the focus. A
  // native listener: the container is a pointer-driven map surface, focused on click, not a keyboard widget.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || selectedIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();
      handleDelete(selectedIndex);
    };
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, handleDelete]);

  const hasPolygon = polygon.length >= 3;
  const center = centerOf(minPoint, maxPoint);
  const n = waypoints.length;
  const displayWaypoints = live ? waypoints.map((p, i) => (i === live.index ? { ...p, x: live.lat, y: live.lon } : p)) : waypoints;
  const pathPositions = displayWaypoints.map((p): [number, number] => [p.x, p.y]);

  // Segment colours: the live check replaces the stored issues around the dragged waypoint
  const liveAdjacent = new Set<number>();
  if (live && n >= 2) {
    if (live.index > 0) liveAdjacent.add(live.index - 1);
    if (live.index < n - 1) liveAdjacent.add(live.index);
    if (loopPath && n >= 3 && (live.index === 0 || live.index === n - 1)) liveAdjacent.add(n - 1);
  }
  const flaggedSegments: { index: number; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1 && !(loopPath && n >= 3)) continue;
    if (liveAdjacent.has(i)) {
      // A rejected waypoint position marks all its segments; otherwise only the failing ones
      const check = live?.check;
      if (check?.error && (check.badSegments.length === 0 || check.badSegments.includes(i))) {
        flaggedSegments.push({ index: i, color: REJECTED_COLOR });
      }
    } else if (issues.segments[i]) {
      flaggedSegments.push({ index: i, color: INVALID_COLOR });
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative w-full rounded-md border border-[var(--c-br2)] overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/60 cursor-crosshair"
      style={{ height: fill ? '100%' : HEIGHT }}
    >
      <MapContainer
        center={initialView?.center ?? [center.x, center.y]}
        zoom={initialView?.zoom ?? 6}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
        scrollWheelZoom={true}
        doubleClickZoom={false}
        style={{ height: '100%', width: '100%', background: '#090d16' }}
      >
        <WaypointMapClicks onClick={handleMapClick} />
        <MapResizeHandler />
        {/* The tracker goes first so it also records the view set by the auto-fit */}
        {onViewChange && <MapViewTracker onViewChange={onViewChange} />}
        <MapAutoFit polygon={polygon} minPoint={minPoint} maxPoint={maxPoint} enabled={initialView === null} />

        {!isOffline && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            subdomains={['a', 'b', 'c']}
            noWrap={true}
            maxZoom={19}
          />
        )}
        {isOffline && <OfflineGridOverlay />}

        {/* Region: the polygon, or the min/max box when there is none */}
        {hasPolygon ? (
          <LeafletPolygon positions={polygon.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0])} pathOptions={REGION_STYLE} />
        ) : (
          <LeafletRectangle
            bounds={[
              [minPoint.x ?? 0, minPoint.y ?? 0],
              [maxPoint.x ?? 0, maxPoint.y ?? 0],
            ]}
            pathOptions={REGION_STYLE}
          />
        )}

        {obstacles
          .filter((obs) => obs.enabled && obs.points && obs.points.length > 0)
          .map((obs) => {
            const positions = obs.points.map((p): [number, number] => [p.x ?? 0, p.y ?? p.x ?? 0]);
            if (obs.type === 'WALL_SEGMENT' && positions.length >= 2) {
              return (
                <LeafletPolyline key={obs.id} positions={positions} pathOptions={{ color: '#f43f5e', weight: 3, dashArray: '4, 4', interactive: false }} />
              );
            }
            if (positions.length >= 3) {
              return (
                <LeafletPolygon
                  key={obs.id}
                  positions={positions}
                  pathOptions={{ color: '#f43f5e', fillColor: '#f43f5e', fillOpacity: 0.22, weight: 1.5, interactive: false }}
                />
              );
            }
            return null;
          })}

        {n >= 2 && <LeafletPolyline positions={pathPositions} pathOptions={PATH_STYLE} />}
        {loopPath && n >= 3 && <LeafletPolyline positions={[pathPositions[n - 1], pathPositions[0]]} pathOptions={CLOSING_STYLE} />}
        {/* Segments that leave the region or cross an obstacle, drawn over the path */}
        {flaggedSegments.map(({ index, color }) => (
          <LeafletPolyline
            key={`bad-${index}-${color}`}
            positions={[pathPositions[index], pathPositions[(index + 1) % n]]}
            pathOptions={{ color, weight: 4, interactive: false }}
          />
        ))}

        {waypoints.map((wp, i) => (
          <WaypointMarker
            key={i}
            index={i}
            lat={wp.x}
            lon={wp.y}
            state={selectedIndex === i ? 'selected' : issues.points[i] ? 'invalid' : 'normal'}
            onSelect={setSelected}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onDelete={handleDelete}
          />
        ))}
      </MapContainer>

      {isOffline && (
        <div className="absolute bottom-2 left-2 z-[1000] bg-amber-100 dark:bg-amber-950/90 border border-amber-500/50 text-amber-700 dark:text-amber-200 text-[10px] font-mono px-2.5 py-1 rounded shadow-md flex items-center gap-2 pointer-events-none">
          <WifiOff size={11} className="text-amber-400 shrink-0" />
          <span>OFFLINE MODE - Technical Grid Active</span>
        </div>
      )}

      {n === 0 ? (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
          <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-300 bg-[var(--c-bg1)]/85 px-2 py-1 rounded">
            Click on the map to add the first waypoint
          </p>
        </div>
      ) : (
        <div className="absolute top-2 right-2 z-[1000] max-w-[calc(100%-1rem)] truncate px-2 py-0.5 rounded bg-[var(--c-bg1)]/85 border border-[var(--c-br2)] text-[10px] text-[var(--c-tx3)] pointer-events-none">
          Click to add · Drag to move · Right-click or Delete to remove
        </div>
      )}
    </div>
  );
};
