import type { BoundaryObstacle, Point3DCoord } from '../types';

/**
 * Pure 2D geometry used by the route and waypoint editors to keep points and segments inside the
 * allowed region and out of the forbidden obstacles. Coordinates are x/y (latitude/longitude in
 * Geospatial).
 *
 * Borders are tolerant: a point on the region border (within a tiny distance relative to the
 * region size) is inside the region, and a point on an obstacle border is not inside the obstacle.
 * A segment may touch or run along a border; it is only rejected when part of it leaves the region,
 * enters a forbidden zone or properly crosses a wall.
 */

type XY = { x: number; y: number };

/** Tolerance of a border check, relative to the size of the shape. */
const RELATIVE_TOLERANCE = 1e-7;

const toXY = (p: Point3DCoord): XY => ({ x: p.x ?? 0, y: p.y ?? 0 });

/** Distance treated as "on the border" for a shape of these points. */
const toleranceFor = (points: XY[]): number => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return Math.max(size, 1e-9) * RELATIVE_TOLERANCE;
};

/** Ray-casting algorithm to test if point (px, py) lies inside obstacle polygon */
export const isPointInPolygon = (px: number, py: number, points: Point3DCoord[]): boolean => {
  if (!points || points.length < 3) return false;
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x ?? 0;
    const yi = points[i].y ?? 0;
    const xj = points[j].x ?? 0;
    const yj = points[j].y ?? 0;
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

/** Closest point to p on segment a-b. */
export const closestPointOnSegment = (p: XY, a: XY, b: XY): XY => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
};

/** Closest point to p on the border of a polygon (closing edge included). */
const closestPointOnBorder = (p: XY, polygon: XY[]): XY => {
  let best = polygon[0];
  let bestDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const c = closestPointOnSegment(p, polygon[i], polygon[(i + 1) % polygon.length]);
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
};

/** Whether (px, py) lies on the border of the polygon, within `tolerance` (default: relative to its size). */
export const isPointOnPolygonBorder = (px: number, py: number, points: Point3DCoord[], tolerance?: number): boolean => {
  if (!points || points.length < 2) return false;
  const pts = points.map(toXY);
  const tol = tolerance ?? toleranceFor(pts);
  const c = closestPointOnBorder({ x: px, y: py }, pts);
  return Math.hypot(c.x - px, c.y - py) <= tol;
};

/** Inside the polygon or on its border. */
const isInsideOrOnBorder = (p: XY, polygon: Point3DCoord[]): boolean =>
  isPointInPolygon(p.x, p.y, polygon) || isPointOnPolygonBorder(p.x, p.y, polygon);

/** Strictly inside the polygon: a point on its border is not inside. */
const isStrictlyInside = (p: XY, polygon: Point3DCoord[]): boolean =>
  isPointInPolygon(p.x, p.y, polygon) && !isPointOnPolygonBorder(p.x, p.y, polygon);

/** Signed distance of c from the line a-b (positive on the left). */
const sideOf = (a: XY, b: XY, c: XY): number => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return Math.hypot(c.x - a.x, c.y - a.y);
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / len;
};

/**
 * Returns true if line segment p1-p2 properly crosses line segment q1-q2: each segment has its
 * ends strictly on both sides of the other. Touching at an end, or overlapping along a line, is
 * not a crossing.
 */
export const segmentsIntersect = (p1: XY, p2: XY, q1: XY, q2: XY): boolean => {
  const tol = toleranceFor([p1, p2, q1, q2]);
  const d1 = sideOf(q1, q2, p1);
  const d2 = sideOf(q1, q2, p2);
  const d3 = sideOf(p1, p2, q1);
  const d4 = sideOf(p1, p2, q2);
  const opposite = (u: number, v: number) => (u > tol && v < -tol) || (u < -tol && v > tol);
  return opposite(d1, d2) && opposite(d3, d4);
};

/**
 * Whether segment p1-p2 crosses a polyline exactly at its inner vertex v (between prev and next):
 * neither wall piece is properly crossed there, but the path still goes from one side to the other.
 */
const crossesAtVertex = (p1: XY, p2: XY, prev: XY, v: XY, next: XY): boolean => {
  const tol = toleranceFor([p1, p2, prev, v, next]);
  if (Math.abs(sideOf(p1, p2, v)) > tol) return false;
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const along = len > 0 ? ((v.x - p1.x) * (p2.x - p1.x) + (v.y - p1.y) * (p2.y - p1.y)) / len : 0;
  if (along <= tol || along >= len - tol) return false;
  const a = sideOf(p1, p2, prev);
  const b = sideOf(p1, p2, next);
  return (a > tol && b < -tol) || (a < -tol && b > tol);
};

