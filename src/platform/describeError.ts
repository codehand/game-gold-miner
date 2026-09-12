/**
 * Renders an unknown thrown/rejected value as a short human-readable
 * string. Shared across `src/platform/web/` and `src/platform/telegram/`,
 * whose never-throws sign-in contracts all need to turn an arbitrary
 * collaborator failure into a typed `reason` string.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
