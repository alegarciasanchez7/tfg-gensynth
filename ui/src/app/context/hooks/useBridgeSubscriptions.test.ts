import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppAction, AppState } from '../reducer';

const { connect, getInitialState, subscribeMetrics, handlers } = vi.hoisted(() => ({
  connect: vi.fn(),
  getInitialState: vi.fn(),
  subscribeMetrics: vi.fn(),
  handlers: new Map<string, (payload: unknown) => void>(),
}));

vi.mock('../../core/bridge', () => ({
  default: {
    connect: () => connect(),
    getMode: () => 'websocket',
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
      return () => undefined;
    },
  },
  CoreCommands: {
    getInitialState: () => getInitialState(),
    subscribeMetrics: () => subscribeMetrics(),
  },
}));

const { useBridgeSubscriptions } = await import('./useBridgeSubscriptions');

function renderSubscriptions(dispatch: (action: AppAction) => void) {
  const state = { connectorHealthSummary: [] } as unknown as AppState;
  return renderHook(() =>
    useBridgeSubscriptions({
      state,
      stateRef: { current: state },
      dispatch,
      optimisticManager: null,
    }),
  );
}

describe('useBridgeSubscriptions', () => {
  beforeEach(() => {
    connect.mockReset();
    getInitialState.mockReset().mockResolvedValue(undefined);
    subscribeMetrics.mockReset().mockResolvedValue(undefined);
  });

  it('connects to the Core and requests the initial state', async () => {
    connect.mockResolvedValue(undefined);
    const dispatch = vi.fn();

    renderSubscriptions(dispatch);

    await waitFor(() => expect(subscribeMetrics).toHaveBeenCalled());
    expect(getInitialState).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONNECTED', payload: { connected: true, mode: 'websocket' } });
  });

  it('marks the UI as disconnected when the Core cannot be reached', async () => {
    connect.mockRejectedValue(new Error('refused'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatch = vi.fn();

    renderSubscriptions(dispatch);

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONNECTED', payload: { connected: false, mode: 'websocket' } }),
    );
    expect(getInitialState).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('keeps the session folder that the Core reports with the system status', async () => {
    connect.mockResolvedValue(undefined);
    const dispatch = vi.fn();
    renderSubscriptions(dispatch);
    await waitFor(() => expect(handlers.has('system-status')).toBe(true));
    const systemStatus = handlers.get('system-status')!;

    systemStatus({ status: 'running', uptime: 0, totalMessages: 0, messagesPerSecond: 0, sessionOutputDir: '/out/OUTPUT_FILES_1' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SYSTEM_STATUS', payload: 'running' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SESSION_OUTPUT_DIR', payload: '/out/OUTPUT_FILES_1' });

    // An older Core does not send the field: the folder shown is kept
    dispatch.mockClear();
    systemStatus({ status: 'stopped', uptime: 0, totalMessages: 0, messagesPerSecond: 0 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SYSTEM_STATUS', payload: 'stopped' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_SESSION_OUTPUT_DIR' }));
  });
});
