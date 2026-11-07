/**
 * Text to show for a failed command. The CRUD actions reject with Error instances or with
 * `{ code, message }` objects (CRUDError) carrying the message sent by the Core.
 *
 * @param error    the rejection reason
 * @param fallback text used when the reason has no message
 */
export function commandErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}
