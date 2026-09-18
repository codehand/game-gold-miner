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
 *    Step 24 the only writer of `save_audit`, and Step 28 the only writer of
 *    `leaderboard_entries` — upload's accept path legitimately needs it for
 *    all three — `tests/unit/server-stack.test.ts`'s "never reads the
 *    service-role key" blanket check has its own `save-sync` exception for
 *    exactly this reason, mirroring the one it already carries for
 *    `telegram-sign-in`.
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
  LIFETIME_GOLD_BOARD_KEY,
  calculateLifetimeGoldEarned,
  calculateOfflineGrant,
  deserializeSaveDocument,
  evaluateProgressBound,
  SaveDocumentError,
  toLeaderboardMagnitude,
  validateSaveDocument,
} from '../_shared/generated/core-bundle.js';
import {
  corsHeaders,
  corsPreflightResponse,
  declaredBodyBytes,
  discardRequestBody,
  errorResponse,
  jsonResponse,
  MAX_REQUEST_BODY_BYTES,
} from '../_shared/http.ts';
import {
  addressRateLimitKey,
  createFixedWindowRateLimiter,
  createInMemoryRateLimitStore,
  extractCallerAddress,
  rateLimitedResponse,
  userRateLimitKey,
  type RateLimiter,
} from '../_shared/rateLimit.ts';

const FUNCTION_ROUTE_PREFIX = '/save-sync';
const PLATFORM_ROUTE_PREFIX = '/functions/v1';
const HEALTH_ROUTE = '/v1/health';
const SAVE_ROUTE = '/v1/save';
/**
 * §3 of the protocol: capped before parsing, not to constrain a real save
 * (~3–4 KB) but to refuse an oversized body cheaply. Step 25 moved the number
 * itself to `../_shared/http.ts` (`MAX_REQUEST_BODY_BYTES`) so `save-sync`,
 * `telegram-sign-in` and `recovery-code` carry the identical cap instead of
 * three copies that could drift; this name stays because it is what §10.3 and
 * the tests here call it.
 */
const MAX_SAVE_BODY_BYTES = MAX_REQUEST_BODY_BYTES;

/**
 * Step 25's upload limits, derived from §9's own cadence rather than chosen.
 *
 * §9 (decision D5) fixes the honest upload traffic a session may produce:
 * at most **one routine upload per 60 seconds**, plus **forced uploads that
 * ignore the interval** (a `pagehide`/`visibilitychange` lifecycle flush, a
 * claimed offline reward, and once after boot reconcile when local is ahead of
 * cloud), plus a **1/2/4/8/16 s retry ladder of at most five retries per
 * trigger** — six requests including the initial one.
 *
 * Worst case a single session can therefore produce inside one 60-second
 * window, counted from §9 alone:
 *
 *   3 forced triggers × 6 requests (initial + five retries)   = 18
 *   + 1 routine upload that came due                          =  1
 *                                                             ----
 *                                                              19
 *
 * 60 admits that burst with more than 3× headroom — so a player who
 * backgrounds the tab repeatedly, claims an offline reward and reloads is
 * never throttled — while still capping one session at one request per second.
 * A limit tighter than ~19 would refuse an honest player, which design
 * constraint 2 calls a defect rather than a policy choice.
 * `index.test.ts`'s §9 cadence test replays the 19-request burst against this
 * exact number and pins the next request as refused, so it cannot drift
 * silently in either direction.
 */
export const SAVE_UPLOAD_MAX_PER_USER = 60;
/**
 * The coarse backstop behind the per-user limit, and deliberately much
 * looser (10× the per-user budget). Two things make it so: a shared address
 * legitimately carries many real players (an office NAT, a household), and the
 * local stack's own integration suite is observed as **one** address for its
 * whole run — TASK-002 recorded that consequence, and a tight per-address
 * limit here would fail unrelated suites with `429`. Its job is the case the
 * per-user limit cannot see: unauthenticated floods and one machine minting
 * many guest accounts in a row (threat model §4.6). See
 * `memory-bank/architecture.md`'s Step 25 section for the honesty note about
 * what an in-memory, per-worker limit can and cannot promise.
 */
export const SAVE_UPLOAD_MAX_PER_ADDRESS = 600;
/**
 * The download half of §9's cadence. A boot reconcile downloads exactly once,
 * and a player reloading a handful of times must not be throttled; 60/min per
 * user matches the upload budget while being far above the ~1/min a real
 * client produces. A download is one indexed read through the caller's own
 * RLS policy (`saves_select_own`) and costs no service-role round trip, so the
 * address backstop does less work here and stays loose for the same
 * shared-address reason.
 */
