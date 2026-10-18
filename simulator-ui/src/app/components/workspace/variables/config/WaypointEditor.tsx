import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, Maximize2, Minimize2, RotateCcw, X } from 'lucide-react';
import type { BoundaryObstacle, CoordinateSystem, Point3DCoord, PointVariableConfig } from '../../../../types';
import { defaultBoundsFor, type FullPoint } from '../../../../core/pointDefaults';
import { polygonCentroid } from '../../../../core/routeGeometry';
import { shape3DInteriorPoint, type Shape3DParams } from '../../../../core/shape3D';
import {
  checkMove,
  findPathIssues,
  planeRules,
  shape3DRules,
  validatePathChange,
  type PathRules,
} from '../../../../core/waypointPath';
import { CommitInput } from '../../../common/CommitInput';
import { Button } from '../../../ui/button';
import { Label } from '../../../ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/tooltip';
import { WaypointCanvas2D } from './WaypointCanvas2D';
import { WaypointMap, type MapView } from './WaypointMap';
import { WaypointTable, type WaypointAxis } from './WaypointTable';
import { useDialogEscape } from './useDialogEscape';

interface WaypointEditorProps {
  config: PointVariableConfig;
  onChange: (updates: Partial<PointVariableConfig>) => void;
}

/** Decimals worth keeping for a coordinate of a region `span` units wide (~1/1000 of it). */
const decimalsForSpan = (span: number) => (span > 0 ? Math.min(6, Math.max(0, Math.ceil(-Math.log10(span / 1000)))) : 1);

/** Cells per axis of the grid searched for a free position when adding a waypoint. */
const ADD_GRID = 16;

const infoButton = (
  <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
    <Info size={10} />
  </button>
);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Waypoint Navigation editor: the path settings, a visual editor (2D plane or map; 3D uses the
 * table only) and the ordered table of waypoints. Every edit is validated against the region (the
 * polygon or box and the obstacles in 2D / Geospatial, the 3D shape in 3D) and sent as exactly one
 * change; stored waypoints that break the rules (e.g. after the region changed) are flagged. The
 * region comes from the config, or from the defaults of its coordinate system, so the editor also
 * works with the partial config of a conditional-rule override.
 */
