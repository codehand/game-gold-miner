/**
 * Server-milestone Step 26 — attack 7: unverified Telegram payloads.
 *
 * Guard: `verifyTelegramInitData`'s HMAC-SHA256 `WebAppData` derivation and its
 * `timingSafeEqualHex` comparison. Constraint 4 puts this here — it is pure
 * logic (Web Crypto and an injected clock, no network, no `Deno.env`), so it
 * runs under `deno test` with no permission flags and no Docker, against a real
 * second implementation of the same published algorithm
 * (`initDataSignerFixture.ts`).
 *
 * The five vectors `TASK-004`'s body names are each a separately named test:
 * bad hash, replayed `auth_date`, reordered/extra fields, missing hash, and a
 * hash valid under a *different* bot token.
 */
import assert from 'node:assert/strict';

import { verifyTelegramInitData } from './index.ts';
import {
  baseInitDataFields,
  FIXTURE_BOT_TOKEN,
  FIXTURE_TELEGRAM_USER_ID,
  signInitData,
} from './initDataSignerFixture.ts';

const NOW_SECONDS = 1_700_000_000;
const NOW_MS = NOW_SECONDS * 1_000;
const WRONG_BOT_TOKEN = 'different-bot-token-987654321:ZZNotTheSameSecret';
const MAX_INIT_DATA_AGE_SECONDS = 86_400;

function verify(initData: string, botToken = FIXTURE_BOT_TOKEN) {
  return verifyTelegramInitData(initData, botToken, NOW_MS);
}

// ---------------------------------------------------------------------------
// Control: the attack suite must not be vacuous
// ---------------------------------------------------------------------------

Deno.test('attack 7 (unverified Telegram payloads): control — a correctly signed, fresh payload is accepted, so the rejections below are meaningful', async () => {
  const initData = await signInitData(baseInitDataFields(NOW_SECONDS - 60), FIXTURE_BOT_TOKEN);
  const result = await verify(initData);

  assert.equal(result.valid, true);
  assert.equal(result.valid && result.telegramUserId, FIXTURE_TELEGRAM_USER_ID);
});

// ---------------------------------------------------------------------------
// Vector 1 — tampered after signing (a bad hash)
// ---------------------------------------------------------------------------

/**
 * Mutation: replacing `timingSafeEqualHex(computed, hash)` with `true` (or
 * dropping the comparison) must make this red.
 */
Deno.test('attack 7 (unverified Telegram payloads): a payload tampered after signing is refused as bad-hash', async () => {
  const initData = await signInitData(baseInitDataFields(NOW_SECONDS - 60), FIXTURE_BOT_TOKEN);
  const tampered = initData.replace('Ada', 'Eve');

  assert.notEqual(tampered, initData);
  const result = await verify(tampered);

  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, 'bad-hash');
});

Deno.test('attack 7 (unverified Telegram payloads): a payload whose signed hash is replaced with a well-formed but wrong digest is refused', async () => {
  const initData = await signInitData(baseInitDataFields(NOW_SECONDS - 60), FIXTURE_BOT_TOKEN);
  const params = new URLSearchParams(initData);
  params.set('hash', 'a'.repeat(64));

  const result = await verify(params.toString());

  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, 'bad-hash');
});

// ---------------------------------------------------------------------------
// Vector 2 — replayed auth_date (stale, and the mirror case: future-dated)
// ---------------------------------------------------------------------------

/**
 * Mutation: removing [the `Math.abs(nowSeconds - authDateSeconds) > maxAge`
 * check] must make this red.
 */
Deno.test('attack 7 (unverified Telegram payloads): a validly signed but stale (replayed) payload is refused', async () => {
  const initData = await signInitData(
    baseInitDataFields(NOW_SECONDS - MAX_INIT_DATA_AGE_SECONDS - 60),
    FIXTURE_BOT_TOKEN,
  );

  const result = await verify(initData);

  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, 'stale');
});

Deno.test('attack 7 (unverified Telegram payloads): a validly signed but future-dated payload is refused, so a replayed payload cannot dodge freshness by dating itself forward', async () => {
  // The asymmetry `Math.abs` closes: a one-sided "too old" check would accept
  // this outright.
  const initData = await signInitData(
    baseInitDataFields(NOW_SECONDS + MAX_INIT_DATA_AGE_SECONDS + 60),
    FIXTURE_BOT_TOKEN,
  );

  const result = await verify(initData);

  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, 'stale');
});

// ---------------------------------------------------------------------------
// Vector 3 — reordered and extra fields
// ---------------------------------------------------------------------------

/**
 * Mutation: changing the data-check-string builder to concatenate fields in
 * **received** order rather than sorting them must make this red — and this is
 * the one vector whose correct behaviour is *acceptance*, because Telegram's
 * own algorithm sorts.
 */
Deno.test('attack 7 (unverified Telegram payloads): a reordered payload signed under Telegram\'s sorting rule is still accepted, proving the verifier does not depend on received order', async () => {
  const initData = await signInitData(baseInitDataFields(NOW_SECONDS - 60), FIXTURE_BOT_TOKEN);
  const reordered = new URLSearchParams([...new URLSearchParams(initData).entries()].reverse()).toString();

  assert.notEqual(reordered, initData);
  const result = await verify(reordered);

  assert.equal(result.valid, true);
});

/**
 * Mutation: building the data-check-string from `params` *after* the untrusted
 * extra field has been merged in (rather than treating only signed pairs as
 * covered) must make this red.
 */
Deno.test('attack 7 (unverified Telegram payloads): a field appended after signing is refused, because the signature never covered it', async () => {
  const initData = await signInitData(baseInitDataFields(NOW_SECONDS - 60), FIXTURE_BOT_TOKEN);
  const withExtra = `${initData}&role=admin`;

  const result = await verify(withExtra);

  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, 'bad-hash');
});

// ---------------------------------------------------------------------------
// Vector 4 — missing hash
// ---------------------------------------------------------------------------

/**
 * Mutation: removing [the `hash === null` early return] must make this red.
 */
Deno.test('attack 7 (unverified Telegram payloads): a payload with no hash field at all is refused as malformed', async () => {
  const initData = await signInitData(baseInitDataFields(NOW_SECONDS - 60), FIXTURE_BOT_TOKEN);
  const params = new URLSearchParams(initData);
  params.delete('hash');

  const result = await verify(params.toString());

  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, 'malformed');
});

Deno.test('attack 7 (unverified Telegram payloads): an empty hash field is refused rather than compared as equal-length garbage', async () => {
  const initData = await signInitData(baseInitDataFields(NOW_SECONDS - 60), FIXTURE_BOT_TOKEN);
  const params = new URLSearchParams(initData);
  params.set('hash', '');

  const result = await verify(params.toString());

  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// Vector 5 — a hash valid under a different bot token
// ---------------------------------------------------------------------------

/**
 * Mutation: making the `WebAppData` secret-key derivation use a constant
 * instead of the configured bot token must make this red.
 */
Deno.test('attack 7 (unverified Telegram payloads): a payload correctly signed under a different bot token is refused by the deployment that does not hold that token', async () => {
  const foreign = await signInitData(baseInitDataFields(NOW_SECONDS - 60), WRONG_BOT_TOKEN);

  const result = await verify(foreign);

  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, 'bad-hash');
});
