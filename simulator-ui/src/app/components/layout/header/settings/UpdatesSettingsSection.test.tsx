import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseApp, mockOpenExternalUrl } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockOpenExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../context', () => ({ useApp: () => mockUseApp() }));
vi.mock('../../../../core/jcef', () => ({ openExternalUrl: (url: string) => mockOpenExternalUrl(url) }));

import { UpdatesSettingsSection } from './UpdatesSettingsSection';

const actions = {
  checkForUpdates: vi.fn(),
  installUpdate: vi.fn(),
  setCheckUpdatesAtStartup: vi.fn(),
};

function renderWith(state: Record<string, unknown>) {
  mockUseApp.mockReturnValue({
    state: { connectionMode: 'jcef', availableUpdate: null, checkUpdatesAtStartup: true, ...state },
    actions,
  });
  return render(<UpdatesSettingsSection />);
}

describe('UpdatesSettingsSection', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('checks now and says when the installed version is the latest', async () => {
    actions.checkForUpdates.mockResolvedValue({ supported: true, available: false });
    renderWith({});

    fireEvent.click(screen.getByRole('button', { name: /Check now/ }));

    expect(actions.checkForUpdates).toHaveBeenCalledWith({ silent: false });
    expect(await screen.findByText('You have the latest version.')).toBeInTheDocument();
  });

  it('shows why updates are not supported and the error of a failed check', async () => {
    actions.checkForUpdates.mockResolvedValueOnce({ supported: false, available: false, reason: 'Development build.' });
    renderWith({});
    fireEvent.click(screen.getByRole('button', { name: /Check now/ }));
    expect(await screen.findByText('Development build.')).toBeInTheDocument();

    actions.checkForUpdates.mockRejectedValueOnce(new Error('No connection'));
    fireEvent.click(screen.getByRole('button', { name: /Check now/ }));
    await waitFor(() => expect(screen.getByText(/No connection/)).toBeInTheDocument());
  });

  it('offers to update or read the notes when a version is available, without installing by itself', () => {
    renderWith({ availableUpdate: { currentVersion: '0.5.2', latestVersion: '0.5.3', releaseUrl: 'https://github.com/x', assetSize: 1 } });

    expect(screen.getByText('GenSynth 0.5.3 is available')).toBeInTheDocument();
    expect(actions.installUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Release notes/ }));
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://github.com/x');
    fireEvent.click(screen.getByRole('button', { name: /Update now/ }));
    expect(actions.installUpdate).toHaveBeenCalledWith('0.5.3');
  });

  it('turns the startup check off', () => {
    renderWith({});
    fireEvent.click(screen.getByRole('switch', { name: 'Check for updates at startup' }));
    expect(actions.setCheckUpdatesAtStartup).toHaveBeenCalledWith(false);
  });

  it('cannot check outside the desktop app', () => {
    renderWith({ connectionMode: 'websocket' });
    expect(screen.getByRole('button', { name: /Check now/ })).toBeDisabled();
    expect(screen.getByText(/Only in the installed desktop app/)).toBeInTheDocument();
  });
});
