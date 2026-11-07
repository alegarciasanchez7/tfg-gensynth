import { describe, expect, it } from 'vitest';
import type { BoundaryObstacle } from '../types';
import type { FullPoint } from './pointDefaults';
import {
  adjacentSegments,
  checkMove,
  findPathIssues,
  pathSegments,
  planeRules,
  shape3DRules,
  validatePathChange,
} from './waypointPath';

const p = (x: number, y: number, z = 0): FullPoint => ({ x, y, z });

// A vertical wall at x = 50 from y = 40 to y = 100
const wall: BoundaryObstacle = {
  id: 'wall',
  name: 'Wall',
  type: 'WALL_SEGMENT',
  enabled: true,
  points: [{ x: 50, y: 40 }, { x: 50, y: 100 }],
};
const rules = planeRules({ minPoint: { x: 0, y: 0 }, maxPoint: { x: 100, y: 100 }, polygon: [], obstacles: [wall] });

describe('pathSegments / adjacentSegments', () => {
  it('adds the closing segment only when the path loops with 3 or more waypoints', () => {
    const three = [p(0, 0), p(1, 0), p(1, 1)];
    expect(pathSegments(three, true).map((s) => s.index)).toEqual([0, 1, 2]);
    expect(pathSegments(three, false).map((s) => s.index)).toEqual([0, 1]);
    expect(pathSegments(three.slice(0, 2), true).map((s) => s.index)).toEqual([0]);
    expect(adjacentSegments(3, true, 0)).toEqual([0, 2]);
    expect(adjacentSegments(3, false, 0)).toEqual([0]);
    expect(adjacentSegments(3, false, 1)).toEqual([0, 1]);
  });
});

describe('findPathIssues', () => {
  it('flags waypoints outside the region and segments crossing a wall, closing segment included', () => {
    const path = [p(10, 60), p(150, 60), p(90, 60), p(90, 90)];
    const issues = findPathIssues(path, true, rules);
    expect(issues.points.map(Boolean)).toEqual([false, true, false, false]);
    // 0-1 and 1-2 touch the invalid waypoint (not checked); 2-3 is fine; 3-0 crosses the wall
    expect(issues.segments.map(Boolean)).toEqual([false, false, false, true]);
    expect(issues.segments[3]).toMatch(/wall barrier: "Wall"/);
  });
});

describe('validatePathChange', () => {
  it('only checks what the change adds', () => {
    const path = [p(10, 60), p(90, 60)];
    // Already crossing the wall: an unrelated append is accepted
    expect(validatePathChange(path, false, [...path, p(90, 10)], false, rules)).toBeNull();
    expect(validatePathChange(path, false, [...path, p(10, 90)], false, rules)).toMatch(/wall barrier/);
  });

  it('lets an invalid waypoint be fixed while its neighbour is still invalid', () => {
    const path = [p(150, 10), p(150, 20), p(10, 10)];
    expect(validatePathChange(path, false, [p(90, 10), p(150, 20), p(10, 10)], false, rules)).toBeNull();
  });

  it('ignores an altitude-only change in 2D / Geospatial', () => {
    const path = [p(10, 60, 5), p(90, 60, 5)];
    expect(validatePathChange(path, false, [p(10, 60, 9), p(90, 60, 5)], false, rules)).toBeNull();
  });

  it('checks 3D waypoints against the shape, with their number in the message', () => {
    const sphere = shape3DRules({
      minPoint: { x: 0, y: 0, z: 0 },
      maxPoint: { x: 100, y: 100, z: 100 },
      shape3DType: 'sphere',
      shape3DRadius: 10,
    });
    const path = [p(50, 50, 10)];
    expect(validatePathChange(path, true, [p(50, 50, 10), p(90, 50, 10)], true, sphere)).toBe(
      'Waypoint 2 is outside the 3D region (sphere).'
    );
    expect(validatePathChange(path, true, [p(50, 50, 10), p(55, 50, 12)], true, sphere)).toBeNull();
  });
});

describe('checkMove', () => {
  it('reports the rejection and the segments to draw in red', () => {
    const path = [p(10, 60), p(30, 60), p(10, 90)];
    const crossing = checkMove(path, false, 1, p(90, 60), rules);
    expect(crossing.error).toMatch(/wall barrier/);
    expect(crossing).toMatchObject({ pointBad: false, badSegments: [0, 1] });

    const outside = checkMove(path, false, 1, p(150, 60), rules);
    expect(outside).toMatchObject({ pointBad: true, badSegments: [] });

    expect(checkMove(path, false, 1, p(20, 50), rules)).toEqual({ error: null, pointBad: false, badSegments: [] });
  });
});
