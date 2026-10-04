import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flow } from '../../../../types';
import type { ConnectorPluginDescriptor } from '../../../../core/types';

const { mockToast } = vi.hoisted(() => ({ mockToast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast: mockToast }));

import { CreateFlowDialog } from './CreateFlowDialog';

const fileConnector: ConnectorPluginDescriptor = {
  pluginId: 'file',
  displayName: 'File Output',
  pluginVersion: '1.0.0',
  coreApiVersion: '1.0.0',
  external: false,
  configSchema: { type: 'object', properties: { outputDir: { type: 'string', default: './out' } } },
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

  const renderDialog = (repeat = false) =>
    render(
      <CreateFlowDialog
        open
        onOpenChange={onOpenChange}
        groupId="g1"
        latestConnectors={[fileConnector]}
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
});
