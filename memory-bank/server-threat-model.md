# Server Milestone — Threat Model and Decision Register

## Purpose

This document is the Step 1 deliverable of `memory-bank/server-milestone-plan.md`.
It records three things, and nothing in the server milestone may contradict it:

1. The threat model — what an attacker controls, what each capability is worth,
   and what this milestone does and does not defend.
2. The kickoff decision register — every question raised when the milestone was
   planned, each marked **decided** or **open with a recorded default**.
3. The assumption audit — assumptions the plan's steps depend on that were not
   written down anywhere, each now given a recorded default.

No server code exists. This step changed no code, no balance value, and no
schema version.

## Status

| Field | Value |
|---|---|
| Plan | `memory-bank/server-milestone-plan.md` |
| Step | 1 of 37 — Record scope, threat model, and open questions |
| Date | 2026-09-08 |
| Gate | Awaiting user validation. Step 2 must not begin before it. |

## 1. What is being protected

Ranked by what its loss actually costs. This ranking is what makes the
tolerance decision in Step 23 answerable.

| Asset | Loss looks like | Severity |
|---|---|---|
| A player's own progress | Save destroyed, reset, or overwritten by another device | **Highest.** It is the only thing the player has, and it is unrecoverable. |
| One player's data not reaching another | Player B reads or claims Player A's save | **High.** A trust failure, and a data-protection incident under §7.2. |
| Account ownership | An attacker presents a credential and receives someone's account | **High.** Enables the two above. |
| Leaderboard integrity | Fabricated scores rank above honest play | **Medium.** Reputational, not destructive. Bounded by §5.1 regardless. |
| Service availability | Uploads fail or the backend is exhausted | **Medium.** The client keeps playing offline by design (Step 19). |
| Server cost | Bulk account minting, upload floods, oversized bodies | **Medium.** Directly financial at the budget in §7.1. |
| Entitlement integrity | A client grants itself an entitlement | **Low today, high later.** No money is taken (§7.4); this matters only once it is. |

**Consequence for Step 23.** Because a player's own progress is ranked above
leaderboard integrity, and no revenue depends on the board (§7.4), the
re-simulation tolerance must be biased toward **accepting a slightly generous
save over rejecting an honest one**. A false positive costs the highest-ranked
asset; a false negative costs a medium-ranked one. Step 23 must state its
tolerance in those terms and Step 24 must leave a rejected player playable.

## 2. Attackers modelled

| # | Attacker | Motive | Capability assumed |
|---|---|---|---|
| A1 | The player, on their own game | Faster progress | Full control of their device, storage, bundle, and clock. Not hostile to others. |
| A2 | A competitive cheater | Leaderboard rank | A1's control plus scripted play and direct API calls. |
| A3 | An opportunist against other players | Another account's save | Network access, a valid account of their own, and any credential they can obtain. |
| A4 | A bulk/automated attacker | Cost, noise, scraping | Unlimited anonymous sign-ups, high request volume, forged payloads. |

Not modelled, and out of scope for this milestone: a state-level adversary, a
Supabase insider or platform compromise, a malicious npm/Deno dependency,
physical theft of an unlocked device, and coercion of a player into revealing a
recovery code.

## 3. Trust boundaries

```
UNTRUSTED                          |  TRUSTED
-----------------------------------+-----------------------------------
Browser: bundle, IndexedDB,        |  Supabase Auth (token issuer)
localStorage, device clock,        |  Edge Function under service role
every HTTP request and header,     |  Postgres + RLS
every field of an uploaded save    |  Server received-at timestamp
```

Three rules follow, and every step inherits them:

- **A save document is data, never instructions.** It is migrated and validated
  before a single field is read (Step 16).
- **A client-supplied timestamp is never an input to a reward.** Only the
  server's own clock is (Step 22).
- **A client-side check is advisory.** Affordability, caps, drag rejection, and
  every guard in `src/game` exist for the honest player's benefit and prove
  nothing to the server.

## 4. Attacker capabilities

### 4.1 Local storage — IndexedDB and localStorage

**Control.** Total. The player can read, edit, replace, or delete
`cat-mine-idle` (object store `saves`, fixed key `active`) and
`cat-mine-idle:lifecycle-save-v1` from the browser console, and hand the client
any document that passes local validation — including one with `state.gold` at
`1e300`.

**Worth.** Complete freedom over the local game. Once the milestone lands, it is
also the first thing uploaded, so it is the primary injection point into the
server.

**Defended by.** Step 16 migrates and validates every uploaded document through
the same `migrateSaveDocument`/`validateSaveDocument` chain the client uses.
Step 23 (**implemented 2026-09-14**) bounds the monotonic cumulative counters —
and the upgrade/unlock spend — against server-measured elapsed time via the pure
`evaluateProgressBound`, using the candidate's own rate model held for the whole
interval. Step 15 makes the Edge Function the only writer, so an edited
local document cannot reach Postgres unexamined.

**Not defended.** An unlinked guest editing their own offline game. This is
accepted: it reaches no leaderboard (Step 28 publishes only from validated
saves), affects no other player, and defending it is impossible without taking
the simulation off the client entirely — which was considered and not chosen.

**Already true today.** This capability exists in the shipped client-only build.
The milestone does not create it; it creates the first place where it matters.

### 4.2 The client bundle

**Control.** Total. Every line is readable, every constant extractable, the
running code patchable, and the API callable directly with a valid token.

**Worth.** No secret shipped to the browser is a secret. The Supabase anon key
is public by design and safe only because RLS assumes it is known. The
service-role key would be catastrophic there.

