import { afterEach, describe, it, expect, vi } from 'vitest';
import { MessageHandler } from './MessageHandler';
import type { BridgeConfig } from './BridgeConfig';
import type { EventMap, PendingCommand } from './BridgeTypes';
import type { UICommand } from '../types';

type Emit = <K extends keyof EventMap>(event: K, data: EventMap[K]) => void;

describe('MessageHandler', () => {
  const handler = (emit: Emit) => new MessageHandler({
    config: {} as BridgeConfig,
    pendingCommands: new Map(),
    emit,
    sendRaw: vi.fn(),
  });

  it('emits the projects the Core asks the desktop window to open', () => {
    const emit = vi.fn<Emit>();

    handler(emit).handleMessage(JSON.stringify({
      type: 'OPEN_PROJECT_REQUESTED', timestamp: 1, payload: { filePath: '/p/plant.gsynth' },
    }));
    handler(emit).handleMessage(JSON.stringify({ type: 'OPEN_PROJECT_REQUESTED', timestamp: 2 }));

    expect(emit).toHaveBeenCalledWith('open-project-requested', { filePath: '/p/plant.gsynth' });
    // Without a payload: a new project
    expect(emit).toHaveBeenCalledWith('open-project-requested', {});
  });
});

describe('MessageHandler pending commands', () => {
  const setup = (config: Partial<BridgeConfig> = {}, type: UICommand['type'] = 'START_GROUP') => {
    const pendingCommands = new Map<string, PendingCommand>();
    const emit = vi.fn<Emit>();
    const sendRaw = vi.fn();
    const pending: PendingCommand = {
      resolve: vi.fn(),
      reject: vi.fn(),
      timerId: 0,
      command: { type, id: 'c1', commandId: 'c1', protocolVersion: '1' },
      attempts: 0,
      onResponse: vi.fn(),
    };
    pendingCommands.set('c1', pending);
    const handler = new MessageHandler({ config: config as BridgeConfig, pendingCommands, emit, sendRaw });
    const send = (message: Record<string, unknown>) => handler.handleMessage(JSON.stringify({ timestamp: 1, ...message }));
    return { pendingCommands, emit, sendRaw, pending, send };
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves the command its answer refers to, after calling onResponse', () => {
    const { pendingCommands, pending, send } = setup();

    send({ type: 'GROUPS_UPDATE', payload: { commandId: 'c1', ok: true } });

    expect(pending.onResponse).toHaveBeenCalledWith({ commandId: 'c1', ok: true });
    expect(pending.resolve).toHaveBeenCalledWith({ commandId: 'c1', ok: true });
    expect(pendingCommands.has('c1')).toBe(false);
  });

  it('still resolves when onResponse throws, logging the error', () => {
    const { pending, send } = setup();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(pending.onResponse!).mockImplementation(() => { throw new Error('boom'); });

    send({ type: 'SYSTEM_STATUS', commandId: 'c1', payload: { status: 'running' } });

    expect(log).toHaveBeenCalledWith('[Bridge] Error in onResponse callback:', expect.any(Error));
    expect(pending.resolve).toHaveBeenCalled();
  });

  it('never settles a command with a trace event or an unknown id', () => {
    const { pendingCommands, pending, send } = setup();

    send({ type: 'TRACE_EVENT', payload: { commandId: 'c1' } });
    send({ type: 'SYSTEM_STATUS', payload: { commandId: 'other' } });

    expect(pending.resolve).not.toHaveBeenCalled();
    expect(pendingCommands.has('c1')).toBe(true);
  });

  it('rejects the command on an error answer that is not recoverable', () => {
    const { pendingCommands, pending, send } = setup({ maxCommandRetries: 3 });

    send({ type: 'ERROR', payload: { status: 'error', commandId: 'c1', message: 'Nope', code: 'X', recoverable: false } });

    expect(pending.onResponse).not.toHaveBeenCalled();
    expect(pending.reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'Nope', code: 'X', commandId: 'c1' }));
    expect(pendingCommands.has('c1')).toBe(false);
  });

  it('treats a payload with status error as an error answer', () => {
    const { pending, send } = setup();

    send({ type: 'GROUPS_UPDATE', commandId: 'c1', payload: { status: 'error' } });

    expect(pending.reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'Error no especificado por el Core' }));
  });

  it('sends a recoverable error again after the backoff, while retries are left', () => {
    vi.useFakeTimers();
    const { pendingCommands, pending, emit, sendRaw, send } = setup({ maxCommandRetries: 1, retryBackoffMs: 100 });
    const error = { status: 'error', commandId: 'c1', message: 'Busy', code: 'BUSY', recoverable: true };

    send({ type: 'ERROR', payload: error });

    expect(pending.attempts).toBe(1);
    expect(emit).toHaveBeenCalledWith('error', expect.objectContaining({ commandId: 'c1', code: 'BUSY', recoverable: true }));
    expect(pending.reject).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(sendRaw).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(sendRaw).toHaveBeenCalledWith(JSON.stringify(pending.command));

    // No retries left: the second error rejects
    send({ type: 'ERROR', payload: error });
    expect(pending.reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'Busy' }));
    expect(pendingCommands.has('c1')).toBe(false);
  });

  it('never sends a user dialog command again', () => {
    const { pending, sendRaw, send } = setup({ maxCommandRetries: 3 }, 'SAVE_STATE');

    send({ type: 'ERROR', payload: { status: 'error', commandId: 'c1', message: 'Busy', recoverable: true } });

    expect(sendRaw).not.toHaveBeenCalled();
    expect(pending.reject).toHaveBeenCalled();
  });

  it('caps the backoff delay of a timeout retry', () => {
    vi.useFakeTimers();
    const { pending, sendRaw, emit, pendingCommands } = setup({ maxCommandRetries: 5, retryBackoffMs: 1000, maxRetryBackoffMs: 1500 });
    const handler = new MessageHandler({
      config: { maxCommandRetries: 5, retryBackoffMs: 1000, maxRetryBackoffMs: 1500 } as BridgeConfig,
      pendingCommands, emit, sendRaw,
    });
    pending.attempts = 2;

    handler.handleRetryTimeout('c1', pending, 'START_GROUP', pending.reject);

    expect(emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'BRIDGE_TIMEOUT' }));
    expect(vi.mocked(emit).mock.calls[0][1]).toMatchObject({ error: { message: 'Timeout en START_GROUP; reintentando en 1500 ms' } });
    vi.advanceTimersByTime(1500);
    expect(sendRaw).toHaveBeenCalledTimes(1);
  });
});

