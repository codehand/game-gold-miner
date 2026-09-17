/**
 * `telegram-sign-in` Edge Function — server-milestone Step 12.
 *
 * Verifies Telegram Mini App `initData` server-side and mints a real
 * Supabase session for the verified Telegram user, never trusting the
 * client-side `initDataUnsafe` the Telegram SDK also exposes (that object
 * is just JS-side parsing with no signature check — see
 * `src/platform/telegram/telegramSignIn.ts`, which only ever sends the raw,
 * still-signed `initData` string here).
 *
 * **Verification algorithm** (Telegram's own docs,
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * every field except `hash` (and `signature`, which belongs to a separate
 * Ed25519 third-party scheme this function does not use), as `key=value`
 * pairs sorted alphabetically and joined with `\n`, is the data-check-string.
 * `secret_key = HMAC_SHA256(key="WebAppData", data=botToken)` — the literal
 * string `"WebAppData"` is the HMAC *key*, the bot token is the *message* —
 * then `computed = hex(HMAC_SHA256(key=secret_key, data=dataCheckString))`
 * must equal the `hash` field. Both HMAC steps use `crypto.subtle` (Web
 * Crypto, not `node:crypto`) so this runs on Deno's edge runtime unmodified.
 * `auth_date` freshness has no Telegram-mandated window; `MAX_INIT_DATA_AGE_SECONDS`
 * below is a deliberate, documented default (the `@telegram-apps/init-data-node`
 * ecosystem convention), not an unstated one.
 *
 * **Minting a session.** Supabase Auth has no first-class "trust this
 * server-verified identity" API for a provider it doesn't natively support.
 * The confirmed community/official pattern this function uses:
 * `admin.generateLink({ type: 'magiclink', email })` — which creates the
 * `auth.users` row if it doesn't already exist — returns
 * `properties.hashed_token`; the *client* then calls
 * `auth.verifyOtp({ token_hash: hashedToken, type: 'email' })` (not
 * `type: 'magiclink'`, deprecated for `verifyOtp`) to establish a real,
 * GoTrue-tracked session with working refresh. No email is ever sent — the
 * token is generated here and handed to the client directly in this
 * function's response.
 *
 * **No schema change.** A Telegram user maps to
 * `auth.users.email = telegram-<telegramUserId>@telegram.invalid` —
 * `.invalid` is the RFC 2606-reserved TLD for exactly this: a
 * never-delivered, never-resolvable placeholder. `generateLink` finds-or-
 * creates by that deterministic email, so no `profiles` column or migration
 * is needed to make this correct, matching how Steps 8 and 10 also shipped
 * with no schema change — identity linking lives in `auth.users`, not
 * `profiles`.
 *
 * **CORS.** This is the first function `src/` calls directly via `fetch()`
 * from a browser (Steps 8–10 go through the Supabase Auth client SDK or
 * server-side tests only) — the trigger finding F11
 * (`memory-bank/server-threat-model.md`) named. `handleTelegramSignIn`
 * answers `OPTIONS` before any other check, using the shared policy in
 * `../_shared/http.ts`.
 *
 * `handleTelegramSignIn` takes both collaborators injected — `verify` and
 * `mintSession` — so `index.test.ts` exercises every response this route
 * gives, including every rejection reason, with zero permissions and no
 * live database. The one real implementation of each,
 * `verifyTelegramInitData` and `mintSessionViaGenerateLink`, is exercised
 * against the live stack by
 * `tests/server-integration/telegram-sign-in.integration.test.ts` — the
 * same fixture-collaborator split Step 7 established and every identity
 * step since has reused.
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
  type RateLimiter,
} from '../_shared/rateLimit.ts';

const WEB_APP_DATA_HMAC_KEY = 'WebAppData';
const TELEGRAM_INVALID_EMAIL_DOMAIN = 'telegram.invalid';

/**
 * Step 25's authentication limit, derived rather than chosen.
 *
 * This route is the one place a client can make the server mint a session, and
 * each accepted call costs one service-role `generateLink` round trip
 * (`mintSessionViaGenerateLink`), so it needs a limit of its own even though
 * GoTrue sits behind it. A real Telegram Mini App user signs in once per cold
 * start and a flaky client may retry a handful of times; 60/minute leaves that
 * untouched by more than an order of magnitude while still bounding the
 * service-role work one address can provoke. It is deliberately looser than
 * GoTrue's own `sign_in_sign_ups = 30` per 5 minutes per IP
 * (`supabase/config.toml`, §`[auth.rate_limit]`) — the tighter of the two
 * always wins, so this one must not be the thing that refuses a legitimate
 * sign-in. A shared address (an office NAT, the local integration suite) is
 * the reason it is per minute rather than per hour.
 */
export const TELEGRAM_SIGN_IN_MAX_PER_ADDRESS = 60;
export const TELEGRAM_SIGN_IN_RATE_LIMIT_WINDOW_MS = 60_000;

