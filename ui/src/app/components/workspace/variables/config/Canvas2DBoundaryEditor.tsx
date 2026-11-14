import React, { useRef, useState, useEffect } from 'react';
import { Point3DCoord, BoundaryObstacle } from '../../../../types';
import { Button } from '../../../ui/button';
import { AlertTriangle, Move, ShieldAlert, Square, Triangle, Circle, RefreshCw } from 'lucide-react';
import { fitWorldWindow, type WorldWindow } from '../../../../core/worldWindow';
import { useDialogEscape } from './useDialogEscape';
import { useCanvasPalette } from './canvasPalette';
import {
  VERTEX_HIT_PX,
  canvasCursorFor,
  decimalsFor,
  drawBoundaryPolygon,
  drawGridAndAxes,
  drawObstacle,
  edgeMenuTarget,
  interactionFlags,
  nearestObstacleEdge,
  nearestObstacleVertex,
  nearestPointIndex,
  nearestPolygonEdge,
  obstacleShapeAt,
  presetShapePoints,
  roundTo,
  sameHitTarget,
  vertexMenuTarget,
  type CanvasView,
  type ContextMenuTarget,
  type DragState,
  type EditMode,
  type HitTarget,
} from './canvas2DBoundaryHelpers';

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

interface ContextMenuState extends ContextMenuTarget {
  x: number;
  y: number;
  clickCoord: { x: number; y: number };
}

const MARGIN = 25; // Margin for axes labels
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 20;

/** The +/- zoom buttons and the zoom factor between them. */
function ZoomButtons({ zoom, setZoom }: Readonly<{ zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>> }>) {
  return (
    <>
      <button type="button" onClick={() => setZoom((z) => Math.min(20, z * 1.5))} className="px-2 py-0.5 hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] font-bold" title="Zoom In">+</button>
      <span className="px-1.5 font-mono text-[var(--c-tx3)]">{zoom.toFixed(1)}x</span>
      <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} className="px-2 py-0.5 hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] font-bold" title="Zoom Out">-</button>
    </>
  );
}

interface EditorToolbarProps {
  editMode: EditMode;
  onEditModeChange: (mode: EditMode) => void;
  onPreset: (shape: 'square' | 'triangle' | 'circle') => void;
  onNewRegion: () => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  onResetView: () => void;
}

/** Full toolbar: edit mode switcher, shape presets, new region and zoom controls. */
function EditorToolbar({ editMode, onEditModeChange, onPreset, onNewRegion, zoom, setZoom, onResetView }: Readonly<EditorToolbarProps>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[var(--c-bg3)] p-2 rounded border border-[var(--c-br1)] shrink-0">
      {/* Selection Mode Switcher */}
      <div className="flex items-center gap-1 border border-[var(--c-br1)] p-0.5 rounded bg-[var(--c-bg1)]">
        <button
          type="button"
          aria-pressed={editMode === 'BOUNDARIES'}
          onClick={() => onEditModeChange('BOUNDARIES')}
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
          aria-pressed={editMode === 'OBSTACLES'}
          onClick={() => onEditModeChange('OBSTACLES')}
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
          onClick={() => onPreset('square')}
          className="px-2 py-0.5 text-[10px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] flex items-center gap-1 cursor-pointer"
          title="Apply Square Geometry"
        >
          <Square size={10} className="text-violet-400" />
          <span>Square</span>
        </button>
        <button
          type="button"
          onClick={() => onPreset('triangle')}
          className="px-2 py-0.5 text-[10px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)] text-[var(--c-tx1)] flex items-center gap-1 cursor-pointer"
          title="Apply Triangle Geometry"
        >
          <Triangle size={10} className="text-violet-400" />
          <span>Triangle</span>
        </button>
        <button
          type="button"
          onClick={() => onPreset('circle')}
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
          onClick={onNewRegion}
          className="px-2 py-0.5 text-[10px] rounded border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 flex items-center gap-1 font-semibold cursor-pointer"
          title="Reset and clear all regions & obstacles"
        >
          <RefreshCw size={10} />
          <span>New Region</span>
        </button>
        <div className="flex items-center border border-[var(--c-br1)] rounded overflow-hidden bg-[var(--c-bg4)] text-[9px]">
          <ZoomButtons zoom={zoom} setZoom={setZoom} />
        </div>
        <button type="button" onClick={onResetView} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)]">Reset View</button>
      </div>
    </div>
  );
}

