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
      coreApiVersion: '1.0.0',
      external: false,
      configSchema: {
        type: 'object',
        properties: {
          outputDir: { type: 'string' },
          format: { type: 'string' },
          fileName: { type: 'string' },
        },
      },
    },
    {
      pluginId: 'http',
      displayName: 'HTTP Connector',
      pluginVersion: '1.0.0',
      coreApiVersion: '1.0.0',
      external: false,
      configSchema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
        },
      },
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

  it('defaults to file when creating a flow from a group and sends file config', async () => {
    const user = userEvent.setup();

    render(<LeftPanel {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /add flow/i }));

    const technologySelect = await screen.findByRole('combobox', { name: /technology/i });
    expect(technologySelect).toHaveValue('file');

    await user.type(screen.getByLabelText(/^name$/i), 'Output flow');
    await user.click(screen.getByRole('button', { name: /create flow/i }));

    expect(baseProps.onCreateFlow).toHaveBeenCalledWith(
      'g1',
      'Output flow',
      'file',
      'localhost',
      8080,
      undefined,
      1000,
      1,
      '{}',
      {
        outputDir: './outputs',
        format: 'json',
      },
    );
  });
});