import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Flow, Group, Variable } from '../../types';
import type { SavedStateSnapshot } from '../reducer';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';

const send = vi.fn();
const getInitialState = vi.fn();

vi.mock('../../core/bridge', () => ({
  default: { send: (...args: unknown[]) => send(...args) },
  CoreCommands: { getInitialState: () => getInitialState() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const { buildDiscardCommands, discardItemChanges } = await import('./discardActions');

const flow = (id: string, overrides: Partial<Flow> = {}): Flow => ({
  id,
  name: `Flow ${id}`,
  technology: 'rabbitmq',
  connectionStatus: 'disconnected',
  throughput: '0 msg/s',
  hasError: false,
  interval: 1000,
  burst: 1,
  everyTicks: 1,
  topic: 'demo',
  host: 'localhost',
  port: 5672,
  latency: 0,
  enabled: true,
  template: '{"v":1}',
  ...overrides,
});

const group = (id: string, flows: Flow[], overrides: Partial<Group> = {}): Group => ({
  id,
  name: `Group ${id}`,
  status: 'stopped',
  throughput: '0 msg/s',
  description: '',
  threads: 1,
  outputMode: 'parallel',
  expanded: true,
  enabled: true,
  flows,
  ...overrides,
});

const variable = (id: string, overrides: Partial<Variable> = {}): Variable => ({
  id,
  name: `var_${id}`,
  type: 'numeric',
  scope: 'global',
  config: { min: 0, max: 10 },
  ...overrides,
});

const saved: SavedStateSnapshot = {
  groups: [group('g1', [flow('f1'), flow('f2', { enabled: false })])],
  variables: [variable('v1')],
  settings: DEFAULT_PROJECT_SETTINGS,
};

describe('buildDiscardCommands', () => {
  it('restores the saved configuration of an edited flow', () => {
    const groups = [group('g1', [flow('f1', { port: 9999, template: 'edited' }), flow('f2', { enabled: false })])];

    const commands = buildDiscardCommands(saved, groups, saved.variables, 'flow', 'f1');

    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe('UPDATE_FLOW_CONFIG');
    expect(commands[0].payload).toMatchObject({ groupId: 'g1', flowId: 'f1', port: 5672, template: '{"v":1}' });
  });

  it('deletes a flow created after the last save', () => {
    const groups = [group('g1', [...saved.groups[0].flows, flow('f3')])];

    expect(buildDiscardCommands(saved, groups, saved.variables, 'flow', 'f3')).toEqual([
      { type: 'DELETE_FLOW', payload: { groupId: 'g1', flowId: 'f3' } },
    ]);
  });

  it('reverts a group: its properties, edited/new flows and restores deleted flows with their ids', () => {
    const groups = [group('g1', [flow('f1', { name: 'Renamed' }), flow('f3')], { threads: 8 })];

    const commands = buildDiscardCommands(saved, groups, saved.variables, 'group', 'g1');

    expect(commands.map((c) => c.type)).toEqual([
      'UPDATE_GROUP_CONFIG',
      'UPDATE_FLOW_CONFIG',
      'CREATE_FLOW',
      'UPDATE_FLOW_CONFIG',
      'DELETE_FLOW',
    ]);
    expect(commands[0].payload).toMatchObject({ groupId: 'g1', threads: 1 });
    expect(commands[1].payload).toMatchObject({ flowId: 'f1', name: 'Flow f1' });
    expect(commands[2].payload).toMatchObject({ groupId: 'g1', flowId: 'f2' });
    // CREATE_FLOW ignores `enabled`, so a disabled flow is disabled right after
    expect(commands[3].payload).toEqual({ groupId: 'g1', flowId: 'f2', enabled: false });
    expect(commands[4].payload).toEqual({ groupId: 'g1', flowId: 'f3' });
  });

  it('sends nothing for an unchanged group', () => {
    expect(buildDiscardCommands(saved, saved.groups, saved.variables, 'group', 'g1')).toEqual([]);
  });

  it('deletes a group created after the last save', () => {
    const groups = [...saved.groups, group('g2', [flow('f9')])];
    expect(buildDiscardCommands(saved, groups, saved.variables, 'group', 'g2')).toEqual([
      { type: 'DELETE_GROUP', payload: { groupId: 'g2' } },
    ]);
  });

  it('restores a variable, clearing references the saved version did not have', () => {
    const variables = [variable('v1', { scope: 'local', flowId: 'f1', config: { min: 5, max: 6 } })];

    expect(buildDiscardCommands(saved, saved.groups, variables, 'variable', 'v1')).toEqual([
      {
        type: 'UPDATE_VARIABLE',
        payload: {
          variableId: 'v1',
          name: 'var_v1',
          type: 'numeric',
          scope: 'global',
          flowId: null,
          groupId: null,
          config: { min: 0, max: 10 },
        },
      },
    ]);
  });

  it('deletes a variable created after the last save', () => {
    const variables = [...saved.variables, variable('v2')];
    expect(buildDiscardCommands(saved, saved.groups, variables, 'variable', 'v2')).toEqual([
      { type: 'DELETE_VARIABLE', payload: { variableId: 'v2' } },
    ]);
  });
});

describe('discardItemChanges', () => {
  beforeEach(() => {
    send.mockReset();
    getInitialState.mockReset();
  });

  const edited = [group('g1', [flow('f1', { port: 9999 }), flow('f2', { enabled: false })])];

  it('reverts the UI and sends the revert commands to the Core', async () => {
    send.mockResolvedValue({ status: 'ok' });
    const dispatch = vi.fn();

    await discardItemChanges(
      { dispatch, isConnected: true, savedState: saved, groups: edited, variables: saved.variables },
      'flow',
      'f1',
    );

    expect(dispatch).toHaveBeenCalledWith({ type: 'DISCARD_ITEM_CHANGES', payload: { type: 'flow', id: 'f1' } });
    expect(send).toHaveBeenCalledWith('UPDATE_FLOW_CONFIG', expect.objectContaining({ flowId: 'f1', port: 5672 }));
  });

  it('only reverts the UI when not connected to the Core', async () => {
    const dispatch = vi.fn();

    await discardItemChanges(
      { dispatch, isConnected: false, savedState: saved, groups: edited, variables: saved.variables },
      'flow',
      'f1',
    );

    expect(dispatch).toHaveBeenCalledWith({ type: 'DISCARD_ITEM_CHANGES', payload: { type: 'flow', id: 'f1' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('resyncs with the Core when a revert command fails', async () => {
    send.mockRejectedValue(new Error('NOT_FOUND'));
    getInitialState.mockResolvedValue(undefined);
    const dispatch = vi.fn();

    await discardItemChanges(
      { dispatch, isConnected: true, savedState: saved, groups: edited, variables: saved.variables },
      'flow',
      'f1',
    );

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_LOG' }));
    expect(getInitialState).toHaveBeenCalledTimes(1);
  });
});
