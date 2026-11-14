import type React from 'react';
import { toast } from 'sonner';
import type { AppAction } from '../reducer';
import { CoreCommands } from '../../core/bridge';
import { commandErrorMessage } from '../../core/errorMessage';
import type { Group, Variable } from '../../types';
import { brokenReferenceErrors, itemReferenceErrors } from './startValidation';

export const startSystem = (
  dispatch: React.Dispatch<AppAction>,
  connectionMode: string,
  reportCommandError: (source: string, action: string, error: unknown) => void,
  getVariablesList?: () => Variable[],
  getGroupsList?: () => Group[],
  getFormatTemplates?: () => Record<string, string>,
) => async () => {
  // A rejected start leaves the system stopped, so say why where the user is looking
  const failStart = (error: unknown) => {
    reportCommandError('SYSTEM', 'startSystem', error);
    toast.error(`Cannot start the simulation: ${commandErrorMessage(error, 'unknown error')}`);
  };

  if (getVariablesList) {
    const variables = getVariablesList();
    const errors = [
      ...brokenReferenceErrors(variables),
      ...(getGroupsList ? itemReferenceErrors(variables, getGroupsList(), getFormatTemplates?.() ?? {}) : []),
    ];
    if (errors.length > 0) {
      failStart(new Error(errors[0]));
      return;
    }
  }

  try {
    if (connectionMode !== 'mock') {
      await CoreCommands.startSystem();
    }
    dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'running' });
  } catch (error) {
    failStart(error);
  }
};

export const stopSystem = (
  dispatch: React.Dispatch<AppAction>,
  connectionMode: string,
  reportCommandError: (source: string, action: string, error: unknown) => void,
) => async () => {
  try {
    if (connectionMode !== 'mock') {
      await CoreCommands.stopSystem();
    }
    dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'stopped' });
  } catch (error) {
    reportCommandError('SYSTEM', 'stopSystem', error);
  }
};

export const toggleSystem = (
  systemStatus: string,
  startFn: () => Promise<void>,
  stopFn: () => Promise<void>,
) => async () => {
  if (systemStatus === 'stopped') {
    await startFn();
  } else {
    await stopFn();
  }
};
