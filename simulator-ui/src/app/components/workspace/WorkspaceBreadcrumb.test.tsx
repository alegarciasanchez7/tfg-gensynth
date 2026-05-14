import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WorkspaceBreadcrumb } from './WorkspaceBreadcrumb';
import type { Selection, Group, Variable } from '../../types';
import { afterEach } from 'vitest';

afterEach(cleanup);

describe('WorkspaceBreadcrumb', () => {
  const mockGroups: Group[] = [
    {
      id: 'g1',
      name: 'Test Group',
      status: 'stopped',
      throughput: '0 msg/s',
      description: '',
      threads: 1,
      outputMode: 'mqtt',
      enabled: true,
      expanded: true,
      flows: [
        {
          id: 'f1',
          name: 'Test Flow',
          technology: 'MQTT',
          connectionStatus: 'disconnected',
          throughput: '0 msg/s',
          latency: 0,
          hasError: false,
          interval: 1000,
          burst: 1,
          topic: 'test',
          host: 'localhost',
          port: 1883,
          enabled: true
        }
      ]
    }
  ];

  const mockVariables: Variable[] = [];

  const defaultProps = {
    groups: mockGroups,
    variables: mockVariables,
    onSelectGroup: vi.fn(),
    onSelectFlow: vi.fn(),
    onClearSelection: vi.fn(),
  };

  it('renders WORKSPACE segment when no selection', () => {
    const selection: Selection = { type: 'none' };
    render(<WorkspaceBreadcrumb {...defaultProps} selection={selection} />);
    expect(screen.getByText('WORKSPACE')).toBeInTheDocument();
  });

  it('renders Group segment and handles navigation', () => {
    const selection: Selection = { type: 'group', groupId: 'g1' };
    render(<WorkspaceBreadcrumb {...defaultProps} selection={selection} />);
    
    expect(screen.getByText('WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText('GROUP · TEST GROUP')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('WORKSPACE'));
    expect(defaultProps.onClearSelection).toHaveBeenCalled();
  });

  it('renders Flow segment and handles navigation back to group', () => {
    const selection: Selection = { type: 'flow', groupId: 'g1', flowId: 'f1' };
    render(<WorkspaceBreadcrumb {...defaultProps} selection={selection} />);
    
    expect(screen.getByText('WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText('GROUP · TEST GROUP')).toBeInTheDocument();
    expect(screen.getByText('FLOW · TEST FLOW')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('GROUP · TEST GROUP'));
    expect(defaultProps.onSelectGroup).toHaveBeenCalledWith('g1');
  });
});
