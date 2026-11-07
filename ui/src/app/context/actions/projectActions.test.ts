import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppAction } from '../reducer';

const loadState = vi.fn();
const getInitialState = vi.fn();

vi.mock('../../core/bridge', () => ({
  CoreCommands: {
    loadState: (filePath?: string) => loadState(filePath),
    getInitialState: () => getInitialState(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { loadProjectState } = await import('./projectActions');

function context(dispatched: AppAction[]) {
  return {
    dispatch: (action: AppAction) => dispatched.push(action),
    connectionMode: 'jcef',
    isConnected: true,
    connectorCatalog: [],
    selection: { type: 'none' as const },
  };
}

describe('loadProjectState in desktop mode', () => {
  beforeEach(() => {
    loadState.mockReset();
    getInitialState.mockReset().mockResolvedValue(undefined);
  });

  it('loads a given file without the dialog and remembers it as the open file', async () => {
    loadState.mockResolvedValue({ status: 'ok', filePath: '/p/plant.gsynth' });
    const dispatched: AppAction[] = [];

    const loaded = await loadProjectState(context(dispatched), undefined, '/p/plant.gsynth');

    expect(loaded).toBe(true);
    expect(loadState).toHaveBeenCalledWith('/p/plant.gsynth');
    // Save writes back to the same file
    expect(dispatched).toContainEqual({
      type: 'SET_FILE_INFO',
      payload: { fileName: 'plant.gsynth', filePath: '/p/plant.gsynth', fileHandle: null },
    });
  });

  it('opens the dialog when no file is given', async () => {
    loadState.mockResolvedValue({ status: 'cancelled' });

    const loaded = await loadProjectState(context([]));

    expect(loaded).toBe(false);
    expect(loadState).toHaveBeenCalledWith(undefined);
  });
});
