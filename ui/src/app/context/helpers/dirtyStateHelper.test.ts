import { describe, expect, it } from 'vitest';
import { computeDirtyState, getFlowComparable } from './dirtyStateHelper';
import type { Flow, Group } from '../../types';

const flow = (overrides: Partial<Flow> = {}): Flow => ({
  id: 'f1',
  name: 'Flow',
  technology: 'file',
  connectionStatus: 'disconnected',
  throughput: '0 msg/s',
  hasError: false,
  interval: 1000,
  burst: 1,
  everyTicks: 1,
  topic: '',
  host: 'localhost',
  port: 0,
  latency: 0,
  enabled: true,
  ...overrides,
});

const group = (flows: Flow[]): Group => ({
  id: 'g1',
  name: 'Group',
  status: 'stopped',
  throughput: '0 msg/s',
  description: '',
  threads: 1,
  outputMode: 'parallel',
  sequentialOrder: 'flow' as const,
  expanded: true,
  enabled: true,
  flows,
});

describe('dirty state of the flow event loss', () => {
  it('treats a missing event loss as 0', () => {
    expect(getFlowComparable(flow())).toEqual(
      getFlowComparable(flow({ lossPercent: 0, outageEveryTicks: 0, outageDurationTicks: 0 })),
    );
  });

  it('marks the flow as dirty when its event loss changes', () => {
    const saved = { groups: [group([flow()])], variables: [] };

    for (const change of [{ lossPercent: 5 }, { outageEveryTicks: 4 }, { outageDurationTicks: 1 }]) {
      const result = computeDirtyState(saved, [group([flow(change)])], []);
      expect(result.isDirty).toBe(true);
      expect(result.dirtyItems.flowIds.has('f1')).toBe(true);
    }

    expect(computeDirtyState(saved, [group([flow({ lossPercent: 0 })])], []).isDirty).toBe(false);
  });
});
