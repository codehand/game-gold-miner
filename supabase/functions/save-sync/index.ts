/**
 * `save-sync` Edge Function — Cat Mine Idle server milestone.
 *
 * This function is the single HTTP surface for the save-sync contract in
 * `memory-bank/server-save-sync-protocol.md`. Step 4 landed §10.1
 * `GET /v1/health`; Step 16 added §10.3 `PUT /v1/save` (upload); Step 17
 * adds §10.2 `GET /v1/save` (download) below, reusing the router, the error
 * envelope, and the error vocabulary established here rather than inventing
 * a second contract.
 *
 * Deployed path: `/functions/v1/save-sync/v1/health`. The leading
 * `/functions/v1/save-sync` is platform routing; everything after it is this
 * function's own versioned path.
 *
 * Two properties this file must keep:
 *
 * 1. The health path never reads the service-role key. `/v1/save` is
 *    different: Step 15 makes the service role the only writer of `saves`,
 *    so upload's accept path legitimately needs it — `tests/unit/server-stack.test.ts`'s
 *    "never reads the service-role key" blanket check has its own
 *    `save-sync` exception for exactly this reason, mirroring the one it
 *    already carries for `telegram-sign-in`.
 * 2. Failures use the §4 envelope with a code from the §4 vocabulary. That
 *    vocabulary has no `not_found` and no `method_not_allowed`, so a request
 *    for a path or method the contract does not define is a client bug and is
 *    answered `malformed_request` / 400.
 *
 * Server-milestone Step 7 added `index.test.ts`, unit-testing
 * `resolveFunctionRoute` and `handleRequest` by importing them directly — the
 * pure-handler half of the harness Step 7 establishes; see
 * `whoami-check/index.ts` for the fuller pattern with an injected
 * authentication collaborator. The response envelope moved to
 * `../_shared/http.ts` for reuse rather than being redefined per function.
 *
 * Step 16's `handleRequest` takes an optional `SaveSyncDeps` — real
 * collaborators by default (`Deno.serve` below never passes an override),
 * fakes in `index.test.ts` — the same injected-collaborator split
 * `telegram-sign-in/index.ts`'s `handleTelegramSignIn` established. Existing
 * calls to `handleRequest(request)` for `/v1/health` and unknown routes never
 * touch `deps` at all, so they are unaffected by this addition.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  BASE_GAME_BALANCE,
  CURRENT_SAVE_SCHEMA_VERSION,
  GameNumber,
  calculateOfflineGrant,
  deserializeSaveDocument,
  evaluateProgressBound,
  SaveDocumentError,
  validateSaveDocument,
} from '../_shared/generated/core-bundle.js';
import { corsHeaders, corsPreflightResponse, errorResponse, jsonResponse } from '../_shared/http.ts';

const FUNCTION_ROUTE_PREFIX = '/save-sync';
const PLATFORM_ROUTE_PREFIX = '/functions/v1';
const HEALTH_ROUTE = '/v1/health';
const SAVE_ROUTE = '/v1/save';
/** §3 of the protocol: capped before parsing, not to constrain a real save (~3–4 KB) but to refuse an oversized body cheaply. */
const MAX_SAVE_BODY_BYTES = 65_536;

/** A liveness probe must not hang a request behind an unreachable database. */
const DATABASE_PROBE_TIMEOUT_MS = 2_000;
/**
 * `Retry-After` for a retryable failure. §4 pairs the header with `429` and
 * `503` — the client is told to wait for it, so the response has to carry it.
 */
const RETRY_AFTER_SECONDS = 5;

/**
 * Reduces a request URL to this function's own route, so the handler matches
 * the paths written in the protocol document rather than the deployed prefix.
 */
