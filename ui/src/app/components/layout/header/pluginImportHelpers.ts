import type { PluginValidationResultPayload, ValidationEntry } from '../../../core/types';

/** State of the plugin validation shown by the import panel. */
export type ValidationState = 'idle' | 'validating' | 'success' | 'error';

/** Pairs each log entry with a key derived from its content (repeated entries get an occurrence suffix). */
export function withUniqueKeys(logs: readonly ValidationEntry[]): Array<{ key: string; entry: ValidationEntry }> {
  const seen = new Map<string, number>();
  return logs.map((entry) => {
    const base = `${entry.level}|${entry.message}|${entry.context ?? ''}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return { key: `${base}|${occurrence}`, entry };
  });
}

/** Border and background of the drop zone for the current drag and validation state. */
export function dropZoneStateClass(isDragging: boolean, validationState: ValidationState, fileName: string | null): string {
  if (isDragging) return 'border-cyan-400 bg-cyan-400/5 scale-[1.02]';
  if (validationState === 'validating') return 'border-amber-400/50 bg-amber-400/5';
  if (validationState === 'success') return 'border-emerald-500/40 bg-emerald-500/5';
  if (fileName) return 'border-[var(--c-br2)] bg-[var(--c-bg1)]';
  return 'border-[var(--c-br1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]';
}

/** Validation result shown when the picked file is not a .jar. */
export function notAJarResult(): PluginValidationResultPayload {
  return {
    status: 'error',
    valid: false,
    logs: [{ level: 'ERROR', message: 'Only .jar files are accepted.', context: 'Validation' }],
  };
}

/** Validation result shown when the Core could not be asked to validate the plugin. */
export function requestFailedResult(): PluginValidationResultPayload {
  return {
    status: 'error',
    valid: false,
    logs: [{ level: 'ERROR', message: 'Validation request failed. Is the backend running?' }],
  };
}

/** Name and version sent with the validation: the typed ones, or the file name and 1.0.0. */
export function validationIdentity(jarFileName: string, pluginName: string, pluginVersion: string): { name: string; version: string } {
  return {
    name: pluginName.trim() || jarFileName.replace('.jar', ''),
    version: pluginVersion.trim() || '1.0.0',
  };
}
