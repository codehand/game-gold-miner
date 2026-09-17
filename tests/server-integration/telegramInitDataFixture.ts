/**
 * Server-milestone Step 12: constructs signed Telegram Mini App `initData`
 * test vectors for integration tests, the same role `authFixture.ts` plays
 * for bearer tokens.
 *
 * `signInitData` is an **independent** implementation of Telegram's
 * documented algorithm — Node's `node:crypto` HMAC here, versus Web Crypto
 * (`crypto.subtle`) in `supabase/functions/telegram-sign-in/index.ts` and in
 * that function's own unit-test fixture — so a real, deployed
 * `telegram-sign-in` function accepting a vector minted here is proof the
 * two independent implementations of the same published algorithm agree,
 * not proof that one merely matches itself.
 *
 * `FIXTURE_TELEGRAM_BOT_TOKEN` must equal `TELEGRAM_BOT_TOKEN` in
 * `supabase/functions/.env` (git-ignored; see `.env.example`) — it is a
 * fixture value, never a real bot's token, since this whole verification
 * never contacts Telegram's own servers.
 */
import { createHmac } from 'node:crypto';

export const FIXTURE_TELEGRAM_BOT_TOKEN = 'test-bot-token-123456789:AAFixtureOnlyNotARealToken';
export const FIXTURE_TELEGRAM_USER_ID = 424242;
const MAX_INIT_DATA_AGE_SECONDS = 86_400;

function signInitData(fields: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return new URLSearchParams({ ...fields, hash }).toString();
}

export interface MintInitDataOptions {
  readonly authDateSecondsAgo?: number;
  readonly botToken?: string;
  readonly telegramUserId?: number;
}

export function mintValidInitData(options: MintInitDataOptions = {}): string {
  const {
    authDateSecondsAgo = 60,
    botToken = FIXTURE_TELEGRAM_BOT_TOKEN,
    telegramUserId = FIXTURE_TELEGRAM_USER_ID,
  } = options;
  const authDateSeconds = Math.floor(Date.now() / 1000) - authDateSecondsAgo;

  return signInitData(
    {
      auth_date: String(authDateSeconds),
      query_id: 'AAFixtureQueryId',
      user: JSON.stringify({ id: telegramUserId, first_name: 'Ada', username: 'ada' }),
    },
    botToken,
  );
}

/** Validly signed, but past `MAX_INIT_DATA_AGE_SECONDS` — a replayed payload. */
export function mintStaleInitData(): string {
  return mintValidInitData({ authDateSecondsAgo: MAX_INIT_DATA_AGE_SECONDS + 60 });
}

/** Fresh and well-formed, but signed with a bot token the function does not expect. */
export function mintInitDataSignedWithWrongBotToken(): string {
  return mintValidInitData({ botToken: 'different-bot-token-987654321:ZZNotTheSameSecret' });
}

/** A validly signed payload, then modified after signing — the hash no longer matches. */
export function tamperInitData(initData: string): string {
  return initData.replace('Ada', 'Eve');
}

/**
 * Server-milestone Step 26, attack 7. Four more vectors, each a distinct way
 * an attacker manipulates the *shape* of the payload rather than its bytes.
 *
 * `reorderInitDataFields` reverses the query-string parameter order without
 * re-signing anything. Telegram's own algorithm sorts the pairs before
 * building the data-check-string, so a correct verifier is order-independent
 * and this payload must still be accepted — the point of testing it is that a
 * verifier which naively concatenated fields in received order would compute
 * a different hash and reject it (or, worse, one which hashed some subset
 * would accept a field order the signer never emitted). Acceptance here is
 * what proves the server is doing Telegram's actual algorithm.
 */
export function reorderInitDataFields(initData: string): string {
  const params = new URLSearchParams(initData);
  const entries = [...params.entries()].reverse();
  return new URLSearchParams(entries).toString();
}

/**
 * A validly signed payload with an extra field appended *after* signing. The
 * signature covers the originally signed pairs only, so a verifier that
 * includes the attacker's new field in its own data-check-string computes a
 * different hash and refuses — which is the behaviour being pinned: an
 * appended field can never ride along on a signature that never covered it.
 */
export function appendUnsignedInitDataField(initData: string): string {
  return `${initData}&role=admin`;
}

/** A payload with the `hash` parameter removed entirely — nothing for the signature check to compare against. */
export function removeInitDataHash(initData: string): string {
  const params = new URLSearchParams(initData);
  params.delete('hash');
  return params.toString();
}

/**
 * A signature that is valid in *shape* only for a different bot token than the
 * one the deployment is configured with — the "valid under a different bot
 * token" vector, kept distinct from `mintInitDataSignedWithWrongBotToken`
 * only in that this one reuses the real fixture user id, so a verifier that
 * checked the user before the hash would still be caught here.
 */
export function mintInitDataSignedWithForeignBotToken(): string {
  return mintValidInitData({
    botToken: 'foreign-bot-token-555555555:AACompletelyDifferentSecret',
  });
}