export function resolveFunctionRoute(requestUrl: string): string {
  let path = new URL(requestUrl).pathname;

  if (path.startsWith(PLATFORM_ROUTE_PREFIX)) {
    path = path.slice(PLATFORM_ROUTE_PREFIX.length);
  }
  if (path.startsWith(FUNCTION_ROUTE_PREFIX)) {
    path = path.slice(FUNCTION_ROUTE_PREFIX.length);
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path === '' ? '/' : path;
}

/**
 * Proves the database is reachable through the same pooled path a save read
 * would take. PostgREST holds the connection pool and answers 503 when the
 * database is down, so its root document is a real round trip rather than a
 * self-report. The anon key is used deliberately: see the file header.
 *
 * Step 16 replaces this with a query against `saves` once that table exists;
 * until then no table does, so no narrower probe is available.
 */
type DatabaseProbeResult = 'ok' | 'unreachable' | 'misconfigured';

async function probeDatabase(): Promise<DatabaseProbeResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    console.error('save-sync health: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
    return 'misconfigured';
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: anonKey, accept: 'application/json' },
      signal: AbortSignal.timeout(DATABASE_PROBE_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.ok ? 'ok' : 'unreachable';
  } catch (error) {
    console.error('save-sync health: database probe failed.', error);
    return 'unreachable';
  }
}

async function handleHealth(): Promise<Response> {
  const probe = await probeDatabase();

  // A missing environment variable is deliberately not `service_unavailable`.
  // That code means "this will work again, keep retrying"; a function deployed
  // without its configuration never will, so answering it would have every
  // client back off forever against a database that is perfectly healthy.
  if (probe === 'misconfigured') {
    return errorResponse(500, 'server_error', 'Function is not configured.');
  }

  if (probe === 'unreachable') {
    return errorResponse(503, 'service_unavailable', 'Database unreachable.', {
      retryAfterSeconds: RETRY_AFTER_SECONDS,
    });
  }

  return jsonResponse(200, {
    status: 'ok',
    serverTime: new Date().toISOString(),
  });
}

/** Extracts the token from `Authorization: Bearer <token>` — identical to `whoami-check/index.ts`'s helper; each Edge Function owns this small a piece rather than sharing it, matching that file's own precedent. */
function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match === null ? null : match[1];
}

export interface AuthenticatedCaller {
  readonly userId: string;
}

export type ResolveCaller = (bearerToken: string) => Promise<AuthenticatedCaller | null>;

/** One stored row of `saves`, as read back for the concurrency check (§5) and the previous-generation shift. */
export interface StoredSaveRow {
  readonly revision: number;
  readonly documentJson: string;
  readonly receivedAt: string;
  /**
   * One generation of rollback (Step 3's shape). Step 23 uses it as the most
   * recent common ancestor the server still holds: a document that resolved a
   * §7 conflict was produced on a branch that diverged from here, not from
   * `documentJson`.
   */
  readonly previousDocumentJson: string | null;
  readonly previousReceivedAt: string | null;
}

export type ReadCurrentSave = (userId: string, bearerToken: string) => Promise<StoredSaveRow | null>;

export interface SaveRowToWrite {
  readonly revision: number;
  readonly schemaVersion: number;
  readonly documentJson: string;
  readonly receivedAt: string;
  readonly previousRevision: number | null;
  readonly previousDocumentJson: string | null;
  readonly previousReceivedAt: string | null;
}

/**
 * Applies `row` as a compare-and-swap against whatever the caller's prior
 * read observed (`row.previousRevision`), not a blind write: resolves
 * `true` when it actually took effect and `false` when a concurrent upload
 * already moved the row out from under it. See the real implementation,
 * `writeSaveRowViaServiceRole`, for why a read-check-write here (an earlier,
 * fixed defect) is not atomic and this must be.
 */
export type WriteSaveRow = (userId: string, row: SaveRowToWrite) => Promise<boolean>;

/**
 * Server-milestone Step 24: one `save_audit` row per `PUT /v1/save` attempt.
 *
 * The table was designed at Step 3 and already exists; Step 24 is the writer.
 * Every field exists to tell a bug from an attack later: the outcome and error
 * code, the client's claimed `baseRevision`, the server's resulting revision,
 * the body size, and `clientReportedAt` — the client's *own* clock, recorded
 * and never trusted, so a device-clock attack shows up as a divergence from
 * `occurred_at`. `detail` holds the server-authored reason (a bound violation,
 * a validation message, a conflict's server revision).
 */
export interface SaveAuditEntry {
  readonly userId: string;
  readonly outcome: 'accepted' | 'rejected';
  readonly errorCode: string | null;
  readonly baseRevision: number | null;
  readonly resultingRevision: number | null;
  readonly documentBytes: number;
  readonly clientReportedAt: string | null;
  readonly detail: Record<string, unknown> | null;
}

