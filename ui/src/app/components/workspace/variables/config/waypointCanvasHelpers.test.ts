import { describe, expect, it } from 'vitest';
import { flaggedSegments, segmentsAround } from './waypointCanvasHelpers';

const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);

describe('segmentsAround', () => {
  it('is empty for fewer than 2 waypoints', () => {
    expect(sorted(segmentsAround(0, 1, true))).toEqual([]);
  });

  it('gives the segments before and after a middle waypoint', () => {
    expect(sorted(segmentsAround(2, 5, false))).toEqual([1, 2]);
  });

  it('adds the closing segment for the first and last waypoints of a loop of 3+', () => {
    expect(sorted(segmentsAround(0, 4, true))).toEqual([0, 3]);
    expect(sorted(segmentsAround(3, 4, true))).toEqual([2, 3]);
    expect(sorted(segmentsAround(0, 4, false))).toEqual([0]);
    expect(sorted(segmentsAround(0, 2, true))).toEqual([0]);
  });
});

describe('flaggedSegments', () => {
  const noCheck = { error: null, pointBad: false, badSegments: [] };

  it('flags the stored invalid segments, skipping the closing one of an open path', () => {
    expect(flaggedSegments(3, false, null, ['bad', null, 'closing'])).toEqual([{ index: 0, flag: 'invalid' }]);
    expect(flaggedSegments(3, true, null, ['bad', null, 'closing'])).toEqual([
      { index: 0, flag: 'invalid' },
      { index: 2, flag: 'invalid' },
    ]);
  });

  it('replaces the stored issues around the dragged waypoint by the live check', () => {
    // Waypoint 1 is dragged to a valid position: its stored invalid segments are no longer drawn
    expect(flaggedSegments(3, false, { index: 1, check: noCheck }, ['bad', 'bad', null])).toEqual([]);
  });

  it('marks every adjacent segment of a rejected position with no failing segment named', () => {
    const check = { error: 'outside', pointBad: true, badSegments: [] };
    expect(flaggedSegments(4, false, { index: 1, check }, [null, null, 'bad', null])).toEqual([
      { index: 0, flag: 'rejected' },
      { index: 1, flag: 'rejected' },
      { index: 2, flag: 'invalid' },
    ]);
  });

  it('marks only the failing segments named by the live check', () => {
    const check = { error: 'crosses', pointBad: false, badSegments: [1] };
    expect(flaggedSegments(3, false, { index: 1, check }, [null, null, null])).toEqual([{ index: 1, flag: 'rejected' }]);
  });
});
