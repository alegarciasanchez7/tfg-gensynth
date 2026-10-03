/**
 * File Storage Utilities
 * Handles serialization/deserialization of project state to/from local files
 */

import { Group, Variable, Flow } from '../types';

export interface ProjectSnapshot {
  version: string;
  exportedAt: string;
  groups: Group[];
  variables: Variable[];
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
  { description: 'GenSynth configuration', accept: { 'application/json': ['.json'] } },
];

function getFilePickers(): FileSystemAccessWindow {
  return typeof window === 'undefined' ? {} : (window as unknown as FileSystemAccessWindow);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Normalize a Flow to ensure all required fields have valid values
 */
export function normalizeFlowFromSnapshot(flow: Partial<Flow>): Flow {
  return {
    id: flow.id ?? crypto.randomUUID(),
    name: flow.name ?? 'Unnamed Flow',
    technology: flow.technology ?? 'unknown',
    connectionStatus: (flow.connectionStatus ?? 'disconnected') as any,
    throughput: flow.throughput ?? '0 msg/s',
    hasError: flow.hasError ?? false,
    errorMessage: flow.errorMessage,
    interval: typeof flow.interval === 'number' ? flow.interval : 1000,
    burst: typeof flow.burst === 'number' ? flow.burst : 1,
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
  return {
    id: group.id ?? crypto.randomUUID(),
    name: group.name ?? 'Unnamed Group',
    status: (group.status ?? 'stopped') as any,
    throughput: group.throughput ?? '0 msg/s',
    description: group.description ?? '',
    threads: typeof group.threads === 'number' ? group.threads : 1,
    outputMode: group.outputMode ?? 'TEXT',
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
    id: variable.id ?? crypto.randomUUID(),
    name: variable.name ?? 'Unnamed Variable',
    type: (variable.type ?? 'string') as any,
    scope: (variable.scope ?? 'local') as any,
    flowId: variable.flowId,
    groupId: variable.groupId,
    config: variable.config ?? {},
    description: variable.description,
  };
}

/**
 * Serialize current state to a project snapshot
 */
export function createProjectSnapshot(groups: Group[], variables: Variable[]): ProjectSnapshot {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    groups,
    variables,
  };
}

/**
 * Download snapshot as JSON file to user's computer
 */
export function downloadProjectSnapshot(snapshot: ProjectSnapshot, filename: string = 'gen-synth-project.json'): void {
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
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Load and parse a project snapshot from a File object
 */
export async function loadProjectSnapshotFromFile(file: File): Promise<ProjectSnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          throw new Error('File content is not text');
        }

        const snapshot = JSON.parse(content) as ProjectSnapshot;

        // Validate snapshot structure
        if (!snapshot.version || !snapshot.groups || !snapshot.variables) {
          throw new Error('Invalid snapshot: missing required fields (version, groups, variables)');
        }

        if (!Array.isArray(snapshot.groups) || !Array.isArray(snapshot.variables)) {
          throw new Error('Invalid snapshot: groups and variables must be arrays');
        }

        // Normalize groups and variables to ensure all fields are present and valid
        const normalizedSnapshot: ProjectSnapshot = {
          version: snapshot.version,
          exportedAt: snapshot.exportedAt,
          groups: snapshot.groups.map(normalizeGroupFromSnapshot),
          variables: snapshot.variables.map(normalizeVariableFromSnapshot),
        };

        resolve(normalizedSnapshot);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Create a hidden file input and trigger file selection
 */
export function triggerFileSelection(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

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
      const [handle] = await showOpenFilePicker({ multiple: false, types: PROJECT_FILE_TYPES });
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
    return await showSaveFilePicker({ suggestedName, types: PROJECT_FILE_TYPES });
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
