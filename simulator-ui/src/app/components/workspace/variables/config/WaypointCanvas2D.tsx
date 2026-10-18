import React, { useEffect, useRef, useState } from 'react';
import type { BoundaryObstacle, Point3DCoord } from '../../../../types';
import type { FullPoint } from '../../../../core/pointDefaults';
import { fitWorldWindow, niceStep } from '../../../../core/worldWindow';

interface WaypointCanvas2DProps {
  waypoints: FullPoint[];
  minPoint: Point3DCoord;
  maxPoint: Point3DCoord;
  polygon: Point3DCoord[];
  obstacles: BoundaryObstacle[];
  loopPath: boolean;
  /** Each callback commits one change and returns false when it was rejected. */
  onAppend: (x: number, y: number) => boolean;
  onMove: (index: number, x: number, y: number) => boolean;
  onDelete: (index: number) => void;
}

const HEIGHT = 300;
const MARGIN = 28;
/** Minimum pointer travel (px) before a press on a waypoint becomes a drag instead of a click. */
const DRAG_THRESHOLD_PX = 4;

interface DragState {
  index: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  x: number;
  y: number;
}

/** Decimals worth keeping for a value whose resolution is `unit` (e.g. 0.2 → 1 decimal, 5 → 0). */
const decimalsFor = (unit: number) => (unit > 0 ? Math.min(6, Math.max(0, Math.ceil(-Math.log10(unit)))) : 1);

/** Multiples of `step` between `from` and `to`, free of floating point noise. */
const gridValues = (from: number, to: number, step: number): number[] => {
  const values: number[] = [];
  for (let i = Math.ceil(from / step); i * step <= to; i++) values.push(Number((i * step).toFixed(6)));
  return values;
};

const toPathPoints = (points: Point3DCoord[], project: (p: Point3DCoord) => string) => points.map(project).join(' ');

/**
 * 2D plane editor of the waypoint path: draws the region, the enabled obstacles and the numbered
 * path. Click empty space to append a waypoint, drag one to move it (committed once on release),
 * right-click it or select it and press Delete to remove it.
 */
