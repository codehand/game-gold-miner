import { expect, test, type Page } from '@playwright/test';

import { tolerateNavigation } from './navigationFixture';

/**
 * Server-milestone Step 8: proves the one thing nothing fakeable locally can
 * prove — that a real Supabase Auth service hands two different browsers two
 * different anonymous identities, and that one identity's credential cannot
 * be used to answer as the other. Assumes the local stack
 * (`npm run supabase:start` / `supabase db reset`) is already up, exactly as
 * `tests/server-integration/whoami.integration.test.ts` assumes for its own
 * suite — see `playwright.server-e2e.config.ts` for how the dev server this
 * spec drives gets pointed at it.
 */

const WHOAMI_CHECK_URL = `${
  process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
}/functions/v1/whoami-check`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuestSessionDiagnostic {
  readonly status: 'unconfigured' | 'sign-in-failed' | 'signed-in';
  readonly user?: { readonly id: string; readonly isAnonymous: boolean };
  readonly reason?: string;
}

async function readGuestSessionDiagnostic(page: Page): Promise<GuestSessionDiagnostic> {
  const raw = await page.locator('#app').getAttribute('data-guest-session');
  return JSON.parse(raw ?? '{}') as GuestSessionDiagnostic;
}

async function waitForGuestSessionStatus(
  page: Page,
  status: GuestSessionDiagnostic['status'],
): Promise<GuestSessionDiagnostic> {
  await expect
    .poll(async () => (await readGuestSessionDiagnostic(page)).status)
    .toBe(status);
  return readGuestSessionDiagnostic(page);
}

async function assertGameIsPlayable(page: Page): Promise<void> {
  await expect(page.locator('#app canvas')).toHaveAttribute('data-boot-scene', 'BootScene');
}

/**
 * The dev-only `data-guest-session` diagnostic deliberately omits the access
 * token (a 2026-09-09 review finding: publishing a live credential into the
 * DOM bought no coverage the client's own storage didn't already provide).
 * The Supabase client's default storage key is `sb-<host>-auth-token`
 * (confirmed empirically against the local stack: `sb-127-auth-token` for
 * `127.0.0.1`) — matched by prefix/suffix here rather than hardcoded, so a
 * different `VITE_SUPABASE_URL` host still resolves.
 */
async function readAccessTokenFromStorage(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) {
        continue;
      }
      const parsed: { access_token?: string } = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (parsed.access_token) {
        return parsed.access_token;
      }
    }
    return null;
  });

  expect(token).toBeTruthy();
  return token!;
}

test('a fresh browser boots instantly and holds a real anonymous session', async ({ page }) => {
  await page.goto('/');

  await assertGameIsPlayable(page);
  const diagnostic = await waitForGuestSessionStatus(page, 'signed-in');

  expect(diagnostic.user?.id).toMatch(UUID_PATTERN);
  expect(diagnostic.user?.isAnonymous).toBe(true);
  await readAccessTokenFromStorage(page);
});

test('a blocked auth service never delays boot, and local progress still persists', async ({
  page,
}) => {
  await page.route('**/auth/v1/**', (route) => route.abort());

  await page.goto('/');

  await assertGameIsPlayable(page);
  const diagnostic = await waitForGuestSessionStatus(page, 'sign-in-failed');
  expect(diagnostic.reason).toBeTruthy();

  // Local persistence is unaffected by the blocked auth call: forcing the
  // same `visibilitychange` flush `bindSaveLifecycle` reacts to on a real tab
  // switch (the pattern `tests/e2e/lifecycle-persistence.spec.ts` already
  // uses) proves the save reaches IndexedDB without waiting on the ordinary
  // 30 s heartbeat or a real production cycle.
  await forceHiddenFlush(page);
  await expect.poll(() => tolerateNavigation(() => readStoredGold(page))).not.toBeNull();

  await page.reload();
  await assertGameIsPlayable(page);
  await expect.poll(() => tolerateNavigation(() => readStoredGold(page))).not.toBeNull();
});

test('two browser contexts receive distinct identities that cannot answer for each other', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await pageA.goto('/');
    await pageB.goto('/');

    const sessionA = await waitForGuestSessionStatus(pageA, 'signed-in');
    const sessionB = await waitForGuestSessionStatus(pageB, 'signed-in');

    expect(sessionA.user?.id).not.toBe(sessionB.user?.id);

    const [tokenA, tokenB] = await Promise.all([
      readAccessTokenFromStorage(pageA),
      readAccessTokenFromStorage(pageB),
    ]);
    const [whoAmIA, whoAmIB] = await Promise.all([
      callWhoAmI(tokenA),
      callWhoAmI(tokenB),
    ]);

    expect(whoAmIA.userId).toBe(sessionA.user?.id);
    expect(whoAmIB.userId).toBe(sessionB.user?.id);
    expect(whoAmIA.userId).not.toBe(whoAmIB.userId);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

/**
 * The edge runtime cold-starts a worker on this function's first request, and
 * a cold start can answer with a real but transient non-200 response (a boot
 * error), not only a connection failure — so this retries on either, up to
 * the attempt budget, rather than treating any response at all as final.
 * 6 attempts × (2 s timeout + 1 s delay) = 18 s worst case, comfortably inside
 * `playwright.server-e2e.config.ts`'s 60 s per-test timeout alongside the page
 * boot and session round trip the calling test already spent time on.
 */
const WHOAMI_WARMUP_ATTEMPTS = 6;
const WHOAMI_WARMUP_RETRY_DELAY_MS = 1_000;

async function callWhoAmI(accessToken: string): Promise<{ userId: string }> {
  let response: Response | null = null;

  for (let attempt = 1; attempt <= WHOAMI_WARMUP_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(WHOAMI_CHECK_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        break;
      }
      await response.body?.cancel();
    } catch {
      response = null;
    }
    await new Promise((resolve) => setTimeout(resolve, WHOAMI_WARMUP_RETRY_DELAY_MS));
  }

  expect(response?.status).toBe(200);
  return response!.json();
}

async function forceHiddenFlush(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

async function readStoredGold(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const request = indexedDB.open('cat-mine-idle');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (!database.objectStoreNames.contains('saves')) {
      database.close();
      return null;
    }

    const transaction = database.transaction('saves', 'readonly');
    const getRequest = transaction.objectStore('saves').get('active');
    const record = await new Promise<{ document?: { state?: { gold?: string } } }>(
      (resolve, reject) => {
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve(getRequest.result);
      },
    );
    database.close();

    return record?.document?.state?.gold ?? null;
  });
}
