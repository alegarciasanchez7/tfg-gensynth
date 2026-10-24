import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flow, Group } from '../../../../types';
import type { ConnectorPluginDescriptor } from '../../../../core/types';

const { mockToast } = vi.hoisted(() => ({ mockToast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast: mockToast }));

import { CreateFlowDialog } from './CreateFlowDialog';

const fileConnector: ConnectorPluginDescriptor = {
  pluginId: 'file',
  displayName: 'File Output',
  pluginVersion: '1.0.0',
  description: 'Writes to a file',
  apiVersion: '1.0',
  external: false,
  fields: [
    { key: 'outputDir', type: 'TEXT', label: 'Output directory', tooltip: 'Where files go', required: false, defaultValue: './out', placeholder: '', options: [] },
  ],
};

const brokerConnector: ConnectorPluginDescriptor = {
  pluginId: 'broker',
  displayName: 'Broker',
  pluginVersion: '1.0.0',
  description: '',
  apiVersion: '1.0',
  external: true,
  fields: [
    { key: 'address', type: 'TEXT', label: 'Address', tooltip: '', required: true, defaultValue: null, placeholder: '', options: [] },
  ],
};

const createdFlow = (id: string, name: string): Flow => ({
  id,
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
});

describe('CreateFlowDialog', () => {
  const onOpenChange = vi.fn();
  const onSelectFlow = vi.fn();
  let counter = 0;
  const onCreateFlow = vi.fn(
    async (_groupId: string, name: string, ..._rest: unknown[]) => createdFlow(`f${++counter}`, name),
  );

  beforeEach(() => {
    counter = 0;
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  const group: Group = {
    id: 'g1',
    name: 'Sensors',
    status: 'stopped',
    throughput: '0 msg/s',
    description: '',
    threads: 1,
    outputMode: 'parallel',
    expanded: true,
    enabled: true,
    flows: [createdFlow('e1', 'Sensor 1'), createdFlow('e2', 'Sensor 2')],
  };

  const renderDialog = (repeat = false, groups?: Group[]) =>
    render(
      <CreateFlowDialog
        open
        onOpenChange={onOpenChange}
        groups={groups}
        groupId="g1"
        latestConnectors={[fileConnector, brokerConnector]}
        onCreateFlow={onCreateFlow}
        onSelectFlow={onSelectFlow}
        repeat={repeat}
      />,
    );

  async function fillBasics(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.type(screen.getByLabelText(/name/i), name);
    await user.selectOptions(screen.getByRole('combobox', { name: /connector/i }), 'file');
  }

  it('sends the "every N ticks" value as the last argument', async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillBasics(user, 'Sensor');
    const everyTicks = screen.getByLabelText('Every N ticks');
    await user.clear(everyTicks);
    await user.type(everyTicks, '4');

    await user.click(screen.getByRole('button', { name: 'Create flow' }));

    expect(onCreateFlow).toHaveBeenCalledTimes(1);
    const args = onCreateFlow.mock.calls[0];
    expect(args[1]).toBe('Sensor');
    expect(args[7]).toBeUndefined(); // legacy burst
    expect(args[10]).toBe(4);
    expect(onSelectFlow).toHaveBeenCalledWith('g1', 'f1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables creation for an invalid tick value', async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillBasics(user, 'Sensor');
    const everyTicks = screen.getByLabelText('Every N ticks');

    for (const invalid of ['0', '1.5']) {
      await user.clear(everyTicks);
      await user.type(everyTicks, invalid);
      expect(screen.getByRole('button', { name: 'Create flow' })).toBeDisabled();
    }
  });

  it('creates N flows in order with the naming pattern in Repeater mode', async () => {
    const user = userEvent.setup();
    renderDialog(true);
    expect(screen.getByRole('heading', { name: 'Repeater' })).toBeInTheDocument();
    await fillBasics(user, 'Sensor');
    const count = screen.getByLabelText('Number of flows');
    await user.clear(count);
    await user.type(count, '3');

    await user.click(screen.getByRole('button', { name: 'Create 3 flows' }));

    await waitFor(() => expect(onCreateFlow).toHaveBeenCalledTimes(3));
    expect(onCreateFlow.mock.calls.map((call) => call[1])).toEqual(['Sensor 1', 'Sensor 2', 'Sensor 3']);
    expect(onSelectFlow).toHaveBeenCalledWith('g1', 'f1');
    expect(mockToast.success).toHaveBeenCalledWith('3 flows created');
  });

  it('stops at the first failure and reports how many flows were created', async () => {
    const user = userEvent.setup();
    onCreateFlow
      .mockImplementationOnce(async (_g: string, name: string) => createdFlow('f1', name))
      .mockImplementationOnce(async () => { throw new Error('Core unavailable'); });
    renderDialog(true);
    await fillBasics(user, 'Sensor');
    const count = screen.getByLabelText('Number of flows');
    await user.clear(count);
    await user.type(count, '3');

    await user.click(screen.getByRole('button', { name: 'Create 3 flows' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Created 1 of 3 flows: Core unavailable'));
    expect(onCreateFlow).toHaveBeenCalledTimes(2);
    expect(onSelectFlow).toHaveBeenCalledWith('g1', 'f1');
  });

  it('shows the connector fields and blocks creation until required ones are filled', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/name/i), 'Sensor');
    await user.selectOptions(screen.getByRole('combobox', { name: /connector/i }), 'broker');

    expect(screen.getByText('Connection · Broker')).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Create flow' });
    expect(create).toBeDisabled();

    await user.type(screen.getByLabelText(/^Address/), 'tcp://host:1');
    expect(create).toBeEnabled();
    await user.click(create);

    expect(onCreateFlow).toHaveBeenCalledTimes(1);
    expect(onCreateFlow.mock.calls[0][9]).toEqual({ address: 'tcp://host:1' });
  });

  it('blocks a name already used in the group (trimmed, ignoring case)', async () => {
    const user = userEvent.setup();
    renderDialog(false, [group]);
    await fillBasics(user, '  sensor 2 ');

    expect(screen.getByRole('alert')).toHaveTextContent('A flow named "sensor 2" already exists in this group');
    expect(screen.getByRole('button', { name: 'Create flow' })).toBeDisabled();

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'Sensor 3');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create flow' })).toBeEnabled();
  });

  it('shows the message of a Core error (CRUD error object) instead of a generic text', async () => {
    const user = userEvent.setup();
    onCreateFlow.mockImplementationOnce(async () => {
      throw { code: 'UNKNOWN_ERROR', message: 'A flow named "Sensor" already exists in this group' };
    });
    renderDialog();
    await fillBasics(user, 'Sensor');
    await user.click(screen.getByRole('button', { name: 'Create flow' }));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('A flow named "Sensor" already exists in this group'));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('lets the Repeater rename taken names and previews the final names', async () => {
    const user = userEvent.setup();
    onCreateFlow.mockImplementation(async (_g: string, name: string) =>
      createdFlow(`f${++counter}`, name === 'Sensor 1' ? 'Sensor 1 (2)' : name));
    renderDialog(true, [group]);
    await fillBasics(user, 'Sensor');

    expect(screen.getByText('Sensor 1 (2)')).toBeInTheDocument();
    expect(screen.getByText('Sensor 2 (2)')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 names are already used');

    await user.click(screen.getByRole('button', { name: 'Create 2 flows' }));

    await waitFor(() => expect(onCreateFlow).toHaveBeenCalledTimes(2));
    expect(onCreateFlow.mock.calls.every((call) => call[11] === true)).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith('2 flows created (1 renamed to keep the names unique)');
  });

  it('fills the connector defaults when a connector is selected', async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillBasics(user, 'Sensor');

    expect(screen.getByLabelText(/^Output directory/)).toHaveValue('./out');
  });
});
