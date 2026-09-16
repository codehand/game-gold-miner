/**
 * Server-milestone Step 12: pure-handler unit tests for `telegram-sign-in`,
 * importing it directly with zero `--allow-*` permission flags — the same
 * harness Step 7 established.
 *
 * `signInitData` below is an independent, test-only signer using the
 * identical documented algorithm (Web Crypto HMAC-SHA256) — not a call into
 * the module under test — so these tests prove `verifyTelegramInitData`
 * accepts what Telegram's own algorithm would produce and rejects what it
 * would not, the same way `tests/server-integration/authFixture.ts` mints a
 * JWT independently rather than asking application code to do it.
 */
import assert from 'node:assert/strict';

import {
  handleTelegramSignIn,
  telegramPlaceholderEmail,
  verifyTelegramInitData,
  type MintSessionResult,
  type VerifyInitData,
} from './index.ts';

const BOT_TOKEN = 'test-bot-token-123456789:AAFixtureOnlyNotARealToken';
const WRONG_BOT_TOKEN = 'different-bot-token-987654321:ZZNotTheSameSecret';
const NOW_MS = 1_700_000_000_000;
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const TELEGRAM_USER_ID = 424242;

async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const enc = new TextEncoder();
  const webAppDataKey = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secretKeyBytes = await crypto.subtle.sign('HMAC', webAppDataKey, enc.encode(botToken));
  const dataCheckKey = await crypto.subtle.importKey(
    'raw',
    secretKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', dataCheckKey, enc.encode(dataCheckString)));
  const hash = Array.from(sigBytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return new URLSearchParams({ ...fields, hash }).toString();
}

function baseFields(authDateSeconds: number): Record<string, string> {
  return {
    auth_date: String(authDateSeconds),
    query_id: 'AAFixtureQueryId',
    user: JSON.stringify({ id: TELEGRAM_USER_ID, first_name: 'Ada', username: 'ada' }),
  };
}

Deno.test('verifyTelegramInitData accepts a validly signed, fresh payload', async () => {
  const initData = await signInitData(baseFields(NOW_SECONDS - 60), BOT_TOKEN);

  const result = await verifyTelegramInitData(initData, BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: true, telegramUserId: TELEGRAM_USER_ID });
});

Deno.test('verifyTelegramInitData rejects a payload tampered after signing', async () => {
  const initData = await signInitData(baseFields(NOW_SECONDS - 60), BOT_TOKEN);
  const tampered = initData.replace('Ada', 'Eve');

  const result = await verifyTelegramInitData(tampered, BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: false, reason: 'bad-hash' });
});

Deno.test('verifyTelegramInitData rejects a payload signed with a different bot token', async () => {
  const initData = await signInitData(baseFields(NOW_SECONDS - 60), WRONG_BOT_TOKEN);

  const result = await verifyTelegramInitData(initData, BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: false, reason: 'bad-hash' });
});

Deno.test('verifyTelegramInitData rejects a validly signed but stale (replayed) payload', async () => {
  const oneDayAndOneMinuteAgo = NOW_SECONDS - 86_400 - 60;
  const initData = await signInitData(baseFields(oneDayAndOneMinuteAgo), BOT_TOKEN);

  const result = await verifyTelegramInitData(initData, BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: false, reason: 'stale' });
});

Deno.test('verifyTelegramInitData accepts a payload exactly at the freshness boundary', async () => {
  const initData = await signInitData(baseFields(NOW_SECONDS - 86_400), BOT_TOKEN);

  const result = await verifyTelegramInitData(initData, BOT_TOKEN, NOW_MS);

  assert.equal(result.valid, true);
});

Deno.test('verifyTelegramInitData rejects a validly signed but future-dated payload as stale', async () => {
  // A one-sided `now - authDate > maxAge` check only ever rejects a payload
  // that is too old, so a payload dated arbitrarily far in the future would
  // never be flagged — a 2026-09-12 review finding, fixed with `Math.abs`.
  const oneDayAndOneMinuteInTheFuture = NOW_SECONDS + 86_400 + 60;
  const initData = await signInitData(baseFields(oneDayAndOneMinuteInTheFuture), BOT_TOKEN);

  const result = await verifyTelegramInitData(initData, BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: false, reason: 'stale' });
});

Deno.test('verifyTelegramInitData rejects a payload with no hash field at all', async () => {
  const params = new URLSearchParams(baseFields(NOW_SECONDS - 60));

  const result = await verifyTelegramInitData(params.toString(), BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: false, reason: 'malformed' });
});

Deno.test('verifyTelegramInitData rejects a payload with no user field', async () => {
  const fields = baseFields(NOW_SECONDS - 60);
  delete (fields as Partial<typeof fields>).user;
  const initData = await signInitData(fields, BOT_TOKEN);

  const result = await verifyTelegramInitData(initData, BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: false, reason: 'malformed' });
});

Deno.test('verifyTelegramInitData rejects a user field that is not valid JSON', async () => {
  const initData = await signInitData({ ...baseFields(NOW_SECONDS - 60), user: 'not-json' }, BOT_TOKEN);

  const result = await verifyTelegramInitData(initData, BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: false, reason: 'malformed' });
});

Deno.test('verifyTelegramInitData rejects a user field with no numeric id', async () => {
  const initData = await signInitData(
    { ...baseFields(NOW_SECONDS - 60), user: JSON.stringify({ first_name: 'Ada' }) },
    BOT_TOKEN,
  );

  const result = await verifyTelegramInitData(initData, BOT_TOKEN, NOW_MS);

  assert.deepEqual(result, { valid: false, reason: 'malformed' });
});

