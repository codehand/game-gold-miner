/**
 * Server-milestone Step 26 — attack 9: brute-forced recovery codes, pure half.
 *
 * Guards: Step 25's per-user **and** per-address limits, `recovery-code`'s
 * peppered `code_hash` (`RECOVERY_CODE_PEPPER`, 128-bit code entropy), and the
 * `redeemed_at is null and revoked_at is null` single-redemption predicate.
 *
 * Constraint 4 splits attack 9 across two layers, and this is the lower one:
 * the limiter and the format check are pure logic, so they are proven here
 * with an injected store and no Docker. The parts that need the real database
 * — that a wrong code touches no row, that the compare-and-swap admits exactly
 * one redemption, that the stored hash is peppered — are proven against the
 * live stack by the pure-guard suite's integration counterpart.
 *
 * ## What this suite deliberately does *not* claim
 *
 * Redemption has **no per-user limit before it resolves**, and cannot have
 * one: the endpoint's whole premise is that there is no caller identity until
 * the code has already been matched, and a post-match limit would run after
 * the compare-and-swap it exists to bound. The per-address limit is the
 * meaningful pre-resolution bound; 128-bit entropy is the real backstop. The
 * tests below pin that boundary honestly rather than implying a per-user
 * defence redemption does not have.
 */
import assert from 'node:assert/strict';

import { addressRateLimitKey, userRateLimitKey } from '../_shared/rateLimit.ts';
import {
  createRecoveryCodeRateLimiters,
  canonicalizeRecoveryCode,
  generateRecoveryCodePlaintext,
  handleRequest,
  RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS,
  RATE_LIMIT_MAX_GENERATES_PER_USER,
} from './index.ts';

const FIXTURE_USER_ID = '11111111-1111-1111-1111-111111111111';
const ATTACKER_ADDRESS = '203.0.113.9';
const OTHER_ADDRESS = '203.0.113.10';
/** A well-formed (32 canonical hex chars) but wrong code — the brute-force shape. */
const WRONG_CODE = 'ffff-ffff-ffff-ffff-ffff-ffff-ffff-ffff';

/**
 * A driver that consumes the **real** wired limiter configuration with an
 * injected clock, rather than restating its numbers — the same shape Step 25's
 * own `index.test.ts` uses, so a drift in the constants is a red test not a
 * stale literal.
 */
function drivenHandler() {
  let nowMs = 1_700_000_000_000;
  const limiters = createRecoveryCodeRateLimiters({ clockMs: () => nowMs });

  const redeem = (code: string, address: string | null = ATTACKER_ADDRESS): Promise<Response> =>
    handleRequest(redeemRequest(code, address), {
      ...unusedCollaborators(),
      // Below the limit a well-formed wrong code is answered by the real
      // compare-and-swap, so the store collaborator must *resolve* rather than
      // throw: this flood asserts the limiter, and a throwing stub would
      // reject out of `handleRedeem` on the first iteration and never let the
      // loop reach the `429` branch it exists to pin. `invalid` is exactly
      // what a wrong-but-well-formed code yields.
      redeemRecoveryCode: async () => ({ status: 'invalid' }),
      checkRedemptionRateLimit: (callerAddress) =>
        limiters.redemptionByAddress.check(addressRateLimitKey(callerAddress)),
      checkGenerateRateLimit: (userId) =>
        limiters.generateByUser.check(userRateLimitKey(userId)),
      readRedeemBody: async (request) => await request.text(),
      parseRedeemBody: (rawBody) => JSON.parse(rawBody),
    });

  const generate = (userId = FIXTURE_USER_ID): Promise<Response> =>
    handleRequest(
      new Request('http://localhost/v1/generate', {
        method: 'POST',
        headers: { authorization: 'Bearer a-valid-token' },
      }),
      {
        ...unusedCollaborators(),
        resolveCaller: async () => ({ userId }),
        rotateRecoveryCode: async () => {},
        checkRedemptionRateLimit: (callerAddress) =>
          limiters.redemptionByAddress.check(addressRateLimitKey(callerAddress)),
        checkGenerateRateLimit: (userId) =>
          limiters.generateByUser.check(userRateLimitKey(userId)),
      },
    );

  return {
    redeem,
    generate,
    advanceWindow: () => {
      nowMs += 60_000;
    },
    reset: () => limiters.resetRateLimitState(),
  };
}