/**
 * Best-effort: an audit write failing must never turn an otherwise-good upload
 * into a rejected one, or lose the player's save, so the caller logs and moves
 * on. The `save_audit` RLS grants no client access at all, so only the
 * service-role writer can reach it.
 */
export type WriteSaveAudit = (entry: SaveAuditEntry) => Promise<void>;

export interface SaveSyncDeps {
  readonly resolveCaller: ResolveCaller;
  readonly readCurrentSave: ReadCurrentSave;
  readonly writeSaveRow: WriteSaveRow;
  readonly writeSaveAudit: WriteSaveAudit;
}

/**
 * §10.3 `PUT /v1/save`. Every wire shape, error code, and HTTP status below
 * is taken literally from `memory-bank/server-save-sync-protocol.md` §3–§5
 * and §10.3 — this function invents none of it.
 */
async function handleSaveUpload(request: Request, deps: SaveSyncDeps, origin: string | null): Promise<Response> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const caller = await deps.resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  // Step 24: every outcome past authentication writes exactly one `save_audit`
  // row. The fields fill in as the request is understood; an early rejection
  // records what is known rather than nothing.
  const auditContext: {
    baseRevision: number | null;
    documentBytes: number;
    clientReportedAt: string | null;
    clientClockOutOfRangeMs: number | null;
  } = {
    baseRevision: null,
    documentBytes: 0,
    clientReportedAt: null,
    clientClockOutOfRangeMs: null,
  };

  const reject = async (
    response: Response,
    errorCode: string,
    detail: Record<string, unknown> | null,
  ): Promise<Response> => {
    await recordSaveAudit(deps, {
      userId: caller.userId,
      outcome: 'rejected',
      errorCode,
      resultingRevision: null,
      baseRevision: auditContext.baseRevision,
      documentBytes: auditContext.documentBytes,
      clientReportedAt: auditContext.clientReportedAt,
      detail: withClientClockNote(detail, auditContext.clientClockOutOfRangeMs),
    });
    return response;
  };

  // Step 24 (review finding M1): a collaborator throwing — a database error in
  // the read or the compare-and-swap write, or any other unexpected bug — is
  // itself an outcome that must be recorded, or a repeated crash (or a hunt for
  // one) leaves `save_audit` empty exactly where the evidence matters most. The
  // audit write is best-effort, so it cannot mask the 500 it records.
  const serverError = async (error: unknown): Promise<Response> => {
    console.error('save-sync: unexpected error handling an upload.', error);
    return await reject(
      errorResponse(500, 'server_error', 'Unexpected server error.', { origin }),
      'server_error',
      { error: error instanceof Error ? error.name : 'UnknownError' },
    );
  };

  // Cheap first: a truthful `Content-Length` refuses an oversized body
  // before buffering it at all. Not authoritative on its own — chunked
  // transfer encoding omits the header entirely, and nothing stops a client
  // from lying about it — so the post-read check below still runs
  // regardless of what this one finds.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SAVE_BODY_BYTES) {
    auditContext.documentBytes = clampDocumentBytes(declaredLength);
    return await reject(
      errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_SAVE_BODY_BYTES} bytes.`, { origin }),
      'payload_too_large',
      { limitBytes: MAX_SAVE_BODY_BYTES, declaredBytes: clampDocumentBytes(declaredLength) },
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    // Step 24 (review finding L3): a client that aborts mid-body must still be
    // recorded rather than escaping as an unaudited 500.
    return await serverError(error);
  }
  const bodyBytes = new TextEncoder().encode(rawBody).length;
  auditContext.documentBytes = bodyBytes;
  if (bodyBytes > MAX_SAVE_BODY_BYTES) {
    return await reject(
      errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_SAVE_BODY_BYTES} bytes.`, { origin }),
      'payload_too_large',
      { limitBytes: MAX_SAVE_BODY_BYTES },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return await reject(
      errorResponse(400, 'malformed_request', 'Body is not valid JSON.', { origin }),
      'malformed_request',
      { reason: 'Body is not valid JSON.' },
    );
  }

  if (
    typeof parsedBody !== 'object' ||
    parsedBody === null ||
    !('document' in parsedBody) ||
    !('baseRevision' in parsedBody)
  ) {
    return await reject(
      errorResponse(400, 'malformed_request', 'Body is not an object with document and baseRevision.', {
        origin,
      }),
      'malformed_request',
      { reason: 'Body is not an object with document and baseRevision.' },
    );
  }

  const { document, baseRevision } = parsedBody as { document: unknown; baseRevision: unknown };
  // §5: "a monotonic integer… the revision the client last received, or null".
  // Anything else is a client bug (§4 `malformed_request`). Validating here,
  // before the row reads that follow, also keeps a poisoned value out of the
  // audit's typed `base_revision` column: a fractional or out-of-int8 value
  // would abort the `save_audit` insert and leave the attempt unrecorded
  // (review finding H2).
  if (!isValidBaseRevision(baseRevision)) {
    return await reject(
      errorResponse(400, 'malformed_request', 'baseRevision must be null or a positive integer.', { origin }),
      'malformed_request',
      { reason: 'baseRevision must be null or a positive integer.' },
    );
  }
  auditContext.baseRevision = baseRevision;
  const clientClock = readClientClock(document);
  auditContext.clientReportedAt = clientClock.reportedAt;
  auditContext.clientClockOutOfRangeMs = clientClock.outOfRangeMs;

  const schemaVersion =
    typeof document === 'object' && document !== null && 'schemaVersion' in document
      ? (document as { schemaVersion: unknown }).schemaVersion
      : undefined;
  // §4 defines `schema_unsupported` as "the client is newer than the server",
  // so only a version *above* the current one is refused here. An older
  // version is deliberately passed through to `validateSaveDocument`, which
  // runs the shared `migrateSaveDocument` (version 1 → 2) the client bundle
  // already ships — refusing it would make this function stricter than the
  // shared chain it exists to reuse and would reject a Step 16/17-written row.
  if (typeof schemaVersion !== 'number' || schemaVersion > CURRENT_SAVE_SCHEMA_VERSION) {
    return await reject(
      errorResponse(422, 'schema_unsupported', `Unsupported schemaVersion ${String(schemaVersion)}.`, {
        detail: { supported: [CURRENT_SAVE_SCHEMA_VERSION] },
        origin,
      }),
      'schema_unsupported',
      { supported: [CURRENT_SAVE_SCHEMA_VERSION] },
    );
  }

  let validatedDocumentJson: string;
  try {
    const validated = validateSaveDocument(document, BASE_GAME_BALANCE);
    validatedDocumentJson = JSON.stringify(validated);
  } catch (error) {
    if (error instanceof SaveDocumentError) {
      return await reject(
        errorResponse(422, 'save_invalid', 'Document failed validation.', {
          detail: { reason: error.message },
          origin,
        }),
        'save_invalid',
        { reason: error.message },
      );
    }
    return await serverError(error);
  }

  let current: Awaited<ReturnType<typeof deps.readCurrentSave>>;
  try {
    current = await deps.readCurrentSave(caller.userId, token);
  } catch (error) {
    return await serverError(error);
  }
  const storedRevision = current?.revision ?? null;

  if (baseRevision !== storedRevision) {
    let response: Response;
    try {
      response = revisionConflictResponse(current, origin);
    } catch (error) {
      // Only reachable if a row this function itself wrote was corrupted
      // out-of-band; recorded rather than escaping unaudited (L3).
      return await serverError(error);
    }
    return await reject(response, 'revision_conflict', { serverRevision: storedRevision });
  }

  // Server-milestone Step 23: bound what this document may claim over the
  // server-measured elapsed time since the last accepted document. A first
  // upload has no last accepted document to bound against and is deliberately
  // accepted: it is how a brand-new account — and Step 20's adoption of a save
  // a player earned before the account existed — seeds its cloud save. Rejected
  // documents never reach the row; the stored revision is unchanged. See
  // `memory-bank/architecture.md`'s Step 23 section for the modelling rule and
  // the tolerance's size.
  const boundViolation = findProgressBoundViolation(current, validatedDocumentJson);
  if (boundViolation !== null) {
    return await reject(
      errorResponse(422, 'save_rejected', 'Claimed progress exceeds what the elapsed time allows.', {
        detail: { ...boundViolation },
        origin,
      }),
      'save_rejected',
      { ...boundViolation },
    );
  }

  const receivedAt = new Date().toISOString();
  const revision = (current?.revision ?? 0) + 1;

  let applied: boolean;
  try {
    applied = await deps.writeSaveRow(caller.userId, {
      revision,
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      documentJson: validatedDocumentJson,
      receivedAt,
      previousRevision: current?.revision ?? null,
      previousDocumentJson: current?.documentJson ?? null,
      previousReceivedAt: current?.receivedAt ?? null,
    });
  } catch (error) {
    return await serverError(error);
  }

  if (!applied) {
    // Lost a race against a concurrent upload that wrote between the read
    // above and this write — re-read so the conflict carries the actual
    // winner's document, not the snapshot this request lost against.
    let afterRace: Awaited<ReturnType<typeof deps.readCurrentSave>>;
    try {
      afterRace = await deps.readCurrentSave(caller.userId, token);
    } catch (error) {
      return await serverError(error);
    }
    let response: Response;
    try {
      response = revisionConflictResponse(afterRace, origin);
    } catch (error) {
      return await serverError(error);
    }
    return await reject(response, 'revision_conflict', {
      serverRevision: afterRace?.revision ?? null,
    });
  }

  await recordSaveAudit(deps, {
    userId: caller.userId,
    outcome: 'accepted',
    errorCode: null,
    resultingRevision: revision,
    baseRevision: auditContext.baseRevision,
    documentBytes: auditContext.documentBytes,
    clientReportedAt: auditContext.clientReportedAt,
    detail: withClientClockNote(null, auditContext.clientClockOutOfRangeMs),
  });

  return jsonResponse(200, { revision, receivedAt }, origin);
}

