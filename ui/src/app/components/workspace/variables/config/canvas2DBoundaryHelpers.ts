import type { BoundaryObstacle, Point3DCoord } from '../../../../types';
import { niceStep } from '../../../../core/worldWindow';
import type { CanvasPalette } from './canvasPalette';

/** Pure geometry, hit testing and drawing helpers of the 2D boundary editor (Canvas2DBoundaryEditor). */

export interface XY {
  x: number;
  y: number;
}

/** Which kind of shape the 2D editor moves. */
export type EditMode = 'BOUNDARIES' | 'OBSTACLES';

/** Element under the pointer that a press would grab. */
export type HitTarget =
  | { kind: 'boundary'; index: number }
  | { kind: 'obstacleVertex'; obsIndex: number; pointIndex: number }
  | { kind: 'obstacleShape'; obsIndex: number };

/** Active pointer gesture. Vertex drags keep the offset between the vertex and the pointer so it does not jump. */
export type DragState =
  | { kind: 'boundary'; index: number; offset: XY }
  | { kind: 'obstacleVertex'; obsIndex: number; pointIndex: number; offset: XY }
  | { kind: 'obstacleShape'; obsIndex: number; startMouse: XY; startPoints: Point3DCoord[] }
  | { kind: 'pan'; start: XY };

/** What a right click targets: a vertex or an edge of the region or of an obstacle. */
export interface ContextMenuTarget {
  type: 'boundary_vertex' | 'boundary_edge' | 'obstacle_vertex' | 'obstacle_edge';
  boundaryIndex?: number;
  obstacleIndex?: number;
  obstaclePointIndex?: number;
}

/** World-to-canvas transform of the editor, with the canvas size and its scale. */
export interface CanvasView {
  width: number;
  height: number;
  pxPerUnit: number;
  toCanvasX: (value: number) => number;
  toCanvasY: (value: number) => number;
  fromCanvasX: (px: number) => number;
  fromCanvasY: (py: number) => number;
}

export const VERTEX_HIT_PX = 18;
export const SEGMENT_HIT_PX = 14;
export const EDGE_MENU_HIT_PX = 10;

/** Ray-casting test of a point against a polygon (world coordinates). */
export const isPointInsidePolygon = (px: number, py: number, poly: Point3DCoord[]) => {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x ?? 0, yi = poly[i].y ?? 0;
    const xj = poly[j].x ?? 0, yj = poly[j].y ?? 0;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
};

/** Distance from a point to the segment (x1, y1)-(x2, y2). */
export const pointToSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
};

/** Decimals worth keeping for a value whose resolution is `unit` (e.g. 0.2 → 1 decimal, 5 → 0). */
export const decimalsFor = (unit: number) => (unit > 0 ? Math.min(6, Math.max(0, Math.ceil(-Math.log10(unit)))) : 1);

export const roundTo = (value: number, decimals: number) => Number(value.toFixed(decimals));

export const sameHitTarget = (a: HitTarget | null, b: HitTarget | null) => JSON.stringify(a) === JSON.stringify(b);

/** Fill colour and radius of a boundary vertex handle. */
export const boundaryHandleStyle = (isDragging: boolean, isHovered: boolean, editingBoundaries: boolean) => {
  if (isDragging) return { fill: '#f472b6', radius: 9 };
  if (isHovered) return { fill: '#ffffff', radius: 9 };
  return editingBoundaries ? { fill: '#e9d5ff', radius: 6 } : { fill: '#a855f7', radius: 4 };
};

/** Fill, radius, stroke colour and stroke width of an obstacle vertex handle. */
export const obstacleHandleStyle = (isDragging: boolean, isHovered: boolean, isSelected: boolean, selectionColor: string) => {
  if (isDragging) return { fill: '#fef08a', radius: 9, stroke: '#ca8a04', lineWidth: 2.5 };
  if (isHovered) return { fill: '#ffffff', radius: 9, stroke: '#f59e0b', lineWidth: 2.5 };
  if (isSelected) return { fill: selectionColor, radius: 7, stroke: '#78350f', lineWidth: 2 };
  return { fill: '#f87171', radius: 5, stroke: '#991b1b', lineWidth: 1.5 };
};

