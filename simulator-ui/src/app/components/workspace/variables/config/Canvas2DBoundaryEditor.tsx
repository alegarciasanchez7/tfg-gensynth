import React, { useRef, useState, useEffect } from 'react';
import { Point3DCoord, BoundaryObstacle } from '../../../../types';
import { Button } from '../../../ui/button';
import { AlertTriangle, Move, ShieldAlert, Square, Triangle, Circle, RefreshCw } from 'lucide-react';
import { fitWorldWindow, niceStep, type WorldWindow } from '../../../../core/worldWindow';
import { useDialogEscape } from './useDialogEscape';

interface Canvas2DBoundaryEditorProps {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  polygon?: Point3DCoord[];
  obstacles?: BoundaryObstacle[];
  selectedObstacleId?: string | null;
  onSelectObstacle?: (id: string | null) => void;
  onChange: (bounds: { minX: number; maxX: number; minY: number; maxY: number; polygon?: Point3DCoord[]; obstacles?: BoundaryObstacle[] }) => void;
  width?: number;
  height?: number;
  fillContainer?: boolean;
  showToolbar?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'boundary_vertex' | 'boundary_edge' | 'obstacle_vertex' | 'obstacle_edge';
  boundaryIndex?: number;
  obstacleIndex?: number;
  obstaclePointIndex?: number;
  clickCoord: { x: number; y: number };
}

interface XY {
  x: number;
  y: number;
}

/** Element under the pointer that a press would grab. */
type HitTarget =
  | { kind: 'boundary'; index: number }
  | { kind: 'obstacleVertex'; obsIndex: number; pointIndex: number }
  | { kind: 'obstacleShape'; obsIndex: number };

/** Active pointer gesture. Vertex drags keep the offset between the vertex and the pointer so it does not jump. */
type DragState =
  | { kind: 'boundary'; index: number; offset: XY }
  | { kind: 'obstacleVertex'; obsIndex: number; pointIndex: number; offset: XY }
  | { kind: 'obstacleShape'; obsIndex: number; startMouse: XY; startPoints: Point3DCoord[] }
  | { kind: 'pan'; start: XY };

const MARGIN = 25; // Margin for axes labels
const VERTEX_HIT_PX = 18;
const SEGMENT_HIT_PX = 14;
const EDGE_MENU_HIT_PX = 10;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 20;

// Ray-casting helper for obstacle polygon interior click detection
const isPointInsidePolygonHelper = (px: number, py: number, poly: Point3DCoord[]) => {
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

const pointToSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
};

/** Decimals worth keeping for a value whose resolution is `unit` (e.g. 0.2 → 1 decimal, 5 → 0). */
const decimalsFor = (unit: number) => (unit > 0 ? Math.min(6, Math.max(0, Math.ceil(-Math.log10(unit)))) : 1);

const roundTo = (value: number, decimals: number) => Number(value.toFixed(decimals));

const sameHitTarget = (a: HitTarget | null, b: HitTarget | null) => JSON.stringify(a) === JSON.stringify(b);