**Defended by.** Step 4's test greps the built `dist/` for the service-role key
and any non-public secret. Step 12 keeps the Telegram bot token server-side and
tests that it appears in no client-reachable artefact. Steps 15/16/23 re-decide
server-side everything the client claims.

**Not defended.** Local gameplay modification, and any expectation that
client-side balance logic is enforcement. It is not.

### 4.3 The device clock

**Control.** Settable arbitrarily forward, backward, or mid-session.

**Worth.** Concretely, against the build that exists today: offline income is
`savedRate × creditedSeconds × 0.5`, capped at 7,200,000 ms. `Date.now()` is
read in `src/main.ts` and is the player's clock. Jumping it forward mints one
capped claim; repeating the jump repeats the claim. The 2-hour cap and 50%
efficiency bound the size of each theft, not the number of them.

**Defended by.** Step 22 — elapsed time is computed from the stored server
received-at to the server's own now, and the credited amount is the server's.
**Implemented 2026-09-14:** `GET /v1/save` returns the server-computed
`offlineGrant`; the device clock is never an input. Step 26 tests clocks ahead,
behind, and moving backwards.

**Not defended, and deliberately.** The client's *displayed* projection may
still be derived locally so the screen is not blocked on the network. It is
cosmetic; the credited figure is the server's.

**Ordering note.** Nothing before Step 22 defends this. Steps 15–21 ship a cloud
save that faithfully stores clock-derived income. That is acceptable only
because §7.4 records that no money is at stake, and it must not be presented as
anti-cheat before Step 22 lands.

### 4.4 HTTP requests

**Control.** Replay, reorder, drop, forge, fuzz, and flood — all with a legitimately
issued token for their own account.

**Worth.** The entire server attack surface. Everything else in this section is
a way of choosing what to put in a request.

**Defended by.** Authentication on every endpoint; the optimistic-concurrency
token from Step 2 against replay and rollback; Step 15's RLS denial of every
direct client write to `saves`; Step 25's rate limits and pre-parse size cap;
Step 26's adversarial suite, which must fail if any single server-side guard is
removed.

**Not defended.** A player who simply never uploads. They keep a local game;
nothing is lost that was ever the server's.

### 4.5 Their own session credential

**Control.** The guest session token lives in script-writable browser storage
(§7.5 records that a first-party HttpOnly cookie is not available by default).
It is readable by any script running on the origin and by anyone with the
unlocked device.

**Worth.** Full takeover of exactly one account — which is the highest-ranked
asset in §1.

**Defended by.** Step 14's recovery-code rotation, which invalidates a prior
code; Step 32's audit log, which makes a takeover visible after the fact;
Step 25's throttling of redemption attempts.

**Not defended — recorded as finding F5.** An XSS flaw in our own bundle defeats
this completely, and the plan contains no step for a Content Security Policy,
dependency-integrity checking, or output-escaping review. `index.html` sets no
CSP today. See §8. Output escaping is now handled by construction in
`src/ui/` (no `innerHTML` anywhere in `src/`, 2026-09-10); the CSP and
dependency-integrity halves of F5 remain unaddressed.

### 4.6 Multiple identities

**Control.** Anonymous sign-in is unauthenticated and unlimited by design
(Step 8) — that is what makes a guest playable in the first frame.

**Worth.** Leaderboard stuffing, row growth, and cost.

**Defended by.** Step 25, weakly, through per-address rate limits, and
optionally through fingerprint-derived signals used *only* as one weak input.

**Not defended.** A determined attacker with many addresses. Accepted at the
scale recorded in §7.1.

## 5. What this milestone does not defend

Recorded so none of these is discovered late and mistaken for a defect.

1. **Optimal-play bots on the leaderboard.** Validate-on-save bounds the rate,
   not the decisions. The top of the board converges on perfect play, which a
   script reaches and a human does not. Already recorded in the plan; repeated
   here because §1 ranks the board below progress, which is why it is tolerable.
2. **An unlinked guest cheating their own local game.** §4.1.
3. **Anything before its own step lands.** Most sharply the device clock (§4.3),
   undefended until Step 22.
4. **Platform compromise.** Supabase itself, its operators, and its availability.
5. **Supply chain.** npm and Deno dependencies are trusted as installed.
6. **XSS and session theft.** No step covers it — finding F5.
7. **Network-layer denial of service.** Application-level limits only (Step 25);
   volumetric defence is the platform's.
8. **Payment fraud.** No payments exist (§7.4). Step 31 is groundwork only.
9. **Device theft and social engineering of a recovery code.**

## 6. Standing rules every step must preserve

Violating any of these invalidates Phase 4 regardless of what the step's own
test asserts.

- The client never writes `saves` directly. The Edge Function under the service
  role is the only writer, and RLS denies the rest (Step 15).
- No service-role key, bot token, or non-public secret is ever in the client
  bundle, the repository, or a log.
- A save document is validated before any field is read.
- Elapsed time comes from the server clock only.
- `src/core` learns nothing about the network. The existing purity rules and
  `tests/unit/architecture.test.ts` continue to hold (Steps 6, 19).
- The server runs the same `src/core` the client runs. Not a copy — a copy
  drifts, and every anti-cheat guarantee assumes it did not (Step 6).
- No accepted branch of any conflict or rejection path destroys progress the
  player was not shown (Steps 13, 18, 24).

## 7. Kickoff decision register

Every question raised at planning. **None was answered by the user**; all eight
carry a recorded default, chosen conservatively so that being wrong costs a
documentation edit rather than rework. The user may overturn any of them at the
Step 1 gate, and §10 says what that costs.

### 7.1 Expected scale and infrastructure budget — Steps 3, 36

