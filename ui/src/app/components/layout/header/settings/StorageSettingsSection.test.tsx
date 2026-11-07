import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseApp, mockSupportsFileSystemAccess, mockPickDirectory } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockSupportsFileSystemAccess: vi.fn(),
  mockPickDirectory: vi.fn(),
}));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('../../../../core/fileStorage', () => ({
  supportsFileSystemAccess: () => mockSupportsFileSystemAccess(),
}));

vi.mock('../../../../core/bridge', () => ({
  CoreCommands: { pickDirectory: () => mockPickDirectory() },
}));

import { StorageSettingsSection } from './StorageSettingsSection';

const actions = {
  setAutoSave: vi.fn(),
  setAutoSaveInterval: vi.fn(),
  setOutputFolder: vi.fn().mockResolvedValue(undefined),
};

const defaultFolder = { path: '/home/ana/GenSynth', defaultPath: '/home/ana/GenSynth', custom: false };

function renderWith(state: Record<string, unknown>) {
  mockUseApp.mockReturnValue({
    state: {
      autoSaveEnabled: false,
      autoSaveIntervalSeconds: 30,
      connectionMode: 'websocket',
      currentFilePath: null,
      currentFileHandle: null,
      outputFolder: defaultFolder,
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
    actions.setOutputFolder.mockClear();
    mockPickDirectory.mockReset();
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

  it('shows the output folder in use and changes it when the path is committed', () => {
    renderWith({});

    const input = screen.getByLabelText('Output folder');
    expect(input).toHaveValue('/home/ana/GenSynth');
    expect(screen.queryByRole('button', { name: /Default/ })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '  /home/ana/results ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(actions.setOutputFolder).toHaveBeenCalledWith('/home/ana/results');
  });

  it('does not send the folder again when it did not change', () => {
    renderWith({});

    fireEvent.blur(screen.getByLabelText('Output folder'));
    expect(actions.setOutputFolder).not.toHaveBeenCalled();
  });

  it('goes back to the default folder', () => {
    renderWith({ outputFolder: { path: '/home/ana/results', defaultPath: '/home/ana/GenSynth', custom: true } });

    fireEvent.click(screen.getByRole('button', { name: /Default/ }));
    expect(actions.setOutputFolder).toHaveBeenCalledWith(null);
  });

  it('picks the folder with Browse in the desktop app only', async () => {
    renderWith({});
    expect(screen.queryByRole('button', { name: /Browse/ })).not.toBeInTheDocument();

    cleanup();
    mockPickDirectory.mockResolvedValue({ status: 'success', path: '/home/ana/picked' });
    renderWith({ connectionMode: 'jcef' });
    fireEvent.click(screen.getByRole('button', { name: /Browse/ }));

    await waitFor(() => expect(actions.setOutputFolder).toHaveBeenCalledWith('/home/ana/picked'));
  });
});