/** Drag and hover flags the renderer and the cursor need, split by the kind of element. */
export const interactionFlags = (drag: DragState | null, hovered: HitTarget | null) => ({
  draggingBoundaryVertexIndex: drag?.kind === 'boundary' ? drag.index : null,
  draggingObstacleTarget: drag?.kind === 'obstacleVertex' ? drag : null,
  draggingObstacleShapeIndex: drag?.kind === 'obstacleShape' ? drag.obsIndex : null,
  hoveredBoundaryVertexIndex: hovered?.kind === 'boundary' ? hovered.index : null,
  hoveredObstacleTarget: hovered?.kind === 'obstacleVertex' ? hovered : null,
  hoveredObstacleShape: hovered?.kind === 'obstacleShape' ? hovered.obsIndex : null,
});

/** Canvas cursor: grabbing while dragging, grab over a vertex, pointer over an obstacle, crosshair otherwise. */
export const canvasCursorFor = (drag: DragState | null, hovered: HitTarget | null) => {
  if (drag !== null) return 'grabbing';
  if (hovered?.kind === 'obstacleVertex' || hovered?.kind === 'boundary') return 'grab';
  if (hovered?.kind === 'obstacleShape') return 'pointer';
  return 'crosshair';
};

/** Vertices of a preset shape centred at (cx, cy) with half sizes (rx, ry), rounded with `round`. */
export const presetShapePoints = (
  shape: 'square' | 'triangle' | 'circle',
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  round: (v: number) => number
): Point3DCoord[] => {
  if (shape === 'square') {
    return [
      { x: round(cx - rx), y: round(cy - ry) },
      { x: round(cx + rx), y: round(cy - ry) },
      { x: round(cx + rx), y: round(cy + ry) },
      { x: round(cx - rx), y: round(cy + ry) },
    ];
  }
  if (shape === 'triangle') {
    return [
      { x: round(cx), y: round(cy + ry) },
      { x: round(cx + rx), y: round(cy - ry) },
      { x: round(cx - rx), y: round(cy - ry) },
    ];
  }
  const numPts = 12;
  const points: Point3DCoord[] = [];
  for (let i = 0; i < numPts; i++) {
    const angle = (i * 2 * Math.PI) / numPts;
    points.push({ x: round(cx + rx * Math.cos(angle)), y: round(cy + ry * Math.sin(angle)) });
  }
  return points;
};

// --- Hit testing (canvas pixel coordinates) ---

/** Pixel distance from (mx, my) to the drawn segment a-b. */
const segmentDistancePx = (view: CanvasView, mx: number, my: number, a: Point3DCoord, b: Point3DCoord) =>
  pointToSegmentDistance(mx, my, view.toCanvasX(a.x ?? 0), view.toCanvasY(a.y ?? 0), view.toCanvasX(b.x ?? 0), view.toCanvasY(b.y ?? 0));

/** Index of the point nearest to (mx, my) within `radius` pixels, or null. */
export const nearestPointIndex = (points: Point3DCoord[], view: CanvasView, mx: number, my: number, radius: number): number | null => {
  let found: { index: number; dist: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    const dist = Math.hypot(mx - view.toCanvasX(points[i].x ?? 0), my - view.toCanvasY(points[i].y ?? 0));
    if (dist < radius && (found === null || dist < found.dist)) found = { index: i, dist };
  }
  return found ? found.index : null;
};

