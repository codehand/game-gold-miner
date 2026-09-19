/**
 * Server-milestone Step 14: pure-handler unit tests for `recovery-code`,
 * importing it directly with zero `--allow-*` permission flags — the same
 * harness Step 7 established. Every collaborator that would need
 * `RECOVERY_CODE_PEPPER`/`SUPABASE_SERVICE_ROLE_KEY` from `Deno.env` is
 * injected and faked here; the one real implementation of each
 * (`rotateRecoveryCodeViaServiceRole`, `redeemRecoveryCodeViaServiceRole`,
 * `mintSessionForUserViaGenerateLink`, `resolveCallerViaSupabaseAuth`) is
 * exercised only by `tests/server-integration/recovery-code.integration.test.ts`,
 * against the live stack.
 */
import assert from 'node:assert/strict';

import { MAX_REQUEST_BODY_BYTES } from '../_shared/http.ts';
import {
  canonicalizeRecoveryCode,
  createRecoveryCodeRateLimiters,
  generateRecoveryCodePlaintext,
  handleRequest,
  RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS,
  recoveryPlaceholderEmail,
  resolveFunctionRoute,
  type RecoveryCodeDeps,
} from './index.ts';

const FIXTURE_USER_ID = '11111111-1111-1111-1111-111111111111';
const VALID_TOKEN = 'a-valid-token';

function noopDeps(overrides: Partial<RecoveryCodeDeps> = {}): RecoveryCodeDeps {
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
    writeAuditEvent: async () => {
      throw new Error('writeAuditEvent should not have been called');
    },
    // Step 25: permissive by default, so every test that predates this step
    // keeps exercising its own subject rather than a bucket.
    checkRedemptionRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    checkGenerateRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    readRedeemBody: async (request) => await request.text(),
    parseRedeemBody: (rawBody) => JSON.parse(rawBody),
    checkTestResetAuthorization: async () => {
      throw new Error('checkTestResetAuthorization should not have been called');
    },
    resetRateLimitState: async () => {
      throw new Error('resetRateLimitState should not have been called');
    },
    ...overrides,
  };
}

function generateRequest(init: { readonly token?: string | null } = {}): Request {
  const { token = VALID_TOKEN } = init;
  const headers: Record<string, string> = {};
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request('http://localhost/v1/generate', { method: 'POST', headers });
}

function redeemRequest(body: unknown, init: { readonly rawBody?: string; readonly address?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.address !== undefined) {
    headers['x-forwarded-for'] = init.address;
  }
  return new Request('http://localhost/v1/redeem', {
    method: 'POST',
    headers,
    body: init.rawBody ?? JSON.stringify(body),
  });
}

Deno.test('resolveFunctionRoute strips the platform and function route prefixes', () => {
  assert.equal(
    resolveFunctionRoute('https://x.supabase.co/functions/v1/recovery-code/v1/generate'),
    '/v1/generate',
  );
  assert.equal(
    resolveFunctionRoute('https://x.supabase.co/functions/v1/recovery-code/v1/redeem'),
    '/v1/redeem',
  );
});

Deno.test('canonicalizeRecoveryCode strips dashes and whitespace and lowercases', () => {
  assert.equal(canonicalizeRecoveryCode('AbCd-EF01-2345-6789-aaaa-bbbb-cccc-dddd'), 'abcdef0123456789aaaabbbbccccdddd');
  assert.equal(canonicalizeRecoveryCode('  abcd ef01 2345 6789aaaabbbbccccdddd  '), 'abcdef0123456789aaaabbbbccccdddd');
});

Deno.test('generateRecoveryCodePlaintext produces a 32-hex-character code grouped into dashes, and is not deterministic', () => {
  const first = generateRecoveryCodePlaintext();
  const second = generateRecoveryCodePlaintext();

  assert.match(first, /^[0-9a-f]{4}(-[0-9a-f]{4}){7}$/);
  assert.equal(canonicalizeRecoveryCode(first).length, 32);
  assert.notEqual(first, second);
});