/** Every collaborator a rejection path must never reach. */
function unusedCollaborators() {
  return {
    resolveCaller: async () => {
      throw new Error('resolveCaller should not have been called');
    },
    rotateRecoveryCode: async () => {
      throw new Error('rotateRecoveryCode should not have been called');
    },
    redeemRecoveryCode: async () => {
      throw new Error('redeemRecoveryCode should not have been called');
    },
    revertRecoveryCodeRedemption: async () => {
      throw new Error('revertRecoveryCodeRedemption should not have been called');
    },
    mintSessionForUser: async () => {
      throw new Error('mintSessionForUser should not have been called');
    },
    checkRedemptionRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    checkGenerateRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    readRedeemBody: async () => {
      throw new Error('readRedeemBody should not have been called');
    },
    parseRedeemBody: () => {
      throw new Error('parseRedeemBody should not have been called');
    },
    checkTestResetAuthorization: async () => false,
    resetRateLimitState: async () => {},
  };
}

function redeemRequest(code: string, address: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (address !== null) {
    headers['x-forwarded-for'] = address;
  }
  return new Request('http://localhost/v1/redeem', {
    method: 'POST',
    headers,
    body: JSON.stringify({ code }),
  });
}

// ---------------------------------------------------------------------------
// The per-address limit — the bound that actually applies before resolution
// ---------------------------------------------------------------------------

/**
 * Mutation: removing [the `checkRedemptionRateLimit` call in `handleRedeem`]
 * must make this red.
 */
Deno.test('attack 9 (brute-forced recovery codes): a sustained brute-force flood from one address is refused with a §10.2 429 once the budget is spent', async () => {
  const driver = drivenHandler();

  let refused: Response | null = null;
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS + 5; attempt += 1) {
    const response = await driver.redeem(WRONG_CODE);
    if (response.status === 429) {
      refused = response;
      break;
    }
    // Below the limit every attempt is answered as an invalid code — the
    // generic 401 the endpoint gives, never a distinct "wrong code" oracle.
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'recovery_code_invalid');
  }

  assert.notEqual(refused, null, 'the flood was never throttled');
  // AC8: the specific refusal — status, code, Retry-After, detail — not "not 200".
  const body = (await refused!.json()) as { error: { code: string; detail: { retryAfterSeconds: number } } };
  assert.equal(body.error.code, 'rate_limited');
  assert.equal(typeof body.error.detail.retryAfterSeconds, 'number');
  assert.equal(refused!.headers.get('retry-after'), String(body.error.detail.retryAfterSeconds));
  assert.ok(body.error.detail.retryAfterSeconds >= 1);
});

Deno.test('attack 9 (brute-forced recovery codes): the address budget rolls, so a legitimate player is never permanently locked out after a flood', async () => {
  const driver = drivenHandler();
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS; attempt += 1) {
    await driver.redeem(WRONG_CODE);
  }
  assert.equal((await driver.redeem(WRONG_CODE)).status, 429);

  driver.advanceWindow();

  const afterWindow = await driver.redeem(WRONG_CODE);
  assert.equal(afterWindow.status, 401);
});

Deno.test('attack 9 (brute-forced recovery codes): one address exhausting its budget does not throttle a different address', async () => {
  const driver = drivenHandler();
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS; attempt += 1) {
    await driver.redeem(WRONG_CODE, ATTACKER_ADDRESS);
  }
  assert.equal((await driver.redeem(WRONG_CODE, ATTACKER_ADDRESS)).status, 429);

  // A different real player behind a different address is untouched.
  assert.equal((await driver.redeem(WRONG_CODE, OTHER_ADDRESS)).status, 401);
});

/**
 * Mutation: removing [the per-user `checkGenerateRateLimit` call in
 * `handleGenerate`] must make this red. This is the per-user half Step 25
 * *added*; redemption's absent per-user half is asserted separately below.
 */
Deno.test('attack 9 (brute-forced recovery codes): repeated code generation is bounded per user, so one account cannot rotate its code unboundedly through the service role', async () => {
  const driver = drivenHandler();

  let throttled: Response | null = null;
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_GENERATES_PER_USER + 5; attempt += 1) {
    const response = await driver.generate();
    if (response.status === 429) {
      throttled = response;
      break;
    }
    assert.equal(response.status, 200);
  }

  assert.notEqual(throttled, null, 'the generate budget was never enforced');
  assert.equal((await throttled!.json()).error.code, 'rate_limited');
});

Deno.test('attack 9 (brute-forced recovery codes): the per-user generate budget is independent of the per-address redemption budget', async () => {
  const driver = drivenHandler();
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_GENERATES_PER_USER; attempt += 1) {
    await driver.generate();
  }
  assert.equal((await driver.generate()).status, 429);

  // Spending the generate budget keyed by user must not have touched the
  // redemption budget keyed by address — separate stores, separate keys.
  const redemption = await driver.redeem(WRONG_CODE, ATTACKER_ADDRESS);
  assert.equal(redemption.status, 401);
});

/**
 * The honest boundary, asserted rather than implied (constraint 3 / AC13 of
 * the parent task's sibling): redemption has no per-user limit before it
 * resolves, because there is no user to key it by. A test that claimed
 * otherwise would be pinning a defence this milestone does not have.
 */
