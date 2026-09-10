# Server Milestone Implementation Plan

## Purpose

This plan takes Cat Mine Idle from a client-only game to an account-backed one:
guest play, registration, cloud save, server-verified progress, leaderboards, and
the entitlement groundwork for later monetization.

It is a separate milestone from `memory-bank/implementation-plan.md`, which is
complete and closed. The same working rules apply: complete steps in order, each
step ends at a stop gate, and no step starts while its dependencies or
validations are failing.

## Recorded decisions

| Decision | Choice | Consequence |
|---|---|---|
| Scope | Full platform — cloud save, anti-cheat, social, monetization groundwork | The largest of the four options offered. Phases 5 and 6 are deliberately last so they can be cut without invalidating anything before them. |
| Source of truth | Server validates on save | The client keeps running the simulation; the server re-runs `src/core` to bound what the client may claim. |
| Identity | Anonymous session for guests, then Google/Apple OAuth and Telegram `initData` | No email/password. Nothing to hash, no password reset, no verification mail. |
| Guest identity mechanism | A server-issued anonymous **session credential**, plus an optional **recovery code** | Not a device identifier. See "What a guest identity actually is" below. |
| Device fingerprinting | **Rejected** as an identity mechanism | See "Rejected approaches". |
| Infrastructure | Supabase | Postgres, Auth, and Edge Functions from one provider. |

## What makes this feasible

`src/core` and `src/config` have exactly one external dependency between them,
`break_infinity.js`; everything else is internal or type-only.
`src/persistence/saveSchema.ts` imports only those two. That bundle is therefore
portable to Deno as-is, so **the server can run the identical simulation,
migration, and validation code the client runs** rather than a reimplementation
that drifts. Every anti-cheat guarantee in Phase 4 rests on this, and Step 6
exists to keep it true.

`ActiveSaveRepository` is already an interface, so a remote adapter joins the
client without disturbing the layering.

## What a guest identity actually is

The web exposes no stable device identifier, and this plan does not pretend
otherwise. A guest is identified by a **server-issued anonymous session
credential** — a real `auth.users` row with an unguessable token that the browser
stores. It is a secret, not an observation, which is what makes it safe to hand a
save to whoever presents it.

That credential survives reloads and restarts. It does not survive cleared site
data, a private window, or a different browser or device. The **recovery code**
in Step 14 exists precisely to cover those cases, and is the only mechanism in
this plan that does.

## Three things to be clear about before starting

**Validate-on-save bounds the rate, not the decisions.** The server can prove a
player did not earn more than the mine could physically produce in the elapsed
wall-clock time. It cannot prove they played that well by hand rather than by
script. Against a leaderboard that means the top of the board converges on
perfectly-optimal play, which a bot can reach and a human cannot. That is an
accepted limit of the chosen model, not a defect to be discovered later; if a
leaderboard has to be robust against optimal-play bots, that needs
server-authoritative simulation, which was considered and not chosen.

**With Supabase, anti-cheat lives or dies on one rule.** Row-level security
cannot re-simulate a save, so it cannot decide whether one is legitimate. Every
save write must go through an Edge Function holding the service role, and RLS
must deny the client any direct write to the save table. If a client can reach
`saves` through PostgREST, Phase 4 is decoration. Step 15 establishes this and
Step 26 attacks it.

**Local storage is not durable, and this is already true today.** Safari's
tracking prevention deletes all script-writable storage — IndexedDB and
localStorage included — after seven days of Safari use without first-party
interaction on the site. The counter resets whenever the player opens the game,
so an active player is unaffected, but a lapsed one loses everything. This
already affects the shipped client-only build, whose entire save lives in exactly
those two places. It is the strongest practical argument for this milestone, and
Step 21 addresses it directly.

## Rejected approaches

### Canvas and WebGL fingerprinting as guest identity

Proposed and rejected. Recorded here with reasons so it is not re-proposed.

- **It collides, and a collision hands one player another player's save.** The
  technique depends on hardware and driver variation, so devices sharing a model,
  OS build, and browser build produce the *same* hash — most acutely on iOS,
  where Apple controls the hardware and font set tightly. Hundreds of thousands
  of identically-configured phones would share one identifier. For analytics a
  collision is noise; for save ownership it is progress loss and data leakage
  between strangers.
- **It is unstable.** The hash changes on browser update, OS update, GPU driver
  update, display or DPI change, and hardware-acceleration toggles. An idle game
  is played over months; a routine Chrome update would look like a new player.
- **Browsers defeat it, in both directions.** Brave's farbling randomizes canvas
  and WebGL output per session and per site, producing a new identifier on every
  visit. Firefox `resistFingerprinting` and Tor do the opposite, returning
  identical output for every user. Either behaviour breaks an identity system.
- **It is an identifier, not a credential.** A fingerprint is observable, not
  secret, and the server cannot distinguish the real client from anyone replaying
  the same hash. It is the security equivalent of a username with no password —
  worse, because the value space is small enough to enumerate.
- **It requires consent anyway.** GDPR and ePrivacy treat fingerprinting as
  access to information on terminal equipment, in the same category as cookies,
  so an EU-facing deployment needs a consent prompt — which removes the very
  convenience that motivated it. Apple's App Store rules separately prohibit it
  for tracking, which would matter for a later Capacitor build.

**Narrowly permitted use:** fingerprint-derived signals may be used in Step 25 as
one weak input to abuse detection and rate limiting. They must never determine
identity, never decide save ownership, and never be sufficient on their own to
act against an account.

## Phase 0 — Decide and design

### Step 1: Record scope, threat model, and open questions

