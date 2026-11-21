import { useEffect, useRef } from 'react';

interface UseAutoSaveProps {
  enabled: boolean;
  intervalSeconds: number;
  isDirty: boolean;
  /** Saves silently to the open file; resolves to false when nothing could be saved. */
  save: (isAutoSave: boolean) => Promise<boolean>;
}

/**
 * Periodically saves the project while auto-save is enabled and there are unsaved changes.
 *
 * The timer only depends on `enabled` and `intervalSeconds`, so re-renders (e.g. metrics updates)
 * do not restart it. Overlapping saves are skipped.
 */
export function useAutoSave({ enabled, intervalSeconds, isDirty, save }: UseAutoSaveProps) {
  const saveRef = useRef(save);
  const isDirtyRef = useRef(isDirty);
  const isSavingRef = useRef(false);

  useEffect(() => {
    saveRef.current = save;
    isDirtyRef.current = isDirty;
  }, [save, isDirty]);

  useEffect(() => {
    if (!enabled) return;

    const timerId = window.setInterval(async () => {
      if (!isDirtyRef.current || isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        await saveRef.current(true);
      } finally {
        isSavingRef.current = false;
      }
    }, intervalSeconds * 1000);

    return () => window.clearInterval(timerId);
  }, [enabled, intervalSeconds]);
}
