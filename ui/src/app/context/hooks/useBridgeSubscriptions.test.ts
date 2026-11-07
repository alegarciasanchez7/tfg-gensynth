import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppAction, AppState } from '../reducer';

const { connect, getInitialState, subscribeMetrics } = vi.hoisted(() => ({
  connect: vi.fn(),
  getInitialState: vi.fn(),
  subscribeMetrics: vi.fn(),
}));

vi.mock('../../core/bridge', () => ({
  default: {
    connect: () => connect(),
    getMode: () => 'websocket',
    on: () => () => undefined,
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
});