export const SAVE_DOWNLOAD_MAX_PER_USER = 60;
export const SAVE_DOWNLOAD_MAX_PER_ADDRESS = 600;
/** One window for all four limiters: §9's cadence is expressed per minute, and `Retry-After` on a refusal is therefore at most 60. */
export const SAVE_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * The four limiters the two save routes consult. Grouped rather than added as
 * four flat deps so a test can substitute one seeded limiter without
 * restating the other three, and built by a factory so `index.test.ts` can
 * drive the *real* configuration with an injected clock (Step 25's AC4/AC7)
 * instead of re-declaring the numbers.
 *
 * Each limiter owns its own store. Two limiters sharing one store would also
 * share a bucket for any key they have in common — an `address:` key is
 * literally the same string on the upload and download paths — so separate
 * stores are what makes "upload budget" and "download budget" independent
 * rather than one budget spent twice.
 */
export interface SaveSyncRateLimiters {
  readonly uploadByAddress: RateLimiter;
  readonly uploadByUser: RateLimiter;
  readonly downloadByAddress: RateLimiter;
  readonly downloadByUser: RateLimiter;
}

export function createSaveSyncRateLimiters(
  options: { readonly clockMs?: () => number } = {},
): SaveSyncRateLimiters {
  const clockMs = options.clockMs ?? Date.now;
  const limiter = (limit: number): RateLimiter =>
    createFixedWindowRateLimiter({
      limit,
      windowMs: SAVE_RATE_LIMIT_WINDOW_MS,
      clockMs,
      store: createInMemoryRateLimitStore(),
    });

  return {
    uploadByAddress: limiter(SAVE_UPLOAD_MAX_PER_ADDRESS),
    uploadByUser: limiter(SAVE_UPLOAD_MAX_PER_USER),
    downloadByAddress: limiter(SAVE_DOWNLOAD_MAX_PER_ADDRESS),
    downloadByUser: limiter(SAVE_DOWNLOAD_MAX_PER_USER),
  };
}

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

/**
 * Server-milestone Step 28: leaderboard writes.
 *
 * Step 27 designed the metric, the board, and the tie-break, and left the
 * pure conversion in `src/core/leaderboard/leaderboardMetric.ts`
 * (`calculateLifetimeGoldEarned`, `toLeaderboardMagnitude`) — nothing there
 * writes a row. This is that writer: it publishes one `leaderboard_entries`
 * row, keyed `(board_key, user_id)`, **only** from a document
 * `handleSaveUpload` has already accepted (past Step 23's bound, past
 * validation, past the revision compare-and-swap). A save this function
 * rejects for any reason never reaches this type at all.
 */
export interface LeaderboardEntryToWrite {
  readonly userId: string;
  readonly boardKey: string;
  readonly displayName: string | null;
  readonly metricExact: string;
  readonly metricLog10: number;
  readonly sourceRevision: number;
}

/**
 * Best-effort, exactly like {@link WriteSaveAudit}: a publish failure must
 * never turn an accepted save into a rejected response or lose the player's
 * game. `leaderboard_entries`' RLS grants no client role any write at all, so
 * only the service-role path here can ever populate it.
 */
export type WriteLeaderboardEntry = (entry: LeaderboardEntryToWrite) => Promise<void>;

/**
 * The caller's own `display_name`, snapshotted at publish time. Reading it
 * needs no elevated privilege — `profiles_select_own` already admits the
 * caller's own row through their own bearer token — and a lookup failure is
 * swallowed by the same best-effort publish this feeds, consistent with the
 * column's own nullable contract.
 */
export type ReadDisplayName = (userId: string, bearerToken: string) => Promise<string | null>;

/**
 * Step 25 (AC5): reading and parsing the body are collaborators, not inline
 * `request.text()`/`JSON.parse` calls, so a unit test can prove that an
 * oversized body is refused **before** either runs — by asserting an injected
 * parse collaborator was never called, rather than by reading the source order
 * and trusting it. `index.test.ts` injects a parser that throws if reached.
 */
export type ReadSaveBody = (request: Request) => Promise<string>;
export type ParseSaveBody = (rawBody: string) => unknown;

export interface SaveSyncDeps {
  readonly resolveCaller: ResolveCaller;
  readonly readCurrentSave: ReadCurrentSave;
  readonly writeSaveRow: WriteSaveRow;
  readonly writeSaveAudit: WriteSaveAudit;
  /** Step 28: publishes the accepted write's leaderboard entry — never called for a rejected or unvalidated save. */
  readonly writeLeaderboardEntry: WriteLeaderboardEntry;
  /** Step 28: the caller's own `profiles.display_name`, snapshotted for the published entry. */
  readonly readDisplayName: ReadDisplayName;
  /** Step 25: the per-address/per-user limits both save routes consult — see `createSaveSyncRateLimiters`. */
  readonly rateLimit: SaveSyncRateLimiters;
  readonly readSaveBody: ReadSaveBody;
  readonly parseSaveBody: ParseSaveBody;
}

/**
 * §10.3 `PUT /v1/save`. Every wire shape, error code, and HTTP status below
 * is taken literally from `memory-bank/server-save-sync-protocol.md` §3–§5
 * and §10.3 — this function invents none of it.
 */
async function handleSaveUpload(request: Request, deps: SaveSyncDeps, origin: string | null): Promise<Response> {
  // Step 25 (design constraint 2): the request path refuses in one documented
  // order — CORS preflight (answered by the router before this function, per
  // F11) → declared-size refusal → rate-limit refusal → authentication → body
  // read → parse → validate → Step 23 bound → write. A guard that runs after
  // the work it exists to prevent is not a guard, so each refusal below is
  // placed above everything it is meant to spare.
  //
  // Cheap first: a truthful `Content-Length` refuses an oversized body before
  // buffering it at all, and — because it now precedes authentication — before
  // any `save_audit` row can exist for the attempt. That is the same bound on
  // Step 24's L2 amplification the rate-limit refusals add: an oversized
  // request costs one header read and nothing else. Not authoritative on its
  // own (chunked transfer encoding omits the header entirely, and nothing
  // stops a client lying about it), so the post-read check below still runs
  // regardless of what this one finds.
  const declaredLength = declaredBodyBytes(request);
  if (declaredLength !== null && declaredLength > MAX_SAVE_BODY_BYTES) {
    // Discard what the client has already sent before answering, so it can actually
    // read this refusal — see `discardRequestBody`. Still never buffered, never parsed.
    await discardRequestBody(request);
    return errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_SAVE_BODY_BYTES} bytes.`, { origin });
  }

  // Per-address before authentication, because a caller that never
  // authenticates still costs this function work and has no user id to bucket
  // by. §10.2's 429 shape, never surfaced to the player (§4: "Never surfaced —
  // it is self-healing").
  const addressDecision = await deps.rateLimit.uploadByAddress.check(
    addressRateLimitKey(extractCallerAddress(request)),
  );
  if (!addressDecision.allowed) {
    return rateLimitedResponse(origin, addressDecision.retryAfterSeconds);
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const caller = await deps.resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  // Per-user after authentication — it needs the id the token resolves to —
  // and deliberately **before** any audit write. A `429` therefore records no
  // `save_audit` row, which is what bounds Step 24's L2
  // (1 request → 1 service-role audit write): a flood is refused here instead
  // of growing the table without bound. Stated in
  // `memory-bank/architecture.md`'s Step 25 section as well.
  const userDecision = await deps.rateLimit.uploadByUser.check(userRateLimitKey(caller.userId));
  if (!userDecision.allowed) {
    return rateLimitedResponse(origin, userDecision.retryAfterSeconds);
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

  let rawBody: string;
  try {
    rawBody = await deps.readSaveBody(request);
  } catch (error) {
    // Step 24 (review finding L3): a client that aborts mid-body must still be
    // recorded rather than escaping as an unaudited 500.
    return await serverError(error);
  }
  // The authoritative size check, and still before any parse: `Content-Length`
  // can be omitted (chunked) or simply lied about, so the bytes actually
  // received are what decide. Step 25's AC5 asserts this ordering with an
  // injected parse collaborator that is never called for an oversized body.
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
    parsedBody = deps.parseSaveBody(rawBody);
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

  // Step 28: publish only from this accepted write — every reject above
  // returns before this line is ever reached, which is what keeps a rejected
  // or unvalidated save off the board.
  await publishLeaderboardEntry(deps, {
    userId: caller.userId,
    bearerToken: token,
    revision,
    documentJson: validatedDocumentJson,
  });

  return jsonResponse(200, { revision, receivedAt }, origin);
}

/**
 * Step 28: publishes one `leaderboard_entries` row from a document
 * `handleSaveUpload` has already accepted. Best-effort like
 * {@link recordSaveAudit}: a failure anywhere in this function — computing the
 * metric, reading the display name, or the write itself — is logged and must
 * never turn the already-`200`-decided upload into anything else, and must
 * never lose the player's save.
 *
 * A zero or negative lifetime-gold-earned total (a brand-new account with no
 * completed warehouse conversion or offline claim yet) makes
 * `toLeaderboardMagnitude` throw by design — caught here the same as any
 * other failure, so a fresh account simply publishes nothing yet rather than
 * ranking with an invalid entry.
 */
async function publishLeaderboardEntry(
  deps: SaveSyncDeps,
  params: {
    readonly userId: string;
    readonly bearerToken: string;
    readonly revision: number;
    readonly documentJson: string;
  },
): Promise<void> {
  try {
    const state = deserializeState(params.documentJson);
    const magnitude = toLeaderboardMagnitude(calculateLifetimeGoldEarned(state));
    const displayName = await deps.readDisplayName(params.userId, params.bearerToken);

    await deps.writeLeaderboardEntry({
      userId: params.userId,
      boardKey: LIFETIME_GOLD_BOARD_KEY,
      displayName,
      metricExact: magnitude.exact,
      metricLog10: magnitude.log10,
      sourceRevision: params.revision,
    });
  } catch (error) {
    console.error('save-sync: publishing leaderboard entry failed.', error);
  }
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
  // Step 25: the same order design constraint 2 fixes for the upload path —
  // address limit (no body exists on a GET, so there is no size refusal to
  // precede it) → authentication → user limit → the read.
  const addressDecision = await deps.rateLimit.downloadByAddress.check(
    addressRateLimitKey(extractCallerAddress(request)),
  );
  if (!addressDecision.allowed) {
    return rateLimitedResponse(origin, addressDecision.retryAfterSeconds);
  }

  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const caller = await deps.resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  const userDecision = await deps.rateLimit.downloadByUser.check(userRateLimitKey(caller.userId));
  if (!userDecision.allowed) {
    return rateLimitedResponse(origin, userDecision.retryAfterSeconds);
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

/**
 * The caller's own `display_name`, read through their own token exactly as
 * `whoami-check/index.ts` reads it — `profiles_select_own` already admits it,
 * so no elevated privilege is needed here. A missing row or read error is
 * surfaced by throwing, which `publishLeaderboardEntry`'s own catch already
 * treats as "skip publishing this round", matching `display_name`'s own
 * nullable contract.
 */
async function readDisplayNameViaOwnToken(userId: string, bearerToken: string): Promise<string | null> {
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
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`save-sync: reading profiles.display_name failed: ${error.message}`);
  }

  return (data?.display_name as string | null | undefined) ?? null;
}

/**
 * Step 28: the only writer of `leaderboard_entries`. That table's RLS admits
 * every client role a read of its allowed columns and no write at all (Step
 * 3/27's matrix), so publishing needs the service role exactly as `saves` and
 * `save_audit` do — the third and last place in this function that reads it.
 *
 * An upsert keyed on the table's own primary key (`board_key`, `user_id`) is
 * safe here, unlike the blind upsert Step 15's review found and fixed for
 * `saves`: there is no shared counter to race over — this is one caller
 * publishing a snapshot of their own metric — so a retried or repeated accept
 * simply overwrites with that same caller's latest value.
 */
async function writeLeaderboardEntryViaServiceRole(entry: LeaderboardEntryToWrite): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('save-sync: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from('leaderboard_entries').upsert(
    {
      board_key: entry.boardKey,
      user_id: entry.userId,
      display_name: entry.displayName,
      metric_exact: entry.metricExact,
      metric_log10: entry.metricLog10,
      source_revision: entry.sourceRevision,
    },
    { onConflict: 'board_key,user_id' },
  );

  if (error) {
    throw new Error(`save-sync: writing leaderboard_entries row failed: ${error.message}`);
  }
}

/** The real body reader — `deps.readSaveBody` exists so a test can prove it is never reached for a body the declared-size check already refused (AC5), not because a second implementation was ever wanted. */
async function readSaveBodyFromRequest(request: Request): Promise<string> {
  return await request.text();
}

function parseSaveBodyJson(rawBody: string): unknown {
  return JSON.parse(rawBody);
}

/**
 * Real collaborators by default — `Deno.serve` below never passes an override.
 *
 * `createSaveSyncRateLimiters()` runs once at module scope, so the limiters'
 * stores live for as long as this worker does. That is the honest scope
 * recorded in `memory-bank/architecture.md`'s Step 25 section: the limits are
 * per worker, best-effort, and an attacker with parallelism (or one who waits
 * for a recycled worker) sees a higher effective ceiling — the position
 * threat model §4.6 already takes. `Date.now` is the default clock here and
 * nowhere else in the limiters.
 */
const defaultSaveSyncDeps: SaveSyncDeps = {
  resolveCaller: resolveCallerViaSupabaseAuth,
  readCurrentSave: readCurrentSaveRow,
  writeSaveRow: writeSaveRowViaServiceRole,
  writeSaveAudit: writeSaveAuditViaServiceRole,
  writeLeaderboardEntry: writeLeaderboardEntryViaServiceRole,
  readDisplayName: readDisplayNameViaOwnToken,
  rateLimit: createSaveSyncRateLimiters(),
  readSaveBody: readSaveBodyFromRequest,
  parseSaveBody: parseSaveBodyJson,
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
