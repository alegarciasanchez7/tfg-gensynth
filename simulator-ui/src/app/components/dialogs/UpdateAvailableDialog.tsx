import { Download, ExternalLink } from 'lucide-react';
import type { UpdateInfo } from '../../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { formatMegabytes, primaryButton, secondaryButton } from './updateDialogStyles';

interface UpdateAvailableDialogProps {
  update: UpdateInfo | null;
  isOpen: boolean;
  onUpdateNow: (version: string) => void;
  /** Keep the installed version for now; the dialog is offered again at the next start. */
  onNotNow: () => void;
  /** Keep the installed version and do not offer this version again. */
  onSkipVersion: (version: string) => void;
  onOpenReleaseNotes: (url: string) => void;
}

/**
 * Tells the user that a newer version exists and lets them choose: update now, keep working
 * with the installed version, or skip this version. Closing it is the same as "Not now".
 */
export function UpdateAvailableDialog({
  update,
  isOpen,
  onUpdateNow,
  onNotNow,
  onSkipVersion,
  onOpenReleaseNotes,
}: UpdateAvailableDialogProps) {
  if (!update) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onNotNow(); }}>
      <DialogContent
        className="sm:max-w-md bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <DialogHeader className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-cyan-400">
            <Download size={18} />
            <DialogTitle className="text-sm font-semibold text-[var(--c-tx1)] tracking-tight">
              GenSynth {update.latestVersion} is available
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[var(--c-tx3)] leading-relaxed">
            You are using version {update.currentVersion}. You can update now, or keep working with
            the version you have and update later from Settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-[11px] text-[var(--c-tx3)]">
          <span>Download: {formatMegabytes(update.assetSize)}</span>
          {update.releaseUrl && (
            <button
              type="button"
              onClick={() => onOpenReleaseNotes(update.releaseUrl)}
              className="flex items-center gap-1 text-cyan-500 hover:underline"
            >
              What's new <ExternalLink size={11} />
            </button>
          )}
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 mt-2">
          <button type="button" onClick={() => onSkipVersion(update.latestVersion)} className={secondaryButton}>
            Skip this version
          </button>
          <button type="button" onClick={onNotNow} className={secondaryButton}>
            Not now
          </button>
          <button type="button" onClick={() => onUpdateNow(update.latestVersion)} className={primaryButton}>
            Update now
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
