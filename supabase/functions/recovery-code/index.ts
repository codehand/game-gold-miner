/**
 * `recovery-code` Edge Function — server-milestone Step 14.
 *
 * The only mechanism in the milestone that survives storage loss for an
 * unlinked guest: the session token and the local save both live in
 * script-writable storage and die together in the same iOS Safari seven-day
 * sweep (decision D1, `memory-bank/server-save-sync-protocol.md` §8). A
 * cloud save alone does not rescue that guest — they come back with no save
 * *and* no credential proving which account was theirs. This function is
 * what does.
 *
 * Two routes (deployed under `/functions/v1/recovery-code/v1/...`):
 * - `POST /v1/generate` — authenticated. Issues (or rotates) a high-entropy
 *   code for the caller's own account, returning the plaintext exactly
 *   once. Never stored.
 * - `POST /v1/redeem` — unauthenticated. Recovering access *without* an
 *   existing session is the entire point, so there is no caller identity
 *   to verify here at all.
 *
 * **Code format.** 16 random bytes (`crypto.getRandomValues`, 128-bit
 * entropy), hex-encoded and grouped for readability —
 * `xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx`. The canonical form that gets
 * hashed is the 32-character lowercase hex string with every non-hex
 * character (dashes, whitespace) stripped, so a player can paste the code
 * with or without the dashes.
 *
 * **Storage.** `recovery_codes.code_hash` (Step 3/5 schema, unchanged here)
 * is an HMAC-SHA-256 hex digest of the canonical code under
 * `RECOVERY_CODE_PEPPER`, held only in this function's own configuration —
 * a database leak alone does not permit offline enumeration. The plaintext
 * code is never stored, logged, or returned after the one response that
 * issues it.
 *
 * **Rotation and redemption are both compare-and-swap, not read-then-write.**
 * `rotateRecoveryCodeViaServiceRole` revokes whatever is currently active
 * before inserting the new row — the partial unique index
 * `recovery_codes_one_active_per_user_idx` permits only one row per user with
 * both `redeemed_at` and `revoked_at` null, so the revoke must happen first.
 * `redeemRecoveryCodeViaServiceRole` is a single atomic
 * `update ... where code_hash = ? and redeemed_at is null and revoked_at is
 * null returning user_id` — applying the same lesson a 2026-09-12 review of
 * `save-sync`'s upload endpoint taught: two concurrent redemptions of the
 * same code must not both succeed, and only an atomic conditional UPDATE
 * (not a prior read) can guarantee that Postgres serializes them correctly.
 *
 * **Minting a session for the resolved `user_id`** reuses `telegram-sign-in`'s
 * `admin.generateLink`/client `verifyOtp` pattern, adapted for an id-keyed
 * rather than email-keyed lookup: `generateLink({type:'magiclink', email})`
 * finds-or-**creates** by email, so calling it blind for a pure anonymous
 * guest (who has no email at all) would silently mint a *new*, wrong
 * account. `mintSessionForUserViaGenerateLink` resolves the caller's
 * existing email first (Google-linked, or a Telegram placeholder) and only
 * assigns a deterministic `recovery-<user_id>@recovery.invalid` (via
 * `admin.updateUserById(..., {email_confirm: true})`, so no confirmation
 * email is ever sent) when the account has none — guaranteeing
 * `generateLink` *finds* the correct row rather than creating a second one.
 *
 * **Rate limiting is best-effort, and now genuinely per user and per
 * address.** Step 14 shipped a minimal in-memory, module-scoped limiter keyed
 * by caller address as an explicit interim seam; Step 25 cashed the seam in.
 * The mechanism now lives in `../_shared/rateLimit.ts`, shared with
 * `save-sync` and `telegram-sign-in`, and this function consults **two** of
 * its limiters: `redemptionByAddress` on the unauthenticated `/v1/redeem`
 * (unchanged budget — 30 per minute) and `generateByUser` on the
 * authenticated `/v1/generate` (Step 25's per-user half; see
 * `RATE_LIMIT_MAX_GENERATES_PER_USER` for why redemption cannot have one
 * before it resolves). `handleRedeem`'s and `handleGenerate`'s own bodies did
 * not have to change for this, which was the seam's whole point.
 *
 * A 2026-09-12 review finding carried over unchanged: `extractCallerAddress`
 * (now shared) reads the *last* `X-Forwarded-For` hop — the one this
 * platform's gateway appends and a client cannot forge — rather than the
 * first, client-suppliable one, so rotating a fake header no longer buys a
 * fresh bucket. Confirmed against the local stack: the gateway (Kong locally,
 * Supabase's own edge network in production) always supplies this trusted
 * hop, whether or not the client sent the header at all, so in practice every
 * real caller does get bucketed — the `null`/"no address" case only guards a
 * caller that somehow reaches this handler without passing through that
 * gateway at all, which no deployment path in this project allows today; it
 * is a defensive default, not a case this project's own traffic exercises.
 * The limiter remains a speed bump for casual abuse, not a security boundary
 * — the real backstop against brute force is the code's own 128-bit entropy
 * — which is also why the threshold is generous (30 per minute) rather than
 * tight: it costs nothing extra against a real attacker while comfortably
 * absorbing a real user's own retry bursts, or many distinct real users who
 * happen to share one observed address (an office NAT, for instance).
 *
 * **A `429` follows §10.2 exactly.** `rateLimitedResponse` (shared) emits
 * code `rate_limited`, a `Retry-After` header, and the same number inside
 * `detail.retryAfterSeconds` — the actual remaining window rather than Step
 * 14's fixed 60 — with no player-facing notice (§4's "player sees" column for
 * this row is empty).
 *
 * **A failed mint reverts the redemption rather than burning the code.**
 * `redeemRecoveryCodeViaServiceRole` marks the row redeemed *before*
 * `mintSessionForUserViaGenerateLink` runs; if minting then fails (a
 * transient `generateLink`/`updateUserById` error), the code must not be
 * left permanently spent with no session ever delivered — the account would
 * become unrecoverable. `handleRedeem` calls
 * `revertRecoveryCodeRedemption` (best-effort, its own failure only logged)
 * to clear `redeemed_at` before answering `500`, so the same code can be
 * retried.
 *
 * **The guest-upgrade collision flow needs no new code.** Once the client
 * completes `verifyOtp`, `src/main.ts` runs the exact same
 * `triggerCloudSaveReconcile()` every other sign-in path already runs —
 * the redeeming device's local IndexedDB save is untouched by the session
 * swap, so Step 17's `reconcileCloudSaveAtBoot`/`resolveSaveConflict`
 * (Step 18) compares it against the recovered account's cloud save exactly as
 * it would for a Google or Telegram sign-in.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  corsPreflightResponse,
  declaredBodyBytes,
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
  type RateLimitDecision,
  type RateLimiter,
} from '../_shared/rateLimit.ts';

const FUNCTION_ROUTE_PREFIX = '/recovery-code';
const PLATFORM_ROUTE_PREFIX = '/functions/v1';
const GENERATE_ROUTE = '/v1/generate';
const REDEEM_ROUTE = '/v1/redeem';
/**
 * A 2026-09-13 review finding: once `extractCallerAddress` reads the
 * platform gateway's own trusted hop, every request the integration suite
 * makes from one local machine shares one real rate-limit bucket — there is
 * no client-side way to opt out, by design, the same as a real deployment's
 * gateway would behave for many distinct users behind one shared address.
 * That leaves the suite's own throttle test with a bucket it fills but
 * never empties, so a re-run inside the 60-second window fails unrelated
 * tests with `429` instead of their real expectations. This route lets the
 * integration suite clear that shared bucket between runs rather than
 * requiring an undocumented cooldown. It only ever answers when
 * `RECOVERY_CODE_TEST_RESET_TOKEN` is configured — absent from every
 * environment but a local dev stack's own `supabase/functions/.env` — and a
 * caller without the matching token gets the exact same response as an
 * unknown route, so the route's own existence is not discoverable without
 * already knowing the token.
 */