/**
 * Midpoints of the pieces of segment a-b between the places where it meets the polygon border.
 * Each piece lies wholly inside, outside or on the border, so testing its midpoint tests the piece.
 */
const pieceMidpoints = (a: XY, b: XY, polygon: XY[]): XY[] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [a];
  const ts = [0, 1];
  for (let i = 0; i < polygon.length; i++) {
    const c = polygon[i];
    const d = polygon[(i + 1) % polygon.length];
    // Every vertex projected onto the segment (covers edges parallel to it and vertex touches)
    ts.push(((c.x - a.x) * dx + (c.y - a.y) * dy) / len2);
    const ex = d.x - c.x;
    const ey = d.y - c.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) > 1e-12 * Math.sqrt(len2 * (ex * ex + ey * ey))) {
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denom;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / denom;
      if (u >= 0 && u <= 1) ts.push(t);
    }
  }
  const sorted = ts.filter((t) => t >= 0 && t <= 1).sort((u, v) => u - v);
  const mids: XY[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] - sorted[i] < 1e-12) continue;
    const t = (sorted[i] + sorted[i + 1]) / 2;
    mids.push({ x: a.x + t * dx, y: a.y + t * dy });
  }
  return mids;
};

/** Evaluates collision between candidate node/edge and active forbidden obstacle zones or wall segments */
export const checkObstacleCollision = (
  fromNode: { x: number; y: number } | null,
  targetPoint: { x: number; y: number },
  obstacles: BoundaryObstacle[]
): string | null => {
  const activeObstacles = (obstacles || []).filter((obs) => obs.enabled && obs.points && obs.points.length > 0);

  for (const obs of activeObstacles) {
    const pts = obs.points;
    const name = obs.name || (obs.type === 'WALL_SEGMENT' ? 'Wall Segment' : 'Forbidden Zone');

    // 1. Check if target node point lies inside forbidden region polygon (its border is allowed)
    if (obs.type !== 'WALL_SEGMENT' && pts.length >= 3) {
      if (isStrictlyInside(targetPoint, pts)) {
        return `Cannot place route node inside forbidden obstacle zone: "${name}"`;
      }
    }

    // 2. Check if connecting edge crosses wall segments or enters the obstacle polygon
    if (fromNode) {
      if (obs.type === 'WALL_SEGMENT' && pts.length >= 2) {
        const wall = pts.map(toXY);
        for (let i = 0; i < wall.length - 1; i++) {
          const crossesPiece = segmentsIntersect(fromNode, targetPoint, wall[i], wall[i + 1]);
          if (crossesPiece || (i > 0 && crossesAtVertex(fromNode, targetPoint, wall[i - 1], wall[i], wall[i + 1]))) {
            return `Cannot draw route edge crossing forbidden wall barrier: "${name}"`;
          }
        }
      } else if (pts.length >= 3) {
        if (pieceMidpoints(fromNode, targetPoint, pts.map(toXY)).some((m) => isStrictlyInside(m, pts))) {
          return `Cannot draw route edge crossing forbidden obstacle region: "${name}"`;
        }
      }
    }
  }

  return null;
};

/** Region box limits; an unset axis is not limited. */
const boxLimits = (minPoint: Point3DCoord, maxPoint: Point3DCoord) => {
  const minX = minPoint.x ?? -Infinity;
  const maxX = maxPoint.x ?? Infinity;
  const minY = minPoint.y ?? -Infinity;
  const maxY = maxPoint.y ?? Infinity;
  const finite = [maxX - minX, maxY - minY].filter(Number.isFinite);
  const tol = Math.max(1e-9, ...finite.map(Math.abs)) * RELATIVE_TOLERANCE;
  return { minX, maxX, minY, maxY, tol };
};