**Status:** open — default recorded.
**Default:** Prototype scale. Up to 10,000 registered accounts, 1,000 daily
active players, and 20 save uploads per second at peak. Supabase Free for
development and Pro (~USD 25/month) at launch. The Apple Developer Program
line this budget once carried (~USD 99/year, finding F7) **no longer applies**:
Step 11 was cut on 2026-09-11, exercising F7's own contingency. A domain
registration would still apply if the §7.5 default is overturned. No dedicated
infrastructure, no read replicas, no Redis.
**Consequence:** Step 3 sizes indexes for ~10⁴ rows, not 10⁷. Step 36's load
target is 50 concurrent uploads at p95 < 500 ms, including re-simulation of a
two-hour absence.
**If wrong:** A larger scale changes indexing, connection strategy, and the
Step 36 budget. It does not change any Phase 2–4 design.

### 7.2 Player regions and data-protection obligations — Steps 3, 25, 33

**Status:** open — default recorded.
**Default:** Primary audience Vietnam and South-East Asia; Supabase region
Singapore for latency. The build is a public website, so assume it is reachable
from the EU and **treat GDPR as applying**. Vietnam's PDPD (Decree 13/2023) is
assumed to apply to the primary audience.
**Consequence:** Step 25 collects **no** fingerprint-derived signals by default,
relying on address and behavioural rate limits only — this avoids the consent
question entirely and is the cheaper path. Step 33 implements deletion to the
stricter standard. Step 3 stores the minimum personal data that identity
requires.
**If wrong:** A confirmed non-EU-only audience would permit the fingerprint
signal in Step 25 and relax Step 33's scope. Neither is on any critical path.
**Not legal advice.** The operator (§7.6) must confirm the legal position before
launch; this is an engineering default, not a compliance sign-off.

### 7.3 Whether Telegram ships in this milestone — Step 12

**Status:** open — default recorded.
**Default:** Telegram sign-in **stays in this milestone at Step 12, and is
explicitly cuttable.** Steps 8–11 and 13–14 do not depend on it.
**Consequence, and this is the part that was not written down (finding F1):**
Step 12 verifies `initData` and mints a session, but `initData` only exists
inside a Telegram Mini App host. `src/platform/` contains only `web/`; there is
no `telegram/` adapter and no Mini App shell anywhere in `src/`, and the base
game deferred Telegram integration entirely. **Step 12 therefore acquires a
prerequisite:** a minimal Telegram Mini App host that loads the existing bundle
and exposes `initData`. That prerequisite is part of Step 12's cost and must be
in its instructions before it starts.
**If wrong:** Cutting Telegram removes Step 12 whole and changes nothing else.
**Implemented 2026-09-11 without that prerequisite ever being built** — see
F1's resolution note above: `initData` verification needs no real Telegram
infrastructure to prove, only the Mini App host (still unbuilt) needs it,
and the host is not required for Step 12's own test.

### 7.4 Whether real money is ever taken — Phases 4 and 6

**Status:** open — default recorded.
**Default:** **No real money in this milestone, and none planned within it.**
No payments, no store, no prices, no premium currency. Step 31 establishes only
that an entitlement is server-held and server-checked.
**Consequence, and it is load-bearing:** anti-cheat is worth *protecting the
player's own progress and a credible leaderboard*, not *protecting revenue*.
This is what sets the Step 23 tolerance direction in §1 and what makes the
Step 22 ordering gap in §4.3 tolerable.
**If wrong:** Taking money raises the value of every Phase 4 guarantee, makes
the §4.3 ordering gap unacceptable, and pulls Step 22 earlier. It also adds
tax, refund, and receipt-verification obligations that this plan does not
contain.

### 7.5 Existing domain, cloud accounts, and CI — Steps 4, 5, and the Step 2 cookie option

