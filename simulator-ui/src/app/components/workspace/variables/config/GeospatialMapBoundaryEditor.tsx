import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Rectangle, Tooltip as LeafletTooltip, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Bundled by Vite, so vertex markers render without network access
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { Point3DCoord, AltitudeUnit, AltitudeReference, AltitudePattern } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Button } from '../../../ui/button';
import { Info, BoxSelect, AlertTriangle, WifiOff } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../ui/tooltip';
import { useBoundaryModalContext } from './BoundaryExpandModal';
import { centerOf, defaultBoundsFor } from '../../../../core/pointDefaults';
import { OfflineGridOverlay } from './mapShared';
import { useDialogEscape } from './useDialogEscape';

// Helper to format DMS coordinates for map tooltips & cursor HUD
const formatDmsHelper = (val: number, isLat: boolean) => {
  const absVal = Math.abs(val);
  const deg = Math.floor(absVal);
  const minFull = (absVal - deg) * 60;
  const min = Math.floor(minFull);
  const sec = Math.round((minFull - min) * 60 * 100) / 100;
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${deg}° ${min}' ${sec.toFixed(2)}" ${dir}`;
};

/** Decimal "lat° N, lon° W" label (the hemisphere letter carries the sign). */
const formatLatLon = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;

// Convention shared with the Core: x = latitude, y = longitude, z = altitude
const latOf = (p: Point3DCoord) => p.x ?? 0;
const lonOf = (p: Point3DCoord) => p.y ?? 0;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;
/** Rounds to 4 decimals and keeps latitude in [-90, 90]. */
const normLat = (v: number) => round4(clamp(v, -90, 90));
/** Rounds to 4 decimals and keeps longitude in [-180, 180]. */
const normLon = (v: number) => round4(clamp(v, -180, 180));

/** Parses a user-typed number; empty or invalid text yields undefined (0 is a valid value). */
const parseNumber = (text: string): number | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
};

/** Consecutive tile failures needed before falling back to the offline grid. */
const TILE_ERROR_THRESHOLD = 3;
const NO_POLYGON: Point3DCoord[] = [];
const WORLD_BOUNDS: L.LatLngBoundsExpression = [[-90, -180], [90, 180]];

const VERTEX_ICON = L.icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

const POLYGON_STYLE: L.PathOptions = {
  color: '#8b5cf6',
  fillColor: '#8b5cf6',
  fillOpacity: 0.2,
  weight: 2,
  interactive: false,
};

const SELECTION_STYLE: L.PathOptions = {
  color: '#f43f5e',
  fillColor: '#f43f5e',
  fillOpacity: 0.25,
  dashArray: '5, 5',
};

/** Returns a callback with a stable identity that always runs the latest `fn`. */
function useStableCallback<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  return useCallback((...args: A) => fnRef.current(...args), []);
}

type GeoBoundsChange = Parameters<GeospatialMapBoundaryEditorProps['onChange']>[0];

interface GeospatialMapBoundaryEditorProps {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  minAlt?: number;
  maxAlt?: number;
  altitudeUnit?: AltitudeUnit;
  altitudeReference?: AltitudeReference;
  altitudePattern?: AltitudePattern;
  initialAltitude?: number;
  maxVerticalStep?: number;
  altitudeOscillationSpeed?: number;
  polygon?: Point3DCoord[];
  onChange: (bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    minAlt?: number;
    maxAlt?: number;
    altitudeUnit?: AltitudeUnit;
    altitudeReference?: AltitudeReference;
    altitudePattern?: AltitudePattern;
    initialAltitude?: number;
    maxVerticalStep?: number;
    altitudeOscillationSpeed?: number;
    polygon?: Point3DCoord[];
  }) => void;
  width?: number;
  height?: number;
}

interface SelectionBounds {
  start: L.LatLng;
  current: L.LatLng;
}

/** Position of a vertex while it is being dragged (not yet committed). */
interface DragPreview {
  index: number;
  lat: number;
  lon: number;
}

