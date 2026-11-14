import { describe, expect, it } from 'vitest';
import {
  findBatchNameCollisions,
  findFlowNameConflict,
  makeUniqueName,
  sameName,
  uniqueBatchNames,
} from './flowNames';

const flows = [{ id: 'f1', name: 'Sensor 1' }, { id: 'f2', name: 'Sensor 2' }];

describe('flowNames', () => {
  it('compares names trimmed and ignoring case, like the Core', () => {
    expect(sameName(' sensor 1 ', 'Sensor 1')).toBe(true);
    expect(sameName('Sensor 1', 'Sensor 10')).toBe(false);
  });

  it('reports a name used by another flow of the group', () => {
    expect(findFlowNameConflict(flows, '  SENSOR 2')).toBe('A flow named "SENSOR 2" already exists in this group');
    expect(findFlowNameConflict(flows, 'Sensor 3')).toBeNull();
    expect(findFlowNameConflict(flows, '')).toBeNull();
  });

  it('ignores the flow being renamed', () => {
    expect(findFlowNameConflict(flows, 'sensor 1', 'f1')).toBeNull();
    expect(findFlowNameConflict(flows, 'sensor 2', 'f1')).not.toBeNull();
  });

  it('adds the smallest free " (k)" suffix', () => {
    expect(makeUniqueName('Sensor 3', ['Sensor 1'])).toBe('Sensor 3');
    expect(makeUniqueName('Sensor', ['Sensor', 'sensor (2)'])).toBe('Sensor (3)');
  });

  it('renames a batch against the existing names and the earlier names of the batch', () => {
    expect(uniqueBatchNames(['Sensor', 'Sensor'], ['Sensor'])).toEqual(['Sensor (2)', 'Sensor (3)']);
    expect([...findBatchNameCollisions(['A', 'b', 'B', 'C'], ['a'])]).toEqual([0, 2]);
  });
});