Deno.test('attack 9 (brute-forced recovery codes): redemption is bounded by address alone before it resolves — there is no caller identity to key a per-user limit by', async () => {
  const seen: (string | null)[] = [];

  const response = await handleRequest(redeemRequest(WRONG_CODE, null), {
    ...unusedCollaborators(),
    checkRedemptionRateLimit: async (address) => {
      seen.push(address);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    redeemRecoveryCode: async () => ({ status: 'invalid' }),
    readRedeemBody: async (request) => await request.text(),
    parseRedeemBody: (rawBody) => JSON.parse(rawBody),
  });

  // The only key the pre-resolution limiter can be handed is an address (here
  // `null`, because no address is observable at all).
  assert.deepEqual(seen, [null]);
  assert.equal(response.status, 401);
});

// ---------------------------------------------------------------------------
// The format predicate — a flood cannot be spent before the cheap check
// ---------------------------------------------------------------------------

/**
 * Guard: `handleRedeem`'s `/^[0-9a-f]{32}$/` test, which runs *before*
 * `redeemRecoveryCode` — the service-role write path.
 * Mutation: removing [that format check] must make this red.
 */
Deno.test('attack 9 (brute-forced recovery codes): a malformed or truncated code is refused before it can cost a service-role redemption attempt', async () => {
  // Each shape gets the §4 code that actually belongs to it. An empty body
  // field is a client bug (`400 malformed_request`, refused before the code is
  // even canonicalized); every non-empty but non-canonical shape is
  // `401 recovery_code_invalid`, indistinguishable from a well-formed wrong
  // code so the endpoint is not a format oracle. Both are refusals that never
  // reach the peppered compare; the throwing `redeemRecoveryCode` below is
  // what proves that.
  const malformed: readonly (readonly [string, number, string])[] = [
    ['', 400, 'malformed_request'],
    ['nope', 401, 'recovery_code_invalid'],
    ['ffff', 401, 'recovery_code_invalid'],
    ['z'.repeat(32), 401, 'recovery_code_invalid'],
    ['f'.repeat(31), 401, 'recovery_code_invalid'],
    ['f'.repeat(33), 401, 'recovery_code_invalid'],
  ];

  for (const [malformedCode, expectedStatus, expectedCode] of malformed) {
    const response = await handleRequest(redeemRequest(malformedCode, ATTACKER_ADDRESS), {
      ...unusedCollaborators(),
      redeemRecoveryCode: async () => {
        throw new Error('a malformed code must never reach redeemRecoveryCode');
      },
      readRedeemBody: async (request) => await request.text(),
      parseRedeemBody: (rawBody) => JSON.parse(rawBody),
    });

    assert.equal(response.status, expectedStatus, `"${malformedCode}" should be refused`);
    assert.equal((await response.json()).error.code, expectedCode, `"${malformedCode}" code`);
  }
});

Deno.test('attack 9 (brute-forced recovery codes): a wrong-but-well-formed code reaches the compare-and-swap and is reported with the same generic response as a malformed one', async () => {
  let reachedTheStore = false;

  const response = await handleRequest(redeemRequest(WRONG_CODE, ATTACKER_ADDRESS), {
    ...unusedCollaborators(),
    redeemRecoveryCode: async () => {
      reachedTheStore = true;
      return { status: 'invalid' };
    },
    readRedeemBody: async (request) => await request.text(),
    parseRedeemBody: (rawBody) => JSON.parse(rawBody),
  });

  assert.equal(reachedTheStore, true);
  assert.equal(response.status, 401);
  // The same shape a malformed code gets — nothing here tells an attacker
  // whether the format or the value was wrong.
  assert.equal((await response.json()).error.code, 'recovery_code_invalid');
});

// ---------------------------------------------------------------------------
// 128-bit entropy — the real backstop behind the limiter
// ---------------------------------------------------------------------------

/**
 * Guard: `CODE_BYTE_LENGTH = 16` (`crypto.getRandomValues` over 16 bytes).
 * Mutation: lowering [that constant] must make this red.
 */
Deno.test('attack 9 (brute-forced recovery codes): generated codes carry 128 bits of entropy and never repeat, which is the bound the limiter only backs up', () => {
  const generated = new Set<string>();
  for (let index = 0; index < 200; index += 1) {
    const plaintext = generateRecoveryCodePlaintext();
    // 16 bytes rendered as a grouped 32-char hex string.
    assert.match(plaintext, /^[0-9a-f]{4}(-[0-9a-f]{4}){7}$/);
    assert.equal(canonicalizeRecoveryCode(plaintext).length, 32);
    generated.add(plaintext);
  }

  // A collision across 200 draws from a 2^128 space would be an unambiguous
  // entropy defect, not bad luck.
  assert.equal(generated.size, 200);
});
