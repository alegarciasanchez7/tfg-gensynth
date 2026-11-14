import type { Point3DCoord } from '../../../../types';

/** Axis-aligned box of the editable region in domain coordinates. */
export interface RegionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Region box: the boundary polygon bounds when there is one (3+ vertices), else the min/max bounds. */
export function regionBox(minPoint: Point3DCoord, maxPoint: Point3DCoord, polygon: Point3DCoord[]): RegionBox {
  if (polygon.length >= 3) {
    const xs = polygon.map((p) => p.x ?? 0);
    const ys = polygon.map((p) => p.y ?? 0);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }
  return { minX: minPoint.x ?? 0, maxX: maxPoint.x ?? 100, minY: minPoint.y ?? 0, maxY: maxPoint.y ?? 100 };
}

/** Padding added around a region span: 5% of the span, or 10 units when the span is empty. */
export function regionPadding(min: number, max: number): number {
  const span = Math.abs(max - min);
  return span > 0 ? span * 0.05 : 10;
}