**Status:** **partly decided by inspection**, remainder defaulted.
**Verified in the repository, 2026-09-08:** the git remote is
`https://github.com/codehand/game-gold-miner.git`; there is **no** `.github/workflows`
and no CI configuration of any kind; `index.html` sets no Content Security Policy.
**Default:** No domain is registered, no Supabase organization exists, and no CI
exists.
**Consequence:** Step 2 must **not** assume a first-party HttpOnly cookie is
available — it specifies the token-in-script-writable-storage path, and records
the cookie as an upgrade unlocked by registering a domain and serving an
endpoint on it. *(Decided in Step 2 as D1. Step 2 §8 also found the consequence
this default carries: because the session token and the local save are both
script-writable storage, iOS Safari's seven-day sweep takes both at once, so for
an unlinked guest the Step 14 recovery code — not cloud save — is what makes
Step 21's promise true.)* This is also what makes §4.5 and the seven-day storage cap bite.
Step 4 begins by creating the Supabase organization. Step 5 creates CI from
nothing; GitHub Actions is the default, since the remote is GitHub.
**If wrong:** A domain becomes available → revisit Step 2's cookie decision
before Step 8 ships, because changing where the session lives after guests hold
sessions is a migration, not an edit. Checked at Step 8 (2026-09-09): still no
domain registered, so this default stood unrevisited.

### 7.6 Who operates the server after delivery — Steps 34, 35

**Status:** open — default recorded.
**Default:** The repository owner, as sole operator. No on-call rotation, no
paging, no availability commitment.
**Consequence:** Step 34's restore drill is a documented manual procedure with
RPO 24 hours (daily backup) and best-effort RTO. Step 35's alerts go to one
channel the operator actually reads; alert volume must be low enough that they
keep reading it.
**If wrong:** A team or an SLO changes Step 35's alerting design and Step 34's
drill cadence. Nothing earlier.

### 7.7 Whether existing local saves must survive — Step 20

**Status:** open — default recorded, and the default is *yes*.
**Default:** Existing version-1 IndexedDB saves **must** survive first sign-in
and be adopted as the player's cloud save.
**Rationale:** it costs one step that is already scoped; `saveSchema.ts` already
migrates and validates exactly this document; and the alternative silently
destroys the highest-ranked asset in §1, which every other part of this plan
refuses to do.
**If wrong:** Confirming that no real player data exists makes Step 20 optional.
Nothing else changes.

### 7.8 Minimum player age and email retention — Steps 9, 33

**Status:** open — default recorded.
**Default:** The game is not knowingly offered to children under 16. No age gate
is built in this milestone. `profiles` stores no email; whatever Supabase Auth
holds for an OAuth identity is the only email in the system. Retention is the
life of the account plus 30 days after a deletion request, matching Step 33.
**Consequence:** Step 9 keeps the profile row minimal — no email column, no
birth date. Step 33 covers Auth-held data as well as application tables.
**If wrong, and this one is the likeliest to be wrong:** a cat-themed idle game
plausibly attracts under-16 players. If the audience includes them, GDPR
Art. 8 and Vietnam's Decree 13/2023 both require guardian consent handling that
this plan does not contain, and that is a scope addition rather than an edit.
Flagged for the operator's explicit confirmation.

## 8. Assumptions the plan depended on but did not record

Step 1's test requires that no step's instructions rest on an unrecorded
assumption. Auditing all 37 steps against §7 found nine, listed below and traced
step by step in §9. Eight now carry a recorded default; F5 is left open because
closing it means adding a step. Each names the step whose instructions must
absorb it before that step begins. Two more, F10 and F11, were not found by
this audit — both surfaced empirically while implementing Steps 6 and 7,
which is exactly the kind of gap an audit of *stated* assumptions cannot
catch, and both are recorded here with the same numbering rather than in a
separate list.

**F1 — Step 12 presumes a Telegram Mini App host that does not exist.**
Recorded in §7.3. Step 12 gains an explicit prerequisite.
**Scope boundary held, 2026-09-11 — the host is still separate, later work,
and Step 12 does not need it to satisfy its own test.** Unlike the other
finding this same audit missed, `initData` verification is self-contained
HMAC-SHA256 — the server never contacts Telegram to check it — so the
"highest-risk" part of Step 12 (verify, reject tampered/stale/wrong-bot-token,
mint a session) is provable end-to-end against the real local stack using
hand-signed test vectors under a fixture bot token, with no real bot, no
Mini App host, and no tunnel. `readTelegramInitData()`
(`src/platform/telegram/telegramSignIn.ts`) always resolves `null` until a
real host exists (no `<script src="https://telegram.org/js/telegram-web-app.js">`
was added to `index.html` — that is the host itself, deliberately not built
here), so this finding's prerequisite remains open and un-built, exactly as
recorded; what changed is only that Step 12 no longer needs it resolved
first, the way Step 11 needed §7.5 resolved before it could start at all.

**F2 — Step 6 presumes `break_infinity.js` is consumable from Deno.**
Every anti-cheat guarantee rests on the server running the identical `src/core`,
and `src/core/numbers/GameNumber.ts` is the single file importing it. The
installed package is version 2.2.0 with `main: dist/break_infinity.common.js`
(CommonJS) and `module: dist/break_infinity.esm.js`; it declares no `type`
field. Deno's npm specifier support makes this very likely to work and it is
not proven.
**Resolved at Step 6, 2026-09-08 — it imports cleanly, once bundled.** Step 6's
first action was exactly this proof, on the real local edge runtime rather than
a standalone script: `GameNumber`, and every other symbol `src/core`,
`src/config`, and `src/persistence/saveSchema.ts` export, run inside
`supabase/functions/core-portability-check` and reproduce a ten-minute
simulation byte-for-byte against the client. No shim was needed — see F10,
which is the reason bundling turned out to be the mechanism rather than an
import map, and which made the shim question moot.

**F10 — Deno's module resolver does not add a `.ts` extension to an
extension-less relative specifier, discovered while implementing Step 6.**
`src/core/index.ts` and its siblings write relative imports the way the rest of
the codebase always has — `from './economy/calculateProductionRates'`, no
extension — because `tsconfig.json`'s `"moduleResolution": "bundler"` (and
Vite/Rolldown at build time) resolve that unambiguously. Deno's own graph
builder does not: pointing an Edge Function at `src/core/index.ts` directly
failed to boot with `Module not found "file:///…/src/core/economy/
calculateProductionRates"`, reproduced identically through both `supabase
functions serve` and the real `supabase start` edge runtime. Deno's "sloppy
imports" unstable feature is designed for exactly this gap, but a `deno.json`
enabling it — tried at the project root and inside the function's own
directory — was not honoured by the bundled Supabase edge-runtime
(`supabase-edge-runtime-1.74.3`, Deno v2.1.4); `supabase functions serve
--import-map` did not help either, since sloppy-imports is a `deno.json`
`"unstable"` entry, not an import-map key. This blocks *any* unmodified
multi-file `src/core` import into this specific runtime, independent of
`break_infinity.js` entirely — a strictly earlier and harder blocker than F2.
**Resolution:** bundle rather than import raw. `npm run build:server-core`
(Vite library mode, `vite.server-core.config.ts`) compiles
`supabase/functions/_shared/coreBundleEntry.ts` — a zero-logic re-export of the
three portability targets — into one dependency-free ES module with every
specifier already resolved, including `break_infinity.js` inlined by the same
resolution the client bundle already relies on. The Edge Function imports that
one generated file, which has no extension-less specifier left to resolve. The
bundle is regenerated before every `npm run verify:server` run and is
git-ignored, so it is a build artifact rather than a maintained copy — it
cannot drift from source the way a hand-forked port of `src/core` could,
because there is nothing hand-written in it to drift.

