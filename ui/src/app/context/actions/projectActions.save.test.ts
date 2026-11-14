import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import type { AppAction, ProjectFileInfo } from '../reducer';
import { DEFAULT_PROJECT_SETTINGS } from '../../core/tickSettings';

const exportState = vi.fn();
const writeProjectSnapshot = vi.fn();
const hasWritePermission = vi.fn();

vi.mock('../../core/bridge', () => ({
  CoreCommands: { exportState: (filePath: string) => exportState(filePath) },
}));
vi.mock('../../core/fileStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/fileStorage')>()),
  writeProjectSnapshot: (...args: unknown[]) => writeProjectSnapshot(...args),
  hasWritePermission: (...args: unknown[]) => hasWritePermission(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { saveProjectState } = await import('./projectActions');

const handle = { name: 'plant.gsynth' } as unknown as FileSystemFileHandle;

function context(connectionMode: string, file: ProjectFileInfo, dispatched: AppAction[]) {
  return {
    dispatch: (action: AppAction) => dispatched.push(action),
    connectionMode,
    groups: [],
    variables: [],
    settings: DEFAULT_PROJECT_SETTINGS,
    file,
  };
}

const logMessages = (dispatched: AppAction[]) =>
  dispatched.flatMap((a) => (a.type === 'ADD_LOG' ? [a.payload.message] : []));

describe('saveProjectState to the open file', () => {
  beforeEach(() => {
    exportState.mockReset().mockResolvedValue({ status: 'ok' });
    writeProjectSnapshot.mockReset().mockResolvedValue(undefined);
    hasWritePermission.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('exports through the Core on desktop', async () => {
    const dispatched: AppAction[] = [];
    const file = { fileName: 'plant.gsynth', filePath: '/p/plant.gsynth', fileHandle: null };

    const saved = await saveProjectState(context('jcef', file, dispatched));

    expect(saved).toBe(true);
    expect(exportState).toHaveBeenCalledWith('/p/plant.gsynth');
    expect(dispatched.some((a) => a.type === 'MARK_SAVED')).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Project saved: plant.gsynth');
  });

  it('writes to the file handle in a browser', async () => {
    const dispatched: AppAction[] = [];
    const file = { fileName: 'plant.gsynth', filePath: null, fileHandle: handle };

    const saved = await saveProjectState(context('websocket', file, dispatched));

    expect(saved).toBe(true);
    expect(writeProjectSnapshot).toHaveBeenCalledWith(handle, expect.objectContaining({ groups: [], variables: [] }));
    expect(hasWritePermission).not.toHaveBeenCalled();
  });

  it('skips an auto-save without write permission, silently', async () => {
    hasWritePermission.mockResolvedValue(false);
    const dispatched: AppAction[] = [];
    const file = { fileName: 'plant.gsynth', filePath: null, fileHandle: handle };

    const saved = await saveProjectState(context('websocket', file, dispatched), true);

    expect(saved).toBe(false);
    expect(writeProjectSnapshot).not.toHaveBeenCalled();
    expect(dispatched).toEqual([]);
  });

  it('auto-saves with write permission and only logs it', async () => {
    hasWritePermission.mockResolvedValue(true);
    const dispatched: AppAction[] = [];
    const file = { fileName: 'plant.gsynth', filePath: null, fileHandle: handle };

    const saved = await saveProjectState(context('websocket', file, dispatched), true);

    expect(saved).toBe(true);
    expect(logMessages(dispatched)).toEqual(['Auto-saved to plant.gsynth']);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('skips an auto-save without an open file', async () => {
    const saved = await saveProjectState(context('jcef', { fileName: null, filePath: null, fileHandle: null }, []), true);

    expect(saved).toBe(false);
    expect(exportState).not.toHaveBeenCalled();
  });

  it('reports a failed write', async () => {
    exportState.mockRejectedValue(new Error('disk full'));
    const dispatched: AppAction[] = [];
    const file = { fileName: 'plant.gsynth', filePath: '/p/plant.gsynth', fileHandle: null };

    const saved = await saveProjectState(context('jcef', file, dispatched));

    expect(saved).toBe(false);
    expect(logMessages(dispatched)).toEqual(['Error saving project: disk full']);
    expect(toast.error).toHaveBeenCalledWith('disk full');
  });
});
