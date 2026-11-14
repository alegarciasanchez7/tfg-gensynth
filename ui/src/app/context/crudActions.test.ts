import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CRUDActionContext } from './crudActions';

const send = vi.fn();
vi.mock('../core/bridge', () => ({ default: { send: (...args: unknown[]) => send(...args) } }));

const { createFlow, createVariable } = await import('./crudActions');
const { createOptimisticFlow } = await import('./createOptimisticHelper');

const context = (connectionMode: CRUDActionContext['connectionMode']): CRUDActionContext => ({
  dispatch: vi.fn(),
  reportError: vi.fn(),
  connectionMode,
  optimisticManager: null,
});

describe('createFlow', () => {
  beforeEach(() => send.mockReset());

  it('sends the CREATE_FLOW payload with the legacy defaults', async () => {
    send.mockResolvedValue({ id: 'f1', name: 'Sensor' });
    const onResponse = vi.fn();

    const flow = await createFlow(context('websocket'), ' g1 ', {
      name: ' Sensor ',
      technology: ' file ',
      host: '',
      port: 0,
      template: '{}',
      connectorConfig: { outputDir: './out' },
      everyTicks: 4,
      autoRename: true,
    }, onResponse);

    expect(flow).toEqual({ id: 'f1', name: 'Sensor' });
    expect(send).toHaveBeenCalledWith('CREATE_FLOW', {
      groupId: 'g1',
      name: 'Sensor',
      technology: 'file',
      host: '',
      port: 0,
      topic: '',
      interval: 1000,
      burst: 1,
      everyTicks: 4,
      template: '{}',
      connectorConfig: { outputDir: './out' },
      autoRename: true,
    }, onResponse);
  });

  it('leaves out connectorConfig and autoRename when not given', async () => {
    send.mockResolvedValue({ id: 'f1' });
    await createFlow(context('websocket'), 'g1', { name: 'A', technology: 'file', host: 'h', port: 1, topic: ' t ', interval: 5, burst: 2 });
    expect(send.mock.calls[0][1]).toEqual({
      groupId: 'g1', name: 'A', technology: 'file', host: 'h', port: 1, topic: 't',
      interval: 5, burst: 2, everyTicks: 1, template: '{}',
    });
  });

  it('builds a local flow in mock mode', async () => {
    const flow = await createFlow(context('mock'), 'g1', { name: 'A', technology: 'file', host: '', port: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(flow).toMatchObject({ name: 'A', technology: 'file', interval: 1000, burst: 1, everyTicks: 1, topic: '', enabled: true });
  });

  it('validates the required fields', async () => {
    await expect(createFlow(context('mock'), 'g1', { name: ' ', technology: 'file', host: '', port: 0 }))
      .rejects.toThrow('Validation failed: name is required');
  });
});

describe('createVariable', () => {
  beforeEach(() => send.mockReset());

  it('sends the CREATE_VARIABLE payload', async () => {
    send.mockResolvedValue({ id: 'v1' });
    await createVariable(context('websocket'), {
      name: ' speed ', type: 'numeric', scope: 'local', flowId: 'f1', groupId: 'g1', variableId: 'v1',
    });
    expect(send).toHaveBeenCalledWith('CREATE_VARIABLE', {
      name: 'speed', type: 'numeric', scope: 'local', config: {}, flowId: 'f1', groupId: 'g1', variableId: 'v1',
    }, undefined);
  });

  it('builds a local variable in mock mode', async () => {
    const variable = await createVariable(context('mock'), { name: 'speed', type: 'numeric', scope: 'global', variableId: 'v9' });
    expect(variable).toEqual({ id: 'v9', name: 'speed', type: 'numeric', scope: 'global', flowId: undefined, groupId: undefined, config: {} });
  });
});

describe('createOptimisticFlow', () => {
  it('fills the legacy defaults', () => {
    expect(createOptimisticFlow('tmp', { name: 'A', technology: 'file', host: '', port: 0 })).toMatchObject({
      id: 'tmp', name: 'A', topic: '', interval: 1000, burst: 1, everyTicks: 1, connectionStatus: 'disconnected',
    });
  });

  it('keeps the given values', () => {
    expect(createOptimisticFlow('tmp', { name: 'A', technology: 'file', host: 'h', port: 1, topic: 't', interval: 5, burst: 2, everyTicks: 3 }))
      .toMatchObject({ host: 'h', port: 1, topic: 't', interval: 5, burst: 2, everyTicks: 3 });
  });
});
