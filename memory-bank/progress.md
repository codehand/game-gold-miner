# Progress

## Status Summary

**Phase:** The base-game milestone is complete. All 37 implementation-plan steps are implemented and validated; the user validated Step 37 on 2026-09-08. No plan step remains open. Two non-blocking verification items are carried past the milestone: a physical mid-range Android Chrome pass and a human playtest of the 30-second-comprehension criterion. A server milestone is planned in `memory-bank/server-milestone-plan.md` (37 steps, Supabase, anonymous guest session plus recovery code, Google/Telegram identity — Apple was cut, see below — validate-on-save anti-cheat). Its Steps 1 through 8 are validated; Step 9 (profiles and row-level security) is implemented on 2026-09-10 and awaiting user validation, and the user directed work to proceed to Step 10 in the same session rather than pausing on that gate. **Step 10 — Google sign-in — is implemented on 2026-09-10, and its guided live-Google verification passed the same day; it awaits user validation. Step 11 — Apple sign-in — is cut, on 2026-09-11: Apple's web Sign in needs a paid Developer Program membership, a verified real domain, and a deployed HTTPS return URL with no `localhost` escape hatch, and the user chose not to acquire them, exercising the contingency `server-threat-model.md` finding F7 already recorded. Step 12 — Telegram sign-in — is implemented and fully verified, including a live integration proof against the real local stack, on 2026-09-11, on the user's explicit instruction. Unlike Steps 10–11, Step 12 needed no real external account: Telegram's `initData` verification is self-contained HMAC-SHA256 that never contacts Telegram's servers, so hand-signed fixture vectors against the real local stack fully proved every one of the step's test assertions automatically. **A 2026-09-12 user review then found a critical pre-account-takeover vulnerability (finding F13) in the Telegram identity mapping, plus three smaller issues; all four are fixed, live-reproduced, and mutation-proven** — see the dedicated entry below.** **Steps 15, 16, 17, 13, and 14 are then implemented, on 2026-09-12, in that order, in one session, all awaiting user validation together, with the standing rule that Step 18 must not begin before that.** Step 13's own instructions need "an account that already has a cloud save" to resolve its collision, but cloud save (Steps 15–17) did not exist yet at that point in the plan; asked how to handle the forward dependency, the user chose to build real cloud save first rather than fake it with test-seeded data. Step 15 found `saves`' table and RLS already complete from Step 5 and added the missing evidence; Step 16 added `PUT /v1/save` (real validation, `revision` concurrency, one-generation rollback — its original blind `upsert` was a critical concurrency bug, found by review and fixed with a compare-and-swap); Step 17 added `GET /v1/save` and a boot-time reconcile that only ever acts silently when one side has no progress at all, leaving a genuine fork for Step 18; Step 13 added Google collision detection/resolution (`detectGoogleIdentityCollision`/`beginGoogleAccountSwitch`) on top, needing almost no new merge logic since Steps 10/12/17 already cover identity preservation and reconciliation. The user then directed work straight to **Step 14 (recovery code)** in the same session: a new `recovery-code` Edge Function on the unchanged Step 3/5 schema, applying the Step 16 review's compare-and-swap lesson proactively for both rotation and redemption, adapting `telegram-sign-in`'s session-minting pattern to an id-keyed lookup (assigning a deterministic placeholder email only when a pure anonymous guest has none at all), and reusing the Step 13 collision flow with no new merge logic once redemption succeeds. `npm run verify:server` (94 Deno tests, 63 integration tests, 3 server-e2e) and the full client gate (499 unit tests, 51 E2E, build, secret scan, 10 production smoke) both pass end to end. A 2026-09-12 review of Step 14 then found and fixed five issues (one HIGH), re-verified against the same live stack — see `## Completed` for detail. A real live Google round trip through the collision itself remains deliberately unattempted, flagged for later guided verification the same way Steps 11/12's own external prerequisites were. `src/platform/web/googleSignIn.ts`'s `beginGoogleSignIn` links Google to the guest session Step 8 already establishes (keeping the same `auth.users` id) via `linkIdentity`, or signs in fresh via `signInWithOAuth` only when no session exists yet; both mirror `guestSession.ts`'s injected-collaborator, never-throws shape. `supabase/config.toml` gained `enable_manual_linking = true` and an `[auth.external.google]` block reading `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` from a project-root `.env` file — a Supabase-CLI-specific `env(...)` substitution quirk (it never reads `.env.local`) now documented in `.env.example` and `README.md`. This step's own proof — "keeps the same user id and progress; signing out and back in with Google returns the same account" — needed a real human completing Google's actual consent screen, which no local stack or CI runner can substitute for, so it was done as a guided manual verification using the `chrome-devtools` MCP tools against a real Google Cloud OAuth client the user created, the same kind of unautomatable external prerequisite Steps 11 (Apple Developer membership, a verified domain) and 12 (a Telegram Mini App host) already carry for themselves. It passed: a fresh anonymous session (`user.id = 1550ed44-853a-4859-aedf-4ecbed13f48f`) navigated to real `accounts.google.com`, the user completed Google's own login (never seen by the assistant), and returned holding the identical `user.id`, `isAnonymous` now `false`, one `google` identity, and the same `profiles` row (`created_at === updated_at` — Step 9's trigger never fired twice); signing out and calling `beginGoogleSignIn()` again — the `signInWithOAuth` branch, with no consent screen reappearing — returned the identical account. The local Supabase stack holds all six designed tables with row-level security matching the documented matrix, landed by one migration and exercised by a seeded local-only fixture guest; no deployment exists, and no client code reads or writes any of those tables yet. Step 9 closed the one gap Step 5's own migration comment had left open: a second migration adds the `on_auth_user_created` trigger that creates every `profiles` row on sign-up, since the table's own RLS carries no insert policy at all — proven, not just asserted, by an integration test that signs in two real anonymous identities through live Supabase Auth and shows user A cannot select, insert into, update, or delete user B's row, mutation-verified by dropping the trigger live and watching five of the seven new tests fail by name. Step 6 proved that `src/core`, `src/config`, and the save-document boundary run unmodified inside a Deno Edge Function — bundled rather than imported raw, because Deno's module resolver does not extension-complete a relative specifier the way the client's bundler does (finding F10) — and reproduces a pinned ten-minute simulation byte-for-byte against the client. Step 7 established the test harness every later Edge Function step reuses: `deno test` runs pure-handler unit tests with zero permission flags, and a real Deno-authenticated integration suite proves the one thing those unit tests fake — Supabase Auth verification — against the live stack, using a formalized JWT-minting fixture for the seeded guest. Step 8 is the first step where `src/` itself talks to the network: a first-time player gets a real anonymous `auth.users` row from the first frame, through a non-blocking call that never delays boot and never throws, proven by a new Docker-dependent Playwright suite (`tests/server-e2e/`) that a real GoTrue is the only thing that can prove — two browsers really do receive two different identities. That plan also records device fingerprinting as a rejected identity mechanism, and records a base-game defect it does not itself fix: iOS Safari deletes all script-writable storage after seven days without interaction, so a lapsed player loses the entire local save today. Other post-milestone work — managers, boosts, gift drops, audio, final art — requires explicit authorization and has no plan yet.

## Completed

- Fixed five issues found by a 2026-09-12 review of Step 14 (recovery code).
  **HIGH:** a failed session mint after a successful redemption permanently
  burned the code (already marked redeemed, no session ever delivered) —
  fixed with a new `revertRecoveryCodeRedemption` collaborator that clears
  `redeemed_at` before answering `500`, mutation-proven live (forcing mint
  to fail with the revert removed left the row redeemed forever; restored,
  it came back to `null`). **Medium:** the CORS preflight allowed only
  `content-type`, refusing the `Authorization`-bearing cross-origin requests
  `recoveryCode.ts`/`cloudSaveReconcile.ts` actually send — fixed in the
  shared `_shared/http.ts` helper. **Medium:** the rate limiter's own doc
  comment misdescribed a missing address as "conservative" when it was a
  global denial, and its first-hop `X-Forwarded-For` read let an attacker
  rotate past it every request (exactly what the integration suite's own
  per-call random address exploited) — fixed to read the platform gateway's
  own trusted *last* hop, confirmed live that the local gateway supplies it
  unconditionally, and the threshold raised from 10 to 30/minute since a
  spoof-proof address makes a tighter limit pure friction, not security (the
  code's 128-bit entropy is the real backstop). **Medium:** the in-memory
  rate-limit map never dropped expired keys — fixed with a sweep on every
  check. **Medium:** rotating a code was two independent, non-transactional
  statements (revoke, then insert), so an insert failure after a successful
  revoke stranded a user with no active code — fixed with a single Postgres
  function, `rotate_recovery_code` (new migration
  `20260913090000_recovery_code_rotation_rpc.sql`), mutation-proven live via
  a forced insert-half collision (RPC version rolled back cleanly; the old
  two-statement sequence reproduced by hand left zero active codes). All
  five re-verified; `npm run verify:server` (94 Deno unit tests, 63
  integration tests, 3 server-e2e) and the full client gate (499 unit
  tests, 51 E2E, build, secret scan, 10 production smoke) both re-pass end
  to end from a clean cycle.

- Implemented server-milestone Step 14 (recovery code) on 2026-09-12,
  proceeding straight from Step 13 on the user's explicit instruction. New
  `supabase/functions/recovery-code` Edge Function (`POST /v1/generate`,
  `POST /v1/redeem`) on the unchanged Step 3/5 `recovery_codes` schema: a
  16-random-byte (128-bit) code, hex-grouped for display, canonicalized and
  HMAC-SHA-256-hashed under `RECOVERY_CODE_PEPPER` (relocated in
  `.env.example` to the `supabase/functions/.env` section it is actually
  read from, matching `TELEGRAM_BOT_TOKEN`). Both rotation and redemption
  are compare-and-swap from the start, applying the Step 16 review's
  concurrency lesson proactively — mutation-proven live (a temporarily
  reverted read-then-write let two concurrent redemptions of the same code
  both succeed in 2 of 3 runs; restored, 5 of 5 clean). Minting a session
  for a redeemed code's resolved `user_id` adapts `telegram-sign-in`'s
  `generateLink`/`verifyOtp` pattern for an id-keyed lookup, assigning a
  deterministic placeholder email only when a pure anonymous guest has none
  at all — confirmed live end to end, same `auth.users` id restored.
  Hashing lives only inside the real service-role collaborators, never in
  the pure handler, so the zero-permission-flag unit-test harness holds
  without `--allow-env`. Rate limiting ships as an explicit interim
  in-memory limiter, documented as Step 25's eventual replacement.
  `redeemRecoveryCode` on the client triggers the same
  `triggerCloudSaveReconcile()` every other sign-in path runs, so reusing
  the Step 13 collision flow needed no new merge logic. `npm run
  verify:server` (89 Deno unit tests, 63 integration tests, 3 server-e2e)
  and the full client gate (496 unit tests, 51 E2E, build, secret scan, 10
  production smoke) both pass end to end from a clean cycle.

- Closed a test-coverage gap in Step 16's Content-Length pre-check on
  2026-09-12, found by user review: the fix was correct, but the only unit
  test for the 413 cap builds its request with a plain string body, which
  never populates `Content-Length` — so it only ever exercised the
  post-read check, and deleting the pre-check left every existing test
  green. Closed with a unit test that declares `content-length: '70000'`
  over an actual 2-byte body; mutation-proven by disabling the pre-check
  and confirming the new test fails (`400`, not `413`), then restoring it.
  69 Deno unit tests and 52 integration tests now pass.

- Fixed a real flake in `npm run test:server-integration` on 2026-09-12,
  found by user review: `vitest.server-integration.config.ts` set no
  `testTimeout`, so Vitest's 5 s default silently overrode every test's own
  declared `AbortSignal.timeout(20_000)` fetch budget, killing the test at
  5 s first. Confirmed load-dependent (clean on a fresh stack, 10/10 across
  parallel and serial loops) rather than cold-boot, worsening as a
  long-running local stack accumulates rows and drifts toward
  `signInAnonymously()`'s 30/hour-per-IP rate limit — `verify:server`
  resets the database first so CI is insulated, a developer looping the
  suite on its own is not. Fixed with `testTimeout: 30_000`. Predates this
  session's other fixes.

- Fixed a **critical** concurrency bug in server-milestone Step 16 on
  2026-09-12, found by user review: the upload endpoint's read-check-write
  was three non-atomic steps, so two overlapping uploads could both pass
  the revision-conflict check and both write, silently discarding one and
  breaking the server's monotonic-revision guarantee (reproduced live).
  Fixed with a compare-and-swap (`insert` relying on the `user_id` primary
  key for a first write, an atomic `update ... where revision = ?` for a
  subsequent one), proven with two new live tests that fire genuinely
  concurrent uploads. The same review fixed a medium issue (the size cap
  didn't actually refuse cheaply until a `Content-Length` pre-check was
  added) and three minor ones (an unmigrated downloaded document, the boot
  reconcile bypassing the lifecycle-safe repository wrapper, an
  under-explained CORS allow-list comment). `npm run verify:server` (68
  Deno unit tests, 52 integration tests) and the full client gate (479 unit
  tests) both re-pass. See `memory-bank/activeContext.md` for full detail.

- Implemented server-milestone Steps 15, 16, 17, and 13 on 2026-09-12, in
  that order, in one session (see `memory-bank/activeContext.md` for the
  full per-step detail). The user chose to pull cloud save (Steps 15–17)
  forward rather than build Step 13's guest-linking collision against
  test-seeded data, since Step 13 needs "an account that already has a
  cloud save" and no cloud-save endpoint existed yet at that point in the
  plan. Step 15: the `saves` table/RLS were already complete from Step 5;
  added the required live-stack evidence
  (`tests/server-integration/saves-rls.integration.test.ts`) and a
  service-role test fixture that mints its key at run time rather than as a
  tracked-file literal. Step 16: `PUT /v1/save` in `save-sync/index.ts`,
  real validation via the shared core bundle, the `revision` optimistic-
  concurrency check, and the one-generation rollback shift, with 18 new
  unit tests and a 9-test live integration suite. Step 17: `GET /v1/save`
  plus a boot-time reconcile (`src/platform/web/cloudSaveReconcile.ts`,
  `src/persistence/guestUpgradeReconciliation.ts`'s new `hasAnyProgress`/
  `reconcileGuestUpgrade`) that only ever acts silently when one side has no
  progress at all, leaving a genuine fork completely untouched for Step 18;
  wiring it into `main.ts` surfaced and fixed a real regression in
  `production-smoke.spec.ts`'s "no request fails" assertion, plus a missing
  CORS allow-list entry for this repository's own Playwright preview
  origins. Step 13: Google collision detection/resolution
  (`detectGoogleIdentityCollision` via the SDK's own memoized
  `client.auth.initialize()`, `beginGoogleAccountSwitch`), needing almost no
  new merge logic since Steps 10/12/17 already cover identity preservation
  and reconciliation; a new live integration suite
  (`tests/server-integration/guest-upgrade-collision.integration.test.ts`)
  proves all three of the step's required flows end to end by composing the
  real Step 16/17 endpoints with the real `reconcileGuestUpgrade`. A real
  live Google round trip through the actual collision remains deliberately
  unattempted, for later guided verification the same way Steps 11/12's own
  external prerequisites were flagged rather than blocking. `npm run
  verify:server` (67 Deno unit tests, 50 integration tests, 3 server-e2e)
  and the full client gate (479 unit tests, 51 E2E, build, secret scan, 10
  production smoke) both pass end to end from a clean cycle. All four steps
  await user validation together; Step 14 must not begin before that.

- Fixed a **critical** vulnerability in server-milestone Step 12 on
  2026-09-12, found by user review, finding F13
  (`memory-bank/server-threat-model.md`): `telegram-sign-in` maps a
  Telegram user to `auth.users.email = telegram-<id>@telegram.invalid` and
  relies on `admin.generateLink` to find-or-create that row, but
  `[auth.email] enable_signup = true` (with `enable_confirmations = false`)
  meant anyone who knows a Telegram id (public, enumerable) could
  `POST /auth/v1/signup` with that exact email and a password of their own
  choosing before the real user ever signed in — `generateLink` would then
  hand the real user a session into the attacker's own, password-protected
  account. Reproduced live end to end by the reviewer against the running
  stack and independently reconfirmed by this agent before touching
  anything: attacker signup → 200; real Telegram sign-in for that id → the
  identical `auth.users` id; attacker password login afterward → still that
  id. Fixed with `[auth.email] enable_signup = false` in
  `supabase/config.toml` — nothing in this codebase calls
  `signUp`/`signInWithPassword`, and `admin.generateLink`/`auth.verifyOtp`
  are admin/OTP paths unaffected by the flag, confirmed live (the full
  server test suite and the Telegram sign-in flow both still pass with it
  set). `tests/server-integration/telegram-sign-in.integration.test.ts`
  gained a test reproducing the exact attack against the live stack
  (signup refused, legitimate sign-in still succeeds); a companion static
  assertion in `tests/unit/server-stack.test.ts` needed a fix of its own
  first — an initial lazy regex crossed past `[auth.email]` into the
  unrelated, already-`false` `[auth.sms] enable_signup` line further down
  `config.toml` and so passed vacuously against a mutated flag, caught by
  mutation-testing the test itself before trusting it (a new
  `extractTomlSection` helper scopes the match to one section correctly).
- Fixed three smaller issues in the same review pass. Medium:
  `scan-bundle-secrets.mjs` still missed `supabase/functions/.env` — the
  most sensitive of the three env files it covers, holding the HMAC key
  that signs every Telegram user's `initData` — fixed by merging it into
  the same exact-value check as `.env`/`.env.local`. Minor:
  `MintSessionResult`'s `error` variant carried a `reason` string nothing
  ever read, removed; `verifyTelegramInitData`'s freshness check compared
  `now - authDate` in one direction only, so a validly-signed but
  future-dated payload was never flagged stale, fixed with `Math.abs`
  (low severity — still needs the real bot token to exploit). Deliberately
  not changed: the reviewer's suggestion that a wrong method should answer
  `405`/`Allow` rather than `400 malformed_request` — `save-sync/index.ts`'s
  own header comment already made 400 the deliberate, documented choice for
  every function reusing the save-sync protocol's error vocabulary (which
  `server-save-sync-protocol.md` §1 says identity endpoints do too), so
  introducing `405` here would itself be the inconsistency.
- All four fixes mutation-proven. `npm run verify:server` (49 Deno unit
  tests, 21 integration tests, unchanged 3 server-e2e tests) and the full
  client gate (442 unit tests, 51 E2E, build, secret scan, 10 production
  smoke) both re-pass from another completely clean
  `supabase stop`/`start`/`db reset` cycle.

- Implemented server-milestone Step 12 on 2026-09-11: Telegram sign-in.
  `supabase/functions/telegram-sign-in/index.ts`'s `verifyTelegramInitData`
  implements Telegram's documented algorithm exactly (data-check-string
  excludes `hash`/`signature`, sorted `key=value` pairs joined by `\n`;
  `secret_key = HMAC_SHA256(key="WebAppData", data=botToken)`;
  `computed = hex(HMAC_SHA256(key=secret_key, data=dataCheckString))` must
  equal `hash`, constant-time compared; `auth_date` freshness defaults to
  86400 s, a documented convention rather than a Telegram mandate) entirely
  on `crypto.subtle`, so it runs unmodified on Deno. Session-minting uses
  the confirmed community pattern for a provider Supabase Auth has no
  first-class API for: `admin.generateLink({type:'magiclink', email})`
  (creates `auth.users` if absent) returns `properties.hashed_token`; the
  client calls `auth.verifyOtp({token_hash, type:'email'})` to complete a
  real, GoTrue-tracked session. No schema change — a Telegram user maps to
  the deterministic, RFC 2606-reserved placeholder email
  `telegram-<id>@telegram.invalid`, so `generateLink` finds-or-creates
  without a `profiles` column or migration, matching how Steps 8 and 10
  also shipped with none. (This mapping is only safe with
  `[auth.email] enable_signup = false` — see the critical fix recorded
  above.)