describe('MessageHandler typed events', () => {
  it('emits the event of every Core message type with its payload', () => {
    const emit = vi.fn<Emit>();
    const handler = new MessageHandler({ config: {} as BridgeConfig, pendingCommands: new Map(), emit, sendRaw: vi.fn() });
    const payload = { value: 1 };
    const events: Array<[string, string]> = [
      ['SYSTEM_STATUS', 'system-status'],
      ['METRICS_UPDATE', 'metrics'],
      ['LOG_ENTRY', 'log'],
      ['GROUPS_UPDATE', 'groups-update'],
      ['VARIABLE_UPDATE', 'variables-update'],
      ['VARIABLE_CHANGED', 'variable-changed'],
      ['INITIAL_STATE', 'initial-state'],
      ['TRACE_EVENT', 'trace'],
      ['PLUGIN_VALIDATION_RESULT', 'plugin-validation-result'],
      ['PLUGIN_INSTALL_RESULT', 'plugin-install-result'],
      ['RESTART_REQUIRED', 'restart-required'],
      ['ROLLBACK_REPORT', 'rollback-report'],
      ['SETTINGS_UPDATE', 'settings-update'],
      ['UPDATE_STATUS', 'update-status'],
    ];
    for (const [type, event] of events) {
      handler.handleMessage(JSON.stringify({ type, timestamp: 1, payload }));
      expect(emit).toHaveBeenCalledWith(event, payload);
    }

    handler.handleMessage(JSON.stringify({ type: 'FLOWS_METRICS', timestamp: 1, payload: { flows: [{ flowId: 'f1' }] } }));
    handler.handleMessage(JSON.stringify({ type: 'FLOWS_METRICS', timestamp: 1 }));
    expect(emit).toHaveBeenCalledWith('flows-metrics', [{ flowId: 'f1' }]);
    expect(emit).toHaveBeenCalledWith('flows-metrics', []);

    handler.handleMessage(JSON.stringify({
      type: 'ERROR', timestamp: 1, payload: { status: 'error', message: 'Bad', code: 'E1', commandId: 'x', recoverable: false, details: { a: 1 } },
    }));
    expect(emit).toHaveBeenCalledWith('error', expect.objectContaining({
      commandId: 'x', code: 'E1', details: { a: 1 }, recoverable: false, error: expect.objectContaining({ message: 'Bad' }),
    }));
  });

  it('logs a message that is not JSON', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    new MessageHandler({ config: {} as BridgeConfig, pendingCommands: new Map(), emit: vi.fn(), sendRaw: vi.fn() })
      .handleMessage('not json');
    expect(log).toHaveBeenCalledWith('[Bridge] Error parsing message:', expect.any(SyntaxError), 'not json');
    log.mockRestore();
  });

  it('rejects with a final timeout error when no retries are left', () => {
    const pendingCommands = new Map<string, PendingCommand>();
    const reject = vi.fn();
    const pending = { resolve: vi.fn(), reject, timerId: 0, attempts: 0,
      command: { type: 'START_GROUP', id: 'c9', commandId: 'c9', protocolVersion: '1' } } as PendingCommand;
    pendingCommands.set('c9', pending);
    const handler = new MessageHandler({ config: {} as BridgeConfig, pendingCommands, emit: vi.fn(), sendRaw: vi.fn() });

    handler.handleRetryTimeout('c9', pending, 'START_GROUP', reject);
    handler.handleRetryTimeout('c9', pending, 'START_GROUP', reject);

    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'Comando START_GROUP timeout', code: 'BRIDGE_TIMEOUT' }));
    expect(pendingCommands.has('c9')).toBe(false);
  });
});