**Instructions:** Write the threat model: what an attacker controls (local
storage, the client bundle, the device clock, HTTP requests), what each is worth,
and what this milestone does and does not defend. Record every unresolved
question from the milestone kickoff — expected scale, budget, player regions and
their data-protection rules, whether Telegram ships in this milestone, whether
real money is ever taken, who operates the server, and whether existing local
saves must survive. Mark each as decided or still open with an assumed default.

**Test:** Every decision in this plan traces to either a recorded user decision
or a written assumed default. No step's instructions depend on an unrecorded
assumption.

### Step 2: Design the save-sync protocol

**Instructions:** Specify the client/server contract before writing either side:
endpoints, request and response shapes, error vocabulary, the optimistic
concurrency token, and what the client does for each failure. Decide the
conflict policy for a device that played offline while another device saved.
Specify that the server timestamp — never a client-supplied one — anchors every
elapsed-time calculation. Decide here whether session persistence uses a
first-party HttpOnly cookie on the game's own origin, which is exempt from the
seven-day script-writable storage cap but requires an endpoint on that origin
rather than on the Supabase domain.

**Test:** The contract is written down with an example request and response per
endpoint, including every rejection. A reviewer can describe what the client
shows for each without reading code.

### Step 3: Design the database schema

**Instructions:** Design the Postgres schema: profiles, saves, save audit,
recovery codes, leaderboard entries, entitlements. Decide how a `GameNumber` is
stored and how a leaderboard sorts on one — a value past `1e308` cannot go in a
`double precision` column, so store the exact serialized string for display
alongside a sortable `log10` magnitude as `double precision`. Recovery codes are
stored only as hashes, never in plaintext. Document every table, column, type,
default, nullability, key, constraint, index, and relationship in **both**
`memory-bank/architecture.md` and `memory-bank/techContext.md`, replacing the
current "Relational/server database schema: none" statement in each.

**Test:** Both documents contain the identical complete schema. `AGENTS.md`
requires this pairing on every future migration, so the reviewer confirms the two
copies agree field for field.

## Phase 1 — Server foundation

### Step 4: Stand up the Supabase project and local stack

**Instructions:** Create the project and the local development stack through the
Supabase CLI so the whole backend runs offline. Commit configuration; keep keys
in ignored `.env.local` with placeholders in `.env.example`. The service-role key
must never reach the client bundle or the repository.

**Test:** A clean checkout starts the local stack, applies migrations, and
responds to a health check. A grep of `dist/` after a production build finds no
service-role key and no non-public secret.

### Step 5: Add migrations and CI

**Instructions:** Establish forward-only SQL migrations, a seed for local
development, and a CI job that applies migrations from empty and runs the server
test suite. Extend `npm run verify` or add a sibling command so server checks run
alongside the existing client gate.

**Test:** CI applies every migration to an empty database and passes. A
deliberately broken migration fails CI rather than being discovered on deploy.

### Step 6: Make the core simulation runnable on the server

**Instructions:** Make `src/core`, `src/config`, and the save-document boundary
importable from Deno Edge Functions without forking them. Do not copy the code;
a copy will drift from the client and every anti-cheat guarantee assumes it did
not. Add a lint rule and an architecture-test probe that fails if server-only
code is imported into `src/core`, extending the existing purity rules.

**Test:** An Edge Function imports the real `advanceSimulation`,
`catchUpSimulation`, `migrateSaveDocument`, and `validateSaveDocument`, and
reproduces a known ten-minute result byte-for-byte identical to the client unit
test's expectation. Mutating a core file changes both results together.

### Step 7: Add the Edge Function test harness

**Instructions:** Establish how server functions are tested: unit tests against
the pure handlers and integration tests against the local stack with a real
database. Fix the fixture pattern for an authenticated caller.

**Test:** A trivial authenticated endpoint has both a unit and an integration
test, and both run in CI from a clean database.

## Phase 2 — Identity

### Step 8: Anonymous guest session

**Instructions:** Use Supabase anonymous sign-in so a first-time player holds a
real `auth.users` row from the first frame, without a prompt, form, or network
wait that blocks play. This is a session credential, not a device identifier: it
is an unguessable secret the browser stores, and it is what proves ownership of a
save. Persist the session and keep the game fully playable if the call fails.

**Test:** A fresh browser boots into a playable game holding a session. With the
network disabled the game still boots, still plays, and still saves locally. Two
browsers on the same machine receive different identities, and neither can read
the other's data.

### Step 9: Profiles and row-level security

**Instructions:** Add the profiles table with RLS allowing a user to read and
update only their own row. Create the profile on sign-up through a trigger or the
sign-in function, not from the client.

**Test:** An integration test proves user A cannot read or write user B's profile
through PostgREST with A's token, for select, insert, update, and delete.

### Step 10: Google sign-in

**Instructions:** Configure the Google provider and the client flow. A signed-in
guest must be able to attach Google to the account they already have, keeping the
same user id, rather than creating a second one.

**Test:** A guest with progress signs in with Google, keeps the same user id, and
keeps their progress. Signing out and back in with Google returns the same
account.

### Step 11: Apple sign-in

**Instructions:** As Step 10, for Apple. Handle Apple's private-relay email and
its one-time name delivery on first authorization.

**Test:** The same identity and progress assertions as Step 10, plus a test that
a second authorization with no name returned does not blank an existing profile
name.

### Step 12: Telegram sign-in

**Instructions:** Verify `initData` server-side against the bot token and reject
anything failing the signature or freshness check. Never trust
`initDataUnsafe`. Mint a session only after verification. This is the highest-risk
identity path because it has no first-party provider support and forges the
session itself. Inside Telegram this replaces the guest path entirely: the
Telegram user id is both stable and signature-verifiable, which no browser-side
identity is.

