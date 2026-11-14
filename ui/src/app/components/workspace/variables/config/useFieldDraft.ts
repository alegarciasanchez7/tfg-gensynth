import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Decides the new text of a field draft when its config value changes from outside
 * (another editor, an undo, a discard): the new text, or null to keep the current draft.
 */
export type DraftResync<T> = (value: T, draft: string) => string | null;

/**
 * Local text of a config field while the user types it, re-synced when the config value
 * changes from outside. The resync happens while rendering (the "adjust state when a prop
 * changes" pattern), so the input never shows a stale draft for one frame.
 *
 * @param value the current config value of the field
 * @param initialDraft the text shown on the first render
 * @param resync the new text for a changed value, or null to keep what the user typed
 */
export function useFieldDraft<T>(
  value: T,
  initialDraft: string,
  resync: DraftResync<T>,
): [string, Dispatch<SetStateAction<string>>] {
  const [draft, setDraft] = useState(initialDraft);
  const [previousValue, setPreviousValue] = useState(value);
  if (!Object.is(value, previousValue)) {
    setPreviousValue(value);
    const next = resync(value, draft);
    if (next !== null) {
      setDraft(next);
    }
  }
  return [draft, setDraft];
}

/** A numeric field: re-synced to the new value unless the draft already parses to it. */
export const resyncNumber: DraftResync<number | undefined> = (value, draft) => {
  if (value === undefined || Number.parseFloat(draft) === value) return null;
  return String(value);
};

/** A numeric field that can be cleared: a missing value clears the draft. */
export const resyncOptionalNumber: DraftResync<number | null | undefined> = (value, draft) => {
  if (value === undefined || value === null) return '';
  if (Number.parseFloat(draft) === value) return null;
  return String(value);
};

/** A text field: re-synced to the new text when it differs from the draft. */
export const resyncText: DraftResync<string | undefined> = (value, draft) => {
  if (value === undefined || value === draft) return null;
  return value;
};
