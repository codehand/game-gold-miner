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

import {
  canonicalizeRecoveryCode,
  generateRecoveryCodePlaintext,
  handleRequest,
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
    checkRedemptionRateLimit: async () => true,
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
        return true;
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
        return true;
      },
    }),
  );

  assert.equal(seenAddress, '198.51.100.20');
});

Deno.test('handleRedeem answers 429 rate_limited before reading the body at all', async () => {
  let bodyWasRead = false;
  const request = redeemRequest({ code: 'whatever' });
  const originalJson = request.json.bind(request);
  request.json = async () => {
    bodyWasRead = true;
    return originalJson();
  };

  const response = await handleRequest(
    request,
    noopDeps({ checkRedemptionRateLimit: async () => false }),
  );

  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'rate_limited');
  assert.equal(bodyWasRead, false);
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