/**
 * Step 24: writes one audit row, swallowing (and logging) a failure. The audit
 * is evidence, not a precondition — a database hiccup while logging must not
 * reject an honest save or lose the player's game.
 */
async function recordSaveAudit(deps: SaveSyncDeps, entry: SaveAuditEntry): Promise<void> {
  try {
    await deps.writeSaveAudit(entry);
  } catch (error) {
    console.error('save-sync: writing save_audit row failed.', error);
  }
}

/**
 * The instant range `timestamptz` round-trips through the ISO-8601 string
 * `Date#toISOString` produces, which uses a four-digit year. At year 10000 and
 * beyond JS emits the extended-year form (`+010000-01-01T00:00:00.000Z`) that
 * Postgres refuses, which would abort the audit insert and erase the evidence
 * of the very clock attack `client_reported_at` exists to expose (review
 * finding H1). `Date#getTime` stays finite to ±8.64e15 ms, so the gap is real.
 */
const MIN_AUDIT_INSTANT_MS = -62_135_596_800_000; // 0001-01-01T00:00:00.000Z
const MAX_AUDIT_INSTANT_MS = 253_402_300_799_999; // 9999-12-31T23:59:59.999Z

interface ClientClockReading {
  /** The client's own claim in a form `timestamptz` accepts, or `null`. */
  readonly reportedAt: string | null;
  /** The raw millisecond value when it fell outside the round-trippable range. */
  readonly outOfRangeMs: number | null;
}

