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
 * **Rate limiting is a deliberate interim seam.** Step 25 is the plan's own
 * named owner of "rate-limit uploads, authentication, and recovery-code
 * redemption per user and per address" as a cross-cutting concern, and the
 * Step 3 schema design deliberately carries no per-code failed-attempt
 * counter ("counting per code would miss the attack"). This ships a
 * minimal in-memory, module-scoped fixed-window limiter keyed by caller
 * address, injected the same way every other collaborator here is, so
 * Step 25 can swap in a persistent, distributed implementation without
 * touching `handleRedeem` itself.
 *
 * **The guest-upgrade collision flow needs no new code.** Once the client
 * completes `verifyOtp`, `src/main.ts` runs the exact same
 * `triggerCloudSaveReconcile()` every other sign-in path already runs —
 * the redeeming device's local IndexedDB save is untouched by the session
 * swap, so Step 17's `reconcileCloudSaveAtBoot`/`reconcileGuestUpgrade`
 * compares it against the recovered account's cloud save exactly as it
 * would for a Google or Telegram sign-in.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import { corsPreflightResponse, errorResponse, jsonResponse } from '../_shared/http.ts';

const FUNCTION_ROUTE_PREFIX = '/recovery-code';
const PLATFORM_ROUTE_PREFIX = '/functions/v1';
const GENERATE_ROUTE = '/v1/generate';
const REDEEM_ROUTE = '/v1/redeem';

/** 128-bit entropy — a machine-generated secret, not a human password; no slow hash is needed (see the hashing doc comment above). */
const CODE_BYTE_LENGTH = 16;
/** Groups the hex string for readability: `xxxx-xxxx-...`. */
const CODE_GROUP_SIZE = 4;
const RECOVERY_EMAIL_DOMAIN = 'recovery.invalid';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS = 10;
const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

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

/** The first hop in `X-Forwarded-For`, or a constant when absent — every caller with no header shares one bucket, which is conservative, not permissive. */
function extractCallerAddress(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return 'unknown';
}

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

/** Resolves `true` when the caller may proceed, `false` when throttled. */
export type CheckRedemptionRateLimit = (address: string) => Promise<boolean>;

export interface RecoveryCodeDeps {
  readonly resolveCaller: ResolveCaller;
  readonly rotateRecoveryCode: RotateRecoveryCode;
  readonly redeemRecoveryCode: RedeemRecoveryCode;
  readonly mintSessionForUser: MintSessionForUser;
  readonly checkRedemptionRateLimit: CheckRedemptionRateLimit;
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

  const plaintext = generateRecoveryCodePlaintext();

  await deps.rotateRecoveryCode(caller.userId, canonicalizeRecoveryCode(plaintext));

  return jsonResponse(200, { code: plaintext }, origin);
}

async function handleRedeem(
  request: Request,
  deps: RecoveryCodeDeps,
  origin: string | null,
): Promise<Response> {
  const allowed = await deps.checkRedemptionRateLimit(extractCallerAddress(request));
  if (!allowed) {
    return errorResponse(429, 'rate_limited', 'Too many recovery-code attempts.', {
      origin,
      retryAfterSeconds: RATE_LIMIT_RETRY_AFTER_SECONDS,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
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
    return errorResponse(500, 'server_error', 'Could not mint a session.', { origin });
  }

  return jsonResponse(200, { tokenHash: minted.tokenHash }, origin);
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
 * all" rule for this table), so the service role is required for both the
 * revoke and the insert. Revoking first is load-bearing, not cosmetic: the
 * partial unique index `recovery_codes_one_active_per_user_idx` rejects a
 * second active row for the same user outright.
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

  const { error: revokeError } = await admin
    .from('recovery_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('redeemed_at', null)
    .is('revoked_at', null);

  if (revokeError) {
    throw new Error(`recovery-code: revoking the prior code failed: ${revokeError.message}`);
  }

  const { error: insertError } = await admin
    .from('recovery_codes')
    .insert({ user_id: userId, code_hash: codeHash });

  if (insertError) {
    throw new Error(`recovery-code: storing the new code failed: ${insertError.message}`);
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
 * A fixed, in-memory, module-scoped limiter — a deliberate interim seam.
 * Step 25 owns a persistent, distributed per-user/per-address limiter across
 * every endpoint this milestone has; this is enough for this step's own
 * test ("wrong codes are... throttled") without inventing infrastructure a
 * later step owns. Not safe across multiple worker instances or a restart —
 * documented, not hidden.
 */
const redemptionAttemptsByAddress = new Map<string, number[]>();

function checkRedemptionRateLimitInMemory(address: string): Promise<boolean> {
  const now = Date.now();
  const attempts = (redemptionAttemptsByAddress.get(address) ?? []).filter(
    (attemptedAt) => now - attemptedAt < RATE_LIMIT_WINDOW_MS,
  );

  if (attempts.length >= RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS) {
    redemptionAttemptsByAddress.set(address, attempts);
    return Promise.resolve(false);
  }

  attempts.push(now);
  redemptionAttemptsByAddress.set(address, attempts);
  return Promise.resolve(true);
}

const defaultDeps: RecoveryCodeDeps = {
  resolveCaller: resolveCallerViaSupabaseAuth,
  rotateRecoveryCode: rotateRecoveryCodeViaServiceRole,
  redeemRecoveryCode: redeemRecoveryCodeViaServiceRole,
  mintSessionForUser: mintSessionForUserViaGenerateLink,
  checkRedemptionRateLimit: checkRedemptionRateLimitInMemory,
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
