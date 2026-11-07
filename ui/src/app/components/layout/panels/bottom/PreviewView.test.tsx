import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewView } from './PreviewView';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));
vi.mock('../../../../context', () => ({ useApp: () => mockUseApp() }));

type Log = { id: string; timestamp: string; level: 'data' | 'info'; source: string; message: string };

const groups = [
  {
    id: 'g1',
    name: 'G',
    flows: [
      { id: 'f1', name: 'Flow 1', template: '{"n": {{n}}}' },
      { id: 'f2', name: 'Flow 2', template: '{"m": {{n}}}' },
    ],
  },
];

const dataLog = (id: string, source: string, payload: string, timestamp = `10:00:0${id}`): Log => ({
  id, timestamp, level: 'data', source, message: `[G - ${source}] ==> ${payload}`,
});

const withLogs = (logs: Log[]) => mockUseApp.mockReturnValue({ state: { groups, logs } });

describe('PreviewView', () => {
  beforeEach(() => withLogs([]));

  it('shows the last message of the flow also when the simulation is stopped', () => {
    withLogs([dataLog('1', 'f1', '{"n": 1}'), dataLog('2', 'f1', '{"n": 2}')]);
    render(<PreviewView running={false} />);

    expect(screen.getByTestId('preview-payload')).toHaveTextContent('{"n": 2}');
    expect(screen.getByText('10:00:02')).toBeInTheDocument();
  });

  it('says how to get a message when the flow has sent none', () => {
    render(<PreviewView running={false} />);

    expect(screen.getByText(/No message from this flow yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Capture/ })).toBeDisabled();
  });

  it('keeps a captured message while new ones arrive, until Live is pressed', () => {
    withLogs([dataLog('1', 'f1', '{"n": 1}')]);
    const { rerender } = render(<PreviewView running />);

    fireEvent.click(screen.getByRole('button', { name: /Capture/ }));
    withLogs([dataLog('1', 'f1', '{"n": 1}'), dataLog('2', 'f1', '{"n": 2}')]);
    rerender(<PreviewView running />);

    expect(screen.getByText('Captured Payload')).toBeInTheDocument();
    expect(screen.getByTestId('preview-payload')).toHaveTextContent('{"n": 1}');

    fireEvent.click(screen.getByRole('button', { name: /Live/ }));
    expect(screen.getByText('Last Payload')).toBeInTheDocument();
    expect(screen.getByTestId('preview-payload')).toHaveTextContent('{"n": 2}');
  });

  it('keeps each flow its own capture', () => {
    withLogs([dataLog('1', 'f1', '{"n": 1}'), dataLog('2', 'f2', '{"m": 2}')]);
    render(<PreviewView running />);
    fireEvent.click(screen.getByRole('button', { name: /Capture/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Flow 2' }));
    expect(screen.getByText('Last Payload')).toBeInTheDocument();
    expect(screen.getByTestId('preview-payload')).toHaveTextContent('{"m": 2}');

    fireEvent.click(screen.getByRole('button', { name: 'Flow 1' }));
    expect(screen.getByText('Captured Payload')).toBeInTheDocument();
  });

  it('shows the whole message even when it contains the log separator', () => {
    withLogs([dataLog('1', 'f1', 'a ==> b')]);
    render(<PreviewView running={false} />);

    expect(screen.getByTestId('preview-payload')).toHaveTextContent('a ==> b');
  });
});