/**
 * The client's own claimed save time, recorded for later comparison with the
 * server's `occurred_at` and never trusted for any decision. Anything missing,
 * non-numeric, already unrepresentable, or outside the range a `timestamptz`
 * column can hold is recorded as absent — with the raw out-of-range value kept
 * for the audit `detail` — rather than left to abort the whole insert.
 */
function readClientClock(document: unknown): ClientClockReading {
  if (typeof document !== 'object' || document === null) {
    return { reportedAt: null, outOfRangeMs: null };
  }

  const value = (document as { savedAtTimestampMs?: unknown }).savedAtTimestampMs;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { reportedAt: null, outOfRangeMs: null };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { reportedAt: null, outOfRangeMs: null };
  }

  if (value < MIN_AUDIT_INSTANT_MS || value > MAX_AUDIT_INSTANT_MS) {
    return { reportedAt: null, outOfRangeMs: value };
  }

  return { reportedAt: date.toISOString(), outOfRangeMs: null };
}

/** Keeps an out-of-range client clock in the audit `detail` even when the instant is dropped. */
function withClientClockNote(
  detail: Record<string, unknown> | null,
  outOfRangeMs: number | null,
): Record<string, unknown> | null {
  return outOfRangeMs === null
    ? detail
    : { ...(detail ?? {}), clientReportedAtOutOfRangeMs: outOfRangeMs };
}