const TEST_RESET_RATE_LIMIT_ROUTE = '/v1/test-only-reset-rate-limit';

/** 128-bit entropy — a machine-generated secret, not a human password; no slow hash is needed (see the hashing doc comment above). */
const CODE_BYTE_LENGTH = 16;
/** Groups the hex string for readability: `xxxx-xxxx-...`. */
const CODE_GROUP_SIZE = 4;
const RECOVERY_EMAIL_DOMAIN = 'recovery.invalid';

/**
 * Step 25 moved the mechanism into `../_shared/rateLimit.ts` — one
 * implementation shared with `save-sync` and `telegram-sign-in` instead of
 * three. The numbers and the window below are `recovery-code`'s own and are
 * unchanged from Step 14; what is new in Step 25 is the **per-user** half.
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;
/**
 * A 2026-09-12 review finding, confirmed against the live local stack: the
 * platform gateway in front of this function (Kong locally, Supabase's own
 * edge network in production) always supplies its own trusted
 * `X-Forwarded-For` hop, appended after whatever the client sent — a caller
 * genuinely cannot reach this handler with no observable address at all.
 * Every distinct real caller still gets a distinct real address in a real
 * deployment; only a single-machine local/CI run legitimately shares one.
 * 30 gives comfortable headroom for a real user's own retry bursts (mistyped
 * codes, copy/paste errors) without weakening the actual security backstop,
 * which is the code's 128-bit entropy, not this counter.
 *
 * The window's 60 seconds is also the maximum `Retry-After` this limiter can
 * report, which is the constant Step 14 answered with unconditionally; the
 * fixed-window limiter now reports the actual remainder instead.
 */
