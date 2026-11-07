import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowMetricsPayload } from '../../../../core/types';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));
vi.mock('../../../../context', () => ({ useApp: () => mockUseApp() }));

import { StatsView } from './StatsView';

function flowMetrics(flowId: string, dropped?: number): FlowMetricsPayload {
  return {
    flowId,
    groupId: 'g1',
    throughput: 1,
    generated: 10,
    sent: 8,
    failed: 0,
    dropped,
    latency: 2,
    errorRate: 0,
    connectionStatus: 'connected',
  };
}

function renderStats(running: boolean, metrics: Record<string, FlowMetricsPayload>) {
  mockUseApp.mockReturnValue({
    state: { metrics: { totalMessages: 16, errorCount: 0 }, groups: [], flowMetrics: metrics },
  });
  return render(<StatsView running={running} />);
}

/** Value shown in the counter card with the given label. */
function counterValue(label: string): HTMLElement {
  const card = screen.getByText(label).parentElement as HTMLElement;
  return card.lastElementChild as HTMLElement;
}

describe('StatsView', () => {
  afterEach(() => cleanup());

  it('shows the sum of the dropped messages of every flow in amber', () => {
    renderStats(true, { f1: flowMetrics('f1', 1200), f2: flowMetrics('f2', 300), f3: flowMetrics('f3') });

    const dropped = counterValue('DROPPED');
    expect(dropped).toHaveTextContent('1.5 K');
    expect(dropped.className).toContain('text-amber-500');
  });

  it('shows 0 when nothing was dropped or the system is stopped', () => {
    renderStats(true, { f1: flowMetrics('f1', 0) });
    expect(counterValue('DROPPED')).toHaveTextContent('0');
    expect(counterValue('DROPPED').className).not.toContain('text-amber-500');
    cleanup();

    renderStats(false, { f1: flowMetrics('f1', 50) });
    expect(counterValue('DROPPED')).toHaveTextContent('0');
  });

  it('keeps TOTAL SENT and ERRORS after STOP: the Core totals carry over until restart', () => {
    mockUseApp.mockReturnValue({
      state: { metrics: { totalMessages: 18441, errorCount: 2 }, groups: [], flowMetrics: {} },
    });
    render(<StatsView running={false} />);
    expect(counterValue('TOTAL SENT')).toHaveTextContent('18.4 K');
    expect(counterValue('ERRORS')).toHaveTextContent('2');
    expect(counterValue('ERRORS').className).toContain('text-red-500');
  });
});
