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
