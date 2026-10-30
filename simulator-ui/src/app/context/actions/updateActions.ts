import type React from 'react';
import type { AppAction } from '../reducer';
import type { UpdateInfo } from '../../types';
import type { UpdateCheckPayload } from '../../core/types';
import { CoreCommands } from '../../core/bridge';

export interface UpdateActionContext {
  dispatch: React.Dispatch<AppAction>;
  getConnectionMode: () => string;
  getSkippedVersion: () => string | null;
  /** True while there are unsaved changes or the simulation runs: installing closes the app. */
  getUnsavedWork: () => { isDirty: boolean; isRunning: boolean };
  reportCommandError: (source: string, action: string, error: unknown) => void;
}

const toUpdateInfo = (check: UpdateCheckPayload): UpdateInfo | null =>
  check.available && check.latestVersion
    ? {
        currentVersion: check.currentVersion ?? '',
        latestVersion: check.latestVersion,
        releaseUrl: check.releaseUrl ?? '',
        assetSize: check.assetSize ?? 0,
      }
    : null;

/**
 * Asks the Core whether a newer release exists. Nothing is downloaded.
 *
 * A silent check (at startup) ignores every error and the version the user skipped, and
 * opens the "update available" dialog when it finds one. A manual check (Settings) returns
 * the result for the caller to show, also for a skipped version, and throws on errors.
 */
export function checkForUpdates(ctx: UpdateActionContext) {
  return async ({ silent }: { silent: boolean }): Promise<UpdateCheckPayload | null> => {
    if (ctx.getConnectionMode() === 'mock') return null;
    try {
      const check = await CoreCommands.checkForUpdates();
      const update = check?.supported ? toUpdateInfo(check) : null;
      if (silent && update && update.latestVersion === ctx.getSkippedVersion()) {
        return check;
      }
      ctx.dispatch({ type: 'SET_AVAILABLE_UPDATE', payload: { update, openDialog: silent } });
      return check;
    } catch (error) {
      if (silent) return null;
      ctx.reportCommandError('UPDATES', 'checkForUpdates', error);
      throw error;
    }
  };
}

/**
 * Starts the update to the version the user accepted, after a confirmation the user can
 * cancel to keep working with the installed version.
 *
 * @returns false if the user cancelled
 */
export function installUpdate(ctx: UpdateActionContext) {
  return async (version: string): Promise<boolean> => {
    const { isDirty, isRunning } = ctx.getUnsavedWork();
    const warnings = [
      `GenSynth will download version ${version} and then close (or restart) to install it.`,
      isRunning ? 'The running groups will stop.' : '',
      isDirty ? 'You have unsaved changes: cancel and save them first, or they will be lost.' : '',
      'Continue?',
    ].filter(Boolean);
    if (!window.confirm(warnings.join('\n\n'))) return false;

    ctx.dispatch({ type: 'SET_UPDATE_DIALOG_OPEN', payload: false });
    ctx.dispatch({ type: 'SET_UPDATE_STATUS', payload: { phase: 'downloading', version, receivedBytes: 0, totalBytes: 0 } });
    try {
      await CoreCommands.installUpdate(version);
    } catch (error) {
      ctx.reportCommandError('UPDATES', `installUpdate(${version})`, error);
      ctx.dispatch({
        type: 'SET_UPDATE_STATUS',
        payload: { phase: 'failed', version, receivedBytes: 0, totalBytes: 0, message: error instanceof Error ? error.message : String(error) },
      });
    }
    return true;
  };
}

/** Stops a download in progress; the app keeps the installed version. */
export function cancelUpdate(ctx: UpdateActionContext) {
  return async (): Promise<void> => {
    try {
      await CoreCommands.cancelUpdate();
    } catch (error) {
      ctx.reportCommandError('UPDATES', 'cancelUpdate', error);
    }
  };
}
