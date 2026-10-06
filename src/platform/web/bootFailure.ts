import { describeError } from '../describeError';

/**
 * Shown in place of the `#boot-status` loading text when boot throws. It is
 * Vietnamese like the loading text it replaces, because both appear before the
 * game (and its English HUD) exists.
 */
export const BOOT_FAILURE_MESSAGE = 'Không tải được game. Hãy đóng và mở lại.';

/** The one property of `#boot-status` this module writes. */
export interface BootStatusTarget {
  textContent: string | null;
}

/**
 * Replaces the loading text with a visible failure instead of leaving
 * "Đang tải game..." up forever. `src/main.ts` boots with a fire-and-forget
 * `startApplication()`, so without this a thrown error is an unhandled
 * rejection the player never sees — inside a Telegram Mini App, where there is
 * no address bar or devtools, it is indistinguishable from a slow network.
 *
 * `statusElement` is `null` once boot has already removed the loading shell;
 * a failure after the game is visible then leaves the game untouched. Returns
 * the rendered message, or `null` when nothing was rendered.
 */
export function reportBootFailure(
  statusElement: BootStatusTarget | null,
  error: unknown,
): string | null {
  if (statusElement === null) {
    return null;
  }

  const message = `${BOOT_FAILURE_MESSAGE} (${describeError(error)})`;
  statusElement.textContent = message;
  return message;
}
