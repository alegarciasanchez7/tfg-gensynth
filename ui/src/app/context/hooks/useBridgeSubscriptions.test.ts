import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppAction, AppState } from '../reducer';
import type { Variable } from '../../types';
import { OptimisticManager, type OptimisticOperation } from '../optimisticManager';

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

function renderSubscriptions(
  dispatch: (action: AppAction) => void,
  variables: Variable[] = [],
  optimisticManager: OptimisticManager | null = null,
) {
  const state = { connectorHealthSummary: [], groups: [], variables } as unknown as AppState;
  return renderHook(() =>
    useBridgeSubscriptions({
      state,
      stateRef: { current: state },
      dispatch,
      optimisticManager,
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

  describe('a single changed variable (VARIABLE_CHANGED)', () => {
    const speed = { id: 'v1', name: 'speed', type: 'numeric', scope: 'GLOBAL', config: { min: 0, max: 10 } };
    const label = { id: 'v2', name: 'label', type: 'string', scope: 'GLOBAL', config: {} };

    async function subscribe(local: Variable[] = []) {
      connect.mockResolvedValue(undefined);
      const dispatch = vi.fn();
      renderSubscriptions(dispatch, local);
      await waitFor(() => expect(handlers.has('variable-changed')).toBe(true));
      return dispatch;
    }

    function lastVariables(dispatch: ReturnType<typeof vi.fn>): Variable[] {
      const calls = dispatch.mock.calls.filter(([action]) => action.type === 'SET_VARIABLES');
      return calls[calls.length - 1][0].payload;
    }

    it('patches the last list the Core sent with the changed variable, normalized', async () => {
      const dispatch = await subscribe();
      handlers.get('variables-update')!([speed, label]);

      handlers.get('variable-changed')!({ ...speed, name: 'speed_kmh', config: { min: 0, max: 120 } });

      const variables = lastVariables(dispatch);
      expect(variables.map(v => v.name)).toEqual(['speed_kmh', 'label']);
      expect(variables[0]).toMatchObject({ scope: 'global', config: { max: 120 } });
    });

    it('keeps the earlier changes when several variables change one after the other', async () => {
      const dispatch = await subscribe();
      handlers.get('variables-update')!([speed, label]);

      handlers.get('variable-changed')!({ ...speed, name: 'speed_kmh' });
      handlers.get('variable-changed')!({ ...label, name: 'label_2' });

      expect(lastVariables(dispatch).map(v => v.name)).toEqual(['speed_kmh', 'label_2']);
    });

    it('settles the pending operations as the initial state does', async () => {
      const manager = new OptimisticManager();
      const operation = (commandId: string, kind: OptimisticOperation['kind'], entityId: string, ageMs: number): OptimisticOperation =>
        ({ commandId, kind, entityType: 'variable', entityId, createdAt: Date.now() - ageMs, ttlMs: 5000, applied: true });
      // Confirmed: the Core has the variable. Lost: created long ago and never reached the Core
      manager.register(operation('c-confirmed', 'update', 'v1', 0));
      manager.register(operation('c-lost', 'create', 'v-lost', 60_000));
      connect.mockResolvedValue(undefined);
      renderSubscriptions(vi.fn(), [], manager);
      await waitFor(() => expect(handlers.has('variable-changed')).toBe(true));

      handlers.get('variable-changed')!({ ...speed, name: 'speed_kmh' });

      expect(manager.get('c-confirmed')).toBeUndefined();
      expect(manager.get('c-lost')?.failureReason).toBe('Create timed out');
      // A failed operation is not evaluated again on the next update
      expect(manager.getPendingOperations()).toEqual([]);
    });

    it('starts from the local variables when the Core has not sent a list yet', async () => {
      const local: Variable[] = [
        { id: 'v1', name: 'speed', type: 'numeric', scope: 'global', config: {} },
        { id: 'v2', name: 'label', type: 'string', scope: 'global', config: {} },
      ];
      const dispatch = await subscribe(local);

      handlers.get('variable-changed')!({ ...speed, name: 'speed_kmh' });

      expect(lastVariables(dispatch).map(v => v.name)).toEqual(['speed_kmh', 'label']);
    });
  });
});
