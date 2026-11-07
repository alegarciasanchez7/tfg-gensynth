import { describe, expect, it } from 'vitest';
import { effectiveShape3D, isInsideShape3D, shape3DInteriorPoint, type Shape3DParams } from './shape3D';

// Bounding box 0..100 on every axis: footprint centre (50, 50)
const box = { minPoint: { x: 0, y: 0, z: 0 }, maxPoint: { x: 100, y: 100, z: 100 } };
const shape = (overrides: Partial<Shape3DParams>): Shape3DParams => ({ ...box, ...overrides });

describe('effectiveShape3D', () => {
  it('falls back to the box spans (100 when a span is 0), the Z span and radius 50', () => {
    const s = effectiveShape3D({ minPoint: { x: 10, y: 5, z: 0 }, maxPoint: { x: 10, y: 45, z: 30 } });
    expect(s).toMatchObject({ type: 'cube', width: 100, length: 40, height: 30, radius: 50, baseZ: 0, cx: 10, cy: 25 });
  });

  it('hangs a shape with a negative height from maxZ, but never a sphere', () => {
    expect(effectiveShape3D(shape({ shape3DType: 'pyramid', shape3DHeight: -40 })).baseZ).toBe(100);
    expect(effectiveShape3D(shape({ shape3DType: 'sphere', shape3DHeight: -40 })).baseZ).toBe(0);
  });
});

describe('isInsideShape3D', () => {
  it('cube: the box around the footprint centre, faces included', () => {
    const cube = shape({ shape3DWidth: 20, shape3DLength: 40 });
    expect(isInsideShape3D({ x: 60, y: 70, z: 100 }, cube)).toBe(true);
    expect(isInsideShape3D({ x: 61, y: 50, z: 50 }, cube)).toBe(false);
    expect(isInsideShape3D({ x: 50, y: 50, z: 101 }, cube)).toBe(false);
    expect(isInsideShape3D({ x: 50, y: 50, z: -1 }, cube)).toBe(false);
  });

  it('pyramid: the footprint shrinks towards the apex', () => {
    const pyramid = shape({ shape3DType: 'pyramid' });
    expect(isInsideShape3D({ x: 95, y: 50, z: 0 }, pyramid)).toBe(true);
    expect(isInsideShape3D({ x: 95, y: 50, z: 50 }, pyramid)).toBe(false);
    expect(isInsideShape3D({ x: 74, y: 74, z: 50 }, pyramid)).toBe(true);
    expect(isInsideShape3D({ x: 50, y: 50, z: 100 }, pyramid)).toBe(true);
  });

  it('pyramid with a negative height: base at maxZ, apex below it', () => {
    const inverted = shape({ shape3DType: 'pyramid', shape3DHeight: -100 });
    expect(isInsideShape3D({ x: 95, y: 50, z: 100 }, inverted)).toBe(true);
    expect(isInsideShape3D({ x: 95, y: 50, z: 10 }, inverted)).toBe(false);
    expect(isInsideShape3D({ x: 50, y: 50, z: 0 }, inverted)).toBe(true);
    expect(isInsideShape3D({ x: 50, y: 50, z: 101 }, inverted)).toBe(false);
  });

  it('cone: a circle of the configured radius that shrinks towards the apex', () => {
    const cone = shape({ shape3DType: 'cone', shape3DRadius: 20 });
    expect(isInsideShape3D({ x: 70, y: 50, z: 0 }, cone)).toBe(true);
    expect(isInsideShape3D({ x: 65, y: 65, z: 0 }, cone)).toBe(false);
    expect(isInsideShape3D({ x: 59, y: 50, z: 50 }, cone)).toBe(true);
    expect(isInsideShape3D({ x: 61, y: 50, z: 50 }, cone)).toBe(false);
  });

  it('sphere: centred on the footprint at minZ + radius', () => {
    const sphere = shape({ shape3DType: 'sphere', shape3DRadius: 10 });
    expect(isInsideShape3D({ x: 50, y: 50, z: 10 }, sphere)).toBe(true);
    expect(isInsideShape3D({ x: 60, y: 50, z: 10 }, sphere)).toBe(true);
    expect(isInsideShape3D({ x: 50, y: 50, z: 20 }, sphere)).toBe(true);
    expect(isInsideShape3D({ x: 58, y: 58, z: 10 }, sphere)).toBe(false);
    expect(isInsideShape3D({ x: 50, y: 50, z: 50 }, sphere)).toBe(false);
  });

  it('a flat shape (height 0) only contains its base plane', () => {
    const flat = shape({ maxPoint: { x: 100, y: 100, z: 0 } });
    expect(isInsideShape3D({ x: 50, y: 50, z: 0 }, flat)).toBe(true);
    expect(isInsideShape3D({ x: 50, y: 50, z: 1 }, flat)).toBe(false);
  });
});

describe('shape3DInteriorPoint', () => {
  it('returns a point inside every shape', () => {
    for (const type of ['cube', 'pyramid', 'cone', 'sphere'] as const) {
      for (const height of [100, -100]) {
        const s = shape({ shape3DType: type, shape3DHeight: height, shape3DRadius: 10 });
        expect(isInsideShape3D(shape3DInteriorPoint(s), s)).toBe(true);
      }
    }
  });
});