export const WaypointEditor: React.FC<WaypointEditorProps> = ({ config, onChange }) => {
  const system: CoordinateSystem = config.coordinateSystem ?? 'CARTESIAN_3D';
  const isGeo = system === 'GEOSPATIAL';
  const is2D = system === 'CARTESIAN_2D';
  const hasVisual = is2D || isGeo;
  const loopPath = config.loopPath ?? true;
  const interpolationSteps = config.interpolationSteps ?? 1;

  const minPoint = useMemo<Point3DCoord>(() => config.minPoint ?? defaultBoundsFor(system).minPoint, [config.minPoint, system]);
  const maxPoint = useMemo<Point3DCoord>(() => config.maxPoint ?? defaultBoundsFor(system).maxPoint, [config.maxPoint, system]);
  // The polygon only bounds 2D and Geospatial points (the 3D shape is the region in 3D)
  const polygon = useMemo<Point3DCoord[]>(() => (hasVisual ? config.boundaryPolygon ?? [] : []), [config.boundaryPolygon, hasVisual]);
  const obstacles = useMemo<BoundaryObstacle[]>(() => (hasVisual ? config.obstacles ?? [] : []), [config.obstacles, hasVisual]);
  const waypoints = useMemo<FullPoint[]>(
    () => (config.waypoints ?? []).map((p) => ({ x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 })),
    [config.waypoints]
  );

  const shape = useMemo<Shape3DParams>(
    () => ({
      minPoint,
      maxPoint,
      shape3DType: config.shape3DType,
      shape3DWidth: config.shape3DWidth,
      shape3DLength: config.shape3DLength,
      shape3DHeight: config.shape3DHeight,
      shape3DRadius: config.shape3DRadius,
    }),
    [minPoint, maxPoint, config.shape3DType, config.shape3DWidth, config.shape3DLength, config.shape3DHeight, config.shape3DRadius]
  );
  const rules = useMemo<PathRules>(
    () => (hasVisual ? planeRules({ minPoint, maxPoint, polygon, obstacles }) : shape3DRules(shape)),
    [hasVisual, minPoint, maxPoint, polygon, obstacles, shape]
  );

  // Stored waypoints and segments that break the rules: drawn in rose and flagged in the table
  const issues = useMemo(() => findPathIssues(waypoints, loopPath, rules), [waypoints, loopPath, rules]);
  const rowIssues = useMemo(() => {
    const rows: string[][] = waypoints.map((_, i) => (issues.points[i] ? [issues.points[i] as string] : []));
    issues.segments.forEach((msg, k) => {
      if (!msg) return;
      const j = (k + 1) % waypoints.length;
      const text = `Segment ${k + 1} → ${j + 1}: ${msg}`;
      rows[k].push(text);
      rows[j].push(text);
    });
    return rows.map((r) => (r.length > 0 ? r.join('\n') : null));
  }, [waypoints, issues]);
  const badPoints = issues.points.filter(Boolean).length;
  const badSegments = issues.segments.filter(Boolean).length;

  const [warning, setWarning] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useDialogEscape(confirmClear, () => setConfirmClear(false));

  // Fullscreen (2D and Geospatial). The map view is kept across the remount: tracked on every
  // move, frozen when toggling
  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreen = isFullScreen && hasVisual;
  const mapViewRef = useRef<MapView | null>(null);
  const [initialMapView, setInitialMapView] = useState<MapView | null>(null);
  const handleMapViewChange = useCallback((view: MapView) => {
    mapViewRef.current = view;
  }, []);
  const toggleFullScreen = (next: boolean) => {
    setInitialMapView(mapViewRef.current);
    setIsFullScreen(next);
  };

  // Esc exits fullscreen; an open Clear confirmation takes the Escape first (capture phase)
  useEffect(() => {
    if (!fullScreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setInitialMapView(mapViewRef.current);
      setIsFullScreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullScreen]);

  // Region box used to place new waypoints: the polygon bounds when there is one
  const box = useMemo(() => {
    if (polygon.length >= 3) {
      const xs = polygon.map((p) => p.x ?? 0);
      const ys = polygon.map((p) => p.y ?? 0);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }
    return { minX: minPoint.x ?? 0, maxX: maxPoint.x ?? 100, minY: minPoint.y ?? 0, maxY: maxPoint.y ?? 100 };
  }, [polygon, minPoint.x, maxPoint.x, minPoint.y, maxPoint.y]);

  /** Validates and commits a new path; returns false and warns when rejected. */
  const commit = (next: FullPoint[], nextLoop = loopPath): boolean => {
    const error = validatePathChange(waypoints, loopPath, next, nextLoop, rules);
    if (error) {
      setWarning(error);
      return false;
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

  /** Live check of a drag, without committing it. */
  const checkDrag = (index: number, x: number, y: number) =>
    checkMove(waypoints, loopPath, index, { ...waypoints[index], x, y }, rules);

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

  /**
   * Add waypoint: the region centre when empty, else the last waypoint shifted by 5% of the region.
   * When that position is not valid (outside a non-rectangular polygon, inside an obstacle, or its
   * segment crosses one) other shifts are tried, then a point inside the region nearest to the
   * last waypoint; the warning only appears when no valid position exists.
   */
  const addWaypoint = () => {
    const spanX = box.maxX - box.minX;
    const spanY = box.maxY - box.minY;
    const decimals = isGeo ? 5 : decimalsForSpan(Math.max(spanX, spanY));
    const round = (v: number) => Number(v.toFixed(decimals));
    const fit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const z = newZ();
    const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, z };
    const last = waypoints.length > 0 ? waypoints[waypoints.length - 1] : null;

    const candidates: FullPoint[] = [];
    if (!last) {
      candidates.push(centre);
    } else {
      const shift = (v: number, span: number, lo: number, hi: number) => {
        const step = span * 0.05;
        return fit(v + step <= hi ? v + step : v - step, lo, hi);
      };
      candidates.push({ x: shift(last.x, spanX, box.minX, box.maxX), y: shift(last.y, spanY, box.minY, box.maxY), z });
      for (const factor of [0.05, 0.1, 0.2]) {
        for (const sx of [1, -1]) {
          for (const sy of [1, -1]) {
            candidates.push({
              x: fit(last.x + sx * factor * spanX, box.minX, box.maxX),
              y: fit(last.y + sy * factor * spanY, box.minY, box.maxY),
              z,
            });
          }
        }
      }
    }
    if (hasVisual) {
      if (polygon.length >= 3) candidates.push({ ...polygonCentroid(polygon), z });
      candidates.push(centre);
      // A grid over the region, nearest to the last waypoint (or the centre) first
      const anchor = last ?? centre;
      const grid: FullPoint[] = [];
      for (let i = 0; i < ADD_GRID; i++) {
        for (let j = 0; j < ADD_GRID; j++) {
          grid.push({ x: box.minX + ((i + 0.5) * spanX) / ADD_GRID, y: box.minY + ((j + 0.5) * spanY) / ADD_GRID, z });
        }
      }
      grid.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y));
      candidates.push(...grid);
    } else {
      candidates.push(shape3DInteriorPoint(shape));
    }

    for (const c of candidates) {
      const next = [...waypoints, { x: round(c.x), y: round(c.y), z: hasVisual ? c.z : round(c.z) }];
      if (validatePathChange(waypoints, loopPath, next, loopPath, rules) === null) {
        setWarning(null);
        onChange({ waypoints: next });
        return;
      }
    }
    setWarning(`No valid position found for a new waypoint: click on the ${isGeo ? 'map' : 'plane'} or type its coordinates.`);
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
    issues,
    checkMove: checkDrag,
    fill: fullScreen,
  };

  const header = (
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

        {hasVisual && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  type="button"
                  variant={fullScreen ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => toggleFullScreen(!fullScreen)}
                >
                  {fullScreen ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
                  <span>{fullScreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-[11px]">
              {fullScreen ? 'Exit fullscreen editor view (Esc)' : 'Expand waypoint editor to full screen'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );

  // Persistent notice of the stored waypoints / segments that break the rules
  const problems = [
    badPoints > 0 &&
      `${plural(badPoints, 'waypoint is', 'waypoints are')} ${hasVisual ? 'outside the region or in a forbidden zone' : 'outside the 3D region'}`,
    badSegments > 0 &&
      plural(badSegments, 'segment leaves the region or crosses an obstacle', 'segments leave the region or cross an obstacle'),
  ].filter(Boolean);
  const notice = problems.length > 0 && (
    <div
      role="status"
      data-testid="waypoint-invalid-notice"
      className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded px-2 py-1"
    >
      <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-px" />
      <span>{`${problems.join(' and ')} (in red). The generator follows the path anyway.`}</span>
    </div>
  );

  const warningBanner = warning && (
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
  );

  const visual = is2D ? (
    <WaypointCanvas2D {...visualProps} />
  ) : isGeo ? (
    <WaypointMap {...visualProps} initialView={initialMapView} onViewChange={handleMapViewChange} />
  ) : (
    <p className="text-[11px] text-[var(--c-tx4)] bg-[var(--c-bg3)] border border-dashed border-[var(--c-br2)] rounded px-2 py-1.5">
      {"Enter the coordinates in the table: 3D waypoints have no visual editor."}
    </p>
  );

  const table = (
    <WaypointTable
      waypoints={waypoints}
      showZ={!is2D}
      isGeo={isGeo}
      onEditCoord={editCoord}
      onMoveRow={moveRow}
      onDelete={remove}
      onAdd={addWaypoint}
      rowIssues={rowIssues}
      fill={fullScreen}
    />
  );

  if (fullScreen) {
    // Rendered in <body>: inside the panel it would stay in the stacking context of its ancestors
    // and the app bars and side panels would cover it
    return createPortal(
      <div
        data-testid="waypoint-editor"
        className="fixed inset-0 z-[9999] bg-[var(--c-bg1)] p-4 md:p-6 flex flex-col h-screen w-screen gap-3 overflow-hidden shadow-2xl animate-in fade-in duration-200"
      >
        {header}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
          {/* Visual area, with the warning floating over it */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
            {notice}
            <div className="relative flex-1 min-h-0">
              {warningBanner}
              <div className="absolute inset-0">{visual}</div>
            </div>
          </div>
          <div className="lg:w-[380px] shrink-0 max-h-[40vh] lg:max-h-none overflow-y-auto" data-testid="waypoint-side-panel">
            {table}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="space-y-2" data-testid="waypoint-editor">
      {header}
      {notice}

      {/* Visual editor and table; the warning floats over them so nothing moves */}
      <div className="relative space-y-2">
        {warningBanner}
        {visual}
        {table}
      </div>
    </div>
  );
};