/**
 * §5 defines `baseRevision` as null or the monotonic integer revision the
 * client last received. A fractional, negative, or unsafe value is a client bug
 * (§4 `malformed_request`), and — because `save_audit.base_revision` is a
 * `bigint` — letting one through would abort the audit insert and lose the
 * attempt's row (review finding H2).
 */
function isValidBaseRevision(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
}

/**
 * Defense in depth for the audit's typed integer columns: anything that is not a
 * safe integer is written as `null` rather than handed to Postgres as a string
 * it will reject, so a future caller cannot reopen H2 through this writer.
 * Exported so a unit test can pin the coercion directly.
 */
export function normalizeAuditRevision(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) ? value : null;
}

/** `save_audit.document_bytes` is an `integer`; a claimed length can exceed it. */
function clampDocumentBytes(bytes: number): number {
  return Math.min(Math.max(0, Math.floor(bytes)), 2_147_483_647);
}

interface ProgressBoundDetail {
  readonly counter: string;
  readonly claimed: string;
  readonly maximum: string;
}

/**
 * Step 23's upper-bound check, adapted to the stored row shapes. Returns `null`
 * (accept) for a first upload, which has no previous document to bound against,
 * and when the previous document cannot be read well enough: the server must
 * never reject an honest save because its own stored row is unreadable.
 *
 * **Two anchors, because §7 makes forks first-class (review finding F2).** The
 * tight bound measures from the stored row's own receipt. But a device that
 * resolved a `409` re-uploads *its own* branch seconds after the branch that
 * became the stored row: that branch diverged from an older document, so
 * measuring its whole divergence against a few seconds rejects a legitimate
 * merge. The row keeps one generation of rollback, so when the tight bound
 * fails and an ancestor exists, the check is retried against that ancestor over
 * the full interval between its receipt and now. A candidate is accepted if
 * either anchor allows it.
 */
function findProgressBoundViolation(
  current: StoredSaveRow | null,
  candidateDocumentJson: string,
): ProgressBoundDetail | null {
  if (current === null) {
    return null;
  }

  try {
    const candidate = deserializeState(candidateDocumentJson);
    const nowMs = Date.now();

    const receivedAtMs = Date.parse(current.receivedAt);
    if (!Number.isFinite(receivedAtMs)) {
      // The receipt is the server's own row being unreadable, not evidence
      // against the document: skip rather than impose the strictest bound
      // (review finding F4).
      return null;
    }

    const tight = evaluateProgressBound({
      previous: deserializeState(current.documentJson),
      candidate,
      elapsedMs: nowMs - receivedAtMs,
      config: BASE_GAME_BALANCE,
    });
    if (tight === null) {
      return null;
    }

    if (
      current.previousDocumentJson !== null &&
      current.previousReceivedAt !== null
    ) {
      const previousReceivedAtMs = Date.parse(current.previousReceivedAt);
      if (Number.isFinite(previousReceivedAtMs)) {
        const loose = evaluateProgressBound({
          previous: deserializeState(current.previousDocumentJson),
          candidate,
          elapsedMs: nowMs - previousReceivedAtMs,
          config: BASE_GAME_BALANCE,
        });
        if (loose === null) {
          return null;
        }
      }
    }

    return tight;
  } catch (error) {
    console.error('save-sync upload: skipping the progress bound.', error);
    return null;
  }
}

function deserializeState(documentJson: string) {
  return deserializeSaveDocument(JSON.parse(documentJson), BASE_GAME_BALANCE)
    .state;
}

function revisionConflictResponse(current: StoredSaveRow | null, origin: string | null): Response {
  return errorResponse(409, 'revision_conflict', 'Save was updated elsewhere.', {
    detail: {
      serverRevision: current?.revision,
      receivedAt: current?.receivedAt,
      document: current ? JSON.parse(current.documentJson) : undefined,
    },
    origin,
  });
}

/**
 * §10.2 `GET /v1/save`. `200` with the stored document when one exists,
 * `204` with no body when it does not — "the normal first-sign-in path, not
 * an error," per the protocol. The read goes through the caller's own token
 * (`saves_select_own`), so it needs no elevated privilege.
 *
 * Server-milestone Step 22: the response also carries the account's
 * `offlineGrant`, computed from the stored `received_at` to this function's own
 * `now()` (§6 — "every elapsed-time calculation anchors on stored received_at →
 * server now()," decision D3). The device clock is never an input, so a client
 * reporting hours ahead, hours behind, or a backwards clock receives exactly
 * the same grant an honest client would for the same real absence. The formula,
 * cap, and efficiency come from the same `calculateOfflineGrant` the client's
 * local projection uses (`BASE_GAME_BALANCE.offlineIncome`), preserving finding
 * F4.
 */
