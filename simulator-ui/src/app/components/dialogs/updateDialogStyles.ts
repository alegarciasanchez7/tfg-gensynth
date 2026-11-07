/** Button styles shared by the update dialogs (same look as the other app dialogs). */
export const secondaryButton =
  'px-3 py-1.5 rounded border border-[var(--c-br1)] text-xs text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:bg-[var(--c-bg5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
export const primaryButton =
  'px-3 py-1.5 rounded border border-cyan-500/50 bg-cyan-500/20 text-xs text-cyan-600 dark:text-cyan-300 font-semibold hover:bg-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed';

/** Formats a size in bytes as MB with one decimal. */
export const formatMegabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
