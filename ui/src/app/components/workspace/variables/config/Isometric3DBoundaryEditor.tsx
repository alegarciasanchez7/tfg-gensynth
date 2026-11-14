import React, { useRef, useState, useEffect } from 'react';
import { Point3DCoord, Shape3DType } from '../../../../types';
import { Box, Circle, Triangle, Disc, Rotate3d, ZoomIn, ZoomOut, RefreshCw, Sliders } from 'lucide-react';
import { Label } from '../../../ui/label';
import { Input } from '../../../ui/input';
import { Button } from '../../../ui/button';
import { useCanvasPalette } from './canvasPalette';
import {
  drawAxes,
  drawGroundGrid,
  drawHandles,
  drawShape,
  drawStatusText,
  growFactor,
  handleAt as handleAtPoint,
  heightDragDelta,
  parseFieldValue,
  projectIsometric,
  shapeHandles,
  type FieldKey,
  type HandleType,
} from './isometric3DHelpers';

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
  }) => void;
  width?: number;
  height?: number;
  /** Fill the parent's height and draw the canvas at the size it gets (fullscreen editor). */
  fillContainer?: boolean;
}

/**
 * Base elevation implied by a persisted Z range: with a negative height the shape hangs down
 * from its base, so the base is the top of the range.
 */
const baseElevationFor = (shape: Shape3DType | undefined, minZ: number, maxZ: number, height: number | undefined) =>
  shape !== 'sphere' && (height ?? 0) < 0 ? maxZ : minZ;

/** Side of an unset footprint dimension, like the Core: the bounds span, or 100 for a flat range. */
const spanOr100 = (min: number, max: number) => Math.abs(max - min) || 100;

/** Canvas cursor: grabbing a handle, over a handle, orbiting the view, or the default one. */
const canvasCursorClass = (draggingHandle: HandleType, hoveredHandle: HandleType, orbitView: boolean) => {
  if (draggingHandle) return 'cursor-grabbing';
  if (hoveredHandle) return 'cursor-grab';
  return orbitView ? 'cursor-move' : 'cursor-default';
};

