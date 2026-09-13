# Server Milestone — Save-Sync Protocol

## Purpose

This document is the Step 2 deliverable of `memory-bank/server-milestone-plan.md`.
It specifies the client/server save-sync contract **before either side is
written**: endpoints, request and response shapes, the error vocabulary, the
optimistic-concurrency token, what the client does for each failure and what the
player sees, the conflict policy for divergent devices, the timestamp-anchoring
rule, and where the session credential lives.

No server code exists. This step changed no code, no balance value, and no
schema version.

## Status

| Field | Value |
|---|---|
| Plan | `memory-bank/server-milestone-plan.md` |
| Step | 2 of 37 — Design the save-sync protocol |
| Date | 2026-09-08 |
| Depends on | Step 1, `memory-bank/server-threat-model.md` |
| Gate | Awaiting user validation. Step 3 must not begin before it. |

## Decisions this step makes

Five, each required by Step 2's instructions. Every one is binding on later
steps.

| # | Decision | Choice |
|---|---|---|
| D1 | Session persistence | **Script-writable storage**, not a first-party HttpOnly cookie — no domain exists (§7.5 of the threat model). See §8. |
| D2 | Optimistic concurrency | A **server-owned monotonic `revision` integer**, sent back by the client as `baseRevision`. See §5. |
| D3 | Timestamp anchoring | The **server's own `receivedAt`** anchors every elapsed-time calculation. Client timestamps are stored verbatim and never used for reward maths. See §6. |
| D4 | Conflict policy | **Dominance auto-resolves; a genuine fork asks the player.** See §7. |
| D5 | Upload cadence | Local debounce unchanged at 500 ms; **cloud upload at most once per 60 s**, plus named forced triggers. Resolves finding F6. See §9. |

## 1. Scope

In scope: the two save-sync endpoints and the health check, plus the client
behaviour around them.

Out of scope, and named so a later step does not invent a second contract:
identity and sign-in endpoints (Steps 8–12), guest linking (Step 13), recovery
codes (Step 14), leaderboards (Steps 27–29), entitlements (Step 31). Those reuse
the envelope and error vocabulary defined here.

## 2. Transport and authentication

- Supabase Edge Functions over HTTPS. Base path `/functions/v1`, versioned
  inside the function as `/v1`.
- Every request carries `Authorization: Bearer <access token>` — the Supabase
  session token, anonymous or provider-linked alike. The server derives the user
  id from the verified token and **never** from the request body.
- `Content-Type: application/json; charset=utf-8` on requests with a body.
- The client never talks to PostgREST for saves. `saves` denies client writes
  entirely (Step 15), so the Edge Function is the only path.

## 3. Wire shapes

### Envelope