- `src/platform/telegram/telegramSignIn.ts`'s `readTelegramInitData()`
  reads `window.Telegram.WebApp.initData` (never `initDataUnsafe`,
  Telegram's own unverified client-side convenience parse) and resolves
  `null` for every player today, since no Telegram Web App `<script>` tag
  was added to `index.html` — the still-unbuilt Mini App host,
  `server-threat-model.md` finding F1, deliberately separate, later work.
  `src/main.ts` computes `readTelegramInitData()` once at boot, before
  either identity chain, and calls `signInWithTelegram` **instead of**
  `ensureGuestSession` when non-null — "Inside Telegram this replaces the
  guest path entirely," the step's own words, not a linking flow the way
  Google's is — so `supabaseClientPromise` now has three independent
  consumers, each carrying its own `.catch` from the start.
- This is the first function `src/` calls directly with `fetch()` —
  finding F11's trigger (`server-threat-model.md`), actually tripped by
  Step 12 rather than the guessed Step 16/17. `supabase/functions/_shared/http.ts`
  gained a shared CORS policy (`corsHeaders`/`corsPreflightResponse`,
  allow-listing the two known dev origins), recorded in
  `server-save-sync-protocol.md` §14. Proving it against the real stack
  surfaced finding F12: the local Kong gateway unconditionally overwrites
  every Edge Function's `Access-Control-Allow-Origin` with `*` when the
  request carries an `Origin` header, reproduced against `whoami-check`
  (which sets no CORS header of its own) and against a deliberately
  unlisted origin — correct and tested at the application layer, not what
  a real local browser actually observes; a real deployment's behaviour is
  unverified.
- Step 12 evidence: unlike Steps 10–11, this step needed no real external
  account, domain, or paid membership — Telegram's `initData` verification
  never contacts Telegram's own servers, so every one of the step's test
  assertions is provable with hand-signed fixture vectors. 48 Deno unit
  tests (`verifyTelegramInitData` against valid/tampered/stale/wrong-token/
  malformed vectors, `handleTelegramSignIn` against every response shape
  with faked collaborators, and a defensive scan proving no response can
  carry the bot token) plus 7 new integration tests against the real
  deployed function: a valid, fresh, hand-signed `initData` mints a session
  whose `verifyOtp()` exchange actually succeeds and whose email matches
  the deterministic placeholder; a second sign-in for the same Telegram
  user id resolves to the identical `auth.users` id; tampered, stale, and
  wrong-bot-token payloads each answer 401 with no `tokenHash` and no bot
  token anywhere in the response; the CORS preflight answers 204 with a
  header a real browser accepts. `npm run verify:server` passes end to end
  from a clean `supabase stop`/`start`/`db reset` (48 Deno tests, 3
  migrations, 20 integration tests, 3 server-e2e tests); the client gate
  passes unchanged (438 unit tests, 51 E2E, build, secret scan, 10
  production smoke). A real, in-Telegram live pass (a free bot via
  @BotFather plus a tunnel) remains optional, later, user-requested work —
  the Mini App host finding F1 still names as unbuilt.

- Cut server-milestone Step 11 (Apple sign-in) on 2026-09-11 rather than
  implementing it. Sign in with Apple on the web has no local-development
  path the way Google's does: it requires a paid Apple Developer Program
  membership, a Services ID, a verified real domain (Apple checks ownership
  by hosting a file on it), and a registered HTTPS return URL — Apple
  accepts no `localhost`/`127.0.0.1` redirect at all. Offered the choice
  between acquiring those, building the code/config to spec with live
  verification deferred indefinitely, or cutting the step outright, the user
  chose to cut it — exactly the contingency `server-threat-model.md`
  finding F7 already recorded: "F7 cut Apple sign-in — Removes Step 11
  whole, and USD 99/year from §7.1." No code, config, or test was written
  for this step. Updated in the same change: `server-milestone-plan.md`'s
  Recorded-decisions Identity row, its Step 11 status-table row (split out
  of the former "11–37 Not started" block), its Definition of Done (which no
  longer requires all 37 validations to pass, only every non-cut one, and
  drops Apple from the guest-upgrade claim), and `server-threat-model.md`'s
  F7 entry, its §7.1 budget line, its step-by-step trace row for Step 11,
  and its "how to change a default" table — each now marked exercised.
  Identity in this milestone is anonymous guest, Google, and Telegram; if
  the membership and domain are acquired later, Step 11 is implemented
  fresh against the pattern Step 10 already established, not resumed from
  partial work, since none exists. Work proceeds to Step 12 (Telegram
  sign-in) in the same session on the user's explicit instruction.

- Implemented server-milestone Step 10 on 2026-09-10: Google sign-in.
  `supabase/config.toml` flips `enable_manual_linking` to `true` and adds
  `[auth.external.google]` reading `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  through `env(...)` substitution — the Supabase CLI's own quirk of reading
  only a project-root `.env` file, never `.env.local`, now documented in
  `.env.example` and `README.md`. `src/platform/web/googleSignIn.ts`'s
  `beginGoogleSignIn` calls `linkIdentity({provider: 'google'})` when a
  session already exists — keeping the same `auth.users` id, the step's core
  requirement — and `signInWithOAuth({provider: 'google'})` only when none
  does; `signOutOfSession` wraps `signOut()`. Both mirror
  `guestSession.ts`'s injected-`GoogleAuthClient`, never-throws contract, and
  a rejected *pre-redirect* request (a misconfigured provider, rate
  limiting) resolves to a typed `error` result rather than throwing. Google's
  real "identity already linked to another user" conflict — Step 13's job —
  cannot surface this way: GoTrue only discovers it after the player picks an
  account on Google's own page and the browser returns with
  `error_code=identity_already_exists` on the return URL, a fresh page load
  nothing in `src/` reads yet.
- Step 10 evidence: `tests/unit/google-sign-in.test.ts` proves the
  link-vs-sign-in branch by which collaborator was and was not called and
  that every error path resolves rather than throws; two new
  `tests/unit/server-stack.test.ts` static assertions pin
  `enable_manual_linking = true` and the `[auth.external.google]` block, and
  its `.env.example` check gained the two new variable names. No production
  UI exists yet — `HudView.ts`'s fixed HUD already covers the 360×640 canvas
  edge-to-edge (gold left, warehouse queue centered, income right), so a
  `DEV`-only `window.catMineIdleAccount` hook in `src/main.ts` exposes
  `beginGoogleSignIn()`/`signOut()`, the same diagnostic pattern Step 8
  established, rather than risking a DOM overlay colliding with existing HUD
  content or a canvas click target; a real entry point is a later,
  Phaser-rendered polish step. `npm run verify` passes end to end: lint, 422
  unit tests, 51 Chromium E2E (one confirmed pre-existing parallel-worker
  flake in `player-journey.spec.ts`, passes in isolation), strict build,
  secret scan, 10 production smoke. Unlike Steps 8–9, this step's own test —
  same user id and progress preserved, sign-out/in returns the same account
  — needed a real human completing Google's actual consent screen, which no
  local stack or CI runner can substitute for; that guided manual
  verification, using a real Google Cloud OAuth client the user created and
  the `chrome-devtools` MCP tools, passed on 2026-09-10: a fresh anonymous
  session (`user.id = 1550ed44-853a-4859-aedf-4ecbed13f48f`) navigated to
  real `accounts.google.com`, the user completed Google's own login (never
  seen by the assistant), and returned holding the identical `user.id`,
  `isAnonymous` now `false`, exactly one `google` identity, and the same
  `profiles` row (`created_at === updated_at`, so the Step 9 trigger never
  fired a second time). Signing out and calling `beginGoogleSignIn()` again
  — the `signInWithOAuth` branch, with no consent screen reappearing —
  returned the identical account. Not part of `npm run verify:server`, since
  no CI runner can drive a real human through Google's consent screen.
- A 2026-09-10 review of Step 10 found and fixed four issues, all
  mutation-proven. The `DEV` account hook was a second, independent consumer
  of `supabaseClientPromise` with no `.catch` of its own — the guest-session
  chain's `.catch` settles only that chain's own derived promise — so a
  rejected client promise reached an unhandled rejection a second time,
  reintroducing the exact bug class a Step 8 review had already fixed once;
  fixed with its own `.catch(() => {})`. `scripts/scan-bundle-secrets.mjs`
  read only `.env.local`, so `GOOGLE_CLIENT_SECRET` — deliberately placed in
  the separate `.env` file — had no exact-value guard, only the weaker
  name-level one; fixed by merging `.env` into the same check, confirmed
  against a real build/scan ("5 exact server-only value(s)" checked, up from
  3, no leak). The claim that Google's "identity already linked to another
  user" surfaces as this module's typed `error` result was wrong; corrected,
  and then reproduced live rather than only reasoned about — reloading the
  already-linked session and calling `beginGoogleSignIn()` again produced no
  consent screen at all, only an immediate redirect back carrying
  `error_code=identity_already_exists`, with the account untouched. Four
  smaller cleanups: `describeError` deduplicated into
  `src/platform/web/describeError.ts`; `GoogleAuthClient`'s unread session
  `user` field narrowed to `unknown`; the `declare global` block moved out
  from between two import statements in `src/main.ts`; and
  `redirectTo: window.location.origin` added to both OAuth calls so the
  return trip lands back on the origin that actually started it. Full client
  gate (422 unit tests, 51 E2E, build, secret scan, 10 production smoke)
  passes after the fixes.
- A follow-up review found a fifth issue, inside the fourth fix's own test.
  `beginGoogleSignIn` built `{ provider: 'google', options: undefined }` — the
  `options` key present with an undefined value — while the accompanying
  test's title claimed the code omitted the key entirely, and its assertion
  (`toHaveBeenCalledExactlyOnceWith`) is itself undefined-tolerant, so it
  passed under either shape and proved neither; confirmed with a standalone
  Vitest probe before changing anything (a call of `{ provider: 'google' }`
  alone satisfies an expectation of `{ provider: 'google', options: undefined }`).
  Fixed on both sides: the credentials object now genuinely omits `options`
  when no `redirectTo` is given, and the test reads `Object.keys()` off the
  real mock call, which does distinguish "absent" from "present but
  undefined." Mutation-proven in both directions; the full gate (422 unit
  tests) is unchanged.

- Implemented server-milestone Step 9 on 2026-09-10: profiles and row-level
  security. `supabase/migrations/20260910090000_profiles_signup_trigger.sql`
  adds `public.handle_new_user()` and its `on_auth_user_created` trigger —
  `security definer` plus `set search_path = ''`, the same hardening pattern
  `public.set_updated_at()` already used — so a fresh `auth.users` row always
  gets a `profiles` row, without the client or any manual insert ever being
  the one that creates it; `profiles` itself and its own-row select/update
  policies already existed from Step 5, which had deliberately left this
  trigger as the one remaining piece. `supabase/seed.sql`'s fixture guest now
  gets its profile from the trigger, with its `display_name` set by a
  follow-up `update` rather than a manual insert that would now collide on
  the primary key. `memory-bank/architecture.md` and
  `memory-bank/techContext.md` gained the identical trigger DDL in the same
  change, confirmed byte-identical by direct diff.
- Step 9 evidence: `tests/server-integration/profiles-rls.integration.test.ts`
  signs in two independent real anonymous identities through live Supabase
  Auth and, with real bearer tokens against the live PostgREST endpoint,
  proves the trigger alone created each profile row and that user A cannot
  select, insert into (using B's real, FK-satisfying id, isolating the RLS
  denial from a foreign-key rejection), update, or delete user B's row.
  Mutation-proven live: dropping `on_auth_user_created` from the running
  database (migration file untouched) failed five of the seven new tests by
  name, and reapplying it via `supabase db reset` turned all thirteen
  integration tests (six existing `whoami-check` plus these seven) green
  again. `npm run verify:server` passes end to end from a clean
  `supabase stop`; the unaffected client gate (401 unit tests, lint, strict
  build) was re-run directly rather than assumed unchanged.

- Added the clickable bottom-navigation shell on 2026-09-09. It reserves a
  compact fixed `0,582,360,58` region and renders five cohesive code-native
  illustrations: treasure chest, storefront, bolt, cat-manager badge, and map.
  Standard controls are 48×44 while Boost is a raised 62×50; all controls meet
  the 44×44 logical-pixel touch minimum and animate on press. The complete
  visible tiles, including their chrome and icon drawings, render at 60% scale
  without shrinking those touch regions.
  Clicks intentionally have no destination or gameplay effect yet. The mine
  camera now ends at y=582, remains independently scrollable, and the responsive
  Playwright coverage verifies all five targets on the real canvas. The full
  client verification passes: lint, 401 unit tests, 43 Chromium E2E tests,
  strict build, secret scan, and 10 production smoke tests. No save, IndexedDB,
  relational schema, balance, or core-state change was made.

- Created **Aureon** (`surface-elevator-tower:UR`) on 2026-09-08 from the
  user-supplied Gemini tower reference. The candidate retains the symmetrical
  navy-steel and dominant gold structure, open cabin bay, suspended filled
  hopper, sun/moon ornament, attached purple crystals, wooden floor, and
  right-side tray/badge bracket while removing the detached pink glow and star
  artifact below the structure. Deterministic chroma-key processing emitted a
  512×512 transparent RGBA asset plus a 128×128 native-scale preview. Strict QC
  passes with zero empty, source/output edge-touch, or paste-clamped frames.
  The complete source/QC/provenance package is under
  `art-source/cat-role-catalog/surface-elevator-tower/ur/aureon/`; nothing was
  copied into `public/assets`, and runtime/gameplay/save/schema behavior is
  unchanged.

- Created **Elon** (`elevator-cargo-cat:SSR`) on 2026-09-08 as the third SSR
  elevator cargo-steward candidate without replacing Mofy or Win. The candidate
  retains silver-white tabby fur, icy luminous eyes, moon-phase trim, a long
  striped tail, and a cool-glowing celestial cargo cube; royal-violet cloth and
  an amethyst gem provide the SSR signal. Deterministic processing emitted four
  128×128 RGBA frames, a 256×256 transparent sheet, a 220 ms/frame GIF, and
  contact/native-scale shaft previews. Strict QC reports 4/4 valid frames, zero
  empty/edge-touch/clamped frames, body-scale CV `0.00239`, and anchor-Y
  deviation `0.01131`. The package remains asset-only under
  `art-source/cat-role-catalog/elevator-cargo-cat/ssr/elon/`; no runtime/schema
  change.

- Created **Win** (`elevator-cargo-cat:SSR`) on 2026-09-08 as the second SSR
  elevator cargo-steward candidate without replacing Mofy. The candidate
  retains golden-orange tabby fur, pale luminous eyes, cloud collar, lightning
  trim, long striped tail, and a locked cargo ledger; royal-violet cloth and an
  amethyst gem provide the SSR signal. Deterministic processing emitted four
  128×128 RGBA frames, a 256×256 transparent sheet, a 220 ms/frame GIF, and
  contact/native-scale shaft previews. Strict QC reports 4/4 valid frames, zero
  empty/edge-touch/clamped frames, body-scale CV `0.01761`, and anchor-Y
  deviation `0.01618`. The package remains asset-only under
  `art-source/cat-role-catalog/elevator-cargo-cat/ssr/win/`; no runtime/schema
  change.

- Created **Mofy** (`elevator-cargo-cat:SSR`) on 2026-09-08 as the first
  catalogued elevator cargo-steward variant. The candidate retains the user's
  calico markings, mint-green eyes, long tail, leaf-shaped cloak, and carved
  wooden flower ledger; royal-violet cloth and an amethyst neck gem provide the
  SSR signal. Deterministic processing emitted four 128×128 RGBA frames, a
  256×256 transparent sheet, a 220 ms/frame GIF, and contact/native-scale shaft
  previews. Strict QC reports 4/4 valid frames, zero empty/edge-touch/clamped
  frames, body-scale CV `0.01500`, and anchor-Y deviation `0.00727`. The package
  remains asset-only under
  `art-source/cat-role-catalog/elevator-cargo-cat/ssr/mofy/`; the existing
  elevator cat remains the `N` runtime fallback and no runtime/schema changed.

- Created **Nautilus** (`warehouse-manager:SSR`) on 2026-09-08 as the first SSR
  warehouse manager. The candidate retains charcoal-black fur, glowing aqua
  eyes, a wave-pattern cloak, and a golden shell-shaped inventory ledger;
  royal-violet/deep-amethyst cloth and an amethyst gem provide the SSR signal.
  Deterministic largest-component processing removed a detached motion mark
  and emitted four 128×128 RGBA frames, a 256×256 transparent sheet, a
  220 ms/frame GIF, and contact/native-scale context previews. Strict QC reports
  4/4 valid frames, zero empty/edge-touch/clamped frames, body-scale CV
  `0.01471`, and anchor-Y deviation `0.00081`. The package remains asset-only
  under `art-source/cat-role-catalog/warehouse-manager/ssr/nautilus/`; no
  runtime/schema change.

- Created **Gauge** (`warehouse-manager:SR`) on 2026-09-08 as the third SR
  warehouse manager without replacing Cipher or Baron. The candidate retains
  orange tabby fur, utility field coat, steel shoulder guard, and a mechanical
  gear-emblem inventory clipboard; sapphire-blue scarf and cyan highlights
  provide the SR signal. Deterministic largest-component processing removed
  detached motion marks and emitted four 128×128 RGBA frames, a 256×256
  transparent sheet, a 220 ms/frame GIF, and contact/native-scale context
  previews. Strict QC reports 4/4 valid frames, zero empty/edge-touch/clamped
  frames, body-scale CV `0.00492`, and anchor-Y deviation `0.02311`. The package
  remains asset-only under
  `art-source/cat-role-catalog/warehouse-manager/sr/gauge/`; no runtime/schema
  change.

- Created **Baron** (`warehouse-manager:SR`) on 2026-09-08 as a second SR
  warehouse manager without replacing Cipher. The candidate retains fluffy
  cream fur, pale-gold eyes, a plume-like tail, ivory-and-gold ceremonial armor,
  and an ornate physical inventory scroll; sapphire-blue cloth provides the SR
  signal. Deterministic processing emitted four 128×128 RGBA frames, a 256×256
  transparent sheet, a 220 ms/frame GIF, and contact/native-scale context
  previews. Strict QC reports 4/4 valid frames, zero empty/edge-touch/clamped
  frames, body-scale CV `0.00275`, and anchor-Y deviation `0.01537`. The package
  remains asset-only under
  `art-source/cat-role-catalog/warehouse-manager/sr/baron/`; no runtime/schema
  change.

- Created **Cipher** (`warehouse-manager:SR`) on 2026-09-08 and registered the
  code-facing `warehouseManager` as the catalog's second role, using canonical
  kebab-case metadata. The candidate retains charcoal-black fur, pale-gold eyes,
  futuristic armor, and a holographic inventory tablet; sapphire/electric blue
  and cyan provide the SR signal. Deterministic processing emitted four 128×128
  RGBA frames, a 256×256 transparent sheet, a 220 ms/frame GIF, and
  contact/native-scale context previews. Strict QC reports 4/4 valid frames,
  zero empty/edge-touch/clamped frames, body-scale CV `0.00744`, and anchor-Y
  deviation `0.01456`. The existing warehouse-manager sprite remains the `N`
  runtime fallback; no runtime/schema change.

- Created **Sovereign** (`unloader:SSR`) on 2026-09-08 as the third SSR
  unloader without replacing Aegis or Zenith. The candidate retains the
  long-haired lynx silhouette, cream mane, tufted ears, glowing pale-gold eyes,
  open receiving paws, and ornate attached treasure chest; royal-violet cloth
  and an amethyst belt gem provide the SSR signal. Deterministic processing
  emitted four 128×128 RGBA frames, a 256×256 transparent sheet, a 220 ms/frame
  GIF, and contact/native-scale context previews. Strict QC reports 4/4 valid
  frames, zero empty/edge-touch/clamped frames, body-scale CV `0.00736`, and
  anchor-Y deviation `0.00255`. The complete package remains asset-only under
  `art-source/cat-role-catalog/unloader/ssr/sovereign/`; no runtime/schema
  change.

- Created **Zenith** (`unloader:SSR`) on 2026-09-08 as a second SSR unloader,
  without replacing Aegis. The candidate retains the cream/dark Siamese
  identity, pale-gold eyes, celestial costume, compact gold balance scales, and
  open-paw receiving pose; deep-violet cloth and an amethyst forehead gem make
  purple the SSR signal. Deterministic processing emitted four 128×128 RGBA
  frames, a 256×256 transparent sheet, 220 ms/frame GIF, and contact/native-
  scale context previews. Strict QC reports 4/4 valid frames, zero empty/edge-
  touch/clamped frames, body-scale CV `0.00271`, and anchor-Y deviation
  `0.00070`. The catalog now supports multiple characters within one rarity via
  character-qualified IDs such as `unloader:SSR:zenith:idle`. The complete
  package remains asset-only under
  `art-source/cat-role-catalog/unloader/ssr/zenith/`; no runtime/schema change.

- Created **Aegis** (`unloader:SSR`) from the user's supplied reference on
  2026-09-08. The four-frame candidate retains the silver-gray tabby identity,
  pale-gold eyes, gold ceremonial armor, and open-paw attendant silhouette;
  deep-violet cloth/inlays plus an amethyst chest gem make purple the SSR signal
  without collapsing into Tally's gold-signalled UR palette. Deterministic
  processing emitted four 128×128 RGBA frames, a 256×256 transparent sheet, a
  220 ms/frame GIF, and contact/native-scale context previews. Strict QC reports
  4/4 valid frames, zero empty/edge-touch/clamped frames, body-scale CV
  `0.00204`, and anchor-Y deviation `0.00288`. The complete candidate and
  provenance remain under `art-source/cat-role-catalog/unloader/ssr/` awaiting
  user review; `src/`, `public/assets/`, gameplay, and schemas did not change.

- Created the first asset-only rarity candidate, **Tally** (`unloader:UR`), from the user's
  supplied reference on 2026-09-08. Built-in image generation produced the raw
  2×2 idle family; the deterministic sprite processor emitted four 128×128
  transparent frames, a 256×256 RGBA sheet, and a 220 ms/frame GIF. Strict QC
  reports 4/4 valid frames, zero empty/edge-touch/clamped frames, body-scale CV
  `0.00465`, and anchor-Y deviation `0.00609`; alpha and native-scale cave
  context checks pass. The candidate remains under
  `art-source/cat-role-catalog/unloader/ur/` awaiting user review, with prompt,
  source, reference, previews, metadata, and provenance retained. No file in
  `src/` or `public/assets/` changed and no gameplay/schema integration exists.

- Established the cat-role asset catalog contract on 2026-09-08. All roles use
  the fixed rarity order `N` (Bình thường, gray), `R` (Hiếm, green), `SR` (Siêu
  hiếm, blue), `SSR` (Siêu siêu hiếm, purple), and `UR` (Siêu cấp hiếm, gold).
  The existing Step 32A unloader is preserved as the runtime default and
  registered as the `unloader:N` baseline; the other unloader tiers await user
  references. `art-source/cat-role-catalog/art-direction-brief.md` defines the
  input contract, naming, technical frame, family invariants, QA, and explicit
  asset-only boundary, while `asset-manifest.json` records the taxonomy and
  variant status. No runtime code, gameplay attributes, balance, state,
  persistence, or schema changed.

- Step 37 was validated by the user on 2026-09-08. That validation closes the base-game milestone: all 37 plan steps now have recorded passing evidence and explicit user validation, and the plan's Definition of Done is met — the production bundle is playable in a mobile-sized browser, all fifteen floors run concurrently, progression is viable, saves and offline rewards are deterministic, no deferred feature leaked into scope, and the documentation reflects the delivered state.
- Step 37 implemented on 2026-09-08: the base-game closing review. It changed no runtime code, no balance value, and no schema version. It reviewed the delivered game against `memory-bank/implementation-plan.md` and the GDD acceptance criteria, recorded every deferred feature rather than implementing it, and brought the repository documentation in line with what actually ships.
- Step 37 documentation gap — the step's own gate requires that a new developer can install, run, test, and understand the base game from repository documentation alone, and the repository had no `README.md` at all. One was added covering requirements, install, every npm script with its port, the layering and its four load-bearing rules, the simulation and persistence contracts, the testing layout, a map of `memory-bank/`, delivered versus deferred scope, and style.
- Step 37 documentation corrections — six documents still described a mine that no longer exists. `AGENTS.md` opened with "this repository is currently in the design phase" and "no application scaffold or package scripts exist yet", and claimed no Git history existed to infer a commit convention from. `CLAUDE.md` described 4 floors, a round-robin elevator cursor, and `K/M/B/T` formatting, and omitted `test:prod`, `verify`, and `test:perf`. `architecture.md` listed four floor states, said "Floors 2–4 unlock", carried a stale `(124,58,44,50)` elevator badge region contradicting its own later section, and described a four-text-object HUD that has five text objects and three icons. `techContext.md` said startup validation requires exactly four sequential floors. `activeContext.md` listed four mine shafts as a current active decision. `systemPatterns.md` described the benchmark as holding an all-four-floor scene. All are corrected; dated historical entries were left as written, because they record what was true when written.
- Step 37 scope audit — no deferred feature leaked into `src/`. Authoritative state carries only gold, timing counters, fifteen floor records, elevator, and warehouse. There is no manager, boost, gift, shop, premium-currency, Telegram, or payment code; every `manager` identifier in the tree names the cosmetic warehouse supervisor sprite.
- Step 37 evidence gap closed rather than recorded — the Step 35 result on file measured the former four-floor mine, while the plan requires all fifteen floors active and the fixture had already been changed to seed fifteen. The ten-minute benchmark was re-run against the full mine and passes every budget: 60.00 FPS, 16.67 ms mean, 17.6 ms p95, 17.8 ms maximum, zero of 36,135 frames beyond the 18.34 ms threshold, +193,680 bytes post-GC heap growth at a +990 bytes/s slope, 665 Phaser objects and 371 DOM nodes exactly constant across all twenty samples, fifteen floors unlocked at boot and at end, and 83.5 ms scroll p95. Three figures moved materially from the four-floor run and are recorded rather than smoothed over: startup 819 → 1,177 ms, scroll p95 50.1 → 83.5 ms (the tightest remaining margin against its 100 ms budget), and the heap slope from −502 to +990 bytes/s, which oscillates rather than climbing and sits well inside the 2,048 bytes/s budget. This run presented at 60 Hz where the earlier one presented at 120 Hz, so mean frame time is the vsync interval and carries no headroom information; the meaningful result is that no frame missed its interval. `performance-results/step-35-report.md` was rewritten with the new figures and keeps the four-floor numbers for comparison.
- Step 37 prior-step evidence — all thirty-six prior steps carry recorded passing evidence in the step-status table below, and every one of Steps 3 through 36 records explicit user validation.

- 2026-09-08 HUD queue clarification completed: the centre HUD number is the amount already waiting inside `warehouse.inputQueue`, not elevator cargo; its icon is the warehouse texture. Focused verification passes with 9 unit tests and 2 Chromium E2E tests.
- 2026-09-08 empty tower-hopper feedback completed: a new transparent 512×512 empty-headhouse variant removes the baked gold only for a zero warehouse input queue; runtime texture switching restores the filled headhouse for any positive queue and reapplies the fixed display bounds. Asset provenance/QC is in the Step 32A manifest; 4 focused asset tests and 2 Chromium E2E tests pass.
- 2026-09-08 elevator floor-priority bug completed: loading now records whether the current floor was drained and whether pickup filled the exact remaining capacity. The route can descend only when the floor is empty and capacity remains; a full decimal load snaps to configured capacity instead of leaking a tiny false remainder. The new regression reproduces the former `50.004999999999995 < 50.005` branch, and 32 focused unit tests pass.
- 2026-09-08 surface-hauler alignment feedback completed: assistant cats and their paired carts keep distinct phase-shifted X positions but no longer use staggered Y lanes; every visible worker/cart now shares the lead route baseline. Thirty-one focused unit tests and one Chromium E2E regression pass.
- 2026-09-07 browser feedback implemented: the fixed HUD is 52 logical pixels high; its centre value is the authoritative `warehouse.inputQueue` and uses the warehouse icon; the configuration and authoritative state contain exactly fifteen floors; presentation reveals 1–5 initially, 1–10 after floor 5 opens, and 1–15 after floor 10 opens.
- The reveal transition resizes the scroll range without restarting the scene, and hidden floors publish no controls or diagnostics. Existing four-floor version-1 save documents migrate in memory to fifteen floors while save-document and IndexedDB versions remain 1.
- Aggregate revision evidence: 322 unit tests, 38 Chromium E2E tests (including explicit floor-5/floor-10 reveal gates and filled/empty tower states), all 9 production smoke tests, lint, strict build, and `git diff --check` pass. The live in-app browser reports one canvas, the HUD warehouse icon and authoritative queue, the empty tower texture at queue zero, identical lead/assistant cat and cart Y coordinates, and no console errors.

- Reference video reviewed and its visible gameplay elements documented.
- Simple GDD created in `memory-bank/game-design-document.md`.
- MVP scope and explicit exclusions defined.
- Technical stack and planned architecture documented in `memory-bank/tech-stack.md`.
- Repository contribution rules documented in `AGENTS.md`.
- Six core Memory Bank files initialized.
- Required pre-code document checks and database-schema documentation rules established.
- Detailed base-game implementation plan created with validation for every step.
- GDD, tech stack, and implementation plan moved into `memory-bank/`; related links and base-game decisions updated.
- Architecture documentation workflow added; the file began as an empty placeholder and is now maintained as the architecture map.
- Step 1 completed on 2026-08-27: all Memory Bank files and `AGENTS.md` were reviewed; the base-game boundary was confirmed; the repository was verified as documentation-only; no package manifest, source tree, database, migration, or schema was found.
- `memory-bank/architecture.md` populated with current document responsibilities, planned runtime-module ownership, dependency boundaries, data flow, and the explicit `none` database schema.
- Step 2 completed and validated on 2026-08-27: the Vite/TypeScript scaffold loads in a browser, Phaser 4.2.1 is locked, the production build passes, and simulator-preview scripts are available.
- Step 3 implemented on 2026-08-27: strict TypeScript, ESLint flat configuration, Vitest, Playwright Chromium testing, required package scripts, and generated-artifact ignores are present.
- Step 3 automated evidence: `npm run lint`, `npm run test`, `npm run test:e2e`, and `npm run build` pass; the development server responds successfully at its local URL and stops cleanly.
- Step 3 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 4.
- Step 4 implemented on 2026-08-27: all planned source-module entry points and placeholder asset storage exist, with no gameplay or Step 5 runtime code.
- Step 4 automated evidence: lint and strict build pass; the architecture regression test accepts pure core TypeScript and rejects Phaser, persistence/platform, and browser dependencies.
- Step 4 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 5.
- Step 5 implemented on 2026-08-27: one Phaser game boots one scene into a 360×640 canvas using automatic WebGL/Canvas selection, fit-and-center scaling, a neutral background, and no physics configuration.
- Step 5 automated evidence: lint, unit tests, strict production build, and the Chromium E2E test pass; the browser test confirms exactly one canvas and one scene start before and after reload with no console or page errors.
- Step 5 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 6.
- Step 6 implemented on 2026-08-27: typed provisional data now defines starting gold, four mine floors, sequential unlocks, one elevator, one warehouse, upgrade curves, and the shared milestone schedule.
- Step 6 automated evidence: startup validation succeeds and the unit suite rejects missing floors, duplicate identifiers, negative durations, non-positive yields, and invalid milestone ordering.
- Step 6 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 7.
- Step 7 implemented on 2026-08-27: `GameNumber` encapsulates break_infinity.js 2.2.0 behind immutable construction, arithmetic, comparison, and string-serialization APIs.
- Step 7 automated evidence: unit tests pass for ordinary values, values beyond JavaScript's safe-integer range, immutable add/subtract/multiply operations, comparisons, serialization/deserialization, JSON output, and invalid sources.
- Step 7 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 8.
- Step 8 implemented on 2026-08-27: authoritative state types and a deterministic factory now model save version, timestamp, gold, four floors, elevator, warehouse, progress, queues, capacities, and production totals.
- Step 8 automated evidence: fresh state has only floor one unlocked, all progress is normalized, all quantities initialize correctly through `GameNumber`, invalid timestamps fail, and JSON output contains only authoritative plain data.
- Step 8 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 9.
- Step 9 implemented on 2026-08-27: foreground time advances through immutable 100 ms fixed ticks, carries authoritative sub-tick remainder, caps credited simulation time at 1,000 ms per update, and consumes the full wall-clock delta.
- Step 9 automated evidence: one large update, ten regular updates, and irregular chunks produce identical state; partial time carries correctly, oversized and invalid deltas are handled as specified, and production values remain unchanged before extraction is implemented.
- Step 9 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 10.
- Step 10 implemented on 2026-08-27: unlocked floors advance extraction during fixed ticks, apply configured exponential level yield, enqueue output only at completed cycle boundaries, update total extracted, and retain overflow progress.
- Step 10 automated evidence: tests cover immediately before, exactly at, and beyond a cycle boundary; level-adjusted output; every configured floor; locked-floor inactivity; deterministic chunking; multiple cycles; and no direct spendable-gold increase.
- Step 10 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 11.
- Step 11 implemented on 2026-08-27: one shared elevator scans unlocked non-empty floors round-robin, picks up to its capacity, leaves excess queued, tracks in-transit material and progress, and delivers completed loads to the warehouse input queue.
- Step 11 automated evidence: tests cover empty idling, capacity limits, pre-completion isolation, locked/empty skipping, round-robin fairness, multiple cycles, no direct gold delivery, and exact material conservation across queues, transit, and warehouse input.
- Step 11 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 12.
- Step 12 implemented on 2026-08-27: the warehouse advances a timed conversion only with queued input, consumes at most capacity per completed cycle, and adds converted material 1:1 to spendable gold and total delivered gold.
- Step 12 automated evidence: tests cover idle behavior, progress before the boundary, capacity-limited and repeated completion, input immutability, deterministic chunking, and conservation across floor queues, elevator transit, warehouse input, and delivered gold.
- Step 12 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 13.
- Step 13 implemented on 2026-08-27: every unlocked floor advances automatically before the shared elevator and warehouse on each fixed tick, enabling same-tick handoffs while locked floors remain inert.
- Step 13 automated evidence: independently calculated floor outputs and progress match simulation results; same-tick handoffs, locked-floor inactivity, deterministic chunking, and full material conservation are covered.
- Step 13 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 14.
- Step 14 implemented on 2026-08-27: pure calculations expose theoretical extraction per second for every floor and derive effective mine production from the minimum of aggregate unlocked extraction, elevator capacity per second, and warehouse capacity per second.
- Step 14 automated evidence: tests cover current-level floor rates, locked-floor exclusion from aggregate extraction, extraction/transport/warehouse bottlenecks, correct effective rates, and no mutation of authoritative state.
- Step 14 was validated by the user on 2026-08-27 through explicit authorization to proceed with Step 15.
- Step 15 implemented on 2026-08-27: separate `GameNumber` prices and immutable purchase commands now support mine shafts, the elevator, and the warehouse, deducting the exact price and incrementing only the selected level.
- Step 15 automated evidence: tests cover exact starting and representative prices, exact-balance success, independent stage purchases, insufficient funds, locked/missing floors, invalid levels, original-state failures, and preservation of queues, progress, capacities, totals, and unrelated stages.
- Step 15 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 16.
- Step 16 implemented on 2026-08-28: mine-shaft upgrades immediately affect level-derived extraction yield, while elevator and warehouse purchases deterministically recalculate capacity from base capacity and the configured 1.12 growth rate without changing cycle durations.
- Step 16 automated evidence: fifty-six unit tests pass, including equal-duration production comparisons for all three stages, bottleneck-aware rate improvements, exact level-two target capacities, and preservation of queues, carried material, totals, cursors, timestamps, and normalized in-progress work.
- Step 16 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 17.
- Step 17 implemented on 2026-08-28: mine shafts, the elevator, and the warehouse now apply cumulative configured milestones at levels 10/25/50/100 through a shared level-effect calculation used by actual production, initial capacity, purchases, and rate estimates.
- Step 17 automated evidence: sixty-one unit tests pass, covering every multiplier threshold, all three production stages crossing level 10, milestone-aware rates and initial state, preservation of in-progress work, and reload-style proof that a reached milestone is not applied twice.
- Step 17 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 18.
- Step 18 implemented on 2026-08-28: one immutable command now unlocks floors 2–4 only when the configured immediately previous floor is unlocked at the required shaft level and the exact unlock cost is affordable, then initializes the target floor from configuration.
- Step 18 automated evidence: sixty-eight unit tests pass, covering unmet and locked prerequisites, insufficient funds, exact single deduction, configured initialization, duplicate and unknown requests, all three sequential unlocks, state preservation, and production from a newly opened floor.
- Step 18 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 19.
- Step 19 implemented on 2026-08-28: a pure deterministic economy harness advances a fresh session in one-second decisions, unlocks eligible floors, reserves unlock funds after prerequisites are met, and otherwise buys the affordable upgrade with the best modeled bottleneck improvement using deterministic progression-aware tie-breaking.
- Step 19 automated evidence: seventy-four unit tests pass. The ten-minute session deterministically opens floors 2, 3, and 4 at 45, 139, and 317 simulated seconds, reaches a level-10 milestone without runaway level-100 growth, keeps every balance and progress value finite and non-negative, retains a positive effective production rate, and records only positive-cost actions with non-negative modeled improvements. Focused tests also prove elevator-bottleneck selection, next-unlock tie-breaking, deterministic replay, and invalid-duration rejection. Lint and production build pass without changing the provisional balance.
- Step 19 was validated by the user through explicit authorization to proceed with Step 20.
- Step 20 implemented on 2026-08-28: version-1 save creation now serializes the complete authoritative state and effective production-rate snapshot into strict plain JSON; migration dispatch, config-aware validation, and runtime deserialization are defined before any storage adapter.
- Step 20 automated evidence: ninety-three unit tests pass. Nineteen save-schema tests cover valid creation and exact JSON/runtime round trips, current-version migration dispatch, missing/unsupported versions, malformed/non-string numeric values, unknown/reordered/missing floor identifiers, negative floor/elevator/warehouse queues, unsafe/inconsistent timestamps, invalid progress/counters/capacities, locked-floor production, broken unlock order/gates, and transient unknown properties. Lint and production build pass.
- Step 20 was validated by the user through explicit authorization to proceed with Step 21.
- Step 21 implemented: Dexie 4.4.5 now stores one active version-1 document behind a storage interface; routine writes debounce to the newest snapshot, supported web lifecycle events force a flush, and load/save failures resolve safely while exposing user-facing diagnostics and retaining failed writes for retry.
- Step 21 automated evidence: one hundred three unit tests pass. Ten new persistence/regression tests cover the IndexedDB schema constants, exact full-state restoration after database close/reopen, one-record replacement, empty loads, latest-only debouncing, hidden/page-hide forced saves and unbinding, non-throwing save failure plus retry, non-throwing load failure plus visible diagnostic, invalid debounce rejection, and canonical serialized capacity restoration at upgraded levels. Lint and production build pass.
- Step 21 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 22.
- Step 22 implemented on 2026-08-28: the active-game load boundary now fully restores valid saves, creates an ordinary fresh game for empty storage, and automatically replaces malformed or unsupported load candidates with a complete fresh runtime state plus a typed visible warning. Invalid payloads are detached for diagnostics when structured cloning is safe, no corrupt field is partially applied, and diagnostic listeners cannot crash recovery or leave persistence flushes permanently rejected.
- Step 22 automated evidence: one hundred ten unit tests pass. Seven new recovery/regression tests cover valid restoration, empty-save startup, malformed current-version recovery, unsupported-version recovery, safe and unsafe payload preservation, playable fresh-state invariants, throwing warning callbacks, and throwing persistence diagnostic callbacks with successful later retry. Lint and production build pass.
- Step 22 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 23.
- Step 23 implemented on 2026-08-28: offline income now uses the saved effective-production-rate snapshot, a validated two-hour cap, and 50% efficiency. Valid loads replace the authoritative timestamp with the injected current time and force-save that consumed interval before returning a positive pending reward; future clocks return zero and are corrected, repeated same-time reloads return zero, and failed settlement writes withhold the reward while preserving the running session and save diagnostic. Spendable gold remains unchanged for the Step 24 claim flow.
- Step 23 automated evidence: one hundred twenty unit tests pass. Ten new balance/offline/persistence tests cover exact provisional configuration, invalid caps and efficiencies, zero and normal absences, two-hour capping, future timestamps, very large saved rates, invalid inputs, immutable gold/state, load-time timestamp persistence, repeated reload protection, and reward withholding when settlement storage fails. Lint and production build pass.
- Step 23 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 24.
- Step 24 implemented on 2026-08-28: browser startup now loads the active IndexedDB save before Phaser boot, creates a pending view only for positive offline income, and displays credited time plus the exact reward in an accessible modal. Claiming adds the exact `GameNumber` amount through a pure command, consumes the pending value, and force-persists the claimed authoritative state before dismissal. One cached claim candidate makes save retries idempotent.
- Step 24 automated evidence: one hundred twenty-five unit tests and two Chromium E2E tests pass. New coverage verifies positive-only pending creation, exact large-number addition, consumed/no-op repeated claims, invalid pending values, credited-duration copy, fresh-player modal absence, returning-player modal contents, exact persisted gold, and no reward recreation after a controlled-clock reload. Lint and production build pass; `git diff --check` is clean.
- Step 24 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 25.
- Step 25 implemented on 2026-08-28: a pure Phaser-free layout module tiles the fixed 360×640 portrait viewport into a fixed top HUD, a shared elevator/warehouse surface strip, and a scrollable mine area that reaches the bottom edge with no bottom navigation reserved or rendered. `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on `#app` makes the `#game-viewport` Phaser parent the safe box, and `FIT` with `CENTER_BOTH` letterboxes instead of cropping. The mine is clipped by a dedicated camera viewport because Phaser 4 removed WebGL geometry masks, and its then-current 508-pixel placeholder content exceeded the 428-pixel region so the area had to scroll.
- Step 25 automated evidence: one hundred forty-four unit tests and six Chromium E2E tests pass. Sixteen layout/palette unit tests cover the documented region rectangles, gap-free tiling, the absent bottom-navigation strip, larger logical viewports, invalid and too-short dimensions, overflowing scroll content, sequential floor slots, invalid floor counts/indexes, and the diagnostic serialization format. Four Playwright viewport tests (narrow phone 320×568, tall phone 390×844, tablet portrait 768×1024, desktop 1280×800) assert the canvas fits both the viewport and the safe box, preserves its aspect ratio, keeps every region on screen in HUD → surface → mine order, pins the HUD to the top and the mine to the bottom edge, exposes no navigation element, and logs no console errors. Four pixel probes per viewport sample the real canvas and prove both camera ignore lists hold; they were validated by mutation, each of three broken-render mutations now failing with a named assertion. `eslint.config.mjs` enforces the `src/game/layout` purity claim and `tests/unit/architecture.test.ts` probes that rule. Lint and production build pass; `git diff --check` is clean.
- Step 25 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 26.
- Step 26 implemented on 2026-08-28: a pure `src/game/view-model` module derives every displayed floor number, mine-shaft level, lock state, extraction progress, queued-material amount, and pile height from a read-only `GameState`, and reusable `MineFloorView`/`SharedStageView` Phaser entities render it. Four floor views fill the scrollable mine slots with a floor badge, heading, level, placeholder miner, material pile, extraction progress bar, and a shaft-upgrade control; locked floors are drawn in their own colour with a `Locked` badge, no miner, and no upgrade control. The shared elevator and warehouse render in the surface strip with their own level, capacity, held amount, cycle-progress bar, and upgrade control. Controls are presentational only — Step 29 makes them interactive.
- Step 26 automated evidence: one hundred fifty-nine unit tests and seven Chromium E2E tests pass. Twelve view-model unit tests cover snapshot mirroring for all four floors, locked-floor status and hidden controls, both shared stages, a fresh game, non-mutation of the snapshot, rejected progress/level values, pile-height thresholds, and provisional amount formatting. The new browser test seeds a known version-1 save whose floors differ in lock state, level, progress, and queued material, then compares every displayed floor number, level, lock state, and progress value — plus both shared stages — against that core snapshot. Rendered values are read back from the view objects themselves rather than from the scene's intentions, and eight pixel probes prove the panels, locked colour, progress fills, and pile heights actually reach the framebuffer. Six mutations were verified to fail with named assertions: binding every floor view to floor one, drawing locked floors like unlocked ones, ignoring extraction progress in the bar, ignoring the queue in the pile, binding the elevator view to the warehouse, and building the floor views without drawing them. `eslint.config.mjs` enforces `src/game/view-model/**` purity and `tests/unit/architecture.test.ts` probes that rule. The Step 25 surface pixel probe moved to the strip above the new stage panels, which its own background still owns. A tenth mutation was added with the review fix below.
- Step 27 review fix — hidden-tab time loss: the driver passed the whole wall-clock gap to `advanceSimulation`, which credits at most `MAX_FOREGROUND_DELTA_MS` but consumes the entire delta. That bound is meant for one slow frame; a hidden tab stops the render loop altogether, so an absence arrived as a single delta and everything past its first second was consumed having never been simulated. Reproduced at sixty seconds: 380 gold when frames ran throughout against 100 — the starting balance — when the same minute arrived as one frame, with the timestamp advanced sixty seconds either way. Because that scenario involves no reload, offline income never saw the interval either. `src/core/simulation/catchUpSimulation.ts` now walks the gap in credited-size slices, which is exact rather than approximate because the sub-tick remainder is carried in authoritative state, and bounds the walk at `MAX_CATCH_UP_MS` (two hours, matching the offline-income horizon) at a measured worst case of roughly thirty milliseconds. Time past the bound is still consumed by `lastUpdateTimestampMs`. Eight new unit tests cover both the core walk and the driver; three mutations fail by name — the driver reverted to a single bounded advance, uncredited time dropped rather than consumed, and the walk left unbounded. - Step 27 review fix — per-frame waste: the driver re-derived its view model on every frame because `advanceSimulation` returns a new object even when no tick completed, which also meant `BootScene`'s identity check could never fire. It now re-derives only when `simulationTick` advanced — the exact condition, since nothing outside `advanceFixedStep` touches production state — while `replaceState` always re-derives, and the renderable guard moved behind the identity check it protects. Separately, the rendered-state read-back is now gated on `import.meta.env.DEV`: nothing in the game reads those attributes, and a shipped build was serializing the whole screen ten times a second. Playwright runs against the dev server, so browser tests are unaffected, and the production bundle no longer contains the dataset writes. Three more mutations fail by name: a driver that never memoizes, a driver that never re-derives, and a `replaceState` that reuses the snapshot. One hundred ninety-eight unit tests, twelve Chromium E2E tests, lint, strict production build, and `git diff --check` pass.
- Step 26 review fixes: the rendered-state diagnostic is republished on every `applySnapshot`, not only at boot, so a live snapshot that fails to reach the views cannot hide behind a frozen first-frame report; and a snapshot whose floor count does not match the views throws through the pure `assertRenderableMineViewModel` guard instead of being partially applied, while a snapshot arriving before `create` is retained and bound by `create`. Two unit tests cover the guard and one browser test drives a second snapshot through the public `applySnapshot` path; both fixes were mutation-verified. Two further cleanups landed with them: `MineFloorView` derives its progress-track width from the floor slot as `SharedStageView` already did rather than hardcoding it, guarded by a containment assertion per floor; and the browser test imports the views' own read-back types instead of restating them, so a renamed `describeRenderedState` field fails type-check. Two further cleanups followed: `MineFloorView` anchors its `Locked` badge and upgrade control once each instead of hand-synchronising three offsets, and the shared-stage read-back reports the bound `upgradeControlLabel` instead of an always-true visibility flag, while the floor pile expectation is derived through `calculateMaterialPileSteps` so balance tuning cannot fail the test opaquely. One hundred sixty-one unit tests and eight Chromium E2E tests pass.
- Step 26 was validated by the user on 2026-08-28 through explicit authorization to proceed with Step 27.
- Step 27 implemented on 2026-08-29: the mine is now live and each production stage is visualised separately. A Phaser-free `MineSimulationDriver` holds authoritative state and advances it to an injected wall clock every time the scene pulls, so `BootScene.update` renders what the core has already produced and never decides when a cycle completes. Extraction, transport, and warehouse each drive their own progress indicator — a per-floor bar, and a cycle bar plus a marker travelling its track for both shared stages — and queued material is rendered everywhere it accumulates as discrete blocks measured against the capacity of the stage that removes it. A full pile turns to the backlog colour and is named `Backed up`, while the elevator reports `Idle` or `In transit` because a full car is one full trip rather than a backlog. A separate cosmetic clock, scaled by a validated `animationSpeedMultiplier`, drives only the miners' picks and the shared-stage conveyors, which run only while a stage holds material.
- Step 27 automated evidence: one hundred eighty-seven unit tests and twelve Chromium E2E tests pass. Twenty-six new unit tests cover the cosmetic clock (speed scaling, freezing at zero, frame capping, invalid deltas, seamless wrapping, swing and conveyor bounds, and the progress-only cycle marker), the driver (clock-driven advance, frozen and backwards clocks, identical results at 200 ms and 20 ms frames, state replacement, snapshot mirroring, and identical gold at animation speeds 0, 1, and 25), and the new bottleneck view-model fields for floors, elevator, and warehouse. Three browser fixtures pause the core on an extraction-, transport-, and warehouse-limited save and assert that the corresponding queue and progress indicator are visible, backed by pixel probes for the backlog colour, the empty queue, and the cycle marker at the start and midpoint of its track. A fourth browser test runs the real driver twice over the same eight seconds of fake wall clock at animation speeds 1 and 20 and asserts byte-identical gold while the animation clock differs by more than tenfold. The extraction fixture also polls the rendered pick offset to show decoration still moving while the paused core's extraction bar does not.
- Step 27 review fixes and decisions: the public `applySnapshot` was removed in favour of the pull, since a pushed snapshot would be overwritten by the next frame; the offline-claim retry now uses a consumed-once flag instead of a cached state candidate, which would have discarded whatever was mined between a failed write and the retry; and rendered-state diagnostics moved to a 100 ms cadence because displayed progress changes every frame. `eslint.config.mjs` enforces `src/game/runtime/**` purity and `tests/unit/architecture.test.ts` probes that rule. Nine mutations were verified to fail with named assertions: a speed multiplier wired to nothing, a scene that never advances the core, a pile that ignores the backlog colour, shared-stage queue blocks that ignore the amount, a cycle marker parked at the start of its track, a conveyor that never stops, a cosmetic clock allowed to drive the authoritative progress bar, a diagnostic frozen at boot, and a floor pick that never moves. A latent pixel-probe race surfaced once the suite grew: the scene publishes its diagnostics inside `create`, before the first frame is presented, and a canvas that has not yet presented reads back as opaque black, so a probe taken immediately after the boot attribute could sample an empty buffer. Both browser specs now poll an always-painted HUD point before any probe; the full suite then passed five consecutive runs. A tenth mutation was added with the review fix below.
- Step 27 review fix — hidden-tab time loss: the driver passed the whole wall-clock gap to `advanceSimulation`, which credits at most `MAX_FOREGROUND_DELTA_MS` but consumes the entire delta. That bound is meant for one slow frame; a hidden tab stops the render loop altogether, so an absence arrived as a single delta and everything past its first second was consumed having never been simulated. Reproduced at sixty seconds: 380 gold when frames ran throughout against 100 — the starting balance — when the same minute arrived as one frame, with the timestamp advanced sixty seconds either way. Because that scenario involves no reload, offline income never saw the interval either. `src/core/simulation/catchUpSimulation.ts` now walks the gap in credited-size slices, which is exact rather than approximate because the sub-tick remainder is carried in authoritative state, and bounds the walk at `MAX_CATCH_UP_MS` (two hours, matching the offline-income horizon) at a measured worst case of roughly thirty milliseconds. Time past the bound is still consumed by `lastUpdateTimestampMs`. Eight new unit tests cover both the core walk and the driver; three mutations fail by name — the driver reverted to a single bounded advance, uncredited time dropped rather than consumed, and the walk left unbounded. - Step 27 review fix — per-frame waste: the driver re-derived its view model on every frame because `advanceSimulation` returns a new object even when no tick completed, which also meant `BootScene`'s identity check could never fire. It now re-derives only when `simulationTick` advanced — the exact condition, since nothing outside `advanceFixedStep` touches production state — while `replaceState` always re-derives, and the renderable guard moved behind the identity check it protects. Separately, the rendered-state read-back is now gated on `import.meta.env.DEV`: nothing in the game reads those attributes, and a shipped build was serializing the whole screen ten times a second. Playwright runs against the dev server, so browser tests are unaffected, and the production bundle no longer contains the dataset writes. Three more mutations fail by name: a driver that never memoizes, a driver that never re-derives, and a `replaceState` that reuses the snapshot. One hundred ninety-eight unit tests, twelve Chromium E2E tests, lint, strict production build, and `git diff --check` pass.

- Step 27 was validated by the user on 2026-08-29 through explicit authorization to proceed with Step 28.
- Step 28 implemented on 2026-08-29: the HUD is live. `createHudViewModel(state, balance)` derives the English `Gold` and `Income /s` captions and their values and rides on the same `MineViewModel` the mine views are bound from, so one snapshot drives the whole screen; `createMineViewModel` and `MineSimulationDriver` therefore take balance data. Income is the core's `effectiveProductionPerSecond`, already capped at the chain's slowest stage, so the figure is what the mine can deliver rather than what the shafts could dig. `HudView` builds its background, divider, and four text objects once and changes only through `applySnapshot`, and `BootScene` publishes `data-hud-view` on the existing 100 ms diagnostic cadence.
- Step 28 number formatting: `src/game/view-model/formatAmount.ts` is now the single formatter for every displayed amount, in the HUD and the mine views alike. It shows at most one decimal place and then no suffix below 1,000, `K`/`M`/`B`/`T`, and alphabetic suffixes counting `aa`, `ab`, ... `zz`, `aaa`, ... matching the game design document's `14.6aa` and `7.2ab`; past three letters — beyond 1e54000 — the serialized scientific form is shown instead of an unbounded run of letters. Two decisions are deliberate: digits are truncated rather than rounded, because a balance that reads higher than it is would promise an upgrade the player cannot afford, and a present-but-tiny amount reads `<0.1` rather than `0`. `GameNumber` gained normalized `mantissa`/`exponent` getters so the formatter reads magnitude directly; converting through `Number` would print the same thing for every value past 1e308.
- Step 28 automated evidence: two hundred seventeen unit tests and fourteen Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Twenty new unit tests cover the formatter (ordinary amounts, each named tier, the alphabetic run walked forty tiers deep without a repeat or a gap, magnitudes at 1e309/1e400/1e1000 and the scientific fallback past the run, truncation and the bound on how far it may overstate, one-decimal stability against floating-point scaling, the tiny-amount label, negative values, and monotonic labels across thirteen magnitudes) and the HUD model (captions, authoritative gold, an abbreviated 1.46e16 balance, income following extraction on a fresh mine, income following the elevator once four high-level shafts out-produce it, income rising when that stage is widened, the model matching the one carried on the mine snapshot, and no mutation of the state read). One browser test asserts the HUD's abbreviated gold and its income against the core's own rate calculation; a second boots the real driver one conversion cycle short of a delivery, runs two seconds of fake wall clock, and asserts the displayed gold equals the authoritative balance while the scene's display-object count is unchanged.
- Step 28 mutation verification: six mutations fail with named assertions — a HUD bound once at boot and never rebound (expected 220, received 100), a HUD never bound at all, a formatter that rounds instead of truncating, an alphabetic run starting one tier late, a formatter reading magnitude through `Number`, an income value taken from aggregate extraction instead of the bottleneck-capped rate, and a `HudView` that appends a new text object per rebind (display objects 159 against 140).
- Step 28 was validated by the user on 2026-08-29 through explicit authorization to proceed with Step 29.
- Step 28 review fixes: four review findings were corrected without changing behaviour. `TRUNCATION_TOLERANCE` in `formatAmount.ts` claimed a displayed amount can never read high, but the tolerance that keeps floating-point scaling from dropping a digit also lifts a value within `1e-9` of the next digit onto it, so `0.9999999999` reads `1`; the tolerance is now documented as the bound on that overstatement and a unit test pins both sides of it, making the claim checkable rather than asserted. `HudView` typed its text anchor as a bare `number` after the move out of `BootScene`, losing the old `'left' | 'right'` safety, and now uses a `HorizontalOrigin = 0 | 1` alias with named constants. `BootScene` published `data-hud-view` as `"null"` before the view existed, which would have surfaced in a browser test as a property access on `null` rather than a named diagnostic failure; the attribute is now written only once the view exists. `GameNumber`'s `mantissa`/`exponent` getters moved out of the middle of the arithmetic group to sit beside `serialize()`, and `exponent` gained its own doc.

- Step 29 implemented on 2026-08-29: the upgrade controls are live. Every unlocked mine shaft and both shared stages carry a button showing the next level's abbreviated price, drawn enabled only when the current balance covers it. `src/game/view-model/upgradeControl.ts` derives each control's caption, price, affordability, command target, and stable key, and every price comes from the same core cost function the purchase command charges — `calculateMineShaftUpgradeCost`, `calculateElevatorUpgradeCost`, `calculateWarehouseUpgradeCost` — so the figure shown and the figure deducted cannot drift. `createMineViewModel` therefore takes each floor's balance config and the spendable balance; a locked floor's control is `null` rather than a disabled button.
- Step 29 input and commands: `UpgradeControlView` is one reusable entity used by both the mine floors (`stacked` layout) and the shared stages (`inline`). Its background rectangle is its hit area, so the pressable region is exactly the drawn one and hiding it removes it from input — which is how locked floors have no reachable button. An unaffordable control still accepts a press and the core answers, because refusing in the view would substitute the renderer's guess for the core's decision and would leave a player who cannot pay with no feedback at all. `MineSimulationDriver.purchaseUpgrade(target)` advances to the current time first — the player spends the gold the mine has now, not what the last frame showed — dispatches to the matching core command, and returns `purchased`, `insufficient-funds`, or `unavailable`. A refusal leaves state and the memoized snapshot untouched, so the scene skips rebinding by identity.
- Step 29 feedback and persistence: the result appears on the pressed control for 1,200 ms — `Upgraded!` on green, `Need more gold` on red — expired by the pure `describeUpgradeFeedback` and timed on the Phaser scene clock rather than the cosmetic animation clock, so animation speed cannot change how long a message stays readable. `BootScene` rebinds and republishes diagnostics immediately on a press, since a purchase changes displayed values without any tick completing, and publishes `data-upgrade-controls` with each visible control's screen-space rectangle, converted through the camera that draws it. The driver gained an optional `onCommandApplied` hook, which `src/main.ts` uses to queue a debounced save: a purchase completes no tick, so a save that followed only ticks would lose it on the next reload.
- Step 29 automated evidence: two hundred thirty-two unit tests and eighteen Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Fifteen new unit tests cover control pricing against the core's own cost functions, an abbreviated price past the safe integer range, the affordability boundary at exactly the price, distinct keys and targets per control, one mine-shaft purchase deducting exactly the displayed price and leaving its neighbours alone, both shared stages bought through their own commands with widened capacity, a refusal changing nothing and reusing the same snapshot object, a locked floor reporting `unavailable`, a purchase charged against gold earned since the last rendered frame, the applied-command hook firing once and never on a refusal, and the feedback labels and their expiry, including a clock moved backwards. Three browser flows press real controls at published coordinates: an unaffordable press that spends nothing and reads `Need more gold` and leaves the price unchanged, one mine-shaft purchase with exactly one deduction, one level increase, an unchanged display-object count, and an updated button price, and the elevator and warehouse bought through their own commands without touching a shaft.
- Step 29 frame cost: the controls re-render on every frame because press feedback expires on the frame clock, so `UpgradeControlView` compares a text colour before writing it. `Text.setColor` repaints the caption's canvas and re-uploads its texture on every call, unlike `Text.setText`, which skips an unchanged value; writing it unconditionally repainted every visible caption sixty times a second to reproduce the pixels already on screen. A browser test counts repaints across idle frames and requires zero — restoring the unconditional write fails it with `a frame that changes nothing must repaint no text` at 176 repaints over 21 frames.
- Step 29 mutation verification: eight mutations fail with named assertions — affordability using strictly-greater instead of at-least, a purchase that skips advancing to the current time, feedback that never expires, a refused command reported as applied, the elevator control priced from the warehouse, a view that refuses an unaffordable press itself (`a refused press must say why`), every press routed to the mine shaft, floor control geometry that ignores the mine camera (`a completed purchase must confirm itself`), and a control bound once and never rebound (`the button price must follow the new level`).

- Step 30 implemented on 2026-08-30: floor unlock controls are live. Every locked floor now states the prerequisite shaft it waits on and what opening it costs, and opens in place when both are satisfied. `describeFloorUnlock(state, floorId, config)` in `src/core/progression/unlocks.ts` returns one locked floor's price, its requirement (prerequisite id, player-facing floor number, required level, and the level that shaft has now), `isRequirementMet`, `isAffordable`, and `canUnlock`, or `null` once the floor is open. `purchaseFloorUnlock` was refactored to read the same private `evaluateFloorUnlock` predicate, so the description a control renders and the command that charges gold cannot disagree; a unit test asserts that agreement — outcome, price, and named gate — across every combination of prerequisite level and balance.
- Step 30 generalization: the upgrade-control model became the purchase-control model, because an unlock is the same control to the player. `src/game/view-model/upgradeControl.ts` is now `purchaseControl.ts`; `UpgradeTarget`, `UpgradeOutcome`, `UpgradeControlViewModel`, `UpgradeFeedback`, and their factories are now `Purchase*`; `isAffordable` became `isEnabled`, because a control is now drawn enabled for two reasons rather than one; `UpgradeControlView` became `PurchaseControlView` with `isEnabledAppearance` in its read-back; `MineSimulationDriver.purchaseUpgrade` became `purchase`; and the canvas diagnostic became `data-purchase-controls`. `PurchaseTarget` gained `{ type: 'floor-unlock', floorId }` (key `floor-unlock:floor-2`), and `PurchaseOutcome` gained `unlocked` and `requirement-not-met`, labelled `Unlocked!` and `Level too low`.
- Step 30 presentation: `createFloorUnlockControlViewModel(availability)` sets the `Unlock` caption, the unlock price, and `isEnabled` from `canUnlock` alone, so gold never enables a button whose prerequisite is short. The requirement sits beside the button rather than on it — `formatUnlockRequirement` produces `Needs Floor 1 Lv 5`, drawn in `TEXT_WARNING` while unmet and `TEXT_MUTED` once satisfied — so a player who is only short of gold is not told to keep upgrading. `MineFloorView` holds two `PurchaseControlView` instances in one slot, of which exactly one is ever visible; Phaser skips invisible objects when hit-testing, so the two can never both take a press. `assertRenderableMineViewModel` now requires exactly one of the two controls per floor, and `createMineFloorViewModel` rejects an unlock description that disagrees with the floor's lock state.
- Step 30 commands and persistence: `MineSimulationDriver.purchase` routes a `floor-unlock` target to `purchaseFloorUnlock` and maps refusals through one `describeRefusal`, which names only `insufficient-funds` and `prerequisite-not-met`; every other core failure is a press that should not have been reachable and reads as `Unavailable` rather than as advice the player cannot use. A successful unlock fires the same `onCommandApplied` hook an upgrade does, so `src/main.ts` queues a save immediately — an unlock completes no simulation tick, and a save that followed only ticks would lose it. `BootScene` now expires its whole feedback map each frame instead of only the entries whose control is still live, because a successful unlock hides the control that was pressed and its result would otherwise stay in the map for the rest of the session.
- Step 30 automated evidence: two hundred forty-seven unit tests and nineteen Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Twenty-two new or rewritten unit tests cover the unlock description against the command it describes, a still-locked prerequisite reported as level zero, a met requirement separated from an affordable price, the unlock control priced from the core's own description, the enabled state across all four gate combinations, the requirement label on both sides of the gate, exactly one control and one key per floor, the control swapping to an upgrade once the floor opens, one unlock deducting exactly the displayed price and initializing the floor while its neighbours are untouched, a repeated unlock reported as unavailable without a second charge or a second applied-command call, both named refusals leaving state and the memoized snapshot untouched, and the two new feedback labels.
- Step 30 browser flow: one Playwright journey drives the whole step on a clock paused at the fixture's save timestamp. Floor 2 shows `Locked`, `Needs Floor 1 Lv 5`, and its price with the button disabled although the seeded balance already covers it; a premature press reads `Level too low` and leaves the floor closed; one floor-1 upgrade satisfies the gate, the refusal clears, and the button enables; the unlock press deducts about one whole price (production only adds gold, so a fall of that size is the deduction), and the floor opens in place — locked colour gone, `Locked` badge gone, miner working, unlock control replaced by the shaft upgrade — with `data-boot-scene-starts` still `1`, proving the scene did not restart. The opened floor reaches IndexedDB before the reload, and after the reload it is still open, still offers its shaft upgrade, and extracts material within ten simulated seconds.
- Step 30 browser-test finding: under a Playwright clock paused with `pauseAt`, the Phaser game loop does not step again after `create`, and a pointer event dispatched before it steps is never taken up — the first press of a run is simply lost. The spec grants one `runFor` once the scene exists, and every press afterwards advances the clock in slices until the control reports a result or disappears, rather than assuming a fixed settling time. A floor's pile is transient, so the production check samples every 250 simulated milliseconds rather than reading once and concluding the floor is idle.
- Step 30 mutation verification: seven mutations fail with named assertions — an unlock enabled by affordability alone (`level 4 with 5000 gold: expected true to be false`), a description drifting from the command by one level (four unrelated unlock tests break), locked floors given no unlock control (six assertions across the view-model and control tests), a prerequisite refusal reported as merely unavailable (`a premature unlock must say which gate refused it`), an unlock that skips the applied-command hook (`the open floor must reach the save before the reload`), a scene that does not rebind after a purchase (`one level bought`), and an unlock control bound once and never rebound (`a locked floor offers an unlock instead`).
- Step 30 was validated by the user on 2026-08-30 through explicit authorization to proceed with Step 31.
- Step 31 implemented on 2026-08-30: the mine scrolls under one thumb. A vertical drag or a wheel anywhere over the mine moves its camera through the 110 logical pixels its four floors overflow by, while the HUD and surface strip stay fixed. `src/game/view-model/mineScroll.ts` decides all of it from pointer coordinates and the mine region alone — travel clamped to `max(0, contentHeight - regionHeight)`, one pixel of content per pixel of thumb from the press anchor, a wheel accepted only over the mine — and every transition returns its input unchanged by identity when nothing moved, so a held finger costs no camera write. `BootScene` binds scene-wide `POINTER_DOWN`/`POINTER_MOVE`/`POINTER_UP`/`POINTER_UP_OUTSIDE`/`POINTER_WHEEL` handlers rather than a draggable object, because the mine is dragged from anywhere over it including its own buttons, and applies the result to the mine camera alone. Phaser hit-tests through that same camera and honours both its scroll and each object's camera filter, so the controls' pressable rectangles follow the scrolled content with no extra bookkeeping.
- Step 31 tap versus scroll: travel under `MINE_SCROLL_DRAG_THRESHOLD_PX` (6) scrolls nothing and suppresses nothing, because a thumb never lands perfectly still and a press that wobbles must both leave the screen where the player aimed and still buy what they aimed at; crossing the threshold scrolls the whole travel, including those six pixels, since that is below what the eye catches while losing one-to-one tracking is not. Every press is tracked, not only one that landed on the mine, because a gesture decides two separate things: whether the mine scrolls, which needs the press to have started over it, and whether the release is still a tap, which is about how far the pointer travelled wherever it began. `hasDragged` outlives the gesture that set it and is cleared only by the next pointer-down — Phaser reports a control's press while the pointer is still coming up — and `BootScene.#requestPurchase` returns early while it is set. A wheel never sets it: a notch of scroll followed by a click is two separate intentions.
- Step 31 touch targets: `MIN_TOUCH_TARGET_PX` (44) and `assertTouchTargetRegion` live in the pure layout module, and every `PurchaseControlView` asserts its own region at construction, so an undersized button throws on the frame it is built rather than surviving as an unattributable miss rate on a phone. Mine floor controls grew from 92×32 to 92×44, and the surface strip grew from 140 to 164 logical pixels so each stage panel can end in a 44-pixel control instead of the 20-pixel bar it had; the mine region moved to `0,236,360,404` and eight mine pixel probes in three existing browser specs moved down with it. `#game-viewport canvas` sets `touch-action: none`, because Phaser's non-passive touch listeners do call `preventDefault` but a browser that has already started panning cannot have the gesture taken back. `PublishedPurchaseControl` gained `isPressable`: a floor control scrolled out of the mine viewport is clipped away and hit-tested by no camera, so its published rectangle would otherwise invite a press that lands on whatever took its place.
- Step 31 automated evidence: two hundred seventy-three unit tests and twenty-six Chromium E2E tests pass, along with lint, the strict production build, and `git diff --check`. Twenty new unit tests cover the scroll range and its rejections, one-to-one dragging, clamping at both ends, the threshold in both directions, a pointer that wanders outside the mine mid-drag, a swipe that began on a fixed layer, a second finger that did not start the gesture, tap suppression surviving the release and clearing on the next press, suppression after a swipe that could not scroll, wheel clamping and region gating, and the read-back; six new layout tests cover region containment and the touch-target minimum.
- Step 31 browser flow: seven Playwright tests at a 390×844 phone viewport, on a clock pinned so no gold is produced and every observed change came from a gesture. A drag scrolls the mine to its clamped maximum and back to zero, with the HUD pixel unchanged, the bottom of the mine coming into view as a pixel change from panel to mine background, floor controls moving by exactly the scroll distance, and the shared stages not moving at all. A drag started on an affordable button scrolls the mine and leaves gold, levels, and even the control's own feedback untouched. A swipe from the surface strip that lifts on a floor's button buys nothing. A tap buys before scrolling, and after scrolling to the bottom a press buys from floor 4's control, which reported `isPressable: false` before the scroll and true after. A press that wobbles by less than the threshold still buys and scrolls nothing. The wheel is refused over the HUD and clamps at both ends over the mine. Every published control measures at least 44×44 and the canvas owns its touch gestures.
- Step 31 review finding: the first implementation tracked only presses that began over the mine, so a swipe starting on the surface strip and lifting on a floor's button still bought a level — an accidental purchase from a gesture, which is what the step forbids. Every press is now tracked, and whether it scrolls became a separate question from whether it stays a tap. A browser test drives that swipe.
- Step 31 test finding: the browser fixture routes `/src/main.ts` to its own module, which does not import `src/style.css` unless it says so, so a `touch-action` assertion read `auto` against a stylesheet that had never loaded. The fixture now imports the stylesheet, which also boots it closer to the real application.
- Step 31 mutation verification: nine mutations fail with named assertions — dropping the tap suppression (`a scroll must not spend gold`), publishing bounds that ignore the camera scroll (`a floor control moves with the content it is drawn on`, plus the reveal assertion), a zero drag threshold (`a wobbling tap must still buy one level` and two unit tests), a camera that never follows the scroll state (`the bottom of the mine must come into view`), a wheel that ignores the mine region (`a wheel over the HUD must not scroll the mine`), `isPressable` reduced to visibility (`the deepest floor starts below the mine viewport`), a 20-pixel shared-stage control (the boot-time touch-target assertion), removing `touch-action` (`the canvas must own its touch gestures`), and suppressing a tap only for gestures that began over the mine (`a swipe must not spend gold`).
- Step 31 was validated by the user through explicit authorization to proceed with Step 32.
- Step 32 implemented on 2026-08-30: an original clean-HD cartoon placeholder family now replaces the debug miner and material shapes and gives the HUD, elevator, warehouse, locked floors, queued material, and purchase controls their own matching visual symbols. The family contains nine semantic 128×128 RGBA PNGs generated through the repository's required asset skills and built-in image generation, then chroma-keyed and sliced deterministically. English labels, prices, progress, input regions, and feedback remain code-native.
- Step 32 asset governance: `public/assets/placeholder/art-direction-brief.md` locks the navy/steel-blue/teal/warm-gold visual system and native-scale constraints; `asset-manifest.json` records generation, roles, and the absence of third-party assets or external branding. Raw generation, prompt, processed transparent sheet, individual frames, GIF, and QC metadata are retained under `art-source/placeholder/`, outside the production public directory.
- Step 32 visual evidence: direct browser review passed at exact 360×640 scale and at a reduced 320×568 phone viewport. Miner, elevator, warehouse, gold, locked state, and upgrade state remain distinguishable, touch controls remain readable, and fresh boots report no browser warnings or errors. Backlogged gold/crates switch to a solid red silhouette while normal queues retain the illustrated artwork; the silhouette is a texture generated once from the source sprite at boot, because Phaser tints under WebGL only and the cue has to survive a Canvas fallback.
- Step 32 automated evidence: 277 unit tests and 26 Chromium E2E tests pass. Three new asset tests pin one runtime file per semantic texture, exact 128×128 RGBA PNG structure, generated provenance, and no third-party branding. Existing real-framebuffer probes were retargeted from debug blocks to generated gold silhouettes and still prove ordinary/empty/full/backlogged states. Lint, the strict production build, `git diff --check`, and raster alpha/size QA pass.
- Step 32A implemented on 2026-08-31 after user approval of `layout1.png`: the shaft narrowed to 48 px, floor slots expanded to 288×132, mine content became 572 px with 168 px travel, and pure semantic panel geometry now owns all approved positions. The first pack adds a cave floor background, separate empty gold container and gold pile, elevator shaft and cabin, and strict four-frame sheets for the walking miner, unloading attendant, and elevator cargo cat. The miner patrols right, flips, and returns left; the cabin follows authoritative elevator progress while character frames remain cosmetic.
- Step 32A asset evidence: all three accepted animation sheets have four valid frames with zero output-edge contact and zero paste clamp. Initial miner and unloader generations failed the feet-anchor threshold and were regenerated instead of relaxing QC. Prompts, raw sources, rejected passes, transparent sheets, frame exports, GIFs, pipeline metadata, and provenance are retained under `art-source/step-32a-asset-pack/` and `public/assets/step-32a/asset-manifest.json`.
- Step 32A automated evidence: 288 unit tests, 27 Chromium E2E tests, lint, and the strict production build pass. Browser probes derive from the semantic floor layout, validate both WebGL and Canvas backlog rendering, and cover the newly revealed floor-four control after camera settlement.
- Step 32A annotation revision on 2026-08-31: removed the visible per-floor extraction bar and duplicated `Floor N` title; miner position and facing now derive from authoritative extraction progress while sprite frames remain cosmetic. Its corridor reaches from the unloading cat to the gold pile before turning. Queued gold is rendered as coin icon plus abbreviated amount, the approved pile remains gold during backlog, is centred at x=232 under the timber support, and is raised clear of the floor seam. Open floors use a minimum thumb-safe 44×50 `Level N` control, and the cave ceiling/soil seam is cropped to half thickness from floor 2 downward while floor 1 and the surface keep the original depth. The revision passes 288 unit tests, 27 Chromium E2E tests, lint, and the production build and still awaits user validation.
- Step 32A second annotation pass: the offline reward now formats two useful decimals with a stable lowercase `k` tier (`287.533… → 287.53`, `1,213,120 → 1213.12k`) instead of exposing serialized decimal tails; a number-only badge restores floor identity without restoring the removed `Floor N` caption; queue coin and amount share one centred baseline; and a new layout1-referenced low irregular gold mound replaces the coarse first pile. Its 128×128 RGBA runtime output has valid alpha and strict QC reports zero empty frames, output-edge contacts, or paste clamps. The level control's visible chrome shrank from 44×50 to 30×34 (under half the prior area) while a transparent 44×50 hit region preserves touch safety; resolution-2 text keeps the tiny label sharp. The pass is covered by 290 unit and 27 Chromium E2E tests.
- Step 32A elevator annotation pass: removed the redundant numbered plaques from inside the shaft. The core now drives a physical route from the surface through every unlocked floor, loading only on arrival and continuing deeper while capacity remains, then returning when full or after the deepest stop. A full load makes a leg 75% slower than an empty load, ascent time scales with depth, and the cabin/cargo-cat sprites follow the authoritative route. `Collecting` and `Returning` replace the ambiguous transport status. Save version 1 remains compatible through a signed legacy cursor, with schema validation and a new returning-route regression. All 292 unit tests, 27 Chromium E2E tests, lint, production build, and direct browser inspection pass; Step 33 remains blocked pending user validation.
- Step 32A elevator alignment pass: the cabin now stops at the gold-container centre rather than the floor-slot centre, so its platform is horizontally level with the receiving cart. The existing 128 px cabin source is displayed at 46 px inside the 48 px shaft and the cargo cat at 32 px for a larger, sharper read. Number-only floor badges grow from 26×26/16 px text to 34×34/21 px text (about 30%) around the same centre; the compact `Level N` control is unchanged. Pure geometry and a new browser regression pin the stop and scaled objects, and direct browser inspection confirms no collisions. All 292 unit and 28 Chromium E2E tests pass; Step 33 remains blocked pending user validation.
- Step 32A floor-control sizing follow-up: the number-only floor badge is reduced to exactly 60% of the preceding 34×34 review size, producing 20.4×20.4 chrome and 12.6 px text around the same centre. The 30×34 visible `Level N` chrome shifts 5 px right while its 44×50 hit target stays fixed. Rendered diagnostics now expose both visual and hit bounds, and the browser regression pins the 12 px left inset and 30 px visual width. Direct canvas inspection, all 292 unit tests, all 28 Chromium E2E tests, lint, and the production build pass; Step 33 remains blocked pending user validation.
- Step 32A elevator/cart asset follow-up: generated and integrated a 256×256 cabin v2, a strict four-frame cargo-cat v2, and a 256×256 filled-cart state using the existing pack plus `layout1.png` as references. The shaft/cabin/cargo-cat display stack grows from 48/46/32 px to 64/62/50 px while the floor remains 288×132. Positive queue state swaps the receiving cart from empty to filled. Cabin position now remaps authoritative leg progress through smootherstep, producing zero visual velocity at each stop without changing production timing. The number-only badge is half the annotated 34 px size (17×17, 10.5 px text). All new assets have zero empty frames, output-edge contacts, and paste clamps; cargo body-scale CV is 0.0064 and anchor-Y standard deviation is 0.0251. Direct canvas inspection and sampled motion confirm the larger character, filled carts, exact stops, and slowdown; 294 unit tests, 28 Chromium E2E tests, lint, build, and diff checks pass. Step 33 remains blocked.
- Step 32A typography/character-scale follow-up: installed and self-hosted Fredoka 600/700, waits for both weights before Phaser starts, and applies SemiBold/Bold to every Phaser and DOM caption. Removed the duplicate `Gold` and `Income /s` HUD captions while preserving their icon-plus-value pairs. Miner and unloader display frames grow to 75 px so their approximately 59% occupied height matches the 50 px elevator cat's approximately 88% occupied height. Direct inspection at 434×934 confirms the new typeface, caption removal, and balanced cats; 296 unit tests, 28 Chromium E2E tests, lint, build, and diff checks pass. Step 33 remains blocked.
- Step 32A surface-tower follow-up: generated and integrated a compact 512×512 transparent elevator headhouse with a visible top gold hopper, segmented right-side discharge chute, and open cabin bay. The cabin route now ends at `(55, 118)` inside that bay rather than at the mine-camera boundary; a presentation-only fixed-layer twin fades across the seam while core timing, load behavior, and save schema version 1 remain unchanged. The headhouse replaces the legacy elevator card and receives its upgrade taps, eliminating the visual overlap. `formatAmount` now retains one decimal for whole abbreviated tiers (`2M → 2.0M`) everywhere. Asset strict QC reports zero empty frames, output-edge contacts, or paste clamps. Direct browser inspection, 296 unit tests, 29 Chromium E2E tests, lint, and build pass. Step 33 remains blocked pending validation.
- Step 32A floor-continuity follow-up: the approved far-right gold mound is now fixed 52×52 environmental art on every unlocked floor, independent of queue depletion, so it never hides, blinks, or changes scale. Queue state continues to drive the left receiving cart's empty/filled texture, amount label, and `materialPileSteps` diagnostic. Inter-floor slot gap changed from 8 px to zero; four floors now tile edge-to-edge inside 548 px of content with 144 px scroll travel. Direct canvas inspection, 296 unit tests, 29 Chromium E2E tests, lint, and build pass. Save/database schema version 1 is unchanged and Step 33 remains blocked.
- Step 32A warehouse/alignment follow-up: generated and integrated a 512×512 open warehouse depot plus a strict 2×2 supervisor-cat idle sheet. The legacy warehouse card is hidden, the building routes taps to the unchanged warehouse upgrade command, and the decorative supervisor adds no manager state. The asymmetric elevator headhouse's semantic bay centre is left of its full texture centre, so the surface cabin endpoint changes from `(55, 118)` to `(48, 118)`. Both generated assets pass strict QC with zero empty frames, output-edge contacts, or paste clamps; supervisor body-scale CV is 0.0087 and anchor-Y standard deviation is 0.0372. Direct canvas inspection, 298 unit tests, all 29 Chromium E2E tests, lint, build, and diff checks pass. Save/database schema version 1 is unchanged; Step 33 remains blocked.
- Step 32A straight-entry/layout follow-up: eliminated the remaining 12 px horizontal interpolation by making every cabin pose use the underground shaft centre `x=36`. The tower itself moves left so its open bay is centred on that axis, producing a straight vertical entry. Warehouse chrome shrinks from 164×158 to 140×140 and is flush with the right boundary; the supervisor shrinks from 64 to 56 px, moves with the depot, and is mirrored to face left. Regression diagnostics pin the shared axis, right-edge alignment, dimensions, and facing. Direct browser review, 298 unit tests, all 29 Chromium E2E tests, lint, and build pass. Save/database schema version 1 is unchanged; Step 33 remains blocked.
- Step 32A shared-stage level-control follow-up: generated elevator tower v2 with a steel-blue mounting bracket immediately right of the discharge tray, then added visible compact `Level N` upgrade badges at `(124,58,44,50)` for elevator and `(263,0,44,50)` for warehouse relative to the surface. Chrome remains 30×34 while each hit region is 44×50; both controls reuse the existing stage purchase, affordability, and feedback path. The warehouse badge sits above the roof and the elevator badge is right of and no lower than the tray. Strict asset QC, direct mobile-browser review, 299 unit tests, all 29 Chromium E2E tests, lint, build, and diff checks pass. Save/database schema version 1 is unchanged; Step 33 remains blocked.
- Step 32A surface-hauler follow-up: moved the elevator level region to `(106,53,44,50)`, so its existing 30×34 chrome hugs the discharge outlet and clears the tray bottom. Generated and integrated strict 2×2 sheets for an orange hard-hat worker cat and a four-phase vertical gold cascade. A pure `calculateSurfaceHaulerPose` loop keeps the cart empty under the chute when no shared stage holds material; otherwise it pours, switches to the filled-cart texture, eases toward the warehouse, unloads, and returns empty with the cat mirrored. The cart loop is presentation-only and leaves economy/save schema version 1 unchanged. Asset QC reports zero empty frames, output-edge contacts, or paste clamps; cat body-scale CV is 0.0088 and anchor-Y standard deviation is 0.0307. Direct browser inspection confirms the chute-to-cart stream and readable worker/cart composition. 304 unit tests, all 30 Chromium E2E tests, lint, build, and diff checks pass; Step 33 remains blocked.
- Step 32A surface landscape/cart-scale follow-up: `setTexture` restored each cart source's native dimensions, so swapping from the 128 px empty file to the 256 px filled file doubled the on-screen cart. `BootScene` now reapplies the invariant 46×46 display box after every swap and diagnostics/tests measure both states. The elevator badge rises 5 px to `(106,48,44,50)`. A new original blue-sky landscape with rounded clouds, distant teal mountains/pines, and green meadow is normalized to 720×328 and rendered at 360×164 behind all surface gameplay. Asset manifest/provenance and exact-size raster QA are updated. Direct browser review confirms fixed cart scale, raised badge, and readable foreground over the landscape. 304 unit tests, all 30 Chromium E2E tests, lint, build, and diff checks pass; save/database schema version 1 is unchanged and Step 33 remains blocked.
- Step 32A warehouse-hauler crew follow-up: the existing lead cat is joined by
  one pooled assistant every ten warehouse levels through level 100, so levels
  10, 20, and 100 show 2, 3, and 11 cats. Assistants reuse the generated sheet,
  vary frames, and occupy two mirrored staggered rows around the invariant-size
  cart. Pure unit coverage pins every threshold/cap and invalid input; browser
  coverage pins the level-20 count, distinct positions, and synchronized facing.
  All 307 unit tests and 31 Chromium E2E tests pass. Economy, throughput,
  save/database schema version 1, and Step 33 are unchanged.
- Step 32A independent-crew/lowercase-unit follow-up: every visible assistant
  now receives an evenly spaced offset in the 5.2-second surface route plus a
  shallow personal lane and independent sprite-frame timing. Idle assistants
  wait at separate points between chute and warehouse. Warehouse level-10 live
  diagnostics confirm the two cats occupy opposite route sides and facings
  instead of overlapping. All number surfaces now share lowercase named tiers
  `k/m/b/t/qa/qi/sx/sp/oc/no/dc`, then `aa` at `10^36`, `ab` at `10^39`, ...;
  offline rewards reuse the tier resolver with up to two decimals. Throughput,
  economy, save/database schema version 1, and Step 33 are unchanged. All 309
  unit tests and 31 Chromium E2E tests pass.
- Step 32A per-cat-cart/HUD-precision follow-up: every visible surface hauler
  now owns one pooled cart that follows the same independent route pose and
  retains the invariant 46×46 empty/filled display box. The HUD centre slot
  shows authoritative elevator-carried gold. The main shared formatter now
  retains two decimals (`3.40m`, `203.40`) while keeping lowercase tiers and
  truncation semantics. Economy, throughput, save document version 1,
  IndexedDB schema version 1, and Step 33 remain unchanged. Automated evidence:
  310 unit tests, 31 Chromium E2E tests, lint, and production build pass.
- Step 32A mine-floor miner crew follow-up: each unlocked floor now pools one
  base miner plus four assistants and reveals totals of 1/2/3/4/5 at shaft
  levels 1/50/100/150/200, capped at five above level 200. Assistants use
  independent progress-driven patrol phases, shallow lanes, facing, and frame
  offsets, and rendered diagnostics expose every active pose. The same pure
  threshold function applies to all floor instances. This remains cosmetic;
  extraction, throughput, economy, save document version 1, IndexedDB schema
  version 1, and Step 33 are unchanged. Automated evidence: 313 unit tests, 32
  Chromium E2E tests, lint, and production build pass.
- Step 32/32A was validated by the user on 2026-09-02 through explicit
  authorization to begin Step 33.
- Step 33 implemented on 2026-09-02: `tests/e2e/player-journey.spec.ts` runs a
  complete real-application journey twice in separate clean browser contexts.
  Each run advances a controlled wall clock through the deterministic economy
  policy, presses the actual published canvas controls, buys mine-shaft,
  elevator, and warehouse upgrades, opens floors 2 and 3, reaches a level-10
  milestone, persists and reloads the exact expected version-1 state, claims a
  one-hour offline reward, reloads again, and proves the same interval cannot be
  claimed twice. Both runs must produce identical expected pre-offline and
  post-claim documents with no console or page errors.
- Step 33 integration finding: at 361 simulated seconds, repeated fractional
  elevator pickups produced `11153.2583495261` transported against
  `11153.258349526` extracted. The mathematically impossible `1e-10` excess was
  arithmetic-history drift and made `createSaveDocument` reject a legitimate
  session. `advanceElevator` now clamps accumulated transport to its extracted
  upper bound. Seeded elevator fixtures now carry matching extraction totals,
  and a ten-minute progression regression proves every floor remains saveable.
- Step 33 automated evidence: 314 unit tests, 33 Chromium E2E tests, lint, the
  strict production build, and `git diff --check` pass. The focused player
  journey itself completes both clean-profile runs in approximately 52 seconds.
  Step 34 has not been touched.
- Step 34 implemented on 2026-09-02: lifecycle saves advance the driver to the
  event boundary before stamping the document, so an interval between the last
  rendered frame and `visibilitychange`/`pagehide` cannot be lost.
- Abrupt navigation exposed that browsers may tear down a document before its
  asynchronous IndexedDB transaction commits. A validated synchronous
  localStorage journal at `cat-mine-idle:lifecycle-save-v1` now protects only
  that boundary. The repository selects it only when it is a newer valid
  version-1 save and clears it after IndexedDB catches up.
- Step 34 controlled-clock browser coverage proves hidden/visible catch-up is
  byte-for-byte equal to uninterrupted foreground play, while a closed-page
  interval is settled at configured offline efficiency and cannot be claimed
  twice. Real abrupt navigation, reload, journal cleanup, and absence of console
  or page errors are covered.
- Step 34 automated evidence: 318 unit tests, 35 Chromium E2E tests, lint,
  strict production build, and `git diff --check` pass.
- Step 34 was validated by the user on 2026-09-03 through explicit
  authorization to proceed with Step 35.
- Step 35 implemented an optimized-build performance project and a ten-minute
  all-four-floor acceptance run in Google Chrome 151 using a Pixel 5 profile,
  Android 11 user agent, 393×727 viewport, DPR 2.75, and 4× CPU throttling.
  Normal production builds statically remove the benchmark-only object, floor,
  and scroll read-backs.
- A first Step 35 implementation published the scene-graph size once from
  `create` and read that same static attribute back after ten minutes,
  reporting "258, constant" as if it were a trend. The metric could not have
  detected growth. Fixed by republishing live object and unlocked-floor counts
  twice a second behind the profiling flag, sampling both with every heap
  sample, and asserting the sampled minimum equals the maximum.
- Step 35 automated evidence: 72,188 sampled frames measured 8.33 ms mean,
  9.2 ms p95, 9.3 ms p99, 16.0 ms maximum, and zero frames above 33.34 ms. The
  host presented at 120 Hz, so the raw 120.01 FPS figure is presentation
  cadence; the budget result is roughly two times headroom against the 16.67 ms
  60 FPS target. Post-GC live heap changed by 155,360 bytes over ten minutes
  with a -502 bytes/s post-warm-up slope. Phaser objects held at 258 across all
  twenty samples, unlocked floors at 4 at boot and at end, DOM nodes at 176,
  listeners stabilized at 160, and scroll response measured 50.1 ms p95 /
  52.5 ms maximum.
- Step 35 asset/startup evidence: boot completed in 819 ms; the optimized output
  measured 3,887,708 bytes total, 2,200,266 image bytes, 95,720 font bytes, and
  2,343,440 transferred resource bytes. The main JavaScript chunk is 1,557,900
  bytes raw (about 414 kB gzip), retained as a documented future startup budget
  concern because the measured startup and frame budgets pass.
- No physical Android/ADB target was available. The passing result is a
  repeatable Pixel 5 emulation benchmark in desktop Chrome and must not be
  represented as physical-device evidence. Existing repeated visual objects
  are pooled and the sampled object/heap measurements found no runtime
  bottleneck that justified a speculative rewrite. The remaining per-frame
  allocation is `catchUpSimulation` returning a new immutable state each frame,
  kept deliberately because the core's determinism rests on it.
- Step 35 regression evidence: 318 unit tests, 35 Chromium E2E tests, lint, the
  ordinary production build with profiling hooks absent, and `git diff
  --check` pass. Save document and IndexedDB schema versions remain 1.

- Step 35 was validated by the user on 2026-09-03 through explicit
  authorization to proceed with Step 36. The physical mid-range Android Chrome
  pass remains an open caveat rather than a blocking gate.
- Step 36 implemented on 2026-09-03: `vite.config.ts` declares the `/`
  deployment base path the runtime's absolute `/assets/...` texture requests
  depend on, and `playwright.production.config.ts` plus
  `tests/production/production-smoke.spec.ts` build `dist/`, serve it through
  `vite preview` at `127.0.0.1:4175`, and verify the served bundle instead of
  the development server.
- Step 36 coverage: every runtime texture path and both self-hosted Fredoka
  weights load successfully with no failed request and no 4xx/5xx response; a
  controlled 40-second session flushed at a `visibilitychange` boundary equals
  the document derived in the test process, a reload at the same instant
  re-settles that identical document, and a further 20 seconds continues from
  the deserialized saved state; corrupt and unsupported payloads each recover
  into a playable fresh game with a visible notice and no uncaught error; a
  browser whose `indexedDB.open` throws still boots, reports the failure, and
  keeps rendering; and canvas plus all four logical regions stay inside narrow
  phone, tall phone, tablet portrait, and desktop viewports.
- Step 36 also proves the artefact under test is the shipped one: every document
  entry resolves under `/assets/`, nothing is served from `/src/`, and the
  dev-only rendered-state read-backs and opt-in profiler attributes are absent.
  Because those diagnostics are stripped, actual rendering is proven by a pixel
  probe of the canvas backing store.
- Step 36 finding: Steps 21 and 22 required a visible diagnostic and a recorded
  save-recovery warning, and the core produced both, but `src/main.ts` never
  passed `loadActiveGame`'s `onWarning` or the save coordinator's
  `onDiagnostic`. A player whose local save was rejected silently restarted with
  no explanation, and every unit test stayed green because the capability itself
  was correct. Fixed with `src/ui/SaveDiagnosticBanner.ts`, one non-blocking
  dismissible notice shared by both callbacks and de-duplicated by code.
  Removing the wiring fails exactly the three new error-handling tests.
- Step 36 automated evidence: 318 unit tests, 35 Chromium E2E tests, all nine
  production smoke tests, lint, the strict production build, and
  `git diff --check` pass. `npm run verify` runs lint, unit, E2E, build, and the
  production smoke suite in the order Step 36 specifies. Save document and
  IndexedDB schema versions remain 1. Step 37 has not been touched.

## Implementation Step Status

| Step | Status | Evidence |
|---|---|---|
| 1 — Scope and repository state | Complete | Documentation reviewed; scope consistent; repository and database checks passed. |
| 2 — Scaffold the web application | Complete | Vite/TypeScript scaffold and Phaser 4.2.1 are locked; browser load and production build pass. |
| 3 — Add quality tooling | Complete | User validated the passing Step 3 checks and authorized Step 4. |
| 4 — Create planned module boundaries | Complete | User validated the passing Step 4 checks and authorized Step 5. |
| 5 — Create a minimal Phaser boot scene | Complete | User validated the passing Step 5 checks and authorized Step 6. |
| 6 — Define base-game balance configuration | Complete | User validated the passing Step 6 checks and authorized Step 7. |
| 7 — Introduce the large-number boundary | Complete | User validated the passing Step 7 checks and authorized Step 8. |
| 8 — Define authoritative game state | Complete | User validated the passing Step 8 checks and authorized Step 9. |
| 9 — Implement fixed-step simulation time | Complete | User validated the passing Step 9 checks and authorized Step 10. |
| 10 — Implement extraction | Complete | User validated the passing Step 10 checks and authorized Step 11. |
| 11 — Implement the shared elevator | Complete | User validated the passing Step 11 checks and authorized Step 12. |
| 12 — Implement warehouse conversion | Complete | User validated the passing Step 12 checks and authorized Step 13. |
| 13 — Run unlocked floors concurrently | Complete | User validated the passing Step 13 checks and authorized Step 14. |
| 14 — Add production-rate calculations | Complete | User validated the passing Step 14 checks and authorized Step 15. |
| 15 — Implement upgrade costs for all three stages | Complete | User validated the passing Step 15 checks and authorized Step 16. |
| 16 — Apply stage-specific upgrade effects | Complete | User validated the passing Step 16 checks and authorized Step 17. |
| 17 — Add milestone multipliers | Complete | User validated the passing Step 17 checks and authorized Step 18. |
| 18 — Implement sequential floor unlocks | Complete | User validated the passing Step 18 checks and authorized Step 19. |
| 19 — Add an economy progression simulation | Complete | User validated the passing Step 19 checks and authorized Step 20. |
| 20 — Define the versioned save format | Complete | User validated the passing Step 20 checks and authorized Step 21. |
| 21 — Add IndexedDB persistence | Complete | User validated the passing Step 21 checks and authorized Step 22. |
| 22 — Handle corrupt or incompatible saves | Complete | User validated the passing Step 22 checks and authorized Step 23. |
| 23 — Calculate capped offline income | Complete | User validated the passing Step 23 checks and authorized Step 24. |
| 24 — Present and claim offline rewards | Complete | User validated the passing Step 24 checks and authorized Step 25. |
| 25 — Establish responsive portrait layout | Complete | User validated the passing Step 25 checks and authorized Step 26. |
| 26 — Render the mine floors | Complete | User validated the passing Step 26 checks and authorized Step 27. |
| 27 — Visualize the three production stages | Complete | User validated the passing Step 27 checks and authorized Step 28. |
| 28 — Connect the HUD | Complete | User validated the passing Step 28 checks and authorized Step 29. |
| 29 — Connect upgrade controls | Complete | User validated the passing Step 29 checks and authorized Step 30. |
| 30 — Connect floor unlock controls | Complete | User validated the passing Step 30 checks and authorized Step 31. |
| 31 — Add mine scrolling and one-thumb input | Complete | User validated Step 31 and authorized Step 32. |
| 32 — Add original placeholder presentation | Complete | User validated Step 32/32A and authorized Step 33. |
| 33 — Add the complete player-journey E2E test | Complete | User authorized Step 34 after the deterministic two-profile journey passed. |
| 34 — Verify persistence across lifecycle events | Complete | User authorized Step 35 after event-boundary catch-up, hidden/visible equivalence, abrupt-navigation recovery, and exact-once offline settlement passed. |
| 35 — Profile mobile performance | Complete | User authorized Step 36 after the ten-minute Pixel 5/4× CPU Chrome emulation passed its frame, memory, sampled scene-graph, four-floor, startup, asset, and responsive-input assertions; physical Android evidence remains an open caveat. |
| 36 — Validate production build behavior | Complete | User authorized Step 37 on 2026-09-08. Lint, unit, E2E, and the production build pass in sequence, then nine smoke tests pass against the built bundle served from the root base path, covering asset loading, bundle identity, canvas rendering, exact save/restore, corrupt/unsupported/unavailable storage recovery, and four viewports. |
| 37 — Close the base-game milestone | Complete | User validated Step 37 on 2026-09-08, closing the base-game milestone. Every prior step carries recorded passing evidence; `npm run verify` passes end to end (lint, 327 unit, 40 Chromium E2E, strict build, 9 production smoke); the fifteen-floor benchmark was re-run to replace four-floor evidence; `README.md` added; documentation corrected to the delivered fifteen-floor mine and sequential elevator; deferred features recorded rather than built. |

- 2026-09-08 tower-empty surface-delivery correction: `BootScene` now passes one queue predicate, `warehouse.queueSteps > 0`, to the lead and every assistant surface-hauler pose. Elevator cargo in transit no longer triggers a filled cart or gold cascade before reaching `warehouse.inputQueue`; a zero tower queue shows the empty tower and empty carts throughout the loop. The new browser regression holds 50 material in the active elevator while forcing warehouse input to zero and samples two animation poses; it and the existing positive-queue cart/pour test pass. Memory Bank was updated immediately after this feedback item. Save/database schema version 1 is unchanged.

- 2026-09-08 mine-floor detail/batch-upgrade feedback: the compact floor Level badge is selection-only and opens `MineShaftUpgradeModal`; it no longer buys on tap. The responsive accessible dialog shows level, output per cycle, cycle time, waiting material, and next output, with x1, x5, and exact MAX affordable CTAs. Core geometric batch quoting and atomic purchasing share one cost calculation, preserve floor progress/queues/totals, and persist once. The open modal refreshes after purchase and disables Phaser input for its full lifetime; this fixes the click-through found when a close gesture also upgraded the warehouse underneath. Unit regressions cover x5 cost/purchase, exact MAX bounds, modal attributes/options, and one persistence hook; browser regressions cover no-spend open, disabled unaffordable choices, exact x1 and MAX deductions, live rebinding, scroll/journey compatibility, and the background-input boundary. Final evidence is lint, 327 unit tests, all 40 Chromium E2E tests, strict build, nine production smoke tests, and clean diff whitespace. Direct browser-app inspection confirms Level 1 → Level 6 through x5 while warehouse stays Level 1 and no console error appears. Memory Bank was updated immediately after completion; save/database schema version 1 is unchanged.

- 2026-09-08 elevator-tower detail/batch-upgrade feedback: tapping the tower Level badge or building now opens the existing accessible blocking detail popup and spends nothing. It reports the authoritative level, capacity, 1.5 s cycle, current carried material, and next capacity, with exact x1/x5/MAX affordable choices. Shared geometric batch quoting/purchasing raises the final capacity atomically while preserving transit progress, cargo, and route cursor. Focused core and view-model tests pass; Memory Bank was updated immediately before work moved to the warehouse feedback. Save/database schema version 1 is unchanged.

- 2026-09-08 warehouse detail/batch-upgrade feedback: tapping the warehouse Level badge or building now opens the shared popup without purchasing. It reports level, capacity per cycle, 1.2 s cycle, authoritative `warehouse.inputQueue` as Gold queued, and next capacity, with exact x1/x5/MAX choices. Atomic batch purchase preserves input queue, conversion progress, and cumulative delivery state while updating final capacity and persisting once. Focused shared-stage core/view-model tests pass; Memory Bank was updated immediately on completion. Save/database schema version 1 is unchanged.

- Final shared-popup evidence: lint, strict build, 332 unit tests, all 41 Chromium E2E tests, nine production-bundle smoke tests, and clean diff whitespace pass. The shared-stage browser regression proves opening spends nothing, elevator x1 and warehouse x5 deduct exact costs, attributes refresh in place, and no other stage changes. Direct in-app inspection confirms responsive tower/warehouse dialogs and zero console errors.

- 2026-09-08 shared-MAX validation review fix: the mine-shaft MAX wrapper now preserves the public cost API's floor/config identity invariant before entering the generic affordability search. A regression passes a floor with another floor's config and requires the same descriptive mismatch error as single/batch quotes. Memory Bank was updated immediately after the focused test passed; schema version 1 is unchanged.

- 2026-09-08 shared-popup gesture review fix: `BootScene.#openUpgradeModal` now shares the scroll model's `hasDragged` guard across floor, elevator, and warehouse selections. A focused browser regression starts and ends inside the elevator's 44×50 Level target while moving beyond the tap threshold; the modal remains hidden and no mine scroll occurs. Memory Bank was updated immediately after the test passed; schema version 1 is unchanged.

- 2026-09-08 Memory Bank verification-count review fix: `techContext.md` now records the current 332 unit tests and 41 Chromium E2E tests, including all-stage batch upgrades and popup drag rejection, replacing its stale 327/40 floor-only summary. This documentation-only finding was recorded immediately.

- 2026-09-08 empty-tower hauler-loop feedback: `calculateSurfaceHaulerPose` no longer parks the lead worker when tower gold is absent, and `calculateSurfaceHaulerAssistantPose` no longer parks assistants at fixed waiting points. Every active cat keeps its independently phase-shifted tower→warehouse→tower round trip; `warehouse.inputQueue` still exclusively gates filled-cart textures and the pour effect. Focused unit coverage proves empty outbound/return poses for the lead and independent empty routes for assistants; the browser regression proves the empty cart and worker both change X while the tower remains empty and the pour stays hidden. Memory Bank was updated immediately; economy and schema version 1 are unchanged.
- 2026-09-08 final empty-tower review: lint, strict build, 332 unit tests, all 41 Chromium E2E tests, nine production smoke tests, and clean diff whitespace pass. Direct inspection of the hot-reloaded in-app tab confirms synchronized cat/cart movement and zero console errors; the deterministic empty-queue fixture supplies the authoritative zero-queue visual proof.
- 2026-09-08 blurred shaft-connector feedback: replaced one vertically stretched 192×528 shaft image with a 64×1,980 tiled shaft. Horizontal texture scale remains the intended `64 / 192`; vertical tile scale is fixed at `1`, repeating every 528 pixels instead of interpolating the source across fifteen floors. The focused Chromium read-back regression passes and direct in-app inspection confirms crisp rails/braces. Memory Bank was updated immediately after this isolated fix; simulation, saves, and database schema version 1 are unchanged.
- 2026-09-08 final shaft-fix evidence: lint, strict build, 332 unit tests, all 41 Chromium E2E flows, nine production smoke tests, and `git diff --check` pass. The live in-app diagnostic confirms the exact 64×1,980 tile contract with `(1/3, 1)` scale and no asset-load or console error.
- 2026-09-08 many-floor miner-stutter feedback: the measured fifteen-floor benchmark remains 60 FPS, while code inspection identified a 10 Hz presentation snap caused by binding miner X directly to 100 ms fixed-step extraction snapshots. `MineFloorView` now interpolates its currently rendered normalized progress forward to each authoritative target over one `SIMULATION_STEP_MS`, handles cycle wrap without reversing, and settles exactly at the target when no newer core snapshot arrives. Three focused unit regressions and the known-snapshot floor browser fixture pass. Memory Bank was updated immediately after this fix; production state, output, saves, and database schema version 1 are unchanged.
- 2026-09-08 scrolled deep-elevator feedback: removed `scrollY` from both the top-of-shaft world endpoint and its surface-layer mapping. Before the fix, scrolling deeper physically moved that endpoint down the mine, so a cabin returning from an offscreen floor skipped the intervening world distance and appeared to slide through the tower. A focused Chromium regression returns from floor 11, scrolls the mine, and proves underground plus surface-twin route coordinates remain invariant. Memory Bank was updated immediately after the isolated fix; the authoritative sequential route and schema version 1 are unchanged.
- 2026-09-08 final miner/elevator evidence: lint, strict build, 335 unit tests, all 42 Chromium E2E tests, nine production smoke tests, and clean diff whitespace pass. The repeated ten-minute Pixel 5/4×-CPU benchmark with all fifteen floors active holds 60.000 FPS, 17.6 ms p95, 17.8 ms max, zero over-budget frames, constant 665 Phaser objects, and 81.9 ms scroll p95. Direct in-app review at `scrollY=560` reports no console errors or warnings.

## Server Milestone Step Status

| Step | Status | Evidence |
|---|---|---|
| 1 — Record scope, threat model, and open questions | Validated by the user on 2026-09-08 | `memory-bank/server-threat-model.md`. Documentation only: no code, no balance value, no schema version changed. |
| 2 — Design the save-sync protocol | Validated by the user on 2026-09-08 | `memory-bank/server-save-sync-protocol.md`. Documentation only: no code, no balance value, no schema version changed. |
| 3 — Design the database schema | Validated by the user on 2026-09-08 | The complete Postgres schema now appears byte-identically in `memory-bank/architecture.md` and `memory-bank/techContext.md`, replacing the "Relational/server database schema: none" statement in each. Documentation only: no migration, no database, no client schema version changed. |
| 4 — Stand up the Supabase project and local stack | Validated by the user on 2026-09-08 | Supabase CLI 2.117.0 pinned exactly; `supabase/config.toml`, one bootstrap migration, `save-sync` Edge Function serving protocol §10.1, `.env.example`, `npm run verify:server`, `npm run scan:secrets`, and 19 static invariants in `tests/unit/server-stack.test.ts` plus 10 scanner regressions in `tests/unit/bundle-secret-scan.test.ts`. All nine checks pass from a clean checkout against an empty Docker volume set; four defects found in user review are fixed with regressions. No client code, gameplay, balance value, or schema version changed. |
| 5 — Add migrations and CI | Validated by the user on 2026-09-08 | `supabase/migrations/20260908130000_create_platform_tables.sql` lands all six Step 3 tables plus RLS matching the Step 3 matrix exactly; `supabase/seed.sql` gains one local-only fixture guest; `.github/workflows/ci.yml` adds `client` and `server` jobs; `package.json` gains `verify:all`. `npm run verify:server` passes with the expected migration list read from disk. No client code, gameplay, balance value, or schema version changed. Further hardening before the Step 6 gate: `search_path = ''` pinned on the shared trigger function, `leaderboard_entries` closed a `?select=user_id` enumeration path with column-level grants, and `EXPECTED_MIGRATIONS` was replaced by a directory read. |
| 6 — Make the core simulation runnable on the server | Validated by the user on 2026-09-09 | `supabase/functions/core-portability-check` imports `npm run build:server-core`'s generated bundle of `src/core`, `src/config`, and `src/persistence/saveSchema.ts` and reproduces a fixed ten-minute run on the real local edge runtime — gold `"100"` → `"3080"` — byte-for-byte identical to `tests/unit/server-core-portability.test.ts`'s pinned result for the unbundled source. `eslint.config.mjs` bans the `Deno` global and `(^|/)supabase(/|$)` imports inside `src/core/**`; `tests/unit/architecture.test.ts` probes both. Mutation-proven: doubling a floor's yield moved the pinned client assertion and the live function's gold (to `6060`) together before the edit was reverted. Resolved finding F2 (`break_infinity.js`/Deno, unproven) and discovered a new one, F10 (Deno does not extension-complete a relative specifier — a bundle, not an import map, is what makes `src/core` portable here), both recorded in `memory-bank/server-threat-model.md` §8. No client code, gameplay, balance value, or schema version changed. A 2026-09-09 review found and fixed six defects before the gate: a missing `publicDir: false` was copying 2.9 MB of game art into `supabase/functions/` on every build; the new import ban missed the `@supabase/*` npm scope; the verification script's JSON-text comparison could disagree with the unit test's structural one; a non-200 portability response was retried 20 times though it can only be deterministic; `vite.server-core.config.ts` was untyped-checked; and the CI job name was stale. |
| 7 — Add the Edge Function test harness | Validated by the user on 2026-09-09 | `deno-bin@2.1.4` (pinned to the edge runtime's own reported Deno compatibility version) gives `npm run test:server-unit` a real `deno test` runner: 19 tests across `_shared/http.test.ts`, `save-sync/index.test.ts`, and the new `whoami-check/index.test.ts`, every one importing its handler directly and running with zero `--allow-*` flags. `whoami-check` — Step 7's "trivial authenticated endpoint" — splits `handleWhoAmI` (pure HTTP logic over an injected `ResolveCaller`) from `resolveCallerViaSupabaseAuth` (the one real collaborator, using the new `@supabase/supabase-js` client dependency), so the unit suite fakes the former and `tests/server-integration/whoami.integration.test.ts` — a separate Vitest suite in `vitest.server-integration.config.ts`, excluded from `npm test`'s glob — exercises the latter against the live stack. `tests/server-integration/authFixture.ts` mints an HS256 JWT for the seeded fixture guest, fixing "the fixture pattern for an authenticated caller." `save-sync` and `core-portability-check` gained an `import.meta.main` guard around `Deno.serve` (proven live: both still serve after the change) and their duplicated response envelope moved to `supabase/functions/_shared/http.ts`. `scripts/verify-server-stack.mjs` runs the unit suite before the stack starts and the integration suite once the database is reset — both from a clean `supabase db reset`. A real bug surfaced live rather than being assumed away: the seeded `auth.users` row left four GoTrue token columns NULL, which GoTrue's own row scanner cannot read as a string, so any real `auth.getUser` call 500'd — never triggered by Steps 4-6, which only ever handed PostgREST a hand-signed JWT directly. Fixed by seeding those columns as `''`. A first review pass fixed four smaller findings and missed a sixth, more serious one: `resolveCallerViaSupabaseAuth` answered a missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` with the same `401 unauthenticated` a genuinely bad token gets, inverting `save-sync`'s own established "does not answer a configuration mistake with a retryable code" rule — a client treating 401 as "sign out and re-authenticate" would sign every user out in a loop against a deployment that was simply misconfigured. A follow-up review caught it; fixed by making the resolver throw so the existing `Deno.serve` catch turns it into `500 server_error` instead, guarded by a new pure-handler propagation test plus a static-source assertion mirroring `save-sync`'s, both mutation-proven. |
| 8 — Anonymous guest session | Implemented on 2026-09-09, awaiting user validation | `enable_anonymous_sign_ins = true` in `supabase/config.toml`; `@supabase/supabase-js` promoted to `dependencies` (exact `2.116.0`, matching the Deno-side pin) as `src/platform/web/supabaseClient.ts` becomes the first `src/` import of it — dynamically, so the SDK ships in its own on-demand chunk rather than the entry chunk every boot parses first (a 2026-09-09 review measured +58 kB gzip from a static import and required the fix). `createSupabaseClient()` resolves `null`, attempting no network call and downloading nothing, when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` is unset. `src/platform/web/guestSession.ts`'s `ensureGuestSession` takes an injected `GuestAuthClient` (mirroring `whoami-check`'s `ResolveCaller`), never throws, and resolves `signed-in`/`sign-in-failed`/`unconfigured`; `src/main.ts` calls it without awaiting before boot and publishes `{status, user}` — no access token — as a `DEV`-only diagnostic, and caches the client promise on `import.meta.hot.data` so HMR reuses one GoTrue instance rather than leaking a new one every reload. A new Docker-dependent Playwright suite (`playwright.server-e2e.config.ts`, port 4176, `line` reporter, `tests/server-e2e/guest-session.spec.ts`) proves what nothing fakeable locally can: a fresh browser holds a real anonymous session; a blocked auth service never delays boot and local saves still persist through a forced lifecycle flush; two browser contexts get distinct identities whose access tokens — read from the Supabase client's own `localStorage` entry, not the DOM — each authenticate as themselves only against the live `whoami-check` function. `scripts/verify-server-stack.mjs` runs this suite after `test:server-integration`, feeding it `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from a live `supabase status --output json`; `.github/workflows/ci.yml`'s `server` job gained its own `npx playwright install --with-deps chromium` step. `tests/unit/server-stack.test.ts`'s two `@supabase/supabase-js` pin assertions flipped from `devDependencies` to `dependencies`, and its documented-commands list gained `test:server-e2e`. `CLAUDE.md`/`README.md` corrected: "nothing in `src/` makes a network call" no longer holds. A 2026-09-09 review found ten issues, fixed the first six before the gate (the CI job's missing browser install, the E2E config's blocking `'html'` reporter, `callWhoAmI`'s retry-math/error-handling bug, the static-import bundle regression, the missing `test:server-e2e` test-list entry, and the CI job's stale name), applied two more as cleanups (dropping the DOM access token, the HMR client cache), added two `ensureGuestSession` unit tests ahead of Step 9, and confirmed one pasted CI failure (`production-stages.spec.ts`'s animation-speed test) as a pre-existing, unrelated flake. `npm run verify:server` (all checks, including the fixed suite) and the full client gate (398 unit tests, 42 E2E, build, secret scan, 9 production smoke) pass after the fixes. A follow-up review caught an eleventh finding: the dynamic-import fix made `createSupabaseClient` reject-capable (a flaky network or a stale chunk hash after redeploy), and `src/main.ts`'s promise chain had no `.catch`, so a rejection reached an unhandled rejection past `ensureGuestSession`'s own try/catch, which only covers its internal collaborator calls. Fixed with one `.catch` folding any rejection into `sign-in-failed`; a new production-smoke test blocks the SDK's own lazy chunk (`**/assets/dist-*.js`) against the real built bundle and asserts no `pageerror`, mutation-proven against the pre-fix code. Final: 401 unit tests, 42 E2E, 10 production smoke, `npm run verify` exits 0, `npm run verify:server` all pass. A third review pass caught a twelfth finding in the eleventh's own fix: that production-smoke test was a false green on CI, because a build without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` inlines both as `undefined`, makes `createSupabaseClient`'s guard constantly true, and lets the bundler eliminate the dynamic import — so no lazy chunk is emitted and the `dist-*` route matched nothing (reproduced: with the `.catch` removed it still passed in 4.3 s against such a build). The spec now identifies the chunk by contents rather than by a fragile rolldown-derived name, counts its aborts and asserts the count is non-zero, and `test.skip`s visibly when the build emitted no chunk; `tests/unit/server-stack.test.ts` gained three static-source assertions on `src/main.ts`'s bootstrap that carry the gate on every CI push with no Docker. Mutation-proven in all four combinations. |
| 9–37 | Not started | Blocked by the Step 8 gate. |

- 2026-09-08 server-milestone Step 3: designed six tables — `profiles`, `saves`, `save_audit`, `recovery_codes`, `leaderboard_entries`, `entitlements` — and documented all 42 columns with every type, default, nullability, key, constraint, index, and relationship, plus the row-level-security matrix and the rule for storing a `GameNumber`. The same block is written byte-identically into both required files, which is what the step's test asks a reviewer to confirm. Nothing was created: no migration exists and no database holds it. Step 5 lands the migrations.

- 2026-09-08 Step 4 review fixes, four findings, each shipped with a regression.
  **F1 (high): `verify:server` failed its migration check in an ordinary
  terminal.** `supabase migration list --local` defaults to a text table and
  emits JSON only when the CLI auto-detects an agent, which is why it passed
  during implementation. The parse then found no `{`, `slice(-1)` returned the
  trailing newline so the `|| '{}'` fallback never fired, and a healthy stack was
  reported as `missing 20260908120000` with exit 1. The call now passes
  `--output-format json` explicitly, the shared `parseCliJson` helper returns
  `null` instead of slicing a payload it did not find, and an unreadable response
  is reported as its own failure — `Migration list is readable — could not parse
  the CLI response` — rather than as a missing migration, because conflating the
  two sends whoever hits it to debug the database instead of the parser. Proven
  by running the script against `--output-format text`: it now names the parse
  failure and passes again on `json`.

- **F2 (medium): a documented command silently ran seven checks instead of
  nine.** npm does not forward a bare flag, so `npm run verify:server
  --with-bundle-scan` reaches the script as an empty argv and skips the build and
  the secret scan. `memory-bank/server-milestone-plan.md` used that form;
  `activeContext.md` and `progress.md` already used the correct
  `-- --with-bundle-scan`. The plan now matches and states why the `--` is
  required.

- **F3 (low): the scanner could fail a build on a value that is public by
  design.** Every non-`VITE_` value in `.env.local` was forbidden, but the Edge
  Function reads `SUPABASE_ANON_KEY` unprefixed — so adding a server-side
  `SUPABASE_ANON_KEY` or a bare `SUPABASE_URL` beside its `VITE_` twin would fail
  the build on the exact anon key Step 8 ships on purpose. Now exempt, but
  matched by **twin name** — `X` against `VITE_X` with the same value — and not
  by published value, because exempting on value alone would let a real secret
  exempt itself by being mirrored under any unrelated `VITE_` name. Both halves
  are pinned: the twin case must pass, the mirrored-secret case must still fail.

- **F4 (low): silent degradation in the privileged-key probe.** The same
  unguarded `slice(indexOf('{'))` sat in `readLocalPrivilegedKeys`, whose failure
  mode was `catch → []` — turning the exact-value check into a no-op that still
  printed as though it had run. It now guards the slice and returns a warning the
  CLI prints, distinguishing "the stack is not running" (expected on CI and a
  fresh checkout) from "the stack answered and could not be read". A missing
  `.env.local` warns for the same reason.

- Step 4 review evidence: `tests/unit/bundle-secret-scan.test.ts` adds 10 tests
  against temporary fixtures outside the repository, importing the scanner
  through a new `scripts/scan-bundle-secrets.d.mts` so `tsc` type-checks the test
  while the script stays plain JavaScript with no build step. Three assertions in
  `tests/unit/server-stack.test.ts` pin the CLI flag, the distinct parse-failure
  report, and the `start === -1` guard. Mutation-proven: removing the twin
  exemption fails the twin test, loosening it to any published value fails the
  mirrored-secret test, and removing the missing-`.env.local` warning fails the
  coverage test. `npm run verify` passes end to end — lint, 364 unit tests (up
  from 351), 42 Chromium E2E, strict build, secret scan, 9 production smoke — and
  `npm run verify:server` passes all seven stack checks.

- One finding surfaced from inside the new tests rather than from review: the
  repository-wide credential scan in `tests/unit/server-stack.test.ts` rejected
  the new test file, because a fixture needs a literal `sb_secret_`-shaped string
  to exercise the pattern. The fixture now assembles that string at runtime. The
  guard behaved correctly on its own author's code, which is the evidence that it
  is not decorative.

- 2026-09-08 server-milestone Step 4: stood up the local Supabase stack. The
  Supabase CLI is an **exact** devDependency at 2.117.0 rather than a global
  install, so a clean checkout runs the same backend version; the entire stack
  runs offline in Docker. `supabase/config.toml` is committed with project id
  `cat-mine-idle` and the CLI's default ports — API 54321, database 54322,
  Studio 54323, mail 54324 — which do not collide with the client's 5173, 4173,
  4174, or 4175. `realtime`, `storage`, and `analytics` are disabled because no
  step in the milestone plan uses them and each is a container at start-up.

- Step 4 ships one Edge Function, `save-sync`, serving protocol §10.1
  `GET /v1/health` at `/functions/v1/save-sync/v1/health`. It hosts the whole
  save-sync contract behind one function versioned internally as `/v1/...`, so
  Steps 16 and 17 extend this router, envelope, and error vocabulary instead of
  opening a second contract. Failures use only §4 codes; that vocabulary has no
  `not_found` and no `method_not_allowed`, so an undefined route or method is
  answered `malformed_request` / 400 under the protocol's reading that a request
  outside the contract is a client bug.

- Three Step 4 decisions worth reviewing at the gate. **`verify_jwt = false`** is
  set for the whole function because §10.1 requires the health route to answer an
  unauthenticated caller and platform verification would reject it before the
  handler ran; the authenticated routes verify their own bearer token inside the
  handler from Step 16, and until then no route reads or writes data. **The
  health route never reads the service-role key** — it is the one route open to
  unauthenticated callers and that key bypasses row-level security — so it proves
  database reachability by round-tripping PostgREST with the anon key, and a unit
  assertion pins the key's absence from the file; Step 16 narrows the probe to
  `saves` once that table exists. **One bootstrap migration exists** although
  Step 5 owns migrations: `20260908120000_bootstrap_platform_requirements.sql`
  creates nothing, asserts the PostgreSQL 13+ premise the Step 3 schema relies on
  for `gen_random_uuid()` — resolving the function rather than trusting the
  version number — and gives Step 4's "applies migrations" check and Step 5's
  "a deliberately broken migration fails CI" check a real file instead of an
  empty directory. The six designed tables remain untouched.

- Step 4 made the secret boundary enforced rather than described. The `VITE_`
  prefix is the whole line between a public value and a credential, because Vite
  inlines exactly those variables into the browser bundle. `.env.example` is the
  committed template with placeholders only; `.env.local` holds real values and
  is git-ignored along with `.env`, every `.env.*` but the template, and the
  CLI's `.temp`/`.branches` state. `npm run scan:secrets` fails the build when
  `dist/` contains a JWT declaring `role=service_role`, an `sb_secret_*` key, an
  exact non-`VITE_` value from the environment or the running stack, or any
  server-only variable name; it runs inside `npm run verify` between `build` and
  `test:prod`. The anon/publishable key is deliberately not flagged: it is public
  by design and Step 8 ships it on purpose.

- Step 4 evidence, both halves of its test.
  `npm run verify:server -- --with-bundle-scan` passes all nine checks from a
  clean checkout (a copy with no `node_modules`, no `.env.local`, no `dist/`)
  against an empty Docker volume set after `supabase stop --no-backup`: Docker
  reachable, stack starts, migrations apply to an empty database, every committed
  migration recorded as applied, `GET /v1/health` answering 200 with no bearer
  token, `status: "ok"`, a server timestamp 9 ms from the local clock, the
  production build succeeding, and the build output holding no server secret.

- Step 4 mutation evidence, on both halves. A migration with an undefined
  function fails `supabase db reset` with exit code 1; raising the version guard
  to 990000 fails the reset with the guard's own message rather than silently
  passing. Stopping the `supabase_rest` container turns the health route into a
  503 `service_unavailable` and restarting it restores 200, which proves the
  probe is a real database round trip and not a self-report. Planting the local
  service-role JWT, the `sb_secret_*` key, or a reference to
  `RECOVERY_CODE_PEPPER` into a built `dist/` asset each fails the secret scan
  with a named finding. Among the static invariants, flipping `verify_jwt` to
  true, making the function read `SUPABASE_SERVICE_ROLE_KEY`, un-ignoring
  `.env.*`, un-ignoring `.env.example`, and removing both Supabase ignore sources
  each fail their own assertion; the ignore rules are asserted through
  `git check-ignore` rather than the text of `.gitignore`, because a
  commented-out rule still reads as present in the file.

- Step 4 regression evidence: `npm run verify` passes end to end — lint, 351 unit
  tests (up from 335; `tests/unit/server-stack.test.ts` adds 16), 42 Chromium
  E2E tests, the strict production build, the secret scan, and 9 production smoke
  tests. No client code changed, no gameplay changed, no balance value changed,
  and save-document and IndexedDB schema versions remain 1.

- Two Step 4 gaps are recorded rather than closed. `supabase/functions/**` is
  linted with Deno globals declared in `eslint.config.mjs` but sits outside
  `tsconfig.json`, because `Deno` has no type in the Node/DOM libraries the
  client compiles against; Step 7's Edge Function harness is where server-side
  type checking and unit testing belong, and until then the function's automated
  proof is the live health probe plus static source assertions. And the health
  probe reports PostgREST's reachability — a real database round trip, but not a
  query against a table the game owns, because no such table exists until Step 5.

- Step 3's `GameNumber` rule is three rules by location: values stay serialized strings inside the save document untouched; anywhere SQL must rank one, an `*_exact text` column carries the canonical form for display beside a `*_log10 double precision` column used only for `ORDER BY`, because a value past `1e308` cannot enter a double but its logarithm can; and `numeric` is rejected because round-tripping the canonical string through it is not guaranteed to reproduce the exact serialization display depends on, while comparison and index cost grow with digit count against values that grow without bound. Sorting on `log10` can tie when mantissas differ beyond double precision, so the ranking index carries a deterministic secondary column and the exact string is what is displayed either way.

- Step 3's decisive finding: **`saves.document_json` is `text`, not `jsonb`.** Step 20's test requires a pre-milestone save to return from download byte-for-byte identical, and `jsonb` does not preserve key order, discards insignificant whitespace, and normalizes numeric literals. This was verified rather than assumed — the same document stored in both column types came back from `jsonb` with its keys reordered, which would have failed Step 20 after the schema was already live. The server parses the document to validate it and stores the original text unchanged; nothing in SQL queries inside it, so `jsonb` would have bought nothing.

- Four further Step 3 decisions. `saves` keeps one generation of rollback in `previous_revision`/`previous_document_json`/`previous_received_at`, constrained all-or-none and strictly older, because the threat model ranks a player's own progress above every other asset and a single row with no history offers no recovery from a wrongly accepted upload. `leaderboard_entries` carries its own `display_name` snapshot so publishing a public board does not require widening `profiles` beyond own-row access. `save_audit` records `client_reported_at` — never trusted as an input, but a clock attack becomes visible as divergence from the server's `occurred_at`. `recovery_codes.code_hash` is an HMAC-SHA-256 digest under a pepper held in Edge Function configuration and never stored in the database: a fast keyed digest is correct for a high-entropy machine-generated secret rather than a human password, the pepper's absence from the database means a leak alone does not permit offline enumeration, and the unique index on the digest is what lets redemption find the row without scanning.

- Step 3 recorded two consequences rather than leaving them to be discovered. Every table carries exactly one foreign key, to `auth.users(id)` with `on delete cascade`, which gives Step 33 a single deletion path and becomes an invariant every future table must satisfy or declare its own path in the same change. The cost of that uniformity is that `save_audit` rows cascade away with the account, so deleting an account also erases the evidence of abuse from it — the right default while no money is at stake and GDPR is assumed to apply, and a trade rather than an oversight.

- Step 3 evidence: the DDL was extracted programmatically from the documented block itself — not retyped — and executed against PostgreSQL 17 in a throwaway container with a stub `auth.users` table standing in for the Supabase-managed one. It applies cleanly, and 14 constraint-behaviour assertions pass: `metric_log10` refuses NaN and infinities while `1.2345e999` stores and sorts exactly, `save_audit` couples `error_code` and `resulting_revision` to `outcome` in both directions, the `previous_*` columns enforce all-or-none and strict ordering, only one active recovery code per user is possible and rotation frees the slot, a non-hex digest and an unknown entitlement key are refused, a document over 64 KB is refused, and deleting the `auth.users` row cascades every row in all six tables. This is a design check against stock PostgreSQL; it is not a Supabase project, which Step 4 creates.

- 2026-09-08 server-milestone Step 2: specified the client/server save-sync contract before either side exists. Two endpoints plus a health check, each with an example request and an example response for every success and every rejection; an eleven-code error vocabulary in which each code carries what the client does and the exact player-facing copy, so a reviewer can describe the whole failure surface without reading code. Most codes deliberately show the player nothing: the game never blocks on cloud sync, and `createSaveDiagnosticBanner` never withdraws a notice, so a retryable network failure must stay silent until retries are exhausted or a tunnel would pin a permanent banner to the screen. Cloud notices reuse that existing banner with `cloud-sync-*` codes rather than adding a surface.

- Step 2's five binding decisions. D1: the session credential lives in script-writable storage rather than a first-party HttpOnly cookie because no domain is registered — and its consequence is that the session and the local save fall under one seven-day iOS Safari deletion, making the Step 14 recovery code, not cloud save, the mechanism that makes Step 21's promise true. D2: a server-owned monotonic `revision`, whose stale-write rejection returns the server document so a conflict costs one round trip and a retried upload with a lost response resolves silently instead of becoming a false conflict. D3: the server's `receivedAt` anchors every elapsed-time calculation while the document's own timestamps are carried verbatim and never used as a server input, preserving finding F4. D4: divergent devices resolve by dominance over the monotonic progress vector, adopting a strict superset silently and asking the player only on a genuine fork, with `gold` and every queue, progress, and cursor value excluded because they legitimately fall — the same distinction Step 23 draws. D5: cloud upload runs at most once per 60 s with forced lifecycle, offline-claim, and boot-reconcile triggers, leaving the 500 ms local debounce untouched, which resolves finding F6.

- 2026-09-08 server-milestone Step 1: wrote the threat model over six attacker capabilities — local storage, the client bundle, the device clock, HTTP requests, the session credential, and unlimited anonymous identities — each with what it is worth, which step defends it, and what stays undefended. Ranked the protected assets so the Step 23 tolerance direction is derivable rather than arbitrary: a player's own progress outranks leaderboard integrity, so re-simulation must prefer accepting a generous save to rejecting an honest one. Recorded nine explicit non-defences, including that nothing before Step 22 defends the device clock, so Steps 15–21 store clock-derived income faithfully and must not be presented as anti-cheat. Recorded seven standing rules every later step must preserve.

- All eight kickoff questions were unanswered by the user and now carry conservative recorded defaults: prototype scale (10k accounts, 1k DAU, 20 uploads/s); Vietnam/SEA primary with GDPR assumed to apply, so Step 25 collects no fingerprint signal at all; Telegram stays at Step 12 and is cuttable; no real money in this milestone; no domain, no Supabase org, and no CI exist; the repository owner is sole operator at RPO 24 h; existing local saves must survive, making Step 20 mandatory; and the game is not knowingly offered under 16, with no email column in `profiles`. Three of these were settled by inspecting the repository — GitHub remote, no CI configuration, and no Content Security Policy in `index.html` — which is what removes the first-party-cookie option from Step 2.

- The same step audited all 37 plan steps for assumptions relied on but never recorded, and found nine. F1: Step 12 presumes a Telegram Mini App host that does not exist — `src/platform/` holds only `web/` and no file in `src/` mentions Telegram — so Step 12 gains a prerequisite. F2: Step 6's premise that `break_infinity.js` 2.2.0 imports into Deno is unproven, so Step 6 verifies it first and falls back to a shim, never a reimplementation. F3: Step 23's upper bound is loose by construction and must state its modelling rule. F4: Step 22 changes which clock is authoritative and must preserve the offline-income formula, cap, efficiency, and open-tab/closed-tab ratio exactly. F6: cloud upload cadence is distinct from the 500 ms `SavePersistenceCoordinator` debounce and is capped at one per 60 s plus lifecycle flushes, which sets the Step 25 limits and the Step 36 load profile. F7: Step 11 presumes an Apple Developer Program membership, a Services ID, and a verified domain that neither the plan nor the recorded budget contained, so Step 11 gains a prerequisite list, roughly USD 99/year, and a hard dependency on the domain question that Step 10 does not have. F8: Step 21's measurement of the seven-day storage cap needs a seven-day wall-clock observation on a real Safari profile, so it is planned as an observation started early and checked later rather than a step completed in one sitting. F9: Step 31 has no concrete entitlement to grant, and any economy-affecting one would become an unmodelled input to Step 23's bound, so its single entitlement is defined as cosmetic and economy-neutral. F5 is left open rather than defaulted: no step covers XSS or a Content Security Policy, while the session credential in script-writable storage is the sole proof of save ownership. Closing it adds a step, which is the user's decision at the Step 1 gate.

- The user validated Step 4 and authorized Step 5 on 2026-09-08.

- 2026-09-08 server-milestone Step 5: migrations and CI. `supabase/migrations/20260908130000_create_platform_tables.sql` lands the six Step 3 tables verbatim — the exact `create table`/index SQL already documented in `memory-bank/architecture.md` and `memory-bank/techContext.md` — and adds RLS: enabled on all six, with policies matching the Step 3 matrix exactly (`profiles`/`entitlements` select-own, `profiles` update-own, `saves` select-own with no insert/update/delete policy anywhere, `leaderboard_entries` select-all). `save_audit` and `recovery_codes` get RLS enabled and no policy at all, which is what denies every `anon`/`authenticated` access outright; the service role bypasses RLS and remains the only writer. `supabase/seed.sql`, empty since Step 4, now inserts one local-only fixture guest — an `auth.users` row and its `profiles` row — so a developer running `npm run supabase:start` sees a real row in Studio without the Step 8 sign-in flow existing yet. `saves`, `save_audit`, `leaderboard_entries`, and `entitlements` are deliberately left unseeded: a plausible fixture row for them needs code that does not exist before Steps 16, 26, and 31, and inventing one by hand risks the drift this milestone exists to prevent.

- Step 5 scope decision: all six tables land now, not one per the step that first names it (Step 9 for `profiles`, Step 15 for `saves`, Step 27 for `leaderboard_entries`, Step 31 for `entitlements`). This follows what `memory-bank/architecture.md`, `memory-bank/techContext.md`, and the Step 4 bootstrap migration's own comment already committed to before Step 5 began — "Step 5 lands these six tables as forward-only migrations" — rather than a fresh reading of Phase 2/3/5/6's per-step instructions in isolation. Under this reading, Steps 9, 15, 27, and 31 add the application logic around an already-existing table, not the `create table` statement itself.

- `.github/workflows/ci.yml` is the first CI this repository has had. A `client` job runs `npm run verify` (lint, unit, E2E, build, secret scan, production smoke); a `server` job runs `npm run verify:server` (stack start, migrations from empty, health check) on the same ubuntu-latest runner, which ships Docker preinstalled. Both jobs must pass; a broken migration fails the `server` job rather than being discovered on deploy. `package.json` gained `verify:all`, a sibling script running both locally in sequence, as the step's instructions asked for. `scripts/verify-server-stack.mjs` originally carried a hand-kept `EXPECTED_MIGRATIONS` list, extended to both migration files so the check actually covered the new one; the 2026-09-08 review replaced the list with a read of `supabase/migrations/`, because a hand-kept list is precisely what a future step forgets to extend.

- Step 5 evidence went beyond re-running Step 4's script. `npm run verify:server` passes against the real local stack: two migrations recorded as applied, health check green. Direct PostgREST calls with a JWT minted for the seeded fixture user (`role: authenticated`, `sub` set to its id, signed with the local JWT secret) prove the RLS policies behave as designed rather than merely as written: `select` on `profiles` returns exactly its own row (200, one row); `select` on `saves` returns an empty set (200, `[]` — the row does not exist, and RLS would filter it either way); a direct `insert` into `saves` with that token is refused (403, PostgREST error `42501`, "new row violates row-level security policy for table \"saves\""), which is the anchor the Step 15 and Step 26 tests will extend; and `select` on `save_audit` returns `[]` under a table with no policy at all, rather than an error, which is PostgREST's normal behaviour for a fully row-filtered table. Step 5's own test — "a deliberately broken migration fails CI" — was mutation-proven directly rather than only asserted: a temporary third migration referencing a foreign-key column that does not exist made `supabase db reset` exit 1; removing it restored exit 0 and a clean `npm run verify:server` pass. This is the identical mechanism the new `server` CI job runs, though no actual GitHub Actions run has executed, since this checkout has never been pushed. `npm run lint` and `npm run test` (364 unit tests) were re-run and pass unchanged. No client source file changed, and no gameplay, save-document, or IndexedDB schema version changed.

- 2026-09-08 review of the Step 4/5 working tree: ten findings, all fixed in place before the gate, each with a regression test. Three were checks that reported success without having checked. (1) `parseEnvFile` in `scripts/scan-bundle-secrets.mjs` read everything after the first `=` as the value, so a `.env.local` line with a trailing `# comment` yielded a forbidden value that cannot occur in any bundle — the exact-value leg of the secret scan silently no-opped for that variable while printing as having run. It now follows dotenv's quoting rules and strips an `export ` prefix; mutation-proven, the new test fails against the old parser. (2) `public.set_updated_at()` lacked `set search_path = ''` (Supabase's `function_search_path_mutable` lint); since migrations are forward-only and every future `updated_at` column attaches to this trigger, it was pinned at creation, with `pg_catalog.now()` in the body, and verified still firing against the local stack. (3) `leaderboard_entries_select_all` admits every row and PostgREST lets the caller pick its columns, so `?select=user_id` enumerated the `auth.users` id of every published player unauthenticated; `user_id` is now withheld by column-level grant, verified live (anon reads `board_key,display_name,metric_exact` at 200, and is refused both `select=user_id` and `select=*` with `42501`). The RLS matrix in `architecture.md` and `techContext.md` moved in the same change and both copies remain byte-identical. The other seven: the migration list is read from disk with a guard against an empty list; the bundle scan names the `.env.local` values it skipped as too short or placeholder, and refuses to print a pass over an empty `dist/`; the save-sync health route answers a missing environment variable with `server_error` rather than `service_unavailable` (which would have every client retry forever against a healthy database), and `errorResponse` can set the `Retry-After` §4 tells clients to wait for; `.github/workflows/ci.yml` declares `permissions: contents: read` and per-job `timeout-minutes`; and the repository-wide credential scan in `tests/unit/server-stack.test.ts` skips binary extensions — it had been reading 363 untracked images, mostly `art-source/`, on every `npm run test` — and now reports an unreadable file as an offender instead of skipping it silently, taking that test from roughly 2 s to 36 ms. After the fixes: lint clean, 376 unit tests pass, `npm run verify` passes end to end, `npm run verify:server` passes with both migrations applying to an empty database. No client source file, gameplay value, save-document shape, or schema version changed.

- The user validated Step 5 and authorized Step 6 on 2026-09-08.

- 2026-09-08 server-milestone Step 6: made `src/core`, `src/config`, and the save-document boundary (`src/persistence/saveSchema.ts`) runnable on Deno without forking them. The obstacle turned out not to be `break_infinity.js` (finding F2) but something more basic, discovered empirically rather than assumed: Deno's edge runtime does not add a `.ts` extension to an extension-less relative specifier, so pointing an Edge Function straight at `src/core/index.ts` failed to boot on its own internal imports — reproduced identically via `supabase functions serve` and the real `supabase start` runtime (`supabase-edge-runtime-1.74.3`, Deno v2.1.4). A root and a per-function `deno.json` with `"unstable": ["sloppy-imports"]` were both tried and neither was honoured by this runtime. Recorded as finding F10 in `memory-bank/server-threat-model.md` §8, a gap no audit of stated assumptions could have found because nothing stated it.

- The fix is a generated bundle, not an import map. `supabase/functions/_shared/coreBundleEntry.ts` is a zero-logic file — `export * from '../../../src/core'` and its `src/config`/`saveSchema.ts` siblings, nothing else — so it cannot fork the behavior it names. `npm run build:server-core` (`vite.server-core.config.ts`, Vite library mode, `rollupOptions.external: []`) compiles it into `supabase/functions/_shared/generated/core-bundle.js`: one dependency-free ES module with every specifier already resolved, including `break_infinity.js` inlined by the same resolution the client bundle already relies on. That resolved F2 as a side effect — it imports cleanly once bundled, no shim needed. The bundle is git-ignored and `scripts/verify-server-stack.mjs` rebuilds it before every `supabase start`, so it can never be stale when tested.

- `supabase/functions/core-portability-check` is deliberately not part of the save-sync protocol — it reads and writes no data and exists only to prove this step. It imports the generated bundle and, on request, runs the fixed document at `tests/fixtures/ten-minute-core-fixture.json` (a real `SaveDocumentV1`, generated once from `createInitialGameState`/`createSaveDocument` and then pinned) through `migrateSaveDocument` → `validateSaveDocument` → `deserializeSaveDocument` → one explicit `advanceSimulation` tick → `catchUpSimulation` for the remaining 599,900 ms → `createSaveDocument`, returning the result. `tests/unit/server-core-portability.test.ts` runs the identical sequence against the unbundled source client code always imports and pins the same result: starting gold `"100"` becomes `"3080"`, `totalExtracted` `"3000"`, `totalGoldDelivered` `"2980"`, warehouse `inputQueue` `"10"` mid-cycle. `verify_jwt = false` for this function, the same reasoning as the health route.

- Step 6 evidence: `npm run verify:server` now rebuilds the bundle, starts the stack, and fetches the live function, asserting its response is structurally identical to the pinned fixture (matching the same `toEqual` semantics the unit test uses, rather than raw JSON-text equality — see the review fix below) — passing on a fresh `supabase db reset`. Mutation-proven directly: `calculateExtractionYield` in `src/core/simulation/advanceSimulation.ts` was temporarily changed to double its result. The client test failed immediately (`totalGoldDelivered` "2980" → "5960" in the diff); rebuilding the bundle and re-fetching the live function showed the identical doubled numbers (gold `"6060"`, `totalGoldDelivered` `"5960"`) — the same one-line source change moved both sides together, in the same run, before the edit was reverted and both returned to matching the original pinned fixture. `eslint.config.mjs` extends `src/core/**/*.ts`'s existing purity rules with a `no-restricted-globals` entry banning the `Deno` global and a `no-restricted-imports` pattern banning any specifier matching `(^|/)supabase(/|$)` — this boundary runs one direction only, `supabase/` depending on `src/core`, never the reverse. `tests/unit/architecture.test.ts` gained a probe asserting both fire together on a `Deno.serve(...)` call importing from `supabase/functions/save-sync`. `npm run lint` and `npm run test` (378 unit tests, up from 364) pass; no client source file outside `eslint.config.mjs`/`tests/unit/architecture.test.ts` changed, and no gameplay, save-document, or IndexedDB schema version changed.

- Two Step 6 judgment calls worth reviewing at the gate. First, the six-table migration lands application logic incrementally in later steps but the raw schema all at once in Step 5 (recorded at that step's gate); Step 6 follows the same "land the mechanism, not per-consumer" instinct by bundling all three portability targets (`src/core`, `src/config`, `saveSchema.ts`) through one shared entry file rather than three separate ones, since they already import each other and a single self-contained bundle avoids triplicating `break_infinity.js`. Second, `core-portability-check` was kept as its own function rather than added to `save-sync`, because the save-sync router's own rule — Steps 16/17 extend it rather than opening a second contract — is scoped to the save-sync *protocol* specifically; this function serves no protocol request a client would ever make, and mixing a permanent engineering-verification route into the player-facing router's error vocabulary seemed like the wrong coupling.

- 2026-09-09 review of the Step 6 working tree: six defects, all fixed in place before the gate, each verified directly rather than only reasoned about. (1) `vite.server-core.config.ts` had no `publicDir: false`, so Vite's default behavior copied the ~2.9 MB of game art under `public/assets/` into `supabase/functions/_shared/generated/` on every build; measured 3.0 MB across 36 files before the fix and 80 KB in one file after. (2) The `no-restricted-imports` pattern added for `src/core/**` matched the `supabase/` directory but not the `@supabase/*` npm scope Step 7 adds as a dependency (`@supabase/supabase-js`), which would have imported clean; a second pattern (`^@supabase/`) closes it, and `tests/unit/architecture.test.ts`'s Step 6 probe now includes a `createClient` import from `@supabase/supabase-js` alongside the existing `Deno.serve` case. (3) `scripts/verify-server-stack.mjs` compared `JSON.stringify(...)` text on both documents while `tests/unit/server-core-portability.test.ts` used `toEqual`, so a harmless key-order difference would fail the script while the unit test stayed green; the script now does a structural `deepEqual` for pass/fail and demotes the stringify comparison to an informational "identical values, differing key order" detail on a pass — reproduced live by reordering `expectedOutputDocument.state`'s keys in a scratch copy of the fixture and confirming the check still passes with that exact message, then restoring the original file byte-for-byte. The same fallback previously named three unrelated top-level fields at once when `find` returned `undefined`; it now names them by their actual location. (4) `checkCorePortability` retried any non-200 response through the full 20-attempt loop, but unlike the health route's transient `service_unavailable`, a response from this function (even an error one) means the worker booted and answered — retrying it cannot fix a deterministic bug. It now retries only when the fetch itself never got a response; timed live against an injected deterministic throw, restarting the edge-runtime container to force the reload: failure now reports in 30 ms instead of the prior worst-case multi-second loop. (5) `vite.server-core.config.ts` was outside `tsconfig.json`'s `include`, so it was linted but never type-checked; added, and `npx tsc --noEmit` stays clean. (6) `.github/workflows/ci.yml`'s `server` job name and its `timeout-minutes: 20` comment still described only the Step 4/5 health check; both now name the portability check this step added. After the fixes: lint clean, 378 unit tests pass, `npm run verify:server` passes all checks including the rebuilt 80 KB bundle, and `git diff --check` is clean.

- The user validated Step 6 and authorized Step 7 on 2026-09-09.

- 2026-09-09 server-milestone Step 7: established the Edge Function test harness. `deno-bin@2.1.4` is a new exact devDependency — a real, pinned Deno CLI (matching the edge runtime's own reported "compatible with Deno v2.1.4"), rather than relying on the Supabase CLI, which has no `deno test`-equivalent subcommand (`supabase test` only wraps pgTAP). `npm run test:server-unit` (`deno test supabase/functions`) discovers and runs three files — `_shared/http.test.ts`, `save-sync/index.test.ts`, `whoami-check/index.test.ts` — 19 tests total, each importing its handler directly rather than making an HTTP request, and every one passes with zero `--allow-*` permission flags: proof of purity by construction, since Deno's sandbox would refuse a real network or env access without an explicit grant.

- `whoami-check` is Step 7's "trivial authenticated endpoint," not part of the save-sync protocol. `handleWhoAmI` takes caller resolution as an injected `ResolveCaller` collaborator instead of calling Supabase Auth itself, so its unit tests exercise every response the route can give — missing token, rejected token, resolved caller, non-GET method — with a fake. The one real collaborator, `resolveCallerViaSupabaseAuth`, uses the new `@supabase/supabase-js` client dependency to verify the bearer token against GoTrue's `/auth/v1/user` and then read the caller's own `profiles.display_name` under row-level security — the exact shape (authenticate, then read/write as that user under RLS) every real authenticated route from Step 9 onward will need. `verify_jwt = false` at the platform level, same reasoning as `save-sync`'s health route: verification happens by hand inside the handler on purpose, since that manual pattern is what `save-sync`'s own authenticated routes need from Step 16.

- "Fix the fixture pattern for an authenticated caller" is `tests/server-integration/authFixture.ts`: it mints an HS256 JWT — `sub`, `role: authenticated`, `aud: authenticated`, an expiry — for the seeded fixture guest (`11111111-1111-1111-1111-111111111111`), signed with the Supabase CLI's fixed local `JWT_SECRET` (the same value on every local stack anyone runs, printed by `npx supabase status`, not a secret this repository protects). This formalizes what Step 5's evidence-gathering did ad hoc with an inline Node script. `tests/server-integration/whoami.integration.test.ts` uses it against the real running stack: 200 with the seeded guest's actual `displayName` for a valid token, 401 for no header, a syntactically invalid token, a token signed with the wrong secret, and an expired token, and 400 for a non-GET method. It lives in its own `vitest.server-integration.config.ts` (`tests/server-integration/**/*.test.ts`), deliberately excluded from `vitest.config.ts`'s `tests/unit/**` glob so `npm test`/`npm run verify` — which must work with no Docker running — never picks it up by accident.

- `save-sync/index.ts` and `core-portability-check/index.ts` both gained an `import.meta.main` guard around their `Deno.serve(...)` call: `resolveFunctionRoute`/`handleRequest` are now unit-tested by importing the module directly, and without the guard that import would also start a live HTTP listener. Proven live rather than assumed safe: after adding the guard, `npm run build:server-core` plus a forced edge-runtime container restart showed both functions still answering real requests exactly as before. Their duplicated response-envelope code (`JSON_HEADERS`, `jsonResponse`, `errorResponse`, `ErrorOptions`) moved to the new `supabase/functions/_shared/http.ts`, itself unit-tested, so a third function never has a third copy to drift from the other two.

- `scripts/verify-server-stack.mjs` runs `npm run test:server-unit` immediately after the bundle build, before `supabase start` — it needs no live stack, so it runs first and fails fast — and `npm run test:server-integration` after the database reset and the health/portability checks confirm the stack is live, satisfying the step's test that both categories "run in CI from a clean database." The script's final pass/fail line, previously hardcoded as "Step 4 validation," now reads "npm run verify:server," since it has covered Steps 4 through 7 for a while and will keep growing.

- A real bug surfaced live while wiring the integration test, not assumed away: `GET /auth/v1/user` against the seeded fixture guest's token returned `500 {"code":"unexpected_failure", ...}`. `docker logs supabase_auth_...` named it exactly: `"Unhandled server error: sql: Scan error on column index 3, name \"confirmation_token\": converting NULL to string is unsupported"`. `supabase/seed.sql`'s `insert into auth.users` had never set `confirmation_token`, `recovery_token`, `email_change_token_new`, or `email_change` — columns with no default, left NULL — and GoTrue's Go row scanner reads them as plain strings, not nullable ones. No step before this one ever triggered it: Steps 4 through 6 only ever handed PostgREST a hand-signed JWT directly, which never asks GoTrue to load the user row. Fixed by seeding those four columns as `''`, matching what GoTrue itself writes for a real sign-up; verified with a direct `curl` to `/auth/v1/user` before (500) and after (200, the real user object) the fix, then confirmed through the full integration suite.

- Step 7 evidence: `npm run verify:server` passes 13 checks end to end from a completely clean `supabase stop`/`start`/`db reset` cycle — Docker, the bundle build, 19 Deno unit tests, stack start, both migrations, health, core portability, and 6 integration tests — and `--with-bundle-scan` additionally passes the production build and secret scan. The full client gate was re-run given the scope of change (`import.meta.main` guard, new dependencies, a static-source test touching the refactored file): lint clean, 378 unit tests (one, `tests/unit/server-stack.test.ts`'s Retry-After assertion, needed updating to read `_shared/http.ts` since that literal moved out of `save-sync/index.ts`), all 42 Chromium E2E tests, strict build, secret scan, and all 9 production smoke tests pass. No client gameplay, save-document, or IndexedDB schema version changed.

- 2026-09-09 review of the Step 7 working tree: five findings, four fixed in place before the gate, one recorded rather than fixed. (1) `@supabase/supabase-js` sat in `dependencies` although `src/` imports it zero times — grepped to confirm; the only other hit is a string literal in the `tests/unit/architecture.test.ts` lint probe — so it moved to `devDependencies`, pinned exact (`2.116.0`, matching the other CLI-version-sensitive devDependencies) rather than left as `^2.116.0`. More seriously, `whoami-check/index.ts`'s Deno import used a floating `npm:@supabase/supabase-js@2`: locally `deno test`/`supabase start` resolve that from this repository's own `node_modules` (Deno's byonm mode, since a `package.json` exists at the workspace root) and land on whatever is installed, but a function deployed without that `node_modules` context would let Deno fetch "latest matching `2`" from the npm registry instead — a version the local unit tests never ran against. Pinned the Deno specifier to the exact installed version instead of documenting the gap, and added `tests/unit/server-stack.test.ts` assertions that both the dependency's location (`devDependencies`, not `dependencies`) and its exact version match the Deno specifier, so the two cannot drift apart silently again. (2) The static invariants in `tests/unit/server-stack.test.ts` covered only `save-sync`'s source — `whoami-check` had no "never reads the service-role key" assertion and no `config.toml` `verify_jwt` assertion. Both are now `it.each` loops over every directory `readdirSync('supabase/functions')` finds (excluding `_shared/`), the same fix the Step 4 review applied to `EXPECTED_MIGRATIONS`: a function added later without deliberate consideration fails the loop rather than going unchecked. The "documented commands" test also gained `test:server-unit`/`test:server-integration`, missing since Step 7 added them. (3) `tests/server-integration/whoami.integration.test.ts`'s `beforeAll` warm-up declared 20 attempts at 1 s apart but each attempt's own timeout was 20 s (`callWhoAmI`'s constant, reused by mistake) against a 30 s hook budget — arithmetically only ~1.5 attempts could ever run before Vitest killed the hook itself, and the loop swallowed every failure silently. Given its own short timeout constant (2 s) and a hook budget sized to the loop's actual worst case (20 × (2 s + 1 s) = 60 s, plus headroom = 70 s), plus a `console.warn` if every attempt is exhausted so a real persistent failure is not mistaken for one of the tests' own. (4) No Edge Function handles CORS or `OPTIONS` yet — recorded as finding F11 in `memory-bank/server-threat-model.md` §8 rather than fixed now, since nothing calls a function directly from a browser yet (Step 8's sign-in goes through the Auth client SDK, not a function in this repository); the finding assigns the obligation to whichever step first adds that call. (5, unaddressed by design) `art-source/cat-role-catalog/surface-elevator-tower/` (13 files, 11 MB, untracked) sits in the same working tree as this milestone's changes but belongs to the concurrently authorized asset-catalog work, not the server milestone; it is excluded from every commit made for this work, as it has been throughout. Verified after the first four fixes: lint clean, 386 unit tests (up from 378), `npm run verify:server` passes all 13 checks including the pinned-version assertions, and the full 42-test E2E suite passes.

- 2026-09-09 a follow-up review caught a sixth finding the pass above missed entirely — not recorded as one of "five findings," not fixed, not noted as deferred: `resolveCallerViaSupabaseAuth` answered a missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` by returning `null`, which `handleWhoAmI` reads as "this token is invalid" and answers `401 unauthenticated`. That is the highest-severity kind of gap this review style exists to catch, because it inverts `save-sync`'s own already-established rule in `probeDatabase`/`handleHealth` — "does not answer a configuration mistake with a retryable code," itself protected by a dedicated unit test — for the newer function that explicitly documents itself as the pattern later authenticated routes should copy. A deployment missing its environment would tell every caller, valid token or not, that their credential was bad; a client that treats 401 as "sign out and re-authenticate," the ordinary reading of that code, would sign every user out in a loop against a database that was never broken. No test exercised this path, because the local edge runtime always injects the environment variables. Fixed by making the resolver throw instead of returning `null`: `handleWhoAmI` does not catch it, so the error propagates to the `Deno.serve` wrapper's existing catch, which already converts any propagated error to `500 server_error` — no change to `handleWhoAmI` itself was needed. Two tests now guard the two halves of this: `whoami-check/index.test.ts` asserts a thrown resolver error rejects `handleWhoAmI`'s promise rather than resolving to 401, and `tests/unit/server-stack.test.ts` gained a static-source assertion, mirroring `save-sync`'s own, that the missing-config branch throws rather than returning `null` — mutation-proven directly: reverting the fix to `return null` failed the new static assertion while every pure-handler unit test still passed unaffected, which is exactly why the static check exists — the fake-resolver unit tests can prove `handleWhoAmI`'s contract but can never see which code path the *real* resolver takes. Also fixed in the same pass: the version-pin comment in `whoami-check/index.ts` still said to keep the two versions identical "by hand," which by then was stale — the comment now points at the test that enforces it. Verified: 20 Deno unit tests, 387 client unit tests, all 13 `npm run verify:server` checks (confirming the real resolver still answers 200 against the live stack, where the environment is genuinely configured), lint, and `git diff --check` all pass.

- 2026-09-09 first real GitHub Actions run (`.github/workflows/ci.yml`, added at Step 5) surfaced a genuine E2E flake unrelated to the server milestone: `tests/e2e/production-stages.spec.ts`'s "keeps surface carts empty when the tower queue is empty" failed once on the shared runner with `cartX` unchanged after a fixed 1,500 ms `page.waitForTimeout`, while every sibling assertion on the same cosmetic surface-hauler clock elsewhere in that file already polls with `expect.poll(..., { timeout: 6_500 })` instead of sampling once after a flat delay. The animation clock accumulates from zero at boot rather than from wall-clock time, so a frozen read only happens when the browser drops real frames for the whole sampled window — plausible on a slower/contended shared runner, not reproduced across several local repeats. Fixed by switching this one assertion to the same `expect.poll` idiom and timeout budget the rest of the file already uses, rather than touching any game logic; the now-redundant direct re-check of `cartX` after the poll was removed. Verified: 3 repeated local runs pass, the full 42-test E2E suite passes, and lint/unit tests are unaffected. No gameplay, save-document, or schema change; unrelated to Steps 1-7 of the server milestone.

- The user validated Step 7 and authorized Step 8 on 2026-09-09.

- 2026-09-09 server-milestone Step 8: the anonymous guest session, opening
  Phase 2 (Identity). `enable_anonymous_sign_ins` flips to `true` in
  `supabase/config.toml` (`anonymous_users = 30`/hour was already configured).
  `@supabase/supabase-js` moves from `devDependencies` to `dependencies`,
  exact-pinned at the same `2.116.0` `whoami-check`'s Deno import already
  used, because `src/platform/web/supabaseClient.ts` is the first `src/`
  import of it: `createSupabaseClient()` returns `null`, attempting no network
  call, when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` is unset — a
  checkout with no `.env.local` stays exactly as playable as before.
- `src/platform/web/guestSession.ts`'s `ensureGuestSession` mirrors the
  injected-collaborator pattern `whoami-check`'s `ResolveCaller` established:
  a narrow `GuestAuthClient` slice of `SupabaseClient['auth']`
  (`getSession`/`signInAnonymously`), faked by
  `tests/unit/guest-session.test.ts` rather than mocking the SDK. It never
  throws — reusing a session, signing in fresh, a rejected call, and a
  disabled/unreachable auth service all resolve to a typed
  `signed-in`/`sign-in-failed`/`unconfigured` result. `src/main.ts` constructs
  the client once and calls it without awaiting before
  `loadActiveGame`/`createGame`, publishing the result as a `DEV`-only
  `app.dataset.guestSession` diagnostic, the same convention `BootScene`
  already uses.
- Proving "two browsers receive different identities" needs a real GoTrue, so
  Step 8 adds a second, Docker-dependent Playwright suite kept out of the
  Docker-free `npm run test:e2e`: `playwright.server-e2e.config.ts` (port
  4176) and `tests/server-e2e/guest-session.spec.ts`. Three scenarios: a fresh
  browser boots playable holding a real anonymous session; every
  `**/auth/v1/**` request aborted still boots the game and a forced
  `visibilitychange` flush (the same mechanism
  `tests/e2e/lifecycle-persistence.spec.ts` already drives) still reaches
  IndexedDB across a reload; two fresh browser contexts receive distinct
  `user.id`s whose access tokens each answer only for themselves through the
  live `whoami-check` function, called directly from the Node test process
  (no CORS concern). `scripts/verify-server-stack.mjs` runs
  `npm run test:server-e2e` after `test:server-integration`, feeding it
  `API_URL`/`ANON_KEY` read from a live `supabase status --output json` —
  CI needs no `.env.local`, and a developer's own file is untouched.
- One empirical finding, not assumed: `enable_anonymous_sign_ins` is read by
  the GoTrue container at boot, not by `supabase db reset` — a stack already
  running from before the config edit still answered
  `anonymous_provider_disabled` (confirmed directly with `curl` against
  `/auth/v1/signup`) until fully stopped and restarted. A genuinely clean
  checkout never hits this.
- `CLAUDE.md` and `README.md` both asserted "nothing in `src/` makes a network
  call" — corrected in the same change to name the one non-blocking call this
  step adds and confirm the game stays exactly as playable without it.
- Step 8 evidence: `npm run verify:server` passes end to end from a
  completely clean `supabase stop`/`start`/`db reset` cycle, including all
  three new `test:server-e2e` scenarios. The full client gate was re-run:
  lint clean, 398 unit tests, all 42 Chromium E2E tests, strict build, secret
  scan (confirming `VITE_SUPABASE_ANON_KEY` is the only Supabase-related
  value in `dist/`, no service-role key), and all 9 production smoke tests
  pass.

- 2026-09-09 review of the Step 8 working tree: ten findings, six fixed in
  place before the gate, three fixed as valuable cleanups, one confirmed
  unrelated. (1) `.github/workflows/ci.yml`'s `server` job ran `npm ci` then
  straight into `npm run verify:server`, which now runs a real Chromium
  suite — the job had no browser installed at all and would have died with
  "Executable doesn't exist" on its first CI run. Added
  `npx playwright install --with-deps chromium` between them, matching the
  `client` job's own step; bumped `timeout-minutes` from 20 to 25 for the
  added suite; corrected the job's name/comment, which still described only
  Steps 4–7 (the same staleness a Step 6 review already found and fixed
  once). (2) `playwright.server-e2e.config.ts` used the default `'html'`
  reporter, which on a local failure opens a blocking `show-report` server on
  `:9323` — fatal under `scripts/verify-server-stack.mjs`'s `spawnSync`
  invocation, which would hang rather than report `FAIL`, and whose default
  `playwright-report/` output would also collide with the main E2E suite's
  report. Switched to `'line'`, the same choice
  `playwright.production.config.ts`/`playwright.performance.config.ts` already
  made for the identical reason. (3) `callWhoAmI`'s retry loop broke on any
  response at all, including a transient non-200 cold-start error, so it
  would not actually retry the case it exists for; and its 10-attempt budget
  (up to 30 s) could exceed the config's implicit 30 s default test timeout
  once a page boot and session round trip were added on top — the same
  margin bug a Step 7 review already fixed once for the comparable
  integration-suite warm-up loop. Now retries on `!response.ok` too, at 6
  attempts (18 s worst case) under an explicit 60 s per-test `timeout` in
  the config. (4) A static `@supabase/supabase-js` import added +58 kB gzip
  to the single entry chunk (measured: 1.78 MB raw / 472 kB gzip against a
  1.56 MB / 414 kB Step 35 baseline) — sitting in front of every boot's
  parse/eval cost, configured or not, which is exactly what this step's own
  "must never delay the first frame" rule was written to prevent.
  `createSupabaseClient` now dynamically imports the SDK only once
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are confirmed present; measured
  after the fix, the main chunk is back to 1,570,900 bytes raw / 417.69 kB
  gzip (a few kB, not 58) and the SDK ships in its own 214.56 kB raw /
  55.05 kB gzip chunk fetched only on demand. (5) The "documented commands"
  test in `tests/unit/server-stack.test.ts` listed every server script README
  and CLAUDE.md name except the new `test:server-e2e` — added, the same fix a
  Step 7 review already applied for `test:server-unit`/`test:server-integration`.
  (6, cleanup) The dev-only `data-guest-session` diagnostic published a live
  access token into the DOM; dropped from the published shape (`{status,
  user}` only) since the server-e2e suite that needed a token to call
  `whoami-check` now reads it directly from the Supabase client's own
  `localStorage` entry (`sb-<host>-auth-token`), which existed already and
  needed no new surface. (7, cleanup) Every HMR reload constructed a second
  Supabase/GoTrue client alongside the first one, which is what the SDK's own
  "Multiple GoTrueClient instances detected" console warning was reporting;
  the client promise is now cached on `import.meta.hot.data` and reused
  across reloads, and the dispose handler no longer stops its auto-refresh
  timer, since doing so would have left the *reused* instance unable to
  refresh afterward. (8, cleanup) Added two `ensureGuestSession` unit tests
  ahead of Step 9's identity linking: reusing an existing linked
  (`is_anonymous: false`) session without treating it as a fresh guest, and
  defaulting `isAnonymous` to `false` when a session omits the field
  entirely. (9) Confirmed unrelated to this step: a pasted CI log showed
  `tests/e2e/production-stages.spec.ts`'s "cannot change gold output by
  changing the animation speed" failing on a GitHub Actions runner with
  `page.evaluate: Target page, context or browser has been closed" after
  `page.clock.runFor` — that test does not touch anything Step 8 changed, it
  passed in every local run of the full 42-test suite during this step
  (including after every fix above), and this file already has one prior,
  separately-fixed CI-only flake in the same cosmetic-animation-clock family
  (recorded above, 2026-09-09). Recorded here rather than investigated
  further, since it is out of this step's scope. Verified after fixes 1–8:
  lint clean, 398 unit tests, all 42 Chromium E2E tests, strict build, secret
  scan, 9 production smoke tests, and `npm run verify:server` (all checks,
  including the reorganized `test:server-e2e`) pass.

- 2026-09-09 a follow-up review caught an eleventh finding: fix 4 above
  (dynamic import) made `createSupabaseClient` return a promise that can
  reject — a flaky network fetching the lazy chunk, or a stale chunk hash
  after a redeploy — and `src/main.ts`'s `void`-ed promise chain had no
  `.catch` around it. `ensureGuestSession`'s own try/catch covers only the
  collaborator calls made *inside* it, not the client-construction promise
  one level above it in `main.ts`, so the rejection skipped straight past
  `.then((client) => ensureGuestSession(...))` to an unhandled rejection —
  breaking `guestSession.ts`'s own documented "this never throws" contract
  from one level up, even though the game itself keeps playing (Phaser boots
  independently of this chain). Neither existing suite could have caught it:
  the Docker-free `tests/e2e/` dev server never bundles, so there is no lazy
  chunk to fail, and `tests/server-e2e/`'s network-blocking test only targets
  `**/auth/v1/**`. Fixed with one `.catch` between the two `.then`s, folding
  any rejection into `sign-in-failed` (not `unconfigured`, which stays
  reserved for "no Supabase project configured at all"). A new production
  smoke test, `tests/production/production-smoke.spec.ts`'s "continues
  playing when the lazily-loaded Supabase chunk fails to fetch," blocks
  `**/assets/dist-*.js` (the SDK's own chunk; confirmed stable across two
  separate builds) against the real optimized bundle and asserts both that
  the HUD still renders and that no `pageerror` fires — mutation-proven
  directly: reverting the `.catch` fix reproduces the exact unhandled
  rejection message
  ("Failed to fetch dynamically imported module: .../assets/dist-*.js") as a
  `pageerror`, restoring it passes again. Verified: lint clean, 398 unit
  tests, 42 Chromium E2E tests, strict build, secret scan, 10 production
  smoke tests (up from 9), and `npm run verify:server` all pass.

- 2026-09-09 a third review pass caught a twelfth finding, in the eleventh's own fix: the
  new production-smoke test was a false green on CI, the one place it gates.
  `createSupabaseClient` checks `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
  *before* its dynamic `import()`, and Vite inlines both at build time, so a
  build with neither set makes the guard constantly true and the bundler
  eliminates the import entirely — no lazy chunk is emitted at all. CI has no
  `.env.local`, so `page.route('**/assets/dist-*.js', abort)` matched nothing,
  aborted nothing, and left every assertion trivially true. Reproduced
  directly, three ways: a build without the two variables emits only
  `index-*.js` and the CSS (no `dist-*.js`); with the `.catch` deliberately
  removed, the test still passed in 4.3 s against that build; with the same
  mutation against a configured build, it failed as intended. The chunk's
  absence is correct behaviour, not a defect — an unconfigured build *should*
  ship no SDK — so the test simply cannot be meaningful there, and the fix
  splits the concern rather than forcing a chunk into existence. One rejected
  approach is recorded because it looked obvious and was wrong: giving
  `playwright.production.config.ts` placeholder `VITE_` values so the chunk
  always builds broke 8 unrelated specs, because the resulting sign-in attempt
  surfaces as a real failed request (`net::ERR_UNSAFE_PORT` for the first
  placeholder tried; any unreachable host gives `ERR_CONNECTION_REFUSED`
  instead) in the specs that assert no request fails and no browser error
  fires. Any placeholder producing real network traffic has that problem, so
  the config was left untouched. Fixed in two parts instead. (a)
  `tests/production/production-smoke.spec.ts` now identifies the SDK chunk by
  its *contents* (`GoTrueClient` present, entry-chunk marker absent) rather
  than by a `dist-*` glob — that name is one rolldown derives from the `dist/`
  directory inside `@supabase/supabase-js`, so an SDK layout change or bundler
  rename would have silently unhooked the route even on a configured build —
  counts the aborts it performs and asserts the count is non-zero, and
  `test.skip`s with a stated reason when the build emitted no chunk, so an
  unconfigured build reports a visible skip rather than a false pass or a false
  failure. (b) `tests/unit/server-stack.test.ts` gained
  `describe('the guest-session bootstrap in src/main.ts')` — three
  static-source assertions (the chain is `void`-ed and never awaited before
  boot, a `.catch` sits between its two `.then`s, and the published diagnostic
  goes through `toPublicGuestSessionDiagnostic` rather than stringifying the
  raw result with its token) — carrying the gate that actually runs on every
  CI push, with no Docker and no `.env.local`. This is the same
  static-assertion-beside-behavioural-test pattern a Step 7 review already
  established for `resolveCallerViaSupabaseAuth`, and for the same reason:
  `src/main.ts` is a module of top-level side effects no unit test can import.
  Mutation-proven across all four combinations — with the `.catch` removed the
  unit gate fails (CI condition, no Docker or env needed) and the production
  spec fails against a configured build; with it restored the production spec
  passes and reports a real aborted chunk request, and the full production
  suite in the CI condition is 9 passed with 1 visible skip, the 8 specs the
  rejected placeholder approach had broken all healthy again. Verified: lint
  clean, 401 unit tests (up from 398), 42 Chromium E2E tests, strict build,
  secret scan, 10 production smoke tests, `npm run verify` exits 0.

## Deferred Features — recorded at the Step 37 close, not implemented

Step 37 records these instead of building them. Each was excluded deliberately
by the base-game boundary in `memory-bank/implementation-plan.md`, and a
codebase audit confirms none of them leaked into `src/`: authoritative state
carries only gold, timing counters, fifteen floor records, elevator, and
warehouse, and no manager, boost, gift, shop, premium-currency, Telegram, or
payment code exists. The only `manager` identifiers in the tree name the
cosmetic warehouse supervisor sprite.

**Deferred gameplay systems**

- Managers and manager-driven automation, including the manager slot, rarity,
  and bonuses described in the GDD. Base-game production already runs
  automatically, so no manager is required to play.
- The temporary x4 boost and the auto/infinity indicator.
- Random gift drops on the surface.
- Manager Token and Boost Ticket currencies; gold remains the only resource.
- Deeper-floor resource variety (coal, ruby, gems) and multiple mine types.
- More than fifteen floors.

**Deferred presentation and platform work**

- Audio: background music and all SFX.
- Final production art, sprite atlases, and visual polish; the shipped family is
  original placeholder art with recorded provenance.
- The screens and gameplay behind the new bottom navigation (Rewards, Shop,
  Boost, Managers, Map). The clickable icon shell is implemented; destinations
  remain deliberately unimplemented.
- Telegram Mini App integration and WebView verification.
- Capacitor native packaging.
- Backend services, accounts, cloud save, leaderboards, referrals, monetization,
  ads, blockchain/NFT/Play-to-Earn.
- A deployment pipeline.

**Open verification items carried past the milestone**

- Physical mid-range Android Chrome verification. The benchmark is repeatable
  Pixel 5 emulation in desktop Chrome and must not be represented as
  physical-device evidence.
- A human playtest of the GDD's 30-second-comprehension criterion. It is a
  subjective judgement no automated suite can make.
- Playtest validation of the provisional balance curve, especially the generated
  floor 5–15 depth curve, which no human has played through.
- The main JavaScript chunk measures about 1.56 MB raw / 414 kB gzip (Step 35),
  recorded as a future startup-budget concern rather than a current failure.
  Server-milestone Step 8 added `@supabase/supabase-js` as a client
  dependency; a 2026-09-09 review measured a static import at +58 kB gzip on
  this same chunk and required the SDK to be dynamically imported instead
  (`src/platform/web/supabaseClient.ts`), so the built main chunk is
  essentially unchanged (1,570,900 bytes raw / 417.69 kB gzip) and the SDK
  ships in its own on-demand chunk (214.56 kB raw / 55.05 kB gzip) fetched
  only once `createSupabaseClient` actually runs.

## Acceptance Results — reviewed at the Step 37 close

### GDD section 10 prototype criteria

| Criterion | Result | Evidence |
|---|---|---|
| The player understands how gold is earned and spent within 30 seconds, without a long tutorial | **Not verified** | Subjective; no automated suite can judge it. The supporting structure exists — each stage has its own indicator, queued material renders wherever it accumulates, and the HUD is three icon-led numbers — but the criterion needs a human playtest and is carried forward as an open item. |
| All floors run concurrently at 60 FPS on the target device | **Pass, with a caveat** | The ten-minute benchmark with all fifteen floors unlocked measured 60.00 FPS, 17.6 ms p95, 17.8 ms maximum, and zero frames beyond the 18.34 ms threshold across 36,135 samples. `tests/unit/concurrent-production.test.ts` proves every unlocked floor advances from its own configured duration in the same tick. Caveat: Pixel 5 emulation under 4× CPU throttling in desktop Chrome, not a physical Android device. |
| Balance and progress restore exactly after closing and reopening | **Pass** | Step 34 pins hidden/visible catch-up as byte-for-byte equal to uninterrupted play, plus pagehide journal recovery and abrupt navigation. The production smoke suite repeats the check against the served bundle: a 40-second session flushed at a `visibilitychange` boundary equals the document derived independently in the test process, and a reload continues from the deserialized state. |
| Offline reward never exceeds the configured limit | **Pass** | `offlineIncome.capDurationMs` is 7,200,000 and `efficiency` is 0.5, both validated at startup. `tests/unit/offline-income.test.ts` covers zero elapsed time, a normal absence, capping at two hours, future timestamps awarding zero, very large saved rates, and invalid inputs. Step 33 and Step 34 prove the same interval cannot be claimed twice. |
| After ten minutes the player has opened at least three floors and hit at least one multiplier milestone | **Pass** | The deterministic Step 19 harness opens floors 2, 3, and 4 at 45 s, 175 s, and 508 s and reaches a level-10 milestone within the ten-minute session — four floors against the required three. Step 33 drives the same trace through real canvas presses in the browser twice. |
| No progression stall where costs outrun income | **Pass** | The same harness asserts a positive effective production rate at the end, finite non-negative balances throughout, and only positive-cost actions with non-negative modeled improvement. It is deterministic and replays identically. |

### Plan Definition of Done

| Requirement | Result |
|---|---|
| All 37 step validations pass | Steps 1–36 complete with recorded evidence and explicit user validation; Step 37 awaits this gate. |
| The production bundle is playable in a mobile-sized browser | Pass — nine production smoke tests against the served `dist/` at base path `/`, including pixel probes of the real canvas and four viewports. |
| All fifteen floors can run concurrently | Pass — unit-proven per-tick, and held active for the full ten-minute benchmark. |
| Progression is viable | Pass — see the ten-minute harness above. |
| Saves and offline rewards are deterministic | Pass — Steps 20–24 and 33–34, re-proven against the shipped bundle in Step 36. |
| No deferred feature has leaked into scope | Pass — audited at the Step 37 close; authoritative state and `src/` contain no manager, boost, gift, shop, premium-currency, Telegram, or payment code. |
| All project documentation reflects the delivered state | Pass — `README.md` added; eight stale-documentation defects corrected across `AGENTS.md`, `CLAUDE.md`, the GDD, and four Memory Bank files. |

### Aggregate verification, 2026-09-09

Current aggregate verification passes end to end: lint, 401 unit tests, 43 Chromium E2E tests,
the strict production build, secret scan, and 10 production smoke tests.
`npm run test:perf` passes every budget with fifteen floors active. Save-document
and IndexedDB schema versions remain 1.

## Known Risks

- The reference clip is too short to establish exact formulas or all features.
- Idle-game number growth can overflow without a large-number abstraction.
- WebView suspension and clock manipulation can corrupt offline rewards if not bounded and validated.
- Visual fidelity must not rely on copied art, audio, branding, or UI assets.


## Marketplace popup — 2026-09-09

The user authorized the Shop icon to open a marketplace design for buying and
hourly rental of cat roles. `src/ui/MarketplaceModal.ts` now owns a native modal
dialog opened by `BootScene`'s Shop callback. It blocks background input, restores
scene input on close, supports Escape/native focus containment, and is destroyed
on scene shutdown. The responsive navy/gold interface includes Buy, Rent and My
listings, name search, role/rarity filters, price sorting, empty-state reset, cat
details, 1–24 hour rental totals, and validated session-only listing drafts with
removal. Four catalog portraits (Mofy, Baron, Elon, Cipher) are copied into
`public/assets/marketplace/` for this presentation only; gameplay assignments
and rarity bonuses are not integrated.

This is explicitly a Preview with sample prices/listings. Live trading is disabled;
no ownership inventory, transaction service, gold debit, or public listing is
implemented. Drafts survive popup close but disappear on reload. No database,
IndexedDB, localStorage journal, save-document, or server schema changes.
The existing server milestone remains at Step 8 awaiting validation.

Validation: production build and lint pass. Marketplace browser coverage checks
390×844 and 320×568 layouts, search/filter/reset, rental totals, draft creation
and removal, disabled live trading, and Escape dismissal. Navigation coverage
closes Marketplace before testing the remaining icons.


## Navigation hit-target correction — 2026-09-09

Fixed the user-reported left/up offset on bottom-navigation icons. Phaser's
InputManager adds a Container's `displayOriginX/Y` (half its configured size)
before testing the hit shape. BottomNavigationView now uses Rectangle(0, 0,
width, height), replacing the negative half-size origin that applied the offset
twice. Artwork remains centered, and all five existing touch targets retain
their dimensions; the complete visible icon chrome now responds to mouse/touch.

Regression: navigation-hit-targets.spec.ts failed for both mouse and touch before
the fix, then passed afterward. It checks center and four interior corners of
each icon at 553×934 and after resizing to 320×568 (100 total activations), with
Marketplace opened/closed at every Shop activation. The test waits two animation
frames after resizing so Phaser receives the resize before native touch input.
Validation: all 9 targeted navigation/marketplace/layout browser tests pass;
production build and lint pass. No gameplay, save or database schema changes.

## Upgrade CTA press correction — 2026-09-10

Fixed the user-reported case where upgrade CTA text did not respond while the
button's left padding did. The live simulation refreshes an open upgrade modal;
the old render path replaced each button's label and cost spans on every changed
snapshot. A press beginning on that text could lose its DOM target before
release, so the browser canceled the click. `MineShaftUpgradeModal` now creates
those spans once and updates their text in place. It captures the primary
pointer from press through release, clears canceled pointers, handles physical
pointer activation exactly once, and retains keyboard/assistive click support.
CTA CSS now declares `touch-action: manipulation` and disables text selection.

Regression coverage holds a pointer on the x1 label across multiple live
simulation updates before releasing, and separately verifies the initially
focused CTA activates once with Enter. Playwright's port can be overridden with
`PLAYWRIGHT_PORT` so the suite does not require stopping an unrelated process on
its default port. No gameplay formula, balance, save, or database schema changed.
Validation passes: 11 targeted CTA/navigation/Marketplace browser tests, the
production build, and lint. The dwell regression also passed 5/5 repeated runs.

## Marketplace hardening and close-race correction — 2026-09-10

A review pass over the Marketplace popup, the bottom navigation, and the Step 9
row-level-security suite corrected nine items. None changed gameplay, balance,
the save document, or any database schema.

`src/ui/MarketplaceModal.ts` now builds every node with `createElement` and
`textContent`; no `innerHTML` or `insertAdjacentHTML` remains anywhere in
`src/`. The listing fields it renders — name, role, rarity — are still the
module-level `CATS` constant, so nothing was exploitable before. The point is
that this is the one screen designed to render *other players'* listings, and
the template-string form would have become a stored-XSS sink the day that
constant is replaced by server data. This narrows the surface finding F5 names;
it does not close it, because `index.html` still ships no Content Security
Policy.

The modal is exported from the `src/ui/index.ts` barrel like every other UI
module. Its tab, role, rarity, and sort state carry union types instead of
`string`, and `#select` is generic over them, so a mistyped literal comparison
is now a compile error. Formatting returned to the repository norm: the longest
line fell from 594 characters to 110, and the new `src/style.css` rules are
multi-line like the ones above them. No lint rule caught any of that — there is
no `max-len` — which is why it needed a reading rather than a run.

Two dialog behaviours were wrong. Every `#render()` tears down and rebuilds the
whole body, destroying whatever held keyboard focus — the tab just pressed, or
the button behind "Clear filters", "Back to cats", "Save draft" or "Remove" —
and inside `showModal()` that dropped focus to `<body>`, forcing keyboard and
screen-reader users to tab back down from the header. `#render()` now refocuses
the active tab, and the detail and create-listing views refocus their back
button. Separately, `dialog.close()` queues its `close` event as a task, so
`destroy()`'s synchronous `remove()` ran first and the callback still fired
afterward, re-enabling input and bumping the close count on a shutting-down
scene and focusing a detached element; a `#destroyed` flag short-circuits it.
Suppressing that callback cannot strand input, because Phaser's
`InputPlugin.start()` sets `enabled = true` on scene restart. `BootScene` also
replaced `this.#marketplace?.open()` with an explicit null check, so scene input
is surrendered only once the modal that restores it is known to exist.

A navigation button pressed twice inside 130 ms never looked pressed:
`pointerdown` set the scale while the previous release's `Back.Out` tween was
still running and kept overwriting it. `pointerdown` now kills that tween first.

The largest finding was in the tests, not the product.
`navigation-hit-targets.spec.ts` and `layout.spec.ts` clicked "Close
marketplace" and then immediately clicked the canvas again. Because
`dialog.close()` queues its `close` event, `#onClose()` — the callback that
re-enables `this.input` — had not run yet, so Phaser dropped the next press
without a trace. The rewrite's many `createElement` calls are slower than the
single `innerHTML` parse and widened the window until the failure was near
deterministic: the isolated spec failed 6 of 6 runs where the pre-rewrite modal
passed 3 of 3. Both specs now wait on `data-marketplace-close-count`, which
`BootScene` bumps inside that same callback *after* re-enabling input, making
the wait causal rather than a timing guess; the isolated spec then passed 6 of 6.

What made it worth chasing is that it hid under load. The full 51-test
Playwright run passed both before and after the fix, and `--repeat-each=6`
passed 12 of 12, because parallel workers shift the timing. `npm run verify`
would have stayed green while anyone running that one spec saw red.

`layout.spec.ts` and `production-smoke.spec.ts` also scope their "no DOM
navigation" assertion to `#game-viewport > nav`, since the marketplace mounts
its own `<nav class="market-tabs">` in the same parent and must not decide that
assertion either way.

`tests/server-integration/profiles-rls.integration.test.ts` no longer depends on
declaration order: a third anonymous identity, `userC`, owns the one test that
writes a `display_name`, leaving `userA` and `userB` read-only fixtures. Its
first test now proves the trigger instead of repeating the select policy, by
asserting `created_at` falls inside the sign-up call itself.

Validation: lint, `tsc --noEmit`, 401 unit tests, 51 Playwright E2E tests, and
13 server-integration tests against the live local stack all pass, alongside the
6-of-6 isolated re-run above. One unrelated one-off was observed and recorded:
`tests/unit/bundle-secret-scan.test.ts` failed once under heavy concurrent load
and did not reproduce in two further full runs or in isolation. That file is
untouched by this change; it is noted as a pre-existing latent flake, not a
finding against it.
