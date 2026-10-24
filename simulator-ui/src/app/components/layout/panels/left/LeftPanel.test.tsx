import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Flow, Group, Selection } from '../../../../types';
import type { ConnectorPluginDescriptor } from '../../../../core/types';

import { LeftPanel } from './LeftPanel';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(() => ({
    actions: {
      registerTemplateEditor: vi.fn(),
      insertVariable: vi.fn(),
    },
    state: {
      groups: [],
    },
  })),
}));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

describe('LeftPanel', () => {
  const group: Group = {
    id: 'g1',
    name: 'Orders',
    status: 'running',
    throughput: '120 msg/s',
    description: 'Order stream',
    threads: 2,
    outputMode: 'parallel',
    expanded: true,
    enabled: true,
    flows: [],
  };

  const latestConnectors: ConnectorPluginDescriptor[] = [
    {
      pluginId: 'file',
      displayName: 'File Output (TXT/JSON)',
      pluginVersion: '1.0.0',
      description: '',
      apiVersion: '1.0',
      external: false,
      fields: [
        { key: 'outputDir', type: 'TEXT', label: 'Output directory', tooltip: '', required: false, defaultValue: './outputs', placeholder: '', options: [] },
        {
          key: 'format', type: 'SELECT', label: 'Format', tooltip: '', required: false, defaultValue: 'json', placeholder: '',
          options: [{ value: 'json', label: 'JSON' }, { value: 'txt', label: 'Text' }],
        },
        { key: 'fileName', type: 'TEXT', label: 'File name', tooltip: '', required: false, defaultValue: null, placeholder: '', options: [] },
      ],
    },
    {
      pluginId: 'http',
      displayName: 'HTTP Connector',
      pluginVersion: '1.0.0',
      description: '',
      apiVersion: '1.0',
      external: false,
      fields: [
        { key: 'endpoint', type: 'TEXT', label: 'Endpoint', tooltip: '', required: true, defaultValue: null, placeholder: '', options: [] },
      ],
    },
  ];

  const selection: Selection = {
    type: 'group',
    groupId: group.id,
  };

  const baseProps = {
    groups: [group],
    selection,
    variables: [],
    formatTemplate: {},
    latestConnectors,
    onSelectGroup: vi.fn(),
    onSelectFlow: vi.fn(),
    onToggleGroup: vi.fn(),
    onCreateGroup: vi.fn(async () => group),
    onDeleteGroup: vi.fn(async () => undefined),
    onDeleteFlow: vi.fn(async () => undefined),
    onUpdateGroupConfig: vi.fn(),
    onUpdateFlowConfig: vi.fn(),
    onCloneGroup: vi.fn(),
    onCloneFlow: vi.fn(),
    onCreateFlow: vi.fn(async (_groupId: string, name: string): Promise<Flow> => ({
      id: 'flow-1',
      name,
      technology: 'file',
      connectionStatus: 'disconnected',
      throughput: '0 msg/s',
      hasError: false,
      interval: 1000,
      burst: 1,
      everyTicks: 1,
      topic: '',
      host: 'localhost',
      port: 8080,
      latency: 0,
      enabled: true,
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows selecting a connector when creating a flow and sends the config', async () => {
    const user = userEvent.setup();

    render(<LeftPanel {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /add flow/i }));

    const connectorSelect = await screen.findByRole('combobox', { name: /connector/i });
    expect(connectorSelect).toHaveValue('');

    await user.selectOptions(connectorSelect, 'file');
    expect(connectorSelect).toHaveValue('file');

    await user.type(screen.getByLabelText(/^name$/i), 'Output flow');
    await user.click(screen.getByRole('button', { name: /create flow/i }));

    expect(baseProps.onCreateFlow).toHaveBeenCalledWith(
      'g1',
      'Output flow',
      'file',
      '', // legacy host/port/topic: the destination is part of the connector configuration
      0,
      undefined,
      undefined, // legacy interval: pacing comes from the global tick clock
      undefined, // legacy burst: one message every N ticks
      '{}',
      {
        outputDir: './outputs',
        format: 'json',
      },
      1, // everyTicks
      false, // autoRename: only the Repeater renames taken names
    );
  });

  it('ADD → Add Flow targets the selected group and hides the group selector', async () => {
    const user = userEvent.setup();
    const other: Group = { ...group, id: 'g2', name: 'Payments', expanded: false };

    render(<LeftPanel {...baseProps} groups={[group, other]} selection={{ type: 'group', groupId: 'g2' }} />);

    await user.click(screen.getByRole('button', { name: 'Add group or flow' }));
    await user.click(screen.getByRole('button', { name: 'Add Flow' }));

    const dialog = await screen.findByRole('dialog', { name: 'Add flow' });
    expect(dialog).toHaveTextContent('Create a new flow inside "Payments".');
    expect(screen.queryByLabelText('Group')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: /connector/i }), 'file');
    await user.type(screen.getByLabelText(/^name$/i), 'Sensor 1');
    await user.click(screen.getByRole('button', { name: /create flow/i }));

    expect(baseProps.onCreateFlow.mock.calls[0][0]).toBe('g2');
  });

  it('ADD → Add Flow uses the group of the selected flow, and asks for one when nothing is selected', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <LeftPanel {...baseProps} groups={[{ ...group, expanded: false }]} selection={{ type: 'flow', groupId: 'g1', flowId: 'f1' }} />,
    );
    await user.click(screen.getByRole('button', { name: 'Add group or flow' }));
    await user.click(screen.getByRole('button', { name: 'Add Flow' }));
    expect(await screen.findByRole('dialog', { name: 'Add flow' })).toHaveTextContent('inside "Orders"');
    unmount();

    render(<LeftPanel {...baseProps} groups={[{ ...group, expanded: false }]} selection={{ type: 'none' }} />);
    await user.click(screen.getByRole('button', { name: 'Add group or flow' }));
    await user.click(screen.getByRole('button', { name: 'Add Flow' }));
    expect(await screen.findByLabelText('Group')).toHaveValue('');
  });

  it('does not count locked groups as running in the footer', () => {
    const locked: Group = { ...group, id: 'g2', name: 'Payments', enabled: false, expanded: false };

    render(<LeftPanel {...baseProps} groups={[group, locked]} />);

    expect(screen.getByText(/running/)).toHaveTextContent('1/2 running (1 locked)');
  });

  it('shows no locked count when no group is locked', () => {
    render(<LeftPanel {...baseProps} />);
    expect(screen.getByText(/running/)).toHaveTextContent(/^1\/1 running$/);
  });

  it('opens the Repeater from the group menu even when the group is collapsed', async () => {
    const user = userEvent.setup();

    render(<LeftPanel {...baseProps} groups={[{ ...group, expanded: false }]} />);

    expect(screen.queryByRole('button', { name: /add flow/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for group Orders' }));
    await user.click(await screen.findByRole('menuitem', { name: /repeater/i }));

    expect(await screen.findByRole('dialog', { name: 'Repeater' })).toBeInTheDocument();
    expect(screen.getByLabelText('Number of flows')).toHaveValue(2);
    expect(screen.getByRole('button', { name: 'Create 2 flows' })).toBeDisabled();
  });
});