Deno.test('recoveryPlaceholderEmail is deterministic and uses the RFC 2606 .invalid TLD', () => {
  assert.equal(recoveryPlaceholderEmail(FIXTURE_USER_ID), `recovery-${FIXTURE_USER_ID}@recovery.invalid`);
  assert.equal(recoveryPlaceholderEmail(FIXTURE_USER_ID), recoveryPlaceholderEmail(FIXTURE_USER_ID));
});

Deno.test('handleRequest answers a CORS preflight on both routes before any other check', async () => {
  const generate = await handleRequest(
    new Request('http://localhost/v1/generate', { method: 'OPTIONS' }),
    noopDeps(),
  );
  const redeem = await handleRequest(
    new Request('http://localhost/v1/redeem', { method: 'OPTIONS' }),
    noopDeps(),
  );

  assert.equal(generate.status, 204);
  assert.equal(redeem.status, 204);
});

Deno.test('handleRequest answers malformed_request for an unknown route', async () => {
  const response = await handleRequest(new Request('http://localhost/v1/does-not-exist'), noopDeps());

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'malformed_request');
});

Deno.test('handleRequest rejects a non-POST method on both routes', async () => {
  const generate = await handleRequest(new Request('http://localhost/v1/generate'), noopDeps());
  const redeem = await handleRequest(new Request('http://localhost/v1/redeem'), noopDeps());

  assert.equal(generate.status, 400);
  assert.equal(redeem.status, 400);
});

