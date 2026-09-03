/**
 * A recoverable persistence problem the player should be told about.
 *
 * Both `SaveRecoveryWarning` and `PersistenceDiagnostic` satisfy this shape, so
 * the loader's save-recovery warnings and the coordinator's storage failures
 * reach the screen through one surface. The code stays a plain string rather
 * than a union of their two enums, which would make the UI layer import the
 * persistence layer for nothing more than a label.
 */
export interface SaveDiagnosticNotice {
  readonly code: string;
  readonly message: string;
}

export interface SaveDiagnosticBanner {
  report(notice: SaveDiagnosticNotice): void;
  destroy(): void;
}

interface BannerElements {
  readonly banner: HTMLElement;
  readonly message: HTMLElement;
}

/**
 * Shows recoverable save problems without interrupting play.
 *
 * The session always continues — a corrupt save has already been replaced by a
 * fresh game and a failed write is still retried — so this is a notice, not a
 * dialog: it never takes focus, and it overlays only the non-interactive HUD
 * strip at the top of the screen.
 *
 * A failing write repeats on every debounce, so a code that is already showing
 * is ignored rather than re-rendered, and a dismissed code stays dismissed
 * until a different problem occurs. Otherwise one broken storage backend would
 * reopen its own banner every half second. A notice is not withdrawn when a
 * later write succeeds: the coordinator reports failures, not recoveries, and
 * telling the player their progress may not be stored is the safe direction.
 */
export function createSaveDiagnosticBanner(
  parent: HTMLElement,
): SaveDiagnosticBanner {
  let elements: BannerElements | null = null;
  let displayedCode: string | null = null;
  let dismissedCode: string | null = null;
  let destroyed = false;

  const dismiss = (): void => {
    dismissedCode = displayedCode;
    displayedCode = null;
    elements?.banner.remove();
  };

  const build = (): BannerElements => {
    const banner = document.createElement('div');
    banner.className = 'save-diagnostic';
    banner.dataset.testid = 'save-diagnostic';
    // Announced politely rather than assertively: the player has lost no
    // session and needs no immediate action.
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('role', 'status');

    const message = document.createElement('p');
    message.className = 'save-diagnostic-message';
    message.dataset.testid = 'save-diagnostic-message';

    const dismissButton = document.createElement('button');
    dismissButton.className = 'save-diagnostic-dismiss';
    dismissButton.dataset.testid = 'save-diagnostic-dismiss';
    dismissButton.type = 'button';
    dismissButton.textContent = 'Dismiss';
    dismissButton.addEventListener('click', dismiss);

    banner.append(message, dismissButton);

    return { banner, message };
  };

  return {
    report(notice: SaveDiagnosticNotice): void {
      if (
        destroyed ||
        notice.code === displayedCode ||
        notice.code === dismissedCode
      ) {
        return;
      }

      elements ??= build();
      displayedCode = notice.code;
      dismissedCode = null;
      elements.banner.dataset.code = notice.code;

      // Attached before the text is written so the live region exists when its
      // content changes, which is what an assistive technology watches for.
      parent.append(elements.banner);
      elements.message.textContent = notice.message;
    },
    destroy(): void {
      destroyed = true;
      displayedCode = null;
      elements?.banner.remove();
    },
  };
}
