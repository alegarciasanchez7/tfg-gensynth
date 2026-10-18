import type { Point3DCoord, PointVariableConfig, Shape3DType } from '../types';
import type { FullPoint } from './pointDefaults';

/**
 * The 3D shape that bounds a Cartesian 3D point, mirroring the Core
 * (PointVariableConfig.isInsideShape3D and its effective-dimension getters).
 */
export type Shape3DParams = Pick<PointVariableConfig, 'shape3DType' | 'shape3DWidth' | 'shape3DLength' | 'shape3DHeight' | 'shape3DRadius'> & {
  minPoint: Point3DCoord;
  maxPoint: Point3DCoord;
};

const EPS = 1e-9;

/** A span, or 100 when it is 0 (like the Core). */
const spanOr100 = (span: number) => (Math.abs(span) > 0 ? Math.abs(span) : 100);

/** Effective shape: type, footprint centre, dimensions and base / apex elevations. */
export const effectiveShape3D = (params: Shape3DParams) => {
  const minX = params.minPoint.x ?? 0;
  const minY = params.minPoint.y ?? 0;
  const minZ = params.minPoint.z ?? 0;
  const maxX = params.maxPoint.x ?? 0;
  const maxY = params.maxPoint.y ?? 0;
  const maxZ = params.maxPoint.z ?? 0;
  const type: Shape3DType = params.shape3DType ?? 'cube';
  const width = params.shape3DWidth ?? spanOr100(maxX - minX);
  const length = params.shape3DLength ?? spanOr100(maxY - minY);
  const height = params.shape3DHeight ?? maxZ - minZ;
  const radius = params.shape3DRadius ?? 50;
  // A cube, pyramid or cone with a negative height hangs from maxZ; a sphere rests on minZ
  const baseZ = type !== 'sphere' && height < 0 ? maxZ : minZ;
  return { type, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, width, length, height, radius, baseZ, minZ };
};

/** Whether a point lies inside the 3D shape or on its surface. */
export const isInsideShape3D = (p: Point3DCoord, params: Shape3DParams): boolean => {
  const s = effectiveShape3D(params);
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  const z = p.z ?? 0;
  if (s.type === 'sphere') {
    const dx = x - s.cx;
    const dy = y - s.cy;
    const dz = z - (s.minZ + s.radius);
    return dx * dx + dy * dy + dz * dz <= s.radius * s.radius + EPS;
  }
  const flat = Math.abs(s.height) < EPS;
  const normZ = flat ? 0 : (z - s.baseZ) / s.height;
  if (normZ < -EPS || normZ > 1 + EPS) return false;
  if (flat && Math.abs(z - s.baseZ) > EPS) return false;
  const scale = s.type === 'cube' ? 1 : 1 - Math.max(0, Math.min(1, normZ));
  if (s.type === 'cone') {
    const r = s.radius * scale;
    const dx = x - s.cx;
    const dy = y - s.cy;
    return dx * dx + dy * dy <= r * r + EPS;
  }
  return Math.abs(x - s.cx) <= (s.width / 2) * scale + EPS && Math.abs(y - s.cy) <= (s.length / 2) * scale + EPS;
};

/**
 * A point well inside the shape: the sphere centre, or the footprint centre a quarter of the way
 * from the base to the apex (inside every shape, all of them being convex).
 */
export const shape3DInteriorPoint = (params: Shape3DParams): FullPoint => {
  const s = effectiveShape3D(params);
  return { x: s.cx, y: s.cy, z: s.type === 'sphere' ? s.minZ + s.radius : s.baseZ + s.height * 0.25 };
};