**Test:** Valid `initData` produces a session. Tampered payloads, replayed stale
payloads, and payloads signed with a different bot token are each rejected with
no session issued. The bot token never appears in any client-reachable artefact.

### Step 13: Link a guest to an account, including the collision

**Instructions:** Implement guest upgrade through identity linking so the user id
survives and the save needs no migration. Then handle the case linking cannot
solve: a guest with local progress signs into an account that already has a
cloud save. Neither save may be silently destroyed. Present both with enough
information to choose — progress, floors open, last played — and let the player
decide.

**Test:** Three flows pass: guest with progress links a fresh provider identity
and keeps everything; guest with progress signs into an account holding a
different save and is asked, with each choice honoured exactly; a guest with no
progress signing into an existing account is not asked at all.

### Step 14: Recovery code

**Instructions:** Issue a high-entropy single secret the player can record, so a
guest who has not linked a provider can still reclaim their account after cleared
storage, a new browser, or a new device. Store only a hash, never the code
itself. Show it once, let the player regenerate it, and invalidate the previous
code when they do. Redemption attaches the caller to the owning account and must
reuse the Step 13 collision flow when the redeeming device already holds
progress. Rate-limit redemption attempts per address and per code.

This is the only mechanism in the plan that survives storage loss for an unlinked
guest, so it is the answer to both the seven-day storage cap and the
device-change case.

**Test:** A code redeems exactly once per rotation and restores the correct
account. Regeneration invalidates the prior code. Wrong codes are refused and
throttled. The database stores no plaintext code, verified by inspecting the row.
Redeeming on a device holding progress enters the collision flow rather than
overwriting either save.

## Phase 3 — Cloud save

### Step 15: Save storage with client writes denied

**Instructions:** Add the saves table. RLS permits a user to read only their own
row and permits **no** client write at all. The only writer is the Edge Function
running under the service role. Include the optimistic-concurrency column from
Step 2.

**Test:** An integration test attempts every direct write a client could make to
`saves` with a valid user token — insert, update, upsert, delete, and via any
view or RPC — and every one is refused. This test is the guard for all of Phase 4.

### Step 16: Save upload

**Instructions:** Implement the upload function: authenticate, migrate and
validate the document with the shared code from Step 6, reject on concurrency
conflict, and store it with the server's own received-at timestamp. No
gameplay validation yet — that is Phase 4 — but the seam for it exists here.

**Test:** A valid document is stored. A malformed one, an unsupported schema
version, and a stale concurrency token are each rejected with their distinct
error, and the stored row is unchanged in every rejection.

### Step 17: Save download and boot order

**Instructions:** Implement download and decide what the client does at boot when
local and cloud both exist. Cloud latency must never delay the first frame: boot
from local, reconcile after.

**Test:** A player with a cloud save on a new device restores it. Boot time on a
slow network is unchanged from the client-only build within a stated tolerance.

### Step 18: Conflict resolution

**Instructions:** Implement the Step 2 policy for divergent saves. The rule must
be stated in player-facing terms, not just in code, and must never discard
progress without the player having seen it.

**Test:** Two devices play the same account offline and both sync. The documented
policy is applied, the outcome is deterministic, and no accepted branch loses
progress the player was not shown.

### Step 19: Client remote repository

**Instructions:** Add a remote `ActiveSaveRepository` implementation composed
with the existing Dexie one: IndexedDB stays the primary store and the cloud is a
replica. Network work belongs in `src/persistence` and `src/platform`; `src/core`
must not learn that a server exists.

**Test:** The architecture test still passes with no network API reachable from
`src/core`. The full existing client E2E suite passes offline, unchanged.

### Step 20: Adopt existing local saves

**Instructions:** A player already holding a version-1 IndexedDB save must, on
first sign-in, have it adopted as their cloud save rather than replaced by a
fresh one.

**Test:** A pre-milestone save survives first sign-in intact and is byte-for-byte
the document later returned by download.

### Step 21: Survive local storage eviction

**Instructions:** Handle the seven-day script-writable storage cap and storage
clearing generally. Measure the real behaviour on iOS Safari rather than assuming
it: how long the save actually survives, and whether
`navigator.storage.persist()` is granted and whether a granted persistence
actually exempts the data from that deletion. Record what was measured, not what
the specification implies. Then make the client detect the state where the local
save is gone but a session or recovery code remains, and restore from the cloud
instead of starting a fresh game. Ensure the first cloud sync happens early
enough in a session that a player who never returns has something to restore.

**Test:** With local storage cleared, a signed-in player is restored from the
cloud rather than reset. An unlinked guest with no cloud copy sees an honest
explanation rather than a silent reset. The measured iOS Safari behaviour is
recorded in `memory-bank/techContext.md` with its measurement date.

## Phase 4 — Server-verified progress

### Step 22: The server clock becomes the only clock

**Instructions:** Move offline-income settlement to the server, computing elapsed
time from the stored server received-at to the server's own now. The client may
still display a projection, but the credited amount is the server's. This closes
the device-clock cheat that the two-hour cap and 50% efficiency currently only
blunt.

**Test:** A client reporting a clock hours ahead, hours behind, or moving
backwards receives the same reward as an honest client for the same real
absence, and never more.

### Step 23: Upper-bound re-simulation

**Instructions:** On upload, re-run the shared core from the last accepted
document across the server-measured elapsed time to derive the maximum the mine
could have produced, and reject a document claiming more. Bound the monotonic
cumulative counters — `totalExtracted`, `totalGoldDelivered`, transported totals
— rather than current gold, which legitimately falls when the player spends.
Document the tolerance and why it is that size.

