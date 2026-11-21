import type { Shape3DType } from '../../../../types';
import type { CanvasPalette } from './canvasPalette';

/** Pure projection, hit testing and drawing helpers of the 3D boundary editor (Isometric3DBoundaryEditor). */

export interface XY {
  x: number;
  y: number;
}

/** Projects a world point (x, y, z) onto the canvas. */
export type ProjectFn = (x: number, y: number, z: number) => XY;

export type HandleType = 'corner' | 'radius' | 'height' | null;

/** Numeric inputs of the side panel; each keeps its own text while it is being typed. */
export type FieldKey = 'width' | 'length' | 'radius' | 'height' | 'elev';

/** Camera of the 3D view. */
export interface IsometricCamera {
  /** Z drawn at the canvas centre (the shape's vertical midpoint). */
  centerZ: number;
  rotX: number;
  rotY: number;
  zoom: number;
  pan: XY;
  width: number;
  height: number;
}

/** Current dimensions of the 3D shape. */
export interface ShapeDimensions {
  width: number;
  length: number;
  height: number;
  radius: number;
  elev: number;
}

export interface ShapeHandles {
  cornerHandle: XY | null;
  radiusHandle: XY | null;
  heightHandle: XY | null;
}

const HANDLE_HIT_PX = 12;

/** 3D projection (inverted Z: +Z goes up on the canvas, centred at the shape's centroid). */
export const projectIsometric = (x: number, y: number, z: number, camera: IsometricCamera): XY => {
  const nx = (x / 200) * 2;
  const ny = (y / 200) * 2;
  const nz = -(((z - camera.centerZ) / 300) * 2);

  const cosY = Math.cos(camera.rotY), sinY = Math.sin(camera.rotY);
  const cosX = Math.cos(camera.rotX), sinX = Math.sin(camera.rotX);

  const rx = nx * cosY - ny * sinY;
  const ry = nx * sinY * sinX + ny * cosY * sinX + nz * cosX;

  const scale = Math.min(camera.width, camera.height) / 3.0;
  const px = camera.width / 2 + rx * scale * camera.zoom + camera.pan.x;
  const py = camera.height / 2 + ry * (scale * 0.7) * camera.zoom + camera.pan.y;
  return { x: px, y: py };
};

/** Canvas position of the handles a shape has: corner (cube, pyramid), radius (cone, sphere), height (all but the sphere). */
export const shapeHandles = (shape: Shape3DType, dims: ShapeDimensions, project: ProjectFn): ShapeHandles => {
  if (shape === 'cube' || shape === 'pyramid') {
    return {
      cornerHandle: project(dims.width / 2, dims.length / 2, dims.elev),
      radiusHandle: null,
      heightHandle: project(0, 0, dims.elev + dims.height),
    };
  }
  if (shape === 'cone') {
    return {
      cornerHandle: null,
      radiusHandle: project(dims.radius, 0, dims.elev),
      heightHandle: project(0, 0, dims.elev + dims.height),
    };
  }
  if (shape === 'sphere') {
    return { cornerHandle: null, radiusHandle: project(dims.radius, 0, dims.elev + dims.radius), heightHandle: null };
  }
  return { cornerHandle: null, radiusHandle: null, heightHandle: null };
};

const isNear = (handle: XY | null, x: number, y: number) => handle !== null && Math.hypot(x - handle.x, y - handle.y) < HANDLE_HIT_PX;

/** Handle under the canvas point (x, y), checked in corner, radius, height order. */
export const handleAt = (handles: ShapeHandles, x: number, y: number): HandleType => {
  if (isNear(handles.cornerHandle, x, y)) return 'corner';
  if (isNear(handles.radiusHandle, x, y)) return 'radius';
  if (isNear(handles.heightHandle, x, y)) return 'height';
  return null;
};

/**
 * Scale factor from the cursor movement (dx, dy) along the screen direction centre → handle, so
 * the handle follows the cursor whatever the camera rotation.
 */
