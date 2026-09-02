import type {
  SaveDocumentV1,
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
    write(document: SaveDocumentV1): void;
  } | null;
}

export function bindSaveLifecycle(
  coordinator: SavePersistenceCoordinator,
  createCurrentDocument: () => SaveDocumentV1,
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