Success bodies are the resource. Failures always use one envelope:

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "Save was updated elsewhere.",
    "detail": { "serverRevision": 42 }
  }
}
```

`code` is a stable machine string from §4 and is what the client switches on.
`message` is diagnostic text for logs and is **never** shown to the player —
player-facing copy is fixed in §4 so it can be reviewed without reading code.
`detail` is optional and code-specific.

### The save document

The `document` field is a `SaveDocumentV1` exactly as
`memory-bank/architecture.md` defines it, passed through byte-for-byte in both
directions. The protocol adds no field to it and rewrites none of it. Examples
below elide the floor array for readability; the real payload carries all
fifteen entries.

```json
{
  "schemaVersion": 1,
  "savedAtTimestampMs": 1757332496789,
  "effectiveProductionRatePerSecond": "12.5",
  "state": {
    "saveVersion": 1,
    "lastUpdateTimestampMs": 1757332496789,
    "simulationTick": 41230,
    "simulationRemainderMs": 40,
    "gold": "1.234e5",
    "floors": [
      {
        "id": "floor-1", "floorNumber": 1, "isUnlocked": true,
        "mineShaftLevel": 27, "extractionProgress": 0.42,
        "materialQueue": "18", "totalExtracted": "9021",
        "totalTransported": "9003"
      }
    ],
    "elevator": {
      "level": 12, "capacity": "64",
      "roundRobinCursor": -3, "transitProgress": 0.61, "carriedMaterial": "40"
    },
    "warehouse": {
      "level": 9, "capacity": "48",
      "inputQueue": "12", "conversionProgress": 0.2,
      "totalGoldDelivered": "84210"
    }
  }
}
```

A payload is capped at **64 KB before parsing** (Step 25 enforces it). Fifteen
floors serialize to roughly 3–4 KB, so the cap is generous by design and exists
to refuse a body, not to constrain a real save.

## 4. Error vocabulary

Every rejection the client can receive. "Retry" means the client retries on its
own with backoff (§9); "Player sees" is the exact copy, and blank means the
player is shown nothing at all.

| `code` | HTTP | Retry | Client does | Player sees |
|---|---|---|---|---|
| `unauthenticated` | 401 | Once, after refreshing the session | Refresh the token and retry once. If that fails, stop cloud sync for the session; local play and local saving continue. | *(nothing on first failure)* — after a failed refresh: **"Cloud sync is signed out. Your progress is saved on this device."** |
| `forbidden` | 403 | No | Stop cloud sync for the session. Log for diagnostics. | **"Cloud sync is unavailable. Your progress is saved on this device."** |
| `malformed_request` | 400 | No | A client bug. Stop cloud sync for the session and log. | **"Cloud sync is unavailable. Your progress is saved on this device."** |
| `payload_too_large` | 413 | No | Stop cloud sync for the session and log; a valid save cannot reach 64 KB. | **"Cloud sync is unavailable. Your progress is saved on this device."** |
| `save_invalid` | 422 | No | The document failed server-side migrate/validate. Keep playing from local state, stop uploading this document, log the reason. | **"Your progress could not be uploaded. Your game on this device is unchanged."** |
| `schema_unsupported` | 422 | No | The client is newer than the server. Stop cloud sync for the session. | **"Cloud sync needs an app update. Your progress is saved on this device."** |
| `revision_conflict` | 409 | No — resolved instead | Run the §7 conflict policy against the returned server document. | *(nothing when dominance resolves it)* — on a genuine fork, the chooser in §7.3 |
| `save_rejected` | 422 | No | **Reserved for Step 23**; no server code produces it before then. Session stays playable, local save untouched, one audit row written (Step 24). | **"Your progress could not be verified and was not uploaded. Your game on this device is unchanged."** |
| `rate_limited` | 429 | Yes, after `Retry-After` | Back off and retry. Never surfaced — it is self-healing. | *(nothing)* |
| `server_error` | 500 | Yes, with backoff | Retry per §9; after attempts are exhausted, stop cloud sync for the session. | *(nothing until attempts are exhausted)* — then **"Cloud sync is unavailable. Your progress is saved on this device."** |
| `service_unavailable` | 503 | Yes, after `Retry-After` | As `server_error`. | As `server_error`. |

**Two rules govern that last column, and they are the reason it is mostly
blank.**

First, **the game never blocks on cloud sync.** IndexedDB stays the primary
store (Step 19); a failed upload costs the player nothing in the moment.

Second, **only a terminal problem is shown.** The existing
`createSaveDiagnosticBanner` deliberately never withdraws a notice — the
comment in `src/ui/SaveDiagnosticBanner.ts` records why: the coordinator reports
failures, not recoveries. That is right for local storage, where a failure means
something is genuinely broken. It would be wrong for a network, where driving
through a tunnel would pin a permanent scary banner to the screen. So a
retryable failure surfaces **nothing** while a retry is still pending, and
reaches the banner only once retries are exhausted and cloud sync has actually
stopped for the session. This preserves the component's no-retraction contract
rather than changing it.

Cloud notices reuse that banner unchanged: `SaveDiagnosticNotice` is already
`{ code: string; message: string }` with a plain string code precisely so new
sources can plug in. Cloud codes are namespaced `cloud-sync-*` so they cannot
collide with the existing `load-failed`, `save-failed`, `corrupt-save`, and
`incompatible-save`, and so the banner's de-duplication and dismissal behave
per-cause as they already do.

## 5. Optimistic concurrency

The server holds one `revision` per user: a monotonic integer, `1` on the first
accepted upload, `+1` on every accepted upload after it.

- Every server response that carries a document also carries its `revision`.
- Every upload carries `baseRevision`: the revision the client last received
  from the server, or `null` if this client has never synced.
- The server accepts when `baseRevision` equals the stored revision, or when
  both are absent (first write for the account). Otherwise it returns `409
  revision_conflict` **with the server's current revision and document**, so the
  client resolves in one round trip rather than two.

```
device A: download        -> revision 7
device B: download        -> revision 7
device A: upload base=7   -> 200, revision 8
device B: upload base=7   -> 409, {serverRevision: 8, document: <A's>}
device B: resolve per §7  -> upload base=8 -> 200, revision 9
```

**The retried-upload edge case, which is the one that would otherwise become a
bug.** If an upload succeeds but its response is lost to a dropped connection,
the client retries with the same now-stale `baseRevision` and gets a `409`
against a document it wrote itself. No idempotency key is needed: the §7
dominance rule sees the server document as equal to the one it tried to send,
adopts the server revision, and shows the player nothing. An idempotency key was
considered and rejected as redundant given that.

## 6. The server clock is the only clock

The server stores `received_at` from its own clock on every accepted upload.

- **Every elapsed-time calculation anchors on stored `received_at` → server
  `now()`.** No client-supplied value is ever an input to one.
- `savedAtTimestampMs` and `state.lastUpdateTimestampMs` inside the document are
  **stored verbatim and returned verbatim**, because the client's own local
  simulation needs them. They are data being carried, never a server input.
- Nothing in this step credits income. Step 22 moves settlement server-side, and
  when it does, the grant travels in the download response as `offlineGrant` —
  named here so Step 22 does not invent a second contract. The field is **absent
  until Step 22**.
- Finding F4 stands: Step 22 changes *which clock is authoritative* and nothing
  else. The formula, the 7,200,000 ms cap, the 0.5 efficiency, the zero award for
  a future timestamp, and the open-tab/closed-tab asymmetry are all preserved.

## 7. Conflict policy

The requirement from the threat model §6 is absolute: *no accepted branch may
destroy progress the player was not shown*. Last-write-wins and
highest-score-wins both violate it. Always asking punishes the common case,
which is one player with one device that is simply ahead.

### 7.1 The dominance rule

Define the **progress vector** `M(document)` over the fields that only ever
increase:

- per floor, all fifteen: `isUnlocked` (false < true), `mineShaftLevel`,
  `totalExtracted`, `totalTransported`
- `elevator.level`
- `warehouse.level`, `warehouse.totalGoldDelivered`

`A` **dominates** `B` when every component of `M(A)` is greater than or equal to
its counterpart in `M(B)`.

| Case | Resolution | Player sees |
|---|---|---|
| `M(A) == M(B)` | Same progress. Adopt the server revision and continue. | Nothing |
| `A` dominates `B` strictly | `A` is a superset of `B`; taking `A` loses nothing. Adopt `A` silently. | Nothing |
| Neither dominates | A genuine fork: each side holds progress the other lacks. **Ask.** | The chooser in §7.3 |

**Deliberately excluded from `M`:** `gold`, `materialQueue`, `inputQueue`,
`carriedMaterial`, every `*Progress` value, `roundRobinCursor`,
`simulationTick`, and all timestamps. Each of these legitimately falls — gold
most obviously, when the player spends it. Including any of them would report a
fork on a device that had simply bought an upgrade. This is the same distinction
Step 23 makes when it bounds cumulative counters rather than current gold, and
for the same reason.

**A constraint this places on future features.** Dominance holds only while
those fields are monotonic. A prestige, respec, or reset mechanic would break
it, and would have to revise this policy in the same change. Recorded here so
the coupling is not discovered afterwards.

The predicate is pure and belongs beside `saveSchema.ts` in `src/persistence`,
over two `SaveDocumentV1` values. It must not go in `src/core`, which is not
allowed to know that saves exist.

### 7.2 Where it runs

Client-side, on the `409` response, which already contains both documents. The
server does not adjudicate — it only refuses a stale write. This keeps
adjudication next to the only party who can be asked a question.

### 7.3 What the player is shown on a genuine fork

Step 13 builds the UI; this step fixes what it must display, per candidate:

| Field | Source |
|---|---|
| Gold | `state.gold`, through `formatAmount` |
| Floors open | count of `state.floors[].isUnlocked` |
| Deepest shaft level | max `mineShaftLevel` across unlocked floors |
| Total gold delivered | `state.warehouse.totalGoldDelivered` |
| Last played | server candidate: `receivedAt`. Local candidate: `savedAtTimestampMs`. |

The local "last played" is a client timestamp, which §6 forbids as a server
input — using it here is fine and is not an exception to that rule. It is a
display hint helping the account's own owner tell their two saves apart; nothing
is credited from it, and a player who misreports their own clock only confuses
themselves.

Neither candidate is destroyed until the player has chosen. The unchosen one is
retained for the session so a mis-tap is recoverable.

## 8. Where the session credential lives — decision D1

**Decision: the Supabase client's default script-writable storage. Not a
first-party HttpOnly cookie.** §7.5 of the threat model records that no domain
is registered, and the cookie option requires an endpoint on the game's own
origin rather than on the Supabase domain.

Three consequences, and the first is the one that matters most:

1. **The session token and the local save die in the same sweep.** Both are
   script-writable storage, so iOS Safari's seven-day deletion takes both at
   once. For an unlinked guest that means **cloud save alone does not rescue
   them** — they come back with no save *and* no credential to prove which
   account was theirs. Only the Step 14 recovery code does, which makes it a
   prerequisite for Step 21's promise rather than an optional convenience. The
   plan's existing ordering, 14 before 21, already supports this; Step 21 must
   state the dependency rather than imply cloud save is sufficient.
2. Finding F5 stands unchanged and unclosed: the credential is reachable by any
   script on the origin, and no plan step adds a Content Security Policy.
3. **Revisit trigger:** if a domain is registered, this decision must be
   reconsidered **before Step 8 ships**. Once guests hold sessions, moving where
   the session lives is a migration, not an edit. Checked at Step 8
   (2026-09-09): no domain is registered, so D1 stands unrevisited and Step 8
   ships the credential in the Supabase client's default storage as decided
   here.

## 9. Cadence and retry — decision D5, resolving F6

**Local persistence is unchanged.** `SavePersistenceCoordinator` keeps its
`DEFAULT_SAVE_DEBOUNCE_MS = 500`. Nothing in this milestone slows the local save
down.

**Cloud upload is a separate, slower cadence.** Taken literally, composing a
remote repository with the local one would put a network write on every 500 ms
debounce; that sets the rate limits, the cost, and the load profile, so it is
specified here rather than discovered in Step 36.

- At most **one upload per 60 seconds** per session.
- **Forced immediately, ignoring the interval**, on: a lifecycle flush
  (`pagehide`, or `visibilitychange` to hidden — the events
  `bindSaveLifecycle` already handles); a claimed offline reward; and once after
  boot reconcile if local is ahead of cloud.
- **Coalescing:** only the newest document is ever uploaded. A queued upload is
  replaced, never queued behind. This mirrors the local coordinator, which
  already keeps a single `#pendingDocument`.
- **Retry backoff** for retryable codes: 1 s, 2 s, 4 s, 8 s, 16 s, capped at
  60 s, at most five attempts per trigger. Retries never block a frame, never
  delay a local save, and never hold up teardown at a lifecycle flush.
- A lifecycle-flush upload is best-effort: the local write is what must survive
  teardown, and it already does through the localStorage journal.

## 10. Endpoints

### 10.1 `GET /v1/health`

Unauthenticated. Exists for Step 4's clean-checkout check.

**Request**

```http
GET /functions/v1/save-sync/v1/health
```

**200**

```json
{ "status": "ok", "serverTime": "2026-09-08T12:34:56.789Z" }
```

**503**

```json
{ "error": { "code": "service_unavailable", "message": "Database unreachable." } }
```

### 10.2 `GET /v1/save` — download

**Request**

```http
GET /functions/v1/save-sync/v1/save
Authorization: Bearer <access token>
```

**200 — a cloud save exists**

```json
{
  "revision": 8,
  "receivedAt": "2026-09-08T12:34:56.789Z",
  "document": { "schemaVersion": 1, "savedAtTimestampMs": 1757332496789, "…": "…" }
}
```

**204 — the account has no cloud save yet.** No body. The client keeps playing
from local and uploads at the next trigger. This is the normal first-sign-in
path, not an error.

**401**

```json
{ "error": { "code": "unauthenticated", "message": "Missing or invalid bearer token." } }
```

**403 — a valid token whose account may not sync, for example a disabled one**

```json
{ "error": { "code": "forbidden", "message": "Account may not sync saves." } }
```

**429**

```json
{ "error": { "code": "rate_limited", "message": "Too many requests.", "detail": { "retryAfterSeconds": 30 } } }
```

**500**

```json
{ "error": { "code": "server_error", "message": "Unhandled error reading save." } }
```

**503**

```json
{ "error": { "code": "service_unavailable", "message": "Database unreachable." } }
```

### 10.3 `PUT /v1/save` — upload

**Request**

```http
PUT /functions/v1/save-sync/v1/save
Authorization: Bearer <access token>
Content-Type: application/json; charset=utf-8
```

```json
{
  "baseRevision": 8,
  "document": { "schemaVersion": 1, "savedAtTimestampMs": 1757332496789, "…": "…" }
}
```

`baseRevision` is `null` when this client has never synced.

**200 — accepted**

```json
{ "revision": 9, "receivedAt": "2026-09-08T12:36:10.221Z" }
```

**400 — malformed**

```json
{ "error": { "code": "malformed_request", "message": "Body is not an object with document and baseRevision." } }
```

**401**

```json
{ "error": { "code": "unauthenticated", "message": "Missing or invalid bearer token." } }
```

**409 — stale `baseRevision`**

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "Save was updated elsewhere.",
    "detail": {
      "serverRevision": 9,
      "receivedAt": "2026-09-08T12:36:10.221Z",
      "document": { "schemaVersion": 1, "…": "…" }
    }
  }
}
```

**413 — over the 64 KB cap, refused before parsing**

```json
{ "error": { "code": "payload_too_large", "message": "Body exceeds 65536 bytes." } }
```

**422 — failed migration or validation**

```json
{
  "error": {
    "code": "save_invalid",
    "message": "Document failed validation.",
    "detail": { "reason": "state.floors must contain exactly 15 entries" }
  }
}
```

**422 — schema newer than the server understands**

```json
{ "error": { "code": "schema_unsupported", "message": "Unsupported schemaVersion 2.", "detail": { "supported": [1] } } }
```

**422 — reserved for Step 23; no server code emits it before then**

```json
{
  "error": {
    "code": "save_rejected",
    "message": "Claimed progress exceeds what the elapsed time allows.",
    "detail": { "counter": "warehouse.totalGoldDelivered" }
  }
}
```

**403 / 429 / 500 / 503** — identical bodies to §10.2.

On every rejection the stored row is unchanged and the stored revision does not
advance.

## 11. Boot order

Cloud latency must never delay the first frame (Step 17). The sequence:

1. Boot from local exactly as today — `loadActiveGame`, recovery, offline
   settlement, first frame. **No network call is on this path.**
2. In the background, once a session exists, `GET /v1/save`.
3. Reconcile through §7. `204` means upload at the next trigger.
4. From then on, upload per §9.

If the session or the download fails, the game is already running and stays
running; §4 decides what, if anything, is shown.

## 12. What this step does not decide

- Table and column definitions — Step 3.
- Which of the two documents Step 13's chooser presents first, and its visual
  design — Step 13.
- Rate-limit thresholds and the size cap's enforcement point — Step 25.
- The re-simulation bound that makes `save_rejected` reachable — Step 23.
- Whether `offlineGrant` is computed on download, upload, or both — Step 22.

## 13. Traceability

| This document | Traces to |
|---|---|
| D1 session in script-writable storage | Threat model §7.5 (no domain), and its own consequence for Step 21 |
| D2 `revision` token | Plan Step 2's "optimistic concurrency token" |
| D3 server `receivedAt` anchors elapsed time | Plan Step 2 and Step 22; preserves F4 |
| D4 dominance conflict policy | Threat model §6 (no unseen loss) and §1 (progress outranks all) |
| D5 cadence | Finding **F6**, now resolved |
| Banner reuse and the mostly-blank "player sees" column | `src/ui/SaveDiagnosticBanner.ts`'s recorded no-retraction contract |
| 64 KB cap | Threat model §4.4; enforced in Step 25 |
| `save_rejected` reserved | Step 23, biased toward acceptance per threat model §1 |

## 14. CORS policy — added by Step 12, resolving finding F11

Not part of the original Step 2 design — §1 lists save-sync as the only
in-scope contract, and no step before Step 12 ever called a function
directly from a browser (Steps 8–10 go through the Supabase Auth client SDK
or server-side tests only). Finding F11
(`memory-bank/server-threat-model.md`) named the trigger condition exactly:
"the first step whose own client code calls a function... directly from
`src/`... must add an explicit CORS policy... and record the decision in
the protocol document rather than each function inventing its own." Step 12
(Telegram sign-in) was that step, not Step 16/17 (save upload/download) as
F11 had guessed.

**The policy**, implemented once in
`supabase/functions/_shared/http.ts` for every function to reuse rather
than invented per function:

- Allowed origins are the two known dev origins,
  `http://127.0.0.1:5173` and `http://localhost:5173` — the same pair
  `additional_redirect_urls` in `supabase/config.toml` already allow-lists.
  No deployed origin exists yet (threat model §7.5); add the real one to
  `ALLOWED_ORIGINS` in `_shared/http.ts` when one does, rather than widening
  it to a wildcard.