/** Compact header shown without the toolbar: vertex count and zoom controls. */
function CompactHeader({ vertexCount, zoom, setZoom, onResetView }: Readonly<{
  vertexCount: number;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  onResetView: () => void;
}>) {
  return (
    <div className="flex items-center justify-between text-[11px] text-[var(--c-tx4)] shrink-0">
      <span>2D Cartesian Grid ({vertexCount} Vertices)</span>
      <div className="flex items-center gap-1 text-[9px]">
        <div className="flex items-center border border-[var(--c-br1)] rounded overflow-hidden bg-[var(--c-bg4)]">
          <ZoomButtons zoom={zoom} setZoom={setZoom} />
        </div>
        <button type="button" onClick={onResetView} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] hover:bg-[var(--c-bg5)]">Fit/Reset</button>
      </div>
    </div>
  );
}

/** Confirmation dialog of "New Region", which also deletes every obstacle. */
function ResetConfirmDialog({ onCancel, onConfirm }: Readonly<{ onCancel: () => void; onConfirm: () => void }>) {
  return (
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
            onClick={onCancel}
            className="text-xs cursor-pointer"
            autoFocus
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            className="text-xs bg-rose-600 hover:bg-rose-700 text-white cursor-pointer font-medium"
          >
            Proceed & Reset All
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CanvasContextMenuProps {
  menu: ContextMenuState;
  polygonLength: number;
  onInsertOnBoundaryEdge: () => void;
  onInsertOnObstacleEdge: () => void;
  onDeleteBoundaryVertex: () => void;
  onDeleteObstacleVertex: () => void;
}

/** Right-click menu: insert a vertex on an edge, or delete a vertex. */
function CanvasContextMenu({
  menu,
  polygonLength,
  onInsertOnBoundaryEdge,
  onInsertOnObstacleEdge,
  onDeleteBoundaryVertex,
  onDeleteObstacleVertex,
}: Readonly<CanvasContextMenuProps>) {
  return (
    <div
      style={{ left: menu.x, top: menu.y }}
      className="absolute z-50 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded shadow-xl py-1 text-xs text-[var(--c-tx1)] animate-in fade-in duration-100"
    >
      {menu.type === 'boundary_edge' && (
        <button
          type="button"
          onClick={onInsertOnBoundaryEdge}
          className="w-full text-left px-3 py-1.5 hover:bg-violet-500/20 hover:text-violet-600 dark:hover:text-violet-300 transition-colors flex items-center gap-2 cursor-pointer"
        >
          <span>+ Insert Vertex Here on Boundary Edge</span>
        </button>
      )}
      {menu.type === 'obstacle_edge' && (
        <button
          type="button"
          onClick={onInsertOnObstacleEdge}
          className="w-full text-left px-3 py-1.5 hover:bg-rose-500/20 hover:text-rose-600 dark:hover:text-rose-300 transition-colors flex items-center gap-2 cursor-pointer"
        >
          <span>+ Insert Vertex Here on Obstacle</span>
        </button>
      )}
      {menu.type === 'boundary_vertex' && (
        <button
          type="button"
          onClick={onDeleteBoundaryVertex}
          className={`w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2 cursor-pointer ${
            polygonLength <= 3
              ? 'opacity-50 text-[var(--c-tx4)] cursor-not-allowed'
              : 'hover:bg-red-500/20 hover:text-red-400'
          }`}
        >
          <span>✕ Delete Boundary Vertex (Min 3 required)</span>
        </button>
      )}
      {menu.type === 'obstacle_vertex' && (
        <button
          type="button"
          onClick={onDeleteObstacleVertex}
          className="w-full text-left px-3 py-1.5 hover:bg-rose-500/20 hover:text-rose-400 transition-colors flex items-center gap-2 cursor-pointer"
        >
          <span>✕ Delete Obstacle Vertex</span>
        </button>
      )}
    </div>
  );
}

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
  const palette = useCanvasPalette();
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: width, h: height });

  // Selection mode: MOVE BOUNDARIES vs MOVE OBSTACLES
  const [editMode, setEditMode] = useState<EditMode>('BOUNDARIES');

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
  const view: CanvasView = {
    width: currentW,
    height: currentH,
    pxPerUnit,
    toCanvasX: (val: number) => currentW / 2 + (val - world.cx) * pxPerUnit + panOffset.x,
    toCanvasY: (val: number) => currentH / 2 - (val - world.cy) * pxPerUnit + panOffset.y,
    fromCanvasX: (px: number) => world.cx + (px - panOffset.x - currentW / 2) / pxPerUnit,
    fromCanvasY: (py: number) => world.cy - (py - panOffset.y - currentH / 2) / pxPerUnit,
  };
  const fromCanvasXPrecise = view.fromCanvasX;
  const fromCanvasYPrecise = view.fromCanvasY;

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
  const { draggingBoundaryVertexIndex, draggingObstacleTarget, draggingObstacleShapeIndex, hoveredBoundaryVertexIndex, hoveredObstacleTarget } =
    interactionFlags(drag, hovered);

  // Render 2D grid, labeled coordinate axes (X, Y), boundary polygon & obstacles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawGridAndAxes(ctx, view, palette);

    // 1. Multi-vertex boundary polygon
    drawBoundaryPolygon(ctx, view, activePolygon, { editMode, hoveredIndex: hoveredBoundaryVertexIndex, draggingIndex: draggingBoundaryVertexIndex }, palette);

    // 2. 2D Wall Barriers & Forbidden Interior Obstacle Polygons
    displayObstacles.forEach((obs, obsIdx) => {
      drawObstacle(ctx, view, obs, {
        editMode,
        isSelected: obs.id === activeSelectedObsId,
        isShapeDragging: draggingObstacleShapeIndex === obsIdx,
        draggingPointIndex: draggingObstacleTarget?.obsIndex === obsIdx ? draggingObstacleTarget.pointIndex : null,
        hoveredPointIndex: hoveredObstacleTarget?.obsIndex === obsIdx ? hoveredObstacleTarget.pointIndex : null,
      }, palette);
    });
  }, [activePolygon, displayObstacles, editMode, activeSelectedObsId, hovered, drag, zoom, panOffset, currentW, currentH, world.cx, world.cy, world.scale, palette]);

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

    const newPts = presetShapePoints(shape, cx, cy, rx, ry, roundCoord);

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

  const nearestBoundaryVertex = (mx: number, my: number, radius: number) => nearestPointIndex(activePolygon, view, mx, my, radius);

  /**
   * What a press at (mx, my) grabs: in BOUNDARIES mode region vertices win over obstacle vertices;
   * whole obstacles are only moved in OBSTACLES mode.
   */
  const findHitTarget = (mx: number, my: number): HitTarget | null => {
    if (editMode === 'BOUNDARIES') {
      const index = nearestBoundaryVertex(mx, my, VERTEX_HIT_PX);
      if (index !== null) return { kind: 'boundary', index };
    }
    const vertex = nearestObstacleVertex(displayObstacles, view, mx, my, VERTEX_HIT_PX);
    if (vertex) return { kind: 'obstacleVertex', ...vertex };
    if (editMode === 'OBSTACLES') {
      const obsIndex = obstacleShapeAt(displayObstacles, view, mx, my);
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

    // 1. Vertices first; in BOUNDARIES mode region vertices win over obstacle vertices
    const vertexTarget = vertexMenuTarget(
      editMode,
      nearestBoundaryVertex(mx, my, VERTEX_HIT_PX),
      nearestObstacleVertex(displayObstacles, view, mx, my, VERTEX_HIT_PX)
    );
    // 2. Edges: the nearest obstacle or region edge within reach; on a tie, the edited kind wins
    const target =
      vertexTarget ??
      edgeMenuTarget(editMode, nearestPolygonEdge(activePolygon, view, mx, my), nearestObstacleEdge(displayObstacles, view, mx, my));
    if (target) setContextMenu({ x: menuX, y: menuY, clickCoord, ...target });
  };

  const handleInsertPointOnBoundaryEdge = () => {
    if (contextMenu?.type !== 'boundary_edge' || contextMenu.boundaryIndex === undefined) return;
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
    if (contextMenu?.type !== 'obstacle_edge' || contextMenu.obstacleIndex === undefined || contextMenu.obstaclePointIndex === undefined) return;
    const { obstacleIndex, obstaclePointIndex, clickCoord } = contextMenu;
    const targetObs = obstacles[obstacleIndex];
    if (!targetObs?.points) return;

    const newPts = [...targetObs.points];
    newPts.splice(obstaclePointIndex + 1, 0, clickCoord);

    const updated = obstacles.map((obs, idx) => (idx === obstacleIndex ? { ...obs, points: newPts } : obs));
    onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updated });
    setContextMenu(null);
    showTempFeedback('New vertex inserted into obstacle.');
  };

  const handleDeleteBoundaryVertex = () => {
    if (contextMenu?.type !== 'boundary_vertex' || contextMenu.boundaryIndex === undefined) return;
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
    if (contextMenu?.type !== 'obstacle_vertex' || contextMenu.obstacleIndex === undefined || contextMenu.obstaclePointIndex === undefined) return;
    const { obstacleIndex, obstaclePointIndex } = contextMenu;
    const targetObs = obstacles[obstacleIndex];
    if (!targetObs?.points) return;

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

  const canvasCursor = canvasCursorFor(drag, hovered);
  const resetView = () => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className={`space-y-2 relative flex flex-col ${fillContainer ? 'h-full flex-1 min-h-0' : ''}`}>
      {/* 1. Header Toolbar */}
      {showToolbar ? (
        <EditorToolbar
          editMode={editMode}
          onEditModeChange={setEditMode}
          onPreset={applyPresetShape}
          onNewRegion={() => setShowResetConfirmModal(true)}
          zoom={zoom}
          setZoom={setZoom}
          onResetView={resetView}
        />
      ) : (
        <CompactHeader vertexCount={activePolygon.length} zoom={zoom} setZoom={setZoom} onResetView={resetView} />
      )}


      {/* Confirmation Modal when clicking New Region */}
      {showResetConfirmModal && (
        <ResetConfirmDialog onCancel={() => setShowResetConfirmModal(false)} onConfirm={handleResetAllConfirm} />
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
          className="pointer-events-none absolute bottom-4 right-7 z-10 max-w-[calc(100%-4rem)] truncate rounded bg-[var(--c-bg1)]/80 px-1 font-mono text-[9px] leading-tight text-[var(--c-tx3)]"
        >
          {`[${editMode === 'BOUNDARIES' ? 'MOVE BOUNDARIES' : 'MOVE OBSTACLES'}] Zoom: ${zoom.toFixed(1)}x | Verts: ${activePolygon.length} | Obstacles: ${obstacles.length}`}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <CanvasContextMenu
            menu={contextMenu}
            polygonLength={activePolygon.length}
            onInsertOnBoundaryEdge={handleInsertPointOnBoundaryEdge}
            onInsertOnObstacleEdge={handleInsertPointOnObstacleEdge}
            onDeleteBoundaryVertex={handleDeleteBoundaryVertex}
            onDeleteObstacleVertex={handleDeleteObstacleVertex}
          />
        )}
      </div>
    </div>
  );
};