**Test:** Honest sessions of varying length and shape are accepted. Documents
inflating gold, cumulative delivery, or shaft levels beyond what the elapsed time
allows are rejected. The tolerance is pinned by a test on both sides so widening
it silently fails.

### Step 24: Rejection handling

**Instructions:** Decide and implement what a rejected save does to the player.
An honest player hitting a false positive must not lose their game. Record every
rejection with enough context to tell a bug from an attack.

**Test:** A rejected upload leaves the session playable and the local save
intact, surfaces a comprehensible notice, and produces one audit row.

### Step 25: Abuse limits

**Instructions:** Rate-limit uploads, authentication, and recovery-code
redemption per user and per address. Cap document size before parsing.

Fingerprint-derived signals may be used here as **one weak input** to abuse
detection — for example, noticing one browser minting large numbers of guest
accounts. They must never determine identity, never decide save ownership, and
never be sufficient alone to act against an account. If the deployment serves the
EU, confirm the consent position before collecting them at all; the alternative
is to rely on address and behavioural rate limits only.

**Test:** A flood of uploads is throttled without affecting a normal player's
cadence. An oversized body is refused before it is parsed. A test asserts no code
path uses a fingerprint value to select an account or authorize a save write.

### Step 26: Adversarial suite

**Instructions:** Write the attack suite as a first-class deliverable, not an
afterthought: forged gold, replayed documents, rolled-back concurrency tokens,
clock manipulation in both directions, another user's id, direct PostgREST writes
to every table, unverified Telegram payloads, a stolen anonymous session, and
brute-forced recovery codes.

**Test:** Every attack is refused, each by a named assertion. Removing any one
server-side guard makes its own test fail — verified by mutation, in the style the
client suite already uses.

## Phase 5 — Social

### Step 27: Leaderboard storage

**Instructions:** Add the leaderboard table using the Step 3 magnitude-plus-exact
representation, with the indexes its queries need. Decide the metric, the reset
period if any, and the tie-break.

**Test:** Values spanning ordinary numbers through magnitudes past `1e308` sort
correctly and display exactly. A ranking query over a realistic row count meets a
stated latency budget.

### Step 28: Leaderboard writes

**Instructions:** Publish an entry only from a save that passed Step 23. A
rejected or unvalidated save must never reach the board.

**Test:** A rejected save produces no entry. Only server-side code can write the
table; the Step 15 direct-write test is extended to cover it.

### Step 29: Leaderboard display

**Instructions:** Show the board and the player's own rank, formatted through the
existing `formatAmount` so the units match the rest of the game.

**Test:** Displayed values match the stored exact values at every magnitude tier.
The screen degrades to a stated offline state without breaking the game.

### Step 30: Decide on friends

**Instructions:** Re-read the milestone's goals before building a friend graph.
If it is not needed for the platform's purpose, record it as deferred here rather
than implementing it.

**Test:** Either the feature ships with its own tests, or the deferral is recorded
in `memory-bank/progress.md` with its reason.

## Phase 6 — Monetization groundwork

### Step 31: Entitlements

**Instructions:** Add an entitlements table and the server-side check that grants
an effect. No payment processing, no store integration, no prices — this step
establishes only that an entitlement is server-held and server-checked, so a
later payment milestone has somewhere sound to write.

**Test:** A client cannot grant itself an entitlement through any reachable path.
A server-granted entitlement is visible to the client and enforced server-side.

### Step 32: Audit log

**Instructions:** Record identity changes, recovery-code issuance and redemption,
entitlement grants, and save rejections in an append-only log the client cannot
write.

**Test:** Every event type appears with its actor and timestamp. No client token
can insert, update, or delete a row.

## Phase 7 — Operations and exit

### Step 33: Account and data deletion

**Instructions:** Implement deletion covering every table, including the audit
log's personal fields, and state the retention period. Required in most
jurisdictions and hard to retrofit once data is spread across tables.

**Test:** A deletion request removes or anonymizes every row for that user across
every table. A test enumerates the tables so a future table added without a
deletion path fails it.

### Step 34: Backup and restore

**Instructions:** Configure backups and perform a real restore into a scratch
environment. An untested backup is not a backup.

**Test:** A restore drill is executed and its result recorded: what was restored,
how long it took, and what was lost.

### Step 35: Monitoring

**Instructions:** Add health checks and alerts on error rate, save-rejection
rate, and auth failure rate. A rejection-rate spike is the signal that either an
attack started or Step 23's tolerance is wrong.

**Test:** A deliberately induced failure raises its alert.

### Step 36: Load and performance

**Instructions:** Measure upload latency under concurrent load at the scale
recorded in Step 1, including re-simulation cost for a long absence. Confirm the
client's frame budget is untouched, since sync must never block a frame.

**Test:** Stated latency budgets hold under load. The client benchmark still
passes with sync active.

### Step 37: Close the milestone

**Instructions:** Review against this plan. Record deferred features rather than
implementing them. Update every Memory Bank file, and update `README.md` and
`CLAUDE.md` for a codebase that now has a server.

**Test:** Every prior step has recorded passing evidence, the Memory Bank matches
the implementation including the complete database schema in both required files,
and a new developer can run the client and the server locally from repository
documentation alone.

## Status

Steps 1 through 8 are validated. Step 9 is implemented on 2026-09-10 and
awaiting user validation. Step 10 must not begin before that gate.