/** Built by a factory so a unit test can drive the real configuration with an injected clock. */
export function createTelegramSignInRateLimiter(
  options: { readonly clockMs?: () => number } = {},
): RateLimiter {
  return createFixedWindowRateLimiter({
    limit: TELEGRAM_SIGN_IN_MAX_PER_ADDRESS,
    windowMs: TELEGRAM_SIGN_IN_RATE_LIMIT_WINDOW_MS,
    clockMs: options.clockMs ?? Date.now,
    store: createInMemoryRateLimitStore(),
  });
}

/** Ecosystem convention (`@telegram-apps/init-data-node`'s default), not a Telegram mandate. */
export const MAX_INIT_DATA_AGE_SECONDS = 86_400;

export type InitDataVerification =
  | { readonly valid: true; readonly telegramUserId: number }
  | { readonly valid: false; readonly reason: 'malformed' | 'bad-hash' | 'stale' };

/**
 * Builds the deterministic, never-delivered placeholder email a Telegram
 * user maps to. `.invalid` is RFC 2606-reserved for exactly this.
 */
export function telegramPlaceholderEmail(telegramUserId: number): string {
  return `telegram-${telegramUserId}@${TELEGRAM_INVALID_EMAIL_DOMAIN}`;
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

/** Constant-time comparison — a signature check must not leak timing information. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * Verifies `initData` against `botToken`. Pure aside from `crypto.subtle`
 * and the injected clock — no network, no `Deno.env`, no database — so
 * `index.test.ts` covers every accept/reject path with hand-signed vectors
 * and no Docker.
 */
export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowMs: number,
  maxAgeSeconds: number = MAX_INIT_DATA_AGE_SECONDS,
): Promise<InitDataVerification> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDateRaw = params.get('auth_date');
  const userRaw = params.get('user');

  if (hash === null || authDateRaw === null || userRaw === null) {
    return { valid: false, reason: 'malformed' };
  }

  params.delete('hash');
  // `signature` belongs to the separate Ed25519 third-party-verifier scheme
  // this function does not implement; excluded from the data-check-string
  // the same way `hash` itself is.
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = await hmacSha256(new TextEncoder().encode(WEB_APP_DATA_HMAC_KEY), botToken);
  const computed = toHex(await hmacSha256(secretKey, dataCheckString));

  if (!timingSafeEqualHex(computed, hash)) {
    return { valid: false, reason: 'bad-hash' };
  }

  const authDateSeconds = Number(authDateRaw);
  if (!Number.isFinite(authDateSeconds)) {
    return { valid: false, reason: 'malformed' };
  }
  // `Math.abs`, not a one-sided subtraction: a one-sided check only ever
  // rejects a payload that is too *old*, so a validly HMAC-signed payload
  // dated arbitrarily far in the *future* would never be flagged stale.
  // Needs the real bot token to exploit either way, so this is
  // defense-in-depth rather than a standalone hole — a 2026-09-12 review
  // finding.
  if (Math.abs(nowMs / 1000 - authDateSeconds) > maxAgeSeconds) {
    return { valid: false, reason: 'stale' };
  }

  let telegramUserId: unknown;
  try {
    telegramUserId = (JSON.parse(userRaw) as { id?: unknown }).id;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (typeof telegramUserId !== 'number' || !Number.isInteger(telegramUserId)) {
    return { valid: false, reason: 'malformed' };
  }

  return { valid: true, telegramUserId };
}

export type MintSessionResult =
  | { readonly status: 'minted'; readonly tokenHash: string }
  | { readonly status: 'error' };

export type VerifyInitData = (initData: string) => Promise<InitDataVerification>;
export type MintSession = (telegramUserId: number) => Promise<MintSessionResult>;

/** Step 25 (AC5): injected so a test can prove the pre-parse size cap refuses before the body is read or parsed, rather than trusting the source order. */
export type ReadBody = (request: Request) => Promise<string>;
export type ParseBody = (rawBody: string) => unknown;

export interface TelegramSignInDeps {
  readonly verify: VerifyInitData;
  readonly mintSession: MintSession;
  /** Step 25: the per-address authentication limit — see `TELEGRAM_SIGN_IN_MAX_PER_ADDRESS`. */
  readonly rateLimit: RateLimiter;
  readonly readBody: ReadBody;
  readonly parseBody: ParseBody;
}

/**
 * `verify` and `mintSession` are required; the Step 25 additions default to
 * their one real implementation, so the tests written before this step — which
 * pass only the two collaborators — keep exercising exactly what they did.
 */
export type TelegramSignInOverrides = Pick<TelegramSignInDeps, 'verify' | 'mintSession'> &
  Partial<Omit<TelegramSignInDeps, 'verify' | 'mintSession'>>;

/**
 * Module-scoped, so it lives as long as this worker does — the honest scope
 * recorded in `memory-bank/architecture.md`'s Step 25 section: per worker,
 * best-effort, and an attacker with parallelism sees a higher ceiling.
 */
