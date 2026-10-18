import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon as LeafletPolygon,
  Polyline as LeafletPolyline,
  Rectangle as LeafletRectangle,
  Marker as LeafletMarker,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WifiOff } from 'lucide-react';
import type { BoundaryObstacle, Point3DCoord } from '../../../../types';
import { centerOf, type FullPoint } from '../../../../core/pointDefaults';
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
}

const HEIGHT = 300;
const REGION_STYLE: L.PathOptions = { color: '#06b6d4', fillColor: '#06b6d4', fillOpacity: 0.12, weight: 2, interactive: false };
const PATH_STYLE: L.PathOptions = { color: '#22d3ee', weight: 3, interactive: false };
const CLOSING_STYLE: L.PathOptions = { color: '#22d3ee', weight: 2, dashArray: '6, 6', opacity: 0.7, interactive: false };

/** Rounds a map coordinate to 5 decimals (about 1 m). */
const roundCoord = (v: number) => Math.round(v * 100000) / 100000;
const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

/** Numbered marker icon, cached per (number, selected) so a drag is never interrupted by setIcon. */
const waypointIcon = (index: number, selected: boolean): L.DivIcon => {
  const dot = selected
    ? 'background:#22d3ee; color:#0f172a; border:1.5px solid #ffffff; box-shadow:0 0 10px rgba(34,211,238,0.9);'
    : 'background:#0f172a; color:#a5f3fc; border:1.5px solid #22d3ee;';
  return cachedDivIcon(
    `waypoint-${index}-${selected ? 'selected' : 'normal'}`,
    `<div style="display:flex; align-items:center; justify-content:center; width:22px; height:22px; cursor:grab;"><div style="display:flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:9999px; box-sizing:border-box; font:700 8px monospace; ${dot}">${index + 1}</div></div>`,
    22,
    'custom-waypoint-marker',
  );
};

/** Map click → append a waypoint. */
function WaypointMapClicks({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Draggable numbered marker of one waypoint. Takes primitives so it only re-renders when they change. */
const WaypointMarker = React.memo(function WaypointMarker({
  index,
  lat,
  lon,
  selected,
  onSelect,
  onDragEnd,
  onDelete,
}: {
  index: number;
  lat: number;
  lon: number;
  selected: boolean;
  onSelect: (index: number) => void;
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
      dragend: (e) => {
        const marker = e.target as L.Marker;
        const dropped = marker.getLatLng();
        if (!onDragEnd(index, dropped.lat, dropped.lng)) marker.setLatLng(position);
      },
      contextmenu: (e) => {
        L.DomEvent.stopPropagation(e);
        onDelete(index);
      },
    }),
    [index, onSelect, onDragEnd, onDelete, position]
  );

  return (
    <LeafletMarker position={position} icon={waypointIcon(index, selected)} draggable eventHandlers={eventHandlers} />
  );
});

/**
 * Map editor of the waypoint path (x = latitude, y = longitude). Click the map to append a waypoint,
 * drag a marker to move it (committed once on release), right-click it or select it and press
 * Delete to remove it.
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
}) => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [selected, setSelected] = useState<number | null>(null);
  const selectedIndex = selected !== null && selected < waypoints.length ? selected : null;

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

  // Stable callbacks for the memoised markers, delegating to the latest props
  const handlersRef = useRef({ onAppend, onMove, onDelete, count: waypoints.length });
  useLayoutEffect(() => {
    handlersRef.current = { onAppend, onMove, onDelete, count: waypoints.length };
  });
  const handleMapClick = useCallback((lat: number, lon: number) => {
    const h = handlersRef.current;
    if (h.onAppend(roundCoord(clamp(lat, 90)), roundCoord(clamp(lon, 180)))) setSelected(h.count);
  }, []);
  const handleDragEnd = useCallback((index: number, lat: number, lon: number) => {
    setSelected(index);
    return handlersRef.current.onMove(index, roundCoord(clamp(lat, 90)), roundCoord(clamp(lon, 180)));
  }, []);
  const handleDelete = useCallback((index: number) => {
    setSelected(null);
    handlersRef.current.onDelete(index);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndex !== null) {
      e.preventDefault();
      handleDelete(selectedIndex);
    }
  };

  const hasPolygon = polygon.length >= 3;
  const center = centerOf(minPoint, maxPoint);
  const pathPositions = waypoints.map((p): [number, number] => [p.x, p.y]);
  const n = waypoints.length;

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative w-full rounded-md border border-[var(--c-br2)] overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/60 cursor-crosshair"
      style={{ height: HEIGHT }}
    >
      <MapContainer
        center={[center.x, center.y]}
        zoom={6}
        minZoom={2}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
        scrollWheelZoom={true}
        doubleClickZoom={false}
        style={{ height: '100%', width: '100%', background: '#090d16' }}
      >
        <WaypointMapClicks onClick={handleMapClick} />
        <MapAutoFit polygon={polygon} minPoint={minPoint} maxPoint={maxPoint} enabled={true} />

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

        {waypoints.map((wp, i) => (
          <WaypointMarker
            key={i}
            index={i}
            lat={wp.x}
            lon={wp.y}
            selected={selectedIndex === i}
            onSelect={setSelected}
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
