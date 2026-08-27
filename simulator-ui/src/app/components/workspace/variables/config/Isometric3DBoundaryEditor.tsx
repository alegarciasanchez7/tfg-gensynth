import React, { useRef, useState, useEffect } from 'react';
import { Point3DCoord } from '../../../../types';

interface Isometric3DBoundaryEditorProps {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  polygon?: Point3DCoord[];
  onChange: (bounds: { minZ: number; maxZ: number; polygon?: Point3DCoord[] }) => void;
  width?: number;
  height?: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  type: 'vertex' | 'edge';
  index: number;
  clickCoord: { x: number; y: number; z: number };
}

export const Isometric3DBoundaryEditor: React.FC<Isometric3DBoundaryEditorProps> = ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
  polygon = [],
  onChange,
  width = 260,
  height = 160,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activePolygon, setActivePolygon] = useState<Point3DCoord[]>(
    polygon.length >= 3 ? polygon : [
      { x: minX, y: minY, z: minZ },
      { x: maxX, y: minY, z: minZ },
      { x: maxX, y: maxY, z: minZ },
      { x: minX, y: maxY, z: minZ },
    ]
  );

  // 3D Rotation, Zoom & Pan State
  const [rotX, setRotX] = useState<number>(0.5); // Pitch angle (radians)
  const [rotY, setRotY] = useState<number>(0.785); // Yaw angle (radians, ~45 deg)
  const [zoom, setZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interaction State: dragging top vs bottom face vertex
  const [draggingTarget, setDraggingTarget] = useState<{ index: number; face: 'top' | 'bottom' } | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (polygon && polygon.length >= 3) {
      setActivePolygon(polygon);
    }
  }, [polygon]);

  // 3D Projection with Pitch (rotX), Yaw (rotY), Zoom & Pan
  const project = (x: number, y: number, z: number) => {
    // Normalize coordinates to [-1, 1]
    const nx = ((x - -100) / 200) * 2 - 1;
    const ny = ((y - -100) / 200) * 2 - 1;
    const nz = ((z - -100) / 300) * 2 - 1;

    // Apply Yaw (rotY) & Pitch (rotX) 3D Rotation Matrix
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    const rx = nx * cosY - ny * sinY;
    const ry = nx * sinY * sinX + ny * cosY * sinX + nz * cosX;

    const px = width / 2 + rx * 60 * zoom + panOffset.x;
    const py = height / 2 + ry * 40 * zoom + panOffset.y;
    return { x: px, y: py };
  };

  // Render 3D volume, labeled axes (X, Y, Z), top AND bottom vertices, and grid
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // 3D Coordinate Axes (Origin = 0, 0, 0)
    const o = project(0, 0, 0);
    const xAxis = project(80, 0, 0);
    const yAxis = project(0, 80, 0);
    const zAxis = project(0, 0, 80);

    // Red X Axis
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(xAxis.x, xAxis.y);
    ctx.stroke();

    // Green Y Axis
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(yAxis.x, yAxis.y);
    ctx.stroke();

    // Blue Z Axis
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(zAxis.x, zAxis.y);
    ctx.stroke();

    // Axes Labels
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('X', xAxis.x + 4, xAxis.y);
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Y', yAxis.x + 4, yAxis.y);
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('Z', zAxis.x + 4, zAxis.y);

    if (activePolygon.length >= 3) {
      // Bottom face vertices (minZ)
      const bottomVertices = activePolygon.map((p) => project(p.x ?? 0, p.y ?? 0, minZ));
      // Top face vertices (maxZ)
      const topVertices = activePolygon.map((p) => project(p.x ?? 0, p.y ?? 0, maxZ));

      // Bottom face outline
      ctx.beginPath();
      ctx.moveTo(bottomVertices[0].x, bottomVertices[0].y);
      for (let i = 1; i < bottomVertices.length; i++) {
        ctx.lineTo(bottomVertices[i].x, bottomVertices[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Top face outline & fill
      ctx.beginPath();
      ctx.moveTo(topVertices[0].x, topVertices[0].y);
      for (let i = 1; i < topVertices.length; i++) {
        ctx.lineTo(topVertices[i].x, topVertices[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
      ctx.fill();
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Vertical side pillars
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1;
      for (let i = 0; i < activePolygon.length; i++) {
        ctx.beginPath();
        ctx.moveTo(bottomVertices[i].x, bottomVertices[i].y);
        ctx.lineTo(topVertices[i].x, topVertices[i].y);
        ctx.stroke();
      }

      // Render BOTTOM face vertex handles
      bottomVertices.forEach((c, i) => {
        const isDragging = draggingTarget?.face === 'bottom' && draggingTarget?.index === i;
        ctx.fillStyle = isDragging ? '#f472b6' : '#60a5fa';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Render TOP face vertex handles
      topVertices.forEach((c, i) => {
        const isDragging = draggingTarget?.face === 'top' && draggingTarget?.index === i;
        ctx.fillStyle = isDragging ? '#f472b6' : '#e9d5ff';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#581c87';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // Info overlay
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText(`Rot: [Yaw ${(rotY * 57.3).toFixed(0)}°, Pitch ${(rotX * 57.3).toFixed(0)}°] | 3D Vertices: ${activePolygon.length}`, 8, 12);
  }, [activePolygon, minZ, maxZ, rotX, rotY, zoom, panOffset, draggingTarget, width, height]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    setContextMenu(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check top face vertices
    for (let i = 0; i < activePolygon.length; i++) {
      const c = project(activePolygon[i].x ?? 0, activePolygon[i].y ?? 0, maxZ);
      if (Math.hypot(mx - c.x, my - c.y) < 10) {
        setDraggingTarget({ index: i, face: 'top' });
        setDragStart({ x: mx, y: my });
        return;
      }
    }

    // Check bottom face vertices
    for (let i = 0; i < activePolygon.length; i++) {
      const c = project(activePolygon[i].x ?? 0, activePolygon[i].y ?? 0, minZ);
      if (Math.hypot(mx - c.x, my - c.y) < 10) {
        setDraggingTarget({ index: i, face: 'bottom' });
        setDragStart({ x: mx, y: my });
        return;
      }
    }

    // Start 3D rotation pan by dragging background
    setIsRotating(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (draggingTarget !== null) {
      const index = draggingTarget.index;
      const pt = activePolygon[index];

      // Accurate mouse delta to 3D world motion transformation
      const dx = (mx - dragStart.x) * (1.5 / zoom);
      const dy = (my - dragStart.y) * (1.5 / zoom);
      setDragStart({ x: mx, y: my });

      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const worldDx = Math.round(dx * cosY + dy * sinY);
      const worldDy = Math.round(-dx * sinY + dy * cosY);

      const newX = Math.max(-100, Math.min(100, (pt.x ?? 0) + worldDx));
      const newY = Math.max(-100, Math.min(100, (pt.y ?? 0) + worldDy));

      const updated = activePolygon.map((p, i) => (i === index ? { ...p, x: newX, y: newY } : p));
      setActivePolygon(updated);
      onChange({ minZ, maxZ, polygon: updated });
    } else if (isRotating) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setDragStart({ x: e.clientX, y: e.clientY });

      setRotY((prev) => prev + dx * 0.01);
      setRotX((prev) => Math.max(-1.2, Math.min(1.2, prev + dy * 0.01)));
    }
  };

  const handleMouseUp = () => {
    setDraggingTarget(null);
    setIsRotating(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
    setZoom((prev) => Math.max(0.5, Math.min(10.0, prev * zoomFactor)));
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check vertex click (top or bottom)
    for (let i = 0; i < activePolygon.length; i++) {
      const cTop = project(activePolygon[i].x ?? 0, activePolygon[i].y ?? 0, maxZ);
      const cBot = project(activePolygon[i].x ?? 0, activePolygon[i].y ?? 0, minZ);
      if (Math.hypot(mx - cTop.x, my - cTop.y) < 10 || Math.hypot(mx - cBot.x, my - cBot.y) < 10) {
        setContextMenu({ x: mx, y: my, type: 'vertex', index: i, clickCoord: { x: 0, y: 0, z: maxZ } });
        return;
      }
    }

    // Check edge click
    const n = activePolygon.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const c1 = project(activePolygon[i].x ?? 0, activePolygon[i].y ?? 0, maxZ);
      const c2 = project(activePolygon[j].x ?? 0, activePolygon[j].y ?? 0, maxZ);

      const dist = pointToSegmentDistance(mx, my, c1.x, c1.y, c2.x, c2.y);
      if (dist < 10) {
        const midX = ((activePolygon[i].x ?? 0) + (activePolygon[j].x ?? 0)) / 2;
        const midY = ((activePolygon[i].y ?? 0) + (activePolygon[j].y ?? 0)) / 2;
        setContextMenu({ x: mx, y: my, type: 'edge', index: i, clickCoord: { x: midX, y: midY, z: maxZ } });
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
    onChange({ minZ, maxZ, polygon: updated });
    setContextMenu(null);
    showTempFeedback('3D vertex inserted on shape edge.');
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
    onChange({ minZ, maxZ, polygon: updated });
    setContextMenu(null);
    showTempFeedback('3D vertex deleted. Edges joined logically.');
  };

  const showTempFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="space-y-3 relative" onClick={() => setContextMenu(null)}>
      <div className="flex items-center justify-between text-[11px] text-[var(--c-tx4)]">
        <span>3D Volume Orbit & Multi-Face Vertices ({activePolygon.length} Vertices)</span>
        <div className="flex items-center gap-1 text-[9px]">
          <div className="flex items-center border border-[var(--c-br1)] rounded overflow-hidden bg-white/5">
            <button type="button" onClick={() => setZoom((z) => Math.min(10, z * 1.5))} className="px-2 py-0.5 hover:bg-white/10 text-white font-bold" title="Zoom In">+</button>
            <span className="px-1.5 font-mono text-[var(--c-tx3)]">{zoom.toFixed(1)}x</span>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} className="px-2 py-0.5 hover:bg-white/10 text-white font-bold" title="Zoom Out">-</button>
          </div>
          <button type="button" onClick={() => { setRotX(0.5); setRotY(0.785); setZoom(1.0); setPanOffset({ x: 0, y: 0 }); }} className="px-1.5 py-0.5 rounded border border-[var(--c-br1)] bg-white/5 hover:bg-white/10">Reset 3D</button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded px-2.5 py-1">
          {feedbackMsg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 items-center">
        <div className="col-span-2 relative rounded border border-[var(--c-br1)] overflow-hidden flex justify-center bg-[var(--c-bg2)]">
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
            className="cursor-grab active:cursor-grabbing"
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
                  <span>+ Insert 3D Point Here on Edge</span>
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

        <div className="space-y-3 p-2 border border-[var(--c-br1)] rounded bg-[var(--c-bg2)]">
          <div className="space-y-1">
            <label className="text-[9px] uppercase text-[var(--c-tx4)] block">Min Z / Altitude</label>
            <input
              type="range"
              min="-100"
              max="100"
              value={minZ}
              onChange={(e) => onChange({ minZ: Math.min(parseFloat(e.target.value), maxZ - 1), maxZ, polygon: activePolygon })}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-[var(--c-tx2)]">{minZ}</span>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase text-[var(--c-tx4)] block">Max Z / Altitude</label>
            <input
              type="range"
              min="-100"
              max="200"
              value={maxZ}
              onChange={(e) => onChange({ minZ, maxZ: Math.max(parseFloat(e.target.value), minZ + 1), polygon: activePolygon })}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-[var(--c-tx2)]">{maxZ}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