/** Screen-space distance from `p` to the segment `a`-`b`. */
function distanceToSegment(p: L.Point, a: L.Point, b: L.Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Box selection (draw mode) and right-click handling on the map
function MapEventsHelper({
  isDrawMode,
  onBoxSelectionComplete,
  onMapRightClick,
}: {
  isDrawMode: boolean;
  onBoxSelectionComplete: (minLat: number, maxLat: number, minLon: number, maxLon: number) => void;
  onMapRightClick: (lat: number, lon: number, map: L.Map) => void;
}) {
  const map = useMap();
  const [selection, setSelection] = useState<SelectionBounds | null>(null);
  const selectionRef = useRef<SelectionBounds | null>(null);
  const docMouseUpRef = useRef<((ev: MouseEvent) => void) | null>(null);
  const onComplete = useStableCallback(onBoxSelectionComplete);
  const onRightClick = useStableCallback(onMapRightClick);

  // Panning is off while drawing so a left-drag always draws the box
  useEffect(() => {
    if (!isDrawMode) return undefined;
    map.dragging.disable();
    return () => {
      map.dragging.enable();
    };
  }, [isDrawMode, map]);

  // Drop a pending document listener if the editor unmounts mid-selection
  useEffect(
    () => () => {
      if (docMouseUpRef.current) document.removeEventListener('mouseup', docMouseUpRef.current);
    },
    []
  );

  const handlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      mousedown(e) {
        if (!isDrawMode || e.originalEvent.button !== 0 || selectionRef.current) return;
        const target = e.originalEvent.target as HTMLElement | null;
        if (target && (target.closest('.leaflet-marker-icon') || target.closest('.leaflet-interactive'))) {
          return;
        }
        selectionRef.current = { start: e.latlng, current: e.latlng };
        setSelection(selectionRef.current);

        // Listen on the document so releasing the button outside the map also ends the box
        const handleMouseUp = (ev: MouseEvent) => {
          docMouseUpRef.current = null;
          const sel = selectionRef.current;
          selectionRef.current = null;
          setSelection(null);
          if (!sel) return;
          const releasedInside = ev.target instanceof Node && map.getContainer().contains(ev.target);
          const end = releasedInside ? map.mouseEventToLatLng(ev) : sel.current;
          const { lat: lat1, lng: lon1 } = sel.start;
          const { lat: lat2, lng: lon2 } = end;
          if (Math.abs(lat1 - lat2) > 0.001 || Math.abs(lon1 - lon2) > 0.001) {
            onComplete(
              normLat(Math.min(lat1, lat2)),
              normLat(Math.max(lat1, lat2)),
              normLon(Math.min(lon1, lon2)),
              normLon(Math.max(lon1, lon2))
            );
          }
        };
        docMouseUpRef.current = handleMouseUp;
        document.addEventListener('mouseup', handleMouseUp, { once: true });
      },
      mousemove(e) {
        if (!selectionRef.current) return;
        selectionRef.current = { ...selectionRef.current, current: e.latlng };
        setSelection(selectionRef.current);
      },
      contextmenu(e) {
        onRightClick(e.latlng.lat, e.latlng.lng, map);
      },
    }),
    [isDrawMode, map, onComplete, onRightClick]
  );
  useMapEvents(handlers);

  return selection ? (
    <Rectangle
      bounds={[
        [selection.start.lat, selection.start.lng],
        [selection.current.lat, selection.current.lng],
      ]}
      pathOptions={SELECTION_STYLE}
    />
  ) : null;
}

// Fits the view to the polygon on first load and whenever `fitToken` changes (presets, new box).
// Plain polygon edits such as vertex drags never move the view.
function MapAutoFitBounds({ polygon, fitToken }: { polygon: Point3DCoord[]; fitToken: number }) {
  const map = useMap();
  const fittedTokenRef = useRef<number | null>(null);

  useEffect(() => {
    if (fittedTokenRef.current === fitToken || polygon.length < 3) return;
    fittedTokenRef.current = fitToken;
    const bounds = L.latLngBounds(polygon.map((p) => [latOf(p), lonOf(p)] as L.LatLngTuple));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16, animate: false });
    }
  }, [map, polygon, fitToken]);

  return null;
}

// Keeps Leaflet's size in sync with its container (fullscreen layout, window resizes) to avoid grey tiles
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      // Fallback: resize once, after the layout has settled
      const timer = setTimeout(() => map.invalidateSize(), 350);
      return () => clearTimeout(timer);
    }
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Cursor / moving-vertex coordinates badge. Owns the cursor state so map mousemove only re-renders this badge.
function CoordinatesHud({ movingPoint }: { movingPoint: DragPreview | null }) {
  const [cursorPos, setCursorPos] = useState<{ lat: number; lon: number } | null>(null);
  const handlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      mousemove(e) {
        setCursorPos({ lat: e.latlng.lat, lon: e.latlng.lng });
      },
      mouseout() {
        setCursorPos(null);
      },
    }),
    []
  );
  useMapEvents(handlers);

  return (
    <div className="absolute top-2 right-2 z-[1000] bg-[var(--c-bg2)]/90 backdrop-blur border border-[var(--c-br1)] text-[10px] font-mono px-2.5 py-1.5 rounded shadow-lg pointer-events-none text-[var(--c-tx1)] flex items-center gap-3">
      {movingPoint ? (
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-300">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span className="font-semibold text-[9px] uppercase tracking-wider text-amber-400">MOVING POINT #{movingPoint.index + 1}:</span>
          <span>{formatLatLon(movingPoint.lat, movingPoint.lon)}</span>
        </div>
      ) : cursorPos ? (
        <>
          <div className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-semibold text-[9px] uppercase tracking-wider text-cyan-400">CURSOR:</span>
            <span>{formatLatLon(cursorPos.lat, cursorPos.lon)}</span>
          </div>
          <div className="text-[9px] text-[var(--c-tx4)] border-l border-[var(--c-br1)] pl-2">
            {formatDmsHelper(cursorPos.lat, true)}, {formatDmsHelper(cursorPos.lon, false)}
          </div>
        </>
      ) : (
        <div className="text-[var(--c-tx4)] italic text-[9px]">Hover or drag point markers for live coordinates</div>
      )}
    </div>
  );
}

