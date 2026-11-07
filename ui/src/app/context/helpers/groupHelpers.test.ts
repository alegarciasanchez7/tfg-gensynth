import { describe, expect, it } from 'vitest';
import { mapFlowFromCore, mapGroupFromCore, reorderFlows } from './groupHelpers';
import type { FlowState, GroupState } from '../../core/types';
import type { Group } from '../../types';

const coreFlow = (overrides: Partial<FlowState> = {}): FlowState => ({
  id: 'f1',
  name: 'Flow',
  technology: 'file',
  connectionStatus: 'connected',
  throughput: 0,
  latency: 0,
  hasError: false,
  interval: 1000,
  burst: 1,
  everyTicks: 2,
  topic: '',
  host: 'localhost',
  port: 0,
  enabled: true,
  ...overrides,
});

describe('mapFlowFromCore', () => {
  it('keeps the event loss sent by the Core', () => {
    const flow = mapFlowFromCore(coreFlow({ lossPercent: 12.5, outageEveryTicks: 10, outageDurationTicks: 2 }));

    expect(flow.lossPercent).toBe(12.5);
    expect(flow.outageEveryTicks).toBe(10);
    expect(flow.outageDurationTicks).toBe(2);
  });

  it('defaults a missing event loss to 0', () => {
    const flow = mapFlowFromCore(coreFlow());

    expect(flow.lossPercent).toBe(0);
    expect(flow.outageEveryTicks).toBe(0);
    expect(flow.outageDurationTicks).toBe(0);
  });
});

const coreGroup = (overrides: Record<string, unknown> = {}): GroupState => ({
  id: 'g1',
  name: 'Group',
  status: 'stopped',
  throughput: 0,
  description: '',
  threads: 1,
  outputMode: 'parallel',
  enabled: true,
  flows: [],
  ...overrides,
} as GroupState);

describe('mapGroupFromCore', () => {
  it('ignores the command status "ok" of a CREATE_GROUP response', () => {
    expect(mapGroupFromCore(coreGroup({ status: 'ok' })).status).toBe('stopped');
  });

  it('keeps the previous status when the Core sends an unknown one', () => {
    const previous = { ...mapGroupFromCore(coreGroup()), status: 'running' } as Group;

    expect(mapGroupFromCore(coreGroup({ status: 'ok' }), previous).status).toBe('running');
    expect(mapGroupFromCore(coreGroup({ status: 'paused' }), previous).status).toBe('paused');
  });

  it('normalises an unknown flow connection status', () => {
    const group = mapGroupFromCore(coreGroup({ flows: [coreFlow({ connectionStatus: 'ok' as never })] }));

    expect(group.flows[0].connectionStatus).toBe('disconnected');
  });

  it('reads the sequential order, with flow order for older cores', () => {
    expect(mapGroupFromCore(coreGroup({ sequentialOrder: 'generated' })).sequentialOrder).toBe('generated');
    expect(mapGroupFromCore(coreGroup()).sequentialOrder).toBe('flow');
  });
});

describe('reorderFlows', () => {
  const flows = ['a', 'b', 'c', 'd'].map((id) => mapFlowFromCore(coreFlow({ id })));
  const ids = (list: { id: string }[]) => list.map((flow) => flow.id);

  it('puts the listed flows first and keeps the others in order after them', () => {
    expect(ids(reorderFlows(flows, ['d', 'b']))).toEqual(['d', 'b', 'a', 'c']);
  });

  it('ignores unknown and repeated ids', () => {
    expect(ids(reorderFlows(flows, ['x', 'c', 'c']))).toEqual(['c', 'a', 'b', 'd']);
  });
});