**F11 — no Edge Function handles CORS or `OPTIONS`, noticed while implementing
Step 7's `whoami-check`.** Every function today answers `malformed_request` /
400 for any method it does not explicitly recognize, `OPTIONS` included, and
neither `memory-bank/server-save-sync-protocol.md` nor any Phase 1 step
mentions a CORS policy. This is not yet a defect: nothing calls any function
directly from a browser context that would trigger a preflight — Step 8's
anonymous sign-in goes through the Supabase Auth client SDK against the Auth
service, which Supabase already configures, not against a function in this
repository. **Default:** the first step whose own client code calls a
function in `supabase/functions/` directly from `src/` (concretely, Step 16 or
17's save download/upload — `whoami-check` itself is server-side test
scaffolding, never called from the browser) must add an explicit CORS
policy — allowed origins, headers, and an `OPTIONS` handler answering before
the §4 envelope's method check runs — as part of its own instructions, and
record the decision in the protocol document rather than each function
inventing its own.
**Triggered by Step 12, 2026-09-11, not Step 16/17 as guessed.** Telegram
sign-in is the first function `src/` calls directly with `fetch()` — save
upload/download still don't exist. `supabase/functions/_shared/http.ts`
gained `corsHeaders`/`corsPreflightResponse`, allow-listing the two known
dev origins; `memory-bank/server-save-sync-protocol.md` records the policy,
per this finding's own instruction. See **F12** immediately below for what
was discovered while proving it against the real local stack.

**F12 — the local Kong gateway overrides every Edge Function's
`Access-Control-Allow-Origin` with a wildcard, discovered empirically while
integration-testing Step 12's CORS handling.** `corsHeaders()` reflects only
the two allow-listed dev origins and omits the header entirely for anything
else — proven correct in isolation by
`supabase/functions/_shared/http.test.ts` and
`telegram-sign-in/index.test.ts`, neither of which goes through the real
network stack. Against the live local stack, though,
`curl -X OPTIONS .../telegram-sign-in -H 'origin: https://totally-unlisted-origin.example'`
still returns `Access-Control-Allow-Origin: *` — and so does the same
request against `whoami-check`, a function that sets no CORS header of its
own at all. The local Kong gateway (`Via: kong/2.8.1` on every response)
unconditionally injects the wildcard onto any Edge Function response whose
request carries an `Origin` header, running *after* the function and
overwriting whatever specific-origin value it computed. This is Supabase
CLI 2.117.0's own platform behavior, not a bug in this repository's code,
and not something `supabase/config.toml` exposes a setting for.
**Consequence:** the origin restriction `corsHeaders()` implements is
real and tested at the application layer, but is not what a real browser
calling the live local stack today actually observes — `*` is, regardless
of which origin asks. `tests/server-integration/telegram-sign-in.integration.test.ts`
asserts the header a browser would actually accept (`*` or the specific
origin, either satisfies a real preflight check) rather than a claim this
platform does not keep locally. **Open:** whether a real hosted Supabase
deployment's Edge Function gateway has the same unconditional wildcard, or
whether that is unique to `supabase start`'s bundled local Kong config, is
unverified — no deployment exists yet (§7.5). Re-verify once one does,
before relying on `corsHeaders()`'s own restriction as the sole defense for
any future function where the calling origin actually matters.

**F13 — CRITICAL, found in review 2026-09-12: the Telegram placeholder
email is pre-account-stealable through public email signup.**
`telegram-sign-in` maps a Telegram user to the deterministic
`auth.users.email = telegram-<id>@telegram.invalid` and relies on
`admin.generateLink` to find-or-create that row — but `supabase/config.toml`
had `[auth.email] enable_signup = true` with `enable_confirmations = false`,
and Telegram user ids are public/enumerable. An attacker who knows a
Telegram id could `POST /auth/v1/signup` with that exact email and a
password of their own choosing *before* the real user ever signs in;
`enable_confirmations = false` lets that signup complete immediately, since
nothing needs to be delivered to the unreachable `.invalid` address.
`generateLink` would then find the attacker's row already sitting at that
email and hand the real Telegram user a session into the attacker's own
account — who keeps password access to it indefinitely. Reproduced live
end to end against the running stack (attacker signup → 200; a real
`telegram-sign-in` for that same Telegram id → the identical `auth.users`
id; attacker password login afterward → still the same id) and again
independently by this agent before touching anything. Once Step 15 lands
`saves`, this is a persistent read/write compromise of that player's
progress, not merely an account-naming collision.
**Verification code was not the defect** — `verifyTelegramInitData` and the
HMAC check are correct. The hole is that the `auth.users` namespace the
verification code addresses (by deterministic email) is writable by a
second, unauthenticated, unrelated path this milestone never intended as an
identity mechanism.
**Fixed:** `[auth.email] enable_signup = false`. Nothing in this codebase
calls `signUp`/`signInWithPassword`, so this costs nothing; `admin.generateLink`
and `auth.verifyOtp` are admin/OTP paths this flag does not gate — confirmed
live (`test:server-unit`, `test:server-integration`, and `test:server-e2e`
all still pass with it set, and the Telegram sign-in flow works unchanged).
**Consequence for any future email-based feature:** re-derive this analysis
before ever re-enabling `enable_signup` — the risk is specific to a
provider that addresses `auth.users` by a *derivable* email another path can
also reach, which email/password signup always can once it is open.
**Not yet fully closed for every future case:** this fix protects the
*current* deterministic mapping. A future feature minting deterministic
placeholder identities under any other reachable namespace (a second
provider, a different placeholder domain) must re-verify that no other
signup path can write to that same namespace first, rather than assuming
this one fix generalizes.

