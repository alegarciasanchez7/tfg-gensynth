import { describe, expect, it } from 'vitest';
import type { BoundaryObstacle } from '../types';
import {
  checkBoundaryCompliance,
  checkObstacleCollision,
  clampToRegion,
  isInsideRegion,
  isPointInPolygon,
  isPointOnPolygonBorder,
  polygonCentroid,
  roundIntoRegion,
  segmentsIntersect,
  validateNodeAndEdge,
} from './routeGeometry';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

const zone = (enabled = true): BoundaryObstacle => ({
  id: 'zone',
  name: 'Pond',
  type: 'OBSTACLE_POLYGON',
  points: [
    { x: 40, y: 40 },
    { x: 60, y: 40 },
    { x: 60, y: 60 },
    { x: 40, y: 60 },
  ],
  enabled,
});

const wall: BoundaryObstacle = {
  id: 'wall',
  type: 'WALL_SEGMENT',
  points: [
    { x: 50, y: 0 },
    { x: 50, y: 30 },
  ],
  enabled: true,
};

describe('isPointInPolygon', () => {
  it('detects points inside and outside a polygon', () => {
    expect(isPointInPolygon(5, 5, square)).toBe(true);
    expect(isPointInPolygon(15, 5, square)).toBe(false);
  });

  it('treats fewer than three points as no polygon', () => {
    expect(isPointInPolygon(0, 0, square.slice(0, 2))).toBe(false);
  });
});

describe('isPointOnPolygonBorder', () => {
  it('detects points on any edge, closing edge included', () => {
    expect(isPointOnPolygonBorder(10, 5, square)).toBe(true);
    expect(isPointOnPolygonBorder(0, 5, square)).toBe(true);
    expect(isPointOnPolygonBorder(5, 5, square)).toBe(false);
  });
});

describe('segmentsIntersect', () => {
  it('detects crossing and parallel segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });

  it('does not count touching at an end or overlapping along a line as a crossing', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 0 })).toBe(false);
    expect(segmentsIntersect({ x: 0, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 0 }, { x: 5, y: 10 })).toBe(false);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe(false);
  });
});

describe('checkObstacleCollision', () => {
  it('rejects a point inside an enabled forbidden zone and names it', () => {
    expect(checkObstacleCollision(null, { x: 50, y: 50 }, [zone()])).toMatch(/inside forbidden obstacle zone: "Pond"/);
  });

  it('ignores disabled obstacles', () => {
    expect(checkObstacleCollision(null, { x: 50, y: 50 }, [zone(false)])).toBeNull();
  });

  it('allows a point or a segment on the border of a forbidden zone', () => {
    expect(checkObstacleCollision(null, { x: 60, y: 50 }, [zone()])).toBeNull();
    expect(checkObstacleCollision(null, { x: 40, y: 40 }, [zone()])).toBeNull();
    expect(checkObstacleCollision({ x: 40, y: 30 }, { x: 40, y: 70 }, [zone()])).toBeNull();
    expect(checkObstacleCollision({ x: 30, y: 30 }, { x: 40, y: 40 }, [zone()])).toBeNull();
  });

  it('rejects a segment through a zone even when it only meets its corners', () => {
    expect(checkObstacleCollision({ x: 30, y: 30 }, { x: 70, y: 70 }, [zone()])).toMatch(/obstacle region/);
  });

  it('allows touching a wall end but rejects crossing it, also at an inner vertex', () => {
    expect(checkObstacleCollision({ x: 40, y: 30 }, { x: 50, y: 30 }, [wall])).toBeNull();
    // A V whose tip touches the path: no side change
    const bent: BoundaryObstacle = { ...wall, points: [{ x: 40, y: 0 }, { x: 50, y: 10 }, { x: 60, y: 0 }] };
    expect(checkObstacleCollision({ x: 30, y: 10 }, { x: 70, y: 10 }, [bent])).toBeNull();
    const zigzag: BoundaryObstacle = { ...wall, points: [{ x: 40, y: 0 }, { x: 50, y: 10 }, { x: 60, y: 20 }] };
    expect(checkObstacleCollision({ x: 60, y: 0 }, { x: 40, y: 20 }, [zigzag])).toMatch(/wall barrier/);
  });

  it('rejects a segment that crosses a wall or a zone edge', () => {
    expect(checkObstacleCollision({ x: 40, y: 10 }, { x: 60, y: 10 }, [wall])).toMatch(/wall barrier/);
    expect(checkObstacleCollision({ x: 30, y: 50 }, { x: 70, y: 50 }, [zone()])).toMatch(/obstacle region/);
    expect(checkObstacleCollision({ x: 30, y: 80 }, { x: 70, y: 80 }, [zone(), wall])).toBeNull();
  });
});

