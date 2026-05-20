import type React from 'react';
import type { AppAction } from '../reducer';
import { CoreCommands } from '../../core/bridge';

export const startSystem = (
  dispatch: React.Dispatch<AppAction>,
  connectionMode: string,
  reportCommandError: (source: string, action: string, error: unknown) => void,
) => async () => {
  try {
    if (connectionMode !== 'mock') {
      await CoreCommands.startSystem();
    }
    dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'running' });
  } catch (error) {
    reportCommandError('SYSTEM', 'startSystem', error);
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
