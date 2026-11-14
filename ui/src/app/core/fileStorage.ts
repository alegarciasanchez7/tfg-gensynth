/**
 * File Storage Utilities
 * Handles serialization/deserialization of project state to/from local files
 */

import { Group, Variable, Flow, ProjectSettings } from '../types';
import { normalizeProjectSettings } from './tickSettings';
import { normalizeOutputMode, normalizeSequentialOrder } from './outputMode';
import { randomUUID } from './randomId';
import { normalizeConnectionStatus, normalizeGroupStatus } from './entityStatus';
import { legacyFlowFields, legacyGroupFields } from './legacyFields';

/** Extension of GenSynth project files. Must match ProjectFileFormat.EXTENSION in the Core. */
export const PROJECT_FILE_EXTENSION = '.gsynth';
/** Marker stored in every project file. Must match ProjectFileFormat.FORMAT_ID in the Core. */
export const PROJECT_FORMAT_ID = 'gensynth-project';
/**
 * Current project file format version. Must match ProjectFileFormat.VERSION in the Core.
 * The `settings` section and the flow fields `everyTicks`, `lossPercent`, `outageEveryTicks` and
 * `outageDurationTicks` are optional (defaults apply: 1 and 0, i.e. no event loss);
 * `burst`, `interval` and `threads` are legacy.
 */
export const PROJECT_FORMAT_VERSION = '1.0.0';

export interface ProjectSnapshot {
  format: typeof PROJECT_FORMAT_ID;
  version: string;
  exportedAt: string;
  groups: Group[];
  variables: Variable[];
  settings: ProjectSettings;
}

/**
 * A configuration file picked by the user. `handle` is only available when the browser
 * supports the File System Access API and allows writing back to the same file.
 */
export interface PickedProjectFile {
  file: File;
  handle: FileSystemFileHandle | null;
}

/** Minimal typings for the File System Access API pickers (not part of lib.dom yet). */
interface FilePickerOptions {
  suggestedName?: string;
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface FileSystemAccessWindow {
  showOpenFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: FilePickerOptions) => Promise<FileSystemFileHandle>;
}

interface PermissionAwareFileHandle {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

const PROJECT_FILE_TYPES: FilePickerOptions['types'] = [
  { description: 'GenSynth configuration', accept: { 'application/json': [PROJECT_FILE_EXTENSION] } },
];

export function hasProjectFileExtension(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(PROJECT_FILE_EXTENSION);
}

function getFilePickers(): FileSystemAccessWindow {
  return typeof window === 'undefined' ? {} : (window as unknown as FileSystemAccessWindow);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Whether a value is a valid event loss percentage (finite, 0-100). */
function isLossPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

/** Whether a value is a valid event loss tick count (integer >= 0). */
function isTickCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/**
 * Normalize a Flow to ensure all required fields have valid values
 */
export function normalizeFlowFromSnapshot(flow: Partial<Flow>): Flow {
  const legacy = legacyFlowFields(flow);
  return {
    id: flow.id ?? randomUUID(),
    name: flow.name ?? 'Unnamed Flow',
    technology: flow.technology ?? 'unknown',
    connectionStatus: normalizeConnectionStatus(flow.connectionStatus),
    throughput: legacy.throughput ?? '0 msg/s',
    hasError: flow.hasError ?? false,
    errorMessage: flow.errorMessage,
    interval: typeof legacy.interval === 'number' ? legacy.interval : 1000,
    burst: typeof legacy.burst === 'number' ? legacy.burst : 1,
    everyTicks: Number.isInteger(flow.everyTicks) && (flow.everyTicks as number) >= 1 ? (flow.everyTicks as number) : 1,
    lossPercent: isLossPercent(flow.lossPercent) ? flow.lossPercent : 0,
    outageEveryTicks: isTickCount(flow.outageEveryTicks) ? flow.outageEveryTicks : 0,
    outageDurationTicks: isTickCount(flow.outageDurationTicks) ? flow.outageDurationTicks : 0,
    topic: flow.topic ?? '',
    host: flow.host ?? 'localhost',
    port: typeof flow.port === 'number' ? flow.port : 5672,
    latency: typeof flow.latency === 'number' ? flow.latency : 0,
    enabled: flow.enabled ?? true,
    template: flow.template,
    format: flow.format,
    connectorConfig: flow.connectorConfig,
    connectorVersion: flow.connectorVersion,
  };
}

/**
 * Normalize a Group to ensure all required fields have valid values
 */
export function normalizeGroupFromSnapshot(group: Partial<Group>): Group {
  const legacy = legacyGroupFields(group);
  return {
    id: group.id ?? randomUUID(),
    name: group.name ?? 'Unnamed Group',
    status: normalizeGroupStatus(group.status),
    throughput: legacy.throughput ?? '0 msg/s',
    description: group.description ?? '',
    threads: typeof legacy.threads === 'number' ? legacy.threads : 1,
    outputMode: normalizeOutputMode(group.outputMode),
    sequentialOrder: normalizeSequentialOrder(group.sequentialOrder),
    expanded: group.expanded ?? false,
    enabled: group.enabled ?? true,
    // Ensure flows is an array and normalize each flow
     flows: (Array.isArray(group.flows) ? group.flows : []).map(normalizeFlowFromSnapshot),
  };
}

/**
 * Normalize a Variable to ensure all required fields have valid values
 */
export function normalizeVariableFromSnapshot(variable: Partial<Variable>): Variable {
  return {
    id: variable.id ?? randomUUID(),
    name: variable.name ?? 'Unnamed Variable',
    type: variable.type ?? 'string',
    scope: variable.scope ?? 'local',
    flowId: variable.flowId,
    groupId: variable.groupId,
    config: variable.config ?? {},
    description: variable.description,
  };
}

/**
 * Serialize current state to a project snapshot
 */
export function createProjectSnapshot(groups: Group[], variables: Variable[], settings: ProjectSettings): ProjectSnapshot {
  return {
    format: PROJECT_FORMAT_ID,
    version: PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    groups,
    variables,
    settings,
  };
}

/**
 * Download snapshot as a project file to user's computer
 */
export function downloadProjectSnapshot(
  snapshot: ProjectSnapshot,
  filename: string = `gen-synth-project${PROJECT_FILE_EXTENSION}`,
): void {
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * Load and parse a project snapshot from a File object.
 * Rejects files that are not GenSynth project files (wrong extension or missing format marker).
 */
export async function loadProjectSnapshotFromFile(file: File): Promise<ProjectSnapshot> {
  if (!hasProjectFileExtension(file.name)) {
    throw new Error(`Not a GenSynth project file: expected a ${PROJECT_FILE_EXTENSION} file`);
  }

  let content: string;
  try {
    content = await file.text();
  } catch {
    throw new Error('Failed to read file');
  }
  return parseProjectSnapshot(content);
}

/**
 * Parse and normalize the text of a project file.
 * Rejects text that is not a GenSynth project (invalid JSON or missing format marker).
 */
function parseProjectSnapshot(content: string): ProjectSnapshot {
  let snapshot: ProjectSnapshot;
  try {
    snapshot = JSON.parse(content) as ProjectSnapshot;
  } catch {
    throw new Error('Not a GenSynth project file: invalid JSON content');
  }

  if (!snapshot || typeof snapshot !== 'object' || snapshot.format !== PROJECT_FORMAT_ID) {
    throw new Error("Not a GenSynth project file: missing or unknown 'format' marker");
  }

  // Validate snapshot structure
  if (!snapshot.version || !snapshot.groups || !snapshot.variables) {
    throw new Error('Invalid snapshot: missing required fields (version, groups, variables)');
  }

  if (!Array.isArray(snapshot.groups) || !Array.isArray(snapshot.variables)) {
    throw new TypeError('Invalid snapshot: groups and variables must be arrays');
  }

  // Normalize groups and variables to ensure all fields are present and valid
  return {
    format: PROJECT_FORMAT_ID,
    version: snapshot.version,
    exportedAt: snapshot.exportedAt,
    groups: snapshot.groups.map(normalizeGroupFromSnapshot),
    variables: snapshot.variables.map(normalizeVariableFromSnapshot),
    settings: normalizeProjectSettings((snapshot as { settings?: unknown }).settings),
  };
}

/**
 * Create a hidden file input and trigger file selection
 */
export function triggerFileSelection(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = PROJECT_FILE_EXTENSION;

    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file || null);
    };

    input.oncancel = () => {
      resolve(null);
    };

    input.click();
  });
}

