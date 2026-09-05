import React, { useRef, useState, useEffect } from 'react';
import { Point3DCoord, Shape3DType } from '../../../../types';
import { Box, Circle, Triangle, Disc, Rotate3d, ZoomIn, ZoomOut, RefreshCw, Sliders } from 'lucide-react';
import { Label } from '../../../ui/label';
import { Input } from '../../../ui/input';
import { Button } from '../../../ui/button';

export interface Isometric3DBoundaryEditorProps {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  polygon?: Point3DCoord[];
  shape3DType?: Shape3DType;
  shape3DWidth?: number;
  shape3DLength?: number;
  shape3DHeight?: number;
  shape3DRadius?: number;
  onChange: (bounds: {
    minZ: number;
    maxZ: number;
    polygon?: Point3DCoord[];
    shape3DType?: Shape3DType;
    shape3DWidth?: number;
    shape3DLength?: number;
    shape3DHeight?: number;
    shape3DRadius?: number;
  }) => void;
  width?: number;
  height?: number;
}

type HandleType = 'corner' | 'radius' | 'height' | null;

export const Isometric3DBoundaryEditor: React.FC<Isometric3DBoundaryEditorProps> = ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
  shape3DType = 'cube',
  shape3DWidth,
  shape3DLength,
  shape3DHeight,
  shape3DRadius = 50,
  onChange,
  width = 360,
  height = 220,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Shape state
  const [activeShape, setActiveShape] = useState<Shape3DType>(
    shape3DType === ('custom' as any) ? 'cube' : shape3DType
  );
  const [width3D, setWidth3D] = useState<number>(shape3DWidth ?? Math.max(20, Math.abs(maxX - minX) || 100));
  const [length3D, setLength3D] = useState<number>(shape3DLength ?? Math.max(20, Math.abs(maxY - minY) || 100));
  const [height3D, setHeight3D] = useState<number>(shape3DHeight ?? (maxZ - minZ || 100));
  const [radius3D, setRadius3D] = useState<number>(shape3DRadius ?? 50);
  const [baseElevation, setBaseElevation] = useState<number>(minZ);

  // Camera & View controls
  const [orbitView, setOrbitView] = useState<boolean>(false);
  const [rotX, setRotX] = useState<number>(0.5); // Pitch angle
  const [rotY, setRotY] = useState<number>(0.785); // Yaw angle (~45 deg)
  const [zoom, setZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interaction State
  const [draggingHandle, setDraggingHandle] = useState<HandleType>(null);
  const [hoveredHandle, setHoveredHandle] = useState<HandleType>(null);
  const [isOrbiting, setIsOrbiting] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialShapeValues, setInitialShapeValues] = useState<{
    width: number;
    length: number;
    height: number;
    radius: number;
  }>({ width: 100, length: 100, height: 100, radius: 50 });

  // Keep state in sync with incoming props
  useEffect(() => {
    if (shape3DType && shape3DType !== ('custom' as any)) {
      setActiveShape(shape3DType);
    }
  }, [shape3DType]);

  useEffect(() => {
    if (shape3DWidth !== undefined) setWidth3D(shape3DWidth);
  }, [shape3DWidth]);

  useEffect(() => {
    if (shape3DLength !== undefined) setLength3D(shape3DLength);
  }, [shape3DLength]);

  useEffect(() => {
    if (shape3DHeight !== undefined) setHeight3D(shape3DHeight);
  }, [shape3DHeight]);

  useEffect(() => {
    if (shape3DRadius !== undefined) setRadius3D(shape3DRadius);
  }, [shape3DRadius]);

  useEffect(() => {
    setBaseElevation(minZ);
  }, [minZ]);

  // Helper to compute polygon for bounds sync
  const computePolygonForShape = (
    shape: Shape3DType,
    w: number,
    l: number,
    r: number,
    elev: number
  ): Point3DCoord[] => {
    if (shape === 'cube' || shape === 'pyramid') {
      const hw = w / 2;
      const hl = l / 2;
      return [
        { x: -hw, y: -hl, z: elev },
        { x: hw, y: -hl, z: elev },
        { x: hw, y: hl, z: elev },
        { x: -hw, y: hl, z: elev },
      ];
    } else {
      // Cone or Sphere base circle polygon
      const points: Point3DCoord[] = [];
      const numPts = 12;
      for (let i = 0; i < numPts; i++) {
        const angle = (i / numPts) * Math.PI * 2;
        points.push({
          x: Math.round(Math.cos(angle) * r),
          y: Math.round(Math.sin(angle) * r),
          z: elev,
        });
      }
      return points;
    }
  };

  const emitChange = (updates: {
    shape?: Shape3DType;
    width?: number;
    length?: number;
    height?: number;
    radius?: number;
    elev?: number;
  }) => {
    const nextShape = updates.shape ?? activeShape;
    const nextWidth = updates.width ?? width3D;
    const nextLength = updates.length ?? length3D;
    const nextHeight = updates.height ?? height3D;
    const nextRadius = updates.radius ?? radius3D;
    const nextElev = updates.elev ?? baseElevation;

    const computedPoly = computePolygonForShape(nextShape, nextWidth, nextLength, nextRadius, nextElev);
    const topZ = nextElev + nextHeight;
    const computedMinZ = Math.min(nextElev, topZ);
    const computedMaxZ = Math.max(nextElev, topZ);

    onChange({
      minZ: computedMinZ,
      maxZ: computedMaxZ,
      shape3DType: nextShape,
      shape3DWidth: nextWidth,
      shape3DLength: nextLength,
      shape3DHeight: nextHeight,
      shape3DRadius: nextRadius,
      polygon: computedPoly,
    });
  };

  // Calculate shape vertical midpoint to keep figure strictly centered in canvas panel
  const getShapeCenterZ = () => {
    if (activeShape === 'sphere') {
      return baseElevation + radius3D;
    }
    return baseElevation + height3D / 2;
  };

  // 3D Projection math (Inverted Z: +Z increases upwards on canvas, centered at shape centroid)
  const project = (x: number, y: number, z: number) => {
    const centerZ = getShapeCenterZ();
    const nx = (x / 200) * 2;
    const ny = (y / 200) * 2;
    const nz = -(((z - centerZ) / 300) * 2);

    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    const rx = nx * cosY - ny * sinY;
    const ry = nx * sinY * sinX + ny * cosY * sinX + nz * cosX;

    const scale = Math.min(width, height) / 3.0;
    const px = width / 2 + rx * scale * zoom + panOffset.x;
    const py = height / 2 + ry * (scale * 0.7) * zoom + panOffset.y;
    return { x: px, y: py };
  };

  // Calculate 3D handle locations
  const getHandleCoordinates = () => {
    let cornerHandle: { x: number; y: number } | null = null;
    let radiusHandle: { x: number; y: number } | null = null;
    let heightHandle: { x: number; y: number } | null = null;

    if (activeShape === 'cube' || activeShape === 'pyramid') {
      cornerHandle = project(width3D / 2, length3D / 2, baseElevation);
      heightHandle = project(0, 0, baseElevation + height3D);
    } else if (activeShape === 'cone') {
      radiusHandle = project(radius3D, 0, baseElevation);
      heightHandle = project(0, 0, baseElevation + height3D);
    } else if (activeShape === 'sphere') {
      radiusHandle = project(radius3D, 0, baseElevation + radius3D);
    }

    return { cornerHandle, radiusHandle, heightHandle };
  };

  // Canvas Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // 1. Grid Mesh on Ground Plane
    const gridExtent = Math.max(200, Math.ceil(300 / Math.max(0.4, zoom)));
    const step = 50;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;

    for (let gx = -gridExtent; gx <= gridExtent; gx += step) {
      const p1 = project(gx, -gridExtent, baseElevation);
      const p2 = project(gx, gridExtent, baseElevation);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      if (gx >= -150 && gx <= 150) {
        ctx.font = '8px monospace';
        ctx.fillStyle = '#475569';
        ctx.fillText(`${gx}`, p1.x + 2, p1.y + 8);
      }
    }

    for (let gy = -gridExtent; gy <= gridExtent; gy += step) {
      const p1 = project(-gridExtent, gy, baseElevation);
      const p2 = project(gridExtent, gy, baseElevation);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 2. Axes
    const origin = project(0, 0, baseElevation);
    const xAxis = project(100, 0, baseElevation);
    const yAxis = project(0, 100, baseElevation);
    const zAxis = project(0, 0, baseElevation + 100);

    // X axis Red
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(xAxis.x, xAxis.y);
    ctx.stroke();

    // Y axis Green
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(yAxis.x, yAxis.y);
    ctx.stroke();

    // Z axis Cyan (+Z upwards)
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(zAxis.x, zAxis.y);
    ctx.stroke();

    ctx.font = '9px monospace';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('X', xAxis.x + 4, xAxis.y);
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Y', yAxis.x + 4, yAxis.y);
    ctx.fillStyle = '#06b6d4';
    ctx.fillText('+Z', zAxis.x + 4, zAxis.y);

    // 3. Render 3D Shape Geometry
    const hw = width3D / 2;
    const hl = length3D / 2;
    const topZ = baseElevation + height3D;

    if (activeShape === 'cube') {
      const b0 = project(-hw, -hl, baseElevation);
      const b1 = project(hw, -hl, baseElevation);
      const b2 = project(hw, hl, baseElevation);
      const b3 = project(-hw, hl, baseElevation);

      const t0 = project(-hw, -hl, topZ);
      const t1 = project(hw, -hl, topZ);
      const t2 = project(hw, hl, topZ);
      const t3 = project(-hw, hl, topZ);

      // Base face
      ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(b3.x, b3.y);
      ctx.closePath();
      ctx.fill();

      // Top face
      ctx.fillStyle = 'rgba(139, 92, 246, 0.25)';
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fill();

      // Side edges & faces
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 1.5;

      const drawFace = (pA: any, pB: any, pC: any, pD: any) => {
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.lineTo(pC.x, pC.y);
        ctx.lineTo(pD.x, pD.y);
        ctx.closePath();
        ctx.stroke();
      };

      drawFace(b0, b1, b2, b3);
      drawFace(t0, t1, t2, t3);
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y); ctx.lineTo(t0.x, t0.y);
      ctx.moveTo(b1.x, b1.y); ctx.lineTo(t1.x, t1.y);
      ctx.moveTo(b2.x, b2.y); ctx.lineTo(t2.x, t2.y);
      ctx.moveTo(b3.x, b3.y); ctx.lineTo(t3.x, t3.y);
      ctx.stroke();

    } else if (activeShape === 'pyramid') {
      const b0 = project(-hw, -hl, baseElevation);
      const b1 = project(hw, -hl, baseElevation);
      const b2 = project(hw, hl, baseElevation);
      const b3 = project(-hw, hl, baseElevation);
      const apex = project(0, 0, topZ);

      // Base face
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y);
      ctx.closePath();
      ctx.fill();

      // Side triangular faces
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;

      const drawTri = (pA: any, pB: any) => {
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.lineTo(apex.x, apex.y);
        ctx.closePath();
        ctx.stroke();
      };

      drawTri(b0, b1); drawTri(b1, b2); drawTri(b2, b3); drawTri(b3, b0);

    } else if (activeShape === 'cone') {
      const numPts = 16;
      const basePts: any[] = [];
      for (let i = 0; i < numPts; i++) {
        const a = (i / numPts) * Math.PI * 2;
        basePts.push(project(Math.cos(a) * radius3D, Math.sin(a) * radius3D, baseElevation));
      }
      const apex = project(0, 0, topZ);

      // Base circle wireframe
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      basePts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();

      // Cone rays to apex
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      [0, 4, 8, 12].forEach((idx) => {
        if (basePts[idx]) {
          ctx.beginPath();
          ctx.moveTo(basePts[idx].x, basePts[idx].y);
          ctx.lineTo(apex.x, apex.y);
          ctx.stroke();
        }
      });

    } else if (activeShape === 'sphere') {
      const centerZ = baseElevation + radius3D;
      const c = project(0, 0, centerZ);

      // Equator & meridian rings
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.5;

      const numPts = 16;
      const eqPts: any[] = [];
      for (let i = 0; i < numPts; i++) {
        const a = (i / numPts) * Math.PI * 2;
        eqPts.push(project(Math.cos(a) * radius3D, Math.sin(a) * radius3D, centerZ));
      }

      ctx.beginPath();
      eqPts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();

      // Outer radius circle
      const radP = project(radius3D, 0, centerZ);
      const rPx = Math.hypot(radP.x - c.x, radP.y - c.y);

      ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(236, 72, 153, 0.1)';
      ctx.fill();
    }

    // 4. Draw Interactive Handles & Visual Controls
    const handles = getHandleCoordinates();

    // Corner handle (Cube / Pyramid)
    if (handles.cornerHandle) {
      const p = handles.cornerHandle;
      const isHovered = hoveredHandle === 'corner';
      const isDragging = draggingHandle === 'corner';

      ctx.fillStyle = isDragging ? '#facc15' : isHovered ? '#fbbf24' : '#eab308';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHovered || isDragging ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (isHovered || isDragging) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#fef08a';
        ctx.fillText(`Base: ${width3D.toFixed(0)} × ${length3D.toFixed(0)}`, p.x + 10, p.y - 4);
      }
    }

    // Radius handle (Cone / Sphere)
    if (handles.radiusHandle) {
      const p = handles.radiusHandle;
      const isHovered = hoveredHandle === 'radius';
      const isDragging = draggingHandle === 'radius';

      ctx.fillStyle = isDragging ? '#38bdf8' : isHovered ? '#60a5fa' : '#3b82f6';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHovered || isDragging ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (isHovered || isDragging) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#bae6fd';
        ctx.fillText(`Radius: ${radius3D.toFixed(0)}`, p.x + 10, p.y - 4);
      }
    }

    // Perpendicular Height Top Arrow handle (Cube / Pyramid / Cone)
    if (handles.heightHandle) {
      const p = handles.heightHandle;
      const isHovered = hoveredHandle === 'height';
      const isDragging = draggingHandle === 'height';

      // Height shaft line
      const baseCenter = project(0, 0, baseElevation);
      ctx.strokeStyle = isHovered || isDragging ? '#c084fc' : '#a855f7';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(baseCenter.x, baseCenter.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Top Arrowhead
      ctx.fillStyle = isDragging ? '#e879f9' : isHovered ? '#d8b4fe' : '#c084fc';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHovered || isDragging ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (isHovered || isDragging) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#f5d0fe';
        ctx.fillText(`Height: ${height3D.toFixed(0)}`, p.x + 10, p.y - 4);
      }
    }

    // 5. Canvas Info Overlay
    ctx.font = '10px sans-serif';
    ctx.fillStyle = orbitView ? '#38bdf8' : '#94a3b8';
    ctx.fillText(
      orbitView ? 'Orbit View Active: Drag canvas to rotate camera' : 'Handle Edit Mode: Drag corner/top handle',
      10,
      16
    );
  }, [
    activeShape,
    width3D,
    length3D,
    height3D,
    radius3D,
    baseElevation,
    rotX,
    rotY,
    zoom,
    panOffset,
    orbitView,
    hoveredHandle,
    draggingHandle,
    width,
    height,
  ]);

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (width / rect.width);
    const mouseY = (e.clientY - rect.top) * (height / rect.height);

    const handles = getHandleCoordinates();

    // Check hit test for handles
    if (handles.cornerHandle && Math.hypot(mouseX - handles.cornerHandle.x, mouseY - handles.cornerHandle.y) < 12) {
      setDraggingHandle('corner');
      setDragStart({ x: mouseX, y: mouseY });
      setInitialShapeValues({ width: width3D, length: length3D, height: height3D, radius: radius3D });
      return;
    }

    if (handles.radiusHandle && Math.hypot(mouseX - handles.radiusHandle.x, mouseY - handles.radiusHandle.y) < 12) {
      setDraggingHandle('radius');
      setDragStart({ x: mouseX, y: mouseY });
      setInitialShapeValues({ width: width3D, length: length3D, height: height3D, radius: radius3D });
      return;
    }

    if (handles.heightHandle && Math.hypot(mouseX - handles.heightHandle.x, mouseY - handles.heightHandle.y) < 12) {
      setDraggingHandle('height');
      setDragStart({ x: mouseX, y: mouseY });
      setInitialShapeValues({ width: width3D, length: length3D, height: height3D, radius: radius3D });
      return;
    }

    // If Orbit View is active, clicking canvas starts camera rotation
    if (orbitView) {
      setIsOrbiting(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) * (width / rect.width);
    const mouseY = (e.clientY - rect.top) * (height / rect.height);

    // Hover handle detection when not dragging
    if (!draggingHandle && !isOrbiting) {
      const handles = getHandleCoordinates();
      if (handles.cornerHandle && Math.hypot(mouseX - handles.cornerHandle.x, mouseY - handles.cornerHandle.y) < 12) {
        setHoveredHandle('corner');
      } else if (handles.radiusHandle && Math.hypot(mouseX - handles.radiusHandle.x, mouseY - handles.radiusHandle.y) < 12) {
        setHoveredHandle('radius');
      } else if (handles.heightHandle && Math.hypot(mouseX - handles.heightHandle.x, mouseY - handles.heightHandle.y) < 12) {
        setHoveredHandle('height');
      } else {
        setHoveredHandle(null);
      }
    }

    // Dragging Camera Orbit
    if (isOrbiting) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setRotY((prev) => prev + dx * 0.01);
      setRotX((prev) => Math.max(-1.4, Math.min(1.4, prev + dy * 0.01)));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Dragging Shape Handles
    if (draggingHandle) {
      const dx = mouseX - dragStart.x;
      const dy = mouseY - dragStart.y;

      if (draggingHandle === 'corner') {
        const delta = (dx - dy) * 0.8;
        const newW = Math.max(10, Math.round(initialShapeValues.width + delta));
        const newL = Math.max(10, Math.round(initialShapeValues.length + delta));
        setWidth3D(newW);
        setLength3D(newL);
        emitChange({ width: newW, length: newL });
      } else if (draggingHandle === 'radius') {
        const delta = (dx - dy) * 0.8;
        const newR = Math.max(5, Math.round(initialShapeValues.radius + delta));
        setRadius3D(newR);
        emitChange({ radius: newR });
      } else if (draggingHandle === 'height') {
        // Upwards movement on screen reduces Y, which increases Height
        const deltaH = -dy * 1.2;
        const newH = Math.round(initialShapeValues.height + deltaH);
        setHeight3D(newH);
        emitChange({ height: newH });
      }
    }
  };

  const handleMouseUp = () => {
    setDraggingHandle(null);
    setIsOrbiting(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Top Toolbar: Shape Selectors & Orbit View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded border border-[var(--c-br1)] bg-[var(--c-bg2)]">
        <div className="flex items-center gap-1">
          {[
            { id: 'cube', label: 'Cube', icon: Box },
            { id: 'pyramid', label: 'Pyramid', icon: Triangle },
            { id: 'cone', label: 'Cone', icon: Disc },
            { id: 'sphere', label: 'Sphere', icon: Circle },
          ].map((shape) => {
            const IconComp = shape.icon;
            const isActive = activeShape === shape.id;
            return (
              <button
                key={shape.id}
                type="button"
                onClick={() => {
                  setActiveShape(shape.id as Shape3DType);
                  emitChange({ shape: shape.id as Shape3DType });
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-[var(--c-bg4)] text-[var(--c-tx3)] hover:text-white hover:bg-white/10'
                }`}
              >
                <IconComp size={13} />
                <span>{shape.label}</span>
              </button>
            );
          })}
        </div>

        {/* Orbit View & Viewport Controls */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOrbitView(!orbitView)}
            className={`h-7 text-xs gap-1 cursor-pointer transition-colors ${
              orbitView
                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                : 'border-[var(--c-br1)] text-[var(--c-tx3)] hover:bg-white/5'
            }`}
          >
            <Rotate3d size={13} />
            <span>{orbitView ? 'Orbit ON' : 'Orbit View'}</span>
          </Button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
            className="p-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] text-[var(--c-tx3)] hover:text-white cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
            className="p-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] text-[var(--c-tx3)] hover:text-white cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>

          <button
            type="button"
            onClick={() => {
              setRotX(0.5);
              setRotY(0.785);
              setZoom(1.0);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="p-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] text-[var(--c-tx3)] hover:text-white cursor-pointer"
            title="Reset Camera View"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Main Container: Canvas + Side Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Canvas Column */}
        <div className="md:col-span-2 relative rounded border border-[var(--c-br1)] bg-black overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`w-full h-full touch-none ${
              draggingHandle
                ? 'cursor-grabbing'
                : hoveredHandle
                ? 'cursor-grab'
                : orbitView
                ? 'cursor-move'
                : 'cursor-default'
            }`}
          />
        </div>

        {/* Parametric Side Panel Column */}
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--c-tx2)] border-b border-[var(--c-br1)] pb-1.5">
              <Sliders size={13} className="text-violet-400" />
              <span>3D Parametric Limits</span>
            </div>

            {/* Cube & Pyramid: Width & Length Inputs */}
            {(activeShape === 'cube' || activeShape === 'pyramid') && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-[var(--c-tx4)]">
                    <Label htmlFor="width-3d-input">Base Width (X)</Label>
                    <span className="font-mono">{width3D} px</span>
                  </div>
                  <Input
                    id="width-3d-input"
                    type="number"
                    min={1}
                    value={width3D}
                    onChange={(e) => {
                      const val = Math.max(1, parseFloat(e.target.value) || 1);
                      setWidth3D(val);
                      emitChange({ width: val });
                    }}
                    className="h-7 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-[var(--c-tx4)]">
                    <Label htmlFor="length-3d-input">Base Length (Y)</Label>
                    <span className="font-mono">{length3D} px</span>
                  </div>
                  <Input
                    id="length-3d-input"
                    type="number"
                    min={1}
                    value={length3D}
                    onChange={(e) => {
                      const val = Math.max(1, parseFloat(e.target.value) || 1);
                      setLength3D(val);
                      emitChange({ length: val });
                    }}
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </>
            )}

            {/* Cone & Sphere: Radius Input */}
            {(activeShape === 'cone' || activeShape === 'sphere') && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-[var(--c-tx4)]">
                  <Label htmlFor="radius-3d-input">Radius (R)</Label>
                  <span className="font-mono">{radius3D} px</span>
                </div>
                <Input
                  id="radius-3d-input"
                  type="number"
                  min={1}
                  value={radius3D}
                  onChange={(e) => {
                    const val = Math.max(1, parseFloat(e.target.value) || 1);
                    setRadius3D(val);
                    emitChange({ radius: val });
                  }}
                  className="h-7 text-xs font-mono"
                />
              </div>
            )}

            {/* Height Input (Can be negative for inverted figure) */}
            {activeShape !== 'sphere' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-[var(--c-tx4)]">
                  <Label htmlFor="height-3d-input">Height (Z)</Label>
                  <span className="font-mono">{height3D} px</span>
                </div>
                <Input
                  id="height-3d-input"
                  type="number"
                  value={height3D}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setHeight3D(val);
                    emitChange({ height: val });
                  }}
                  className="h-7 text-xs font-mono"
                />
                <p className="text-[9px] text-[var(--c-tx4)] italic">
                  Note: Negative height inverts the 3D shape downwards.
                </p>
              </div>
            )}

            {/* Base Elevation Input */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-[var(--c-tx4)]">
                <Label htmlFor="base-elev-input">Base Elevation (minZ)</Label>
                <span className="font-mono">{baseElevation} px</span>
              </div>
              <Input
                id="base-elev-input"
                type="number"
                value={baseElevation}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setBaseElevation(val);
                  emitChange({ elev: val });
                }}
                className="h-7 text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
