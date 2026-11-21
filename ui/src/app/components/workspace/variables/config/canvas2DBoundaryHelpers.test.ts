import { describe, it, expect } from 'vitest';
import type { BoundaryObstacle } from '../../../../types';
import { DARK_CANVAS_PALETTE } from './canvasPalette';
import {
  boundaryHandleStyle,
  canvasCursorFor,
  decimalsFor,
  drawBoundaryPolygon,
  drawGridAndAxes,
  drawObstacle,
  edgeMenuTarget,
  interactionFlags,
  isPointInsidePolygon,
  nearestObstacleEdge,
  nearestObstacleVertex,
  nearestPointIndex,
  nearestPolygonEdge,
  obstacleHandleStyle,
  obstacleShapeAt,
  pointToSegmentDistance,
  presetShapePoints,
  roundTo,
  sameHitTarget,
  vertexMenuTarget,
  type CanvasView,
  type ObstacleDrawState,
} from './canvas2DBoundaryHelpers';

/** World units are canvas pixels. */
const view: CanvasView = {
  width: 200,
  height: 100,
  pxPerUnit: 1,
  toCanvasX: (v) => v,
  toCanvasY: (v) => v,
  fromCanvasX: (px) => px,
  fromCanvasY: (py) => py,
};

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
  const texts = () => calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  return { ctx, calls, texts };
}

const wall: BoundaryObstacle = { id: 'w', name: 'North', type: 'WALL_SEGMENT', points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }], enabled: true };
const zone: BoundaryObstacle = { id: 'z', type: 'OBSTACLE_POLYGON', points: [{ x: 100, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 40 }, { x: 100, y: 40 }], enabled: true };
const disabled: BoundaryObstacle = { id: 'd', type: 'OBSTACLE_POLYGON', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], enabled: false };

const idle: ObstacleDrawState = { editMode: 'BOUNDARIES', isSelected: false, isShapeDragging: false, draggingPointIndex: null, hoveredPointIndex: null };

