import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flow, Group } from '../../types';
import type { FlowMetricsPayload } from '../../core/types';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));
vi.mock('../../context', () => ({ useApp: () => mockUseApp() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { GroupWorkspace } from './GroupWorkspace';

const flow = (id: string, name: string): Flow => ({
  id,
  name,
  technology: 'file',
  connectionStatus: 'connected',
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
});

const group: Group = {
  id: 'g1',
  name: 'Sensors',
  status: 'running',
  throughput: '0 msg/s',
  description: '',
  threads: 4,
  outputMode: 'parallel',
  expanded: true,
  enabled: true,
  flows: [flow('f1', 'Temperature'), flow('f2', 'Humidity')],
};

const metrics = (flowId: string, throughput: number): FlowMetricsPayload => ({
  flowId,
  groupId: 'g1',
  throughput,
  generated: 0,
  sent: 0,
  failed: 0,
  latency: 0,
  errorRate: 0,
  connectionStatus: 'connected',
});

describe('GroupWorkspace', () => {
  const actions = {
    updateGroupConfig: vi.fn(),
    selectFlow: vi.fn(),
    discardItemChanges: vi.fn(),
    deleteGroup: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApp.mockReturnValue({
      state: {
        dirtyItems: { groupIds: new Set<string>() },
        flowMetrics: { f1: metrics('f1', 1.5), f2: metrics('f2', 0.5) },
      },
      actions,
    });
  });

  afterEach(() => cleanup());

  it('no longer shows threads, rate limit or timing settings', () => {
    render(<GroupWorkspace group={group} />);
    expect(screen.queryByText(/threads/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rate limit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/timing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/schedule mode/i)).not.toBeInTheDocument();
  });

  it('offers only Sequential and Parallel output modes', () => {
    render(<GroupWorkspace group={group} />);
    const select = screen.getByLabelText('Output Mode');
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options).toEqual(['Sequential', 'Parallel']);

    fireEvent.change(select, { target: { value: 'sequential' } });
    expect(actions.updateGroupConfig).toHaveBeenCalledWith('g1', { outputMode: 'sequential' }, 'Sensors');
  });

  it('shows the live group throughput as the sum of its flows', () => {
    render(<GroupWorkspace group={group} />);
    expect(screen.getByText('2.0 msg/s')).toBeInTheDocument();
  });

  it('lists the flows compactly and opens a flow when clicked', () => {
    render(<GroupWorkspace group={group} />);
    expect(screen.getByText('Flows in this group (2)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Humidity/ }));
    expect(actions.selectFlow).toHaveBeenCalledWith('g1', 'f2');
  });
});
