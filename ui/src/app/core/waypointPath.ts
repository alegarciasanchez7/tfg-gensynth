import type { BoundaryObstacle, Point3DCoord } from '../types';
import type { FullPoint } from './pointDefaults';
import { validateNodeAndEdge } from './routeGeometry';
import { isInsideShape3D, type Shape3DParams } from './shape3D';

/**
 * Validation of a waypoint path, shared by the waypoint editor and its visual editors. The Core
 * does not clamp waypoints (it follows them as given), so these rules are the only guard.
 */

/** How waypoints and segments are checked. Each check returns the problem, or null when valid. */
export interface PathRules {
  checkPoint: (p: FullPoint, index: number) => string | null;
  /** null: segments are not checked (3D: the shapes are convex, so a segment between inside points stays inside). */
  checkSegment: ((a: FullPoint, b: FullPoint) => string | null) | null;
  /** Whether Z is part of the check (3D); otherwise an altitude edit is not a change of position. */
  usesZ: boolean;
}

/** Region of a 2D or Geospatial path: the polygon (>= 3 points) or the min/max box, and the obstacles. */
export interface PlaneRegion {
  minPoint: Point3DCoord;
  maxPoint: Point3DCoord;
  polygon: Point3DCoord[];
  obstacles: BoundaryObstacle[];
}

/** Route-graph validation messages reworded for waypoints. */
export const waypointMessage = (msg: string) =>
  msg.replace(/an origin node/g, 'a waypoint').replace(/route node/g, 'waypoint').replace(/route edge/g, 'path segment');

/** Rules of a 2D / Geospatial path: inside the region and outside the enabled obstacles. */
export const planeRules = ({ minPoint, maxPoint, polygon, obstacles }: PlaneRegion): PathRules => ({
  checkPoint: (p) => {
    const error = validateNodeAndEdge(null, p, obstacles, polygon, minPoint, maxPoint);
    return error && waypointMessage(error);
  },
  checkSegment: (a, b) => {
    const error = validateNodeAndEdge(a, b, obstacles, polygon, minPoint, maxPoint);
    return error && waypointMessage(error);
  },
  usesZ: false,
});

/** Rules of a 3D path: every waypoint inside the 3D shape. */
export const shape3DRules = (shape: Shape3DParams): PathRules => ({
  checkPoint: (p, index) =>
    isInsideShape3D(p, shape) ? null : `Waypoint ${index + 1} is outside the 3D region (${shape.shape3DType ?? 'cube'}).`,
  checkSegment: null,
  usesZ: true,
});

/** A segment of the path: from waypoint `index` to the next one (the last one closes the loop). */
export interface PathSegment {
  index: number;
  a: FullPoint;
  b: FullPoint;
}

/** Segments the point travels: consecutive waypoints, plus last → first when the path loops. */
export const pathSegments = (points: FullPoint[], loop: boolean): PathSegment[] => {
  const segments: PathSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) segments.push({ index: i, a: points[i], b: points[i + 1] });
  if (loop && points.length >= 3) segments.push({ index: points.length - 1, a: points[points.length - 1], b: points[0] });
  return segments;
};

const keyOf = (rules: PathRules) => (p: FullPoint) => (rules.usesZ ? `${p.x},${p.y},${p.z}` : `${p.x},${p.y}`);

/**
 * Checks what a change adds to the path: every new waypoint must be valid, and every new segment
 * whose two ends are valid must be too. What was already there is not re-checked, and a segment
 * touching an old invalid waypoint is skipped (that waypoint is already flagged), so an invalid
 * path never blocks an unrelated edit or the fix of one waypoint at a time.
 */
export const validatePathChange = (
  prev: FullPoint[],
  prevLoop: boolean,
  next: FullPoint[],
  nextLoop: boolean,
  rules: PathRules,
): string | null => {
  const pointKey = keyOf(rules);
  const segmentKey = (a: FullPoint, b: FullPoint) => {
    const ka = pointKey(a);
    const kb = pointKey(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  const oldPoints = new Set(prev.map(pointKey));
  const oldInvalid = new Set(prev.filter((p, i) => rules.checkPoint(p, i) !== null).map(pointKey));
  for (let i = 0; i < next.length; i++) {
    if (oldPoints.has(pointKey(next[i]))) continue;
    const error = rules.checkPoint(next[i], i);
    if (error) return error;
  }
  const checkSegment = rules.checkSegment;
  if (!checkSegment) return null;
  const oldSegments = new Set(pathSegments(prev, prevLoop).map(({ a, b }) => segmentKey(a, b)));
  for (const { a, b } of pathSegments(next, nextLoop)) {
    if (oldSegments.has(segmentKey(a, b))) continue;
    if (oldInvalid.has(pointKey(a)) || oldInvalid.has(pointKey(b))) continue;
    const error = checkSegment(a, b);
    if (error) return error;
  }
  return null;
};

/** Problems of a stored path: per waypoint, and per segment (indexed like {@link PathSegment}). */
export interface PathIssues {
  points: (string | null)[];
  segments: (string | null)[];
}

/** Finds every invalid waypoint and segment of a path. A segment is only checked when both its ends are valid. */
export const findPathIssues = (points: FullPoint[], loop: boolean, rules: PathRules): PathIssues => {
  const pointIssues = points.map((p, i) => rules.checkPoint(p, i));
  const segmentIssues: (string | null)[] = points.map(() => null);
  const checkSegment = rules.checkSegment;
  if (checkSegment) {
    for (const { index, a, b } of pathSegments(points, loop)) {
      const bIndex = (index + 1) % points.length;
      if (pointIssues[index] || pointIssues[bIndex]) continue;
      segmentIssues[index] = checkSegment(a, b);
    }
  }
  return { points: pointIssues, segments: segmentIssues };
};

/** Indices of the segments that start or end at waypoint `index`. */
export const adjacentSegments = (count: number, loop: boolean, index: number): number[] =>
  pathSegments(Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0 })), loop)
    .map((s) => s.index)
    .filter((s) => s === index || (s + 1) % count === index);

/** Live result of moving a waypoint: the rejection (null when the move is valid) and what to draw in red. */
export interface MoveCheck {
  error: string | null;
  pointBad: boolean;
  badSegments: number[];
}

/** Checks moving waypoint `index` to `p` without committing it (live feedback while dragging). */
export const checkMove = (points: FullPoint[], loop: boolean, index: number, p: FullPoint, rules: PathRules): MoveCheck => {
  const next = points.map((q, i) => (i === index ? p : q));
  const error = validatePathChange(points, loop, next, loop, rules);
  const pointBad = rules.checkPoint(p, index) !== null;
  const checkSegment = rules.checkSegment;
  const badSegments =
    pointBad || !checkSegment
      ? []
      : adjacentSegments(next.length, loop, index).filter((s) => {
          const other = s === index ? (s + 1) % next.length : s;
          return rules.checkPoint(next[other], other) === null && checkSegment(next[s], next[(s + 1) % next.length]) !== null;
        });
  return { error, pointBad, badSegments };
};
