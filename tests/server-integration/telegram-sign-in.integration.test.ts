import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY } from './authFixture';
import {
  FIXTURE_TELEGRAM_USER_ID,
  mintInitDataSignedWithWrongBotToken,
  mintStaleInitData,
  mintValidInitData,
  tamperInitData,
} from './telegramInitDataFixture';

/**
 * Server-milestone Step 12: integration tests against the local stack with a
 * real database. Assumes `supabase start` + `supabase db reset` have already
 * run, and that `supabase/functions/.env` sets `TELEGRAM_BOT_TOKEN` to the
 * same fixture value `telegramInitDataFixture.ts` signs with — see
 * `.env.example` for why that is a third, separate env file from `.env`/
 * `.env.local`.
 *
 * This is the counterpart to `supabase/functions/telegram-sign-in/index.test.ts`:
 * that file proves the pure HTTP/verification logic for every case with
 * injected fakes; this file proves the one real collaborator,
 * `mintSessionViaGenerateLink`, actually mints a session real GoTrue accepts
 * — going all the way to a working `verifyOtp()` exchange, not just a
 * plausible-looking `tokenHash`, the same rigor
 * `profiles-rls.integration.test.ts` already set for Step 9.
 */
const SUPABASE_URL = 'http://127.0.0.1:54321';
const TELEGRAM_SIGN_IN_URL = `${SUPABASE_URL}/functions/v1/telegram-sign-in`;
const WARMUP_MAX_ATTEMPTS = 20;
const WARMUP_ATTEMPT_TIMEOUT_MS = 2_000;
const WARMUP_RETRY_DELAY_MS = 1_000;
const WARMUP_HOOK_TIMEOUT_MS = 70_000;

interface SignInSuccessBody {
  readonly tokenHash: string;
}

