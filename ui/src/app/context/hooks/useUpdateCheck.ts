import { useEffect, useRef } from 'react';
import type { AppState } from '../reducer';

/** Wait after connecting, so the check never delays loading the project. */
export const STARTUP_CHECK_DELAY_MS = 3000;

/**
 * Checks for updates once per session, a few seconds after the desktop app connects to the
 * Core, if the user did not turn it off. Silent: offline or failing checks show nothing.
 */
export function useUpdateCheck(
  state: Pick<AppState, 'isConnected' | 'connectionMode' | 'checkUpdatesAtStartup'>,
  checkForUpdates: (options: { silent: boolean }) => Promise<unknown>,
) {
  const checked = useRef(false);
  const shouldCheck = state.isConnected && state.connectionMode === 'jcef' && state.checkUpdatesAtStartup;

  useEffect(() => {
    if (!shouldCheck || checked.current) return;
    const timer = setTimeout(() => {
      checked.current = true;
      void checkForUpdates({ silent: true });
    }, STARTUP_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldCheck, checkForUpdates]);
}
