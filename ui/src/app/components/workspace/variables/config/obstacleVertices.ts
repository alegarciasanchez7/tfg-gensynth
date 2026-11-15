import type { Point3DCoord } from '../../../../types';

/**
 * Rows of a vertex list (an obstacle or the boundary polygon), keyed by their coordinates plus how many earlier
 * vertices share them, so every key is unique without using the position in the list.
 */
export const vertexRows = (points: Point3DCoord[]): { point: Point3DCoord; key: string }[] => {
  const seen = new Map<string, number>();
  return points.map((point) => {
    const coords = `${point.x ?? 0},${point.y ?? 0},${point.z ?? 0}`;
    const repeats = seen.get(coords) ?? 0;
    seen.set(coords, repeats + 1);
    return { point, key: `${coords}#${repeats}` };
  });
};

/**
 * The value typed for a coordinate (a vertex or a bound), or null when it must not be applied: empty, not a
 * number, or the same value. A value past the axis limit is brought back to it.
 */
export const parseCoordinate = (text: string, current: number, limit?: number): number | null => {
  if (text.trim() === '') return null;
  let value = Number(text);
  if (!Number.isFinite(value)) return null;
  if (limit !== undefined) {
    value = Math.max(-limit, Math.min(limit, value));
  }
  return value === current ? null : value;
};