/** Evaluates compliance of candidate node/edge against allowed boundary polygon and bounding limits */
export const checkBoundaryCompliance = (
  fromNode: { x: number; y: number } | null,
  targetPoint: { x: number; y: number },
  polygon: Point3DCoord[],
  minPoint?: Point3DCoord,
  maxPoint?: Point3DCoord
): string | null => {
  const getPt = (p: Point3DCoord) => ({ x: p.x ?? 0, y: p.y ?? (p.x ?? 0) });

  // 1. Check if allowed boundary polygon is defined (>= 3 points)
  if (polygon && polygon.length >= 3) {
    const region = polygon.map(getPt);
    if (!isInsideOrOnBorder(targetPoint, region)) {
      return 'Cannot place route node outside the allowed boundary region.';
    }

    if (fromNode) {
      if (!isInsideOrOnBorder(fromNode, region)) {
        return 'Cannot draw route edge from an origin node located outside the allowed boundary region.';
      }
      // The segment may touch or follow the border, but no piece of it may lie outside
      if (pieceMidpoints(fromNode, targetPoint, region).some((m) => !isInsideOrOnBorder(m, region))) {
        return 'Cannot draw route edge exiting the allowed boundary region.';
      }
    }
  } else if (minPoint && maxPoint) {
    // Bounding box check against the region limits (an unset axis is not limited)
    const { minX, maxX, minY, maxY, tol } = boxLimits(minPoint, maxPoint);
    const outside = (p: XY) => p.x < minX - tol || p.x > maxX + tol || p.y < minY - tol || p.y > maxY + tol;

    if (outside(targetPoint)) {
      return `Cannot place route node outside allowed boundary limits.`;
    }

    if (fromNode && outside(fromNode)) {
      return `Cannot draw route edge from an origin node outside allowed boundary limits.`;
    }
  }

  return null;
};

/** Unified validator evaluating both allowed boundary compliance and forbidden obstacle collisions */
export const validateNodeAndEdge = (
  fromNode: { x: number; y: number } | null,
  targetPoint: { x: number; y: number },
  obstacles: BoundaryObstacle[],
  polygon: Point3DCoord[],
  minPoint?: Point3DCoord,
  maxPoint?: Point3DCoord
): string | null => {
  const boundaryError = checkBoundaryCompliance(fromNode, targetPoint, polygon, minPoint, maxPoint);
  if (boundaryError) return boundaryError;

  const obstacleError = checkObstacleCollision(fromNode, targetPoint, obstacles);
  if (obstacleError) return obstacleError;

  return null;
};

/** Whether a point is inside the region (polygon when it has >= 3 points, else the min/max box). */
export const isInsideRegion = (
  p: XY,
  polygon: Point3DCoord[],
  minPoint?: Point3DCoord,
  maxPoint?: Point3DCoord
): boolean => checkBoundaryCompliance(null, p, polygon, minPoint, maxPoint) === null;

/**
 * Nearest point of the region to p: p itself when it is inside, else the closest point of the
 * polygon border, or p clamped to the min/max box (an unset axis is not limited).
 */
export const clampToRegion = (
  p: XY,
  polygon: Point3DCoord[],
  minPoint?: Point3DCoord,
  maxPoint?: Point3DCoord
): XY => {
  if (isInsideRegion(p, polygon, minPoint, maxPoint)) return { x: p.x, y: p.y };
  if (polygon && polygon.length >= 3) return closestPointOnBorder(p, polygon.map(toXY));
  if (!minPoint || !maxPoint) return { x: p.x, y: p.y };
  const { minX, maxX, minY, maxY } = boxLimits(minPoint, maxPoint);
  return { x: Math.max(minX, Math.min(maxX, p.x)), y: Math.max(minY, Math.min(maxY, p.y)) };
};

/**
 * Rounds p to `decimals`, preferring a rounding that stays inside the region: a point clamped onto
 * the border can fall just outside when rounded to the nearest value, so the other roundings
 * (down / up on each axis) are tried before giving up.
 */
export const roundIntoRegion = (
  p: XY,
  decimals: number,
  polygon: Point3DCoord[],
  minPoint?: Point3DCoord,
  maxPoint?: Point3DCoord
): XY => {
  const f = 10 ** decimals;
  const fix = (v: number) => Number(v.toFixed(decimals));
  const nearest = { x: fix(p.x), y: fix(p.y) };
  if (!isInsideRegion(p, polygon, minPoint, maxPoint) || isInsideRegion(nearest, polygon, minPoint, maxPoint)) return nearest;
  const xs = [Math.floor(p.x * f) / f, Math.ceil(p.x * f) / f];
  const ys = [Math.floor(p.y * f) / f, Math.ceil(p.y * f) / f];
  for (const x of xs) {
    for (const y of ys) {
      const candidate = { x: fix(x), y: fix(y) };
      if (isInsideRegion(candidate, polygon, minPoint, maxPoint)) return candidate;
    }
  }
  return nearest;
};

/** Area centroid of a polygon (the vertex average when it has no area). */
export const polygonCentroid = (points: Point3DCoord[]): XY => {
  const pts = points.map(toXY);
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
};