describe('canvas2DBoundaryHelpers', () => {
  it('tests points against a polygon and measures segment distances', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(isPointInsidePolygon(5, 5, square)).toBe(true);
    expect(isPointInsidePolygon(15, 5, square)).toBe(false);
    expect(pointToSegmentDistance(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(pointToSegmentDistance(-4, 3, 0, 0, 10, 0)).toBe(5);
    expect(pointToSegmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it('rounds to the decimals of a resolution', () => {
    expect(decimalsFor(0.2)).toBe(1);
    expect(decimalsFor(5)).toBe(0);
    expect(decimalsFor(1e-9)).toBe(6);
    expect(decimalsFor(0)).toBe(1);
    expect(String(roundTo(1.23456, 2))).toBe('1.23');
  });

  it('styles the handles by state', () => {
    expect(boundaryHandleStyle(true, true, true)).toEqual({ fill: '#f472b6', radius: 9 });
    expect(boundaryHandleStyle(false, true, false)).toEqual({ fill: '#ffffff', radius: 9 });
    expect(boundaryHandleStyle(false, false, true)).toEqual({ fill: '#e9d5ff', radius: 6 });
    expect(boundaryHandleStyle(false, false, false)).toEqual({ fill: '#a855f7', radius: 4 });
    expect(obstacleHandleStyle(true, false, false, 'sel').fill).toBe('#fef08a');
    expect(obstacleHandleStyle(false, true, false, 'sel').fill).toBe('#ffffff');
    expect(obstacleHandleStyle(false, false, true, 'sel').fill).toBe('sel');
    expect(obstacleHandleStyle(false, false, false, 'sel').fill).toBe('#f87171');
  });

  it('derives the drag / hover flags and the cursor', () => {
    expect(interactionFlags(null, null)).toEqual({
      draggingBoundaryVertexIndex: null,
      draggingObstacleTarget: null,
      draggingObstacleShapeIndex: null,
      hoveredBoundaryVertexIndex: null,
      hoveredObstacleTarget: null,
      hoveredObstacleShape: null,
    });
    const flags = interactionFlags({ kind: 'obstacleShape', obsIndex: 2, startMouse: { x: 0, y: 0 }, startPoints: [] }, { kind: 'boundary', index: 1 });
    expect(flags.draggingObstacleShapeIndex).toBe(2);
    expect(flags.hoveredBoundaryVertexIndex).toBe(1);
    expect(interactionFlags({ kind: 'boundary', index: 3, offset: { x: 0, y: 0 } }, { kind: 'obstacleShape', obsIndex: 4 })).toMatchObject({
      draggingBoundaryVertexIndex: 3,
      hoveredObstacleShape: 4,
    });

    expect(canvasCursorFor({ kind: 'pan', start: { x: 0, y: 0 } }, null)).toBe('grabbing');
    expect(canvasCursorFor(null, { kind: 'boundary', index: 0 })).toBe('grab');
    expect(canvasCursorFor(null, { kind: 'obstacleVertex', obsIndex: 0, pointIndex: 1 })).toBe('grab');
    expect(canvasCursorFor(null, { kind: 'obstacleShape', obsIndex: 0 })).toBe('pointer');
    expect(canvasCursorFor(null, null)).toBe('crosshair');
    expect(sameHitTarget({ kind: 'boundary', index: 1 }, { kind: 'boundary', index: 1 })).toBe(true);
    expect(sameHitTarget({ kind: 'boundary', index: 1 }, null)).toBe(false);
  });

  it('builds the preset shapes around a centre', () => {
    const round = (v: number) => Math.round(v * 100) / 100;
    expect(presetShapePoints('square', 0, 0, 2, 1, round)).toEqual([{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 1 }, { x: -2, y: 1 }]);
    expect(presetShapePoints('triangle', 0, 0, 2, 1, round)).toEqual([{ x: 0, y: 1 }, { x: 2, y: -1 }, { x: -2, y: -1 }]);
    const circle = presetShapePoints('circle', 10, 10, 5, 5, round);
    expect(circle).toHaveLength(12);
    expect(circle[0]).toEqual({ x: 15, y: 10 });
    expect(circle[3]).toEqual({ x: 10, y: 15 });
  });

  it('finds the nearest vertex within the hit radius', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 12, y: 0 }];
    expect(nearestPointIndex(points, view, 11.5, 0, 5)).toBe(2);
    expect(nearestPointIndex(points, view, 50, 50, 5)).toBeNull();
    expect(nearestObstacleVertex([disabled, wall], view, 49, 11, 5)).toEqual({ obsIndex: 1, pointIndex: 1 });
    expect(nearestObstacleVertex([disabled], view, 0, 0, 5)).toBeNull();
  });

  it('grabs a wall near its line and a zone from inside, the topmost one on ties', () => {
    expect(obstacleShapeAt([wall, zone], view, 30, 15)).toBe(0);
    expect(obstacleShapeAt([wall, zone], view, 30, 30)).toBeNull();
    expect(obstacleShapeAt([wall, zone], view, 120, 20)).toBe(1);
    expect(obstacleShapeAt([zone, { ...zone, id: 'z2' }], view, 120, 20)).toBe(1);
    expect(obstacleShapeAt([disabled], view, 2, 1)).toBeNull();
  });

  it('finds the nearest region and obstacle edges for the context menu', () => {
    // The closing edge of a zone counts, a wall has no closing edge
    expect(nearestObstacleEdge([zone], view, 100, 20)).toEqual({ obstacleIndex: 0, edgeIndex: 3, dist: 0 });
    expect(nearestObstacleEdge([wall], view, 30, 25)).toBeNull();
    expect(nearestObstacleEdge([wall], view, 52, 25)).toEqual({ obstacleIndex: 0, edgeIndex: 1, dist: 2 });
    expect(nearestObstacleEdge([disabled, { ...wall, points: [{ x: 0, y: 0 }] }, { ...zone, points: zone.points.slice(0, 2) }], view, 0, 0)).toBeNull();
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(nearestPolygonEdge(square, view, 5, 9)).toEqual({ edgeIndex: 2, dist: 1 });
    expect(nearestPolygonEdge(square, view, 50, 50)).toBeNull();
  });

  it('picks the vertex the menu targets: region vertices win only in BOUNDARIES mode', () => {
    const obstacleVertex = { obsIndex: 1, pointIndex: 2 };
    expect(vertexMenuTarget('BOUNDARIES', 0, obstacleVertex)).toEqual({ type: 'boundary_vertex', boundaryIndex: 0 });
    expect(vertexMenuTarget('OBSTACLES', 0, obstacleVertex)).toEqual({ type: 'obstacle_vertex', obstacleIndex: 1, obstaclePointIndex: 2 });
    expect(vertexMenuTarget('OBSTACLES', 0, null)).toEqual({ type: 'boundary_vertex', boundaryIndex: 0 });
    expect(vertexMenuTarget('BOUNDARIES', null, null)).toBeNull();
  });

  it('picks the nearest edge, the edited kind on a tie', () => {
    const boundaryEdge = { edgeIndex: 1, dist: 3 };
    const obstacleEdge = { obstacleIndex: 2, edgeIndex: 0, dist: 3 };
    expect(edgeMenuTarget('BOUNDARIES', boundaryEdge, obstacleEdge)).toEqual({ type: 'boundary_edge', boundaryIndex: 1 });
    expect(edgeMenuTarget('OBSTACLES', boundaryEdge, obstacleEdge)).toEqual({ type: 'obstacle_edge', obstacleIndex: 2, obstaclePointIndex: 0 });
    expect(edgeMenuTarget('OBSTACLES', { edgeIndex: 1, dist: 1 }, obstacleEdge)).toEqual({ type: 'boundary_edge', boundaryIndex: 1 });
    expect(edgeMenuTarget('OBSTACLES', boundaryEdge, null)).toEqual({ type: 'boundary_edge', boundaryIndex: 1 });
    expect(edgeMenuTarget('BOUNDARIES', null, null)).toBeNull();
  });

  it('draws the background, the grid and the axis names', () => {
    const { ctx, calls, texts } = recordingContext();
    drawGridAndAxes(ctx, view, DARK_CANVAS_PALETTE);
    expect(calls[0]).toEqual(['clearRect', 0, 0, 200, 100]);
    expect(calls).toContainEqual(['fillRect', 0, 0, 200, 100]);
    expect(texts()).toEqual(expect.arrayContaining(['X →', 'Y ↑']));
  });

  it('draws the region polygon, dashed and with the tooltip of the hovered vertex', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const { ctx, calls, texts } = recordingContext();
    drawBoundaryPolygon(ctx, view, square, { editMode: 'OBSTACLES', hoveredIndex: 1, draggingIndex: null }, DARK_CANVAS_PALETTE);
    expect(calls).toContainEqual(['setLineDash', [4, 4]]);
    expect(texts()).toEqual(['(10, 0)']);

    const empty = recordingContext();
    drawBoundaryPolygon(empty.ctx, view, square.slice(0, 2), { editMode: 'BOUNDARIES', hoveredIndex: null, draggingIndex: null }, DARK_CANVAS_PALETTE);
    expect(empty.calls).toEqual([]);
  });

  it('draws a selected wall with its name badge and a selected zone with the default name', () => {
    const selectedWall = recordingContext();
    drawObstacle(selectedWall.ctx, view, wall, { ...idle, isSelected: true, hoveredPointIndex: 0 }, DARK_CANVAS_PALETTE);
    expect(selectedWall.texts()).toEqual(['(10, 10)', 'North']);

    const plainWall = recordingContext();
    drawObstacle(plainWall.ctx, view, { ...wall, name: undefined }, { ...idle, editMode: 'OBSTACLES' }, DARK_CANVAS_PALETTE);
    expect(plainWall.calls).toContainEqual(['=', 'strokeStyle', '#ef4444']);
    expect(plainWall.calls).toContainEqual(['=', 'lineWidth', 3]);
    expect(plainWall.texts()).toEqual([]);

    const selectedZone = recordingContext();
    drawObstacle(selectedZone.ctx, view, zone, { ...idle, isSelected: true, draggingPointIndex: 2 }, DARK_CANVAS_PALETTE);
    expect(selectedZone.texts()).toEqual(['(140, 40)', 'Zone']);

    const draggedZone = recordingContext();
    drawObstacle(draggedZone.ctx, view, zone, { ...idle, isShapeDragging: true }, DARK_CANVAS_PALETTE);
    expect(draggedZone.calls).toContainEqual(['=', 'fillStyle', 'rgba(251, 191, 36, 0.35)']);
  });

  it('skips disabled obstacles and shapes with too few points', () => {
    for (const obs of [disabled, { ...wall, points: [{ x: 0, y: 0 }] }, { ...zone, points: zone.points.slice(0, 2) }, { ...zone, points: [] }]) {
      const { ctx, calls } = recordingContext();
      drawObstacle(ctx, view, obs, idle, DARK_CANVAS_PALETTE);
      expect(calls).toEqual([]);
    }
  });
});
