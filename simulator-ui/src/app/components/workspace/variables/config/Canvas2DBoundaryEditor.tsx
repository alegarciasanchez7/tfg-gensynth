import React, { useRef, useState, useEffect } from 'react';
import { Point3DCoord } from '../../../../types';

interface Canvas2DBoundaryEditorProps {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  polygon?: Point3DCoord[];
  onChange: (bounds: { minX: number; maxX: number; minY: number; maxY: number; polygon?: Point3DCoord[] }) => void;
  width?: number;
  height?: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'vertex' | 'edge';
  index: number;
  clickCoord: { x: number; y: number };
}

export const Canvas2DBoundaryEditor: React.FC<Canvas2DBoundaryEditorProps> = ({
  minX,
  maxX,
  minY,
  maxY,
  polygon = [],
  onChange,
  width = 360,
  height = 200,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const [draggingVertexIndex, setDraggingVertexIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (polygon && polygon.length >= 3) {
      setActivePolygon(polygon);
    }
  }, [polygon]);

  // Coordinate projection math with Zoom & Pan & Auto-Fit margin
  const margin = 25; // Margin for axes labels
  const viewWidth = width - margin * 2;
  const viewHeight = height - margin * 2;

  const toCanvasX = (val: number) => {
    const base = margin + ((val + 100) / 200) * viewWidth;
    return width / 2 + (base - width / 2) * zoom + panOffset.x;
  };

  const toCanvasY = (val: number) => {
    const base = height - margin - ((val + 100) / 200) * viewHeight;
    return height / 2 + (base - height / 2) * zoom + panOffset.y;
  };

  const fromCanvasX = (px: number) => {
    const unprojected = (px - panOffset.x - width / 2) / zoom + width / 2;
    return Math.round(Math.max(-100, Math.min(100, ((unprojected - margin) / viewWidth) * 200 - 100)) * 10) / 10;
  };

  const fromCanvasY = (py: number) => {
    const unprojected = (py - panOffset.y - height / 2) / zoom + height / 2;
    return Math.round(Math.max(-100, Math.min(100, (((height - margin - unprojected) / viewHeight) * 200 - 100))) * 10) / 10;
  };

  // Render 2D grid, labeled coordinate axes (X, Y), and multi-vertex polygon
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Dark grid background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let val = -100; val <= 100; val += 25) {
      const x = toCanvasX(val);
      const y = toCanvasY(val);

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Labeled X & Y Axes (Origin lines)
    const originX = toCanvasX(0);
    const originY = toCanvasY(0);

    ctx.strokeStyle = '#ef4444'; // Red X Axis
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    ctx.stroke();

    ctx.strokeStyle = '#22c55e'; // Green Y Axis
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();

    // Axis Labels & Ticks
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    for (let val = -100; val <= 100; val += 50) {
      const tx = toCanvasX(val);
      const ty = toCanvasY(val);

      ctx.fillText(`${val}`, tx - 10, height - 5); // X scale
      ctx.fillText(`${val}`, 4, ty + 3);           // Y scale
    }
    ctx.fillStyle = '#ef4444';
    ctx.fillText('X →', width - 20, originY - 4);
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Y ↑', originX + 4, 12);

    // Render multi-vertex polygon
    if (activePolygon.length >= 3) {
      ctx.beginPath();
      const first = activePolygon[0];
      ctx.moveTo(toCanvasX(first.x ?? 0), toCanvasY(first.y ?? 0));

      for (let i = 1; i < activePolygon.length; i++) {
        const pt = activePolygon[i];
        ctx.lineTo(toCanvasX(pt.x ?? 0), toCanvasY(pt.y ?? 0));
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
      ctx.fill();

      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Render vertex points
      activePolygon.forEach((pt, i) => {
        const cx = toCanvasX(pt.x ?? 0);
        const cy = toCanvasY(pt.y ?? 0);

        ctx.fillStyle = draggingVertexIndex === i ? '#f472b6' : '#e9d5ff';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    // Info overlay
    ctx.fillStyle = '#64748b';
    ctx.font = '9px monospace';
    ctx.fillText(`Zoom: ${zoom.toFixed(1)}x | 2D Polygon: ${activePolygon.length} Vertices`, 8, 12);
  }, [activePolygon, draggingVertexIndex, zoom, panOffset, width, height]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    setContextMenu(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let foundIndex: number | null = null;
    activePolygon.forEach((pt, i) => {
      const cx = toCanvasX(pt.x ?? 0);
      const cy = toCanvasY(pt.y ?? 0);
      if (Math.hypot(mx - cx, my - cy) < 12) {
        foundIndex = i;
      }
    });

    if (foundIndex !== null) {
      setDraggingVertexIndex(foundIndex);
    } else {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingVertexIndex !== null) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = Math.max(0, Math.min(width, e.clientX - rect.left));
      const mouseY = Math.max(0, Math.min(height, e.clientY - rect.top));

      const newX = fromCanvasX(mouseX);
      const newY = fromCanvasY(mouseY);

      const updated = activePolygon.map((pt, i) => (i === draggingVertexIndex ? { ...pt, x: newX, y: newY } : pt));
      setActivePolygon(updated);
      recalculateBoundsAndTriggerChange(updated);
    } else if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingVertexIndex(null);
    setIsPanning(false);
  };

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

    for (let i = 0; i < activePolygon.length; i++) {
      const cx = toCanvasX(activePolygon[i].x ?? 0);
      const cy = toCanvasY(activePolygon[i].y ?? 0);
      if (Math.hypot(mx - cx, my - cy) < 12) {
        setContextMenu({ x: mx, y: my, type: 'vertex', index: i, clickCoord });
        return;
      }
    }

    const n = activePolygon.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = toCanvasX(activePolygon[i].x ?? 0);
      const y1 = toCanvasY(activePolygon[i].y ?? 0);
      const x2 = toCanvasX(activePolygon[j].x ?? 0);
      const y2 = toCanvasY(activePolygon[j].y ?? 0);

      const dist = pointToSegmentDistance(mx, my, x1, y1, x2, y2);
      if (dist < 10) {
        setContextMenu({ x: mx, y: my, type: 'edge', index: i, clickCoord });
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

  const handleInsertPointOnEdge = () => {
    if (!contextMenu || contextMenu.type !== 'edge') return;
    const edgeIndex = contextMenu.index;
    const newPt = contextMenu.clickCoord;

    const updated = [...activePolygon];
    updated.splice(edgeIndex + 1, 0, newPt);

    setActivePolygon(updated);
    recalculateBoundsAndTriggerChange(updated);
    setContextMenu(null);
    showTempFeedback('New vertex added to shape edge.');
  };

  const handleDeleteVertex = () => {
    if (!contextMenu || contextMenu.type !== 'vertex') return;
    if (activePolygon.length <= 3) {
      showTempFeedback('A spatial figure must have at least 3 vertices.');
      setContextMenu(null);
      return;
    }

    const vertexIndex = contextMenu.index;
    const updated = activePolygon.filter((_, i) => i !== vertexIndex);

    setActivePolygon(updated);
    recalculateBoundsAndTriggerChange(updated);
    setContextMenu(null);
    showTempFeedback('Vertex removed. Edges connected logically.');
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
    });
  };

  const showTempFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="space-y-2 relative" onClick={() => setContextMenu(null)}>
      <div className="flex items-center justify-between text-[11px] text-[var(--c-tx4)]">
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

      {feedbackMsg && (
        <div className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded px-2.5 py-1">
          {feedbackMsg}
        </div>
      )}

      <div className="relative rounded border border-[var(--c-br1)] overflow-hidden flex justify-center bg-[var(--c-bg2)]">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
          className="cursor-crosshair"
        />

        {/* Context Menu */}
        {contextMenu && (
          <div
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="absolute z-50 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded shadow-xl py-1 text-xs text-[var(--c-tx1)] animate-in fade-in duration-100"
          >
            {contextMenu.type === 'edge' && (
              <button
                type="button"
                onClick={handleInsertPointOnEdge}
                className="w-full text-left px-3 py-1.5 hover:bg-violet-500/20 hover:text-violet-300 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>+ Insert Point Here on Edge</span>
              </button>
            )}
            {contextMenu.type === 'vertex' && (
              <button
                type="button"
                onClick={handleDeleteVertex}
                className={`w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2 cursor-pointer ${
                  activePolygon.length <= 3
                    ? 'opacity-50 text-[var(--c-tx4)] cursor-not-allowed'
                    : 'hover:bg-red-500/20 hover:text-red-400'
                }`}
              >
                <span>✕ Delete Point (Min 3 required)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
