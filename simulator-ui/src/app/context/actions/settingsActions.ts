import type React from 'react';
import { toast } from 'sonner';
import type { AppAction } from '../reducer';
import type { ProjectSettings, TickSettings } from '../../types';
import { CoreCommands } from '../../core/bridge';
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
