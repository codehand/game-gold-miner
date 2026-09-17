/**
 * Server-milestone Step 19: the one real network adapter for the cloud save
 * replica — §10.3 `PUT /v1/save`. Pure policy lives in
 * `src/persistence/cloudSaveReplica.ts`; this file only turns HTTP into the
 * typed `CloudSaveUploadResult` that policy switches on, mirroring
 * `downloadCloudSaveViaFetch` in `cloudSaveReconcile.ts`.
 *
 * It never throws: a rejected `fetch` is `retryable`, so a tunnel or an
 * offline device leaves the local save untouched and the controller's bounded
 * backoff in charge. `unauthenticated` (§4) refreshes the session once and
 * retries, because the SDK can renew a token that merely expired; if that
 * fails the result is terminal, exactly as the protocol says.
 */
import type {
  CloudSaveFailureCode,
  CloudSaveUploadResult,
} from '../../persistence';
import type { SaveDocumentV2 } from '../../persistence';
import { describeError } from '../describeError';

/**
 * The narrow slice of `SupabaseClient['auth']` this adapter needs. `null`
 * means no Supabase project is configured at all — resolved `unconfigured`
 * with no call made, the same contract `createSupabaseClient` and
 * `guestSession.ts` already keep.
 */
export interface CloudSaveUploadAuthClient {
  getSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown;
  }>;
  refreshSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown;
  }>;
}

interface ErrorEnvelopeBody {
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly detail?: ConflictDetailBody;
  };
}

interface ConflictDetailBody {
  readonly serverRevision?: unknown;
  readonly receivedAt?: unknown;
  readonly document?: unknown;
}

/** The §4 codes that appear on a `PUT /v1/save` rejection. */
const FAILURE_CODES: readonly CloudSaveFailureCode[] = [
  'unauthenticated',
  'forbidden',
  'malformed_request',
  'payload_too_large',
  'save_invalid',
  'schema_unsupported',
  'save_rejected',
  'rate_limited',
  'server_error',
  'service_unavailable',
];

/**
 * `Retry-After` (Step 25) in milliseconds, or `undefined` when the header is
 * absent or unusable.
 *
 * §4 makes `rate_limited` "retryable after `Retry-After`", and
 * `server-save-sync-protocol.md` §10.2/§10.3 have the server send that header
 * as whole seconds — the same number it repeats in
 * `detail.retryAfterSeconds`. Only that delta-seconds form is honoured; the
 * header's other legal form (an HTTP-date) is not something this server emits,
 * so treating it as absent is safer than guessing at a date the client would
 * then have to trust its own clock to interpret. A malformed, negative,
 * zero or non-finite value is likewise treated as absent, which leaves the
 * ladder in sole charge — the same behaviour as a server that sent no header.
 */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null) {
    return undefined;
  }

  const seconds = Number(header.trim());
  if (!Number.isInteger(seconds) || seconds <= 0) {
    return undefined;
  }

  return seconds * 1_000;
}

function toFailureCode(value: unknown, fallback: CloudSaveFailureCode): CloudSaveFailureCode {
  return typeof value === 'string' && (FAILURE_CODES as readonly string[]).includes(value)
    ? (value as CloudSaveFailureCode)
    : fallback;
}

function messageOf(body: ErrorEnvelopeBody | null, status: number): string {
  return typeof body?.error?.message === 'string'
    ? body.error.message
    : `HTTP ${status}`;
}