/** Nearest vertex of an enabled obstacle within `radius` pixels, or null. */
export const nearestObstacleVertex = (
  obstacles: BoundaryObstacle[],
  view: CanvasView,
  mx: number,
  my: number,
  radius: number
): { obsIndex: number; pointIndex: number } | null => {
  let found: { obsIndex: number; pointIndex: number; dist: number } | null = null;
  for (let o = 0; o < obstacles.length; o++) {
    const obs = obstacles[o];
    if (!obs.enabled || !obs.points) continue;
    for (let p = 0; p < obs.points.length; p++) {
      const dist = Math.hypot(mx - view.toCanvasX(obs.points[p].x ?? 0), my - view.toCanvasY(obs.points[p].y ?? 0));
      if (dist < radius && (found === null || dist < found.dist)) found = { obsIndex: o, pointIndex: p, dist };
    }
  }
  return found ? { obsIndex: found.obsIndex, pointIndex: found.pointIndex } : null;
};

/**
 * How far the pointer is from grabbing an obstacle as a whole: the pixel distance to a wall line
 * (Infinity beyond the hit width), 0 inside an obstacle polygon, Infinity otherwise.
 */
const obstacleShapeDistance = (obs: BoundaryObstacle, view: CanvasView, mx: number, my: number): number => {
  const pts = obs.points;
  if (obs.type === 'WALL_SEGMENT' && pts.length >= 2) {
    let dist = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      dist = Math.min(dist, segmentDistancePx(view, mx, my, pts[i], pts[i + 1]));
    }
    return dist >= SEGMENT_HIT_PX ? Infinity : dist;
  }
  if (obs.type === 'OBSTACLE_POLYGON' && pts.length >= 3 && isPointInsidePolygon(view.fromCanvasX(mx), view.fromCanvasY(my), pts)) {
    return 0;
  }
  return Infinity;
};

/** Obstacle whose wall line is nearest or whose interior contains the pointer (topmost wins on ties). */
export const obstacleShapeAt = (obstacles: BoundaryObstacle[], view: CanvasView, mx: number, my: number): number | null => {
  let found: { obsIndex: number; dist: number } | null = null;
  for (let o = 0; o < obstacles.length; o++) {
    const obs = obstacles[o];
    if (!obs.enabled || !obs.points) continue;
    const dist = obstacleShapeDistance(obs, view, mx, my);
    if (dist !== Infinity && (found === null || dist <= found.dist)) found = { obsIndex: o, dist };
  }
  return found ? found.obsIndex : null;
};

/** Number of edges of an enabled obstacle: an open wall line or a closed polygon; 0 when it has too few points. */
const obstacleEdgeCount = (obs: BoundaryObstacle): number => {
  if (!obs.enabled || !obs.points) return 0;
  const n = obs.points.length;
  if (obs.type === 'WALL_SEGMENT') return n < 2 ? 0 : n - 1;
  return n < 3 ? 0 : n;
};

/** Nearest obstacle edge within the context menu reach, or null. */
export const nearestObstacleEdge = (
  obstacles: BoundaryObstacle[],
  view: CanvasView,
  mx: number,
  my: number
): { obstacleIndex: number; edgeIndex: number; dist: number } | null => {
  let found: { obstacleIndex: number; edgeIndex: number; dist: number } | null = null;
  for (let oIdx = 0; oIdx < obstacles.length; oIdx++) {
    const pts = obstacles[oIdx].points;
    const edgeCount = obstacleEdgeCount(obstacles[oIdx]);
    for (let i = 0; i < edgeCount; i++) {
      const dist = segmentDistancePx(view, mx, my, pts[i], pts[(i + 1) % pts.length]);
      if (dist < EDGE_MENU_HIT_PX && (found === null || dist < found.dist)) found = { obstacleIndex: oIdx, edgeIndex: i, dist };
    }
  }
  return found;
};

/** Nearest edge of the closed region polygon within the context menu reach, or null. */
export const nearestPolygonEdge = (polygon: Point3DCoord[], view: CanvasView, mx: number, my: number): { edgeIndex: number; dist: number } | null => {
  let found: { edgeIndex: number; dist: number } | null = null;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const dist = segmentDistancePx(view, mx, my, polygon[i], polygon[(i + 1) % n]);
    if (dist < EDGE_MENU_HIT_PX && (found === null || dist < found.dist)) found = { edgeIndex: i, dist };
  }
  return found;
};