export const WaypointCanvas2D: React.FC<WaypointCanvas2DProps> = ({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(520);
  const [selected, setSelected] = useState<number | null>(null);

  // Drag: the ref holds the live gesture, the state draws the moved waypoint. The state remembers
  // the waypoints it was based on, so after a commit the dragged position stays on screen until the
  // updated waypoints come back (no flicker to the old position).
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const waypointsKey = JSON.stringify(waypoints);
  const [dragPos, setDragPos] = useState<{ index: number; x: number; y: number; baseKey: string } | null>(null);
  const activeDrag = dragPos && dragPos.baseKey === waypointsKey ? dragPos : null;
  const displayWaypoints = activeDrag
    ? waypoints.map((p, i) => (i === activeDrag.index ? { ...p, x: activeDrag.x, y: activeDrag.y } : p))
    : waypoints;
  const selectedIndex = selected !== null && selected < waypoints.length ? selected : null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setWidth(Math.max(320, Math.floor(container.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Region box: the polygon when there is one (>= 3 points), else the min/max bounds
  const hasPolygon = polygon.length >= 3;
  const regionMin = { x: minPoint.x ?? 0, y: minPoint.y ?? 0 };
  const regionMax = { x: maxPoint.x ?? 100, y: maxPoint.y ?? 100 };
  const regionPoints: Point3DCoord[] = hasPolygon ? polygon : [regionMin, regionMax];

  // The committed waypoints are included so a point outside the region stays visible
  const { cx, cy, scale } = fitWorldWindow([...regionPoints, ...waypoints], width, HEIGHT, MARGIN, 0.05);
  const toX = (x: number) => width / 2 + (x - cx) * scale;
  const toY = (y: number) => HEIGHT / 2 - (y - cy) * scale;
  const project = (p: Point3DCoord) => `${toX(p.x ?? 0)},${toY(p.y ?? 0)}`;
  const decimals = decimalsFor(1 / scale);
  const round = (v: number) => Number(v.toFixed(decimals));

  /** Pointer position → world coordinates, accounting for CSS scaling of the drawing. */
  const clientToWorld = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const sx = rect.width > 0 ? width / rect.width : 1;
    const sy = rect.height > 0 ? HEIGHT / rect.height : 1;
    const px = (clientX - rect.left) * sx;
    const py = (clientY - rect.top) * sy;
    return { x: round(cx + (px - width / 2) / scale), y: round(cy - (py - HEIGHT / 2) / scale) };
  };

  // Grid and labels over the visible extents
  const visLeft = cx - width / 2 / scale;
  const visRight = cx + width / 2 / scale;
  const visBottom = cy - HEIGHT / 2 / scale;
  const visTop = cy + HEIGHT / 2 / scale;
  const gridStep = niceStep(40 / scale);
  const labelStep = gridStep * 2;

  const handlePlaneClick = (e: React.MouseEvent<SVGRectElement>) => {
    const p = clientToWorld(e.clientX, e.clientY);
    if (!p) return;
    if (onAppend(p.x, p.y)) setSelected(waypoints.length);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>, index: number) => {
    suppressClickRef.current = false;
    setDragPos(null);
    if (e.button !== 0) return;
    e.stopPropagation();
    containerRef.current?.focus();
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const wp = waypoints[index];
    dragRef.current = { index, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, x: wp.x, y: wp.y };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
    const p = clientToWorld(e.clientX, e.clientY);
    if (!p) return;
    drag.moved = true;
    drag.x = p.x;
    drag.y = p.y;
    setDragPos({ index: drag.index, x: p.x, y: p.y, baseKey: waypointsKey });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return; // A plain click: handled by onClick
    suppressClickRef.current = true;
    setSelected(drag.index);
    const wp = waypoints[drag.index];
    if (wp && wp.x === drag.x && wp.y === drag.y) {
      setDragPos(null);
      return;
    }
    if (!onMove(drag.index, drag.x, drag.y)) setDragPos(null); // Rejected: back to the stored position
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setDragPos(null);
  };

  const handlePointClick = (e: React.MouseEvent<SVGGElement>, index: number) => {
    e.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelected(index);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndex !== null) {
      e.preventDefault();
      onDelete(selectedIndex);
      setSelected(null);
    }
  };

  const n = displayWaypoints.length;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative w-full rounded-md border border-[var(--c-br2)] overflow-hidden select-none outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/60"
      style={{ height: HEIGHT }}
    >
      <svg
        ref={svgRef}
        data-testid="waypoint-canvas"
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="block"
      >
        {/* Background: the clickable plane */}
        <rect
          data-testid="waypoint-plane"
          x={0}
          y={0}
          width={width}
          height={HEIGHT}
          fill="#0f172a"
          className="cursor-crosshair"
          onClick={handlePlaneClick}
        />

        {/* Grid, origin axes and labels */}
        <g pointerEvents="none">
          {gridValues(visLeft, visRight, gridStep).map((v) => (
            <line key={`gx${v}`} x1={toX(v)} y1={0} x2={toX(v)} y2={HEIGHT} stroke="#1e293b" strokeWidth={1} />
          ))}
          {gridValues(visBottom, visTop, gridStep).map((v) => (
            <line key={`gy${v}`} x1={0} y1={toY(v)} x2={width} y2={toY(v)} stroke="#1e293b" strokeWidth={1} />
          ))}
          {visBottom <= 0 && visTop >= 0 && (
            <line x1={0} y1={toY(0)} x2={width} y2={toY(0)} stroke="#ef4444" strokeWidth={1.5} />
          )}
          {visLeft <= 0 && visRight >= 0 && (
            <line x1={toX(0)} y1={0} x2={toX(0)} y2={HEIGHT} stroke="#22c55e" strokeWidth={1.5} />
          )}
          {gridValues(visLeft, visRight, labelStep).map((v) => (
            <text key={`lx${v}`} x={toX(v) - 8} y={HEIGHT - 6} fill="#94a3b8" fontSize={9} fontFamily="monospace">{v}</text>
          ))}
          {gridValues(visBottom, visTop, labelStep).map((v) => (
            <text key={`ly${v}`} x={4} y={toY(v) + 3} fill="#94a3b8" fontSize={9} fontFamily="monospace">{v}</text>
          ))}
        </g>

        {/* Region: the bounds box (dashed) and the polygon when there is one */}
        <g pointerEvents="none">
          <rect
            x={toX(regionMin.x)}
            y={toY(regionMax.y)}
            width={Math.max(0, toX(regionMax.x) - toX(regionMin.x))}
            height={Math.max(0, toY(regionMin.y) - toY(regionMax.y))}
            fill={hasPolygon ? 'none' : 'rgba(6, 182, 212, 0.08)'}
            stroke="rgba(148, 163, 184, 0.5)"
            strokeDasharray="4 4"
          />
          {hasPolygon && (
            <polygon points={toPathPoints(polygon, project)} fill="rgba(6, 182, 212, 0.12)" stroke="#06b6d4" strokeWidth={2} />
          )}
          {obstacles
            .filter((obs) => obs.enabled && obs.points && obs.points.length > 0)
            .map((obs) =>
              obs.type === 'WALL_SEGMENT' ? (
                <polyline
                  key={obs.id}
                  points={toPathPoints(obs.points, project)}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth={3}
                  strokeDasharray="4 2"
                />
              ) : (
                <polygon
                  key={obs.id}
                  points={toPathPoints(obs.points, project)}
                  fill="rgba(244, 63, 94, 0.22)"
                  stroke="#f43f5e"
                  strokeWidth={1.5}
                />
              )
            )}
        </g>

        {/* Path: segments in order, and the dashed closing segment when the path loops */}
        <g pointerEvents="none">
          {n >= 2 && (
            <polyline points={toPathPoints(displayWaypoints, project)} fill="none" stroke="#22d3ee" strokeWidth={2.5} />
          )}
          {loopPath && n >= 3 && (
            <line
              data-testid="waypoint-closing-segment"
              x1={toX(displayWaypoints[n - 1].x)}
              y1={toY(displayWaypoints[n - 1].y)}
              x2={toX(displayWaypoints[0].x)}
              y2={toY(displayWaypoints[0].y)}
              stroke="#22d3ee"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={0.7}
            />
          )}
        </g>

        {/* Numbered waypoints */}
        {displayWaypoints.map((wp, i) => {
          const isSelected = selectedIndex === i;
          return (
            <g
              key={i}
              data-testid={`waypoint-${i}`}
              transform={`translate(${toX(wp.x)}, ${toY(wp.y)})`}
              className={activeDrag?.index === i ? 'cursor-grabbing' : 'cursor-grab'}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => handlePointerDown(e, i)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onClick={(e) => handlePointClick(e, i)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(i);
                setSelected(null);
              }}
            >
              {/* Transparent hit area around the dot */}
              <circle r={11} fill="transparent" />
              <circle
                r={isSelected ? 8 : 7}
                fill={isSelected ? '#22d3ee' : '#0f172a'}
                stroke={isSelected ? '#ffffff' : '#22d3ee'}
                strokeWidth={1.5}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8}
                fontWeight={700}
                fontFamily="monospace"
                fill={isSelected ? '#0f172a' : '#a5f3fc'}
                pointerEvents="none"
              >
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {waypoints.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-300">Click on the plane to add the first waypoint</p>
        </div>
      ) : (
        <div className="absolute top-2 right-2 max-w-[calc(100%-1rem)] truncate px-2 py-0.5 rounded bg-[var(--c-bg1)]/85 border border-[var(--c-br2)] text-[10px] text-[var(--c-tx3)] pointer-events-none">
          Click to add · Drag to move · Right-click or Delete to remove
        </div>
      )}
    </div>
  );
};
