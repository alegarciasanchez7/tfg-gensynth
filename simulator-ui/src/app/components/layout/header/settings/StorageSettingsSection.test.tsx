import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseApp, mockSupportsFileSystemAccess } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockSupportsFileSystemAccess: vi.fn(),
}));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../../../../core/fileStorage', () => ({
  supportsFileSystemAccess: () => mockSupportsFileSystemAccess(),
}));

import { StorageSettingsSection } from './StorageSettingsSection';

const actions = { setAutoSave: vi.fn(), setAutoSaveInterval: vi.fn() };

function renderWith(state: Record<string, unknown>) {
  mockUseApp.mockReturnValue({
    state: {
      autoSaveEnabled: false,
      autoSaveIntervalSeconds: 30,
      connectionMode: 'websocket',
      currentFilePath: null,
      currentFileHandle: null,
      ...state,
    },
    actions,
  });
  return render(<StorageSettingsSection />);
}

describe('StorageSettingsSection', () => {
  beforeEach(() => {
    actions.setAutoSave.mockClear();
    actions.setAutoSaveInterval.mockClear();
    mockSupportsFileSystemAccess.mockReturnValue(true);
  });

  afterEach(() => cleanup());

  it('toggles auto-save and hides the interval while it is off', () => {
    renderWith({});

    expect(screen.queryByLabelText('Auto-save interval in seconds')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-save' }));
    expect(actions.setAutoSave).toHaveBeenCalledWith(true);
  });

  it('clamps the interval when it is committed', () => {
    renderWith({ autoSaveEnabled: true, currentFileHandle: {} });

    const input = screen.getByLabelText('Auto-save interval in seconds');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.blur(input);

    expect(actions.setAutoSaveInterval).toHaveBeenCalledWith(5);
    expect(input).toHaveValue(5);
  });

  it('restores the stored interval when the draft is empty', () => {
    renderWith({ autoSaveEnabled: true, currentFileHandle: {} });

    const input = screen.getByLabelText('Auto-save interval in seconds');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(actions.setAutoSaveInterval).not.toHaveBeenCalled();
    expect(input).toHaveValue(30);
  });

  it('explains why auto-save cannot run yet', () => {
    renderWith({ autoSaveEnabled: true });
    expect(screen.getByText('Save the configuration to a file to start auto-saving.')).toBeInTheDocument();

    cleanup();
    mockSupportsFileSystemAccess.mockReturnValue(false);
    renderWith({ autoSaveEnabled: true });
    expect(screen.getByText('Not supported by this browser. Use Save manually.')).toBeInTheDocument();
  });
});
