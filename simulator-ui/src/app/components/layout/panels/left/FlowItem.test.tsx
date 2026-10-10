import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Flow } from '../../../../types';
import type { FlowMetricsPayload } from '../../../../core/types';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));
vi.mock('../../../../context', () => ({ useApp: () => mockUseApp() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FlowItem } from './FlowItem';

const flow: Flow = {
  id: 'f1',
  name: 'Sensor',
  technology: 'file',
  connectionStatus: 'connected',
  throughput: '99 msg/s',
  hasError: false,
  interval: 1000,
  burst: 1,
  everyTicks: 5,
  topic: '',
  host: 'localhost',
  port: 0,
  latency: 0,
  enabled: true,
};

const metrics: FlowMetricsPayload = {
  flowId: 'f1',
  groupId: 'g1',
  throughput: 0.2,
  generated: 1203,
  sent: 1200,
  failed: 3,
  latency: 1,
  errorRate: 0,
  connectionStatus: 'connected',
};

function renderItem(flowMetrics: Record<string, FlowMetricsPayload> | undefined) {
  mockUseApp.mockReturnValue({ state: { variables: [], flowMetrics, dirtyItems: undefined } });
  return render(
    <FlowItem
      flow={flow}
      selected={false}
      groupId="g1"
      onSelect={vi.fn()}
      onToggleEnabled={vi.fn()}
      onClone={vi.fn()}
      onDelete={vi.fn(async () => undefined)}
      formatTemplate={{}}
    />,
  );
}

describe('FlowItem', () => {
  afterEach(() => cleanup());

  it('shows the live msg/s, sent and failed messages of the flow', () => {
    renderItem({ f1: metrics });
    const row = screen.getByTestId('flow-metrics');
    expect(row).toHaveTextContent('0.20 msg/s');
    expect(row).toHaveTextContent('1.2K sent');
    expect(row).toHaveTextContent('3 fails');
    // The legacy throughput string is no longer shown
    expect(screen.queryByText('99 msg/s')).not.toBeInTheDocument();
  });

  it('shows zeros before any metrics arrive', () => {
    renderItem(undefined);
    const row = screen.getByTestId('flow-metrics');
    expect(row).toHaveTextContent('0 msg/s');
    expect(row).toHaveTextContent('0 sent');
    expect(row).toHaveTextContent('0 fails');
  });
});