interface VertexMarkerProps {
  index: number;
  lat: number;
  lon: number;
  onDragStart: (index: number, lat: number, lon: number) => void;
  onDrag: (index: number, lat: number, lon: number) => void;
  onDragEnd: (index: number, lat: number, lon: number) => void;
  onDelete: (index: number) => void;
}

// Draggable polygon vertex. Memoised with primitive coordinates so unrelated re-renders never reset
// (snap back) a marker that is being dragged.
const VertexMarker = React.memo(function VertexMarker({ index, lat, lon, onDragStart, onDrag, onDragEnd, onDelete }: VertexMarkerProps) {
  const position = useMemo<L.LatLngTuple>(() => [lat, lon], [lat, lon]);
  const eventHandlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      dragstart(e) {
        const ll = (e.target as L.Marker).getLatLng();
        onDragStart(index, ll.lat, ll.lng);
      },
      drag(e) {
        const ll = (e.target as L.Marker).getLatLng();
        onDrag(index, ll.lat, ll.lng);
      },
      dragend(e) {
        const marker = e.target as L.Marker;
        const ll = marker.getLatLng();
        // Back to the committed position: the commit below moves it to the (rounded, clamped) result
        marker.setLatLng(position);
        onDragEnd(index, ll.lat, ll.lng);
      },
      contextmenu() {
        onDelete(index);
      },
    }),
    [index, position, onDragStart, onDrag, onDragEnd, onDelete]
  );

  return (
    <Marker position={position} draggable={true} icon={VERTEX_ICON} eventHandlers={eventHandlers}>
      <LeafletTooltip direction="top" offset={[0, -20]} opacity={0.95}>
        <div className="font-mono text-[10px] leading-snug">
          <div className="font-semibold text-violet-400">Point #{index + 1}</div>
          <div>{formatLatLon(lat, lon)}</div>
          <div className="text-[9px] text-[var(--c-tx4)]">
            {formatDmsHelper(lat, true)}, {formatDmsHelper(lon, false)}
          </div>
        </div>
      </LeafletTooltip>
    </Marker>
  );
});

// Polygon, vertex markers and HUD. Owns the drag preview so a vertex drag re-renders only these layers;
// the editor receives a single commit on dragend.
function GeofenceLayers({
  points,
  onVertexMove,
  onVertexDelete,
}: {
  points: Point3DCoord[];
  onVertexMove: (index: number, lat: number, lon: number) => void;
  onVertexDelete: (index: number) => void;
}) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const handleDrag = useCallback((index: number, lat: number, lon: number) => setPreview({ index, lat, lon }), []);
  const handleDragEnd = useStableCallback((index: number, lat: number, lon: number) => {
    setPreview(null);
    onVertexMove(index, lat, lon);
  });
  const handleDelete = useStableCallback(onVertexDelete);

  const positions = useMemo(
    () =>
      points.map((p, i) =>
        preview && preview.index === i ? ([preview.lat, preview.lon] as L.LatLngTuple) : ([latOf(p), lonOf(p)] as L.LatLngTuple)
      ),
    [points, preview]
  );

  return (
    <>
      {positions.length >= 3 && <Polygon positions={positions} pathOptions={POLYGON_STYLE} />}
      {points.map((pt, i) => (
        // Index keys stay stable while dragging; inserts/deletes only move the following markers
        <VertexMarker
          key={i}
          index={i}
          lat={latOf(pt)}
          lon={lonOf(pt)}
          onDragStart={handleDrag}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          onDelete={handleDelete}
        />
      ))}
      <CoordinatesHud movingPoint={preview} />
    </>
  );
}