export const growFactor = (handle: XY, center: XY, dx: number, dy: number) => {
  const vx = handle.x - center.x;
  const vy = handle.y - center.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-3) return 1;
  return Math.max(0, (len + (dx * vx + dy * vy) / len) / len);
};

/** Height change for a vertical cursor movement `dy`, using the screen pixels per Z unit of the projection. */
export const heightDragDelta = (dy: number, camera: Pick<IsometricCamera, 'rotX' | 'zoom' | 'width' | 'height'>) => {
  const pxPerZ = (2 / 300) * Math.cos(camera.rotX) * (Math.min(camera.width, camera.height) / 3.0) * 0.7 * camera.zoom;
  return pxPerZ > 1e-3 ? -dy / pxPerZ : -dy * 1.2;
};

/**
 * Number typed in a side panel field, or null when it must be ignored (blank or not finite).
 * Width, length and radius are at least 1; height and base elevation can be any number.
 */
export const parseFieldValue = (key: FieldKey, raw: string | undefined): number | null => {
  if (raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return key === 'width' || key === 'length' || key === 'radius' ? Math.max(1, parsed) : parsed;
};

/** Colour of a handle in its dragging, hovered or idle state. */
export const handleColor = (isDragging: boolean, isHovered: boolean, colors: { dragging: string; hovered: string; idle: string }) => {
  if (isDragging) return colors.dragging;
  return isHovered ? colors.hovered : colors.idle;
};

// --- Drawing ---

/** Background and the grid mesh on the ground plane, with its X labels. */
export const drawGroundGrid = (
  ctx: CanvasRenderingContext2D,
  project: ProjectFn,
  view: { width: number; height: number; zoom: number; elev: number },
  palette: CanvasPalette
) => {
  ctx.clearRect(0, 0, view.width, view.height);

  ctx.fillStyle = palette.deepBackground;
  ctx.fillRect(0, 0, view.width, view.height);

  const gridExtent = Math.max(200, Math.ceil(300 / Math.max(0.4, view.zoom)));
  const step = 50;

  ctx.strokeStyle = palette.grid3D;
  ctx.lineWidth = 1;

  for (let gx = -gridExtent; gx <= gridExtent; gx += step) {
    const p1 = project(gx, -gridExtent, view.elev);
    const p2 = project(gx, gridExtent, view.elev);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    if (gx >= -150 && gx <= 150) {
      ctx.font = '8px monospace';
      ctx.fillStyle = palette.gridLabel3D;
      ctx.fillText(`${gx}`, p1.x + 2, p1.y + 8);
    }
  }

  for (let gy = -gridExtent; gy <= gridExtent; gy += step) {
    const p1 = project(-gridExtent, gy, view.elev);
    const p2 = project(gridExtent, gy, view.elev);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
};

const strokeLine = (ctx: CanvasRenderingContext2D, from: XY, to: XY, color: string) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
};

/** X, Y and +Z axes from the origin of the base plane, with their names. */
export const drawAxes = (ctx: CanvasRenderingContext2D, project: ProjectFn, elev: number, palette: CanvasPalette) => {
  const origin = project(0, 0, elev);
  const xAxis = project(100, 0, elev);
  const yAxis = project(0, 100, elev);
  const zAxis = project(0, 0, elev + 100);

  strokeLine(ctx, origin, xAxis, palette.axisX);
  strokeLine(ctx, origin, yAxis, palette.axisY);
  // Z axis (+Z upwards)
  strokeLine(ctx, origin, zAxis, palette.axisZ);

  ctx.font = '9px monospace';
  ctx.fillStyle = palette.axisX;
  ctx.fillText('X', xAxis.x + 4, xAxis.y);
  ctx.fillStyle = palette.axisY;
  ctx.fillText('Y', yAxis.x + 4, yAxis.y);
  ctx.fillStyle = palette.axisZ;
  ctx.fillText('+Z', zAxis.x + 4, zAxis.y);
};

/** Fills the quadrilateral a-b-c-d with `fillStyle`. */
const fillQuad = (ctx: CanvasRenderingContext2D, quad: [XY, XY, XY, XY], fillStyle: string) => {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  ctx.lineTo(quad[1].x, quad[1].y);
  ctx.lineTo(quad[2].x, quad[2].y);
  ctx.lineTo(quad[3].x, quad[3].y);
  ctx.closePath();
  ctx.fill();
};

/** Strokes the outline of the quadrilateral a-b-c-d. */
const strokeQuad = (ctx: CanvasRenderingContext2D, quad: [XY, XY, XY, XY]) => {
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  ctx.lineTo(quad[1].x, quad[1].y);
  ctx.lineTo(quad[2].x, quad[2].y);
  ctx.lineTo(quad[3].x, quad[3].y);
  ctx.closePath();
  ctx.stroke();
};

/** The four corners of the w × l rectangle centred at the origin, at height z. */
const rectangleAt = (project: ProjectFn, hw: number, hl: number, z: number): [XY, XY, XY, XY] => [
  project(-hw, -hl, z),
  project(hw, -hl, z),
  project(hw, hl, z),
  project(-hw, hl, z),
];

/** `count` points of the circle of radius r centred on the Z axis at height z. */
const circleAt = (project: ProjectFn, r: number, z: number, count: number): XY[] => {
  const points: XY[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    points.push(project(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  return points;
};

const strokeClosedPath = (ctx: CanvasRenderingContext2D, points: XY[]) => {
  ctx.beginPath();
  points.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();
};

const drawCube = (ctx: CanvasRenderingContext2D, project: ProjectFn, dims: ShapeDimensions) => {
  const hw = dims.width / 2;
  const hl = dims.length / 2;
  const base = rectangleAt(project, hw, hl, dims.elev);
  const top = rectangleAt(project, hw, hl, dims.elev + dims.height);

  fillQuad(ctx, base, 'rgba(139, 92, 246, 0.15)');
  fillQuad(ctx, top, 'rgba(139, 92, 246, 0.25)');

  // Side edges & faces
  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 1.5;
  strokeQuad(ctx, base);
  strokeQuad(ctx, top);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(base[i].x, base[i].y);
    ctx.lineTo(top[i].x, top[i].y);
  }
  ctx.stroke();
};

const drawPyramid = (ctx: CanvasRenderingContext2D, project: ProjectFn, dims: ShapeDimensions) => {
  const base = rectangleAt(project, dims.width / 2, dims.length / 2, dims.elev);
  const apex = project(0, 0, dims.elev + dims.height);

  fillQuad(ctx, base, 'rgba(16, 185, 129, 0.15)');

  // Side triangular faces
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = base[i];
    const b = base[(i + 1) % 4];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(apex.x, apex.y);
    ctx.closePath();
    ctx.stroke();
  }
};

const drawCone = (ctx: CanvasRenderingContext2D, project: ProjectFn, dims: ShapeDimensions) => {
  const basePts = circleAt(project, dims.radius, dims.elev, 16);
  const apex = project(0, 0, dims.elev + dims.height);

  // Base circle wireframe
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  strokeClosedPath(ctx, basePts);

  // Cone rays to apex
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
  [0, 4, 8, 12].forEach((idx) => {
    ctx.beginPath();
    ctx.moveTo(basePts[idx].x, basePts[idx].y);
    ctx.lineTo(apex.x, apex.y);
    ctx.stroke();
  });
};

const drawSphere = (ctx: CanvasRenderingContext2D, project: ProjectFn, dims: ShapeDimensions) => {
  const centerZ = dims.elev + dims.radius;
  const c = project(0, 0, centerZ);

  // Equator & meridian rings
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 1.5;
  strokeClosedPath(ctx, circleAt(project, dims.radius, centerZ, 16));

  // Outer radius circle
  const radP = project(dims.radius, 0, centerZ);
  const rPx = Math.hypot(radP.x - c.x, radP.y - c.y);

  ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(236, 72, 153, 0.1)';
  ctx.fill();
};

const SHAPE_DRAWERS: Record<Shape3DType, (ctx: CanvasRenderingContext2D, project: ProjectFn, dims: ShapeDimensions) => void> = {
  cube: drawCube,
  pyramid: drawPyramid,
  cone: drawCone,
  sphere: drawSphere,
};

/** Wireframe of the 3D shape (nothing for an unknown shape). */
export const drawShape = (ctx: CanvasRenderingContext2D, project: ProjectFn, shape: Shape3DType, dims: ShapeDimensions) => {
  SHAPE_DRAWERS[shape]?.(ctx, project, dims);
};

/** A round handle, bigger while hovered or dragged. */
const drawHandleDot = (ctx: CanvasRenderingContext2D, p: XY, isHovered: boolean, isDragging: boolean, colors: { dragging: string; hovered: string; idle: string }) => {
  ctx.fillStyle = handleColor(isDragging, isHovered, colors);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, isHovered || isDragging ? 7 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

const drawHandleLabel = (ctx: CanvasRenderingContext2D, p: XY, color: string, text: string) => {
  ctx.font = '10px sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(text, p.x + 10, p.y - 4);
};

/** Corner, radius and height handles, with their value next to the hovered or dragged one. */
export const drawHandles = (
  ctx: CanvasRenderingContext2D,
  project: ProjectFn,
  handles: ShapeHandles,
  state: { hovered: HandleType; dragging: HandleType; dims: ShapeDimensions },
  palette: CanvasPalette
) => {
  const { dims } = state;
  const isActive = (handle: HandleType) => state.hovered === handle || state.dragging === handle;

  // Corner handle (Cube / Pyramid)
  if (handles.cornerHandle) {
    const p = handles.cornerHandle;
    drawHandleDot(ctx, p, state.hovered === 'corner', state.dragging === 'corner', { dragging: '#facc15', hovered: '#fbbf24', idle: '#eab308' });
    if (isActive('corner')) drawHandleLabel(ctx, p, palette.cornerLabel, `Base: ${dims.width.toFixed(0)} × ${dims.length.toFixed(0)}`);
  }

  // Radius handle (Cone / Sphere)
  if (handles.radiusHandle) {
    const p = handles.radiusHandle;
    drawHandleDot(ctx, p, state.hovered === 'radius', state.dragging === 'radius', { dragging: '#38bdf8', hovered: '#60a5fa', idle: '#3b82f6' });
    if (isActive('radius')) drawHandleLabel(ctx, p, palette.radiusLabel, `Radius: ${dims.radius.toFixed(0)}`);
  }

  // Perpendicular Height Top Arrow handle (Cube / Pyramid / Cone)
  if (handles.heightHandle) {
    const p = handles.heightHandle;
    const baseCenter = project(0, 0, dims.elev);
    ctx.strokeStyle = isActive('height') ? '#c084fc' : '#a855f7';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(baseCenter.x, baseCenter.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);

    drawHandleDot(ctx, p, state.hovered === 'height', state.dragging === 'height', { dragging: '#e879f9', hovered: '#d8b4fe', idle: '#c084fc' });
    if (isActive('height')) drawHandleLabel(ctx, p, palette.heightLabel, `Height: ${dims.height.toFixed(0)}`);
  }
};

/** Mode hint in the top-left corner. */
export const drawStatusText = (ctx: CanvasRenderingContext2D, orbitView: boolean, palette: CanvasPalette) => {
  ctx.font = '10px sans-serif';
  ctx.fillStyle = orbitView ? palette.orbitStatusText : palette.statusText;
  ctx.fillText(orbitView ? 'Orbit View Active: Drag canvas to rotate camera' : 'Handle Edit Mode: Drag corner/top handle', 10, 16);
};