/** Vertex a right click targets: in BOUNDARIES mode region vertices win over obstacle vertices. */
export const vertexMenuTarget = (
  editMode: EditMode,
  boundaryVertex: number | null,
  obstacleVertex: { obsIndex: number; pointIndex: number } | null
): ContextMenuTarget | null => {
  if (editMode === 'BOUNDARIES' && boundaryVertex !== null) return { type: 'boundary_vertex', boundaryIndex: boundaryVertex };
  if (obstacleVertex) return { type: 'obstacle_vertex', obstacleIndex: obstacleVertex.obsIndex, obstaclePointIndex: obstacleVertex.pointIndex };
  if (boundaryVertex !== null) return { type: 'boundary_vertex', boundaryIndex: boundaryVertex };
  return null;
};

/** Edge a right click targets: the nearest one; on a tie, the kind being edited wins. */
export const edgeMenuTarget = (
  editMode: EditMode,
  boundaryEdge: { edgeIndex: number; dist: number } | null,
  obstacleEdge: { obstacleIndex: number; edgeIndex: number; dist: number } | null
): ContextMenuTarget | null => {
  const preferBoundary =
    boundaryEdge !== null &&
    (obstacleEdge === null ||
      boundaryEdge.dist < obstacleEdge.dist ||
      (boundaryEdge.dist === obstacleEdge.dist && editMode === 'BOUNDARIES'));
  if (preferBoundary && boundaryEdge) return { type: 'boundary_edge', boundaryIndex: boundaryEdge.edgeIndex };
  if (obstacleEdge) return { type: 'obstacle_edge', obstacleIndex: obstacleEdge.obstacleIndex, obstaclePointIndex: obstacleEdge.edgeIndex };
  return null;
};

// --- Drawing ---

/** Moves to the first point and draws lines through the others (the path is not closed). */
const tracePath = (ctx: CanvasRenderingContext2D, view: CanvasView, points: Point3DCoord[]) => {
  points.forEach((pt, idx) => {
    const cx = view.toCanvasX(pt.x ?? 0);
    const cy = view.toCanvasY(pt.y ?? 0);
    if (idx === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
};

/** Strokes an open path through the points with the given style. */
const strokePath = (ctx: CanvasRenderingContext2D, view: CanvasView, points: Point3DCoord[], strokeStyle: string, lineWidth: number) => {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  tracePath(ctx, view, points);
  ctx.stroke();
};

/** "(x, y)" tooltip box above a hovered or dragged vertex. */
const drawCoordinateTooltip = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pt: Point3DCoord,
  box: { halfWidth: number; border: string },
  palette: CanvasPalette
) => {
  ctx.fillStyle = palette.tooltipBackground;
  ctx.beginPath();
  ctx.roundRect(cx - box.halfWidth, cy - 24, box.halfWidth * 2, 15, 3);
  ctx.fill();
  ctx.strokeStyle = box.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = palette.tooltipText;
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`(${pt.x}, ${pt.y})`, cx, cy - 13);
  ctx.textAlign = 'left';
};

/** Name badge of a selected obstacle: a box at (boxX, boxY) and the name centred at (textX, textY). */
const drawNameBadge = (
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number },
  text: { x: number; y: number; label: string },
  palette: CanvasPalette
) => {
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, 15, 3);
  ctx.fill();
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = palette.tooltipText;
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text.label, text.x, text.y);
  ctx.textAlign = 'left';
};

