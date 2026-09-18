/**
 * Server-milestone Step 26, attack 7: an independent `initData` signer for the
 * adversarial suite.
 *
 * This is `telegram-sign-in/index.test.ts`'s inline `signInitData` lifted into
 * its own module so the attack suite can mint vectors without a second copy of
 * the algorithm drifting from the first. It is an **independent**
 * implementation of Telegram's documented algorithm using Web Crypto — not a
 * call into `verifyTelegramInitData` — so a payload it accepts is proof the two
 * implementations agree, exactly as `tests/server-integration/authFixture.ts`
 * mints JWTs rather than asking application code to sign them.
 *
 * Not a `.test.ts` file, and not under a `tests/` directory, so `deno test
 * supabase/functions` does not collect it as a test.
 */

export const FIXTURE_BOT_TOKEN = 'test-bot-token-123456789:AAFixtureOnlyNotARealToken';
export const FIXTURE_TELEGRAM_USER_ID = 424242;

/** Telegram's documented data-check-string: every pair except `hash`, sorted, joined with `\n`. */
export function buildDataCheckString(fields: Record<string, string>): string {
  return Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export async function signInitData(
  fields: Record<string, string>,
  botToken: string,
): Promise<string> {
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
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', dataCheckKey, enc.encode(buildDataCheckString(fields))),
  );
  const hash = Array.from(sigBytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return new URLSearchParams({ ...fields, hash }).toString();
}

export function baseInitDataFields(authDateSeconds: number): Record<string, string> {
  return {
    auth_date: String(authDateSeconds),
    query_id: 'AAFixtureQueryId',
    user: JSON.stringify({ id: FIXTURE_TELEGRAM_USER_ID, first_name: 'Ada', username: 'ada' }),
  };
}

/** A freshly signed, valid payload. */
export function mintFreshInitData(nowSeconds: number, botToken = FIXTURE_BOT_TOKEN): Promise<string> {
  return signInitData(baseInitDataFields(nowSeconds - 60), botToken);
}
