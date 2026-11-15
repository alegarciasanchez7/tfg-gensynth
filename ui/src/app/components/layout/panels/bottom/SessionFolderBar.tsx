import { Copy, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

interface SessionFolderBarProps {
  /** Folder of the current (or last) session; null before the first START. */
  path: string | null;
  /** Shows the folder in the file explorer. */
  onOpen?: () => void;
}

const MONO = { fontFamily: 'JetBrains Mono, monospace' };

const BUTTON_CLASS =
  'flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--c-br1)] text-[10px] text-[var(--c-tx3)] ' +
  'hover:text-[var(--c-tx1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)] transition-all shrink-0';

/**
 * Fixed line above the logs with the folder of the generated files of the session. It is not a
 * log entry, so the filters and the log limit never hide it.
 */
export function SessionFolderBar({ path, onOpen }: Readonly<SessionFolderBarProps>) {
  const copy = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      toast.success('Folder path copied');
    } catch {
      toast.error('Could not copy the path: select it and copy it by hand');
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 border-b border-[var(--c-br2)] bg-[var(--c-bg1)] shrink-0 min-w-0"
      style={MONO}
    >
      <span className="text-[9px] text-[var(--c-tx5)] tracking-widest uppercase shrink-0">Session folder</span>
      {path ? (
        <>
          <span className="flex-1 min-w-0 truncate text-[10px] text-[var(--c-tx2)] select-text" title={path}>
            {path}
          </span>
          <button type="button" onClick={copy} className={BUTTON_CLASS} title="Copy the folder path" aria-label="Copy session folder">
            <Copy size={10} /> Copy
          </button>
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className={BUTTON_CLASS}
              title="Show the folder in the file explorer"
              aria-label="Open session folder"
            >
              <FolderOpen size={10} /> Open
            </button>
          )}
        </>
      ) : (
        <span className="flex-1 text-[10px] text-[var(--c-tx4)]">Appears here when you press START</span>
      )}
    </div>
  );
}