/** Background, grid lines with their scale labels, and the X / Y axes. */
export const drawGridAndAxes = (ctx: CanvasRenderingContext2D, view: CanvasView, palette: CanvasPalette) => {
  const { width, height } = view;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  // Grid lines with a "nice" step for the visible world area
  const visLeft = view.fromCanvasX(0);
  const visRight = view.fromCanvasX(width);
  const visBottom = view.fromCanvasY(height);
  const visTop = view.fromCanvasY(0);
  const step = niceStep((visRight - visLeft) / 8);
  const stepDecimals = decimalsFor(step);
  const labelEvery = step * view.pxPerUnit < 40 ? 2 : 1;

  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = palette.gridLabel;
  ctx.font = '9px monospace';
  for (let i = Math.ceil(visLeft / step); i * step <= visRight; i++) {
    const x = view.toCanvasX(i * step);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    if (i % labelEvery === 0) ctx.fillText(`${roundTo(i * step, stepDecimals)}`, x - 10, height - 5); // X scale
  }
  for (let i = Math.ceil(visBottom / step); i * step <= visTop; i++) {
    const y = view.toCanvasY(i * step);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    if (i % labelEvery === 0) ctx.fillText(`${roundTo(i * step, stepDecimals)}`, 4, y + 3); // Y scale
  }

  // Labeled X & Y Axes (Origin lines)
  const originX = view.toCanvasX(0);
  const originY = view.toCanvasY(0);

  ctx.strokeStyle = palette.axisX;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, originY);
  ctx.lineTo(width, originY);
  ctx.stroke();

  ctx.strokeStyle = palette.axisY;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(originX, 0);
  ctx.lineTo(originX, height);
  ctx.stroke();

  // Axis names stay inside the canvas even when the origin is off-screen
  ctx.font = '9px monospace';
  ctx.fillStyle = palette.axisX;
  ctx.fillText('X →', width - 20, Math.min(Math.max(originY - 4, 22), height - 16));
  ctx.fillStyle = palette.axisY;
  ctx.fillText('Y ↑', Math.min(Math.max(originX + 4, 30), width - 24), 24);
};

/** The region polygon with its vertex handles (nothing below 3 vertices). */
export const drawBoundaryPolygon = (
  ctx: CanvasRenderingContext2D,
  view: CanvasView,
  polygon: Point3DCoord[],
  state: { editMode: EditMode; hoveredIndex: number | null; draggingIndex: number | null },
  palette: CanvasPalette
) => {
  if (polygon.length < 3) return;
  const editingBoundaries = state.editMode === 'BOUNDARIES';
  ctx.beginPath();
  tracePath(ctx, view, polygon);
  ctx.closePath();

  ctx.fillStyle = editingBoundaries ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.1)';
  ctx.fill();

  ctx.strokeStyle = editingBoundaries ? '#c084fc' : '#8b5cf6';
  ctx.lineWidth = editingBoundaries ? 2.5 : 1.5;
  if (!editingBoundaries) ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  polygon.forEach((pt, i) => {
    const cx = view.toCanvasX(pt.x ?? 0);
    const cy = view.toCanvasY(pt.y ?? 0);
    const isHovered = state.hoveredIndex === i;
    const isDragging = state.draggingIndex === i;
    const active = isHovered || isDragging;

    const handle = boundaryHandleStyle(isDragging, isHovered, editingBoundaries);
    ctx.fillStyle = handle.fill;
    ctx.beginPath();
    ctx.arc(cx, cy, handle.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = active ? '#ec4899' : '#a855f7';
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.stroke();

    if (active) drawCoordinateTooltip(ctx, cx, cy, pt, { halfWidth: 32, border: '#c084fc' }, palette);
  });
};

/** How one obstacle is shown: selection, drag of the whole shape, and the dragged / hovered vertex. */
export interface ObstacleDrawState {
  editMode: EditMode;
  isSelected: boolean;
  isShapeDragging: boolean;
  draggingPointIndex: number | null;
  hoveredPointIndex: number | null;
}

