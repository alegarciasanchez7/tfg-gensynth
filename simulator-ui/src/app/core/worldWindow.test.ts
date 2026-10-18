import { describe, expect, it } from 'vitest';
import { fitWorldWindow, niceStep } from './worldWindow';

describe('niceStep', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(0.8)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(23)).toBe(50);
  });

  it('falls back to 1 for invalid input', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-3)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
    expect(niceStep(Infinity)).toBe(1);
  });
});

describe('fitWorldWindow', () => {
  it('centres the box and uses the tighter axis for the single scale', () => {
    // 0..200 × 0..100 in a 500 × 300 canvas, 25 px margin, 10% padding: spans 240 × 120
    const win = fitWorldWindow([{ x: 0, y: 0 }, { x: 200, y: 100 }], 500, 300, 25, 0.1);
    expect(win.cx).toBe(100);
    expect(win.cy).toBe(50);
    expect(win.scale).toBeCloseTo(Math.min(450 / 240, 250 / 120));
  });

  it('keeps world distances equal on both axes', () => {
    const win = fitWorldWindow([{ x: 0, y: 0 }, { x: 200, y: 100 }], 700, 340, 36, 0.05);
    const toX = (x: number) => 350 + (x - win.cx) * win.scale;
    const toY = (y: number) => 170 - (y - win.cy) * win.scale;
    // 50 world units are the same number of pixels horizontally and vertically
    expect(toX(50) - toX(0)).toBeCloseTo(toY(0) - toY(50));
  });

  it('falls back to 0..100 when there are no usable points', () => {
    expect(fitWorldWindow([], 250, 250, 25, 0.1)).toEqual(
      fitWorldWindow([{ x: 0, y: 0 }, { x: 100, y: 100 }], 250, 250, 25, 0.1),
    );
    const win = fitWorldWindow([{ x: Number.NaN, y: 1 }], 250, 250, 25, 0.1);
    expect(win.cx).toBe(50);
    expect(win.cy).toBe(50);
  });

  it('gives a flat or single-point box a finite positive scale', () => {
    const line = fitWorldWindow([{ x: 0, y: 5 }, { x: 10, y: 5 }], 300, 200, 25, 0.1);
    expect(line.cy).toBe(5);
    expect(Number.isFinite(line.scale)).toBe(true);
    expect(line.scale).toBeGreaterThan(0);

    const dot = fitWorldWindow([{ x: 3, y: 4 }], 300, 200, 25, 0.1);
    expect(dot).toMatchObject({ cx: 3, cy: 4 });
    expect(dot.scale).toBeGreaterThan(0);
  });

  it('never returns a non-positive scale for a canvas smaller than its margins', () => {
    expect(fitWorldWindow([{ x: 0, y: 0 }, { x: 1, y: 1 }], 10, 10, 25, 0.1).scale).toBe(1);
  });
});
