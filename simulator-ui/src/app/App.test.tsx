import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reportUiErrorToCore, mockUseApp } = vi.hoisted(() => ({
  reportUiErrorToCore: vi.fn(),
  mockUseApp: vi.fn(),
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
vi.mock('./components/dialogs/CloseConfigurationDialog', () => ({ CloseConfigurationDialog: () => null }));
vi.mock('./components/common/ConfirmDeleteDialog', () => ({ ConfirmDeleteDialog: () => null }));
vi.mock('sonner', () => ({ Toaster: () => null, toast: { info: vi.fn() } }));

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

  it('stops listening once unmounted', () => {
    const { unmount } = render(<App />);
    unmount();

    window.dispatchEvent(new ErrorEvent('error', { message: 'late' }));

    expect(reportUiErrorToCore).not.toHaveBeenCalled();
  });
});