async function callTelegramSignIn(initData: string, init: RequestInit = {}): Promise<Response> {
  return fetch(TELEGRAM_SIGN_IN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
}

/** Exchanges a `tokenHash` for a real session — the client half of the flow. */
async function completeSignIn(tokenHash: string) {
  const client = createClient(SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
}

describe('telegram-sign-in (server-milestone Step 12)', () => {
  beforeAll(async () => {
    // Same cold-start warm-up `whoami.integration.test.ts` already
    // establishes, so the first real test does not race the edge runtime's
    // first-request cold start.
    for (let attempt = 1; attempt <= WARMUP_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(TELEGRAM_SIGN_IN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData: mintValidInitData() }),
          signal: AbortSignal.timeout(WARMUP_ATTEMPT_TIMEOUT_MS),
        });
        await response.body?.cancel();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, WARMUP_RETRY_DELAY_MS));
      }
    }
    console.warn(
      `telegram-sign-in warm-up: no response after ${WARMUP_MAX_ATTEMPTS} attempts.`,
    );
  }, WARMUP_HOOK_TIMEOUT_MS);

  it('mints a real, working session for validly signed, fresh initData', async () => {
    const response = await callTelegramSignIn(mintValidInitData());

    expect(response.status).toBe(200);
    const body = (await response.json()) as SignInSuccessBody;
    expect(typeof body.tokenHash).toBe('string');

    const { data, error } = await completeSignIn(body.tokenHash);

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect(data.session?.user.email).toBe(`telegram-${FIXTURE_TELEGRAM_USER_ID}@telegram.invalid`);
    expect(typeof data.session?.access_token).toBe('string');
  });

  it('mints the same account on a second sign-in for the same Telegram user id', async () => {
    const first = (await (await callTelegramSignIn(mintValidInitData())).json()) as SignInSuccessBody;
    const { data: firstSession } = await completeSignIn(first.tokenHash);

    const second = (await (await callTelegramSignIn(mintValidInitData())).json()) as SignInSuccessBody;
    const { data: secondSession } = await completeSignIn(second.tokenHash);

    expect(firstSession.session?.user.id).toBeDefined();
    expect(firstSession.session?.user.id).toBe(secondSession.session?.user.id);
  });

  it('rejects a tampered payload — no session issued', async () => {
    const response = await callTelegramSignIn(tamperInitData(mintValidInitData()));

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).not.toHaveProperty('tokenHash');
    expect((body as { error: { code: string } }).error.code).toBe('unauthenticated');
  });

  it('rejects a validly signed but stale (replayed) payload — no session issued', async () => {
    const response = await callTelegramSignIn(mintStaleInitData());

    expect(response.status).toBe(401);
  });

  it('rejects a payload signed with a different bot token — no session issued', async () => {
    const response = await callTelegramSignIn(mintInitDataSignedWithWrongBotToken());

    expect(response.status).toBe(401);
  });

  it('never includes the bot token in any response, success or rejection', async () => {
    const fixtureBotTokenSubstring = 'AAFixtureOnlyNotARealToken';
    const responses = await Promise.all([
      callTelegramSignIn(mintValidInitData()),
      callTelegramSignIn(tamperInitData(mintValidInitData())),
      callTelegramSignIn(mintStaleInitData()),
      callTelegramSignIn(mintInitDataSignedWithWrongBotToken()),
    ]);

    for (const response of responses) {
      const text = await response.clone().text();
      expect(text).not.toContain(fixtureBotTokenSubstring);
    }
  });

  it('cannot be pre-stolen via a direct email signup to the placeholder address', async () => {
    // Critical finding: `telegram-sign-in` maps a Telegram user to the
    // deterministic `telegram-<id>@telegram.invalid` and relies on
    // `admin.generateLink` to find-or-create that `auth.users` row. If
    // public email signup were open, an attacker who knows a Telegram id
    // could `POST /auth/v1/signup` with that exact email and a password of
    // their own choosing *before* the real user ever signs in, then keep
    // password access to the account `generateLink` later hands the real
    // Telegram user into. `[auth.email] enable_signup = false`
    // (`supabase/config.toml`) closes the public path this attack needs;
    // this test reproduces the attempt directly against the live stack
    // rather than only asserting the config line, and confirms the
    // legitimate Telegram sign-in for that same id still works untouched.
    const attackerTelegramUserId = 990_011;
    const placeholderEmail = `telegram-${attackerTelegramUserId}@telegram.invalid`;

    const signupResponse = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: placeholderEmail, password: 'attacker-chosen-password-123' }),
      signal: AbortSignal.timeout(20_000),
    });

    expect(signupResponse.status).toBe(400);
    const signupBody = (await signupResponse.json()) as { error_code?: string };
    expect(signupBody.error_code).toBe('email_provider_disabled');

    const signInResponse = await callTelegramSignIn(
      mintValidInitData({ telegramUserId: attackerTelegramUserId }),
    );
    expect(signInResponse.status).toBe(200);
  });

  it('answers the CORS preflight, carrying an Access-Control-Allow-Origin a browser accepts', async () => {
    // Empirically discovered running this test against the real local
    // stack (Supabase CLI 2.117.0): the local Kong gateway in front of every
    // Edge Function unconditionally injects `Access-Control-Allow-Origin: *`
    // onto any response whose request carries an `Origin` header — proven by
    // reproducing it against `whoami-check`, which sets no CORS header of
    // its own at all, and against a deliberately unlisted origin, both
    // getting `*` back. Kong runs *after* this function and overwrites
    // whatever specific-origin value `corsHeaders()` computed, so the
    // origin-restriction this function's own code implements is not what a
    // real browser observes locally today — `*` is. `corsHeaders`'s
    // specific-origin logic is still correct and still tested directly
    // (`supabase/functions/_shared/http.test.ts`,
    // `telegram-sign-in/index.test.ts`), which is what a deployment not
    // fronted by this same Kong default would actually rely on; this
    // integration assertion checks what a caller of the live local stack
    // can actually observe, not what the function alone would produce.
    const response = await fetch(TELEGRAM_SIGN_IN_URL, {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:5173' },
      signal: AbortSignal.timeout(20_000),
    });

    expect(response.status).toBe(204);
    const allowOrigin = response.headers.get('access-control-allow-origin');
    expect(allowOrigin === '*' || allowOrigin === 'http://127.0.0.1:5173').toBe(true);
  });
});