/** Vertex handles of an obstacle (wall ends or polygon corners). */
const drawObstacleHandles = (ctx: CanvasRenderingContext2D, view: CanvasView, points: Point3DCoord[], state: ObstacleDrawState, palette: CanvasPalette) => {
  points.forEach((pt, ptIdx) => {
    const cx = view.toCanvasX(pt.x ?? 0);
    const cy = view.toCanvasY(pt.y ?? 0);
    const isDragging = state.draggingPointIndex === ptIdx;
    const isHovered = state.hoveredPointIndex === ptIdx;

    const handle = obstacleHandleStyle(isDragging, isHovered, state.isSelected, palette.selection);
    ctx.fillStyle = handle.fill;
    ctx.beginPath();
    ctx.arc(cx, cy, handle.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = handle.stroke;
    ctx.lineWidth = handle.lineWidth;
    ctx.stroke();

    if (state.isSelected || isHovered || isDragging) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isDragging || isHovered) drawCoordinateTooltip(ctx, cx, cy, pt, { halfWidth: 35, border: '#fbbf24' }, palette);
  });
};

/** A wall line: an amber line with a halo and a dashed outline when selected, a red line otherwise. */
const drawWall = (ctx: CanvasRenderingContext2D, view: CanvasView, obs: BoundaryObstacle, state: ObstacleDrawState, palette: CanvasPalette) => {
  if (state.isSelected) {
    strokePath(ctx, view, obs.points, 'rgba(251, 191, 36, 0.35)', 10);
    strokePath(ctx, view, obs.points, palette.selection, 4);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    tracePath(ctx, view, obs.points);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    strokePath(ctx, view, obs.points, '#ef4444', state.editMode === 'OBSTACLES' ? 3 : 2);
  }

  drawObstacleHandles(ctx, view, obs.points, state, palette);

  if (state.isSelected) {
    const midX = (view.toCanvasX(obs.points[0].x ?? 0) + view.toCanvasX(obs.points[1].x ?? 0)) / 2;
    const midY = (view.toCanvasY(obs.points[0].y ?? 0) + view.toCanvasY(obs.points[1].y ?? 0)) / 2;
    drawNameBadge(ctx, { x: midX - 35, y: midY - 20, width: 70 }, { x: midX, y: midY - 9, label: `${obs.name || 'Wall'}` }, palette);
  }
};

/** A forbidden zone: amber when selected or dragged, red otherwise, always with a dashed outline. */
const drawObstaclePolygon = (ctx: CanvasRenderingContext2D, view: CanvasView, obs: BoundaryObstacle, state: ObstacleDrawState, palette: CanvasPalette) => {
  ctx.beginPath();
  tracePath(ctx, view, obs.points);
  ctx.closePath();

  if (state.isSelected || state.isShapeDragging) {
    ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.fill();
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1;
  } else {
    ctx.fillStyle = state.editMode === 'OBSTACLES' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.5;
  }
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  drawObstacleHandles(ctx, view, obs.points, state, palette);

  if (state.isSelected) {
    const cxAvg = obs.points.reduce((acc, p) => acc + view.toCanvasX(p.x ?? 0), 0) / obs.points.length;
    const cyAvg = obs.points.reduce((acc, p) => acc + view.toCanvasY(p.y ?? 0), 0) / obs.points.length;
    drawNameBadge(ctx, { x: cxAvg - 40, y: cyAvg - 8, width: 80 }, { x: cxAvg, y: cyAvg + 3, label: `${obs.name || 'Zone'}` }, palette);
  }
};

/** An enabled obstacle: a wall line (2+ points) or a forbidden zone polygon (3+ points). */
export const drawObstacle = (ctx: CanvasRenderingContext2D, view: CanvasView, obs: BoundaryObstacle, state: ObstacleDrawState, palette: CanvasPalette) => {
  if (!obs.enabled || !obs.points || obs.points.length === 0) return;
  if (obs.type === 'WALL_SEGMENT' && obs.points.length >= 2) {
    drawWall(ctx, view, obs, state, palette);
  } else if (obs.type === 'OBSTACLE_POLYGON' && obs.points.length >= 3) {
    drawObstaclePolygon(ctx, view, obs, state, palette);
  }
};