const DEFAULT_TELEGRAM_SIGN_IN_DEPS = {
  rateLimit: createTelegramSignInRateLimiter(),
  readBody: async (request: Request): Promise<string> => await request.text(),
  parseBody: (rawBody: string): unknown => JSON.parse(rawBody),
};

export async function handleTelegramSignIn(
  request: Request,
  overrides: TelegramSignInOverrides,
): Promise<Response> {
  const deps: TelegramSignInDeps = { ...DEFAULT_TELEGRAM_SIGN_IN_DEPS, ...overrides };
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return corsPreflightResponse(request, 'POST, OPTIONS');
  }
  if (request.method !== 'POST') {
    return errorResponse(400, 'malformed_request', 'Unsupported method for this route.', {
      detail: { method: request.method },
      origin,
    });
  }

  // Step 25 (design constraint 2): declared-size refusal, then the rate-limit
  // refusal, both before the body is read — let alone parsed or HMAC-verified.
  // This route had neither before this step: it buffered and JSON-parsed
  // whatever it was sent, then paid two HMAC-SHA-256 operations over the
  // `initData` string and a service-role `generateLink` round trip.
  const declaredLength = declaredBodyBytes(request);
  if (declaredLength !== null && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`, { origin });
  }

  const addressDecision = await deps.rateLimit.check(
    addressRateLimitKey(extractCallerAddress(request)),
  );
  if (!addressDecision.allowed) {
    return rateLimitedResponse(origin, addressDecision.retryAfterSeconds);
  }

  let rawBody: string;
  try {
    rawBody = await deps.readBody(request);
  } catch {
    return errorResponse(400, 'malformed_request', 'Body could not be read.', { origin });
  }

  // The authoritative size check, still before any parse — a chunked upload
  // carries no `Content-Length` for the check above to catch, and a client can
  // always lie about the one it sends.
  if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BODY_BYTES) {
    return errorResponse(413, 'payload_too_large', `Body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`, { origin });
  }

  let body: unknown;
  try {
    body = deps.parseBody(rawBody);
  } catch {
    return errorResponse(400, 'malformed_request', 'Body is not valid JSON.', { origin });
  }

  const initData =
    typeof body === 'object' && body !== null && 'initData' in body
      ? (body as { initData: unknown }).initData
      : undefined;
  if (typeof initData !== 'string' || initData === '') {
    return errorResponse(400, 'malformed_request', 'Body must be an object with a non-empty initData string.', {
      origin,
    });
  }

  const verification = await deps.verify(initData);
  if (!verification.valid) {
    // One code for every rejection reason: `bad-hash` covers both a
    // tampered payload and one signed with a different bot token — the two
    // are cryptographically indistinguishable to a verifier, a bad hash is
    // a bad hash — and the step's own test only requires that each is
    // "rejected with no session issued," not that the client can tell them
    // apart. `detail.reason` still carries the distinction for logs.
    return errorResponse(401, 'unauthenticated', 'Telegram initData failed verification.', {
      detail: { reason: verification.reason },
      origin,
    });
  }

  const minted = await deps.mintSession(verification.telegramUserId);
  if (minted.status === 'error') {
    return errorResponse(500, 'server_error', 'Could not mint a session.', { origin });
  }

  return jsonResponse(200, { tokenHash: minted.tokenHash }, origin);
}

/**
 * The one real `mintSession` implementation: `admin.generateLink` under the
 * service role. Throws, rather than returning an `error` result, when the
 * function's own environment is misconfigured — mirroring
 * `resolveCallerViaSupabaseAuth`'s rule in `whoami-check/index.ts` — because
 * a missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` is this deployment's
 * fault, not the caller's, and must not look like a verification failure.
 */
async function mintSessionViaGenerateLink(telegramUserId: number): Promise<MintSessionResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('telegram-sign-in: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: telegramPlaceholderEmail(telegramUserId),
  });

  if (error || !data.properties?.hashed_token) {
    // Logged here, not returned: `handleTelegramSignIn` never reads a
    // reason off `MintSessionResult`'s error variant, so carrying one on
    // the type was dead weight — a 2026-09-12 review finding.
    console.error('telegram-sign-in: generateLink failed.', error ?? 'no hashed_token returned');
    return { status: 'error' };
  }

  return { status: 'minted', tokenHash: data.properties.hashed_token };
}

function verifyAgainstConfiguredBotToken(initData: string): Promise<InitDataVerification> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    throw new Error('telegram-sign-in: TELEGRAM_BOT_TOKEN is not configured.');
  }
  return verifyTelegramInitData(initData, botToken, Date.now());
}

if (import.meta.main) {
  Deno.serve(async (request: Request) => {
    try {
      return await handleTelegramSignIn(request, {
        verify: verifyAgainstConfiguredBotToken,
        mintSession: mintSessionViaGenerateLink,
      });
    } catch (error) {
      console.error('telegram-sign-in: unhandled error.', error);
      return errorResponse(500, 'server_error', 'Unhandled error.', {
        origin: request.headers.get('origin'),
      });
    }
  });
}
