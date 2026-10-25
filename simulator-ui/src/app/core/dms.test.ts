import { describe, expect, it } from 'vitest';
import { formatDms } from './dms';

describe('formatDms', () => {
  it('writes degrees, minutes and seconds with the hemisphere, as the Core does', () => {
    expect(formatDms(36.53777, true)).toBe(`36° 32' 15.97" N`);
    expect(formatDms(-6.20162, false)).toBe(`6° 12' 5.83" W`);
    expect(formatDms(-0.5, true)).toBe(`0° 30' 0.00" S`);
  });

  it('carries 60 seconds into the next minute and degree', () => {
    expect(formatDms(10.1, true)).toBe(`10° 6' 0.00" N`);
    expect(formatDms(45.999999999, false)).toBe(`46° 0' 0.00" E`);
  });
});
