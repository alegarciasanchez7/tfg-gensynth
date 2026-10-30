import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatusPayload } from '../../core/types';
import { UpdateProgressDialog } from './UpdateProgressDialog';

const MB = 1024 * 1024;
const status = (overrides: Partial<UpdateStatusPayload>): UpdateStatusPayload => ({
  phase: 'downloading', version: '0.5.3', receivedBytes: 0, totalBytes: 0, ...overrides,
});

describe('UpdateProgressDialog', () => {
  afterEach(() => cleanup());

  it('shows the download progress and lets the user cancel it', () => {
    const onCancel = vi.fn();
    render(<UpdateProgressDialog status={status({ receivedBytes: 50 * MB, totalBytes: 200 * MB })} onCancel={onCancel} onClose={vi.fn()} />);

    expect(screen.getByText('Downloading the update')).toBeInTheDocument();
    expect(screen.getByText(/50\.0 MB of 200\.0 MB \(25%\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('cannot be cancelled once the installer starts', () => {
    render(<UpdateProgressDialog status={status({ phase: 'installing', message: 'GenSynth will close and open the installer.' })}
      onCancel={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('GenSynth will close and open the installer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('explains a failure and that the installed version keeps working', () => {
    const onClose = vi.fn();
    render(<UpdateProgressDialog status={status({ phase: 'failed', message: 'The download was incomplete.' })} onCancel={vi.fn()} onClose={onClose} />);

    expect(screen.getByText('The update failed')).toBeInTheDocument();
    expect(screen.getByText(/The download was incomplete\. You can keep using the installed version\./)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close', { selector: 'button' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('confirms a cancelled update installed nothing', () => {
    render(<UpdateProgressDialog status={status({ phase: 'cancelled' })} onCancel={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Nothing was installed/)).toBeInTheDocument();
  });

  it('renders nothing without an update in progress', () => {
    render(<UpdateProgressDialog status={null} onCancel={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
