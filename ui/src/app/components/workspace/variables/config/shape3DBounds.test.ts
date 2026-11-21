import { describe, it, expect } from 'vitest';
import { footprintPolygon, shapeFittingBounds, type Bounds3D } from './shape3DBounds';

const box: Bounds3D = { minX: 0, maxX: 40, minY: 0, maxY: 20, minZ: 10, maxZ: 70 };

describe('shapeFittingBounds', () => {
  it('makes a cube fill the whole box, with its base on Min Z', () => {
    const fitted = shapeFittingBounds('cube', box, { shape3DWidth: 100, shape3DLength: 100, shape3DHeight: 100 });

    expect(fitted).toMatchObject({ shape3DWidth: 40, shape3DLength: 20, shape3DHeight: 60 });
    expect(fitted.polygon).toEqual([
      { x: 0, y: 0, z: 10 },
      { x: 40, y: 0, z: 10 },
      { x: 40, y: 20, z: 10 },
      { x: 0, y: 20, z: 10 },
    ]);
  });

  it('keeps an upside-down pyramid upside down, with its base on Max Z', () => {
    const fitted = shapeFittingBounds('pyramid', box, { shape3DHeight: -30 });

    expect(fitted.shape3DHeight).toBe(-60);
    expect(fitted.polygon.every((p) => p.z === 70)).toBe(true);
  });

  it('gives a cone the largest circle of the footprint', () => {
    const fitted = shapeFittingBounds('cone', box, {});

    expect(fitted.shape3DRadius).toBe(10);
    expect(fitted.shape3DHeight).toBe(60);
    expect(fitted.polygon).toHaveLength(12);
    expect(fitted.polygon[0]).toEqual({ x: 30, y: 10, z: 10 });
  });

  it('gives a sphere the largest ball that fits, the height included', () => {
    expect(shapeFittingBounds('sphere', { ...box, maxZ: 16 }, {}).shape3DRadius).toBe(3);
    expect(shapeFittingBounds('sphere', box, {}).shape3DRadius).toBe(10);
  });

  it('keeps the current dimension of an axis whose span is 0', () => {
    const flat: Bounds3D = { minX: 5, maxX: 5, minY: 0, maxY: 20, minZ: 0, maxZ: 0 };

    const fitted = shapeFittingBounds('cube', flat, { shape3DWidth: 12, shape3DHeight: 7, shape3DRadius: 4 });

    expect(fitted).toMatchObject({ shape3DWidth: 12, shape3DLength: 20, shape3DHeight: 7, shape3DRadius: 10 });
  });

  it('uses the defaults of the Core when nothing is stored and a span is 0', () => {
    const flat: Bounds3D = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

    expect(shapeFittingBounds(undefined, flat, {})).toMatchObject({
      shape3DWidth: 100,
      shape3DLength: 100,
      shape3DHeight: 0,
      shape3DRadius: 50,
    });
  });

  it('draws a custom shape as a cube', () => {
    expect(shapeFittingBounds('custom' as never, box, {}).polygon).toHaveLength(4);
  });
});

describe('footprintPolygon', () => {
  it('centres a rectangle on the given point', () => {
    expect(footprintPolygon('cube', 10, 10, { width: 4, length: 2, radius: 0 }, 3)).toEqual([
      { x: 8, y: 9, z: 3 },
      { x: 12, y: 9, z: 3 },
      { x: 12, y: 11, z: 3 },
      { x: 8, y: 11, z: 3 },
    ]);
  });

  it('draws the base circle of a sphere with 12 rounded points at the radius', () => {
    const circle = footprintPolygon('sphere', 0, 0, { width: 0, length: 0, radius: 5 }, 0);

    expect(circle).toHaveLength(12);
    for (const p of circle) {
      expect(Math.hypot(p.x ?? 0, p.y ?? 0)).toBeCloseTo(5, 1);
    }
  });
});