async function handleSaveDownload(request: Request, deps: SaveSyncDeps, origin: string | null): Promise<Response> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const caller = await deps.resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  const current = await deps.readCurrentSave(caller.userId, token);
  if (current === null) {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  return jsonResponse(
    200,
    {
      revision: current.revision,
      receivedAt: current.receivedAt,
      document: JSON.parse(current.documentJson),
      offlineGrant: computeOfflineGrant(current),
    },
    origin,
  );
}

interface OfflineGrantBody {
  readonly elapsedDurationMs: number;
  readonly creditedDurationMs: number;
  readonly reward: string;
}

/**
 * The server's authoritative offline grant for one stored row, or `null` when
 * the row cannot be read well enough to compute one (defense-in-depth — the
 * upload path validates every document it stores). `Date.now()` is the
 * server's own clock; the row's `received_at` is the server's own receipt time.
 */
function computeOfflineGrant(row: StoredSaveRow): OfflineGrantBody | null {
  try {
    const document = JSON.parse(row.documentJson) as {
      readonly effectiveProductionRatePerSecond?: unknown;
    };
    const rate = GameNumber.deserialize(
      document.effectiveProductionRatePerSecond as never,
    );
    const receivedAtMs = Date.parse(row.receivedAt);

    if (!Number.isFinite(receivedAtMs)) {
      return null;
    }

    const grant = calculateOfflineGrant(
      receivedAtMs,
      Date.now(),
      rate,
      BASE_GAME_BALANCE.offlineIncome,
    );

    return {
      elapsedDurationMs: grant.elapsedDurationMs,
      creditedDurationMs: grant.creditedDurationMs,
      reward: grant.reward.serialize(),
    };
  } catch {
    return null;
  }
}

/**
 * The real `resolveCaller`: verifies the bearer token against Supabase Auth,
 * the identical shape `whoami-check/index.ts`'s `resolveCallerViaSupabaseAuth`
 * uses (anon-key client scoped to the caller's own token, `auth.getUser`).
 * Throws on missing configuration rather than returning `null` — a broken
 * deployment is not the caller's fault and must not look like a bad token.
 */
async function resolveCallerViaSupabaseAuth(bearerToken: string): Promise<AuthenticatedCaller | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('save-sync: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.auth.getUser(bearerToken);
  if (error || !data.user) {
    return null;
  }

  return { userId: data.user.id };
}

/**
 * Reads the caller's own row through `saves_select_own` — the anon-key
 * client scoped to the caller's own token, exactly as authentication above
 * uses, so this needs no elevated privilege at all.
 */
async function readCurrentSaveRow(userId: string, bearerToken: string): Promise<StoredSaveRow | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('save-sync: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await client
    .from('saves')
    .select(
      'revision, document_json, received_at, previous_document_json, previous_received_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`save-sync: reading saves row failed: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return {
    revision: data.revision,
    documentJson: data.document_json,
    receivedAt: data.received_at,
    previousDocumentJson: data.previous_document_json,
    previousReceivedAt: data.previous_received_at,
  };
}

/**
 * The only writer of `saves` (Step 15's RLS denies every client write), so
 * this is the one place in this function that legitimately needs
 * `SUPABASE_SERVICE_ROLE_KEY` — `tests/unit/server-stack.test.ts` carries a
 * named exception for `save-sync` for exactly this line.
 *
 * A blind `upsert` here was a 2026-09-12 review finding: `handleSaveUpload`
 * reads the current revision, compares it to `baseRevision`, and only then
 * calls this function — three separate round trips with no atomicity
 * between them. Two overlapping uploads can both read revision 1, both pass
 * the check, and both `upsert` revision 2, silently discarding whichever one
 * lost, with §5's "server holds one monotonic revision" guarantee broken in
 * the same stroke. Not reachable by a real player yet (Step 19's client
 * upload path is unbuilt, so only tests call this today), but the endpoint
 * is live and exactly what Step 19 will make two devices race against.
 *
 * The fix is a compare-and-swap, split by whether a row already existed at
 * read time (`row.previousRevision === null` iff it did not):
 * - **First write**: a plain `insert`. `user_id` is the primary key, so a
 *   concurrent first upload racing this one fails `23505` (unique
 *   violation) instead of silently overwriting — caught below and reported
 *   as a lost race, not a server error.
 * - **Subsequent write**: `update ... where user_id = ? and revision = ?`
 *   — atomic in Postgres — matching only the exact row this request read.
 *   A concurrent writer that already moved the revision leaves zero rows
 *   matched, detected via `.select()`'s returned count rather than assumed
 *   from the (missing) error.
 *
 * Returns whether the write actually applied, so `handleSaveUpload` can turn
 * a lost race into the `409 revision_conflict` it already knows how to
 * build, rather than the `200` a blind write would have returned to both
 * racers.
 */
