import type {
  SaveDocumentV2,
  SavePersistenceCoordinator,
} from '../../persistence';

interface LifecycleEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface VisibilityEventTarget extends LifecycleEventTarget {
  readonly visibilityState: string;
}

export interface SaveLifecycleTargets {
  readonly page?: LifecycleEventTarget | null;
  readonly visibility?: VisibilityEventTarget | null;
  readonly journal?: {
    write(document: SaveDocumentV2): void;
  } | null;
  /**
   * Server-milestone Step 19: §9's forced cloud-upload triggers. A lifecycle
   * flush is one of the three moments the save-sync protocol forces an upload
   * regardless of the 60 s interval. Best-effort and synchronous by contract —
   * `bindSaveLifecycle` itself only fires and forgets — so a throwing or slow
   * callback here can never delay the local journal write or the flush.
   */
  readonly onForceSave?: ((document: SaveDocumentV2) => void) | null;
}

export function bindSaveLifecycle(
  coordinator: SavePersistenceCoordinator,
  createCurrentDocument: () => SaveDocumentV2,
  targets: SaveLifecycleTargets = {},
): () => void {
  const pageTarget = targets.page ?? getDefaultPageTarget();
  const visibilityTarget =
    targets.visibility ?? getDefaultVisibilityTarget();
  const forceSave = (): void => {
    const document = createCurrentDocument();

    targets.journal?.write(document);
    coordinator.queueSave(document);
    void coordinator.flush();

    try {
      targets.onForceSave?.(document);
    } catch {
      // A best-effort cloud trigger must never interrupt the local save.
    }
  };
  const handleVisibilityChange = (): void => {
    if (visibilityTarget?.visibilityState === 'hidden') {
      forceSave();
    }
  };

  pageTarget?.addEventListener('pagehide', forceSave);
  visibilityTarget?.addEventListener(
    'visibilitychange',
    handleVisibilityChange,
  );

  return () => {
    pageTarget?.removeEventListener('pagehide', forceSave);
    visibilityTarget?.removeEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );
  };
}

function getDefaultPageTarget(): LifecycleEventTarget | null {
  return typeof window === 'undefined' ? null : window;
}

function getDefaultVisibilityTarget(): VisibilityEventTarget | null {
  return typeof document === 'undefined' ? null : document;
}
