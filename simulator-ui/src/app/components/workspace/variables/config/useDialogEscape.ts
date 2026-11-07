import { useEffect, useRef } from 'react';

/**
 * Closes a confirmation dialog with Escape while it is open. The listener runs in the capture
 * phase and stops the event, so an enclosing modal or fullscreen editor that also listens for
 * Escape stays open: the first Escape only closes the dialog.
 *
 * @param open    whether the dialog is shown
 * @param onClose called on Escape while open
 */
export function useDialogEscape(open: boolean, onClose: () => void): void {
  // The latest callback, so the listener is only re-registered when `open` changes
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);
}
