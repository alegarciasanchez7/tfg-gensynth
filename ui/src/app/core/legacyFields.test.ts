import { describe, expect, it } from 'vitest';
import { legacyFlowFields, legacyGroupFields } from './legacyFields';
import type { Flow, Group } from '../types';

describe('legacyFields', () => {
  it('reads the legacy fields of a flow, also from a partial one of an old project file', () => {
    const flow = { id: 'f1', throughput: '5 msg/s', interval: 250, burst: 3 } as Partial<Flow>;
    expect(legacyFlowFields(flow)).toMatchObject({ throughput: '5 msg/s', interval: 250, burst: 3 });
    expect(legacyFlowFields({ id: 'f2' }).interval).toBeUndefined();
  });

  it('reads the legacy fields of a group', () => {
    const group = { id: 'g1', throughput: '0 msg/s', threads: 4 } as Partial<Group>;
    expect(legacyGroupFields(group)).toMatchObject({ throughput: '0 msg/s', threads: 4 });
    expect(legacyGroupFields({ id: 'g2' }).threads).toBeUndefined();
  });
});
