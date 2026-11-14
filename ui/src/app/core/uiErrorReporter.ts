import bridge from './bridge';

/**
 * Sends a UI runtime error to the Core log. A failed send is only written to the console:
 * it must not raise another unhandled rejection, which would be reported again in an
 * endless loop while the Core is unreachable.
 *
 * @param message the error description
 * @returns a promise that always resolves, once the send has succeeded or failed
 */
export function reportUiErrorToCore(message: string): Promise<void> {
  return bridge
    .send('UI_LOG', { level: 'error', source: 'UI_RUNTIME', message })
    .then(
      () => undefined,
      (error: unknown) => {
        console.error('[UI] Unable to report a UI error to the Core:', error);
      },
    );
}
