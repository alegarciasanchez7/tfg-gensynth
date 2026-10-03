import type React from 'react';
import { toast } from 'sonner';
import type { AppAction, ProjectFileInfo } from '../reducer';
import type { Selection, Group, Variable, LogEntry } from '../../types';
import type { ConnectorPluginDescriptor } from '../../core/types';
import { CoreCommands } from '../../core/bridge';
import {
  pickProjectFile,
  pickSaveTarget,
  loadProjectSnapshotFromFile,
  createProjectSnapshot,
  downloadProjectSnapshot,
  writeProjectSnapshot,
  hasWritePermission,
  supportsFileSystemAccess,
  PROJECT_FILE_EXTENSION,
  type PickedProjectFile,
} from '../../core/fileStorage';

type Dispatch = React.Dispatch<AppAction>;

export interface ProjectLoadContext {
  dispatch: Dispatch;
  connectionMode: string;
  isConnected: boolean;
  connectorCatalog: ConnectorPluginDescriptor[];
  selection: Selection;
}

export interface ProjectSaveContext {
  dispatch: Dispatch;
  connectionMode: string;
  groups: Group[];
  variables: Variable[];
  file: ProjectFileInfo;
}

export interface ProjectResetContext {
  dispatch: Dispatch;
  isConnected: boolean;
}

