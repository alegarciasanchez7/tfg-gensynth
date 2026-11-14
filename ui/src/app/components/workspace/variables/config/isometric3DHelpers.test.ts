import { describe, it, expect } from 'vitest';
import type { Shape3DType } from '../../../../types';
import { DARK_CANVAS_PALETTE } from './canvasPalette';
import {
  drawAxes,
  drawGroundGrid,
  drawHandles,
  drawShape,
  drawStatusText,
  growFactor,
  handleAt,
  handleColor,
  heightDragDelta,
  parseFieldValue,
  projectIsometric,
  shapeHandles,
  type ProjectFn,
  type ShapeDimensions,
} from './isometric3DHelpers';

/** A stub 2D context that records method calls (name + arguments) and style assignments. */
function recordingContext() {
  const calls: unknown[][] = [];
  const state: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args: unknown[]) => calls.push([String(key), ...args]);
    },
    set(target, key, value) {
      target[key] = value;
      calls.push(['=', String(key), value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const count = (name: string) => calls.filter((c) => c[0] === name).length;
  const texts = () => calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  return { ctx, calls, count, texts };
}

/** Top view: x goes right, z goes up the screen. */
const flat: ProjectFn = (x, y, z) => ({ x, y: y - z });

const dims: ShapeDimensions = { width: 100, length: 60, height: 40, radius: 20, elev: 5 };

describe('isometric3DHelpers', () => {
  it('projects the centre to the middle of the canvas and applies zoom and pan', () => {
    const camera = { centerZ: 50, rotX: 0, rotY: 0, zoom: 1, pan: { x: 0, y: 0 }, width: 300, height: 300 };
    expect(projectIsometric(0, 0, 50, camera)).toEqual({ x: 150, y: 150 });
    // Without rotation x = 100 is one normalised unit, scale = 300 / 3
    expect(projectIsometric(100, 0, 50, camera)).toEqual({ x: 250, y: 150 });
    const zoomed = projectIsometric(100, 0, 50, { ...camera, zoom: 2, pan: { x: 10, y: -5 } });
    expect(zoomed).toEqual({ x: 360, y: 145 });
    // +Z goes up on the canvas
    expect(projectIsometric(0, 0, 200, camera).y).toBeLessThan(150);
  });

  it('places the handles each shape has', () => {
    expect(shapeHandles('cube', dims, flat)).toEqual({ cornerHandle: { x: 50, y: 25 }, radiusHandle: null, heightHandle: { x: 0, y: -45 } });
    expect(shapeHandles('pyramid', dims, flat).cornerHandle).toEqual({ x: 50, y: 25 });
    expect(shapeHandles('cone', dims, flat)).toEqual({ cornerHandle: null, radiusHandle: { x: 20, y: -5 }, heightHandle: { x: 0, y: -45 } });
    expect(shapeHandles('sphere', dims, flat)).toEqual({ cornerHandle: null, radiusHandle: { x: 20, y: -25 }, heightHandle: null });
    expect(shapeHandles('custom' as Shape3DType, dims, flat)).toEqual({ cornerHandle: null, radiusHandle: null, heightHandle: null });
  });

  it('finds the handle under the pointer, corner first', () => {
    const handles = { cornerHandle: { x: 0, y: 0 }, radiusHandle: { x: 5, y: 0 }, heightHandle: { x: 100, y: 100 } };
    expect(handleAt(handles, 3, 0)).toBe('corner');
    expect(handleAt({ ...handles, cornerHandle: null }, 3, 0)).toBe('radius');
    expect(handleAt(handles, 105, 100)).toBe('height');
    expect(handleAt(handles, 50, 50)).toBeNull();
  });

  it('scales a shape by the cursor movement along the handle direction', () => {
    const center = { x: 0, y: 0 };
    expect(growFactor({ x: 10, y: 0 }, center, 10, 0)).toBe(2);
    expect(growFactor({ x: 10, y: 0 }, center, 0, 10)).toBe(1);
    expect(growFactor({ x: 10, y: 0 }, center, -30, 0)).toBe(0);
    expect(growFactor(center, center, 10, 10)).toBe(1);
  });

  it('turns a vertical drag into a height change, also when the camera looks straight down', () => {
    const camera = { rotX: 0, zoom: 1, width: 300, height: 300 };
    const pxPerZ = (2 / 300) * 100 * 0.7;
    expect(heightDragDelta(-14, camera)).toBeCloseTo(14 / pxPerZ);
    expect(heightDragDelta(10, { ...camera, rotX: Math.PI / 2 })).toBe(-12);
  });

  it('parses the side panel fields, with a minimum of 1 for the sizes', () => {
    expect(parseFieldValue('width', undefined)).toBeNull();
    expect(parseFieldValue('width', '  ')).toBeNull();
    expect(parseFieldValue('length', 'abc')).toBeNull();
    expect(parseFieldValue('radius', '0')).toBe(1);
    expect(parseFieldValue('width', '37.5')).toBe(37.5);
    expect(parseFieldValue('height', '-20')).toBe(-20);
    expect(parseFieldValue('elev', '0')).toBe(0);
  });

  it('colours a handle by its state', () => {
    const colors = { dragging: 'd', hovered: 'h', idle: 'i' };
    expect(handleColor(true, true, colors)).toBe('d');
    expect(handleColor(false, true, colors)).toBe('h');
    expect(handleColor(false, false, colors)).toBe('i');
  });

  it('draws the background, the ground grid and the axes', () => {
    const { ctx, calls, texts } = recordingContext();
    drawGroundGrid(ctx, flat, { width: 300, height: 200, zoom: 1, elev: 0 }, DARK_CANVAS_PALETTE);
    drawAxes(ctx, flat, 0, DARK_CANVAS_PALETTE);
    expect(calls[0]).toEqual(['clearRect', 0, 0, 300, 200]);
    expect(texts()).toEqual(['-150', '-100', '-50', '0', '50', '100', '150', 'X', 'Y', '+Z']);
  });

  it('draws every shape', () => {
    const cube = recordingContext();
    drawShape(cube.ctx, flat, 'cube', dims);
    expect(cube.count('fill')).toBe(2);
    expect(cube.count('stroke')).toBe(3);

    const pyramid = recordingContext();
    drawShape(pyramid.ctx, flat, 'pyramid', dims);
    expect(pyramid.count('stroke')).toBe(4);

    const cone = recordingContext();
    drawShape(cone.ctx, flat, 'cone', dims);
    expect(cone.count('lineTo')).toBe(15 + 4);

    const sphere = recordingContext();
    drawShape(sphere.ctx, flat, 'sphere', dims);
    expect(sphere.calls).toContainEqual(['arc', 0, -25, 20, 0, Math.PI * 2]);

    const unknown = recordingContext();
    drawShape(unknown.ctx, flat, 'custom' as Shape3DType, dims);
    expect(unknown.calls).toEqual([]);
  });

  it('labels only the hovered or dragged handle', () => {
    const handles = shapeHandles('cone', dims, flat);
    const hovered = recordingContext();
    drawHandles(hovered.ctx, flat, handles, { hovered: 'radius', dragging: null, dims }, DARK_CANVAS_PALETTE);
    expect(hovered.texts()).toEqual(['Radius: 20']);

    const dragged = recordingContext();
    drawHandles(dragged.ctx, flat, handles, { hovered: null, dragging: 'height', dims }, DARK_CANVAS_PALETTE);
    expect(dragged.texts()).toEqual(['Height: 40']);
    expect(dragged.calls).toContainEqual(['setLineDash', [3, 3]]);

    const corner = recordingContext();
    drawHandles(corner.ctx, flat, shapeHandles('cube', dims, flat), { hovered: 'corner', dragging: null, dims }, DARK_CANVAS_PALETTE);
    expect(corner.texts()).toEqual(['Base: 100 × 60']);

    const idle = recordingContext();
    drawHandles(idle.ctx, flat, handles, { hovered: null, dragging: null, dims }, DARK_CANVAS_PALETTE);
    expect(idle.texts()).toEqual([]);
  });

  it('shows the mode hint', () => {
    const orbit = recordingContext();
    drawStatusText(orbit.ctx, true, DARK_CANVAS_PALETTE);
    expect(orbit.texts()).toEqual(['Orbit View Active: Drag canvas to rotate camera']);
    const edit = recordingContext();
    drawStatusText(edit.ctx, false, DARK_CANVAS_PALETTE);
    expect(edit.texts()).toEqual(['Handle Edit Mode: Drag corner/top handle']);
  });
});
