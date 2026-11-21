import { describe, expect, it } from 'vitest';
import { regionBox, regionPadding } from './regionBox';

describe('regionBox', () => {
  it('uses the polygon bounds when the polygon has 3+ vertices', () => {
    const polygon = [{ x: 2, y: 5 }, { x: 8, y: -1 }, { y: 3 }];
    expect(regionBox({ x: -100, y: -100 }, { x: 100, y: 100 }, polygon)).toEqual({ minX: 0, maxX: 8, minY: -1, maxY: 5 });
  });

  it('uses the min/max bounds otherwise, with 0..100 for missing coordinates', () => {
    expect(regionBox({ x: -5, y: -6 }, { x: 7, y: 8 }, [{ x: 1, y: 1 }])).toEqual({ minX: -5, maxX: 7, minY: -6, maxY: 8 });
    expect(regionBox({}, {}, [])).toEqual({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
  });
});

describe('regionPadding', () => {
  it('is 5% of the span', () => {
    expect(regionPadding(0, 200)).toBe(10);
    expect(regionPadding(50, 10)).toBe(2);
  });

  it('is 10 units for an empty span', () => {
    expect(regionPadding(3, 3)).toBe(10);
  });
});
