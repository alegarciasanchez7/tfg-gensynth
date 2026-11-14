import { describe, expect, it } from 'vitest';
import { computeDirtyState, getFlowComparable } from './dirtyStateHelper';
import type { Flow, Group, ProjectSettings, Variable } from '../../types';

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

const group = (flows: Flow[], id = 'g1'): Group => ({
  id,
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

const variable = (overrides: Partial<Variable> = {}): Variable => ({
  id: 'v1',
  name: 'v',
  type: 'numeric',
  scope: 'global',
  config: {},
  ...overrides,
});

const settings = (value: number): ProjectSettings => ({ tick: { mode: 'FIXED_RATE', value, unit: 'MILLISECONDS' } });

const ids = (set: Set<string>) => [...set];

describe('computeDirtyState', () => {
  it('without a baseline marks every group, flow and variable', () => {
    const result = computeDirtyState(null, [group([flow(), flow({ id: 'f2' })])], [variable()]);
    expect(result.isDirty).toBe(true);
    expect(ids(result.dirtyItems.groupIds)).toEqual(['g1']);
    expect(ids(result.dirtyItems.flowIds)).toEqual(['f1', 'f2']);
    expect(ids(result.dirtyItems.variableIds)).toEqual(['v1']);
    expect(computeDirtyState(null, [], []).isDirty).toBe(false);
  });

  it('is clean when nothing changed, ignoring runtime metrics', () => {
    const saved = { groups: [group([flow()])], variables: [variable()], settings: settings(100) };
    const live = [{ ...group([flow({ connectionStatus: 'connected', latency: 9 })]), status: 'running' as const, expanded: false }];
    const result = computeDirtyState(saved, live, [variable()], settings(100));
    expect(result.isDirty).toBe(false);
    expect(ids(result.dirtyItems.groupIds)).toEqual([]);
  });

  it('marks the project, not an entity, when only the tick settings change', () => {
    const saved = { groups: [], variables: [], settings: settings(100) };
    const result = computeDirtyState(saved, [], [], settings(200));
    expect(result.isDirty).toBe(true);
    expect(ids(result.dirtyItems.groupIds)).toEqual([]);
    expect(computeDirtyState(saved, [], []).isDirty).toBe(false);
  });

  it('marks the project when a group or a variable was deleted', () => {
    const saved = { groups: [group([]), group([], 'g2')], variables: [variable(), variable({ id: 'v2' })] };
    expect(computeDirtyState(saved, [group([])], [variable(), variable({ id: 'v2' })]).isDirty).toBe(true);
    expect(computeDirtyState(saved, [group([]), group([], 'g2')], [variable()]).isDirty).toBe(true);
  });

  it('marks a new group with all its flows', () => {
    const saved = { groups: [group([])], variables: [] };
    const result = computeDirtyState(saved, [group([]), group([flow({ id: 'f9' })], 'g2')], []);
    expect(result.isDirty).toBe(true);
    expect(ids(result.dirtyItems.groupIds)).toEqual(['g2']);
    expect(ids(result.dirtyItems.flowIds)).toEqual(['f9']);
  });

  it('marks a group whose own fields changed, without marking its flows', () => {
    const saved = { groups: [group([flow()])], variables: [] };
    const result = computeDirtyState(saved, [{ ...group([flow()]), name: 'Renamed' }], []);
    expect(ids(result.dirtyItems.groupIds)).toEqual(['g1']);
    expect(ids(result.dirtyItems.flowIds)).toEqual([]);
  });

  it('marks the group of a new, changed or deleted flow', () => {
    const saved = { groups: [group([flow(), flow({ id: 'f2' })])], variables: [] };
    const added = computeDirtyState(saved, [group([flow(), flow({ id: 'f2' }), flow({ id: 'f3' })])], []);
    expect(ids(added.dirtyItems.groupIds)).toEqual(['g1']);
    expect(ids(added.dirtyItems.flowIds)).toEqual(['f3']);

    const changed = computeDirtyState(saved, [group([flow(), flow({ id: 'f2', topic: 'new' })])], []);
    expect(ids(changed.dirtyItems.flowIds)).toEqual(['f2']);

    const deleted = computeDirtyState(saved, [group([flow()])], []);
    expect(deleted.isDirty).toBe(true);
    expect(ids(deleted.dirtyItems.groupIds)).toEqual(['g1']);
    expect(ids(deleted.dirtyItems.flowIds)).toEqual([]);
  });

  it('marks new and changed variables', () => {
    const saved = { groups: [], variables: [variable(), variable({ id: 'v2' })] };
    const result = computeDirtyState(saved, [], [variable({ description: 'edited' }), variable({ id: 'v3' })]);
    expect(result.isDirty).toBe(true);
    expect(ids(result.dirtyItems.variableIds)).toEqual(['v1', 'v3']);
  });
});

