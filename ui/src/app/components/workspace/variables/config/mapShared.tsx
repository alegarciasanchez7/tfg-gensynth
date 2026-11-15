import { useEffect, useMemo, useRef, useState } from 'react';
import { Polygon, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { BoundaryObstacle, Point3DCoord } from '../../../../types';
import { useCanvasPalette } from './canvasPalette';

/** Pieces shared by the Leaflet editors of geospatial points (route graph, waypoints). */

/** Lat/lon grid drawn instead of the map tiles when the app is offline. */
export function OfflineGridOverlay() {
  const map = useMap();
  const palette = useCanvasPalette();
  const gridLineStyle = useMemo<L.PathOptions>(
    () => ({ color: palette.mapGrid, weight: 1, dashArray: '3, 3' }),
    [palette],
  );
  const [gridItems, setGridItems] = useState<{ positions: [number, number][]; label: string }[]>([]);

  useEffect(() => {
    const updateGrid = () => {
      const b = map.getBounds();
      const z = map.getZoom();
      let step: number;
      if (z >= 13) step = 0.01;
      else if (z >= 11) step = 0.05;
      else if (z >= 9) step = 0.1;
      else if (z >= 7) step = 0.5;
      else if (z >= 5) step = 1.0;
      else step = 5.0;

      const items: { positions: [number, number][]; label: string }[] = [];
      const minLat = Math.max(-85, Math.floor(b.getSouth() / step) * step);
      const maxLat = Math.min(85, Math.ceil(b.getNorth() / step) * step);
      const minLon = Math.max(-180, Math.floor(b.getWest() / step) * step);
      const maxLon = Math.min(180, Math.ceil(b.getEast() / step) * step);

      for (let lat = minLat; lat <= maxLat; lat += step) {
        const rLat = Math.round(lat * 10000) / 10000;
        items.push({
          positions: [[rLat, -180], [rLat, 180]],
          label: `${rLat}° ${rLat >= 0 ? 'N' : 'S'}`,
        });
      }
      for (let lon = minLon; lon <= maxLon; lon += step) {
        const rLon = Math.round(lon * 10000) / 10000;
        items.push({
          positions: [[-85, rLon], [85, rLon]],
          label: `${rLon}° ${rLon >= 0 ? 'E' : 'W'}`,
        });
      }
      setGridItems(items);
    };

    updateGrid();
    map.on('moveend zoomend', updateGrid);
    return () => {
      map.off('moveend zoomend', updateGrid);
    };
  }, [map]);

  return (
    <>
      {gridItems.map((item) => (
        <Polyline key={item.label} positions={item.positions} pathOptions={gridLineStyle} interactive={false} />
      ))}
    </>
  );
}

/**
 * Fits the map to the boundary polygon, or to the min/max region when there is no polygon, once.
 * Disabled when the map is remounted with a remembered view (fullscreen toggle).
 */
export function MapAutoFit({
  polygon,
  minPoint,
  maxPoint,
  enabled,
}: {
  polygon: Point3DCoord[];
  minPoint: Point3DCoord;
  maxPoint: Point3DCoord;
  enabled: boolean;
}) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasFittedRef.current) return;
    hasFittedRef.current = true;
    const bounds =
      polygon && polygon.length >= 3
        ? L.latLngBounds(polygon.map((p) => [p.x ?? 0, p.y ?? p.x ?? 0]))
        : L.latLngBounds([
            [minPoint.x ?? 0, minPoint.y ?? 0],
            [maxPoint.x ?? 0, maxPoint.y ?? 0],
          ]);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 17, animate: false });
    }
  }, [map, polygon, minPoint, maxPoint, enabled]);

  return null;
}

/** Walls and forbidden zones: dashed red, and the selected one in amber. */
const obstacleStyle = (selected: boolean): L.PathOptions => ({
  color: selected ? '#f59e0b' : '#f43f5e',
  fillColor: selected ? '#f59e0b' : '#f43f5e',
  fillOpacity: 0.22,
  weight: selected ? 3 : 2,
  dashArray: '4, 4',
});

/**
 * The enabled walls and forbidden zones, drawn over the map (x is the latitude, y the longitude).
 * They are edited elsewhere, so they never take the clicks of the map (drawing and editing on it
 * keep working).
 */
export const ObstacleLayers = ({
  obstacles,
  selectedObstacleId,
}: { obstacles: BoundaryObstacle[]; selectedObstacleId?: string | null }) => (
  <>
    {obstacles.map((obs) => {
      if (!obs.enabled) return null;
      const positions = obs.points.map((p): [number, number] => [p.x ?? 0, p.y ?? 0]);
      const style = obstacleStyle(obs.id === selectedObstacleId);
      if (obs.type === 'WALL_SEGMENT' && positions.length >= 2) {
        return <Polyline key={obs.id} positions={positions} pathOptions={style} interactive={false} />;
      }
      if (obs.type === 'OBSTACLE_POLYGON' && positions.length >= 3) {
        return <Polygon key={obs.id} positions={positions} pathOptions={style} interactive={false} />;
      }
      return null;
    })}
  </>
);