// Text input for a number that only commits on blur or Enter (each commit reaches the Core).
// Invalid text reverts to the current value; empty text commits `undefined` when `allowEmpty` is set.
function CommitNumberInput({
  id,
  placeholder,
  value,
  onCommit,
  allowEmpty = false,
}: {
  id: string;
  placeholder: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  allowEmpty?: boolean;
}) {
  const shown = value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  const [prevShown, setPrevShown] = useState(shown);
  if (shown !== prevShown) {
    // The committed value changed (commit echo, swap or external update): show it
    setPrevShown(shown);
    setDraft(shown);
  }

  const commit = () => {
    const parsed = parseNumber(draft);
    if (parsed === undefined) {
      if (allowEmpty && draft.trim() === '') {
        if (value !== undefined) onCommit(undefined);
      } else {
        setDraft(shown);
      }
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      className="h-8 text-xs font-mono"
    />
  );
}

export const GeospatialMapBoundaryEditor: React.FC<GeospatialMapBoundaryEditorProps> = ({
  minLat,
  maxLat,
  minLon,
  maxLon,
  minAlt = 0,
  maxAlt = 100,
  altitudeUnit = 'METERS',
  altitudeReference = 'MSL',
  altitudePattern = 'FOLLOW_XY',
  initialAltitude,
  maxVerticalStep = 1.0,
  altitudeOscillationSpeed = 0.1,
  polygon = NO_POLYGON,
  onChange,
  height = 280,
}) => {
  // In the fullscreen editor the map fills the height and the altitude settings stay in the tab
  const { isFullScreen } = useBoundaryModalContext();

  const [activePolygon, setActivePolygon] = useState<Point3DCoord[]>(() =>
    polygon.length >= 3
      ? polygon
      : [
          { x: minLat, y: minLon, z: minAlt },
          { x: maxLat, y: minLon, z: minAlt },
          { x: maxLat, y: maxLon, z: minAlt },
          { x: minLat, y: maxLon, z: minAlt },
        ]
  );
  // Follow polygon updates coming from the Core
  const [prevPolygon, setPrevPolygon] = useState(polygon);
  if (polygon !== prevPolygon) {
    setPrevPolygon(polygon);
    if (polygon.length >= 3) setActivePolygon(polygon);
  }

  // Initial map centre only (MapContainer ignores later changes; the view is driven by MapAutoFitBounds)
  const [initialCenter] = useState<L.LatLngTuple>(() => {
    const lats = activePolygon.map(latOf);
    const lons = activePolygon.map(lonOf);
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const lon = (Math.min(...lons) + Math.max(...lons)) / 2;
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
    const { minPoint, maxPoint } = defaultBoundsFor('GEOSPATIAL');
    const c = centerOf(minPoint, maxPoint);
    return [c.x, c.y];
  });

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const tileErrorCountRef = useRef(0);
  const [fitToken, setFitToken] = useState(0);

  useEffect(() => {
    const handleOnline = () => {
      tileErrorCountRef.current = 0;
      setIsOffline(false);
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    []
  );

  // A single failed tile is not "offline": only switch after several consecutive failures
  const tileEventHandlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      tileload() {
        tileErrorCountRef.current = 0;
      },
      tileerror() {
        tileErrorCountRef.current += 1;
        if (tileErrorCountRef.current >= TILE_ERROR_THRESHOLD) setIsOffline(true);
      },
    }),
    []
  );

  const retryOnlineMap = () => {
    tileErrorCountRef.current = 0;
    setIsOffline(false);
  };

  const showTempFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedbackMsg(null), 3000);
  };

  /** Sends the full current configuration to the parent, overridden by `patch`. */
  const emit = (patch: Partial<GeoBoundsChange>) => {
    onChange({
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt,
      maxAlt,
      altitudeUnit,
      altitudeReference,
      altitudePattern,
      initialAltitude,
      maxVerticalStep,
      altitudeOscillationSpeed,
      polygon: activePolygon,
      ...patch,
    });
  };

  /** Clamps the vertices to valid lat/lon, stores them and commits them with their bounding box. */
  const commitPolygon = (pts: Point3DCoord[]) => {
    const normalized = pts.map((p) => ({ ...p, x: normLat(latOf(p)), y: normLon(lonOf(p)) }));
    const lats = normalized.map((p) => p.x);
    const lons = normalized.map((p) => p.y);
    setActivePolygon(normalized);
    emit({
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
      polygon: normalized,
    });
  };

  const [isDrawMode, setIsDrawMode] = useState(false);
  const [showConfirmDrawModal, setShowConfirmDrawModal] = useState(false);
  useDialogEscape(showConfirmDrawModal, () => setShowConfirmDrawModal(false));

  const handleToggleDrawMode = () => {
    if (isDrawMode) {
      setIsDrawMode(false);
      return;
    }
    if (activePolygon.length >= 3) {
      setShowConfirmDrawModal(true);
    } else {
      setIsDrawMode(true);
    }
  };

  // The current region is kept until the new box is completed (cancelling leaves it untouched)
  const confirmStartDrawMode = () => {
    setShowConfirmDrawModal(false);
    setIsDrawMode(true);
  };

  const handleBoxSelectionComplete = (
    calculatedMinLat: number,
    calculatedMaxLat: number,
    calculatedMinLon: number,
    calculatedMaxLon: number
  ) => {
    commitPolygon([
      { x: calculatedMinLat, y: calculatedMinLon, z: minAlt },
      { x: calculatedMaxLat, y: calculatedMinLon, z: minAlt },
      { x: calculatedMaxLat, y: calculatedMaxLon, z: minAlt },
      { x: calculatedMinLat, y: calculatedMaxLon, z: minAlt },
    ]);
    setIsDrawMode(false);
    setFitToken((t) => t + 1);
    showTempFeedback('Geofence boundaries updated from drag selection box!');
  };

  const handleVertexMove = (index: number, newLat: number, newLon: number) => {
    commitPolygon(activePolygon.map((pt, i) => (i === index ? { ...pt, x: newLat, y: newLon } : pt)));
  };

  // Inserts a vertex on the polygon edge closest (in screen pixels) to the right-clicked point
  const handleMapRightClick = (lat: number, lon: number, map: L.Map) => {
    if (isDrawMode || activePolygon.length < 3) return;
    const clicked = map.latLngToLayerPoint([lat, lon]);
    const pixels = activePolygon.map((p) => map.latLngToLayerPoint([latOf(p), lonOf(p)]));
    let bestIndex = pixels.length - 1;
    let minDist = Infinity;
    for (let i = 0; i < pixels.length; i++) {
      const dist = distanceToSegment(clicked, pixels[i], pixels[(i + 1) % pixels.length]);
      if (dist < minDist) {
        minDist = dist;
        bestIndex = i;
      }
    }
    const updated = [...activePolygon];
    updated.splice(bestIndex + 1, 0, { x: lat, y: lon, z: minAlt });
    commitPolygon(updated);
    showTempFeedback('Geofence vertex added.');
  };

  const handleDeleteVertex = (index: number) => {
    if (activePolygon.length <= 3) {
      showTempFeedback('A geofence polygon must have at least 3 vertices.');
      return;
    }
    commitPolygon(activePolygon.filter((_, i) => i !== index));
    showTempFeedback('Geofence vertex deleted.');
  };

  /** Commits an altitude range, swapping the values when min > max. */
  const handleAltitudeChange = (a: number, b: number) => {
    emit({ minAlt: Math.min(a, b), maxAlt: Math.max(a, b) });
  };

  const applyPreset = (preset: 'WORLD' | 'EUROPE' | 'IBERIA' | 'NORTH_AMERICA' | 'ASIA') => {
    let pts: Point3DCoord[] = [];
    const currentZ = minAlt;
    switch (preset) {
      case 'WORLD':
        pts = [{ x: -60, y: -160, z: currentZ }, { x: 75, y: -160, z: currentZ }, { x: 75, y: 160, z: currentZ }, { x: -60, y: 160, z: currentZ }];
        break;
      case 'EUROPE':
        pts = [{ x: 35.0, y: -10.0, z: currentZ }, { x: 71.0, y: -10.0, z: currentZ }, { x: 71.0, y: 40.0, z: currentZ }, { x: 35.0, y: 40.0, z: currentZ }];
        break;
      case 'IBERIA':
        pts = [{ x: 36.0, y: -9.5, z: currentZ }, { x: 43.8, y: -9.5, z: currentZ }, { x: 43.8, y: 3.3, z: currentZ }, { x: 36.0, y: 3.3, z: currentZ }];
        break;
      case 'NORTH_AMERICA':
        pts = [{ x: 24.0, y: -125.0, z: currentZ }, { x: 49.0, y: -125.0, z: currentZ }, { x: 49.0, y: -66.0, z: currentZ }, { x: 24.0, y: -66.0, z: currentZ }];
        break;
      case 'ASIA':
        pts = [{ x: 5.0, y: 60.0, z: currentZ }, { x: 55.0, y: 60.0, z: currentZ }, { x: 55.0, y: 145.0, z: currentZ }, { x: 5.0, y: 145.0, z: currentZ }];
        break;
    }
    commitPolygon(pts);
    setFitToken((t) => t + 1);
    showTempFeedback(`Applied ${preset} region geofence preset.`);
  };

  return (
    <div className={isFullScreen ? 'flex flex-col gap-3 flex-1 min-h-0' : 'space-y-3'}>
      <div className="flex items-center justify-between text-xs bg-[var(--c-bg2)] p-2 rounded border border-[var(--c-br1)] shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--c-tx4)] font-medium mr-1 uppercase">Presets:</span>
          {(['IBERIA', 'EUROPE', 'WORLD', 'NORTH_AMERICA', 'ASIA'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
              className="px-2 py-0.5 rounded text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-500/20 transition-colors border border-violet-500/20 cursor-pointer"
            >
              {preset}
            </button>
          ))}
        </div>
        {/* Feedback replaces the hint in place, so the map below never moves */}
        <div className={`text-[10px] ${feedbackMsg ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-[var(--c-tx4)]'}`}>
          {feedbackMsg ?? (isDrawMode ? 'Click & drag box on map' : 'Drag vertices • Right-click to add/delete • Drag to pan')}
        </div>
      </div>

      {/* Confirmation Modal when replacing existing region */}
      {showConfirmDrawModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="geo-draw-confirm-title"
          aria-describedby="geo-draw-confirm-desc"
          className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4 text-[var(--c-tx1)]">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle size={20} className="shrink-0" />
              <h3 id="geo-draw-confirm-title" className="font-semibold text-sm">Draw New Geofence Region?</h3>
            </div>
            <p id="geo-draw-confirm-desc" className="text-xs text-[var(--c-tx2)] leading-relaxed">
              Drawing a new selection box will replace your current {activePolygon.length}-vertex geofence region.
              The current region is kept until you finish the new box, so cancelling the drawing leaves it unchanged.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDrawModal(false)}
                className="text-xs"
                autoFocus
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={confirmStartDrawMode}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
              >
                Proceed & Draw New Region
              </Button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`rounded border border-[var(--c-br1)] overflow-hidden relative ${isFullScreen ? 'flex-1 min-h-[300px]' : ''}`}
        style={isFullScreen ? undefined : { height: `${height}px` }}
      >
        {/* Compact Bottom-Left "New Box Region" Button Overlay */}
        <button
          type="button"
          onClick={handleToggleDrawMode}
          className={`absolute bottom-2 left-2 z-[1000] px-2 py-1 rounded text-[9px] font-medium flex items-center gap-1 transition-all cursor-pointer border backdrop-blur shadow-md ${
            isDrawMode
              ? 'bg-rose-100 dark:bg-rose-950/90 text-rose-600 dark:text-rose-300 border-rose-500/50 animate-pulse'
              : 'bg-[var(--c-bg2)]/85 text-cyan-600 dark:text-cyan-300 hover:bg-[var(--c-bg5)] border-[var(--c-br1)] hover:border-cyan-500/40'
          }`}
        >
          <BoxSelect size={10} />
          <span>{isDrawMode ? 'Cancel Selection' : 'New Box Region'}</span>
        </button>

        {/* Active Drawing Mode Banner Overlay */}
        {isDrawMode && (
          <div className="absolute top-2 left-2 z-[1000] bg-rose-100 dark:bg-rose-950/90 border border-rose-500/50 text-rose-700 dark:text-rose-200 text-[10px] font-mono px-3 py-1.5 rounded shadow-lg flex items-center gap-2 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span className="font-semibold uppercase tracking-wider">BOX DRAWING MODE ACTIVE</span>
            <span className="text-[9px] text-rose-600 dark:text-rose-300 opacity-90">• Drag selection box on map</span>
            <button
              type="button"
              onClick={() => setIsDrawMode(false)}
              className="ml-2 underline hover:text-[var(--c-tx1)] font-sans text-[10px] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Offline Mode Automatic Fallback Banner */}
        {isOffline && (
          <div className="absolute top-2 left-2 z-[1000] bg-amber-100 dark:bg-amber-950/90 border border-amber-500/50 text-amber-700 dark:text-amber-200 text-[10px] font-mono px-3 py-1.5 rounded shadow-lg flex items-center gap-2">
            <WifiOff size={12} className="text-amber-400 shrink-0" />
            <span className="font-semibold uppercase tracking-wider">OFFLINE MODE ACTIVE</span>
            <span className="text-[9px] text-amber-600 dark:text-amber-300 opacity-90">• Technical Lat/Lon Grid Canvas Active</span>
            <button
              type="button"
              onClick={retryOnlineMap}
              className="ml-2 underline hover:text-[var(--c-tx1)] font-sans text-[10px] cursor-pointer"
            >
              Retry Online Map
            </button>
          </div>
        )}

        <MapContainer
          center={initialCenter}
          zoom={5}
          minZoom={2}
          maxBounds={WORLD_BOUNDS}
          maxBoundsViscosity={1.0}
          worldCopyJump={false}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
        >
          {!isOffline && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              subdomains={['a', 'b', 'c']}
              noWrap={true}
              maxZoom={19}
              keepBuffer={6}
              updateWhenZooming={false}
              updateWhenIdle={true}
              crossOrigin={true}
              bounds={WORLD_BOUNDS}
              eventHandlers={tileEventHandlers}
            />
          )}
          {isOffline && <OfflineGridOverlay />}
          <MapEventsHelper
            isDrawMode={isDrawMode}
            onBoxSelectionComplete={handleBoxSelectionComplete}
            onMapRightClick={handleMapRightClick}
          />
          <MapAutoFitBounds polygon={activePolygon} fitToken={fitToken} />
          <MapResizeHandler />
          {/* Real-time cursor / moving-vertex coordinates HUD is rendered by GeofenceLayers */}
          <GeofenceLayers points={activePolygon} onVertexMove={handleVertexMove} onVertexDelete={handleDeleteVertex} />
        </MapContainer>
      </div>

      {isFullScreen ? (
        <p className="shrink-0 text-[11px] text-[var(--c-tx4)] italic">
          Altitude settings are hidden in fullscreen; edit them in the Spatial Boundaries tab.
        </p>
      ) : (
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] uppercase text-[var(--c-tx4)]">
              Geospatial Altitude Dynamics & Datum Settings
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[340px] space-y-1.5 p-3 text-[11px] leading-relaxed">
                <p className="font-semibold text-violet-600 dark:text-violet-300">Altitude & Elevation Dynamics Workflow:</p>
                <p>1. Pattern: Select how elevation Z varies independently from 2D map movement.</p>
                <p>2. Dynamic Inputs: Configure single fixed height or min/max elevation range & step limits.</p>
                <p>3. Unit & Reference: Select measurement unit and physical datum baseline (MSL / AGL / Ellipsoid).</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* 1. FIRST: Independent Altitude Dynamics Pattern Selector */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Label htmlFor="geo-alt-pattern" className="text-[9px] text-[var(--c-tx4)]">Independent Altitude Dynamics Pattern</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={9} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px] p-2 text-[10px] leading-relaxed space-y-1">
                <p className="font-semibold text-emerald-600 dark:text-emerald-300">Vertical (Z) Generation Dynamics:</p>
                <p>• Follow Primary XY: Inherits motion from 2D plane.</p>
                <p>• Fixed Altitude: Constant fixed elevation height.</p>
                <p>• Random Elevation: Uniform random value in [Min Alt, Max Alt] per tick.</p>
                <p>• Climb & Descent Walk: Smooth continuous step ascent and descent.</p>
                <p>• Sinusoidal Oscillation: Smooth hovering sine wave oscillation.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <select
            id="geo-alt-pattern"
            value={altitudePattern}
            onChange={(e) => emit({ altitudePattern: e.target.value as AltitudePattern })}
            className="h-8 w-full rounded border border-input bg-input-background dark:bg-input/30 px-2 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-[var(--c-bg5)] cursor-pointer"
          >
            <option value="FOLLOW_XY">Follow Primary XY Pattern</option>
            <option value="FIXED_ALTITUDE">Fixed Altitude (Constant Height)</option>
            <option value="RANDOM_UNIFORM">Random Elevation (Uniform in Range)</option>
            <option value="RANDOM_WALK">Continuous Climb & Descent Walk</option>
            <option value="SINE_OSCILLATION">Sinusoidal Hover Oscillation (Sine Wave)</option>
          </select>
        </div>

        {/* 2. SECOND: Dynamic Altitude Value Input(s) matching selected Pattern */}
        {altitudePattern === 'FIXED_ALTITUDE' ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="geo-fixed-alt" className="text-[9px] text-[var(--c-tx4)]">Fixed Altitude</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={9} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] p-2 text-[10px] leading-relaxed">
                  Fixed constant elevation height. Elevation range bounds are hidden because altitude remains static.
                </TooltipContent>
              </Tooltip>
            </div>
            <CommitNumberInput
              id="geo-fixed-alt"
              placeholder="e.g. 50.0"
              value={minAlt}
              onCommit={(v) => {
                if (v !== undefined) handleAltitudeChange(v, v);
              }}
            />
          </div>
        ) : (
          <div className={`grid ${altitudePattern === 'RANDOM_WALK' || altitudePattern === 'SINE_OSCILLATION' || altitudePattern === 'FOLLOW_XY' ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label htmlFor="geo-min-alt" className="text-[9px] text-[var(--c-tx4)]">Min Altitude</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={9} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] p-2 text-[10px] leading-relaxed">
                    Lower elevation bound [Min Alt]. The generator will never produce values below this threshold.
                  </TooltipContent>
                </Tooltip>
              </div>
              <CommitNumberInput
                id="geo-min-alt"
                placeholder="e.g. 0.0"
                value={minAlt}
                onCommit={(v) => {
                  if (v !== undefined) handleAltitudeChange(v, maxAlt);
                }}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Label htmlFor="geo-max-alt" className="text-[9px] text-[var(--c-tx4)]">Max Altitude</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={9} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] p-2 text-[10px] leading-relaxed">
                    Upper elevation bound [Max Alt]. The generator will never produce values above this threshold.
                  </TooltipContent>
                </Tooltip>
              </div>
              <CommitNumberInput
                id="geo-max-alt"
                placeholder="e.g. 100.0"
                value={maxAlt}
                onCommit={(v) => {
                  if (v !== undefined) handleAltitudeChange(minAlt, v);
                }}
              />
            </div>

            {altitudePattern === 'FOLLOW_XY' && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label htmlFor="geo-init-alt" className="text-[9px] text-[var(--c-tx4)]">Initial Altitude (Seed)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={9} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px] p-2 text-[10px] leading-relaxed">
                      Starting altitude seed value. Altitude begins at this value and varies alongside 2D plane motion.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CommitNumberInput
                  id="geo-init-alt"
                  placeholder="e.g. 50.0"
                  value={initialAltitude}
                  allowEmpty
                  onCommit={(v) => emit({ initialAltitude: v })}
                />
              </div>
            )}

            {altitudePattern === 'RANDOM_WALK' && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label htmlFor="geo-v-step" className="text-[9px] text-[var(--c-tx4)]">Max Vertical Step (m/tick)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={9} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px] p-2 text-[10px] leading-relaxed">
                      Maximum vertical step distance (in elevation units/meters) altitude can ascend or descend per tick.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CommitNumberInput
                  id="geo-v-step"
                  placeholder="e.g. 1.0"
                  value={maxVerticalStep}
                  onCommit={(v) => {
                    if (v !== undefined) emit({ maxVerticalStep: v });
                  }}
                />
              </div>
            )}

            {altitudePattern === 'SINE_OSCILLATION' && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label htmlFor="geo-osc-speed" className="text-[9px] text-[var(--c-tx4)]">Oscillation Speed (rad/tick)</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                        <Info size={9} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[250px] p-2 text-[10px] leading-relaxed">
                      Angular speed of the sinusoidal hovering wave (radians per tick). Controls climb/descent frequency.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CommitNumberInput
                  id="geo-osc-speed"
                  placeholder="e.g. 0.1"
                  value={altitudeOscillationSpeed}
                  onCommit={(v) => {
                    if (v !== undefined) emit({ altitudeOscillationSpeed: v });
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* 3. THIRD: Measurement Unit and Datum Reference Selectors */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="geo-alt-unit" className="text-[9px] text-[var(--c-tx4)]">Altitude Measurement Unit</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={9} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] p-2 text-[10px] leading-relaxed">
                  Physical unit for output altitude: Meters (m), Feet (ft), Kilometers (km), or Miles (mi).
                </TooltipContent>
              </Tooltip>
            </div>
            <select
              id="geo-alt-unit"
              value={altitudeUnit}
              onChange={(e) => emit({ altitudeUnit: e.target.value as AltitudeUnit })}
              className="h-8 w-full rounded border border-input bg-input-background dark:bg-input/30 px-2 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-[var(--c-bg5)] cursor-pointer"
            >
              <option value="METERS">Meters (m)</option>
              <option value="FEET">Feet (ft)</option>
              <option value="KILOMETERS">Kilometers (km)</option>
              <option value="MILES">Miles (mi)</option>
            </select>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label htmlFor="geo-alt-ref" className="text-[9px] text-[var(--c-tx4)]">Datum / Altitude Reference</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                    <Info size={9} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] p-2 text-[10px] leading-relaxed">
                  • MSL: Orthometric height relative to mean sea level (WGS84 EGM96).<br/>
                  • AGL: Relative height above local terrain ground level.<br/>
                  • ELLIPSOID: Pure WGS84 mathematical ellipsoid height (GPS hardware HAE).
                </TooltipContent>
              </Tooltip>
            </div>
            <select
              id="geo-alt-ref"
              value={altitudeReference}
              onChange={(e) => emit({ altitudeReference: e.target.value as AltitudeReference })}
              className="h-8 w-full rounded border border-input bg-input-background dark:bg-input/30 px-2 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-[var(--c-bg5)] cursor-pointer"
            >
              <option value="MSL">MSL (Mean Sea Level / ASL)</option>
              <option value="AGL">AGL (Above Ground Level)</option>
              <option value="ELLIPSOID">ELLIPSOID (WGS84 HAE)</option>
            </select>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
