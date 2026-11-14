import { describe, expect, it } from 'vitest';
import type { Shape3DParams } from '../../../../core/shape3D';
import { newWaypointCandidates, pathProblemsNotice, regionGrid, shiftedCandidates } from './waypointPlacement';

const box = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
const shape: Shape3DParams = { minPoint: { x: 0, y: 0, z: 0 }, maxPoint: { x: 10, y: 10, z: 10 }, shape3DType: 'cube' };

describe('shiftedCandidates', () => {
  it('shifts the last waypoint by 5% first, then tries the diagonal shifts', () => {
    const candidates = shiftedCandidates({ x: 50, y: 50, z: 3 }, box, 3);
    expect(candidates).toHaveLength(13);
    expect(candidates[0]).toEqual({ x: 55, y: 55, z: 3 });
    expect(candidates[1]).toEqual({ x: 55, y: 55, z: 3 });
    expect(candidates[2]).toEqual({ x: 55, y: 45, z: 3 });
    expect(candidates[12]).toEqual({ x: 30, y: 30, z: 3 });
  });

  it('shifts backwards at the border and keeps every candidate inside the box', () => {
    const candidates = shiftedCandidates({ x: 99, y: 100, z: 0 }, box, 0);
    expect(candidates[0]).toEqual({ x: 94, y: 95, z: 0 });
    for (const c of candidates) {
      expect(c.x).toBeLessThanOrEqual(100);
      expect(c.y).toBeLessThanOrEqual(100);
    }
  });
});

describe('regionGrid', () => {
  it('gives the cell centres nearest to the anchor first', () => {
    const grid = regionGrid(box, 1, { x: 0, y: 0 }, 2);
    expect(grid).toHaveLength(4);
    expect(grid[0]).toEqual({ x: 25, y: 25, z: 1 });
    expect(grid[3]).toEqual({ x: 75, y: 75, z: 1 });
  });
});

describe('newWaypointCandidates', () => {
  it('starts at the region centre on an empty plane path, then the centre again and the grid', () => {
    const candidates = newWaypointCandidates({ box, last: null, z: 0, hasVisual: true, polygon: [], shape });
    expect(candidates[0]).toEqual({ x: 50, y: 50, z: 0 });
    expect(candidates[1]).toEqual({ x: 50, y: 50, z: 0 });
    expect(candidates).toHaveLength(2 + 16 * 16);
  });

  it('tries the polygon centroid on a plane with a polygon', () => {
    const polygon = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 30 }];
    const candidates = newWaypointCandidates({ box, last: { x: 10, y: 10, z: 2 }, z: 2, hasVisual: true, polygon, shape });
    expect(candidates[13]).toEqual({ x: 10, y: 10, z: 2 });
    expect(candidates[14]).toEqual({ x: 50, y: 50, z: 2 });
  });

  it('ends with a point inside the shape in 3D', () => {
    const candidates = newWaypointCandidates({ box, last: null, z: 0, hasVisual: false, polygon: [], shape });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({ x: 50, y: 50, z: 0 });
  });
});

describe('pathProblemsNotice', () => {
  it('is null when there are no problems', () => {
    expect(pathProblemsNotice(0, 0, true)).toBeNull();
  });

  it('describes the invalid waypoints of a plane and of a 3D region', () => {
    expect(pathProblemsNotice(1, 0, true)).toBe(
      '1 waypoint is outside the region or in a forbidden zone (in red). The generator follows the path anyway.'
    );
    expect(pathProblemsNotice(2, 0, false)).toBe('2 waypoints are outside the 3D region (in red). The generator follows the path anyway.');
  });

  it('joins the waypoint and segment problems', () => {
    expect(pathProblemsNotice(1, 2, true)).toBe(
      '1 waypoint is outside the region or in a forbidden zone and 2 segments leave the region or cross an obstacle (in red). The generator follows the path anyway.'
    );
    expect(pathProblemsNotice(0, 1, true)).toBe(
      '1 segment leaves the region or crosses an obstacle (in red). The generator follows the path anyway.'
    );
  });
});
