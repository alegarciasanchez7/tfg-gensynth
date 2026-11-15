import type { Point3DCoord, PointVariableConfig, Shape3DType } from '../../../../types';

/** Bounding box of the 3D region (the Min/Max fields). */
export interface Bounds3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Dimensions of the 3D shape as stored in the point config. */
export type Shape3DSize = Pick<PointVariableConfig, 'shape3DWidth' | 'shape3DLength' | 'shape3DHeight' | 'shape3DRadius'>;

const SHAPES: readonly Shape3DType[] = ['cube', 'pyramid', 'cone', 'sphere'];

/**
 * The shape to draw: the configured one, or a cube when there is none or it is not a known 3D
 * shape (such as the old 'custom' value of saved projects).
 */
export const knownShape = (shape?: string): Shape3DType => SHAPES.find((known) => known === shape) ?? 'cube';

/** Points of the circle drawn as the base of a cone or sphere. */
const CIRCLE_POINTS = 12;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Base outline of the shape, centred on (centerX, centerY) at height `elev`: the rectangle of a
 * cube or pyramid, or a 12-point circle for a cone or sphere.
 */
export function footprintPolygon(
  shape: Shape3DType,
  centerX: number,
  centerY: number,
  size: { width: number; length: number; radius: number },
  elev: number,
): Point3DCoord[] {
  if (shape === 'cube' || shape === 'pyramid') {
    const hw = size.width / 2;
    const hl = size.length / 2;
    return [
      { x: centerX - hw, y: centerY - hl, z: elev },
      { x: centerX + hw, y: centerY - hl, z: elev },
      { x: centerX + hw, y: centerY + hl, z: elev },
      { x: centerX - hw, y: centerY + hl, z: elev },
    ];
  }
  const points: Point3DCoord[] = [];
  for (let i = 0; i < CIRCLE_POINTS; i++) {
    const angle = (i / CIRCLE_POINTS) * Math.PI * 2;
    points.push({
      x: round2(centerX + Math.cos(angle) * size.radius),
      y: round2(centerY + Math.sin(angle) * size.radius),
      z: elev,
    });
  }
  return points;
}

/** The smallest of the spans that are not 0, or undefined when all of them are 0. */
const smallestSpan = (...spans: number[]): number | undefined => {
  const positive = spans.filter((span) => span > 0);
  return positive.length > 0 ? Math.min(...positive) : undefined;
};

/**
 * The shape that fills new bounds, for when the Min/Max fields are typed: a cube or pyramid
 * takes the whole box; a cone takes the height and the largest circle of the footprint; a sphere
 * the largest ball that fits (it rests on Min Z). A negative height (shape upside down) stays
 * negative. A span of 0 keeps the current dimension.
 *
 * @param shape   the shape type (`custom` is drawn as a cube)
 * @param bounds  the new bounds, with min ≤ max on every axis
 * @param current the dimensions stored now
 * @returns the dimensions and the base outline to store with the new bounds
 */
export function shapeFittingBounds(
  shape: Shape3DType | undefined,
  bounds: Bounds3D,
  current: Shape3DSize,
): Required<Shape3DSize> & { polygon: Point3DCoord[] } {
  const kind = knownShape(shape);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const spanZ = bounds.maxZ - bounds.minZ;

  const width = spanX > 0 ? spanX : current.shape3DWidth ?? 100;
  const length = spanY > 0 ? spanY : current.shape3DLength ?? 100;
  const upsideDown = (current.shape3DHeight ?? 0) < 0;
  const signedSpanZ = upsideDown ? -spanZ : spanZ;
  const height = spanZ > 0 ? signedSpanZ : current.shape3DHeight ?? 0;
  const footprintSpan = kind === 'sphere' ? smallestSpan(spanX, spanY, spanZ) : smallestSpan(spanX, spanY);
  const radius = footprintSpan === undefined ? current.shape3DRadius ?? 50 : footprintSpan / 2;

  const elev = kind !== 'sphere' && height < 0 ? bounds.maxZ : bounds.minZ;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    shape3DWidth: width,
    shape3DLength: length,
    shape3DHeight: height,
    shape3DRadius: radius,
    polygon: footprintPolygon(kind, centerX, centerY, { width, length, radius }, elev),
  };
}
