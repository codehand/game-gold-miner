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

## Definition of Done

The milestone is complete when all 37 validations pass; a guest can play
instantly and later attach Google, Apple, or Telegram without losing progress; a
guest who loses local storage can recover through a recovery code; a save
restores across devices; the server rejects every attack in the Step 26 suite;
leaderboard entries derive only from verified saves; account deletion is complete
and tested; a restore drill has been performed; and all documentation, including
both copies of the database schema, reflects the delivered state.

## Open questions

These were asked at kickoff and are not yet answered. Each blocks the step named.

- Expected scale and infrastructure budget — Steps 3, 36.
- Primary player regions, for latency, data-protection obligations, and the
  consent position in Step 25 — Steps 3, 25, 33.
- Whether Telegram ships in this milestone or later — Step 12.
- Whether real money is ever taken, which sets how much anti-cheat is worth —
  Phases 4 and 6.
- Existing domain, cloud accounts, and CI — Steps 4, 5. The domain question also
  decides whether the first-party cookie option in Step 2 is available.
- Who operates the server after delivery — Steps 34, 35.
- Whether existing local saves must survive — Step 20.
- Minimum player age and email-retention rules — Steps 9, 33.

## Related open item outside this plan

The seven-day storage cap already affects the shipped client-only build: a player
on iOS Safari who does not open the game for seven days of Safari use loses their
save entirely, because both the Dexie database and the lifecycle journal are
script-writable storage. Step 21 fixes this for players who have a server account,
but that is the end of this milestone, not the beginning. Whether to address it in
the shipped build first, as a separate base-game fix, is undecided.