/**
 * Whether the browser can write directly to a user-selected file (File System Access API).
 * Without it, saving falls back to downloading a copy of the configuration.
 */
export function supportsFileSystemAccess(): boolean {
  const pickers = getFilePickers();
  return typeof pickers.showOpenFilePicker === 'function' && typeof pickers.showSaveFilePicker === 'function';
}

/**
 * Asks the user for a configuration file to open.
 * Returns a writable handle when supported so later saves overwrite the same file.
 */
export async function pickProjectFile(): Promise<PickedProjectFile | null> {
  const { showOpenFilePicker } = getFilePickers();
  if (supportsFileSystemAccess() && showOpenFilePicker) {
    try {
      const [handle] = await showOpenFilePicker({ multiple: false, excludeAcceptAllOption: true, types: PROJECT_FILE_TYPES });
      return { file: await handle.getFile(), handle };
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    }
  }

  const file = await triggerFileSelection();
  return file ? { file, handle: null } : null;
}

/**
 * Asks the user where to save the configuration. Returns null if the dialog was cancelled.
 * Only call when {@link supportsFileSystemAccess} is true.
 */
export async function pickSaveTarget(suggestedName: string): Promise<FileSystemFileHandle | null> {
  const { showSaveFilePicker } = getFilePickers();
  if (!showSaveFilePicker) {
    throw new Error('Saving to a file is not supported by this browser');
  }
  try {
    return await showSaveFilePicker({ suggestedName, excludeAcceptAllOption: true, types: PROJECT_FILE_TYPES });
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

/**
 * Checks, without prompting, whether the handle can be written. Writing to a file opened
 * for reading requires a user gesture the first time, so background saves must skip it.
 */
export async function hasWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const { queryPermission } = handle as FileSystemFileHandle & PermissionAwareFileHandle;
  if (typeof queryPermission !== 'function') return true;
  return (await queryPermission.call(handle, { mode: 'readwrite' })) === 'granted';
}

/**
 * Overwrites the file behind the handle with the given snapshot.
 */
export async function writeProjectSnapshot(handle: FileSystemFileHandle, snapshot: ProjectSnapshot): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(snapshot, null, 2));
    await writable.close();
  } catch (error) {
    // Abort so a failed write never replaces the previous file contents
    await writable.abort().catch(() => undefined);
    throw error;
  }
}
