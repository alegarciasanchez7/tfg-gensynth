import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reportUiErrorToCore, mockUseApp, listeners, dialog } = vi.hoisted(() => ({
  reportUiErrorToCore: vi.fn(),
  mockUseApp: vi.fn(),
  // Core events App listens to, and the last props of the close-configuration dialog
  listeners: {} as Record<string, (payload: unknown) => void>,
  dialog: { props: null as null | { isOpen: boolean; reason: string; onConfirm: (saveFirst: boolean) => Promise<void> } },
}));

// Only the global error wiring of App is under test: every panel is replaced by an empty stub
vi.mock('./core/uiErrorReporter', () => ({ reportUiErrorToCore }));
vi.mock('./context', () => ({ useApp: () => mockUseApp() }));
vi.mock('./components/layout/header/Header', () => ({ Header: () => null }));
vi.mock('./components/layout/resource-bar/ResourceBar', () => ({ ResourceBar: () => null }));
vi.mock('./components/layout/panels/left/LeftPanel', () => ({ LeftPanel: () => null }));
vi.mock('./components/workspace/Workspace', () => ({ Workspace: () => null }));
vi.mock('./components/layout/panels/right/RightPanel', () => ({ RightPanel: () => null }));
vi.mock('./components/layout/panels/bottom/BottomPanel', () => ({ BottomPanel: () => null }));
vi.mock('./components/layout/header/RestartOverlay', () => ({ RestartOverlay: () => null }));
vi.mock('./components/dialogs/CloseConfigurationDialog', () => ({
  CloseConfigurationDialog: (props: { isOpen: boolean; reason: string; onConfirm: (saveFirst: boolean) => Promise<void> }) => {
    dialog.props = props;
    return null;
  },
}));
vi.mock('./core/bridge', () => ({
  bridge: {
    on: (event: string, callback: (payload: unknown) => void) => {
      listeners[event] = callback;
      return () => delete listeners[event];
    },
  },
}));
vi.mock('./components/common/ConfirmDeleteDialog', () => ({ ConfirmDeleteDialog: () => null }));
vi.mock('sonner', () => ({ Toaster: () => null, toast: { info: vi.fn() } }));

import { act } from '@testing-library/react';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    reportUiErrorToCore.mockReset().mockResolvedValue(undefined);
    mockUseApp.mockReturnValue({
      state: {
        isDark: false,
        isDirty: false,
        selection: { type: 'none' },
        groups: [],
        variables: [],
        dirtyItems: undefined,
      },
      actions: {},
    });
  });

  afterEach(() => cleanup());

  it('reports uncaught UI errors to the Core', () => {
    render(<App />);

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'Panel.tsx', lineno: 7 }));

    expect(reportUiErrorToCore).toHaveBeenCalledWith('[UI CRASH] boom at Panel.tsx:7');
  });

  it('reports unhandled promise rejections to the Core', () => {
    render(<App />);

    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: 'Core unreachable' });
    window.dispatchEvent(event);

    expect(reportUiErrorToCore).toHaveBeenCalledWith('[UI UNHANDLED REJECTION] Core unreachable');
  });

  describe('projects sent from outside (edit in the command line, double click)', () => {
    const loadProjectState = vi.fn();

    const renderWith = (isDirty: boolean) => {
      loadProjectState.mockReset().mockResolvedValue(true);
      mockUseApp.mockReturnValue({
        state: { isDark: false, isDirty, selection: { type: 'none' }, groups: [], variables: [], dirtyItems: undefined },
        actions: { loadProjectState, newProjectState: vi.fn(), saveProjectState: vi.fn() },
      });
      return render(<App />);
    };

    it('loads the file at once when there are no unsaved changes', () => {
      renderWith(false);

      act(() => listeners['open-project-requested']({ filePath: '/p/plant.gsynth' }));

      expect(loadProjectState).toHaveBeenCalledWith(undefined, '/p/plant.gsynth');
      expect(dialog.props?.isOpen).toBe(false);
    });

    it('asks first when there are unsaved changes, then loads that file', async () => {
      renderWith(true);

      act(() => listeners['open-project-requested']({ filePath: '/p/plant.gsynth' }));

      expect(loadProjectState).not.toHaveBeenCalled();
      expect(dialog.props).toMatchObject({ isOpen: true, reason: 'load' });

      await act(() => dialog.props!.onConfirm(false));

      expect(loadProjectState).toHaveBeenCalledWith(undefined, '/p/plant.gsynth');
    });

    it('goes through New when no file is sent', () => {
      renderWith(false);

      act(() => listeners['open-project-requested']({}));

      expect(dialog.props).toMatchObject({ isOpen: true, reason: 'new' });
      expect(loadProjectState).not.toHaveBeenCalled();
    });
  });

  it('stops listening once unmounted', () => {
    const { unmount } = render(<App />);
    unmount();

    window.dispatchEvent(new ErrorEvent('error', { message: 'late' }));

    expect(reportUiErrorToCore).not.toHaveBeenCalled();
  });
});
