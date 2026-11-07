import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateAvailableDialog } from './UpdateAvailableDialog';

const update = { currentVersion: '0.5.2', latestVersion: '0.5.3', releaseUrl: 'https://github.com/x/releases/tag/v0.5.3', assetSize: 150 * 1024 * 1024 };

function renderDialog() {
  const handlers = { onUpdateNow: vi.fn(), onNotNow: vi.fn(), onSkipVersion: vi.fn(), onOpenReleaseNotes: vi.fn() };
  render(<UpdateAvailableDialog update={update} isOpen {...handlers} />);
  return handlers;
}

describe('UpdateAvailableDialog', () => {
  afterEach(() => cleanup());

  it('shows both versions and the download size', () => {
    renderDialog();
    expect(screen.getByText('GenSynth 0.5.3 is available')).toBeInTheDocument();
    expect(screen.getByText(/You are using version 0\.5\.2/)).toBeInTheDocument();
    expect(screen.getByText('Download: 150.0 MB')).toBeInTheDocument();
  });

  it('lets the user update, keep the installed version or skip this version', () => {
    const handlers = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(handlers.onUpdateNow).toHaveBeenCalledWith('0.5.3');

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(handlers.onNotNow).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Skip this version' }));
    expect(handlers.onSkipVersion).toHaveBeenCalledWith('0.5.3');
  });

  it('closing it with Esc means Not now', () => {
    const handlers = renderDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(handlers.onNotNow).toHaveBeenCalled();
    expect(handlers.onUpdateNow).not.toHaveBeenCalled();
  });

  it('opens the release notes', () => {
    const handlers = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /What's new/ }));
    expect(handlers.onOpenReleaseNotes).toHaveBeenCalledWith(update.releaseUrl);
  });

  it('renders nothing without an update', () => {
    render(<UpdateAvailableDialog update={null} isOpen onUpdateNow={vi.fn()} onNotNow={vi.fn()} onSkipVersion={vi.fn()} onOpenReleaseNotes={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