Deno.test('handleGenerate answers 401 with no Authorization header', async () => {
  const response = await handleRequest(generateRequest({ token: null }), noopDeps());

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

Deno.test('handleGenerate answers 401 when the resolver rejects the token', async () => {
  const response = await handleRequest(
    generateRequest(),
    noopDeps({ resolveCaller: async () => null }),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
});

Deno.test('handleGenerate answers 200 with a plaintext code and rotates it for the caller', async () => {
  let rotated: { userId: string; canonicalCode: string } | null = null;
  const response = await handleRequest(
    generateRequest(),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      rotateRecoveryCode: async (userId, canonicalCode) => {
        rotated = { userId, canonicalCode };
      },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.code, /^[0-9a-f]{4}(-[0-9a-f]{4}){7}$/);
  assert.deepEqual(rotated, { userId: FIXTURE_USER_ID, canonicalCode: canonicalizeRecoveryCode(body.code) });
});

Deno.test('handleRedeem passes null to checkRedemptionRateLimit when no X-Forwarded-For header is sent', async () => {
  // A 2026-09-12 review finding: bucketing every header-less caller into one
  // shared address would let any single such caller throttle every other
  // one globally. Passing `null` through lets the rate limiter itself decide
  // to let these requests through instead.
  let seenAddress: string | null | undefined;
  await handleRequest(
    redeemRequest({ code: 'not-hex' }),
    noopDeps({
      checkRedemptionRateLimit: async (address) => {
        seenAddress = address;
        return { allowed: true, retryAfterSeconds: 0 };
      },
    }),
  );

  assert.equal(seenAddress, null);
});

Deno.test('handleRedeem passes the last X-Forwarded-For hop to checkRedemptionRateLimit', async () => {
  let seenAddress: string | null | undefined;
  await handleRequest(
    redeemRequest(
      { code: 'not-hex' },
      { address: '203.0.113.7, 198.51.100.20' },
    ),
    noopDeps({
      checkRedemptionRateLimit: async (address) => {
        seenAddress = address;
        return { allowed: true, retryAfterSeconds: 0 };
      },
    }),
  );

  assert.equal(seenAddress, '198.51.100.20');
});

Deno.test('handleRedeem answers 429 rate_limited before reading the body at all', async () => {
  let bodyWasRead = false;
  let parseWasCalled = false;
  const response = await handleRequest(
    redeemRequest({ code: 'whatever' }),
    noopDeps({
      checkRedemptionRateLimit: async () => ({ allowed: false, retryAfterSeconds: 60 }),
      readRedeemBody: async () => {
        bodyWasRead = true;
        return '{}';
      },
      parseRedeemBody: () => {
        parseWasCalled = true;
        return {};
      },
    }),
  );

  assert.equal(response.status, 429);
  // Step 25: §10.2's exact shape, including the Retry-After the limiter
  // reported rather than a hardcoded one.
  assert.equal(response.headers.get('retry-after'), '60');
  assert.deepEqual(await response.json(), {
    error: { code: 'rate_limited', message: 'Too many requests.', detail: { retryAfterSeconds: 60 } },
  });
  assert.equal(bodyWasRead, false, 'a throttled request must not read its body');
  assert.equal(parseWasCalled, false);
});

Deno.test('handleRedeem answers 400 for a body that is not valid JSON', async () => {
  const response = await handleRequest(redeemRequest(undefined, { rawBody: 'not json' }), noopDeps());

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'malformed_request');
});

Deno.test('handleRedeem answers 400 for a body without a non-empty code string', async () => {
  const missing = await handleRequest(redeemRequest({}), noopDeps());
  const empty = await handleRequest(redeemRequest({ code: '   ' }), noopDeps());
  const wrongType = await handleRequest(redeemRequest({ code: 12345 }), noopDeps());

  for (const response of [missing, empty, wrongType]) {
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'malformed_request');
  }
});

Deno.test('handleRedeem answers recovery_code_invalid for a malformed code, never reaching redeemRecoveryCode', async () => {
  let redeemCalled = false;
  const response = await handleRequest(
    redeemRequest({ code: 'too-short' }),
    noopDeps({
      redeemRecoveryCode: async () => {
        redeemCalled = true;
        return { status: 'invalid' };
      },
    }),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'recovery_code_invalid');
  assert.equal(redeemCalled, false);
});

Deno.test('handleRedeem accepts a code with or without its display dashes, canonicalizing identically', async () => {
  const canonical = 'a'.repeat(32);
  const withDashes = 'aaaa-aaaa-aaaa-aaaa-aaaa-aaaa-aaaa-aaaa';
  const seen: string[] = [];
  const deps = noopDeps({
    redeemRecoveryCode: async (candidate) => {
      seen.push(candidate);
      return { status: 'redeemed', userId: FIXTURE_USER_ID };
    },
    mintSessionForUser: async () => ({ status: 'minted', tokenHash: 'a-token-hash' }),
  });

  await handleRequest(redeemRequest({ code: withDashes }), deps);
  await handleRequest(redeemRequest({ code: canonical.toUpperCase() }), deps);

  assert.deepEqual(seen, [canonical, canonical]);
});

Deno.test('handleRedeem answers recovery_code_invalid, not a distinct code, for an already-redeemed or unknown code', async () => {
  const response = await handleRequest(
    redeemRequest({ code: 'a'.repeat(32) }),
    noopDeps({ redeemRecoveryCode: async () => ({ status: 'invalid' }) }),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'recovery_code_invalid');
});

Deno.test('handleRedeem answers 500, not 401, when session minting fails after a valid redemption', async () => {
  const response = await handleRequest(
    redeemRequest({ code: 'a'.repeat(32) }),
    noopDeps({
      redeemRecoveryCode: async () => ({ status: 'redeemed', userId: FIXTURE_USER_ID }),
      mintSessionForUser: async () => ({ status: 'error' }),
      revertRecoveryCodeRedemption: async () => {},
    }),
  );

  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'server_error');
});

Deno.test('handleRedeem reverts the redemption when minting fails, so the code is not permanently burned', async () => {
  const canonical = 'a'.repeat(32);
  let reverted: string | null = null;
  const response = await handleRequest(
    redeemRequest({ code: canonical }),
    noopDeps({
      redeemRecoveryCode: async () => ({ status: 'redeemed', userId: FIXTURE_USER_ID }),
      mintSessionForUser: async () => ({ status: 'error' }),
      revertRecoveryCodeRedemption: async (candidate) => {
        reverted = candidate;
      },
    }),
  );

  assert.equal(response.status, 500);
  assert.equal(reverted, canonical);
});