**F13 re-derivation for Step 14's `recovery.invalid` placeholder (recorded
2026-09-13, analysis performed 2026-09-12 alongside Step 14's own
implementation):** `mintSessionForUserViaGenerateLink` assigns
`recovery-<user_id>@recovery.invalid` under the identical
`admin.updateUserById(..., {email_confirm: true})` pattern F13 already
flagged for Telegram, so this is exactly the "future feature... under any
other reachable namespace" case the paragraph above requires re-verifying
rather than assuming closed. The re-derivation passes:
- `[auth.email] enable_signup = false` is a single, domain-agnostic
  configuration flag — it disables `POST /auth/v1/signup` for *every* email,
  not only `*@telegram.invalid` — so the exact "second, unauthenticated,
  unrelated path" F13 identified is already closed for `*@recovery.invalid`
  too, with no additional change needed.
- The namespace itself is a materially harder target than Telegram's:
  `<user_id>` is the account's own `auth.users.id`, a random v4 UUID
  (122 bits of randomness), not a small, public, sequential-ish Telegram id.
  Even if public signup were ever re-enabled for an unrelated reason, an
  attacker would first need to already know the specific victim's UUID —
  not published anywhere this milestone exposes — to target the correct
  address at all.
- The placeholder is only ever *assigned* after
  `redeemRecoveryCodeViaServiceRole` already succeeded — i.e. after the
  caller already produced the correct 128-bit recovery-code plaintext. A
  caller who can reach that assignment at all already holds a credential
  stronger than anything Telegram's own placeholder ever required to be
  compromised in the first place.

No code or config change resulted from this pass — `enable_signup = false`
already covers Step 14 as a byproduct of the Step 12 fix. Recorded because
F13 explicitly asked for the re-verification in writing, not because the
verification found something new to fix.

**F3 — Step 23's upper bound has an unstated modelling rule.**
Bounding cumulative counters requires knowing what the mine *could* have
produced, which depends on which upgrades were bought and when — information the
server does not have between two uploads.
**Default:** the bound is computed against the most productive spending
reachable from the last accepted document over the elapsed interval. It is
therefore **loose by construction and biased toward acceptance**, which matches
the ranking in §1. Step 23 must state this rather than imply a tight bound.
**Implemented 2026-09-14, modelling rule stated:** `evaluateProgressBound`
re-derives the bound from the shared core's rate and cost functions applied to
the **candidate's final configuration** and held for the whole interval — no
ticks simulated, so it stays `O(floors)` inside the §7.1 upload latency budget.
Because levels only rise, that final-configuration rate is a genuine upper bound,
and a loose one (the player actually upgraded gradually). Each counter also
carries the material already in the pipeline at the interval's open (a floor's
in-flight cycle, its queue, the elevator's load, the warehouse's input queue),
because a proportional term is near-zero over a short interval while one cycle is
a fixed amount — without it a warm mine that simply kept playing is rejected
(review finding F1). It bounds each floor's
`totalExtracted`/`totalTransported` (transport capped by the shared elevator's
throughput), `warehouse.totalGoldDelivered`, `warehouse.totalOfflineGoldClaimed`,
and the total gold the levels and unlocks between the two documents required
(`state.upgradeSpend`) — never current `gold`, the same exclusion §7's progress
vector makes; the spend allowance uses one earning term, not the delivery and
offline allowances summed (review finding F5). Because §7 makes forks
first-class, when the tight bound (measured from the stored row) fails and the
row's one-generation ancestor exists, the check is retried against that ancestor
over the full interval — a `409` re-upload is a branch that diverged from the
ancestor, not a descendant of the row (review finding F2). `PROGRESS_BOUND_TOLERANCE = 0.05`
absorbs the fixed-step-vs-continuous-rate remainder;
`tests/unit/progress-bound.test.ts` pins it from both sides (over an interval
long enough that the rate term dominates the carried amount) so widening it
silently fails. A first upload is exempt (no last accepted document to bound
against), and a stored row whose document or `received_at` cannot be read skips
the check, so the server never rejects an honest save over its own unreadable row
(review finding F4). **Known limit (N1):** the ancestor anchor is one generation
deep, so an honest dominating fork older than roughly two minutes against an
actively-syncing peer is still rejected; the sound fix is to retain fork points,
which overlaps Step 24, and a server-side "accept any strict superset" exemption
was rejected because an inflating cheat submits supersets. Recorded in
`architecture.md`'s Step 23 section and `progress.md`'s known risks.

**F4 — Step 22 must not change the economy.**
Moving settlement server-side touches a balance rule the game is tuned around:
`savedEffectiveRate × creditedSeconds × 0.5`, capped at 7,200,000 ms, with a
future timestamp awarding zero — and the separate rule that a backgrounded open
tab is credited at full rate while a closed one is credited at 50%.
**Default:** Step 22 changes *which clock is authoritative* and nothing else.
The formula, the cap, the efficiency, and the open-tab/closed-tab distinction
are preserved exactly, and Step 22's test must pin the ratio the existing unit
tests pin. **Implemented 2026-09-14:** the client projection and the server
grant both call the one `calculateOfflineGrant`, so the formula cannot drift;
the client's F4-pinning ratio tests pass unchanged. **Tightened 2026-09-15:** the
credited reward is `min(serverGrant, localProjection)` (so a receipt that lags
play cannot credit open-tab time), a null or zero projection is treated as a
zero bound rather than an absent one, and the local projection is credited alone
only where no server figure can exist (unconfigured or `no-cloud-save`) — a
failed download *and* a failed sign-in against a configured backend credit
nothing, so neither dropping a request nor clearing the auth entry can hand the
clock cheat back.

