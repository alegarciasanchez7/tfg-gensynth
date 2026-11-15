import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { SessionFolderBar } from './SessionFolderBar';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('SessionFolderBar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('explains where the folder appears before the first START', () => {
    render(<SessionFolderBar path={null} onOpen={vi.fn()} />);

    expect(screen.getByText('Appears here when you press START')).toBeInTheDocument();
    expect(screen.queryByLabelText('Copy session folder')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Open session folder')).not.toBeInTheDocument();
  });

  it('shows the path and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<SessionFolderBar path="/home/ana/GenSynth/OUTPUT_FILES_1" />);

    expect(screen.getByTitle('/home/ana/GenSynth/OUTPUT_FILES_1')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Copy session folder'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Folder path copied'));
    expect(writeText).toHaveBeenCalledWith('/home/ana/GenSynth/OUTPUT_FILES_1');
  });

  it('reports a copy that the browser refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    render(<SessionFolderBar path="/home/ana/GenSynth/OUTPUT_FILES_2" />);

    fireEvent.click(screen.getByLabelText('Copy session folder'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('opens the folder', () => {
    const onOpen = vi.fn();
    render(<SessionFolderBar path="/home/ana/GenSynth/OUTPUT_FILES_2" onOpen={onOpen} />);

    fireEvent.click(screen.getByLabelText('Open session folder'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
