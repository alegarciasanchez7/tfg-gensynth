import React, { useRef, useState, useEffect } from 'react';
import { Point3DCoord, BoundaryObstacle } from '../../../../types';
import { Button } from '../../../ui/button';
import { AlertTriangle, Move, ShieldAlert, Square, Triangle, Circle, RefreshCw } from 'lucide-react';

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
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hovering state for interactive feedback
  const [hoveredObstacleTarget, setHoveredObstacleTarget] = useState<{
    obsIndex: number;
    pointIndex: number;
  } | null>(null);
  const [hoveredBoundaryVertexIndex, setHoveredBoundaryVertexIndex] = useState<number | null>(null);
  const [hoveredObstacleShape, setHoveredObstacleShape] = useState<number | null>(null);

  // Dragging state
  const [draggingBoundaryVertexIndex, setDraggingBoundaryVertexIndex] = useState<number | null>(null);
  const [draggingObstacleTarget, setDraggingObstacleTarget] = useState<{
    obsIndex: number;
    pointIndex: number;
  } | null>(null);
  const [draggingObstacleShape, setDraggingObstacleShape] = useState<{
    obsIndex: number;
    startMouse: { x: number; y: number };
    startPoints: Point3DCoord[];
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);

  // Auto-resize canvas pixel dimensions to fill container when fillContainer is true
  useEffect(() => {
    if (!fillContainer) {
      setCanvasSize({ w: width, h: height });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = Math.max(200, Math.floor(rect.height));
      if (w > 0 && h > 0) {
        setCanvasSize({ w, h });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fillContainer, width, height]);

  useEffect(() => {
    if (polygon && polygon.length >= 3) {
      setActivePolygon(polygon);
    }
  }, [polygon]);

  // Coordinate projection math with Zoom & Pan & Auto-Fit margin
  const currentW = canvasSize.w;
  const currentH = canvasSize.h;

  const margin = 25; // Margin for axes labels
  const viewWidth = currentW - margin * 2;
  const viewHeight = currentH - margin * 2;

  const toCanvasX = (val: number) => {
    const base = margin + ((val + 100) / 200) * viewWidth;
    return currentW / 2 + (base - currentW / 2) * zoom + panOffset.x;
  };

  const toCanvasY = (val: number) => {
    const base = currentH - margin - ((val + 100) / 200) * viewHeight;
    return currentH / 2 + (base - currentH / 2) * zoom + panOffset.y;
  };

  const fromCanvasX = (px: number) => {
    const unprojected = (px - panOffset.x - currentW / 2) / zoom + currentW / 2;
    return Math.round(Math.max(-100, Math.min(100, ((unprojected - margin) / viewWidth) * 200 - 100)) * 10) / 10;
  };

  const fromCanvasY = (py: number) => {
    const unprojected = (py - panOffset.y - currentH / 2) / zoom + currentH / 2;
    return Math.round(Math.max(-100, Math.min(100, (((currentH - margin - unprojected) / viewHeight) * 200 - 100))) * 10) / 10;
  };

  const fromCanvasXPrecise = (px: number) => {
    const unprojected = (px - panOffset.x - currentW / 2) / zoom + currentW / 2;
    return Math.max(-100, Math.min(100, ((unprojected - margin) / viewWidth) * 200 - 100));
  };

  const fromCanvasYPrecise = (py: number) => {
    const unprojected = (py - panOffset.y - currentH / 2) / zoom + currentH / 2;
    return Math.max(-100, Math.min(100, ((currentH - margin - unprojected) / viewHeight) * 200 - 100));
  };

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

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let val = -100; val <= 100; val += 25) {
      const x = toCanvasX(val);
      const y = toCanvasY(val);

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, currentH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(currentW, y);
      ctx.stroke();
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

    // Axis Labels & Ticks
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    for (let val = -100; val <= 100; val += 50) {
      const tx = toCanvasX(val);
      const ty = toCanvasY(val);

      ctx.fillText(`${val}`, tx - 10, currentH - 5); // X scale
      ctx.fillText(`${val}`, 4, ty + 3);           // Y scale
    }
    ctx.fillStyle = '#ef4444';
    ctx.fillText('X →', currentW - 20, originY - 4);
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Y ↑', originX + 4, 12);

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
    (obstacles || []).forEach((obs, obsIdx) => {
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

        const isShapeDragging = draggingObstacleShape?.obsIndex === obsIdx;
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

    // Info overlay
    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    const modeLabel = editMode === 'BOUNDARIES' ? 'MOVE BOUNDARIES' : 'MOVE OBSTACLES';
    ctx.fillText(`[${modeLabel}] Zoom: ${zoom.toFixed(1)}x | Verts: ${activePolygon.length} | Obstacles: ${obstacles.length}`, 8, 12);
  }, [activePolygon, obstacles, editMode, activeSelectedObsId, hoveredObstacleTarget, hoveredBoundaryVertexIndex, draggingBoundaryVertexIndex, draggingObstacleTarget, draggingObstacleShape, zoom, panOffset, currentW, currentH]);

  // Handle Quick Presets (Square, Triangle, Circle)
  const applyPresetShape = (shape: 'square' | 'triangle' | 'circle') => {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = Math.max(10, (maxX - minX) * 0.35);
    const ry = Math.max(10, (maxY - minY) * 0.35);

    let newPts: Point3DCoord[] = [];

    if (shape === 'square') {
      newPts = [
        { x: Math.round((cx - rx) * 10) / 10, y: Math.round((cy - ry) * 10) / 10 },
        { x: Math.round((cx + rx) * 10) / 10, y: Math.round((cy - ry) * 10) / 10 },
        { x: Math.round((cx + rx) * 10) / 10, y: Math.round((cy + ry) * 10) / 10 },
        { x: Math.round((cx - rx) * 10) / 10, y: Math.round((cy + ry) * 10) / 10 },
      ];
    } else if (shape === 'triangle') {
      newPts = [
        { x: Math.round(cx * 10) / 10, y: Math.round((cy + ry) * 10) / 10 },
        { x: Math.round((cx + rx) * 10) / 10, y: Math.round((cy - ry) * 10) / 10 },
        { x: Math.round((cx - rx) * 10) / 10, y: Math.round((cy - ry) * 10) / 10 },
      ];
    } else if (shape === 'circle') {
      const numPts = 12;
      for (let i = 0; i < numPts; i++) {
        const angle = (i * 2 * Math.PI) / numPts;
        const px = Math.round((cx + rx * Math.cos(angle)) * 10) / 10;
        const py = Math.round((cy + ry * Math.sin(angle)) * 10) / 10;
        newPts.push({ x: px, y: py });
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

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return; // Ignore right click
    setContextMenu(null);

    const { mx, my } = getCanvasMousePos(e);

    const clickCoord = { x: fromCanvasX(mx), y: fromCanvasY(my) };
    const clickCoordPrecise = { x: fromCanvasXPrecise(mx), y: fromCanvasYPrecise(my) };

    // 1. Check if clicked on any Obstacle Vertex Handle (Red/Amber Dots)
    let foundObsVertex: { obsIndex: number; pointIndex: number } | null = null;
    (obstacles || []).forEach((obs, obsIdx) => {
      if (!obs.enabled || !obs.points) return;
      obs.points.forEach((pt, ptIdx) => {
        const cx = toCanvasX(pt.x ?? 0);
        const cy = toCanvasY(pt.y ?? 0);
        if (Math.hypot(mx - cx, my - cy) < 18) {
          foundObsVertex = { obsIndex: obsIdx, pointIndex: ptIdx };
        }
      });
    });

    if (foundObsVertex !== null) {
      const targetVertex: { obsIndex: number; pointIndex: number } = foundObsVertex;
      handleSelectObstacle(obstacles[targetVertex.obsIndex].id);
      setDraggingObstacleTarget(targetVertex);
      return;
    }

    // 2. Check if clicked on any Boundary Vertex Handle (Purple Dots)
    if (editMode === 'BOUNDARIES') {
      let foundBoundaryVertex: number | null = null;
      activePolygon.forEach((pt, i) => {
        const cx = toCanvasX(pt.x ?? 0);
        const cy = toCanvasY(pt.y ?? 0);
        if (Math.hypot(mx - cx, my - cy) < 18) {
          foundBoundaryVertex = i;
        }
      });

      if (foundBoundaryVertex !== null) {
        setDraggingBoundaryVertexIndex(foundBoundaryVertex);
        return;
      }
    }

    // 3. Check if clicked on any Obstacle Line Segment or Interior Polygon (Move Whole Obstacle)
    let foundObsShape: { obsIndex: number; startMouse: { x: number; y: number }; startPoints: Point3DCoord[] } | null = null;
    (obstacles || []).forEach((obs, obsIdx) => {
      if (!obs.enabled || !obs.points || foundObsShape) return;
      const pts = obs.points;
      const n = pts.length;
      if (obs.type === 'WALL_SEGMENT' && n >= 2) {
        for (let i = 0; i < n - 1; i++) {
          const x1 = toCanvasX(pts[i].x ?? 0);
          const y1 = toCanvasY(pts[i].y ?? 0);
          const x2 = toCanvasX(pts[i + 1].x ?? 0);
          const y2 = toCanvasY(pts[i + 1].y ?? 0);
          if (pointToSegmentDistance(mx, my, x1, y1, x2, y2) < 14) {
            foundObsShape = {
              obsIndex: obsIdx,
              startMouse: clickCoordPrecise,
              startPoints: pts.map((p) => ({ ...p })),
            };
          }
        }
      } else if (obs.type === 'OBSTACLE_POLYGON' && n >= 3) {
        if (isPointInsidePolygonHelper(clickCoord.x, clickCoord.y, pts)) {
          foundObsShape = {
            obsIndex: obsIdx,
            startMouse: clickCoordPrecise,
            startPoints: pts.map((p) => ({ ...p })),
          };
        }
      }
    });

    if (foundObsShape !== null) {
      const targetShape: { obsIndex: number; startMouse: { x: number; y: number }; startPoints: Point3DCoord[] } = foundObsShape;
      handleSelectObstacle(obstacles[targetShape.obsIndex].id);
      setDraggingObstacleShape(targetShape);
      return;
    }

    // 4. Clicked background in OBSTACLES mode
    if (editMode === 'OBSTACLES') {
      handleSelectObstacle(null);
    }

    // Default: Pan canvas
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { mx, my } = getCanvasMousePos(e);

    const newX = fromCanvasX(mx);
    const newY = fromCanvasY(my);

    // Hover state detection when not dragging
    if (draggingBoundaryVertexIndex === null && draggingObstacleTarget === null && draggingObstacleShape === null && !isPanning) {
      let foundObsHover: { obsIndex: number; pointIndex: number } | null = null;
      (obstacles || []).forEach((obs, obsIdx) => {
        if (!obs.enabled || !obs.points) return;
        obs.points.forEach((pt, ptIdx) => {
          const cx = toCanvasX(pt.x ?? 0);
          const cy = toCanvasY(pt.y ?? 0);
          if (Math.hypot(mx - cx, my - cy) < 18) {
            foundObsHover = { obsIndex: obsIdx, pointIndex: ptIdx };
          }
        });
      });

      setHoveredObstacleTarget(foundObsHover);

      if (foundObsHover === null) {
        let foundBndHover: number | null = null;
        if (editMode === 'BOUNDARIES') {
          activePolygon.forEach((pt, i) => {
            const cx = toCanvasX(pt.x ?? 0);
            const cy = toCanvasY(pt.y ?? 0);
            if (Math.hypot(mx - cx, my - cy) < 18) {
              foundBndHover = i;
            }
          });
        }
        setHoveredBoundaryVertexIndex(foundBndHover);

        let foundShapeHover: number | null = null;
        const clickCoord = { x: newX, y: newY };
        (obstacles || []).forEach((obs, obsIdx) => {
          if (!obs.enabled || !obs.points || foundShapeHover !== null) return;
          const pts = obs.points;
          const n = pts.length;
          if (obs.type === 'WALL_SEGMENT' && n >= 2) {
            for (let i = 0; i < n - 1; i++) {
              const x1 = toCanvasX(pts[i].x ?? 0);
              const y1 = toCanvasY(pts[i].y ?? 0);
              const x2 = toCanvasX(pts[i + 1].x ?? 0);
              const y2 = toCanvasY(pts[i + 1].y ?? 0);
              if (pointToSegmentDistance(mx, my, x1, y1, x2, y2) < 14) {
                foundShapeHover = obsIdx;
              }
            }
          } else if (obs.type === 'OBSTACLE_POLYGON' && n >= 3) {
            if (isPointInsidePolygonHelper(clickCoord.x, clickCoord.y, pts)) {
              foundShapeHover = obsIdx;
            }
          }
        });
        setHoveredObstacleShape(foundShapeHover);
      } else {
        setHoveredBoundaryVertexIndex(null);
        setHoveredObstacleShape(null);
      }
    }

    if (draggingBoundaryVertexIndex !== null) {
      const updated = activePolygon.map((pt, i) => (i === draggingBoundaryVertexIndex ? { ...pt, x: newX, y: newY } : pt));
      setActivePolygon(updated);
      recalculateBoundsAndTriggerChange(updated);
    } else if (draggingObstacleTarget !== null) {
      const { obsIndex, pointIndex } = draggingObstacleTarget;
      const updatedObstacles = obstacles.map((obs, oIdx) => {
        if (oIdx !== obsIndex || !obs.points) return obs;
        const newPts = obs.points.map((pt, pIdx) => (pIdx === pointIndex ? { ...pt, x: newX, y: newY } : pt));
        return { ...obs, points: newPts };
      });
      onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updatedObstacles });
    } else if (draggingObstacleShape !== null) {
      const newXPrecise = fromCanvasXPrecise(mx);
      const newYPrecise = fromCanvasYPrecise(my);
      const { obsIndex, startMouse, startPoints } = draggingObstacleShape;
      const dx = newXPrecise - startMouse.x;
      const dy = newYPrecise - startMouse.y;
      const updatedObstacles = obstacles.map((obs, oIdx) => {
        if (oIdx !== obsIndex || !obs.points) return obs;
        const newPts = startPoints.map((pt) => ({
          ...pt,
          x: Math.round(Math.max(-100, Math.min(100, (pt.x ?? 0) + dx)) * 10) / 10,
          y: Math.round(Math.max(-100, Math.min(100, (pt.y ?? 0) + dy)) * 10) / 10,
        }));
        return { ...obs, points: newPts };
      });
      onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updatedObstacles });
    } else if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingBoundaryVertexIndex(null);
    setDraggingObstacleTarget(null);
    setDraggingObstacleShape(null);
    setIsPanning(false);
  };

  // Window-level mouse listeners when actively dragging
  useEffect(() => {
    const isDraggingAny = draggingBoundaryVertexIndex !== null || draggingObstacleTarget !== null || draggingObstacleShape !== null || isPanning;
    if (!isDraggingAny) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const { mx, my } = getCanvasMousePos(e);
      const newX = fromCanvasX(mx);
      const newY = fromCanvasY(my);

      if (draggingBoundaryVertexIndex !== null) {
        const updated = activePolygon.map((pt, i) => (i === draggingBoundaryVertexIndex ? { ...pt, x: newX, y: newY } : pt));
        setActivePolygon(updated);
        recalculateBoundsAndTriggerChange(updated);
      } else if (draggingObstacleTarget !== null) {
        const { obsIndex, pointIndex } = draggingObstacleTarget;
        const updatedObstacles = obstacles.map((obs, oIdx) => {
          if (oIdx !== obsIndex || !obs.points) return obs;
          const newPts = obs.points.map((pt, pIdx) => (pIdx === pointIndex ? { ...pt, x: newX, y: newY } : pt));
          return { ...obs, points: newPts };
        });
        onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updatedObstacles });
      } else if (draggingObstacleShape !== null) {
        const newXPrecise = fromCanvasXPrecise(mx);
        const newYPrecise = fromCanvasYPrecise(my);
        const { obsIndex, startMouse, startPoints } = draggingObstacleShape;
        const dx = newXPrecise - startMouse.x;
        const dy = newYPrecise - startMouse.y;
        const updatedObstacles = obstacles.map((obs, oIdx) => {
          if (oIdx !== obsIndex || !obs.points) return obs;
          const newPts = startPoints.map((pt) => ({
            ...pt,
            x: Math.round(Math.max(-100, Math.min(100, (pt.x ?? 0) + dx)) * 10) / 10,
            y: Math.round(Math.max(-100, Math.min(100, (pt.y ?? 0) + dy)) * 10) / 10,
          }));
          return { ...obs, points: newPts };
        });
        onChange({ minX, maxX, minY, maxY, polygon: activePolygon, obstacles: updatedObstacles });
      } else if (isPanning) {
        setPanOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    };

    const handleWindowMouseUp = () => {
      handleMouseUp();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [draggingBoundaryVertexIndex, draggingObstacleTarget, draggingObstacleShape, isPanning, activePolygon, obstacles, zoom, panOffset, currentW, currentH, panStart]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
    setZoom((prev) => Math.max(0.5, Math.min(20.0, prev * zoomFactor)));
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const clickCoord = { x: fromCanvasX(mx), y: fromCanvasY(my) };

    // 1. Check if right clicked an obstacle vertex
    for (let oIdx = 0; oIdx < obstacles.length; oIdx++) {
      const obs = obstacles[oIdx];
      if (!obs.enabled || !obs.points) continue;
      for (let pIdx = 0; pIdx < obs.points.length; pIdx++) {
        const cx = toCanvasX(obs.points[pIdx].x ?? 0);
        const cy = toCanvasY(obs.points[pIdx].y ?? 0);
        if (Math.hypot(mx - cx, my - cy) < 16) {
          setContextMenu({ x: mx, y: my, type: 'obstacle_vertex', obstacleIndex: oIdx, obstaclePointIndex: pIdx, clickCoord });
          return;
        }
      }
    }

    // 2. Check if right clicked an obstacle edge
    for (let oIdx = 0; oIdx < obstacles.length; oIdx++) {
      const obs = obstacles[oIdx];
      if (!obs.enabled || !obs.points) continue;
      const pts = obs.points;
      const n = pts.length;
      if (obs.type === 'WALL_SEGMENT' && n >= 2) {
        for (let i = 0; i < n - 1; i++) {
          const x1 = toCanvasX(pts[i].x ?? 0);
          const y1 = toCanvasY(pts[i].y ?? 0);
          const x2 = toCanvasX(pts[i + 1].x ?? 0);
          const y2 = toCanvasY(pts[i + 1].y ?? 0);
          if (pointToSegmentDistance(mx, my, x1, y1, x2, y2) < 10) {
            setContextMenu({ x: mx, y: my, type: 'obstacle_edge', obstacleIndex: oIdx, obstaclePointIndex: i, clickCoord });
            return;
          }
        }
      } else if (obs.type === 'OBSTACLE_POLYGON' && n >= 3) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const x1 = toCanvasX(pts[i].x ?? 0);
          const y1 = toCanvasY(pts[i].y ?? 0);
          const x2 = toCanvasX(pts[j].x ?? 0);
          const y2 = toCanvasY(pts[j].y ?? 0);
          if (pointToSegmentDistance(mx, my, x1, y1, x2, y2) < 10) {
            setContextMenu({ x: mx, y: my, type: 'obstacle_edge', obstacleIndex: oIdx, obstaclePointIndex: i, clickCoord });
            return;
          }
        }
      }
    }

    // 3. Check boundary vertices
    for (let i = 0; i < activePolygon.length; i++) {
      const cx = toCanvasX(activePolygon[i].x ?? 0);
      const cy = toCanvasY(activePolygon[i].y ?? 0);
      if (Math.hypot(mx - cx, my - cy) < 16) {
        setContextMenu({ x: mx, y: my, type: 'boundary_vertex', boundaryIndex: i, clickCoord });
        return;
      }
    }

    // 4. Check boundary edges
    const n = activePolygon.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = toCanvasX(activePolygon[i].x ?? 0);
      const y1 = toCanvasY(activePolygon[i].y ?? 0);
      const x2 = toCanvasX(activePolygon[j].x ?? 0);
      const y2 = toCanvasY(activePolygon[j].y ?? 0);

      if (pointToSegmentDistance(mx, my, x1, y1, x2, y2) < 10) {
        setContextMenu({ x: mx, y: my, type: 'boundary_edge', boundaryIndex: i, clickCoord });
        return;
      }
    }
  };

  const pointToSegmentDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
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

  const recalculateBoundsAndTriggerChange = (pts: Point3DCoord[]) => {
    const xs = pts.map((p) => p.x ?? 0);
    const ys = pts.map((p) => p.y ?? 0);

    const calculatedMinX = Math.min(...xs);
    const calculatedMaxX = Math.max(...xs);
    const calculatedMinY = Math.min(...ys);
    const calculatedMaxY = Math.max(...ys);

    onChange({
      minX: calculatedMinX,
      maxX: calculatedMaxX,
      minY: calculatedMinY,
      maxY: calculatedMaxY,
      polygon: pts,
      obstacles,
    });
  };

  const showTempFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  let canvasCursor = 'crosshair';
  if (draggingBoundaryVertexIndex !== null || draggingObstacleTarget !== null || draggingObstacleShape !== null || isPanning) {
    canvasCursor = 'grabbing';
  } else if (hoveredObstacleTarget !== null || hoveredBoundaryVertexIndex !== null) {
    canvasCursor = 'grab';
  } else if (hoveredObstacleShape !== null) {
    canvasCursor = 'pointer';
  }

  return (
    <div className={`space-y-2 relative flex flex-col ${fillContainer ? 'h-full flex-1 min-h-0' : ''}`} onClick={() => setContextMenu(null)}>
      {/* 1. Header Toolbar */}
      {showToolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[var(--c-bg3)] p-2 rounded border border-[var(--c-br1)] shrink-0">
          {/* Selection Mode Switcher */}
          <div className="flex items-center gap-1 border border-[var(--c-br1)] p-0.5 rounded bg-black/20">
            <button
              type="button"
              onClick={() => setEditMode('BOUNDARIES')}
              className={`px-2.5 py-1 rounded font-medium text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                editMode === 'BOUNDARIES'
                  ? 'bg-purple-600 text-white shadow-sm font-semibold'
                  : 'text-[var(--c-tx3)] hover:text-white hover:bg-white/5'
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
                  : 'text-[var(--c-tx3)] hover:text-white hover:bg-white/5'
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
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10 text-slate-200 flex items-center gap-1 cursor-pointer"
              title="Apply Square Geometry"
            >
              <Square size={10} className="text-violet-400" />
              <span>Square</span>
            </button>
            <button
              type="button"
              onClick={() => applyPresetShape('triangle')}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10 text-slate-200 flex items-center gap-1 cursor-pointer"
              title="Apply Triangle Geometry"
            >
              <Triangle size={10} className="text-violet-400" />
              <span>Triangle</span>
            </button>
            <button
              type="button"
              onClick={() => applyPresetShape('circle')}
              className="px-2 py-0.5 text-[10px] rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10 text-slate-200 flex items-center gap-1 cursor-pointer"
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
              className="px-2 py-0.5 text-[10px] rounded border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 flex items-center gap-1 font-semibold cursor-pointer"
              title="Reset and clear all regions & obstacles"
            >
              <RefreshCw size={10} />
              <span>New Region</span>
            </button>
            <div className="flex items-center border border-[var(--c-br1)] rounded overflow-hidden bg-white/5 text-[9px]">
              <button type="button" onClick={() => setZoom((z) => Math.min(20, z * 1.5))} className="px-2 py-0.5 hover:bg-white/10 text-white font-bold" title="Zoom In">+</button>
              <span className="px-1.5 font-mono text-[var(--c-tx3)]">{zoom.toFixed(1)}x</span>
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} className="px-2 py-0.5 hover:bg-white/10 text-white font-bold" title="Zoom Out">-</button>
            </div>
            <button type="button" onClick={() => { setZoom(1.0); setPanOffset({ x: 0, y: 0 }); }} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10">Reset View</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[11px] text-[var(--c-tx4)] shrink-0">
          <span>2D Cartesian Grid ({activePolygon.length} Vertices)</span>
          <div className="flex items-center gap-1 text-[9px]">
            <div className="flex items-center border border-[var(--c-br1)] rounded overflow-hidden bg-white/5">
              <button type="button" onClick={() => setZoom((z) => Math.min(20, z * 1.5))} className="px-2 py-0.5 hover:bg-white/10 text-white font-bold" title="Zoom In">+</button>
              <span className="px-1.5 font-mono text-[var(--c-tx3)]">{zoom.toFixed(1)}x</span>
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} className="px-2 py-0.5 hover:bg-white/10 text-white font-bold" title="Zoom Out">-</button>
            </div>
            <button type="button" onClick={() => { setZoom(1.0); setPanOffset({ x: 0, y: 0 }); }} className="px-1.5 py-0.5 rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10">Fit/Reset</button>
          </div>
        </div>
      )}

      {feedbackMsg && (
        <div className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded px-2.5 py-1 shrink-0">
          {feedbackMsg}
        </div>
      )}

      {/* Confirmation Modal when clicking New Region */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-[999999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-md w-full shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle size={22} className="shrink-0" />
              <h3 className="font-semibold text-sm">Draw New Region & Clear All Obstacles?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
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
        <canvas
          ref={canvasRef}
          width={currentW}
          height={currentH}
          style={{ cursor: canvasCursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          className="w-full h-full block"
        />

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
                className="w-full text-left px-3 py-1.5 hover:bg-violet-500/20 hover:text-violet-300 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>+ Insert Vertex Here on Boundary Edge</span>
              </button>
            )}
            {contextMenu.type === 'obstacle_edge' && (
              <button
                type="button"
                onClick={handleInsertPointOnObstacleEdge}
                className="w-full text-left px-3 py-1.5 hover:bg-rose-500/20 hover:text-rose-300 transition-colors flex items-center gap-2 cursor-pointer"
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
