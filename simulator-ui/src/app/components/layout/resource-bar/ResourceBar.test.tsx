import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUseSystemStatus, mockUseMetrics } = vi.hoisted(() => ({
  mockUseSystemStatus: vi.fn(),
  mockUseMetrics: vi.fn(),
}));

vi.mock('../../../context', () => ({
  useSystemStatus: () => mockUseSystemStatus(),
  useMetrics: () => mockUseMetrics(),
}));

import { ResourceBar } from './ResourceBar';

describe('ResourceBar', () => {
  afterEach(() => cleanup());

  it('renders as a compact standalone bar with all metrics', () => {
    mockUseSystemStatus.mockReturnValue('running');
    mockUseMetrics.mockReturnValue({
      metrics: { cpu: 12.5, memory: 256, heap: 1024, networkUp: 2048, networkDown: 0, messagesPerSecond: 10, totalMessages: 1500, uptime: 65 },
    });
    render(<ResourceBar />);

    const bar = screen.getByTestId('resource-bar');
    expect(bar.style.height).toBe('28px');
    for (const label of ['CPU', 'RAM', 'NET↑', 'NET↓', 'MSG/S', 'UPTIME']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('12.5')).toBeTruthy();
    expect(screen.getByText('00:01:05')).toBeTruthy();
  });

  it('shows idle values while the simulator is stopped', () => {
    mockUseSystemStatus.mockReturnValue('stopped');
    mockUseMetrics.mockReturnValue({ metrics: null });
    render(<ResourceBar />);

    expect(screen.getByText('--:--:--')).toBeTruthy();
  });
});
