import { describe, expect, it } from 'vitest';
import type { BoundaryObstacle } from '../types';
import {
  checkBoundaryCompliance,
  checkObstacleCollision,
  isPointInPolygon,
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

describe('segmentsIntersect', () => {
  it('detects crossing and parallel segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });
});

describe('checkObstacleCollision', () => {
  it('rejects a point inside an enabled forbidden zone and names it', () => {
    expect(checkObstacleCollision(null, { x: 50, y: 50 }, [zone()])).toMatch(/inside forbidden obstacle zone: "Pond"/);
  });

  it('ignores disabled obstacles', () => {
    expect(checkObstacleCollision(null, { x: 50, y: 50 }, [zone(false)])).toBeNull();
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
