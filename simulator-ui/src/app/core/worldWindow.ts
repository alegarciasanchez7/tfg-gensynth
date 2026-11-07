import type { Point3DCoord } from '../types';

/**
 * Visible world area of a 2D editor: the world point drawn at the canvas centre and the pixels
 * per world unit. The same scale is used on both axes, so shapes are never stretched.
 */
export interface WorldWindow {
  cx: number;
  cy: number;
  scale: number;
}

/** Rounds a raw grid step up to a "nice" 1, 2 or 5 × 10^k value. */
export const niceStep = (raw: number): number => {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};

/**
 * Fits the bounding box of the given points into a `w` × `h` canvas with a uniform scale.
 *
 * @param points   points to show (non-finite coordinates are ignored; none → 0..100 × 0..100)
 * @param w        canvas width in pixels
 * @param h        canvas height in pixels
 * @param margin   pixels kept free on every side (axis labels)
 * @param padRatio world padding added on each side, as a fraction of the box span
 */
export const fitWorldWindow = (
  points: Point3DCoord[],
  w: number,
  h: number,
  margin: number,
  padRatio: number,
): WorldWindow => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (minX > maxX || minY > maxY) {
    minX = 0; maxX = 100; minY = 0; maxY = 100;
  }
  // A flat box (a single point or a line) still gets a visible extent
  const extent = Math.max(maxX - minX, maxY - minY) || 1;
  const padFactor = 1 + 2 * padRatio;
  const spanX = Math.max(maxX - minX, extent * 0.05) * padFactor;
  const spanY = Math.max(maxY - minY, extent * 0.05) * padFactor;
  const scale = Math.min((w - margin * 2) / spanX, (h - margin * 2) / spanY);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
};
