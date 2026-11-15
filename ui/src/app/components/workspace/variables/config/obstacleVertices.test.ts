import { describe, it, expect } from 'vitest';
import { parseCoordinate, vertexRows } from './obstacleVertices';

describe('parseCoordinate', () => {
  it('reads a typed number', () => {
    expect(parseCoordinate('12.5', 0)).toBe(12.5);
    expect(parseCoordinate(' -3 ', 0)).toBe(-3);
  });

  it('ignores empty text, text that is not a number and the same value', () => {
    expect(parseCoordinate('', 4)).toBeNull();
    expect(parseCoordinate('  ', 4)).toBeNull();
    expect(parseCoordinate('abc', 4)).toBeNull();
    expect(parseCoordinate('4', 4)).toBeNull();
  });

  it('brings a value past the axis limit back to it', () => {
    expect(parseCoordinate('95', 0, 90)).toBe(90);
    expect(parseCoordinate('-200', 0, 180)).toBe(-180);
  });

  it('ignores a value that the limit turns into the current one', () => {
    expect(parseCoordinate('120', 90, 90)).toBeNull();
  });
});

describe('vertexRows', () => {
  it('gives every vertex a unique key, also when two share their coordinates', () => {
    const rows = vertexRows([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 1, y: 2 }]);

    expect(rows.map((r) => r.key)).toEqual(['1,2,0#0', '3,4,0#0', '1,2,0#1']);
    expect(rows[1].point).toEqual({ x: 3, y: 4 });
  });
});