| Step | Status | Evidence |
|---|---|---|
| 1 — Record scope, threat model, and open questions | Validated by the user on 2026-09-08 | `memory-bank/server-threat-model.md`: threat model over four attacker capabilities plus session-credential and multi-identity, explicit non-defences, standing rules, all eight kickoff questions defaulted, and nine previously unrecorded assumptions found. |
| 2 — Design the save-sync protocol | Validated by the user on 2026-09-08 | `memory-bank/server-save-sync-protocol.md`: two endpoints plus health with an example request and response for every success and every rejection, an eleven-code error vocabulary with fixed player-facing copy, the `revision` concurrency token, server-clock anchoring, the dominance conflict policy, the session-storage decision, and the upload cadence that resolves F6. |
| 3 — Design the database schema | Validated by the user on 2026-09-08 | Six tables documented byte-identically in `memory-bank/architecture.md` and `memory-bank/techContext.md` — 42 columns, every type, default, nullability, key, constraint, index, and relationship, plus the RLS matrix and the `GameNumber` storage rule. The documented DDL was extracted from the document itself and executed against PostgreSQL 17; 14 constraint-behaviour assertions pass, including full cascade deletion. |
| 4 — Stand up the Supabase project and local stack | Validated by the user on 2026-09-08 | Supabase CLI 2.117.0 pinned as an exact devDependency; committed `supabase/config.toml`, one bootstrap migration, one `save-sync` Edge Function serving protocol §10.1. `npm run verify:server -- --with-bundle-scan` (the `--` is required; npm does not forward a bare flag) passes nine checks from a clean checkout against an empty Docker volume set. Mutation-proven on both halves: a broken migration fails `db reset` with exit 1, a stopped PostgREST container turns the health route into a 503 `service_unavailable`, and a planted service-role JWT, `sb_secret_*` key, or server-only variable name each fails the bundle scan. A user review then found four defects, each fixed with a regression: the migration check parsed the CLI's default text table and reported a healthy stack as a missing migration, the plan's own `--with-bundle-scan` invocation was not forwarded by npm, the scanner would have failed a build on an anon key present under both its prefixed and unprefixed names, and the privileged-key probe degraded to checking nothing in silence. `npm run verify` passes end to end — lint, 364 unit tests, 42 Chromium E2E, strict build, secret scan, 9 production smoke. |
| 5 — Add migrations and CI | Validated by the user on 2026-09-08 | `supabase/migrations/20260908130000_create_platform_tables.sql` lands the Step 3 schema verbatim — all six tables, every index, and RLS enabled with exactly the policies the Step 3 matrix names (`profiles`/`saves`/`entitlements` own-row select, `profiles` own-row update, `leaderboard_entries` world-readable select, `save_audit`/`recovery_codes` no policy at all). `supabase db reset` applies both migrations and the new `supabase/seed.sql` fixture guest cleanly; `npm run verify:server` passes with the expected migration list read from disk. `.github/workflows/ci.yml` adds a `client` job (`npm run verify`) and a `server` job (`npm run verify:server`) that both gate every push and pull request; `package.json` gained a `verify:all` sibling script running both locally. Evidence gathered directly rather than only asserted: against the real local stack, an anon-scoped JWT for the seeded fixture user can `select` its own `profiles` row (200, one row) and its own empty `saves` row-set (200, `[]`), a direct `insert` into `saves` is refused (403, PostgREST error `42501`, "new row violates row-level security policy"), and `save_audit` returns `[]` under RLS with no policy. Mutation-proven for the CI claim itself: a migration with a typo'd foreign-key column made `supabase db reset` exit 1; removing it restored exit 0. Further hardening landed before the Step 6 gate: the shared `updated_at` trigger pins `search_path = ''`, `leaderboard_entries` revokes the wildcard `select` grant and re-grants only the columns that should be public — closing a `?select=user_id` enumeration path the RLS policy alone would have allowed — and `EXPECTED_MIGRATIONS` in `scripts/verify-server-stack.mjs` was replaced with a read of `supabase/migrations/` itself, so a future migration extends the check without anyone remembering to edit a list. |
| 6 — Make the core simulation runnable on the server | Validated by the user on 2026-09-09 | `supabase/functions/core-portability-check` imports a Vite-bundled, dependency-free copy of `src/core`, `src/config`, and `src/persistence/saveSchema.ts` (`npm run build:server-core`, from the pure re-export `supabase/functions/_shared/coreBundleEntry.ts`) and, on the real local edge runtime, reproduces a fixed ten-minute run through the real `advanceSimulation`, `catchUpSimulation`, `migrateSaveDocument`, and `validateSaveDocument` — gold 100 → 3080, byte-for-byte identical to `tests/unit/server-core-portability.test.ts`'s pinned result for the unbundled source, verified by direct JSON comparison and now gated inside `npm run verify:server`. `eslint.config.mjs` bans the `Deno` global and any import matching `(^|/)supabase(/|$)` inside `src/core/**`, extending the existing purity rules; `tests/unit/architecture.test.ts` gained a probe for both. Mutation-proven: doubling a floor's extraction yield in `src/core/simulation/advanceSimulation.ts` broke the client test's pinned assertion and moved the live Edge Function's returned gold from `3080` to `6060` — identically, in the same run — before the edit was reverted and both sides matched again. Two findings surfaced empirically rather than being assumed: F2 ("`break_infinity.js` importing into Deno is unproven") is resolved — it imports cleanly once bundled, no shim needed — and a new finding, recorded below, is that Deno's module graph resolver does not add a `.ts` extension to an extension-less relative specifier, which is why bundling rather than a raw relative import is what makes `src/core` portable at all. A 2026-09-09 review found six defects, each fixed with verification: the bundle config was copying 2.9 MB of game art into `supabase/functions/` on every build (missing `publicDir: false`, confirmed by measuring 3.0 MB before the fix and 80 KB/one file after); the new import ban covered the `supabase/` directory but not the `@supabase/*` npm scope Step 7 will add as a dependency; the verification script compared serialized JSON text while the unit test compared parsed values, so a harmless key-order difference would fail one and not the other — both now compare structurally, with the stringify check demoted to an informational "identical values, differing key order" detail, reproduced live by reordering the fixture's keys and confirming the check still passes; a non-200 response from the portability check was retried up to 20 times even though it can only mean a deterministic failure, not a cold start — fixed to retry only on no response at all, timed live at 30 ms to fail instead of the prior multi-second loop; `vite.server-core.config.ts` was outside `tsconfig.json`'s `include`; and the CI job name/comment no longer described what the job does after this step extended it. |
| 7 — Add the Edge Function test harness | Validated by the user on 2026-09-09 | `deno-bin@2.1.4` (exact devDependency, matching the edge runtime's reported "compatible with Deno v2.1.4") gives `npm run test:server-unit` a real Deno test runner: `supabase/functions/_shared/http.test.ts`, `save-sync/index.test.ts`, and the new `whoami-check/index.test.ts` — 19 tests total — import each function's handler directly and run with zero `--allow-*` permission flags, proven pure by construction rather than by convention. `whoami-check` is Step 7's "trivial authenticated endpoint": `handleWhoAmI` takes caller resolution as an injected `ResolveCaller` collaborator, so the unit tests fake it out entirely, while the one real implementation, `resolveCallerViaSupabaseAuth` (`@supabase/supabase-js`, an exact-pinned `devDependency` — not `dependencies`, since nothing in `src/` imports it yet — whose Deno import specifier also pins that exact version rather than a floating `@2`, closing a version-skew risk a 2026-09-09 review found), is exercised only by `tests/server-integration/whoami.integration.test.ts` — a Vitest suite in its own `vitest.server-integration.config.ts`, kept out of `npm test`'s glob so it never runs without the live stack. `tests/server-integration/authFixture.ts` mints an HS256 JWT for the seeded fixture guest signed with the Supabase CLI's fixed local `JWT_SECRET`, fixing "the fixture pattern for an authenticated caller" the step's instructions ask for. `save-sync` and `core-portability-check` gained an `import.meta.main` guard around `Deno.serve(...)` (proven live: both still serve real requests after the change) so importing them for unit tests never starts a second listener; their duplicated response-envelope code moved to the new `supabase/functions/_shared/http.ts`. `scripts/verify-server-stack.mjs` runs the unit suite before the stack even starts and the integration suite once the database is reset and the stack is confirmed live — both from a clean `supabase db reset`, satisfying the step's test. A genuine bug surfaced while wiring the integration test rather than being assumed away: `supabase/seed.sql`'s fixture `auth.users` row left `confirmation_token`/`recovery_token`/`email_change_token_new`/`email_change` NULL, which GoTrue's row scanner cannot read as a string — any real call through Supabase Auth (`auth.getUser`) failed with a 500 `"Scan error ... converting NULL to string is unsupported"` that no earlier step had ever triggered, because Steps 4–6 only ever handed PostgREST a hand-signed JWT directly. Fixed by seeding those four columns as `''`, matching what GoTrue itself writes for a real sign-up; verified live via `curl` against `/auth/v1/user` before and after. A 2026-09-09 review found five further issues, four fixed before the gate: the dependency misplacement/version-skew above; `tests/unit/server-stack.test.ts`'s static invariants covered only `save-sync`, missing `whoami-check` entirely, now `it.each` loops reading `supabase/functions/` directly rather than one hardcoded file (the same fix Step 4's review applied to `EXPECTED_MIGRATIONS`), and the documented-commands test gained `test:server-unit`/`test:server-integration`; the integration suite's `beforeAll` warm-up declared 20 retry attempts at 1 s apart but reused a 20 s per-attempt timeout against a 30 s hook budget, arithmetically fitting only ~1.5 attempts, fixed with a dedicated 2 s warm-up timeout and a 70 s hook budget sized to the loop's real worst case. The fifth, no Edge Function handling CORS/`OPTIONS`, was recorded as finding F11 rather than fixed, since nothing calls a function cross-origin yet. That pass missed a sixth, more serious finding a follow-up review caught: `resolveCallerViaSupabaseAuth` answered a missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` with the identical `401 unauthenticated` a genuinely bad token gets, inverting the distinction `save-sync`'s own `probeDatabase`/`handleHealth` already established and protected with a unit test — a client that treats 401 as "sign out and re-authenticate" would sign every user out in a loop against a deployment that was simply misconfigured, and no test exercised the path because the local edge runtime always injects the environment. Fixed by making the resolver throw instead of returning `null`, so the existing `Deno.serve` catch converts it to `500 server_error` with no change to `handleWhoAmI` itself; guarded by a pure-handler test asserting a thrown resolver error propagates rather than resolving to 401, and a static-source assertion mirroring `save-sync`'s own — both mutation-proven, reverting the fix to `return null` failed only the static assertion, which is why it exists alongside the pure-handler tests rather than instead of them. |
| 8 — Anonymous guest session | Validated by the user on 2026-09-10 | `supabase/config.toml` flips `enable_anonymous_sign_ins` to `true` (the existing `anonymous_users = 30`/hour rate limit needed no change). `@supabase/supabase-js` is promoted from `devDependencies` to `dependencies`, exact-pinned at the same `2.116.0` `whoami-check`'s Deno import already used, because `src/platform/web/supabaseClient.ts`'s `createSupabaseClient()` is the first `src/` import of it — it returns `null`, attempting no network call, when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` is unset, so a checkout with no `.env.local` stays exactly as playable as before this step. `src/platform/web/guestSession.ts`'s `ensureGuestSession` mirrors `whoami-check`'s injected-`ResolveCaller` pattern with a narrow `GuestAuthClient` slice of `SupabaseClient['auth']` (`getSession`/`signInAnonymously`), faked by `tests/unit/guest-session.test.ts` rather than mocking the SDK; it never throws, resolving `signed-in`/`sign-in-failed`/`unconfigured` for every outcome including a rejected call or a disabled/unreachable auth service. `src/main.ts` constructs the client once and calls it without awaiting before `loadActiveGame`/`createGame` — identity resolution must never delay the first frame — and publishes the resolved result as a `DEV`-only `app.dataset.guestSession` diagnostic, the same `import.meta.env.DEV` convention `BootScene` already uses. Proving "two browsers receive different identities" needs a real GoTrue issuing real sessions, so a second, Docker-dependent Playwright suite joins the Docker-free `tests/e2e/`: `playwright.server-e2e.config.ts` (port 4176) and `tests/server-e2e/guest-session.spec.ts` cover a fresh browser holding a real anonymous session; every `**/auth/v1/**` request aborted still boots the game, with a forced `visibilitychange` flush (the same mechanism `tests/e2e/lifecycle-persistence.spec.ts` already drives) still reaching IndexedDB across a reload; and two fresh browser contexts receiving distinct `user.id`s whose access tokens, sent directly from the Node test process (no CORS concern), each answer only for themselves through the live `whoami-check` function. `scripts/verify-server-stack.mjs` runs `npm run test:server-e2e` after `test:server-integration`, reading `API_URL`/`ANON_KEY` from a live `supabase status --output json` into the spawned dev server's environment, so CI needs no `.env.local` and a developer's own file is untouched. `tests/unit/server-stack.test.ts`'s two `@supabase/supabase-js` pin assertions flipped from asserting `devDependencies` to asserting `dependencies`. One empirical finding surfaced rather than being assumed: `enable_anonymous_sign_ins` is read by the GoTrue container at boot, not by `supabase db reset` — a stack already running from before the config edit still answered `anonymous_provider_disabled` (confirmed directly via `curl` against `/auth/v1/signup`) until fully stopped and restarted; a genuinely clean checkout never hits this. `CLAUDE.md` and `README.md` both asserted "nothing in `src/` makes a network call," corrected in the same change. A 2026-09-09 review found ten issues, six fixed before the gate: `.github/workflows/ci.yml`'s `server` job had no Chromium installed for the new suite `verify:server` now runs (fixed with its own `npx playwright install --with-deps chromium`, plus a corrected name/comment and a 20→25 minute timeout bump); `playwright.server-e2e.config.ts`'s default `'html'` reporter would hang `scripts/verify-server-stack.mjs`'s `spawnSync` on any failure and collide with the main suite's report folder (switched to `'line'`, matching why the production/performance configs already avoid `'html'`); `callWhoAmI`'s retry loop broke on any response including a transient cold-start error and its budget could exceed the config's implicit 30 s test timeout (fixed to retry on `!response.ok` too, at 6 attempts under an explicit 60 s timeout); a static `@supabase/supabase-js` import cost +58 kB gzip on the entry chunk every boot parses first, contradicting this step's own "never delay the first frame" rule (`createSupabaseClient` now dynamically imports the SDK into its own on-demand chunk only once configured); and the documented-commands test was missing `test:server-e2e`. Two more applied as cleanups: the dev-only diagnostic dropped its published access token (the suite now reads it from the Supabase client's own `localStorage` entry instead), and the client promise is cached on `import.meta.hot.data` so HMR reuses one GoTrue instance instead of leaking a new one every reload. Two `ensureGuestSession` unit tests were added ahead of Step 9's identity linking. One pasted CI failure in an unrelated file (`production-stages.spec.ts`'s animation-speed test) was checked and confirmed unrelated to this step. `npm run verify:server` passes end to end from a clean `supabase stop`/`start`/`db reset` cycle including the fixed suite, and the full client gate (398 unit tests, 42 E2E, strict build, secret scan, 9 production smoke) passes after the fixes. A follow-up review caught an eleventh finding: the dynamic-import fix made `createSupabaseClient` reject-capable (a flaky network or a stale chunk hash after redeploy), and `src/main.ts`'s promise chain had no `.catch`, so a rejection reached an unhandled rejection past `ensureGuestSession`'s own try/catch, which only covers its internal collaborator calls. Fixed with one `.catch` folding any rejection into `sign-in-failed`; a new production-smoke test blocks the SDK's own lazy chunk (`**/assets/dist-*.js`) against the real built bundle and asserts no `pageerror`, mutation-proven against the pre-fix code. Final: 401 unit tests, 42 E2E, 10 production smoke, `npm run verify` exits 0, `npm run verify:server` all pass. A third review pass caught a twelfth finding in the eleventh's own fix: that production-smoke test was a false green on CI, because a build without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` inlines both as `undefined`, makes `createSupabaseClient`'s guard constantly true, and lets the bundler eliminate the dynamic import — so no lazy chunk is emitted and the `dist-*` route matched nothing (reproduced: with the `.catch` removed it still passed in 4.3 s against such a build). The spec now identifies the chunk by contents rather than by a fragile rolldown-derived name, counts its aborts and asserts the count is non-zero, and `test.skip`s visibly when the build emitted no chunk; `tests/unit/server-stack.test.ts` gained three static-source assertions on `src/main.ts`'s bootstrap that carry the gate on every CI push with no Docker. Mutation-proven in all four combinations. |
| 9 — Profiles and row-level security | Implemented on 2026-09-10, awaiting validation | `supabase/migrations/20260910090000_profiles_signup_trigger.sql` adds `public.handle_new_user()` and its `on_auth_user_created` trigger, `after insert on auth.users` — the piece the Step 5 migration's own comment and the RLS matrix already named "the Step 9 sign-up trigger" without building. The table and its select/update-own-row policies already existed from Step 5; this step closes the one remaining gap, that nothing ever put a row there for a real sign-up. `security definer` plus `set search_path = ''` mirror `public.set_updated_at()`'s existing hardening and are load-bearing, not decorative: GoTrue inserts `auth.users` rows as `supabase_auth_admin`, a role with no privilege on `public.profiles`, so an invoker-rights trigger would fail the very insert it exists to react to; running as the function's owner (`postgres`, which owns `profiles` and is never subject to `FORCE ROW LEVEL SECURITY`) is what lets it insert at all. `supabase/seed.sql`'s fixture guest now gets its `profiles` row from this trigger rather than a hand-written insert, which would otherwise collide on the primary key; its `display_name` is set with an `update` afterward instead. Both schema-documentation copies (`memory-bank/architecture.md`, `memory-bank/techContext.md`) gained the identical trigger DDL in the same change, confirmed byte-identical by direct diff, and their RLS-matrix `profiles` insert cell now names the trigger instead of forward-referencing this step. The new integration test, `tests/server-integration/profiles-rls.integration.test.ts`, is Step 9's own required evidence: it signs in two independent real anonymous identities through live Supabase Auth (`signInAnonymously()`, the same call `src/platform/web/guestSession.ts` makes) and, with real bearer tokens against the live PostgREST endpoint — not a hand-signed token for an id nothing backs — proves the trigger alone created each profile row, that a user can select and update their own row, and that user A cannot select, insert into (using B's real, FK-satisfying id, isolating RLS denial from a foreign-key rejection), update, or delete user B's row. Mutation-proven live rather than only asserted: dropping `on_auth_user_created` from the running database (leaving the migration file untouched) failed five of the seven new tests by name — the trigger's absence surfaced as an absent profile row, which the select/update/verify assertions built on top of it then caught — and reapplying the migration via `supabase db reset` turned all thirteen integration tests (the six existing `whoami-check` tests plus these seven) green again. `npm run verify:server` passes end to end from a clean `supabase stop`; the unaffected client gate (401 unit tests, lint, strict build) was re-run directly rather than assumed unchanged. |
| 10–37 | Not started | Blocked by the Step 9 gate. |

## Definition of Done

The milestone is complete when all 37 validations pass; a guest can play
instantly and later attach Google, Apple, or Telegram without losing progress; a
guest who loses local storage can recover through a recovery code; a save
restores across devices; the server rejects every attack in the Step 26 suite;
leaderboard entries derive only from verified saves; account deletion is complete
and tested; a restore drill has been performed; and all documentation, including
both copies of the database schema, reflects the delivered state.

## Open questions

These were asked at kickoff. **None was answered by the user; all eight now carry
a recorded assumed default**, written in Step 1's deliverable,
`memory-bank/server-threat-model.md` §7. Each remains open in the sense that the
user may overturn it; none blocks its step any longer. §10 of that document
states what overturning each one costs.

| Question | Recorded default | Steps |
|---|---|---|
| Expected scale and infrastructure budget | Prototype scale: 10k accounts, 1k DAU, 20 uploads/s peak; Supabase Free → Pro | 3, 36 |
| Primary player regions and data-protection obligations | Vietnam/SEA primary, Singapore region; assume GDPR applies, so Step 25 collects no fingerprint signal at all | 3, 25, 33 |
| Whether Telegram ships in this milestone | Yes, at Step 12, explicitly cuttable — and Step 12 gains a Mini App host prerequisite it did not have (finding F1) | 12 |
| Whether real money is ever taken | No, none in this milestone; this sets the Step 23 tolerance direction | Phases 4, 6 |
| Existing domain, cloud accounts, and CI | None exist (verified: GitHub remote, no CI, no CSP). Step 2 therefore may **not** assume a first-party cookie | 2, 4, 5 |
| Who operates the server after delivery | The repository owner, sole operator; RPO 24 h, best-effort RTO | 34, 35 |
| Whether existing local saves must survive | Yes — Step 20 is mandatory | 20 |
| Minimum player age and email retention | Not knowingly offered under 16; no age gate built; no email column in `profiles` | 9, 33 |

Step 1 also audited all 37 steps for assumptions the plan relied on without
recording them, and found nine (F1–F9 in §8 of that document): the missing
Telegram Mini App host (Step 12), the unproven Deno import of
`break_infinity.js` (Step 6), the unstated modelling rule behind Step 23's upper
bound, the requirement that Step 22 change the authoritative clock without
changing the economy, the absence of any XSS/CSP step, the unspecified cloud
upload cadence that drives cost and rate limits (Steps 2, 19, 25, 36), the Apple
Developer Program membership and verified domain that Step 11 needs and the
budget did not contain, the seven-day observation window Step 21's measurement
actually requires, and the absence of any concrete entitlement for Step 31 to
grant. **F5, the missing XSS/CSP step, is the one item left genuinely open**,
because closing it means adding a step and that is the user's decision.

## Related open item outside this plan

The seven-day storage cap already affects the shipped client-only build: a player
on iOS Safari who does not open the game for seven days of Safari use loses their
save entirely, because both the Dexie database and the lifecycle journal are
script-writable storage. Step 21 fixes this for players who have a server account,
but that is the end of this milestone, not the beginning. Whether to address it in
the shipped build first, as a separate base-game fix, is undecided.