**F5 — No step defends the session credential against XSS.**
The guest session token is the sole proof of save ownership (Step 8), it lives
in script-writable storage (§7.5), and `index.html` ships no Content Security
Policy. An XSS flaw hands over the highest-ranked asset in §1.
**Default:** recorded as an accepted, *known* gap for this milestone rather than
silently absent (§5.6). A CSP and a dependency-integrity check are the obvious
remedy and belong in a step; adding one is a scope decision for the user at this
gate. It is listed in §9 as the one open item this document does not close.

*Partial mitigation, 2026-09-10, not a closure.* `src/ui/MarketplaceModal.ts`
— the one screen designed to render listings authored by other players — is
built entirely with `createElement`/`textContent`, and no `innerHTML` or
`insertAdjacentHTML` remains anywhere in `src/`. That removes the output sink a
server-fed listing would otherwise have flowed into, but it defends one screen
by discipline, not the bundle by policy. The gap F5 names is unchanged: no CSP,
no dependency-integrity check, and nothing preventing the next surface from
reintroducing a sink.

**F6 — Upload cadence is unspecified, and it is the cost driver.** *(Resolved by Step 2 decision D5 in `memory-bank/server-save-sync-protocol.md` §9; implemented by Step 19 on 2026-09-13 — exercised.)*
`SavePersistenceCoordinator` debounces at `DEFAULT_SAVE_DEBOUNCE_MS = 500`. Step 19
composes a remote repository with the Dexie one; taken literally that is a
network write every 500 ms per player, which sets the Step 25 rate limits, the
§7.1 budget, and the Step 36 load profile.
**Default:** local persistence keeps its 500 ms debounce unchanged; **cloud
upload is a separate, slower cadence** — at most one upload per 60 seconds per
player, plus one forced upload at each lifecycle flush (`pagehide`,
`visibilitychange`), one after a claimed offline reward, and one after boot
reconcile when local is ahead. Step 2 specified this in the protocol; Step 19
implements the two cadences as distinct in
`src/persistence/cloudSaveReplica.ts`
(`CLOUD_UPLOAD_MIN_INTERVAL_MS = 60_000`, coalescing, and the forced
`enqueue(..., { force: true })` path wired to all three triggers in
`src/main.ts`); Step 25's limits must be set above it.

**F7 — Step 11 presumes an Apple Developer Program membership that the budget
does not contain.** Sign in with Apple on the web is not like Google's: it
requires a paid Apple Developer Program membership, a Services ID, a verified
domain, and a registered return URL. §7.5 records that no domain exists, and
§7.1's budget contains only Supabase.
**Default:** Step 11 acquires an explicit prerequisite list — membership,
Services ID, verified domain, return URL — and its cost is added to §7.1 as
roughly USD 99/year. Because it also needs the domain, **Step 11 cannot start
before the §7.5 domain question is resolved**, while Step 10 (Google) can, since
Google permits localhost redirect URIs in development. If the membership is not
wanted, Step 11 is cut the same way Step 12 is (§7.3) and nothing else changes.
**Exercised, 2026-09-11 — Step 11 is cut.** The user chose not to acquire the
membership, Services ID, verified domain, or return URL this finding lists,
so Step 11 has no code, config, or test and identity in this milestone is
anonymous guest, Google, and Telegram. §7.1's budget line for this is removed
in the same change. See `server-milestone-plan.md`'s Step 11 status row for
the full record; un-cutting this step later is implementing it fresh against
the pattern Step 10 already established, not resuming partial work.

**F8 — Step 21's measurement needs a seven-day observation window.**
Step 21 requires measuring the real iOS Safari behaviour rather than assuming
it, and the rule it measures triggers after seven days of Safari use without
first-party interaction. Whether moving the device date forward accelerates that
counter is itself untested, so it cannot be relied on as the measurement method
without first validating it — and a step whose whole point is to record what was
measured rather than what the specification implies cannot rest on an unvalidated
shortcut. The repository's `npm run dev:sim` simulator harness runs WebKit and so
does not sidestep the rule either.
**Default:** Step 21 is planned as a step with a background observation that
starts early and is checked later, not one completed in a sitting. Its
`navigator.storage.persist()` half can be measured immediately; the deletion
half cannot. Sequence Step 21 so the observation begins as soon as a deployed
origin exists, and record the measurement date alongside the result as the
step already requires.

**F9 — Step 31 has no concrete entitlement to grant, and the obvious ones
collide with Step 23.** Its test requires that a server-granted entitlement be
visible to the client and enforced server-side, which needs at least one real
entitlement to exist. Any entitlement that changes production rate, cost, or
yield becomes an input to the Step 23 upper bound, so an unmodelled one would
make honest saves look inflated.
**Default:** Step 31 defines exactly one entitlement, and it is **cosmetic and
economy-neutral**, so it cannot interact with re-simulation. If a later
milestone adds an economy-affecting entitlement, Step 23's bound must consume
the entitlement set as an input in the same change — recorded here so that
coupling is not discovered afterwards.

## 9. Traceability

Every decision in `memory-bank/server-milestone-plan.md` now traces to one of:

- a **recorded user decision** — the six rows of the plan's "Recorded decisions"
  table (scope, source of truth, identity, guest mechanism, fingerprinting,
  infrastructure), all chosen by the user during planning;
- a **rejection with recorded reasons** — the plan's "Rejected approaches"
  section on canvas/WebGL fingerprinting;
- a **written assumed default** — §7.1 through §7.8 above;
- an **assumption found in audit and now defaulted** — F1 through F9 above.

