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
      metrics: {
        cpu: 12.5, memory: 256, heap: 1024, networkUp: 2048, networkDown: 0, messagesPerSecond: 10,
        totalMessages: 1500, uptime: 65, ticksPerSecond: 4, totalTicks: 2500,
      },
    });
    render(<ResourceBar />);

    const bar = screen.getByTestId('resource-bar');
    expect(bar.style.height).toBe('28px');
    for (const label of ['CPU', 'RAM', 'NET↑', 'NET↓', 'MSG/S', 'TICK', 'UPTIME']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('12.5')).toBeTruthy();
    expect(screen.getByText('00:01:05')).toBeTruthy();
    expect(screen.getByText('4.00')).toBeTruthy();
    expect(screen.getByText('/s (2.5 K total)')).toBeTruthy();
  });

  it('shows a zero tick rate when an older core sends no tick metrics', () => {
    mockUseSystemStatus.mockReturnValue('running');
    mockUseMetrics.mockReturnValue({
      metrics: { cpu: 0, memory: 1, heap: 1, networkUp: 0, networkDown: 0, messagesPerSecond: 0, totalMessages: 0, uptime: 1 },
    });
    render(<ResourceBar />);

    expect(screen.getByText('/s (0 total)')).toBeTruthy();
  });

  it('shows idle values while the simulator is stopped', () => {
    mockUseSystemStatus.mockReturnValue('stopped');
    mockUseMetrics.mockReturnValue({ metrics: null });
    render(<ResourceBar />);

    expect(screen.getByText('--:--:--')).toBeTruthy();
  });

  it('formats MSG/S compactly instead of with locale separators', () => {
    mockUseSystemStatus.mockReturnValue('running');
    mockUseMetrics.mockReturnValue({
      metrics: {
        cpu: 1, memory: 256, heap: 1024, networkUp: 0, networkDown: 0, messagesPerSecond: 18441,
        totalMessages: 500, uptime: 5, ticksPerSecond: 1, totalTicks: 5,
      },
    });
    render(<ResourceBar />);
    expect(screen.getByText('18.4K')).toBeTruthy();
    expect(screen.queryByText('18,441')).toBeNull();
    expect(screen.queryByText('18.441')).toBeNull();
  });

  it('measures the RAM bar against the most the JVM may use, not the heap reserved now', () => {
    mockUseSystemStatus.mockReturnValue('running');
    mockUseMetrics.mockReturnValue({
      metrics: {
        cpu: 1, memory: 256, heap: 300, maxHeap: 2048, networkUp: 0, networkDown: 0, messagesPerSecond: 0,
        totalMessages: 0, uptime: 5, ticksPerSecond: 1, totalTicks: 5,
      },
    });
    render(<ResourceBar />);

    const ram = screen.getByTitle('Memory used by GenSynth out of the most it may use (2048 MB)');
    const fill = ram.querySelector<HTMLElement>('[style*="width"]');
    expect(fill?.style.width).toBe('12.5%');
  });

  it('falls back to the reserved heap when an older core sends no maxHeap', () => {
    mockUseSystemStatus.mockReturnValue('running');
    mockUseMetrics.mockReturnValue({
      metrics: { cpu: 0, memory: 256, heap: 1024, networkUp: 0, networkDown: 0, messagesPerSecond: 0, totalMessages: 0, uptime: 1 },
    });
    render(<ResourceBar />);

    const ram = screen.getByTitle('Memory used by GenSynth out of the most it may use (1024 MB)');
    expect(ram.querySelector<HTMLElement>('[style*="width"]')?.style.width).toBe('25%');
  });
});