export async function uploadCloudSaveViaFetch(
  edgeFunctionUrl: string,
  auth: CloudSaveUploadAuthClient | null,
  baseRevision: number | null,
  document: SaveDocumentV2,
): Promise<CloudSaveUploadResult> {
  if (auth === null) {
    return { kind: 'unconfigured' };
  }

  try {
    const { data: sessionData, error: sessionError } = await auth.getSession();
    if (sessionError) {
      return {
        kind: 'retryable',
        code: 'server_error',
        message: describeError(sessionError),
      };
    }
    if (sessionData.session === null) {
      return {
        kind: 'terminal',
        code: 'unauthenticated',
        message: 'No session to upload a cloud save for.',
        keepSyncing: false,
      };
    }

    const first = await send(edgeFunctionUrl, sessionData.session.access_token, baseRevision, document);
    if (first.kind !== 'refresh') {
      return first;
    }

    // §4 `unauthenticated`: "refresh the token and retry once. If that fails,
    // stop cloud sync for the session."
    const { data: refreshed, error: refreshError } = await auth.refreshSession();
    if (refreshError || refreshed.session === null) {
      return {
        kind: 'terminal',
        code: 'unauthenticated',
        message: 'Session could not be refreshed.',
        keepSyncing: false,
      };
    }

    const second = await send(
      edgeFunctionUrl,
      refreshed.session.access_token,
      baseRevision,
      document,
    );

    return second.kind === 'refresh'
      ? {
          kind: 'terminal',
          code: 'unauthenticated',
          message: 'Session remained unauthenticated after refresh.',
          keepSyncing: false,
        }
      : second;
  } catch (error) {
    return {
      kind: 'retryable',
      code: 'server_error',
      message: describeError(error),
    };
  }
}

/** `refresh` is internal-only: a `401` on the first pass asks the caller to renew the token and try once more. */
type SendResult = CloudSaveUploadResult | { readonly kind: 'refresh' };

async function send(
  edgeFunctionUrl: string,
  accessToken: string,
  baseRevision: number | null,
  document: SaveDocumentV2,
): Promise<SendResult> {
  const response = await fetch(edgeFunctionUrl, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ baseRevision, document }),
  });

  const body = (await response.json().catch(() => null)) as
    | (ErrorEnvelopeBody & { readonly revision?: unknown })
    | null;

  if (response.ok) {
    const revision = body?.revision;
    if (typeof revision !== 'number') {
      return { kind: 'retryable', code: 'server_error', message: 'Upload response carried no revision.' };
    }
    return { kind: 'accepted', revision };
  }

  if (response.status === 401) {
    return { kind: 'refresh' };
  }

  if (response.status === 409) {
    const detail = body?.error?.detail;
    const receivedAtMs = typeof detail?.receivedAt === 'string'
      ? Date.parse(detail.receivedAt)
      : Number.NaN;
    if (
      typeof detail?.serverRevision !== 'number' ||
      !Number.isFinite(receivedAtMs) ||
      typeof detail.document !== 'object' ||
      detail.document === null
    ) {
      return {
        kind: 'terminal',
        code: 'malformed_request',
        message: 'Conflict response carried no server document.',
        keepSyncing: false,
      };
    }
    return {
      kind: 'conflict',
      serverRevision: detail.serverRevision,
      receivedAtMs,
      document: detail.document,
    };
  }

  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    return {
      kind: 'retryable',
      code: 'rate_limited',
      message: messageOf(body, response.status),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (response.status === 503) {
    return { kind: 'retryable', code: 'service_unavailable', message: messageOf(body, response.status) };
  }
  if (response.status >= 500) {
    return { kind: 'retryable', code: 'server_error', message: messageOf(body, response.status) };
  }

  if (response.status === 422) {
    const code = toFailureCode(body?.error?.code, 'save_invalid');
    return {
      kind: 'terminal',
      code,
      message: messageOf(body, response.status),
      // §4: `save_invalid`/`save_rejected` stop uploading *this document*;
      // `schema_unsupported` means the client is newer than the server, so it
      // stops cloud sync for the session.
      keepSyncing: code === 'save_invalid' || code === 'save_rejected',
    };
  }

  if (response.status === 403) {
    return { kind: 'terminal', code: 'forbidden', message: messageOf(body, response.status), keepSyncing: false };
  }
  if (response.status === 413) {
    return { kind: 'terminal', code: 'payload_too_large', message: messageOf(body, response.status), keepSyncing: false };
  }

  return {
    kind: 'terminal',
    code: toFailureCode(body?.error?.code, 'malformed_request'),
    message: messageOf(body, response.status),
    keepSyncing: false,
  };
}