function addLog(dispatch: Dispatch, level: LogEntry['level'], idPrefix: string, message: string) {
  dispatch({
    type: 'ADD_LOG',
    payload: {
      id: `${idPrefix}_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      level,
      source: 'SYSTEM',
      message,
    },
  });
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function defaultFileName(): string {
  return `gen-synth-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}${PROJECT_FILE_EXTENSION}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Runs a Core operation that replaces the whole project (load / new) while the reducer adopts
 * the Core echoes as the saved baseline. GET_INITIAL_STATE is answered after every broadcast
 * triggered by the operation, so once it resolves the baseline matches the Core state.
 *
 * @param operation resolves to false when the user cancelled, skipping the resync
 * @returns whether the operation completed
 */
async function syncBaselineWithCore(dispatch: Dispatch, operation: () => Promise<boolean>): Promise<boolean> {
  dispatch({ type: 'SET_BASELINE_SYNC', payload: true });
  try {
    const completed = await operation();
    if (completed) {
      await CoreCommands.getInitialState();
    }
    return completed;
  } finally {
    dispatch({ type: 'SET_BASELINE_SYNC', payload: false });
  }
}

/**
 * Opens a configuration file and replaces the current project with it.
 *
 * @param picked file already chosen by the user; if omitted a file dialog is shown
 * @returns whether a configuration was loaded
 */
export async function loadProjectState(ctx: ProjectLoadContext, picked?: PickedProjectFile | null): Promise<boolean> {
  const { dispatch } = ctx;
  try {
    // Desktop mode: the Core shows the native dialog and imports the file itself
    if (ctx.connectionMode === 'jcef') {
      let filePath: string | null = null;
      const loaded = await syncBaselineWithCore(dispatch, async () => {
        const response = await CoreCommands.loadState();
        if (response?.status === 'cancelled') return false;
        filePath = response?.filePath ?? null;
        return true;
      });
      if (!loaded) return false;

      const fileName = filePath ? fileNameFromPath(filePath) : null;
      dispatch({ type: 'SET_FILE_INFO', payload: { fileName, filePath, fileHandle: null } });
      dispatch({ type: 'SET_SELECTION', payload: { type: 'none' } });
      toast.success(`Configuration loaded${fileName ? `: ${fileName}` : ''}`);
      return true;
    }

    const target = picked ?? (await pickProjectFile());
    if (!target) return false;

    // loadProjectSnapshotFromFile already normalizes groups and variables
    const { groups, variables } = await loadProjectSnapshotFromFile(target.file);

    dispatch({
      type: 'LOAD_INITIAL_STATE',
      payload: {
        groups,
        variables,
        connectorCatalog: ctx.connectorCatalog,
        file: { fileName: target.file.name, filePath: null, fileHandle: target.handle },
      },
    });

    if (ctx.isConnected) {
      try {
        await syncBaselineWithCore(dispatch, async () => {
          await CoreCommands.importState(groups, variables);
          return true;
        });
      } catch (err: unknown) {
        console.error('[loadProjectState] Backend sync error:', err);
        addLog(dispatch, 'error', 'load_sync_error', `Error synchronizing loaded project with Core: ${errorMessage(err, 'unknown error')}`);
      }
    }

    const { selection } = ctx;
    const selectionStillExists =
      selection.type === 'group'
        ? groups.some((group) => group.id === selection.groupId)
        : selection.type === 'flow'
          ? groups.some((group) =>
              group.id === selection.groupId && group.flows.some((flow) => flow.id === selection.flowId),
            )
          : selection.type === 'variable'
            ? variables.some((variable) => variable.id === selection.variableId)
            : true;

    if (!selectionStillExists) {
      dispatch({ type: 'SET_SELECTION', payload: { type: 'none' } });
    }

    const totalFlows = groups.reduce((acc, g) => acc + g.flows.length, 0);
    addLog(
      dispatch,
      'info',
      'load_success',
      `Project loaded: ${groups.length} groups, ${totalFlows} flows, ${variables.length} variables`,
    );
    toast.success(`Project loaded from: ${target.file.name}`);
    return true;
  } catch (error) {
    const message = errorMessage(error, 'Unknown error while loading project');
    addLog(dispatch, 'error', 'load_error', `Error loading project: ${message}`);
    toast.error(message);
    return false;
  }
}

function markSaved(ctx: ProjectSaveContext, file: ProjectFileInfo) {
  ctx.dispatch({
    type: 'MARK_SAVED',
    payload: { savedState: { groups: ctx.groups, variables: ctx.variables }, file },
  });
}

/**
 * Saves the project to a new file chosen by the user.
 *
 * @returns whether the project was saved (false if the dialog was cancelled or saving failed)
 */
export async function saveProjectStateAs(ctx: ProjectSaveContext): Promise<boolean> {
  const { dispatch } = ctx;
  try {
    let file: ProjectFileInfo;

    if (ctx.connectionMode === 'jcef') {
      // Desktop mode: the Core shows the native dialog and writes the file
      const response = await CoreCommands.saveState();
      if (response?.status === 'cancelled') return false;
      const filePath = response?.filePath ?? null;
      file = { fileName: filePath ? fileNameFromPath(filePath) : ctx.file.fileName, filePath, fileHandle: null };
    } else if (supportsFileSystemAccess()) {
      const handle = await pickSaveTarget(ctx.file.fileName || defaultFileName());
      if (!handle) return false;
      await writeProjectSnapshot(handle, createProjectSnapshot(ctx.groups, ctx.variables));
      file = { fileName: handle.name, filePath: null, fileHandle: handle };
    } else {
      // Fallback for browsers without File System Access API: download a copy
      const fileName = ctx.file.fileName || defaultFileName();
      downloadProjectSnapshot(createProjectSnapshot(ctx.groups, ctx.variables), fileName);
      file = { fileName, filePath: null, fileHandle: null };
    }

    markSaved(ctx, file);
    addLog(dispatch, 'info', 'save_success', `Project saved as: ${file.fileName ?? 'configuration file'}`);
    toast.success(`Project saved as: ${file.fileName ?? 'configuration file'}`);
    return true;
  } catch (error) {
    const message = errorMessage(error, 'Unknown error while saving project');
    addLog(dispatch, 'error', 'save_error', `Error saving project: ${message}`);
    toast.error(message);
    return false;
  }
}

/**
 * Saves the project to the currently open file. Without an open file, a manual save behaves
 * as "Save as" while an auto-save is skipped (it must never open a dialog).
 *
 * @param isAutoSave true when triggered by the auto-save timer (silent, no dialogs)
 * @returns whether the project was saved
 */
export async function saveProjectState(ctx: ProjectSaveContext, isAutoSave = false): Promise<boolean> {
  const { dispatch, file } = ctx;
  const isDesktop = ctx.connectionMode === 'jcef';
  const hasWritableTarget = isDesktop ? Boolean(file.filePath) : Boolean(file.fileHandle);

  if (!hasWritableTarget) {
    return isAutoSave ? false : saveProjectStateAs(ctx);
  }

  try {
    if (isDesktop && file.filePath) {
      await CoreCommands.exportState(file.filePath);
    } else if (file.fileHandle) {
      // Writing to a file opened for reading needs a user gesture the first time
      if (isAutoSave && !(await hasWritePermission(file.fileHandle))) return false;
      await writeProjectSnapshot(file.fileHandle, createProjectSnapshot(ctx.groups, ctx.variables));
    }

    markSaved(ctx, file);
    const fileName = file.fileName ?? 'configuration file';
    addLog(dispatch, 'info', 'save_success', isAutoSave ? `Auto-saved to ${fileName}` : `Project saved: ${fileName}`);
    if (!isAutoSave) {
      toast.success(`Project saved: ${fileName}`);
    }
    return true;
  } catch (error) {
    const message = errorMessage(error, 'Unknown error while saving project');
    addLog(dispatch, 'error', 'save_error', `${isAutoSave ? 'Auto-save failed' : 'Error saving project'}: ${message}`);
    if (!isAutoSave) {
      toast.error(message);
    }
    return false;
  }
}

/**
 * Closes the current configuration and starts an empty one, clearing the Core state too.
 */
export async function newProjectState(ctx: ProjectResetContext): Promise<void> {
  const { dispatch } = ctx;
  dispatch({ type: 'NEW_PROJECT' });

  if (ctx.isConnected) {
    try {
      await syncBaselineWithCore(dispatch, async () => {
        await CoreCommands.importState([], []);
        return true;
      });
    } catch (error) {
      const message = errorMessage(error, 'Unknown error while resetting the Core state');
      addLog(dispatch, 'error', 'new_project_error', `Error creating new configuration: ${message}`);
      toast.error(message);
      return;
    }
  }

  addLog(dispatch, 'info', 'new_project', 'New configuration created');
  toast.success('New configuration created');
}