- `corsPreflightResponse(request, allowedMethods)` answers `OPTIONS` with
  204, the matched origin (or none), `Access-Control-Allow-Methods`, and
  `Access-Control-Allow-Headers: content-type, authorization` — checked
  **before** any route or body parsing, since a preflight itself carries no
  body and no `Authorization` header and would otherwise fail as malformed.
  A 2026-09-12 review of Step 14 found this listed `content-type` alone: the
  reasoning above ("a preflight carries no... `Authorization` header") is
  what produced the bug — it describes the preflight request itself, not
  the *real* cross-origin request behind it, which does carry
  `Authorization` for both `recoveryCode.ts` (generating a code) and
  `cloudSaveReconcile.ts` (downloading a save), and a real browser refuses
  to send that real request at all once its preflight's own
  `Access-Control-Allow-Headers` omits it. Invisible locally only because
  Kong's own CORS override (finding F12, immediately below) replaces every
  function's CORS headers regardless of what this code returns.
- `jsonResponse`/`errorResponse` both grew an optional `origin` parameter
  that adds the matched-origin header to an ordinary response too, so a
  rejection is exactly as CORS-visible to the calling page as a success.

**What was found proving it against the real stack (finding F12, threat
model §8):** the local Kong gateway in front of every Edge Function
unconditionally injects `Access-Control-Allow-Origin: *` onto any response
whose request carries an `Origin` header — reproduced against
`whoami-check`, which sets no CORS header of its own at all, and against a
deliberately unlisted origin. This runs after the function and overwrites
whatever specific-origin value `corsHeaders()` computed, so the origin
restriction above is correct and tested at the application layer but is not
what a real browser calling the live **local** stack actually observes —
`*` is, regardless of origin. Whether a real deployment's gateway behaves
the same way is unverified (no deployment exists); re-verify before relying
on this policy as the sole defense for a future function where the calling
origin genuinely matters.