async function writeSaveRowViaServiceRole(userId: string, row: SaveRowToWrite): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('save-sync: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const columns = {
    revision: row.revision,
    schema_version: row.schemaVersion,
    document_json: row.documentJson,
    received_at: row.receivedAt,
    previous_revision: row.previousRevision,
    previous_document_json: row.previousDocumentJson,
    previous_received_at: row.previousReceivedAt,
  };

  if (row.previousRevision === null) {
    const { error } = await admin.from('saves').insert({ user_id: userId, ...columns });

    if (error) {
      if (error.code === '23505') {
        return false;
      }
      throw new Error(`save-sync: writing saves row failed: ${error.message}`);
    }

    return true;
  }

  const { data, error } = await admin
    .from('saves')
    .update(columns)
    .eq('user_id', userId)
    .eq('revision', row.previousRevision)
    .select('user_id');

  if (error) {
    throw new Error(`save-sync: writing saves row failed: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Step 24: the only writer of `save_audit`. That table carries no RLS policy
 * at all (Step 3's matrix: no select/insert/update/delete for any client
 * role), so the service-role key is required here exactly as it is for
 * `saves` — and this is the second and last place in this function that reads
 * it. The insert is append-only by construction: no update or delete path
 * exists, and a unique id is generated by the table.
 */
async function writeSaveAuditViaServiceRole(entry: SaveAuditEntry): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('save-sync: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from('save_audit').insert({
    user_id: entry.userId,
    outcome: entry.outcome,
    error_code: entry.errorCode,
    base_revision: normalizeAuditRevision(entry.baseRevision),
    resulting_revision: normalizeAuditRevision(entry.resultingRevision),
    document_bytes: clampDocumentBytes(entry.documentBytes),
    client_reported_at: entry.clientReportedAt,
    detail: entry.detail,
  });

  if (error) {
    throw new Error(`save-sync: writing save_audit row failed: ${error.message}`);
  }
}

const defaultSaveSyncDeps: SaveSyncDeps = {
  resolveCaller: resolveCallerViaSupabaseAuth,
  readCurrentSave: readCurrentSaveRow,
  writeSaveRow: writeSaveRowViaServiceRole,
  writeSaveAudit: writeSaveAuditViaServiceRole,
};

export async function handleRequest(
  request: Request,
  deps: SaveSyncDeps = defaultSaveSyncDeps,
): Promise<Response> {
  const route = resolveFunctionRoute(request.url);
  const origin = request.headers.get('origin');

  if (route === HEALTH_ROUTE) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
        detail: { method: request.method, route },
      });
    }
    return await handleHealth();
  }

  if (route === SAVE_ROUTE) {
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request, 'GET, PUT, OPTIONS');
    }
    if (request.method === 'PUT') {
      return await handleSaveUpload(request, deps, origin);
    }
    if (request.method === 'GET') {
      return await handleSaveDownload(request, deps, origin);
    }
    return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
      detail: { method: request.method, route },
      origin,
    });
  }

  return errorResponse(400, 'malformed_request', 'Unknown route.', { detail: { route } });
}

// Guarded so importing this module — as `index.test.ts` does, to unit-test
// `resolveFunctionRoute` and `handleRequest` in isolation — does not also
// start a live listener. `import.meta.main` is true only when the edge
// runtime runs this file directly to serve real requests.
if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleRequest(request);
    } catch (error) {
      console.error('save-sync: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Unhandled error.');
    }
  });
}
