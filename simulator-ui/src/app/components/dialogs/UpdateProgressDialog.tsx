import { AlertTriangle, Download } from 'lucide-react';
import type { UpdateStatusPayload } from '../../core/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Progress } from '../ui/progress';
import { formatMegabytes, primaryButton, secondaryButton } from './updateDialogStyles';

interface UpdateProgressDialogProps {
  status: UpdateStatusPayload | null;
  /** Stops the download; the installed version keeps working. */
  onCancel: () => void;
  onClose: () => void;
}

const TITLES: Record<UpdateStatusPayload['phase'], string> = {
  downloading: 'Downloading the update',
  verifying: 'Checking the download',
  installing: 'Installing the update',
  failed: 'The update failed',
  cancelled: 'Update cancelled',
};

/**
 * Shows the progress of an update the user started. The download can be cancelled until the
 * installer starts; a failed or cancelled update leaves the installed version as it was.
 */
export function UpdateProgressDialog({ status, onCancel, onClose }: Readonly<UpdateProgressDialogProps>) {
  if (!status) return null;

  const { phase } = status;
  const finished = phase === 'failed' || phase === 'cancelled';
  const canCancel = phase === 'downloading' || phase === 'verifying';
  const percent = status.totalBytes > 0 ? Math.min(100, Math.round((status.receivedBytes / status.totalBytes) * 100)) : 0;
  const version = status.version ? ` ${status.version}` : '';

  const description = {
    downloading: status.totalBytes > 0
      ? `GenSynth${version}: ${formatMegabytes(status.receivedBytes)} of ${formatMegabytes(status.totalBytes)} (${percent}%)`
      : `GenSynth${version}: starting the download...`,
    verifying: 'Making sure the installer is complete and has not been modified.',
    installing: status.message ?? 'The installer is starting.',
    failed: `${status.message ?? 'Unknown error.'} You can keep using the installed version.`,
    cancelled: 'Nothing was installed. You can keep using the installed version.',
  }[phase];

  return (
    <Dialog open onOpenChange={(open) => { if (!open && finished) onClose(); }}>
      <DialogContent
        // While the update runs it can only be cancelled with its button: no ×, Esc or click outside
        className={`sm:max-w-md bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)] ${finished ? '' : '[&>button:last-child]:hidden'}`}
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
        onEscapeKeyDown={(event) => { if (!finished) event.preventDefault(); }}
        onInteractOutside={(event) => { if (!finished) event.preventDefault(); }}
      >
        <DialogHeader className="flex flex-col gap-2">
          <div className={`flex items-center gap-2 ${phase === 'failed' ? 'text-red-400' : 'text-cyan-400'}`}>
            {phase === 'failed' ? <AlertTriangle size={18} /> : <Download size={18} />}
            <DialogTitle className="text-sm font-semibold text-[var(--c-tx1)] tracking-tight">
              {TITLES[phase]}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[var(--c-tx3)] leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        {!finished && <Progress value={phase === 'downloading' ? percent : 100} aria-label="Update progress" />}

        <DialogFooter className="flex items-center justify-end gap-2 mt-2">
          {canCancel && (
            <button type="button" onClick={onCancel} className={secondaryButton}>
              Cancel
            </button>
          )}
          {finished && (
            <button type="button" onClick={onClose} className={primaryButton}>
              Close
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
