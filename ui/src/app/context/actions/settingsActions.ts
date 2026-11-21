import type React from 'react';
import { toast } from 'sonner';
import type { AppAction } from '../reducer';
import type { OutputFolderInfo, ProjectSettings, TickSettings } from '../../types';
import { CoreCommands } from '../../core/bridge';
import { commandErrorMessage } from '../../core/errorMessage';
import { executeOptimisticUpdate } from '../optimisticUpdateHelper';
import { describeTickSettings, validateTickSettings } from '../../core/tickSettings';

export interface SettingsActionContext {
  dispatch: React.Dispatch<AppAction>;
  getConnectionMode: () => string;
  getSettings: () => ProjectSettings;
  reportCommandError: (source: string, action: string, error: unknown) => void;
}

/**
 * Updates the global tick clock settings. The change is applied optimistically and rolled
 * back if the Core rejects it. In mock mode only the local state changes.
 */
export function updateTickSettings(ctx: SettingsActionContext) {
  return async (tick: TickSettings): Promise<void> => {
    const validationError = validateTickSettings(tick);
    if (validationError) {
      toast.error(validationError);
      throw new Error(validationError);
    }

    const previous = ctx.getSettings();
    const next: ProjectSettings = { ...previous, tick };

    try {
      await executeOptimisticUpdate(
        { optimisticManager: null, commandType: 'UPDATE_SETTINGS', resourceId: 'tick' },
        {
          applyOptimistic: () => ctx.dispatch({ type: 'SET_SETTINGS', payload: next }),
          rollback: () => ctx.dispatch({ type: 'SET_SETTINGS', payload: previous }),
          send: async () => {
            if (ctx.getConnectionMode() !== 'mock') {
              await CoreCommands.updateSettings(next);
            }
          },
        },
      );
    } catch (error) {
      ctx.reportCommandError('SETTINGS', `updateTickSettings(${describeTickSettings(tick)})`, error);
      toast.error(`Could not update the tick settings: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };
}

export interface OutputFolderActionContext {
  dispatch: React.Dispatch<AppAction>;
  getConnectionMode: () => string;
  getOutputFolder: () => OutputFolderInfo | null;
  reportCommandError: (source: string, action: string, error: unknown) => void;
}

/**
 * Changes the folder where each START creates its session folder, or goes back to the default
 * one with null. Not optimistic: the Core checks that the folder can be written (and creates it)
 * before accepting it. In mock mode only the local state changes.
 */
export function setOutputFolder(ctx: OutputFolderActionContext) {
  return async (path: string | null): Promise<void> => {
    const trimmed = path?.trim() || null;
    try {
      if (ctx.getConnectionMode() === 'mock') {
        const current = ctx.getOutputFolder();
        const defaultPath = current?.defaultPath ?? '';
        ctx.dispatch({
          type: 'SET_OUTPUT_FOLDER',
          payload: { path: trimmed ?? defaultPath, defaultPath, custom: trimmed !== null },
        });
        return;
      }
      const response = await CoreCommands.updateOutputFolder(trimmed);
      if (response?.outputFolder) {
        ctx.dispatch({ type: 'SET_OUTPUT_FOLDER', payload: response.outputFolder });
      }
    } catch (error) {
      ctx.reportCommandError('SETTINGS', `setOutputFolder(${trimmed ?? 'default'})`, error);
      toast.error(`Could not change the output folder: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };
}

export interface OpenOutputFolderActionContext {
  getConnectionMode: () => string;
  reportCommandError: (source: string, action: string, error: unknown) => void;
}

/**
 * Shows the folder of the current session in the file explorer (the output folder when the
 * session folder does not exist yet). The Core chooses the folder. Not available in mock mode.
 */
export function openOutputFolder(ctx: OpenOutputFolderActionContext) {
  return async (): Promise<void> => {
    if (ctx.getConnectionMode() === 'mock') {
      toast.info('Opening folders needs the GenSynth core (not available in mock mode).');
      return;
    }
    try {
      await CoreCommands.openOutputFolder();
    } catch (error) {
      ctx.reportCommandError('SETTINGS', 'openOutputFolder', error);
      toast.error(`Could not open the folder: ${commandErrorMessage(error, 'unknown error')}`);
    }
  };
}