export const Canvas2DBoundaryEditor: React.FC<Canvas2DBoundaryEditorProps> = ({
  minX,
  maxX,
  minY,
  maxY,
  polygon = [],
  obstacles = [],
  selectedObstacleId,
  onSelectObstacle,
  onChange,
  width = 360,
  height = 200,
  fillContainer = false,
  showToolbar = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: width, h: height });

  // Selection mode: MOVE BOUNDARIES vs MOVE OBSTACLES
  const [editMode, setEditMode] = useState<'BOUNDARIES' | 'OBSTACLES'>('BOUNDARIES');

  // Obstacle selection state
  const [internalSelectedObsId, setInternalSelectedObsId] = useState<string | null>(null);
  const activeSelectedObsId = selectedObstacleId !== undefined ? selectedObstacleId : internalSelectedObsId;

  const handleSelectObstacle = (id: string | null) => {
    if (onSelectObstacle) {
      onSelectObstacle(id);
    } else {
      setInternalSelectedObsId(id);
    }
  };

  const [activePolygon, setActivePolygon] = useState<Point3DCoord[]>(
    polygon.length >= 3 ? polygon : [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]
  );

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hover & drag state. During a drag the edited geometry lives only here (activePolygon / dragObstacles)
  // and is committed through onChange once, on pointer-up.
  const [hovered, setHovered] = useState<HitTarget | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragObstacles, setDragObstacles] = useState<BoundaryObstacle[] | null>(null);
  const [frozenWorld, setFrozenWorld] = useState<WorldWindow | null>(null);
  const dragMovedRef = useRef(false);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuOpen = contextMenu !== null;
  // Any click (inside the editor or elsewhere on the page) closes the open context menu
  useEffect(() => {
    if (!contextMenuOpen) return;
    const closeMenu = () => setContextMenu(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [contextMenuOpen]);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  useDialogEscape(showResetConfirmModal, () => setShowResetConfirmModal(false));

  // Match the canvas pixel size to its on-screen size, so it is never stretched (blurry text and
  // lines): fill the container, or take its width and keep the width/height aspect ratio
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setCanvasSize({ w: width, h: height });
      return;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) {
        setCanvasSize({ w: width, h: height });
        return;
      }
      if (fillContainer) {
        setCanvasSize({ w: Math.max(300, Math.floor(rect.width)), h: Math.max(200, Math.floor(rect.height)) });
      } else {
        const w = Math.floor(rect.width);
        setCanvasSize({ w, h: Math.round((w * height) / width) });
      }
    };

    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fillContainer, width, height]);

  useEffect(() => {
    if (polygon && polygon.length >= 3) {
      setActivePolygon(polygon);
    }
  }, [polygon]);

  const currentW = canvasSize.w;
  const currentH = canvasSize.h;

  // Obstacles as shown: the local copy while one is being dragged, the props otherwise
  const displayObstacles = dragObstacles ?? obstacles;

  // Data-driven world window, frozen while a drag is active so the view does not rescale under the cursor
  const liveWorld = fitWorldWindow(
    [
      ...activePolygon,
      ...displayObstacles.filter((o) => o.enabled).flatMap((o) => o.points ?? []),
      { x: minX, y: minY },
      { x: maxX, y: maxY },
    ],
    currentW,
    currentH,
    MARGIN,
    0.1
  );
  const world = frozenWorld ?? liveWorld;
  const pxPerUnit = world.scale * zoom;
  const coordDecimals = decimalsFor(1 / pxPerUnit);
  const roundCoord = (v: number) => roundTo(v, coordDecimals);

  // Coordinate projection math with Zoom & Pan (uniform scale, +Y upwards)
  const toCanvasX = (val: number) => currentW / 2 + (val - world.cx) * pxPerUnit + panOffset.x;
  const toCanvasY = (val: number) => currentH / 2 - (val - world.cy) * pxPerUnit + panOffset.y;
  const fromCanvasXPrecise = (px: number) => world.cx + (px - panOffset.x - currentW / 2) / pxPerUnit;
  const fromCanvasYPrecise = (py: number) => world.cy - (py - panOffset.y - currentH / 2) / pxPerUnit;

  const getCanvasMousePos = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { mx: 0, my: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? currentW / rect.width : 1;
    const scaleY = rect.height > 0 ? currentH / rect.height : 1;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    return { mx, my };
  };

  // Derived drag/hover flags used by the renderer
  const draggingBoundaryVertexIndex = drag?.kind === 'boundary' ? drag.index : null;
  const draggingObstacleTarget = drag?.kind === 'obstacleVertex' ? drag : null;
  const draggingObstacleShapeIndex = drag?.kind === 'obstacleShape' ? drag.obsIndex : null;
  const hoveredBoundaryVertexIndex = hovered?.kind === 'boundary' ? hovered.index : null;
  const hoveredObstacleTarget = hovered?.kind === 'obstacleVertex' ? hovered : null;
  const hoveredObstacleShape = hovered?.kind === 'obstacleShape' ? hovered.obsIndex : null;

  // Render 2D grid, labeled coordinate axes (X, Y), boundary polygon & obstacles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, currentW, currentH);

    // Dark grid background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, currentW, currentH);

    // Grid lines with a "nice" step for the visible world area
    const visLeft = fromCanvasXPrecise(0);
    const visRight = fromCanvasXPrecise(currentW);
    const visBottom = fromCanvasYPrecise(currentH);
    const visTop = fromCanvasYPrecise(0);
    const step = niceStep((visRight - visLeft) / 8);
    const stepDecimals = decimalsFor(step);
    const labelEvery = step * pxPerUnit < 40 ? 2 : 1;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    for (let i = Math.ceil(visLeft / step); i * step <= visRight; i++) {
      const x = toCanvasX(i * step);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, currentH);
      ctx.stroke();
      if (i % labelEvery === 0) ctx.fillText(`${roundTo(i * step, stepDecimals)}`, x - 10, currentH - 5); // X scale
    }
    for (let i = Math.ceil(visBottom / step); i * step <= visTop; i++) {
      const y = toCanvasY(i * step);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(currentW, y);
      ctx.stroke();
      if (i % labelEvery === 0) ctx.fillText(`${roundTo(i * step, stepDecimals)}`, 4, y + 3); // Y scale
    }

    // Labeled X & Y Axes (Origin lines)
    const originX = toCanvasX(0);
    const originY = toCanvasY(0);

    ctx.strokeStyle = '#ef4444'; // Red X Axis
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(currentW, originY);
    ctx.stroke();

    ctx.strokeStyle = '#22c55e'; // Green Y Axis
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, currentH);
    ctx.stroke();

    // Axis names stay inside the canvas even when the origin is off-screen
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('X →', currentW - 20, Math.min(Math.max(originY - 4, 22), currentH - 16));
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Y ↑', Math.min(Math.max(originX + 4, 30), currentW - 24), 24);

    // 1. Render multi-vertex boundary polygon
    if (activePolygon.length >= 3) {
      ctx.beginPath();
      const first = activePolygon[0];
      ctx.moveTo(toCanvasX(first.x ?? 0), toCanvasY(first.y ?? 0));

      for (let i = 1; i < activePolygon.length; i++) {
        const pt = activePolygon[i];
        ctx.lineTo(toCanvasX(pt.x ?? 0), toCanvasY(pt.y ?? 0));
      }
      ctx.closePath();

      ctx.fillStyle = editMode === 'BOUNDARIES' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.1)';
      ctx.fill();

      ctx.strokeStyle = editMode === 'BOUNDARIES' ? '#c084fc' : '#8b5cf6';
      ctx.lineWidth = editMode === 'BOUNDARIES' ? 2.5 : 1.5;
      if (editMode === 'OBSTACLES') ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Render boundary vertex handles
      activePolygon.forEach((pt, i) => {
        const cx = toCanvasX(pt.x ?? 0);
        const cy = toCanvasY(pt.y ?? 0);
        const isHovered = hoveredBoundaryVertexIndex === i;
        const isDragging = draggingBoundaryVertexIndex === i;

        ctx.fillStyle = isDragging ? '#f472b6' : (isHovered ? '#ffffff' : (editMode === 'BOUNDARIES' ? '#e9d5ff' : '#a855f7'));
        ctx.beginPath();
        ctx.arc(cx, cy, isDragging || isHovered ? 9 : (editMode === 'BOUNDARIES' ? 6 : 4), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isHovered || isDragging ? '#ec4899' : '#a855f7';
        ctx.lineWidth = isHovered || isDragging ? 2.5 : 1.5;
        ctx.stroke();

        if (isDragging || isHovered) {
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(cx - 32, cy - 24, 64, 15, 3);
          ctx.fill();
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`(${pt.x}, ${pt.y})`, cx, cy - 13);
          ctx.textAlign = 'left';
        }
      });
    }

    // 2. Render 2D Wall Barriers & Forbidden Interior Obstacle Polygons
    displayObstacles.forEach((obs, obsIdx) => {
      if (!obs.enabled || !obs.points || obs.points.length === 0) return;
      const isSelected = obs.id === activeSelectedObsId;

      if (obs.type === 'WALL_SEGMENT' && obs.points.length >= 2) {
        if (isSelected) {
          // Subtle glowing halo stroke behind selected wall
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
          ctx.lineWidth = 10;
          ctx.beginPath();
          obs.points.forEach((pt, idx) => {
            const cx = toCanvasX(pt.x ?? 0);
            const cy = toCanvasY(pt.y ?? 0);
            if (idx === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
          });
          ctx.stroke();

          // Main line stroke: Vibrant Amber
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4;
          ctx.beginPath();
          obs.points.forEach((pt, idx) => {
            const cx = toCanvasX(pt.x ?? 0);
            const cy = toCanvasY(pt.y ?? 0);
            if (idx === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
          });
          ctx.stroke();

          // Dashed selection outline
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          obs.points.forEach((pt, idx) => {
            const cx = toCanvasX(pt.x ?? 0);
            const cy = toCanvasY(pt.y ?? 0);
            if (idx === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          // Standard Red Wall Line
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = editMode === 'OBSTACLES' ? 3 : 2;
          ctx.beginPath();
          obs.points.forEach((pt, idx) => {
            const cx = toCanvasX(pt.x ?? 0);
            const cy = toCanvasY(pt.y ?? 0);
            if (idx === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
          });
          ctx.stroke();
        }

        // Wall End Caps / Handles
        obs.points.forEach((pt, ptIdx) => {
          const cx = toCanvasX(pt.x ?? 0);
          const cy = toCanvasY(pt.y ?? 0);
          const isDragging = draggingObstacleTarget?.obsIndex === obsIdx && draggingObstacleTarget?.pointIndex === ptIdx;
          const isHovered = hoveredObstacleTarget?.obsIndex === obsIdx && hoveredObstacleTarget?.pointIndex === ptIdx;

          ctx.fillStyle = isDragging ? '#fef08a' : (isHovered ? '#ffffff' : (isSelected ? '#fbbf24' : '#f87171'));
          ctx.beginPath();
          ctx.arc(cx, cy, isDragging || isHovered ? 9 : (isSelected ? 7 : 5), 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = isDragging ? '#ca8a04' : (isHovered ? '#f59e0b' : (isSelected ? '#78350f' : '#991b1b'));
          ctx.lineWidth = isDragging || isHovered ? 2.5 : (isSelected ? 2 : 1.5);
          ctx.stroke();

          if (isSelected || isHovered || isDragging) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }

          if (isDragging || isHovered) {
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.roundRect(cx - 35, cy - 24, 70, 15, 3);
            ctx.fill();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`(${pt.x}, ${pt.y})`, cx, cy - 13);
            ctx.textAlign = 'left';
          }
        });

        // Centroid Selection Badge for Wall
        if (isSelected && obs.points.length >= 2) {
          const midX = (toCanvasX(obs.points[0].x ?? 0) + toCanvasX(obs.points[1].x ?? 0)) / 2;
          const midY = (toCanvasY(obs.points[0].y ?? 0) + toCanvasY(obs.points[1].y ?? 0)) / 2;
          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.roundRect(midX - 35, midY - 20, 70, 15, 3);
          ctx.fill();
          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${obs.name || 'Wall'}`, midX, midY - 9);
          ctx.textAlign = 'left';
        }
      } else if (obs.type === 'OBSTACLE_POLYGON' && obs.points.length >= 3) {
        ctx.beginPath();
        obs.points.forEach((pt, idx) => {
          const cx = toCanvasX(pt.x ?? 0);
          const cy = toCanvasY(pt.y ?? 0);
          if (idx === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.closePath();

        const isShapeDragging = draggingObstacleShapeIndex === obsIdx;
        if (isSelected || isShapeDragging) {
          ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
          ctx.fill();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = editMode === 'OBSTACLES' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.15)';
          ctx.fill();
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Polygon handles
        obs.points.forEach((pt, ptIdx) => {
          const cx = toCanvasX(pt.x ?? 0);
          const cy = toCanvasY(pt.y ?? 0);
          const isDragging = draggingObstacleTarget?.obsIndex === obsIdx && draggingObstacleTarget?.pointIndex === ptIdx;
          const isHovered = hoveredObstacleTarget?.obsIndex === obsIdx && hoveredObstacleTarget?.pointIndex === ptIdx;

          ctx.fillStyle = isDragging ? '#fef08a' : (isHovered ? '#ffffff' : (isSelected ? '#fbbf24' : '#f87171'));
          ctx.beginPath();
          ctx.arc(cx, cy, isDragging || isHovered ? 9 : (isSelected ? 7 : 5), 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = isDragging ? '#ca8a04' : (isHovered ? '#f59e0b' : (isSelected ? '#78350f' : '#991b1b'));
          ctx.lineWidth = isDragging || isHovered ? 2.5 : (isSelected ? 2 : 1.5);
          ctx.stroke();

          if (isSelected || isHovered || isDragging) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }

          if (isDragging || isHovered) {
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.roundRect(cx - 35, cy - 24, 70, 15, 3);
            ctx.fill();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`(${pt.x}, ${pt.y})`, cx, cy - 13);
            ctx.textAlign = 'left';
          }
        });

        // Centroid Selection Badge for Polygon
        if (isSelected && obs.points.length >= 3) {
          const cxAvg = obs.points.reduce((acc, p) => acc + toCanvasX(p.x ?? 0), 0) / obs.points.length;
          const cyAvg = obs.points.reduce((acc, p) => acc + toCanvasY(p.y ?? 0), 0) / obs.points.length;
          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.roundRect(cxAvg - 40, cyAvg - 8, 80, 15, 3);
          ctx.fill();
          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${obs.name || 'Zone'}`, cxAvg, cyAvg + 3);
          ctx.textAlign = 'left';
        }
      }
    });
  }, [activePolygon, displayObstacles, editMode, activeSelectedObsId, hovered, drag, zoom, panOffset, currentW, currentH, world.cx, world.cy, world.scale]);

  const showTempFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const recalculateBoundsAndTriggerChange = (pts: Point3DCoord[]) => {
    const xs = pts.map((p) => p.x ?? 0);
    const ys = pts.map((p) => p.y ?? 0);

    onChange({
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      polygon: pts,
      obstacles,
    });
  };

  // Handle Quick Presets (Square, Triangle, Circle)
  const applyPresetShape = (shape: 'square' | 'triangle' | 'circle') => {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // A boundary preset fills the current bounding box (so repeated clicks keep its size);
    // an obstacle preset is a smaller zone at its centre
    const factor = editMode === 'BOUNDARIES' ? 0.5 : 0.25;
    const rx = (maxX - minX) * factor || 1;
    const ry = (maxY - minY) * factor || 1;

    let newPts: Point3DCoord[] = [];

    if (shape === 'square') {
      newPts = [
        { x: roundCoord(cx - rx), y: roundCoord(cy - ry) },
        { x: roundCoord(cx + rx), y: roundCoord(cy - ry) },
        { x: roundCoord(cx + rx), y: roundCoord(cy + ry) },
        { x: roundCoord(cx - rx), y: roundCoord(cy + ry) },
      ];
    } else if (shape === 'triangle') {
      newPts = [
        { x: roundCoord(cx), y: roundCoord(cy + ry) },
        { x: roundCoord(cx + rx), y: roundCoord(cy - ry) },
        { x: roundCoord(cx - rx), y: roundCoord(cy - ry) },
      ];
    } else if (shape === 'circle') {
      const numPts = 12;
      for (let i = 0; i < numPts; i++) {
        const angle = (i * 2 * Math.PI) / numPts;
        newPts.push({ x: roundCoord(cx + rx * Math.cos(angle)), y: roundCoord(cy + ry * Math.sin(angle)) });
      }
    }

    if (editMode === 'BOUNDARIES') {
      setActivePolygon(newPts);
      recalculateBoundsAndTriggerChange(newPts);
      showTempFeedback(`Applied ${shape.toUpperCase()} preset to boundary polygon.`);
    } else {
      // Add as a new forbidden interior zone obstacle
      const newObs: BoundaryObstacle = {
        id: `obs_${Date.now()}`,
        name: `Quick ${shape.charAt(0).toUpperCase() + shape.slice(1)} Zone`,
        type: 'OBSTACLE_POLYGON',
        points: newPts,
        enabled: true,
      };
      const updatedObs = [...obstacles, newObs];
      onChange({
        minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updatedObs
      });
      showTempFeedback(`Added ${shape.toUpperCase()} obstacle zone.`);
    }
  };

  // Reset Region & Obstacles to default
  const handleResetAllConfirm = () => {
    const defaultPoly: Point3DCoord[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
    setActivePolygon(defaultPoly);
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
    setShowResetConfirmModal(false);

    onChange({
      minX,
      maxX,
      minY,
      maxY,
      polygon: defaultPoly,
      obstacles: [],
    });
    showTempFeedback('Reset region bounds and cleared all obstacles.');
  };

  // --- Hit testing (canvas pixel coordinates) ---

  /** Nearest boundary vertex within the hit radius. */
  const nearestBoundaryVertex = (mx: number, my: number, radius: number): number | null => {
    let found: { index: number; dist: number } | null = null;
    for (let i = 0; i < activePolygon.length; i++) {
      const dist = Math.hypot(mx - toCanvasX(activePolygon[i].x ?? 0), my - toCanvasY(activePolygon[i].y ?? 0));
      if (dist < radius && (found === null || dist < found.dist)) found = { index: i, dist };
    }
    return found ? found.index : null;
  };

  /** Nearest vertex of an enabled obstacle within the hit radius. */
  const nearestObstacleVertex = (mx: number, my: number, radius: number): { obsIndex: number; pointIndex: number } | null => {
    let found: { obsIndex: number; pointIndex: number; dist: number } | null = null;
    for (let o = 0; o < displayObstacles.length; o++) {
      const obs = displayObstacles[o];
      if (!obs.enabled || !obs.points) continue;
      for (let p = 0; p < obs.points.length; p++) {
        const dist = Math.hypot(mx - toCanvasX(obs.points[p].x ?? 0), my - toCanvasY(obs.points[p].y ?? 0));
        if (dist < radius && (found === null || dist < found.dist)) found = { obsIndex: o, pointIndex: p, dist };
      }
    }
    return found ? { obsIndex: found.obsIndex, pointIndex: found.pointIndex } : null;
  };

  /** Obstacle whose wall line is nearest or whose interior contains the pointer (topmost wins on ties). */
  const obstacleShapeAt = (mx: number, my: number): number | null => {
    const wx = fromCanvasXPrecise(mx);
    const wy = fromCanvasYPrecise(my);
    let found: { obsIndex: number; dist: number } | null = null;
    for (let o = 0; o < displayObstacles.length; o++) {
      const obs = displayObstacles[o];
      if (!obs.enabled || !obs.points) continue;
      const pts = obs.points;
      let dist = Infinity;
      if (obs.type === 'WALL_SEGMENT' && pts.length >= 2) {
        for (let i = 0; i < pts.length - 1; i++) {
          dist = Math.min(dist, pointToSegmentDistance(
            mx, my,
            toCanvasX(pts[i].x ?? 0), toCanvasY(pts[i].y ?? 0),
            toCanvasX(pts[i + 1].x ?? 0), toCanvasY(pts[i + 1].y ?? 0)
          ));
        }
        if (dist >= SEGMENT_HIT_PX) dist = Infinity;
      } else if (obs.type === 'OBSTACLE_POLYGON' && pts.length >= 3 && isPointInsidePolygonHelper(wx, wy, pts)) {
        dist = 0;
      }
      if (dist !== Infinity && (found === null || dist <= found.dist)) found = { obsIndex: o, dist };
    }
    return found ? found.obsIndex : null;
  };

  /**
   * What a press at (mx, my) grabs: in BOUNDARIES mode region vertices win over obstacle vertices;
   * whole obstacles are only moved in OBSTACLES mode.
   */
  const findHitTarget = (mx: number, my: number): HitTarget | null => {
    if (editMode === 'BOUNDARIES') {
      const index = nearestBoundaryVertex(mx, my, VERTEX_HIT_PX);
      if (index !== null) return { kind: 'boundary', index };
    }
    const vertex = nearestObstacleVertex(mx, my, VERTEX_HIT_PX);
    if (vertex) return { kind: 'obstacleVertex', ...vertex };
    if (editMode === 'OBSTACLES') {
      const obsIndex = obstacleShapeAt(mx, my);
      if (obsIndex !== null) return { kind: 'obstacleShape', obsIndex };
    }
    return null;
  };

  // --- Pointer gestures: edits stay local while dragging and are committed once on release ---

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return; // Right click opens the context menu
    setContextMenu(null);

    const { mx, my } = getCanvasMousePos(e);
    const pointer = { x: fromCanvasXPrecise(mx), y: fromCanvasYPrecise(my) };
    const target = findHitTarget(mx, my);
    // Keep receiving pointer events when the cursor leaves the canvas mid-drag
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragMovedRef.current = false;

    if (target?.kind === 'boundary') {
      const pt = activePolygon[target.index];
      setFrozenWorld(world);
      setDrag({ kind: 'boundary', index: target.index, offset: { x: (pt.x ?? 0) - pointer.x, y: (pt.y ?? 0) - pointer.y } });
      return;
    }

    if (target?.kind === 'obstacleVertex') {
      const obs = displayObstacles[target.obsIndex];
      const pt = obs.points[target.pointIndex];
      handleSelectObstacle(obs.id);
      setFrozenWorld(world);
      setDrag({
        kind: 'obstacleVertex',
        obsIndex: target.obsIndex,
        pointIndex: target.pointIndex,
        offset: { x: (pt.x ?? 0) - pointer.x, y: (pt.y ?? 0) - pointer.y },
      });
      return;
    }

    if (target?.kind === 'obstacleShape') {
      const obs = displayObstacles[target.obsIndex];
      handleSelectObstacle(obs.id);
      setFrozenWorld(world);
      setDrag({ kind: 'obstacleShape', obsIndex: target.obsIndex, startMouse: pointer, startPoints: obs.points.map((p) => ({ ...p })) });
      return;
    }

    // Clicked background in OBSTACLES mode
    if (editMode === 'OBSTACLES') {
      handleSelectObstacle(null);
    }

    // Default: Pan canvas
    setDrag({ kind: 'pan', start: { x: mx - panOffset.x, y: my - panOffset.y } });
  };

  /** Replaces the points of one obstacle in the local drag copy, if they changed. */
  const updateDragObstaclePoints = (obsIndex: number, mapPoints: (points: Point3DCoord[]) => Point3DCoord[]) => {
    const current = displayObstacles[obsIndex];
    if (!current?.points) return;
    const newPts = mapPoints(current.points);
    if (newPts.every((p, i) => p.x === current.points[i].x && p.y === current.points[i].y)) return;
    dragMovedRef.current = true;
    setDragObstacles(displayObstacles.map((obs, oIdx) => (oIdx === obsIndex ? { ...obs, points: newPts } : obs)));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { mx, my } = getCanvasMousePos(e);

    if (drag === null) {
      const target = findHitTarget(mx, my);
      setHovered((prev) => (sameHitTarget(prev, target) ? prev : target));
      return;
    }

    if (drag.kind === 'pan') {
      setPanOffset({ x: mx - drag.start.x, y: my - drag.start.y });
      return;
    }

    const px = fromCanvasXPrecise(mx);
    const py = fromCanvasYPrecise(my);

    if (drag.kind === 'boundary') {
      const nx = roundCoord(px + drag.offset.x);
      const ny = roundCoord(py + drag.offset.y);
      const current = activePolygon[drag.index];
      if (!current || (current.x === nx && current.y === ny)) return;
      dragMovedRef.current = true;
      setActivePolygon(activePolygon.map((pt, i) => (i === drag.index ? { ...pt, x: nx, y: ny } : pt)));
    } else if (drag.kind === 'obstacleVertex') {
      const nx = roundCoord(px + drag.offset.x);
      const ny = roundCoord(py + drag.offset.y);
      updateDragObstaclePoints(drag.obsIndex, (pts) => pts.map((pt, i) => (i === drag.pointIndex ? { ...pt, x: nx, y: ny } : pt)));
    } else {
      const dx = px - drag.startMouse.x;
      const dy = py - drag.startMouse.y;
      updateDragObstaclePoints(drag.obsIndex, () =>
        drag.startPoints.map((pt) => ({ ...pt, x: roundCoord((pt.x ?? 0) + dx), y: roundCoord((pt.y ?? 0) + dy) }))
      );
    }
  };

  const handlePointerUp = () => {
    if (drag === null) return;
    if (dragMovedRef.current) {
      if (drag.kind === 'boundary') {
        recalculateBoundsAndTriggerChange(activePolygon);
      } else if (drag.kind !== 'pan' && dragObstacles) {
        onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: dragObstacles });
      }
    }
    dragMovedRef.current = false;
    setDrag(null);
    setDragObstacles(null);
    setFrozenWorld(null);
  };

  // Native non-passive wheel listener so preventDefault stops the side panel from scrolling; zooms around the cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (rect.width > 0 ? currentW / rect.width : 1);
      const my = (e.clientY - rect.top) * (rect.height > 0 ? currentH / rect.height : 1);
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      if (nextZoom === zoom) return;
      const ratio = nextZoom / zoom;
      setZoom(nextZoom);
      setPanOffset({
        x: mx - currentW / 2 - (mx - currentW / 2 - panOffset.x) * ratio,
        y: my - currentH / 2 - (my - currentH / 2 - panOffset.y) * ratio,
      });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [zoom, panOffset, currentW, currentH]);

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Unscaled (CSS) coordinates place the menu; scaled canvas coordinates drive the hit tests
    const rect = canvas.getBoundingClientRect();
    const menuX = e.clientX - rect.left;
    const menuY = e.clientY - rect.top;
    const { mx, my } = getCanvasMousePos(e);

    const clickCoord = { x: roundCoord(fromCanvasXPrecise(mx)), y: roundCoord(fromCanvasYPrecise(my)) };
    const openMenu = (menu: Omit<ContextMenuState, 'x' | 'y' | 'clickCoord'>) =>
      setContextMenu({ x: menuX, y: menuY, clickCoord, ...menu });

    // 1. Vertices first; in BOUNDARIES mode region vertices win over obstacle vertices
    const boundaryVertex = nearestBoundaryVertex(mx, my, VERTEX_HIT_PX);
    if (editMode === 'BOUNDARIES' && boundaryVertex !== null) {
      openMenu({ type: 'boundary_vertex', boundaryIndex: boundaryVertex });
      return;
    }
    const obsVertex = nearestObstacleVertex(mx, my, VERTEX_HIT_PX);
    if (obsVertex) {
      openMenu({ type: 'obstacle_vertex', obstacleIndex: obsVertex.obsIndex, obstaclePointIndex: obsVertex.pointIndex });
      return;
    }
    if (boundaryVertex !== null) {
      openMenu({ type: 'boundary_vertex', boundaryIndex: boundaryVertex });
      return;
    }

    // 2. Edges: the nearest obstacle or region edge within reach; on a tie, the edited kind wins
    const segmentDistance = (a: Point3DCoord, b: Point3DCoord) =>
      pointToSegmentDistance(mx, my, toCanvasX(a.x ?? 0), toCanvasY(a.y ?? 0), toCanvasX(b.x ?? 0), toCanvasY(b.y ?? 0));
    let obstacleEdge: { obstacleIndex: number; edgeIndex: number; dist: number } | null = null;
    for (let oIdx = 0; oIdx < displayObstacles.length; oIdx++) {
      const obs = displayObstacles[oIdx];
      if (!obs.enabled || !obs.points) continue;
      const pts = obs.points;
      const n = pts.length;
      const isWall = obs.type === 'WALL_SEGMENT';
      if ((isWall && n < 2) || (!isWall && n < 3)) continue;
      const edgeCount = isWall ? n - 1 : n;
      for (let i = 0; i < edgeCount; i++) {
        const dist = segmentDistance(pts[i], pts[(i + 1) % n]);
        if (dist < EDGE_MENU_HIT_PX && (obstacleEdge === null || dist < obstacleEdge.dist)) {
          obstacleEdge = { obstacleIndex: oIdx, edgeIndex: i, dist };
        }
      }
    }

    let boundaryEdge: { edgeIndex: number; dist: number } | null = null;
    const n = activePolygon.length;
    for (let i = 0; i < n; i++) {
      const dist = segmentDistance(activePolygon[i], activePolygon[(i + 1) % n]);
      if (dist < EDGE_MENU_HIT_PX && (boundaryEdge === null || dist < boundaryEdge.dist)) {
        boundaryEdge = { edgeIndex: i, dist };
      }
    }

    const preferBoundary =
      boundaryEdge !== null &&
      (obstacleEdge === null ||
        boundaryEdge.dist < obstacleEdge.dist ||
        (boundaryEdge.dist === obstacleEdge.dist && editMode === 'BOUNDARIES'));
    if (preferBoundary && boundaryEdge) {
      openMenu({ type: 'boundary_edge', boundaryIndex: boundaryEdge.edgeIndex });
    } else if (obstacleEdge) {
      openMenu({ type: 'obstacle_edge', obstacleIndex: obstacleEdge.obstacleIndex, obstaclePointIndex: obstacleEdge.edgeIndex });
    }
  };

  const handleInsertPointOnBoundaryEdge = () => {
    if (!contextMenu || contextMenu.type !== 'boundary_edge' || contextMenu.boundaryIndex === undefined) return;
    const edgeIndex = contextMenu.boundaryIndex;
    const newPt = contextMenu.clickCoord;

    const updated = [...activePolygon];
    updated.splice(edgeIndex + 1, 0, newPt);

    setActivePolygon(updated);
    recalculateBoundsAndTriggerChange(updated);
    setContextMenu(null);
    showTempFeedback('New vertex added to boundary shape.');
  };

  const handleInsertPointOnObstacleEdge = () => {
    if (!contextMenu || contextMenu.type !== 'obstacle_edge' || contextMenu.obstacleIndex === undefined || contextMenu.obstaclePointIndex === undefined) return;
    const { obstacleIndex, obstaclePointIndex, clickCoord } = contextMenu;
    const targetObs = obstacles[obstacleIndex];
    if (!targetObs || !targetObs.points) return;

    const newPts = [...targetObs.points];
    newPts.splice(obstaclePointIndex + 1, 0, clickCoord);

    const updated = obstacles.map((obs, idx) => (idx === obstacleIndex ? { ...obs, points: newPts } : obs));
    onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updated });
    setContextMenu(null);
    showTempFeedback('New vertex inserted into obstacle.');
  };

  const handleDeleteBoundaryVertex = () => {
    if (!contextMenu || contextMenu.type !== 'boundary_vertex' || contextMenu.boundaryIndex === undefined) return;
    if (activePolygon.length <= 3) {
      showTempFeedback('A spatial boundary polygon must have at least 3 vertices.');
      setContextMenu(null);
      return;
    }

    const vertexIndex = contextMenu.boundaryIndex;
    const updated = activePolygon.filter((_, i) => i !== vertexIndex);

    setActivePolygon(updated);
    recalculateBoundsAndTriggerChange(updated);
    setContextMenu(null);
    showTempFeedback('Boundary vertex removed.');
  };

  const handleDeleteObstacleVertex = () => {
    if (!contextMenu || contextMenu.type !== 'obstacle_vertex' || contextMenu.obstacleIndex === undefined || contextMenu.obstaclePointIndex === undefined) return;
    const { obstacleIndex, obstaclePointIndex } = contextMenu;
    const targetObs = obstacles[obstacleIndex];
    if (!targetObs || !targetObs.points) return;

    if (targetObs.type === 'WALL_SEGMENT' && targetObs.points.length <= 2) {
      // Delete whole wall segment if < 2 points remain
      const updated = obstacles.filter((_, idx) => idx !== obstacleIndex);
      onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updated });
      showTempFeedback('Wall segment barrier deleted.');
    } else if (targetObs.type === 'OBSTACLE_POLYGON' && targetObs.points.length <= 3) {
      // Delete whole obstacle polygon if < 3 points remain
      const updated = obstacles.filter((_, idx) => idx !== obstacleIndex);
      onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updated });
      showTempFeedback('Forbidden interior obstacle zone deleted.');
    } else {
      const newPts = targetObs.points.filter((_, pIdx) => pIdx !== obstaclePointIndex);
      const updated = obstacles.map((obs, idx) => (idx === obstacleIndex ? { ...obs, points: newPts } : obs));
      onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updated });
      showTempFeedback('Obstacle vertex removed.');
    }
    setContextMenu(null);
  };

  let canvasCursor = 'crosshair';
  if (drag !== null) {
    canvasCursor = 'grabbing';
  } else if (hoveredObstacleTarget !== null || hoveredBoundaryVertexIndex !== null) {
    canvasCursor = 'grab';
  } else if (hoveredObstacleShape !== null) {
    canvasCursor = 'pointer';
  }

  return (
    <div className={`space-y-2 relative flex flex-col ${fillContainer ? 'h-full flex-1 min-h-0' : ''}`}>
      {/* 1. Header Toolbar */}
      {showToolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[var(--c-bg3)] p-2 rounded border border-[var(--c-br1)] shrink-0">
          {/* Selection Mode Switcher */}
          <div className="flex items-center gap-1 border border-[var(--c-br1)] p-0.5 rounded bg-[var(--c-bg1)]">
            <button
              type="button"
              onClick={() => setEditMode('BOUNDARIES')}
              className={`px-2.5 py-1 rounded font-medium text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                editMode === 'BOUNDARIES'
                  ? 'bg-purple-600 text-white shadow-sm font-semibold'
                  : 'text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)]'
              }`}
            >
              <Move size={12} />
              <span>Move Boundaries (Purple)</span>
            </button>
            <button
              type="button"
              onClick={() => setEditMode('OBSTACLES')}
              className={`px-2.5 py-1 rounded font-medium text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                editMode === 'OBSTACLES'
                  ? 'bg-rose-600 text-white shadow-sm font-semibold'
                  : 'text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)]'
              }`}
            >
              <ShieldAlert size={12} />
              <span>Move Obstacles (Red)</span>
            </button>
          </div>

          {/* Quick Shape Presets */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--c-tx4)] mr-0.5 uppercase">Presets:</span>
            <button
              type="button"
              onClick={() => applyPresetShape('square')}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] flex items-center gap-1 cursor-pointer"
              title="Apply Square Geometry"
            >
              <Square size={10} className="text-violet-400" />
              <span>Square</span>
            </button>
            <button
              type="button"
              onClick={() => applyPresetShape('triangle')}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] flex items-center gap-1 cursor-pointer"
              title="Apply Triangle Geometry"
            >
              <Triangle size={10} className="text-violet-400" />
              <span>Triangle</span>
            </button>
            <button
              type="button"
              onClick={() => applyPresetShape('circle')}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] flex items-center gap-1 cursor-pointer"
              title="Apply Circle Geometry"
            >
              <Circle size={10} className="text-violet-400" />
              <span>Circle</span>
            </button>
          </div>

          {/* Reset / New Region & Zoom Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowResetConfirmModal(true)}
              className="px-2 py-0.5 text-[10px] rounded border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 flex items-center gap-1 font-semibold cursor-pointer"
              title="Reset and clear all regions & obstacles"
            >
              <RefreshCw size={10} />
              <span>New Region</span>
            </button>
            <div className="flex items-center border border-[var(--c-br1)] rounded overflow-hidden bg-[var(--c-bg4)] text-[9px]">
              <button type="button" onClick={() => setZoom((z) => Math.min(20, z * 1.5))} className="px-2 py-0.5 hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] font-bold" title="Zoom In">+</button>
              <span className="px-1.5 font-mono text-[var(--c-tx3)]">{zoom.toFixed(1)}x</span>
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} className="px-2 py-0.5 hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] font-bold" title="Zoom Out">-</button>
            </div>
            <button type="button" onClick={() => { setZoom(1.0); setPanOffset({ x: 0, y: 0 }); }} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)]">Reset View</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[11px] text-[var(--c-tx4)] shrink-0">
          <span>2D Cartesian Grid ({activePolygon.length} Vertices)</span>
          <div className="flex items-center gap-1 text-[9px]">
            <div className="flex items-center border border-[var(--c-br1)] rounded overflow-hidden bg-[var(--c-bg4)]">
              <button type="button" onClick={() => setZoom((z) => Math.min(20, z * 1.5))} className="px-2 py-0.5 hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] font-bold" title="Zoom In">+</button>
              <span className="px-1.5 font-mono text-[var(--c-tx3)]">{zoom.toFixed(1)}x</span>
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} className="px-2 py-0.5 hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] font-bold" title="Zoom Out">-</button>
            </div>
            <button type="button" onClick={() => { setZoom(1.0); setPanOffset({ x: 0, y: 0 }); }} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)]">Fit/Reset</button>
          </div>
        </div>
      )}


      {/* Confirmation Modal when clicking New Region */}
      {showResetConfirmModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="boundary-reset-confirm-title"
          className="fixed inset-0 z-[999999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4 text-[var(--c-tx1)]">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle size={22} className="shrink-0" />
              <h3 id="boundary-reset-confirm-title" className="font-semibold text-sm">Draw New Region & Clear All Obstacles?</h3>
            </div>
            <p className="text-xs text-[var(--c-tx2)] leading-relaxed">
              Creating a new region will reset your custom boundary polygon to default rectangle bounds and <strong>permanently delete all defined wall barriers and forbidden interior obstacle zones</strong>.
              <br /><br />
              Are you sure you want to proceed and start a clean new region?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowResetConfirmModal(false)}
                className="text-xs cursor-pointer"
                autoFocus
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleResetAllConfirm}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white cursor-pointer font-medium"
              >
                Proceed & Reset All
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Interactive Canvas */}
      <div
        ref={containerRef}
        className={`relative rounded border border-[var(--c-br1)] overflow-hidden flex justify-center bg-[var(--c-bg2)] ${
          fillContainer ? 'flex-1 min-h-0 h-full w-full' : ''
        }`}
      >
        {/* Feedback floats over the canvas, so the canvas never moves under the cursor */}
        {feedbackMsg && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[10px] bg-violet-100 dark:bg-violet-950/90 text-violet-700 dark:text-violet-300 border border-violet-500/30 rounded px-2.5 py-1 shadow">
            {feedbackMsg}
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={currentW}
          height={currentH}
          style={{ cursor: canvasCursor }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => setHovered(null)}
          onContextMenu={handleContextMenu}
          className="w-full h-full block touch-none"
        />

        {/* Status line in the bottom-right corner: above the X scale labels, left of the "X →" name and
            clear of the Y scale labels on the left (drawn on the canvas it covered them) */}
        <div
          data-testid="canvas2d-status"
          className="pointer-events-none absolute bottom-4 right-7 z-10 max-w-[calc(100%-4rem)] truncate rounded bg-[#0f172a]/70 px-1 font-mono text-[9px] leading-tight text-slate-500"
        >
          {`[${editMode === 'BOUNDARIES' ? 'MOVE BOUNDARIES' : 'MOVE OBSTACLES'}] Zoom: ${zoom.toFixed(1)}x | Verts: ${activePolygon.length} | Obstacles: ${obstacles.length}`}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="absolute z-50 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded shadow-xl py-1 text-xs text-[var(--c-tx1)] animate-in fade-in duration-100"
          >
            {contextMenu.type === 'boundary_edge' && (
              <button
                type="button"
                onClick={handleInsertPointOnBoundaryEdge}
                className="w-full text-left px-3 py-1.5 hover:bg-violet-500/20 hover:text-violet-600 dark:hover:text-violet-300 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>+ Insert Vertex Here on Boundary Edge</span>
              </button>
            )}
            {contextMenu.type === 'obstacle_edge' && (
              <button
                type="button"
                onClick={handleInsertPointOnObstacleEdge}
                className="w-full text-left px-3 py-1.5 hover:bg-rose-500/20 hover:text-rose-600 dark:hover:text-rose-300 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>+ Insert Vertex Here on Obstacle</span>
              </button>
            )}
            {contextMenu.type === 'boundary_vertex' && (
              <button
                type="button"
                onClick={handleDeleteBoundaryVertex}
                className={`w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2 cursor-pointer ${
                  activePolygon.length <= 3
                    ? 'opacity-50 text-[var(--c-tx4)] cursor-not-allowed'
                    : 'hover:bg-red-500/20 hover:text-red-400'
                }`}
              >
                <span>✕ Delete Boundary Vertex (Min 3 required)</span>
              </button>
            )}
            {contextMenu.type === 'obstacle_vertex' && (
              <button
                type="button"
                onClick={handleDeleteObstacleVertex}
                className="w-full text-left px-3 py-1.5 hover:bg-rose-500/20 hover:text-rose-400 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>✕ Delete Obstacle Vertex</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
