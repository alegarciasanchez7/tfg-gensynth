import React, { useMemo, useState } from 'react';
import { AlertTriangle, Info, RotateCcw, X } from 'lucide-react';
import type { BoundaryObstacle, CoordinateSystem, Point3DCoord, PointVariableConfig } from '../../../../types';
import { defaultBoundsFor, type FullPoint } from '../../../../core/pointDefaults';
import { validateNodeAndEdge } from '../../../../core/routeGeometry';
import { CommitInput } from '../../../common/CommitInput';
import { Label } from '../../../ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/tooltip';
import { WaypointCanvas2D } from './WaypointCanvas2D';
import { WaypointMap } from './WaypointMap';
import { WaypointTable, type WaypointAxis } from './WaypointTable';
import { useDialogEscape } from './useDialogEscape';

interface WaypointEditorProps {
  config: PointVariableConfig;
  onChange: (updates: Partial<PointVariableConfig>) => void;
}

/** Region the waypoints are validated against (2D and Geospatial). */
interface Region {
  minPoint: Point3DCoord;
  maxPoint: Point3DCoord;
  polygon: Point3DCoord[];
  obstacles: BoundaryObstacle[];
}

const pointKey = (p: FullPoint) => `${p.x},${p.y}`;
const segmentKey = (a: FullPoint, b: FullPoint) => {
  const ka = pointKey(a);
  const kb = pointKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

/** Segments the point travels: consecutive waypoints, plus last → first when the path loops. */
const pathSegments = (points: FullPoint[], loop: boolean): [FullPoint, FullPoint][] => {
  const segments: [FullPoint, FullPoint][] = [];
  for (let i = 0; i < points.length - 1; i++) segments.push([points[i], points[i + 1]]);
  if (loop && points.length >= 3) segments.push([points[points.length - 1], points[0]]);
  return segments;
};

/** Route-graph validation messages reworded for waypoints. */
const waypointMessage = (msg: string) =>
  msg.replace(/an origin node/g, 'a waypoint').replace(/route node/g, 'waypoint').replace(/route edge/g, 'path segment');

/**
 * Checks what a change adds to the path: every new waypoint must be inside the region and outside
 * the forbidden obstacles, and every new segment must not leave the region or cross an obstacle.
 * What was already there is not re-checked, so an old path never blocks an unrelated edit.
 */
const validatePathChange = (
  prev: FullPoint[],
  prevLoop: boolean,
  next: FullPoint[],
  nextLoop: boolean,
  region: Region,
): string | null => {
  const { obstacles, polygon, minPoint, maxPoint } = region;
  const oldPoints = new Set(prev.map(pointKey));
  for (const p of next) {
    if (oldPoints.has(pointKey(p))) continue;
    const error = validateNodeAndEdge(null, p, obstacles, polygon, minPoint, maxPoint);
    if (error) return waypointMessage(error);
  }
  const oldSegments = new Set(pathSegments(prev, prevLoop).map(([a, b]) => segmentKey(a, b)));
  for (const [a, b] of pathSegments(next, nextLoop)) {
    if (oldSegments.has(segmentKey(a, b))) continue;
    const error = validateNodeAndEdge(a, b, obstacles, polygon, minPoint, maxPoint);
    if (error) return waypointMessage(error);
  }
  return null;
};

/** Decimals worth keeping for a coordinate of a region `span` units wide (~1/1000 of it). */
const decimalsForSpan = (span: number) => (span > 0 ? Math.min(6, Math.max(0, Math.ceil(-Math.log10(span / 1000)))) : 1);

const infoButton = (
  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
    <Info size={10} />
  </button>
);

/**
 * Waypoint Navigation editor: the path settings, a visual editor (2D plane or map; 3D uses the
 * table only) and the ordered table of waypoints. Every edit is validated and sent as exactly one
 * change. The region comes from the config, or from the defaults of its coordinate system, so the
 * editor also works with the partial config of a conditional-rule override.
 */
export const WaypointEditor: React.FC<WaypointEditorProps> = ({ config, onChange }) => {
  const system: CoordinateSystem = config.coordinateSystem ?? 'CARTESIAN_3D';
  const isGeo = system === 'GEOSPATIAL';
  const is2D = system === 'CARTESIAN_2D';
  const loopPath = config.loopPath ?? true;
  const interpolationSteps = config.interpolationSteps ?? 1;

  const defaults = defaultBoundsFor(system);
  const minPoint: Point3DCoord = config.minPoint ?? defaults.minPoint;
  const maxPoint: Point3DCoord = config.maxPoint ?? defaults.maxPoint;
  // The polygon only bounds 2D and Geospatial points (the 3D shape is the region in 3D)
  const polygon = useMemo<Point3DCoord[]>(() => (is2D || isGeo ? config.boundaryPolygon ?? [] : []), [config.boundaryPolygon, is2D, isGeo]);
  const obstacles = useMemo<BoundaryObstacle[]>(() => (is2D || isGeo ? config.obstacles ?? [] : []), [config.obstacles, is2D, isGeo]);
  const waypoints = useMemo<FullPoint[]>(
    () => (config.waypoints ?? []).map((p) => ({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 })),
    [config.waypoints]
  );

  const [warning, setWarning] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useDialogEscape(confirmClear, () => setConfirmClear(false));

  // Region box used to place new waypoints: the polygon bounds when there is one
  const box = useMemo(() => {
    if (polygon.length >= 3) {
      const xs = polygon.map((p) => p.x ?? 0);
      const ys = polygon.map((p) => p.y ?? 0);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }
    return { minX: minPoint.x ?? 0, maxX: maxPoint.x ?? 100, minY: minPoint.y ?? 0, maxY: maxPoint.y ?? 100 };
  }, [polygon, minPoint.x, maxPoint.x, minPoint.y, maxPoint.y]);

  /** Validates (2D / Geospatial) and commits a new path; returns false and warns when rejected. */
  const commit = (next: FullPoint[], nextLoop = loopPath): boolean => {
    if (is2D || isGeo) {
      const error = validatePathChange(waypoints, loopPath, next, nextLoop, { minPoint, maxPoint, polygon, obstacles });
      if (error) {
        setWarning(error);
        return false;
      }
    }
    setWarning(null);
    if (nextLoop !== loopPath) onChange({ loopPath: nextLoop });
    else onChange({ waypoints: next });
    return true;
  };

  /** Altitude / Z of a new waypoint: the last one's, or the bottom of the region. */
  const newZ = () => (waypoints.length > 0 ? waypoints[waypoints.length - 1].z : is2D ? 0 : (minPoint.z ?? 0));

  const append = (x: number, y: number) => commit([...waypoints, { x, y, z: newZ() }]);

  const move = (index: number, x: number, y: number) =>
    commit(waypoints.map((p, i) => (i === index ? { ...p, x, y } : p)));

  const remove = (index: number) => {
    commit(waypoints.filter((_, i) => i !== index));
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= waypoints.length) return;
    const next = [...waypoints];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const editCoord = (index: number, axis: WaypointAxis, raw: string): boolean => {
    const text = raw.trim().replace(',', '.');
    let value = Number(text);
    if (text === '' || !Number.isFinite(value)) {
      setWarning('Enter a valid number for the waypoint coordinate.');
      return false;
    }
    if (isGeo && axis === 'x') value = Math.max(-90, Math.min(90, value));
    if (isGeo && axis === 'y') value = Math.max(-180, Math.min(180, value));
    if (waypoints[index][axis] === value) return true;
    return commit(waypoints.map((p, i) => (i === index ? { ...p, [axis]: value } : p)));
  };

  /** Add waypoint: the region centre when empty, else the last waypoint shifted by 5% of the region. */
  const addWaypoint = () => {
    const spanX = box.maxX - box.minX;
    const spanY = box.maxY - box.minY;
    const decimals = isGeo ? 5 : decimalsForSpan(Math.max(spanX, spanY));
    const round = (v: number) => Number(v.toFixed(decimals));
    const fit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const shift = (v: number, span: number, lo: number, hi: number) => {
      const step = span * 0.05;
      return fit(v + step <= hi ? v + step : v - step, lo, hi);
    };
    if (waypoints.length === 0) {
      append(round((box.minX + box.maxX) / 2), round((box.minY + box.maxY) / 2));
      return;
    }
    const last = waypoints[waypoints.length - 1];
    append(round(shift(last.x, spanX, box.minX, box.maxX)), round(shift(last.y, spanY, box.minY, box.maxY)));
  };

  const commitSteps = (raw: string): boolean => {
    const text = raw.trim();
    const steps = Number(text);
    if (!/^\d+$/.test(text) || steps < 1) {
      setWarning('Interpolation Steps must be a whole number of at least 1.');
      return false;
    }
    setWarning(null);
    onChange({ interpolationSteps: steps });
    return true;
  };

  const clearAll = () => {
    setConfirmClear(false);
    setWarning(null);
    onChange({ waypoints: [] });
  };

  const visualProps = {
    waypoints,
    minPoint,
    maxPoint,
    polygon,
    obstacles,
    loopPath,
    onAppend: append,
    onMove: move,
    onDelete: remove,
  };

  return (
    <div className="space-y-2" data-testid="waypoint-editor">
      {/* Header: count and path settings */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Waypoints</Label>
          <span className="text-[10px] font-mono text-[var(--c-tx4)]">
            {waypoints.length} {waypoints.length === 1 ? 'waypoint' : 'waypoints'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <input
              id="waypoint-loop-path"
              type="checkbox"
              checked={loopPath}
              onChange={(e) => commit(waypoints, e.target.checked)}
              className="rounded border-[var(--c-br1)] bg-[var(--c-bg1)] text-cyan-500 focus:ring-0 h-3 w-3"
            />
            <Label htmlFor="waypoint-loop-path" className="text-[10px] uppercase text-[var(--c-tx4)] cursor-pointer">
              Loop Path
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>{infoButton}</TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[11px] leading-relaxed">
                {"On: after the last waypoint the point travels back to the first one and repeats the path. Off: it stops on the last waypoint."}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] uppercase text-[var(--c-tx4)]">Interpolation Steps</Label>
            <Tooltip>
              <TooltipTrigger asChild>{infoButton}</TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-[11px] leading-relaxed">
                {"Values generated per segment (at least 1). Each waypoint is generated once, followed by Steps − 1 points evenly spaced towards the next waypoint."}
              </TooltipContent>
            </Tooltip>
            <CommitInput
              value={String(interpolationSteps)}
              ariaLabel="Interpolation Steps"
              inputMode="numeric"
              onCommit={commitSteps}
              className="h-6 w-14 px-1.5 bg-[var(--c-bg1)] border border-[var(--c-br1)] rounded text-cyan-600 dark:text-cyan-300 text-xs font-mono focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {confirmClear ? (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-rose-400">Clear all waypoints?</span>
              <button type="button" onClick={clearAll} className="font-semibold text-rose-400 hover:text-rose-600 dark:hover:text-rose-300">
                Yes
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className="text-[var(--c-tx3)] hover:text-[var(--c-tx1)]">
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={waypoints.length === 0}
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <RotateCcw size={10} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Visual editor and table; the warning floats over them so nothing moves */}
      <div className="relative space-y-2">
        {warning && (
          <div
            role="alert"
            className="absolute top-2 left-2 right-2 z-[1100] flex items-center justify-between bg-rose-100 dark:bg-rose-950/90 border border-rose-500/80 text-rose-700 dark:text-rose-200 px-3 py-1.5 rounded text-xs shadow-md animate-in fade-in slide-in-from-top-1"
          >
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle size={14} className="text-rose-400 shrink-0" />
              <span>{warning}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss warning"
              onClick={() => setWarning(null)}
              className="text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 px-1"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {is2D && <WaypointCanvas2D {...visualProps} />}
        {isGeo && <WaypointMap {...visualProps} />}
        {!is2D && !isGeo && (
          <p className="text-[11px] text-[var(--c-tx4)] bg-[var(--c-bg3)] border border-dashed border-[var(--c-br2)] rounded px-2 py-1.5">
            {"Enter the coordinates in the table: 3D waypoints have no visual editor."}
          </p>
        )}

        <WaypointTable
          waypoints={waypoints}
          showZ={!is2D}
          isGeo={isGeo}
          onEditCoord={editCoord}
          onMoveRow={moveRow}
          onDelete={remove}
          onAdd={addWaypoint}
        />
      </div>
    </div>
  );
};