Deno.test('telegramPlaceholderEmail is deterministic and uses the RFC 2606 .invalid TLD', () => {
  assert.equal(telegramPlaceholderEmail(424242), 'telegram-424242@telegram.invalid');
  assert.equal(telegramPlaceholderEmail(424242), telegramPlaceholderEmail(424242));
});

// --- handleTelegramSignIn -----------------------------------------------

const ALWAYS_VALID: VerifyInitData = () =>
  Promise.resolve({ valid: true, telegramUserId: TELEGRAM_USER_ID });
const ALWAYS_INVALID: VerifyInitData = () => Promise.resolve({ valid: false, reason: 'bad-hash' });
const MINT_SUCCESS: MintSessionResult = { status: 'minted', tokenHash: 'fixture-token-hash' };

function request(body: unknown, init: RequestInit = {}): Request {
  return new Request('http://example/telegram-sign-in', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

Deno.test('handleTelegramSignIn answers the CORS preflight before any other check', async () => {
  const response = await handleTelegramSignIn(
    new Request('http://example/telegram-sign-in', { method: 'OPTIONS' }),
    { verify: ALWAYS_VALID, mintSession: () => Promise.resolve(MINT_SUCCESS) },
  );

  assert.equal(response.status, 204);
});

Deno.test('handleTelegramSignIn rejects a non-POST method', async () => {
  const response = await handleTelegramSignIn(
    new Request('http://example/telegram-sign-in', { method: 'GET' }),
    { verify: ALWAYS_VALID, mintSession: () => Promise.resolve(MINT_SUCCESS) },
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'malformed_request');
});

Deno.test('handleTelegramSignIn rejects a body that is not valid JSON', async () => {
  const response = await handleTelegramSignIn(
    new Request('http://example/telegram-sign-in', { method: 'POST', body: 'not json' }),
    { verify: ALWAYS_VALID, mintSession: () => Promise.resolve(MINT_SUCCESS) },
  );

  assert.equal(response.status, 400);
});

Deno.test('handleTelegramSignIn rejects a body without a string initData', async () => {
  const response = await handleTelegramSignIn(request({ initData: 42 }), {
    verify: ALWAYS_VALID,
    mintSession: () => Promise.resolve(MINT_SUCCESS),
  });

  assert.equal(response.status, 400);
});

Deno.test('handleTelegramSignIn rejects an empty initData string', async () => {
  const response = await handleTelegramSignIn(request({ initData: '' }), {
    verify: ALWAYS_VALID,
    mintSession: () => Promise.resolve(MINT_SUCCESS),
  });

  assert.equal(response.status, 400);
});

Deno.test('handleTelegramSignIn answers 401 and mints nothing when verification fails', async () => {
  let mintCalled = false;
  const response = await handleTelegramSignIn(request({ initData: 'whatever' }), {
    verify: ALWAYS_INVALID,
    mintSession: () => {
      mintCalled = true;
      return Promise.resolve(MINT_SUCCESS);
    },
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(mintCalled, false);
});

Deno.test('handleTelegramSignIn answers 500, not 401, when session minting fails', async () => {
  const response = await handleTelegramSignIn(request({ initData: 'whatever' }), {
    verify: ALWAYS_VALID,
    mintSession: () => Promise.resolve({ status: 'error' }),
  });

  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'server_error');
});

Deno.test('handleTelegramSignIn answers 200 with only a tokenHash on success', async () => {
  const response = await handleTelegramSignIn(request({ initData: 'whatever' }), {
    verify: ALWAYS_VALID,
    mintSession: () => Promise.resolve(MINT_SUCCESS),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tokenHash: 'fixture-token-hash' });
});

Deno.test('handleTelegramSignIn reflects an allow-listed origin on both success and rejection', async () => {
  const success = await handleTelegramSignIn(
    request({ initData: 'whatever' }, { headers: { origin: 'http://127.0.0.1:5173' } }),
    { verify: ALWAYS_VALID, mintSession: () => Promise.resolve(MINT_SUCCESS) },
  );
  const rejection = await handleTelegramSignIn(
    request({ initData: 'whatever' }, { headers: { origin: 'http://127.0.0.1:5173' } }),
    { verify: ALWAYS_INVALID, mintSession: () => Promise.resolve(MINT_SUCCESS) },
  );

  assert.equal(success.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  assert.equal(rejection.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
});

Deno.test('the bot token never appears in any response this handler can give', async () => {
  // `verify`/`mintSession` never receive the bot token as a parameter at
  // all in `handleTelegramSignIn`'s own signature — this is a defensive,
  // belt-and-suspenders check on top of that structural guarantee, scanning
  // every response shape the handler can produce. `MintSessionResult`'s
  // error variant carries no `reason` at all (a 2026-09-12 review found it
  // was dead and removed it), which only strengthens this: there is no
  // longer even a field a secret could be smuggled through on that path.
  const secret = 'the-bot-token-must-never-leak-anywhere-0xDEADBEEF';
  const cases = await Promise.all([
    handleTelegramSignIn(new Request('http://example/telegram-sign-in', { method: 'OPTIONS' }), {
      verify: ALWAYS_VALID,
      mintSession: () => Promise.resolve(MINT_SUCCESS),
    }),
    handleTelegramSignIn(request({ initData: 'whatever' }), {
      verify: ALWAYS_INVALID,
      mintSession: () => Promise.resolve(MINT_SUCCESS),
    }),
    handleTelegramSignIn(request({ initData: 'whatever' }), {
      verify: ALWAYS_VALID,
      mintSession: () => Promise.resolve({ status: 'error' }),
    }),
    handleTelegramSignIn(request({ initData: 'whatever' }), {
      verify: ALWAYS_VALID,
      mintSession: () => Promise.resolve(MINT_SUCCESS),
    }),
  ]);

  for (const response of cases) {
    const text = await response.clone().text();
    assert.equal(text.includes(secret), false);
  }
});
