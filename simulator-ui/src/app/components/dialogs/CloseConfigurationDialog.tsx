import { useState } from 'react';
import { AlertTriangle, FilePlus, FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';

export type CloseConfigurationReason = 'new' | 'load';

interface CloseConfigurationDialogProps {
  isOpen: boolean;
  reason: CloseConfigurationReason;
  /** Name of the configuration file being closed (null for an unsaved configuration). */
  fileName: string | null;
  hasUnsavedChanges: boolean;
  /** Called with `saveFirst = true` when the user wants to save before continuing. */
  onConfirm: (saveFirst: boolean) => void | Promise<void>;
  onCancel: () => void;
}

const COPY: Record<CloseConfigurationReason, { title: string; action: string; confirmLabel: string }> = {
  new: {
    title: 'Create New Configuration',
    action: 'to create a new one',
    confirmLabel: 'Create New',
  },
  load: {
    title: 'Open Configuration',
    action: 'to open another one',
    confirmLabel: 'Open',
  },
};

/**
 * Confirms closing the current configuration file before creating a new one or opening another,
 * offering to save first when there are unsaved changes.
 */
export function CloseConfigurationDialog({
  isOpen,
  reason,
  fileName,
  hasUnsavedChanges,
  onConfirm,
  onCancel,
}: CloseConfigurationDialogProps) {
  const [isBusy, setIsBusy] = useState(false);
  const copy = COPY[reason];
  const Icon = reason === 'new' ? FilePlus : FolderOpen;

  const handleConfirm = async (saveFirst: boolean) => {
    setIsBusy(true);
    try {
      await onConfirm(saveFirst);
    } finally {
      setIsBusy(false);
    }
  };

  const secondaryButton =
    'px-3 py-1.5 rounded border border-[var(--c-br1)] text-xs text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const primaryButton =
    'px-3 py-1.5 rounded border border-cyan-500/50 bg-cyan-500/20 text-xs text-cyan-300 font-semibold hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const dangerButton =
    'px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isBusy) onCancel(); }}>
      <DialogContent
        className="sm:max-w-md bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <DialogHeader className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-cyan-400">
            <Icon size={18} />
            <DialogTitle className="text-sm font-semibold text-[var(--c-tx1)] tracking-tight">
              {copy.title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-[var(--c-tx3)] leading-relaxed">
            The configuration file{' '}
            <span className="font-semibold text-[var(--c-tx1)]">{fileName ?? 'Untitled'}</span>{' '}
            will be closed {copy.action}.
          </DialogDescription>
        </DialogHeader>

        {hasUnsavedChanges && (
          <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>It has unsaved changes. Save them before continuing or they will be lost.</span>
          </div>
        )}

        <DialogFooter className="flex items-center justify-end gap-2 mt-2">
          <button onClick={onCancel} disabled={isBusy} className={secondaryButton}>
            Cancel
          </button>
          {hasUnsavedChanges ? (
            <>
              <button onClick={() => handleConfirm(false)} disabled={isBusy} className={dangerButton}>
                Discard Changes
              </button>
              <button onClick={() => handleConfirm(true)} disabled={isBusy} className={primaryButton}>
                Save & Continue
              </button>
            </>
          ) : (
            <button onClick={() => handleConfirm(false)} disabled={isBusy} className={primaryButton}>
              {copy.confirmLabel}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