/** Shape as the Core sees it: the persisted dimensions, or the ones it derives from the bounds when unset. */
const resolveShape = (p: Pick<Isometric3DBoundaryEditorProps,
  'minX' | 'maxX' | 'minY' | 'maxY' | 'minZ' | 'maxZ' | 'shape3DType' | 'shape3DWidth' | 'shape3DLength' | 'shape3DHeight' | 'shape3DRadius'>) => ({
  shape: (p.shape3DType === ('custom' as Shape3DType) ? 'cube' : p.shape3DType ?? 'cube') as Shape3DType,
  width: p.shape3DWidth ?? spanOr100(p.minX, p.maxX),
  length: p.shape3DLength ?? spanOr100(p.minY, p.maxY),
  height: p.shape3DHeight ?? p.maxZ - p.minZ,
  radius: p.shape3DRadius ?? 50,
  elev: baseElevationFor(p.shape3DType, p.minZ, p.maxZ, p.shape3DHeight),
});

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
  shape3DRadius,
  onChange,
  width: baseWidth = 360,
  height: baseHeight = 220,
  fillContainer = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = useCanvasPalette();
  const canvasBoxRef = useRef<HTMLDivElement>(null);

  // Filling the container: the canvas is drawn at the measured size of its column, so it is never stretched
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const box = canvasBoxRef.current;
    if (!fillContainer || !box) return;
    const updateSize = () => {
      const rect = box.getBoundingClientRect();
      setMeasured(rect.width > 0 && rect.height > 0 ? { w: Math.floor(rect.width), h: Math.floor(rect.height) } : null);
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(box);
    return () => observer.disconnect();
  }, [fillContainer]);
  const width = fillContainer && measured ? measured.w : baseWidth;
  const height = fillContainer && measured ? measured.h : baseHeight;

  // Shape state: local while a handle is dragged or a field typed, reset whenever the props change.
  // Unset dimensions are derived live from the bounds with the Core rule, so what is drawn and
  // emitted is the region the generator uses.
  const resolved = resolveShape({ minX, maxX, minY, maxY, minZ, maxZ, shape3DType, shape3DWidth, shape3DLength, shape3DHeight, shape3DRadius });
  const [activeShape, setActiveShape] = useState<Shape3DType>(resolved.shape);
  const [width3D, setWidth3D] = useState<number>(resolved.width);
  const [length3D, setLength3D] = useState<number>(resolved.length);
  const [height3D, setHeight3D] = useState<number>(resolved.height);
  const [radius3D, setRadius3D] = useState<number>(resolved.radius);
  const [baseElevation, setBaseElevation] = useState<number>(resolved.elev);
  const [drafts, setDrafts] = useState<Partial<Record<FieldKey, string>>>({});

  // Keep state in sync with incoming props (adjusted during render, without an effect)
  const propsKey = [shape3DType, shape3DWidth, shape3DLength, shape3DHeight, shape3DRadius, minX, maxX, minY, maxY, minZ, maxZ].join('|');
  const [syncedKey, setSyncedKey] = useState(propsKey);
  if (propsKey !== syncedKey) {
    setSyncedKey(propsKey);
    setActiveShape(resolved.shape);
    setWidth3D(resolved.width);
    setLength3D(resolved.length);
    setHeight3D(resolved.height);
    setRadius3D(resolved.radius);
    setBaseElevation(resolved.elev);
  }

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
  // Projection centre Z frozen while a handle is dragged, so the shape does not shift under the cursor
  const [frozenCenterZ, setFrozenCenterZ] = useState<number | null>(null);
  const dragMovedRef = useRef(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialShapeValues, setInitialShapeValues] = useState<{
    width: number;
    length: number;
    height: number;
    radius: number;
  }>({ width: 100, length: 100, height: 100, radius: 50 });

  // Centre of the current X/Y bounds: the generated footprint stays centred there
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

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
        { x: centerX - hw, y: centerY - hl, z: elev },
        { x: centerX + hw, y: centerY - hl, z: elev },
        { x: centerX + hw, y: centerY + hl, z: elev },
        { x: centerX - hw, y: centerY + hl, z: elev },
      ];
    } else {
      // Cone or Sphere base circle polygon
      const points: Point3DCoord[] = [];
      const numPts = 12;
      for (let i = 0; i < numPts; i++) {
        const angle = (i / numPts) * Math.PI * 2;
        points.push({
          x: Math.round((centerX + Math.cos(angle) * r) * 100) / 100,
          y: Math.round((centerY + Math.sin(angle) * r) * 100) / 100,
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
    // A sphere rests on its base and spans its diameter; other shapes span their (possibly negative) height
    const topZ = nextShape === 'sphere' ? nextElev + 2 * nextRadius : nextElev + nextHeight;
    const computedMinZ = Math.min(nextElev, topZ);
    const computedMaxZ = Math.max(nextElev, topZ);
    const halfX = nextShape === 'cube' || nextShape === 'pyramid' ? nextWidth / 2 : nextRadius;
    const halfY = nextShape === 'cube' || nextShape === 'pyramid' ? nextLength / 2 : nextRadius;

    // Rounded so float noise (e.g. -9.899999999999999) does not reach the config
    const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
    onChange({
      minX: round6(centerX - halfX),
      maxX: round6(centerX + halfX),
      minY: round6(centerY - halfY),
      maxY: round6(centerY + halfY),
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
    if (frozenCenterZ !== null) return frozenCenterZ;
    if (activeShape === 'sphere') {
      return baseElevation + radius3D;
    }
    return baseElevation + height3D / 2;
  };

  // 3D Projection math (Inverted Z: +Z increases upwards on canvas, centered at shape centroid)
  const project = (x: number, y: number, z: number) =>
    projectIsometric(x, y, z, { centerZ: getShapeCenterZ(), rotX, rotY, zoom, pan: panOffset, width, height });

  const dims = { width: width3D, length: length3D, height: height3D, radius: radius3D, elev: baseElevation };

  // Calculate 3D handle locations
  const getHandleCoordinates = () => shapeHandles(activeShape, dims, project);

  // Canvas Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Background and grid mesh on the ground plane
    drawGroundGrid(ctx, project, { width, height, zoom, elev: baseElevation }, palette);
    // 2. Axes
    drawAxes(ctx, project, baseElevation, palette);
    // 3. 3D shape geometry
    drawShape(ctx, project, activeShape, dims);
    // 4. Interactive handles & visual controls
    drawHandles(ctx, project, getHandleCoordinates(), { hovered: hoveredHandle, dragging: draggingHandle, dims }, palette);
    // 5. Canvas info overlay
    drawStatusText(ctx, orbitView, palette);
  }, [
    activeShape,
    width3D,
    length3D,
    height3D,
    radius3D,
    baseElevation,
    frozenCenterZ,
    rotX,
    rotY,
    zoom,
    panOffset,
    orbitView,
    hoveredHandle,
    draggingHandle,
    width,
    height,
    palette,
  ]);

  // Pointer Interaction Handlers: handle drags stay local and are committed once, on release
  const getCanvasPos = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (rect.width > 0 ? width / rect.width : 1),
      y: (e.clientY - rect.top) * (rect.height > 0 ? height / rect.height : 1),
    };
  };

  const handleAt = (x: number, y: number): HandleType => handleAtPoint(getHandleCoordinates(), x, y);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x: mouseX, y: mouseY } = getCanvasPos(e);
    const handle = handleAt(mouseX, mouseY);

    if (handle) {
      // Keep receiving pointer events when the cursor leaves the canvas mid-drag
      e.currentTarget.setPointerCapture?.(e.pointerId);
      dragMovedRef.current = false;
      setFrozenCenterZ(getShapeCenterZ());
      setDraggingHandle(handle);
      setDragStart({ x: mouseX, y: mouseY });
      setInitialShapeValues({ width: width3D, length: length3D, height: height3D, radius: radius3D });
      return;
    }

    // If Orbit View is active, clicking canvas starts camera rotation
    if (orbitView) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setIsOrbiting(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x: mouseX, y: mouseY } = getCanvasPos(e);

    // Hover handle detection when not dragging
    if (!draggingHandle && !isOrbiting) {
      setHoveredHandle(handleAt(mouseX, mouseY));
      return;
    }

    // Dragging Camera Orbit
    if (isOrbiting) {
      orbitCamera(e.clientX, e.clientY);
      return;
    }

    // Dragging Shape Handles
    const dx = mouseX - dragStart.x;
    const dy = mouseY - dragStart.y;
    if (draggingHandle === 'corner') dragCornerHandle(dx, dy);
    else if (draggingHandle === 'radius') dragRadiusHandle(dx, dy);
    else if (draggingHandle === 'height') dragHeightHandle(dy);
  };

  const orbitCamera = (clientX: number, clientY: number) => {
    const dx = clientX - dragStart.x;
    const dy = clientY - dragStart.y;
    setRotY((prev) => prev + dx * 0.01);
    setRotX((prev) => Math.max(-1.4, Math.min(1.4, prev + dy * 0.01)));
    setDragStart({ x: clientX, y: clientY });
  };

  const dragCornerHandle = (dx: number, dy: number) => {
    const { width: w0, length: l0 } = initialShapeValues;
    const factor = growFactor(project(w0 / 2, l0 / 2, baseElevation), project(0, 0, baseElevation), dx, dy);
    const newW = Math.max(10, Math.round(w0 * factor));
    const newL = Math.max(10, Math.round(l0 * factor));
    if (newW === width3D && newL === length3D) return;
    dragMovedRef.current = true;
    setWidth3D(newW);
    setLength3D(newL);
  };

  const dragRadiusHandle = (dx: number, dy: number) => {
    const r0 = initialShapeValues.radius;
    const handleZ = activeShape === 'sphere' ? baseElevation + r0 : baseElevation;
    const factor = growFactor(project(r0, 0, handleZ), project(0, 0, handleZ), dx, dy);
    const newR = Math.max(5, Math.round(r0 * factor));
    if (newR === radius3D) return;
    dragMovedRef.current = true;
    setRadius3D(newR);
  };

  // The top handle follows the cursor: the height changes by the screen pixels per Z unit of the projection
  const dragHeightHandle = (dy: number) => {
    const newH = Math.round(initialShapeValues.height + heightDragDelta(dy, { rotX, zoom, width, height }));
    if (newH === height3D) return;
    dragMovedRef.current = true;
    setHeight3D(newH);
  };

  const handlePointerUp = () => {
    if (draggingHandle && dragMovedRef.current) {
      emitChange({});
    }
    dragMovedRef.current = false;
    setDraggingHandle(null);
    setFrozenCenterZ(null);
    setIsOrbiting(false);
  };

  // Side panel inputs keep the typed text and commit a finite number on blur or Enter
  const fieldValue = (key: FieldKey, value: number) => drafts[key] ?? String(value);

  const setFieldDraft = (key: FieldKey, text: string) => setDrafts((prev) => ({ ...prev, [key]: text }));

  // Current value and setter of each side panel field
  const fieldState: Record<FieldKey, { value: number; set: (value: number) => void }> = {
    width: { value: width3D, set: setWidth3D },
    length: { value: length3D, set: setLength3D },
    radius: { value: radius3D, set: setRadius3D },
    height: { value: height3D, set: setHeight3D },
    elev: { value: baseElevation, set: setBaseElevation },
  };

  const commitField = (key: FieldKey) => {
    const raw = drafts[key];
    setDrafts(({ [key]: _committed, ...rest }) => rest);
    const val = parseFieldValue(key, raw);
    if (val === null || val === fieldState[key].value) return;
    fieldState[key].set(val);
    emitChange({ [key]: val });
  };

  const fieldProps = (key: FieldKey, value: number) => ({
    value: fieldValue(key, value),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFieldDraft(key, e.target.value),
    onBlur: () => commitField(key),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitField(key);
    },
  });

  return (
    <div className={`flex flex-col gap-3 ${fillContainer ? 'flex-1 min-h-0' : ''}`}>
      {/* Top Toolbar: Shape Selectors & Orbit View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] shrink-0">
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
                    : 'bg-[var(--c-bg4)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)]'
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
                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-600 dark:text-cyan-300'
                : 'border-[var(--c-br1)] text-[var(--c-tx3)] hover:bg-[var(--c-bg5)]'
            }`}
          >
            <Rotate3d size={13} />
            <span>{orbitView ? 'Orbit ON' : 'Orbit View'}</span>
          </Button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
            className="p-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
            className="p-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] cursor-pointer"
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
            className="p-1.5 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] cursor-pointer"
            title="Reset Camera View"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Main Container: Canvas + Side Control Panel */}
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${fillContainer ? 'flex-1 min-h-0' : ''}`}>
        {/* Canvas Column */}
        <div
          ref={canvasBoxRef}
          className={`md:col-span-2 relative rounded border border-[var(--c-br1)] overflow-hidden flex items-center justify-center ${
            fillContainer ? 'min-h-[300px]' : ''
          }`}
          style={{ background: palette.deepBackground }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => setHoveredHandle(null)}
            className={`${fillContainer ? 'absolute inset-0' : ''} w-full h-full touch-none ${canvasCursorClass(draggingHandle, hoveredHandle, orbitView)}`}
          />
        </div>

        {/* Parametric Side Panel Column */}
        <div
          className={`rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] p-3 space-y-3 flex flex-col justify-between ${
            fillContainer ? 'min-h-0 overflow-y-auto' : ''
          }`}
        >
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
                    <span className="font-mono">{width3D}</span>
                  </div>
                  <Input
                    id="width-3d-input"
                    type="number"
                    min={1}
                    {...fieldProps('width', width3D)}
                    className="h-7 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-[var(--c-tx4)]">
                    <Label htmlFor="length-3d-input">Base Length (Y)</Label>
                    <span className="font-mono">{length3D}</span>
                  </div>
                  <Input
                    id="length-3d-input"
                    type="number"
                    min={1}
                    {...fieldProps('length', length3D)}
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
                  <span className="font-mono">{radius3D}</span>
                </div>
                <Input
                  id="radius-3d-input"
                  type="number"
                  min={1}
                  {...fieldProps('radius', radius3D)}
                  className="h-7 text-xs font-mono"
                />
              </div>
            )}

            {/* Height Input (Can be negative for inverted figure) */}
            {activeShape !== 'sphere' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-[var(--c-tx4)]">
                  <Label htmlFor="height-3d-input">Height (Z)</Label>
                  <span className="font-mono">{height3D}</span>
                </div>
                <Input
                  id="height-3d-input"
                  type="number"
                  {...fieldProps('height', height3D)}
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
                <span className="font-mono">{baseElevation}</span>
              </div>
              <Input
                id="base-elev-input"
                type="number"
                {...fieldProps('elev', baseElevation)}
                className="h-7 text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