describe('checkBoundaryCompliance', () => {
  it('uses the polygon when it has at least three points', () => {
    expect(checkBoundaryCompliance(null, { x: 5, y: 5 }, square)).toBeNull();
    expect(checkBoundaryCompliance(null, { x: 15, y: 5 }, square)).toMatch(/outside the allowed boundary region/);
    expect(checkBoundaryCompliance({ x: 20, y: 5 }, { x: 5, y: 5 }, square)).toMatch(/origin node located outside/);
  });

  it('rejects a segment that leaves a concave polygon', () => {
    // A U shape: both points are inside, but the segment crosses the notch
    const u = [
      { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 20, y: 30 },
      { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 },
    ];
    expect(checkBoundaryCompliance({ x: 5, y: 20 }, { x: 25, y: 20 }, u)).toMatch(/exiting the allowed boundary region/);
  });

  it('treats every edge of the polygon as inside, right and top included', () => {
    expect(checkBoundaryCompliance(null, { x: 10, y: 5 }, square)).toBeNull();
    expect(checkBoundaryCompliance(null, { x: 5, y: 10 }, square)).toBeNull();
    expect(checkBoundaryCompliance(null, { x: 0, y: 5 }, square)).toBeNull();
    expect(checkBoundaryCompliance(null, { x: 10, y: 10 }, square)).toBeNull();
    expect(checkBoundaryCompliance(null, { x: 10.01, y: 5 }, square)).toMatch(/outside the allowed boundary region/);
  });

  it('allows a segment that touches or runs along the border', () => {
    expect(checkBoundaryCompliance({ x: 5, y: 5 }, { x: 10, y: 5 }, square)).toBeNull();
    expect(checkBoundaryCompliance({ x: 10, y: 0 }, { x: 10, y: 10 }, square)).toBeNull();
    expect(checkBoundaryCompliance({ x: 0, y: 0 }, { x: 10, y: 10 }, square)).toBeNull();
  });

  it('rejects a segment between two border points that cuts across the notch of a concave polygon', () => {
    const u = [
      { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 20, y: 30 },
      { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 },
    ];
    // Both ends on the border, through the notch corners (no proper crossing of any edge)
    expect(checkBoundaryCompliance({ x: 10, y: 30 }, { x: 20, y: 30 }, u)).toMatch(/exiting the allowed boundary region/);
    expect(checkBoundaryCompliance({ x: 0, y: 10 }, { x: 30, y: 10 }, u)).toBeNull();
  });

  it('falls back to the min/max box, leaving unset axes unlimited', () => {
    const min = { x: 0, y: 0 };
    const max = { x: 100, y: 100 };
    expect(checkBoundaryCompliance(null, { x: 50, y: 50 }, [], min, max)).toBeNull();
    expect(checkBoundaryCompliance(null, { x: 150, y: 50 }, [], min, max)).toMatch(/outside allowed boundary limits/);
    expect(checkBoundaryCompliance(null, { x: 50, y: 500 }, [], { x: 0 }, { x: 100 })).toBeNull();
  });
});

describe('validateNodeAndEdge', () => {
  it('checks the region first, then the obstacles', () => {
    const min = { x: 0, y: 0 };
    const max = { x: 100, y: 100 };
    expect(validateNodeAndEdge(null, { x: 150, y: 50 }, [zone()], [], min, max)).toMatch(/boundary limits/);
    expect(validateNodeAndEdge(null, { x: 50, y: 50 }, [zone()], [], min, max)).toMatch(/forbidden obstacle zone/);
    expect(validateNodeAndEdge({ x: 10, y: 10 }, { x: 20, y: 20 }, [zone()], [], min, max)).toBeNull();
  });
});

describe('region helpers', () => {
  const triangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];

  it('clamps a point to the nearest border of the polygon, or per axis to the box', () => {
    expect(clampToRegion({ x: 5, y: 5 }, square)).toEqual({ x: 5, y: 5 });
    expect(clampToRegion({ x: 15, y: 5 }, square)).toEqual({ x: 10, y: 5 });
    expect(clampToRegion({ x: 60, y: 60 }, triangle)).toEqual({ x: 50, y: 50 });
    expect(clampToRegion({ x: 150, y: -20 }, [], { x: 0, y: 0 }, { x: 100, y: 100 })).toEqual({ x: 100, y: 0 });
    expect(clampToRegion({ x: 150, y: 500 }, [], { x: 0 }, { x: 100 })).toEqual({ x: 100, y: 500 });
  });

  it('rounds a clamped point so that it stays inside the region', () => {
    // The nearest border point of the slanted edge, rounded to the nearest decimal, falls outside
    const slanted = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 7 }];
    const onBorder = clampToRegion({ x: 2, y: 3 }, slanted);
    const rounded = roundIntoRegion(onBorder, 1, slanted);
    expect(isInsideRegion(rounded, slanted)).toBe(true);
    expect(Math.abs(rounded.x - onBorder.x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(rounded.y - onBorder.y)).toBeLessThanOrEqual(0.1);
    expect(roundIntoRegion({ x: 50.04, y: 20 }, 1, triangle)).toEqual({ x: 50, y: 20 });
  });

  it('computes the area centroid of a polygon', () => {
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 });
    const c = polygonCentroid(triangle);
    expect(c.x).toBeCloseTo(33.333, 2);
    expect(c.y).toBeCloseTo(33.333, 2);
  });
});
