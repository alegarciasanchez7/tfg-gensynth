import type { Point3DCoord } from '../../../../types';
import type { FullPoint } from '../../../../core/pointDefaults';
import { polygonCentroid } from '../../../../core/routeGeometry';
import { shape3DInteriorPoint, type Shape3DParams } from '../../../../core/shape3D';
import type { RegionBox } from './regionBox';

/** Cells per axis of the grid searched for a free position when adding a waypoint. */
export const ADD_GRID = 16;

const fit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A coordinate shifted by 5% of the span: forwards when it stays inside, else backwards. */
const shiftBy5Percent = (v: number, span: number, lo: number, hi: number) => {
  const step = span * 0.05;
  return fit(v + step <= hi ? v + step : v - step, lo, hi);
};

/** Positions around the last waypoint: the 5% shift first, then diagonal shifts of 5, 10 and 20%. */
export function shiftedCandidates(last: FullPoint, box: RegionBox, z: number): FullPoint[] {
  const spanX = box.maxX - box.minX;
  const spanY = box.maxY - box.minY;
  const candidates: FullPoint[] = [
    { x: shiftBy5Percent(last.x, spanX, box.minX, box.maxX), y: shiftBy5Percent(last.y, spanY, box.minY, box.maxY), z },
  ];
  for (const factor of [0.05, 0.1, 0.2]) {
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        candidates.push({
          x: fit(last.x + sx * factor * spanX, box.minX, box.maxX),
          y: fit(last.y + sy * factor * spanY, box.minY, box.maxY),
          z,
        });
      }
    }
  }
  return candidates;
}

/** Centres of a cells x cells grid over the box, nearest to the anchor first. */
export function regionGrid(box: RegionBox, z: number, anchor: { x: number; y: number }, cells = ADD_GRID): FullPoint[] {
  const spanX = box.maxX - box.minX;
  const spanY = box.maxY - box.minY;
  const grid: FullPoint[] = [];
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      grid.push({ x: box.minX + ((i + 0.5) * spanX) / cells, y: box.minY + ((j + 0.5) * spanY) / cells, z });
    }
  }
  grid.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y));
  return grid;
}

export interface NewWaypointParams {
  box: RegionBox;
  /** Last waypoint of the path, or null when the path is empty. */
  last: FullPoint | null;
  /** Altitude / Z of the new waypoint. */
  z: number;
  /** Whether the region is a plane (2D / Geospatial: polygon + obstacles) instead of a 3D shape. */
  hasVisual: boolean;
  polygon: Point3DCoord[];
  shape: Shape3DParams;
}

/**
 * Positions to try, in order, for a new waypoint: the region centre when the path is empty, else
 * shifts around the last waypoint; then, on a plane, the polygon centroid, the centre and a grid
 * nearest to the last waypoint (or the centre) first; in 3D, a point inside the shape.
 */
export function newWaypointCandidates({ box, last, z, hasVisual, polygon, shape }: NewWaypointParams): FullPoint[] {
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, z };
  const candidates: FullPoint[] = last ? shiftedCandidates(last, box, z) : [centre];
  if (!hasVisual) {
    candidates.push(shape3DInteriorPoint(shape));
    return candidates;
  }
  if (polygon.length >= 3) candidates.push({ ...polygonCentroid(polygon), z });
  candidates.push(centre, ...regionGrid(box, z, last ?? centre));
  return candidates;
}

/** Notice of the stored waypoints / segments that break the rules, or null when there are none. */
export function pathProblemsNotice(badPoints: number, badSegments: number, hasVisual: boolean): string | null {
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const problems: string[] = [];
  if (badPoints > 0) {
    const where = hasVisual ? 'outside the region or in a forbidden zone' : 'outside the 3D region';
    problems.push(`${plural(badPoints, 'waypoint is', 'waypoints are')} ${where}`);
  }
  if (badSegments > 0) {
    problems.push(
      plural(badSegments, 'segment leaves the region or crosses an obstacle', 'segments leave the region or cross an obstacle')
    );
  }
  return problems.length > 0 ? `${problems.join(' and ')} (in red). The generator follows the path anyway.` : null;
}
