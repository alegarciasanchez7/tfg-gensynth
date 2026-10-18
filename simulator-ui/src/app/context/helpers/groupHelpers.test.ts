import { describe, expect, it } from 'vitest';
import { mapFlowFromCore } from './groupHelpers';
import type { FlowState } from '../../core/types';

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
