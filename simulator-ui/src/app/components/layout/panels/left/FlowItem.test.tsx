import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Flow, Variable } from '../../../../types';
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

function renderItem(
  flowMetrics: Record<string, FlowMetricsPayload> | undefined,
  onSelect = vi.fn(),
  template = '',
  variables: Variable[] = [],
  item: Flow = flow,
) {
  mockUseApp.mockReturnValue({ state: { variables, flowMetrics, dirtyItems: undefined } });
  return render(
    <FlowItem
      flow={item}
      selected={false}
      groupId="g1"
      onSelect={onSelect}
      onToggleEnabled={vi.fn()}
      onClone={vi.fn()}
      onDelete={vi.fn(async () => undefined)}
      formatTemplate={{ f1: template }}
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

  it('shows the dropped messages in amber only when there are some', () => {
    renderItem({ f1: { ...metrics, dropped: 1500 } });
    const dropped = screen.getByTitle('Generated but lost on purpose (event loss)');
    expect(dropped).toHaveTextContent('1.5K dropped');
    expect(dropped.className).toContain('text-amber-600');
    cleanup();

    renderItem({ f1: { ...metrics, dropped: 0 } });
    expect(screen.getByTestId('flow-metrics')).not.toHaveTextContent('dropped');
    cleanup();

    renderItem({ f1: metrics });
    expect(screen.getByTestId('flow-metrics')).not.toHaveTextContent('dropped');
  });

  it('shows the flow name as typed, even with a "·" in it', () => {
    renderItem(undefined, vi.fn(), '', [], { ...flow, name: 'Line A · Station 2' });
    expect(screen.getByText('Line A · Station 2')).toBeInTheDocument();
    cleanup();

    // Only a leading "<technology> · " prefix (mock data) is dropped, as the badge shows it
    renderItem(undefined, vi.fn(), '', [], { ...flow, name: 'file · out' });
    expect(screen.getByText('out')).toBeInTheDocument();
  });

  it('shows zeros before any metrics arrive', () => {
    renderItem(undefined);
    const row = screen.getByTestId('flow-metrics');
    expect(row).toHaveTextContent('0 msg/s');
    expect(row).toHaveTextContent('0 sent');
    expect(row).toHaveTextContent('0 fails');
  });

  it('selects the flow from the keyboard, but not when the key comes from its menu button', () => {
    const onSelect = vi.fn();
    renderItem(undefined, onSelect);
    const row = screen.getByTestId('flow-metrics').closest('[role="button"]') as HTMLElement;
    expect(row).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith('g1', 'f1');

    fireEvent.keyDown(row, { key: 'a' });
    fireEvent.keyDown(row.querySelector('button') as HTMLElement, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('shows chips for unscoped placeholders, resolved to the closest scope like the Core', () => {
    const variables: Variable[] = [
      { id: 'v1', name: 'temperature', scope: 'global', type: 'numeric', config: {} },
      { id: 'v2', name: 'temperature', scope: 'local', type: 'numeric', config: {}, flowId: 'f1', groupId: 'g1' },
      { id: 'v3', name: 'site', scope: 'group', type: 'string', config: {}, groupId: 'g1' },
    ];
    renderItem(undefined, vi.fn(), '{"t": {{temperature}}, "r": {{temperature.round}}, "s": "{{site}}", "id": "{{uuid}}", "x": {{nope}}}', variables);

    expect(screen.getByTitle('local · {{local.temperature}}')).toHaveTextContent('temperature');
    expect(screen.getByTitle('group · {{group.site}}')).toHaveTextContent('site');
    expect(screen.queryByTitle(/uuid|nope/)).not.toBeInTheDocument();
  });
});
