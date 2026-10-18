import type { BoundaryObstacle, Point3DCoord } from '../types';

/**
 * Pure 2D geometry used by the route and waypoint editors to keep points and segments inside the
 * allowed region and out of the forbidden obstacles. Coordinates are x/y (latitude/longitude in
 * Geospatial).
 */

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

/** Counter-clockwise orienting helper for 2D line segment intersection */
const ccw = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): boolean => {
  return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
};

/** Returns true if line segment p1-p2 intersects line segment q1-q2 */
export const segmentsIntersect = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number }
): boolean => {
  return (
    ccw(p1, q1, q2) !== ccw(p2, q1, q2) &&
    ccw(p1, p2, q1) !== ccw(p1, p2, q2)
  );
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
    const getPt = (p: Point3DCoord) => ({ x: p.x ?? 0, y: p.y ?? 0 });

    // 1. Check if target node point lies inside forbidden region polygon
    if (obs.type !== 'WALL_SEGMENT' && pts.length >= 3) {
      if (isPointInPolygon(targetPoint.x, targetPoint.y, pts)) {
        return `Cannot place route node inside forbidden obstacle zone: "${name}"`;
      }
    }

    // 2. Check if connecting edge intersects wall segments or obstacle polygon edges
    if (fromNode) {
      if (obs.type === 'WALL_SEGMENT' && pts.length >= 2) {
        for (let i = 0; i < pts.length - 1; i++) {
          if (segmentsIntersect(fromNode, targetPoint, getPt(pts[i]), getPt(pts[i + 1]))) {
            return `Cannot draw route edge crossing forbidden wall barrier: "${name}"`;
          }
        }
      } else if (pts.length >= 3) {
        for (let i = 0; i < pts.length; i++) {
          const nextIdx = (i + 1) % pts.length;
          if (segmentsIntersect(fromNode, targetPoint, getPt(pts[i]), getPt(pts[nextIdx]))) {
            return `Cannot draw route edge crossing forbidden obstacle region: "${name}"`;
          }
        }
      }
    }
  }

  return null;
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
    const isInside = isPointInPolygon(targetPoint.x, targetPoint.y, polygon);
    if (!isInside) {
      return 'Cannot place route node outside the allowed boundary region.';
    }

    if (fromNode) {
      const fromInside = isPointInPolygon(fromNode.x, fromNode.y, polygon);
      if (!fromInside) {
        return 'Cannot draw route edge from an origin node located outside the allowed boundary region.';
      }
      // Check if connecting line segment intersects any edge of the boundary polygon
      for (let i = 0; i < polygon.length; i++) {
        const nextIdx = (i + 1) % polygon.length;
        if (segmentsIntersect(fromNode, targetPoint, getPt(polygon[i]), getPt(polygon[nextIdx]))) {
          return 'Cannot draw route edge exiting the allowed boundary region.';
        }
      }
    }
  } else if (minPoint && maxPoint) {
    // Bounding box check against the region limits (an unset axis is not limited)
    const minX = minPoint.x ?? -Infinity;
    const maxX = maxPoint.x ?? Infinity;
    const minY = minPoint.y ?? -Infinity;
    const maxY = maxPoint.y ?? Infinity;

    if (targetPoint.x < minX || targetPoint.x > maxX || targetPoint.y < minY || targetPoint.y > maxY) {
      return `Cannot place route node outside allowed boundary limits.`;
    }

    if (fromNode) {
      if (fromNode.x < minX || fromNode.x > maxX || fromNode.y < minY || fromNode.y > maxY) {
        return `Cannot draw route edge from an origin node outside allowed boundary limits.`;
      }
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