One item is deliberately left open rather than defaulted: **F5, the absence of
any XSS/CSP step.** A default cannot close it, because closing it means adding
work to the plan, and adding a step is the user's decision at this gate.

### Step-by-step trace

Every step audited. "In-step" means the step's own instructions decide it and it
depends on nothing outside them.

| Step | What it depends on | Recorded where |
|---|---|---|
| 2 Save-sync protocol | First-party cookie availability; upload cadence; conflict policy; server-timestamp anchor | §7.5; F6; in-step; plan's source-of-truth decision |
| 3 Database schema | Scale; data-protection obligations; age/email; `GameNumber` storage | §7.1; §7.2; §7.8; in-step, and metric-agnostic so Step 27 still owns the metric |
| 4 Supabase project | No organization exists; secrets never in the bundle | §7.5; §6 |
| 5 Migrations and CI | No CI exists; GitHub Actions | §7.5 |
| 6 Core on the server | `break_infinity.js` imports into Deno | **F2** |
| 7 Edge Function harness | — | In-step |
| 8 Anonymous guest session | Session lives in script-writable storage; game stays playable offline | §7.5, §4.5; Step 19's test |
| 9 Profiles and RLS | Minimal profile, no email column | §7.8 |
| 10 Google sign-in | Works without a domain via localhost redirect | §7.5 |
| 11 Apple sign-in | **Cut 2026-09-11** — Developer Program membership, Services ID, verified domain, cost | **F7**, exercised |
| 12 Telegram sign-in | **Implemented 2026-09-11, critical fix 2026-09-12** — a Mini App host is not required for the step's own test, only for a live in-Telegram pass, still unbuilt | **F1** (resolved, host still open), **F12** (new), **F13** (critical, new — public email signup let the placeholder-email row be pre-stolen, fixed by `enable_signup = false`); §7.3 |
| 13 Guest linking and collision | Neither save silently destroyed | §1, §6 |
| 14 Recovery code | Sole survivor of storage loss; redemption throttling | Plan; Step 25 |
| 15 Saves table | Client writes denied; Edge Function is the only writer | §6 |
| 16 Save upload | Reuses the shared validation chain | Step 6, **F2** |
| 17 Download and boot order | Boot from local, reconcile after; sync cadence | Plan; **F6** |
| 18 Conflict resolution | No progress lost unseen | §1, §6 |
| 19 Client remote repository | **Implemented 2026-09-13** — local and cloud cadences are distinct (`cloudSaveReplica.ts`), `src/core` stays pure (lint + architecture probe) | **F6** (exercised); §6 |
| 20 Adopt existing local saves | Existing saves must survive | §7.7 |
| 21 Survive storage eviction | No first-party cookie; measurement needs seven days | §7.5; **F8** |
| 22 Server clock | **Implemented 2026-09-14** — must change the clock without changing the economy; the one `calculateOfflineGrant` is shared by client and server | **F4** (exercised) |
| 23 Upper-bound re-simulation | **Implemented 2026-09-14** — the modelling rule and the 5% tolerance are stated in the module and in `architecture.md`; bounds cumulative counters and upgrade spend, never current `gold` | **F3** (exercised and stated); §1 with §7.4 |
| 24 Rejection handling | **Implemented 2026-09-14** — a refused save leaves the session playable and the local save intact, surfaces the §4 notice, and writes one best-effort `save_audit` row per authenticated attempt with enough context (outcome, reason, size, the client's own clock beside the server's) to tell a bug from an attack | §1 |
| 25 Abuse limits | No fingerprint collection; limits sit above the upload cadence | §7.2; **F6** |
| 26 Adversarial suite | The capability list it must cover | §4, §5 |
| 27 Leaderboard storage | Representation from Step 3; row count | Step 3; §7.1 |
| 28 Leaderboard writes | Only validated saves publish | §6 |
| 29 Leaderboard display | Reuses `formatAmount` | In-step |
| 30 Decide on friends | — | In-step; it is a decision step |
| 31 Entitlements | One concrete entitlement, economy-neutral; no money | **F9**; §7.4 |
| 32 Audit log | Retention period | §7.8 |
| 33 Account and data deletion | Which regime applies; retention | §7.2; §7.8 |
| 34 Backup and restore | Sole operator; RPO 24 h | §7.6 |
| 35 Monitoring | One alert channel a single operator reads | §7.6 |
| 36 Load and performance | Scale and latency budgets; upload cadence | §7.1; **F6** |
| 37 Close the milestone | Schema recorded in both required files | `AGENTS.md` |

## 10. How to change a default

Any default here may be overturned by the user at any time. The cost differs:

| Change | Cost |
|---|---|
| §7.1 scale, §7.6 operator | Documentation edit. Steps 3, 34, 35, 36 adjust their numbers. |
| §7.2 regions, §7.8 age | Documentation edit **if made before Step 3**; a schema migration after it. |
| §7.3 cut Telegram | Removes Step 12 whole; nothing else changes. |
| §7.7 local saves need not survive | Makes Step 20 optional. |
| §7.4 real money is taken | **Scope change.** Raises the value of all of Phase 4, makes the §4.3 ordering gap unacceptable, and adds obligations absent from this plan. |
| §7.5 a domain becomes available | Revisit the Step 2 cookie decision **before Step 8 ships**. After guests hold sessions it is a migration, not an edit. |
| F5 add an XSS/CSP step | **Adds a step** to the plan. |
| F7 cut Apple sign-in | Removes Step 11 whole, and USD 99/year from §7.1. **Exercised 2026-09-11.** |

When a default is overturned, update this document and the plan in the same
change, exactly as `AGENTS.md` requires for a schema change.