Deno.test('handleRedeem still answers 500 even when the revert itself fails', async () => {
  const response = await handleRequest(
    redeemRequest({ code: 'a'.repeat(32) }),
    noopDeps({
      redeemRecoveryCode: async () => ({ status: 'redeemed', userId: FIXTURE_USER_ID }),
      mintSessionForUser: async () => ({ status: 'error' }),
      revertRecoveryCodeRedemption: async () => {
        throw new Error('simulated revert failure');
      },
    }),
  );

  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'server_error');
});

Deno.test('handleRedeem does not revert the redemption on a successful mint', async () => {
  let revertCalled = false;
  const response = await handleRequest(
    redeemRequest({ code: 'a'.repeat(32) }),
    noopDeps({
      redeemRecoveryCode: async () => ({ status: 'redeemed', userId: FIXTURE_USER_ID }),
      mintSessionForUser: async () => ({ status: 'minted', tokenHash: 'a-real-token-hash' }),
      revertRecoveryCodeRedemption: async () => {
        revertCalled = true;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(revertCalled, false);
});

Deno.test('handleRedeem records a redemption only after a successful mint', async () => {
  let seen: unknown = null;
  const response = await handleRequest(
    redeemRequest({ code: 'a'.repeat(32) }),
    noopDeps({
      redeemRecoveryCode: async () => ({ status: 'redeemed', userId: FIXTURE_USER_ID }),
      mintSessionForUser: async () => ({ status: 'minted', tokenHash: 'a-real-token-hash' }),
      writeAuditEvent: async (event) => {
        seen = event;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(seen, {
    eventType: 'recovery_code_redeemed',
    userId: FIXTURE_USER_ID,
    actorType: 'user',
    detail: null,
  });
});

Deno.test('handleRedeem keeps a successful recovery successful when audit logging fails', async () => {
  const response = await handleRequest(
    redeemRequest({ code: 'a'.repeat(32) }),
    noopDeps({
      redeemRecoveryCode: async () => ({ status: 'redeemed', userId: FIXTURE_USER_ID }),
      mintSessionForUser: async () => ({ status: 'minted', tokenHash: 'a-real-token-hash' }),
      writeAuditEvent: async () => {
        throw new Error('simulated audit outage');
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tokenHash: 'a-real-token-hash' });
});

Deno.test('handleRedeem answers 200 with only a tokenHash on a successful redemption', async () => {
  const response = await handleRequest(
    redeemRequest({ code: 'a'.repeat(32) }),
    noopDeps({
      redeemRecoveryCode: async () => ({ status: 'redeemed', userId: FIXTURE_USER_ID }),
      mintSessionForUser: async () => ({ status: 'minted', tokenHash: 'a-real-token-hash' }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tokenHash: 'a-real-token-hash' });
});

Deno.test('handleRedeem answers recovery_code_invalid when redeemRecoveryCode reports a lost compare-and-swap race', async () => {
  // Models two concurrent redemptions of the same code: the real
  // `redeemRecoveryCodeViaServiceRole`'s atomic UPDATE affects zero rows for
  // whichever request loses the race, resolving `{status:'invalid'}` exactly
  // like a wrong code — never a 500, and never a second successful session.
  let mintCalled = false;
  const response = await handleRequest(
    redeemRequest({ code: 'a'.repeat(32) }),
    noopDeps({
      redeemRecoveryCode: async () => ({ status: 'invalid' }),
      mintSessionForUser: async () => {
        mintCalled = true;
        return { status: 'minted', tokenHash: 'should-not-be-reached' };
      },
    }),
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'recovery_code_invalid');
  assert.equal(mintCalled, false);
});

function testResetRequest(token: string | undefined): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers['x-test-reset-token'] = token;
  }
  return new Request('http://localhost/v1/test-only-reset-rate-limit', { method: 'POST', headers });
}

Deno.test('handleRequest answers a CORS preflight on the test-reset route before any other check', async () => {
  const response = await handleRequest(
    new Request('http://localhost/v1/test-only-reset-rate-limit', { method: 'OPTIONS' }),
    noopDeps(),
  );

  assert.equal(response.status, 204);
});

Deno.test('the test-reset route answers the same malformed_request/"Unknown route" shape an actually-unknown route gets when unauthorized', async () => {
  const noToken = await handleRequest(testResetRequest(undefined), noopDeps({ checkTestResetAuthorization: async () => false }));
  const wrongToken = await handleRequest(
    testResetRequest('wrong-token'),
    noopDeps({ checkTestResetAuthorization: async () => false }),
  );
  const unknownRoute = await handleRequest(new Request('http://localhost/v1/does-not-exist'), noopDeps());

  for (const response of [noToken, wrongToken, unknownRoute]) {
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'malformed_request');
    assert.equal(body.error.message, 'Unknown route.');
  }
});

Deno.test('the test-reset route passes the provided token through to checkTestResetAuthorization, including null when absent', async () => {
  let seenToken: string | null | undefined;
  await handleRequest(
    testResetRequest(undefined),
    noopDeps({
      checkTestResetAuthorization: async (token) => {
        seenToken = token;
        return false;
      },
    }),
  );
  assert.equal(seenToken, null);

  await handleRequest(
    testResetRequest('the-configured-token'),
    noopDeps({
      checkTestResetAuthorization: async (token) => {
        seenToken = token;
        return false;
      },
    }),
  );
  assert.equal(seenToken, 'the-configured-token');
});

Deno.test('the test-reset route clears rate-limit state and answers 200 once authorized', async () => {
  let resetCalled = false;
  const response = await handleRequest(
    testResetRequest('the-configured-token'),
    noopDeps({
      checkTestResetAuthorization: async () => true,
      resetRateLimitState: async () => {
        resetCalled = true;
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reset: true });
  assert.equal(resetCalled, true);
});

Deno.test('no response this handler can give contains anything but its documented fields', async () => {
  // `RecoveryCodeDeps` never receives `RECOVERY_CODE_PEPPER` as a parameter
  // at all — hashing lives only inside the real service-role collaborators
  // (see the doc comment on `RotateRecoveryCode`/`RedeemRecoveryCode`), which
  // this suite never exercises for real. This is a defensive scan over every
  // response shape the pure handler itself can produce, so an operator
  // "helpfully" adding a debug field to an error's `detail` later would fail
  // this test by name rather than shipping quietly.
  const secret = 'the-recovery-code-pepper-must-never-leak-anywhere-0xDEADBEEF';
  const responses = await Promise.all([
    handleRequest(new Request('http://localhost/v1/redeem', { method: 'OPTIONS' }), noopDeps()),
    handleRequest(generateRequest({ token: null }), noopDeps()),
    handleRequest(
      generateRequest(),
      noopDeps({ resolveCaller: async () => ({ userId: FIXTURE_USER_ID }), rotateRecoveryCode: async () => {} }),
    ),
    handleRequest(redeemRequest({ code: 'not-hex' }), noopDeps()),
    handleRequest(
      redeemRequest({ code: 'a'.repeat(32) }),
      noopDeps({
        redeemRecoveryCode: async () => ({ status: 'redeemed', userId: FIXTURE_USER_ID }),
        mintSessionForUser: async () => ({ status: 'minted', tokenHash: 'a-token-hash' }),
      }),
    ),
  ]);

  for (const response of responses) {
    const text = await response.clone().text();
    assert.equal(text.includes(secret), false);
  }
});

// ---------------------------------------------------------------------------
// Server-milestone Step 25 — abuse limits.
// ---------------------------------------------------------------------------

Deno.test('handleRedeem refuses an oversized body before reading or parsing it', async () => {
  let readCalled = false;
  let parseCalled = false;

  // A truthful `Content-Length`: refused before the body is buffered at all.
  const declared = new Request('http://localhost/v1/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '70000' },
    body: '{}',
  });
  const declaredResponse = await handleRequest(
    declared,
    noopDeps({
      readRedeemBody: async () => {
        readCalled = true;
        return '{}';
      },
      parseRedeemBody: () => {
        parseCalled = true;
        return {};
      },
    }),
  );

  assert.equal(declaredResponse.status, 413);
  assert.equal((await declaredResponse.json()).error.code, 'payload_too_large');
  assert.equal(readCalled, false, 'an oversized declared body must not be read');
  assert.equal(parseCalled, false, 'an oversized declared body must not be parsed');

  // A chunked upload carries no `Content-Length` at all, so the bytes actually
  // received are what decide — and the parse must still not run (AC5).
  const chunked = new Request('http://localhost/v1/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1) }),
  });
  const chunkedResponse = await handleRequest(
    chunked,
    noopDeps({
      parseRedeemBody: () => {
        parseCalled = true;
        return {};
      },
    }),
  );

  assert.equal(chunkedResponse.status, 413);
  assert.equal((await chunkedResponse.json()).error.code, 'payload_too_large');
  assert.equal(parseCalled, false, 'an oversized body must not be parsed');
});

Deno.test('handleGenerate answers 429 from the per-user limit without rotating the account code', async () => {
  let rotated = false;

  const response = await handleRequest(
    generateRequest(),
    noopDeps({
      resolveCaller: async () => ({ userId: FIXTURE_USER_ID }),
      rotateRecoveryCode: async () => {
        rotated = true;
      },
      checkGenerateRateLimit: async () => ({ allowed: false, retryAfterSeconds: 42 }),
    }),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '42');
  assert.deepEqual(await response.json(), {
    error: { code: 'rate_limited', message: 'Too many requests.', detail: { retryAfterSeconds: 42 } },
  });
  // Each generate is a service-role `rotate_recovery_code` round trip; a
  // throttled one must cost nothing.
  assert.equal(rotated, false, 'a throttled generate must not rotate the account code');
});

Deno.test('the per-user generate budget never refuses a different user, and is separate from the address budget', async () => {
  const limiters = createRecoveryCodeRateLimiters({ clockMs: () => 0 });

  // One user's bucket is theirs alone.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    assert.equal((await limiters.generateByUser.check('user:one')).allowed, true);
  }
  assert.equal((await limiters.generateByUser.check('user:one')).allowed, false);
  assert.equal((await limiters.generateByUser.check('user:two')).allowed, true);

  // The redemption limiter is a different budget behind a different key kind:
  // spending it does not spend the generate budget.
  assert.equal((await limiters.redemptionByAddress.check('address:203.0.113.7')).allowed, true);
  assert.equal((await limiters.generateByUser.check('user:two')).allowed, true);
});

Deno.test('the wired redemption limiter keeps Step 14\'s budget and the reset route really clears it', async () => {
  let nowMs = 0;
  const limiters = createRecoveryCodeRateLimiters({ clockMs: () => nowMs });
  const address = 'address:203.0.113.7';

  for (let attempt = 1; attempt <= RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS; attempt += 1) {
    assert.equal((await limiters.redemptionByAddress.check(address)).allowed, true, `attempt ${attempt}`);
  }

  const refused = await limiters.redemptionByAddress.check(address);
  assert.equal(refused.allowed, false);
  // The window opened at t=0 with a 60 s window, so the full remainder is
  // reported — Step 14's fixed `Retry-After: 60`, now computed.
  assert.equal(refused.retryAfterSeconds, 60);

  // The window rolls by itself.
  nowMs = 60_000;
  assert.equal((await limiters.redemptionByAddress.check(address)).allowed, true);

  // `TEST_RESET_RATE_LIMIT_ROUTE` is what the integration suite depends on
  // between runs: it must actually empty both buckets, not just one.
  nowMs = 120_000;
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS_PER_ADDRESS; attempt += 1) {
    await limiters.redemptionByAddress.check(address);
  }
  assert.equal((await limiters.redemptionByAddress.check(address)).allowed, false);

  limiters.resetRateLimitState();
  assert.equal((await limiters.redemptionByAddress.check(address)).allowed, true);
});
