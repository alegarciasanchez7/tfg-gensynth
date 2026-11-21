import type { MoveCheck } from '../../../../core/waypointPath';

/**
 * Segments touching a dragged waypoint, by segment index (segment i joins waypoint i and i + 1;
 * the closing segment of a looped path, n - 1, joins the last waypoint and the first one).
 */
export function segmentsAround(index: number, n: number, loopPath: boolean): Set<number> {
  const adjacent = new Set<number>();
  if (n < 2) return adjacent;
  if (index > 0) adjacent.add(index - 1);
  if (index < n - 1) adjacent.add(index);
  if (loopPath && n >= 3 && (index === 0 || index === n - 1)) adjacent.add(n - 1);
  return adjacent;
}

/** Why a segment is drawn in red: its drop is rejected while dragging, or the stored segment is invalid. */
export type SegmentFlag = 'rejected' | 'invalid';

/**
 * Segments to draw over the path, in order. Around the dragged waypoint the live check replaces the
 * stored issues: a rejected position marks all its segments (when the check names no segment) or
 * only the failing ones. The closing segment only exists on a looped path of 3+ waypoints.
 */
export function flaggedSegments(
  n: number,
  loopPath: boolean,
  live: { index: number; check: MoveCheck } | null,
  storedSegments: (string | null)[]
): { index: number; flag: SegmentFlag }[] {
  const liveAdjacent = live ? segmentsAround(live.index, n, loopPath) : new Set<number>();
  const hasClosing = loopPath && n >= 3;
  const flagged: { index: number; flag: SegmentFlag }[] = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1 && !hasClosing) continue;
    if (!liveAdjacent.has(i)) {
      if (storedSegments[i]) flagged.push({ index: i, flag: 'invalid' });
      continue;
    }
    const check = live?.check;
    if (check?.error && (check.badSegments.length === 0 || check.badSegments.includes(i))) {
      flagged.push({ index: i, flag: 'rejected' });
    }
  }
  return flagged;
}