export const RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS = 30;
/**
 * Step 25's per-user half. A `/v1/generate` call is authenticated and each
 * accepted one rotates the account's only active code through the
 * `rotate_recovery_code` RPC — a revoke plus an insert in one transaction,
 * under the service role. A real player generates a code once and might
 * re-generate after losing the screenshot; 30/minute matches the redemption
 * budget and is far above any plausible legitimate retry pattern while still
 * bounding that write amplification.
 *
 * Redemption cannot have a per-user half *before* it resolves: the whole
 * point of `POST /v1/redeem` is that there is no caller identity to verify
 * until the code has already been matched, and a post-match limit would run
 * after the compare-and-swap it exists to bound. Its per-address half is the
 * meaningful one, and 128-bit entropy remains the real backstop.
 */
export const RATE_LIMIT_MAX_GENERATES_PER_USER = 30;

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

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match === null ? null : match[1];
}

// `extractCallerAddress` moved to `../_shared/rateLimit.ts` at Step 25 so all
// three limited functions read the trusted last `X-Forwarded-For` hop through
// one implementation. Its behaviour — and the reason a client-supplied first
// hop is never authority — is documented there.

async function hmacSha256(keyBytes: BufferSource, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time comparison — mirrors `telegram-sign-in/index.ts`'s
 * `timingSafeEqualHex` (no shared extraction between Edge Functions in this
 * codebase, per that file's own precedent), generalized past hex since a
 * reset token is an opaque string, not a hex digest.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

/** Strips everything but hex digits and lowercases — a player may paste a code with or without its display dashes. */
export function canonicalizeRecoveryCode(input: string): string {
  return input.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

export function generateRecoveryCodePlaintext(): string {
  const bytes = new Uint8Array(CODE_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  const hex = toHex(bytes);
  const groups: string[] = [];

  for (let index = 0; index < hex.length; index += CODE_GROUP_SIZE) {
    groups.push(hex.slice(index, index + CODE_GROUP_SIZE));
  }

  return groups.join('-');
}

export function recoveryPlaceholderEmail(userId: string): string {
  return `recovery-${userId}@${RECOVERY_EMAIL_DOMAIN}`;
}

function requireRecoveryCodePepper(): string {
  const pepper = Deno.env.get('RECOVERY_CODE_PEPPER');
  if (!pepper) {
    throw new Error('recovery-code: RECOVERY_CODE_PEPPER is not configured.');
  }
  return pepper;
}

async function hashRecoveryCode(canonicalCode: string): Promise<string> {
  const pepper = requireRecoveryCodePepper();
  return toHex(await hmacSha256(new TextEncoder().encode(pepper), canonicalCode));
}

export interface AuthenticatedCaller {
  readonly userId: string;
}

export type ResolveCaller = (bearerToken: string) => Promise<AuthenticatedCaller | null>;
/**
 * Takes the *canonical* code, not a pre-computed hash — hashing needs
 * `RECOVERY_CODE_PEPPER` from `Deno.env`, which the zero-permission-flag
 * unit test harness (`deno test` with no `--allow-*`) cannot read at all.
 * Keeping the hash computation inside this collaborator (only ever
 * exercised for real by the integration suite) rather than in `handleGenerate`
 * itself is what keeps the handler's own logic testable with fakes and no
 * permissions, the same boundary every other real/fake collaborator split
 * in this codebase draws.
 */
export type RotateRecoveryCode = (userId: string, canonicalCode: string) => Promise<void>;

export type RedeemAttemptResult =
  | { readonly status: 'redeemed'; readonly userId: string }
  | { readonly status: 'invalid' };

/** Takes the *canonical* code, for the same permission-boundary reason `RotateRecoveryCode` does — hashing happens inside the real implementation only. */
export type RedeemRecoveryCode = (canonicalCode: string) => Promise<RedeemAttemptResult>;

export type MintSessionResult =
  | { readonly status: 'minted'; readonly tokenHash: string }
  | { readonly status: 'error' };

export type MintSessionForUser = (userId: string) => Promise<MintSessionResult>;

/**
 * Best-effort reversal of a redemption whose subsequent mint failed — clears
 * `redeemed_at` so the same code can be retried instead of being permanently
 * spent for nothing. Takes the *canonical* code, for the same
 * permission-boundary reason `RotateRecoveryCode`/`RedeemRecoveryCode` do.
 */
export type RevertRecoveryCodeRedemption = (canonicalCode: string) => Promise<void>;

/**
 * Records one attempt and reports whether the caller may proceed, plus the
 * `Retry-After` to answer with when not. `address` is `null` when the caller
 * sent no `X-Forwarded-For` at all — see `extractCallerAddress`'s doc comment
 * in `../_shared/rateLimit.ts` for why that must never throttle.
 *
 * Step 25 changed this from a bare `boolean` to the shared
 * `RateLimitDecision`, which is what lets the `429` carry the *actual*
 * remaining window rather than Step 14's fixed 60.
 */
export type CheckRedemptionRateLimit = (address: string | null) => Promise<RateLimitDecision>;

/** Step 25: the per-user half, on the authenticated `POST /v1/generate` route. See `RATE_LIMIT_MAX_GENERATES_PER_USER`. */
export type CheckGenerateRateLimit = (userId: string) => Promise<RateLimitDecision>;

/** Step 25 (AC5): injected so a test can prove the pre-parse size cap refuses before the body is read or parsed. */
export type ReadRedeemBody = (request: Request) => Promise<string>;
export type ParseRedeemBody = (rawBody: string) => unknown;

/**
 * Resolves `true` only when `providedToken` matches a configured reset
 * token. `providedToken` is `null` when the caller sent no token header at
 * all — that must never authorize, the same as a wrong token.
 */
export type CheckTestResetAuthorization = (providedToken: string | null) => Promise<boolean>;

/** Clears the in-memory rate-limit state — see `TEST_RESET_RATE_LIMIT_ROUTE`'s doc comment for why this route exists at all. */
export type ResetRateLimitState = () => Promise<void>;

export interface RecoveryCodeDeps {
  readonly resolveCaller: ResolveCaller;
  readonly rotateRecoveryCode: RotateRecoveryCode;
  readonly redeemRecoveryCode: RedeemRecoveryCode;
  readonly revertRecoveryCodeRedemption: RevertRecoveryCodeRedemption;
  readonly mintSessionForUser: MintSessionForUser;
  readonly checkRedemptionRateLimit: CheckRedemptionRateLimit;
  readonly checkGenerateRateLimit: CheckGenerateRateLimit;
  readonly readRedeemBody: ReadRedeemBody;
  readonly parseRedeemBody: ParseRedeemBody;
  readonly checkTestResetAuthorization: CheckTestResetAuthorization;
  readonly resetRateLimitState: ResetRateLimitState;
}

async function handleGenerate(
  request: Request,
  deps: RecoveryCodeDeps,
  origin: string | null,
): Promise<Response> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (token === null) {
    return errorResponse(401, 'unauthenticated', 'Missing bearer token.', { origin });
  }

  const caller = await deps.resolveCaller(token);
  if (caller === null) {
    return errorResponse(401, 'unauthenticated', 'Invalid or expired token.', { origin });
  }

  // Step 25's per-user half, and the only place it can run: this route has a
  // verified caller, while redeem does not until the code is already matched.
  const userDecision = await deps.checkGenerateRateLimit(caller.userId);
  if (!userDecision.allowed) {
    return rateLimitedResponse(origin, userDecision.retryAfterSeconds);
  }

  const plaintext = generateRecoveryCodePlaintext();

  await deps.rotateRecoveryCode(caller.userId, canonicalizeRecoveryCode(plaintext));

  return jsonResponse(200, { code: plaintext }, origin);
}

async function handleRedeem(
  request: Request,
  deps: RecoveryCodeDeps,
  origin: string | null,
): Promise<Response> {
  // Step 25 (design constraint 2): declared-size refusal, then the rate-limit
  // refusal, both before the body is read at all — let alone parsed, HMAC'd
  // or compared against the stored hash. §10.2's exact 429 shape comes from
  // the shared helper.
  const declaredLength = declaredBodyBytes(request);
  if (declaredLength !== null && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`, { origin });
  }

  const addressDecision = await deps.checkRedemptionRateLimit(extractCallerAddress(request));
  if (!addressDecision.allowed) {
    return rateLimitedResponse(origin, addressDecision.retryAfterSeconds);
  }

  let rawBody: string;
  try {
    rawBody = await deps.readRedeemBody(request);
  } catch {
    return errorResponse(400, 'malformed_request', 'Body could not be read.', { origin });
  }

  // The authoritative check, still before any parse: a chunked body carries no
  // `Content-Length` for the refusal above to catch.
  if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BODY_BYTES) {
    return errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`, { origin });
  }

  let body: unknown;
  try {
    body = deps.parseRedeemBody(rawBody);
  } catch {
    return errorResponse(400, 'malformed_request', 'Body is not valid JSON.', { origin });
  }

  const codeInput =
    typeof body === 'object' && body !== null && 'code' in body
      ? (body as { code: unknown }).code
      : undefined;
  if (typeof codeInput !== 'string' || codeInput.trim() === '') {
    return errorResponse(400, 'malformed_request', 'Body must be an object with a non-empty code string.', {
      origin,
    });
  }

  const canonical = canonicalizeRecoveryCode(codeInput);
  // A malformed code and a well-formed-but-wrong one answer identically
  // below — nothing here reveals which check failed to a caller who does
  // not already know the real code.
  const invalidResponse = () =>
    errorResponse(401, 'recovery_code_invalid', 'Recovery code is invalid or already used.', { origin });

  if (!/^[0-9a-f]{32}$/.test(canonical)) {
    return invalidResponse();
  }

  const attempt = await deps.redeemRecoveryCode(canonical);
  if (attempt.status !== 'redeemed') {
    return invalidResponse();
  }

  const minted = await deps.mintSessionForUser(attempt.userId);
  if (minted.status === 'error') {
    // The code is already marked redeemed but no session was ever
    // delivered — reverting it is what keeps this a retryable failure
    // instead of a permanently destroyed account. Best-effort: a failure
    // here is logged, not thrown, so the caller still sees the 500 that
    // reflects what actually happened.
    try {
      await deps.revertRecoveryCodeRedemption(canonical);
    } catch (revertError) {
      console.error('recovery-code: reverting a failed redemption failed.', revertError);
    }
    return errorResponse(500, 'server_error', 'Could not mint a session.', { origin });
  }

  return jsonResponse(200, { tokenHash: minted.tokenHash }, origin);
}

/**
 * See `TEST_RESET_RATE_LIMIT_ROUTE`'s doc comment. A missing or wrong token
 * gets the identical `malformed_request`/"Unknown route" response an
 * actually-unknown route gets — never a distinct "wrong token" shape — so
 * this route's existence is not an oracle for anyone without the token.
 */
async function handleTestOnlyResetRateLimit(
  request: Request,
  deps: RecoveryCodeDeps,
  origin: string | null,
): Promise<Response> {
  const providedToken = request.headers.get('x-test-reset-token');
  const authorized = await deps.checkTestResetAuthorization(providedToken);

  if (!authorized) {
    return errorResponse(400, 'malformed_request', 'Unknown route.', {
      detail: { route: TEST_RESET_RATE_LIMIT_ROUTE },
      origin,
    });
  }

  await deps.resetRateLimitState();
  return jsonResponse(200, { reset: true }, origin);
}

/**
 * The real `resolveCaller`: identical shape to `whoami-check`/`save-sync`'s
 * own — an anon-key client scoped to the caller's own token, `auth.getUser`.
 */
async function resolveCallerViaSupabaseAuth(bearerToken: string): Promise<AuthenticatedCaller | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    throw new Error('recovery-code: SUPABASE_URL or SUPABASE_ANON_KEY is not configured.');
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
 * `recovery_codes` denies every client write (Step 15's own "no policy at
 * all" rule for this table), so the service role is required. The revoke
 * and the insert run inside `rotate_recovery_code`, a single Postgres
 * function (`20260913090000_recovery_code_rotation_rpc.sql`) — a 2026-09-12
 * review finding: two separate PostgREST statements are two separate
 * non-transactional requests, so an insert failure after a successful
 * revoke could leave a user with no active code, and two concurrent
 * rotations for the same user could both pass the revoke before racing the
 * insert against `recovery_codes_one_active_per_user_idx`. The RPC makes
 * both statements one transaction, with Postgres serializing concurrent
 * callers on the same `user_id` the same way it already serializes
 * concurrent redeemers of the same `code_hash` in
 * `redeemRecoveryCodeViaServiceRole`.
 */
async function rotateRecoveryCodeViaServiceRole(userId: string, canonicalCode: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('recovery-code: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const codeHash = await hashRecoveryCode(canonicalCode);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.rpc('rotate_recovery_code', {
    p_user_id: userId,
    p_code_hash: codeHash,
  });

  if (error) {
    throw new Error(`recovery-code: rotating the code failed: ${error.message}`);
  }
}

/**
 * Atomic compare-and-swap, not a read-then-write: only a row matching
 * `codeHash` that is still unredeemed and unrevoked is ever updated, and
 * `.select()`'s returned rows tell the caller whether it actually applied.
 * Two concurrent redemptions of the same code race this UPDATE itself —
 * Postgres serializes it, so exactly one can ever see its own row affected.
 */
async function redeemRecoveryCodeViaServiceRole(canonicalCode: string): Promise<RedeemAttemptResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('recovery-code: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const codeHash = await hashRecoveryCode(canonicalCode);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from('recovery_codes')
    .update({ redeemed_at: new Date().toISOString() })
    .eq('code_hash', codeHash)
    .is('redeemed_at', null)
    .is('revoked_at', null)
    .select('user_id');

  if (error) {
    throw new Error(`recovery-code: redeeming failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    return { status: 'invalid' };
  }

  return { status: 'redeemed', userId: data[0].user_id as string };
}

/**
 * Clears `redeemed_at` on a code whose redemption succeeded but whose
 * follow-on mint failed, so the same code remains usable. Delegates to
 * `revert_recovery_code_redemption`
 * (`20260913090100_recovery_code_revert_rpc.sql`) rather than a plain
 * `update` — a 2026-09-13 review finding: a `POST /v1/generate` landing in
 * the narrow window between the failed mint and this revert rotates a fresh
 * active code, and a plain `update ... where revoked_at is null` would then
 * try to revive this code as *also* active, colliding with
 * `recovery_codes_one_active_per_user_idx`. The RPC checks for that fresher
 * code first and no-ops instead of raising an avoidable constraint
 * violation in the common case — the account is never left with two active
 * codes. That check and the write are not atomic with each other, though: a
 * `generate` committing in the narrow gap between them can still make this
 * throw the identical `23505` the plain-`update` version did — which is
 * exactly why `handleRedeem`'s own try/catch around this call must stay.
 * Either way the account ends up safe (the fresh code wins; this one just
 * stays spent), only not always silently.
 */
async function revertRecoveryCodeRedemptionViaServiceRole(canonicalCode: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('recovery-code: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const codeHash = await hashRecoveryCode(canonicalCode);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.rpc('revert_recovery_code_redemption', { p_code_hash: codeHash });

  if (error) {
    throw new Error(`recovery-code: reverting the redemption failed: ${error.message}`);
  }
}

/**
 * `generateLink({type:'magiclink', email})` finds-or-**creates** by email —
 * exactly what `telegram-sign-in` relies on, and exactly the trap here: a
 * pure anonymous guest has no email at all, so calling it blind would
 * silently mint a *new*, wrong account. Resolving the existing email first
 * (or assigning the deterministic recovery placeholder only when none
 * exists) guarantees this call *finds* the caller's real row instead.
 */
async function mintSessionForUserViaGenerateLink(userId: string): Promise<MintSessionResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('recovery-code: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: getUserError } = await admin.auth.admin.getUserById(userId);
  if (getUserError || !userData.user) {
    console.error('recovery-code: getUserById failed.', getUserError ?? 'no user returned');
    return { status: 'error' };
  }

  let email = userData.user.email;
  if (!email) {
    email = recoveryPlaceholderEmail(userId);
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (updateError) {
      console.error('recovery-code: assigning a recovery placeholder email failed.', updateError);
      return { status: 'error' };
    }
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties?.hashed_token) {
    console.error('recovery-code: generateLink failed.', error ?? 'no hashed_token returned');
    return { status: 'error' };
  }

  return { status: 'minted', tokenHash: data.properties.hashed_token };
}

/**
 * Step 25: the mechanism moved to `../_shared/rateLimit.ts` — one fixed-window
 * limiter shared with `save-sync` and `telegram-sign-in` instead of three
 * hand-rolled counters. What used to be `redemptionAttemptsByAddress` is now
 * the shared in-memory store behind `redemptionByAddress` below, with the same
 * 30-per-minute budget, the same "no address → never throttle" rule, and the
 * same size-gated sweep (`pruneSizeThreshold`; see
 * `createFixedWindowRateLimiter` for why sweeping on every request under a
 * rotated-address attack is O(n²) rather than a safety margin).
 *
 * The one deliberate change is the window *shape*: fixed rather than sliding,
 * which is what lets the store hold two numbers per key instead of a list of
 * timestamps whose length is the attacker's to choose. The observable contract
 * — 30 attempts in a minute, then a `429` carrying `Retry-After` — is
 * unchanged, and is pinned by `index.test.ts` and
 * `tests/server-integration/recovery-code.integration.test.ts`.
 */
const RATE_LIMIT_PRUNE_SIZE_THRESHOLD = 1_000;

export interface RecoveryCodeRateLimiters {
  readonly redemptionByAddress: RateLimiter;
  readonly generateByUser: RateLimiter;
  /** Clears both stores — what `TEST_RESET_RATE_LIMIT_ROUTE` invokes. */
  readonly resetRateLimitState: () => void;
}

/**
 * Each limiter owns its own store: an `address:` key is literally the same
 * string as a `user:` key only if the two were mixed into one map, and
 * separate stores are what makes the redemption budget and the generate budget
 * independent rather than one budget spent twice. Built by a factory so a test
 * can drive the real configuration with an injected clock.
 */
export function createRecoveryCodeRateLimiters(
  options: { readonly clockMs?: () => number } = {},
): RecoveryCodeRateLimiters {
  const clockMs = options.clockMs ?? Date.now;
  const redemptionStore = createInMemoryRateLimitStore();
  const generateStore = createInMemoryRateLimitStore();

  return {
    redemptionByAddress: createFixedWindowRateLimiter({
      limit: RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clockMs,
      store: redemptionStore,
      pruneSizeThreshold: RATE_LIMIT_PRUNE_SIZE_THRESHOLD,
    }),
    generateByUser: createFixedWindowRateLimiter({
      limit: RATE_LIMIT_MAX_GENERATES_PER_USER,
      windowMs: RATE_LIMIT_WINDOW_MS,
      clockMs,
      store: generateStore,
      pruneSizeThreshold: RATE_LIMIT_PRUNE_SIZE_THRESHOLD,
    }),
    resetRateLimitState: () => {
      redemptionStore.clear();
      generateStore.clear();
    },
  };
}

/**
 * Module-scoped, so it lives as long as this worker does — the honest scope
 * recorded in `memory-bank/architecture.md`'s Step 25 section: per worker,
 * best-effort, and an attacker with parallelism sees a higher ceiling. The
 * real backstop behind redemption is the code's 128-bit entropy.
 */
const RECOVERY_CODE_RATE_LIMITERS = createRecoveryCodeRateLimiters();

/**
 * Unset in every environment but a local dev stack's own
 * `supabase/functions/.env` — a real deployment (none exists yet) must never
 * define `RECOVERY_CODE_TEST_RESET_TOKEN`, or this route would answer for
 * anyone who guesses it. `providedToken === null` (no header at all) always
 * fails alongside a configured-but-wrong one; there is no way to distinguish
 * "not configured" from "wrong token" from the response either.
 */
function checkTestResetAuthorizationViaEnv(providedToken: string | null): Promise<boolean> {
  const expectedToken = Deno.env.get('RECOVERY_CODE_TEST_RESET_TOKEN');
  if (!expectedToken || providedToken === null) {
    return Promise.resolve(false);
  }
  return Promise.resolve(timingSafeEqual(providedToken, expectedToken));
}

const defaultDeps: RecoveryCodeDeps = {
  resolveCaller: resolveCallerViaSupabaseAuth,
  rotateRecoveryCode: rotateRecoveryCodeViaServiceRole,
  redeemRecoveryCode: redeemRecoveryCodeViaServiceRole,
  revertRecoveryCodeRedemption: revertRecoveryCodeRedemptionViaServiceRole,
  mintSessionForUser: mintSessionForUserViaGenerateLink,
  checkRedemptionRateLimit: (address) =>
    RECOVERY_CODE_RATE_LIMITERS.redemptionByAddress.check(addressRateLimitKey(address)),
  checkGenerateRateLimit: (userId) =>
    RECOVERY_CODE_RATE_LIMITERS.generateByUser.check(userRateLimitKey(userId)),
  readRedeemBody: async (request: Request): Promise<string> => await request.text(),
  parseRedeemBody: (rawBody: string): unknown => JSON.parse(rawBody),
  checkTestResetAuthorization: checkTestResetAuthorizationViaEnv,
  resetRateLimitState: async () => {
    RECOVERY_CODE_RATE_LIMITERS.resetRateLimitState();
  },
};

export async function handleRequest(
  request: Request,
  deps: RecoveryCodeDeps = defaultDeps,
): Promise<Response> {
  const route = resolveFunctionRoute(request.url);
  const origin = request.headers.get('origin');

  if (route === GENERATE_ROUTE) {
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request, 'POST, OPTIONS');
    }
    if (request.method !== 'POST') {
      return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
        detail: { method: request.method, route },
        origin,
      });
    }
    return await handleGenerate(request, deps, origin);
  }

  if (route === REDEEM_ROUTE) {
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request, 'POST, OPTIONS');
    }
    if (request.method !== 'POST') {
      return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
        detail: { method: request.method, route },
        origin,
      });
    }
    return await handleRedeem(request, deps, origin);
  }

  if (route === TEST_RESET_RATE_LIMIT_ROUTE) {
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request, 'POST, OPTIONS');
    }
    if (request.method !== 'POST') {
      return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
        detail: { method: request.method, route },
        origin,
      });
    }
    return await handleTestOnlyResetRateLimit(request, deps, origin);
  }

  return errorResponse(400, 'malformed_request', 'Unknown route.', { detail: { route }, origin });
}

// Guarded so importing this module for unit tests does not also start a
// live listener — the same `import.meta.main` pattern every function here
// uses.
if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleRequest(request);
    } catch (error) {
      console.error('recovery-code: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Unhandled error.', {
        origin: request.headers.get('origin'),
      });
    }
  });
}
