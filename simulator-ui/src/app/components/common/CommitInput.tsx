import { useState } from 'react';

interface CommitInputProps {
  /** Committed value shown when the field is not being edited. */
  value: string;
  /** Called on blur or Enter with the typed text; return false to reject it and restore `value`. */
  onCommit: (raw: string) => boolean;
  ariaLabel: string;
  className: string;
  inputMode?: 'decimal' | 'numeric';
  placeholder?: string;
  title?: string;
}

/**
 * Text input that keeps its own draft and commits on blur or Enter, so typing intermediate
 * values ("-", "40.") never reaches the Core. A rejected commit restores the last value.
 *
 * The draft follows `value` when it changes from outside (undo, another editor, a coordinate
 * switch). The echo of this field's own commit is ignored, so text typed after committing and
 * before the Core answers is not overwritten.
 */
export function CommitInput({ value, onCommit, ariaLabel, className, inputMode, placeholder, title }: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  // Last `value` seen, and the text this field committed and still waits to see echoed
  const [seenValue, setSeenValue] = useState(value);
  const [pendingCommit, setPendingCommit] = useState<string | null>(null);

  if (value !== seenValue) {
    setSeenValue(value);
    setPendingCommit(null);
    if (value !== pendingCommit) setDraft(value);
  }

  const commit = () => {
    if (draft === value) return;
    if (onCommit(draft)) {
      setPendingCommit(draft);
    } else {
      setDraft(value);
    }
  };

  return (
    <input
      type="text"
      inputMode={inputMode}
      aria-label={ariaLabel}
      placeholder={placeholder}
      title={title}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={className}
    />
  );
}
