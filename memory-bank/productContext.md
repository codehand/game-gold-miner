# Product Context

## Why This Exists

The project explores whether the appeal of a multi-floor idle mining game can be reproduced as a lightweight, web-first prototype. The primary value is immediate visual progress: the mine keeps moving while the player makes short, meaningful optimization decisions.

## Target Players

Casual mobile players who enjoy incremental numbers, automation, collectible managers, and sessions lasting roughly 30 seconds to five minutes.

## Player Problem

Many management games obscure cause and effect or require constant tapping. This game should make every bottleneck visible and allow the player to improve production with a few clear actions.

## Intended Experience

- Understand how gold is produced and spent within 30 seconds.
- See miners, carts, and storage working concurrently.
- Recognize floor extraction from miner travel and stalled production from visible gold queues; shared transport stages retain progress bars.
- Feel a noticeable acceleration after every meaningful upgrade.
- Return to a useful but capped offline reward.
- Make progress without blockchain, payment, or advertising systems.

## Core Journey

The player claims offline gold, inspects the mine, upgrades the slowest stage, opens deeper floors, assigns managers, activates a boost, and leaves while production continues. Short-term goals are the next upgrade and floor; the prototype's long-term goal is fully automating and optimizing all fifteen floors.

## UX Principles

Prioritize one-thumb controls, readable large-number notation, strong upgrade affordances, short animations, and uninterrupted portrait play. UI must reinforce the production chain instead of covering it. The persistent bottom navigation uses icon-only, thumb-safe controls with immediate press feedback and keeps future features discoverable without pretending their screens already exist.

## Base-Game Delivery Boundary

The completed base-game milestone includes fifteen sequential floors, one shared elevator, one shared warehouse, gold, independent stage upgrades, milestone multipliers, local saves, and capped offline income. The screen initially exposes floors 1–5; opening floor 5 reveals floors 6–10, and opening floor 10 reveals floors 11–15. Production is automatic without managers. UI copy is English and the logical viewport is 360×640. A compact post-milestone navigation shell now reserves the bottom 58 logical pixels for five clickable, individually illustrated controls (Rewards, Shop, Boost, Managers, Map); each complete visible tile is scaled to 60% while the thumb-safe hit region stays unchanged. These controls provide press feedback only. Their screens and all manager, boost, gift, shop, task, social, Telegram, monetization, audio, and final-art systems remain deferred.

The user-review revision completed on 2026-09-08 reduces the fixed HUD to 52 logical pixels and defines its centre number as the authoritative warehouse input queue (`warehouse.inputQueue`), not gold still travelling inside the elevator cabin. A warehouse icon makes that ownership explicit. The tower hopper, gold pour, loaded cats, and filled surface carts now all empty with that queue; elevator cargo remains visually in transit until surface delivery. The elevator preserves top-down priority by returning whenever a visited floor still has gold, and the surface delivery crew shares one straight baseline.

The delivery crew remains visibly active when the tower is empty: the lead cat and every warehouse-level assistant repeatedly visit the tower, push an empty cart to the warehouse, and return. A positive warehouse input queue adds gold pour and filled-cart feedback to that same route; it does not start or stop the workers.

The shared elevator shaft remains visually continuous and crisp through all fifteen floors. Its original shaft art repeats at native vertical resolution rather than being stretched to the full mine depth, so rail connectors and braces stay readable while scrolling.

Opening more floors does not reduce the apparent cadence of miner travel: fixed-step extraction targets are blended across rendered frames, keeping walking smooth while authoritative production remains deterministic.

Scrolling to inspect deep floors changes only the player's view. The elevator still travels the complete physical shaft through every intervening floor before entering the surface tower; offscreen distance is never skipped.

The same review replaces direct Level-badge purchases with an accessible detail popup for mine floors, the elevator tower, and the warehouse. It explains each target's authoritative current and next production attributes before the player chooses x1, x5, or the exact MAX affordable level count; the warehouse queue field is sourced from `warehouse.inputQueue`. Opening or closing spends nothing, disabled choices reflect current gold, successful batches update the still-open popup immediately, and Phaser input stays disabled behind the DOM overlay.

The completed establishment phase provides a safe-area-aware 360×640 Phaser game with the approved Step 32A mine composition, original surface scenery, one shared elevator tower, cart-hauler crews, a warehouse depot, independently animated mine crews, and touch-safe level controls. The 2026-09-07 review expands the authoritative mine to fifteen floors with progressive five-floor disclosure and changes the compact HUD centre to the warehouse input queue. Step 33 proves the core journey twice through real controls; Step 34 proves lifecycle and offline intervals are consumed exactly once; Step 35 measures the mobile frame, memory, startup, and input budgets under Pixel 5 emulation, with a physical Android pass still outstanding; and Step 36 proves the optimized bundle, assets, save recovery, and responsive portrait layout. Save-document and IndexedDB schema versions remain 1, with a same-version compatibility expansion for former four-floor saves.

Step 37 closed the milestone, validated by the user on 2026-09-08. It reviewed the delivered game against this plan and the GDD acceptance criteria, recorded every deferred feature rather than building it, added `README.md` so a new developer can install, run, test, and understand the base game from repository documentation alone, and corrected the documentation that still described a four-floor mine. What a player can do is therefore final for this milestone: watch fifteen floors produce automatically, upgrade three stage types independently, buy shaft levels in x1/x5/MAX batches through the floor detail popup, open floors in sequence, cross milestone multipliers, and claim a capped offline reward. Everything else in the GDD is deferred and recorded in `memory-bank/progress.md`.

An asset-only cat-role catalog was authorized on 2026-09-08. Every cat role is
planned across five rarity tiers: `N` normal/gray, `R` rare/green, `SR` super
rare/blue, `SSR` super-super rare/purple, and `UR` ultra rare/gold. The current
`unloader` remains the runtime default and is the normal-tier baseline. New
role/tier art will be created from a user-supplied role name, tier, and design
reference. Different tier attributes are future design work: this catalog does
not yet change the playable product, economy, state, save format, or UI.

Server-milestone Steps 4 through 7 landed between 2026-09-08 and 2026-09-09,
closing Phase 1, and change nothing a player can see or do. They are
infrastructure: the whole backend now runs locally in Docker through the
Supabase CLI, one Edge Function answers the save-sync protocol's health
check, the local database holds all six designed tables with row-level
security enforced, a CI workflow gates every push and pull request, the
repository has an enforced boundary between values that may ship in the
browser bundle and credentials that may not, the exact simulation and
save-document code the client runs now also runs, unmodified, inside a Deno
Edge Function — proven by reproducing a fixed ten-minute run byte-for-byte —
and every Edge Function now has both a permission-free unit test and a
real-stack integration test, using a formalized way to mint a test login for
the seeded local guest. No account exists, no save leaves the device, and the
game still boots, plays, and saves entirely offline. The player-facing
promises of this milestone — a save that survives a new device, cleared
storage, or a lost
browser — start at Phase 2 and are only kept from Phase 3.


Server-milestone Steps 8 through 17 and 13 landed between 2026-09-09 and
2026-09-12 and change what is true about accounts and saves, even though — no
production UI existing yet for any of it — a player cannot see or reach any
of this in the shipped game today. An account now exists: every player gets
a real anonymous session at boot, and can attach Google or Telegram to it
(Apple was cut) while keeping the same identity and progress. A save can now
genuinely leave the device: `saves` denies every client write, but the
`save-sync` Edge Function accepts an upload and serves it back down, with a
player who has no local progress on a new device silently restored from
whatever their account already holds, and a player who *does* have local
progress on a device that turns out to hold a genuinely different account
save left completely untouched rather than either being silently merged or
silently asked to lose one. Every path into this — Google/Telegram sign-in,
the account-linking collision, the cloud upload/download — is reachable only
through `import.meta.env.DEV`-only diagnostics and hooks today, the same
"land the mechanism, defer the real entry point" pattern every identity step
since Step 8 has followed; the player-facing promise this paragraph is
building toward — a save that survives a new device, cleared storage, or a
lost browser — is still not something any real player benefits from yet.
That remains true until a production UI exists and, for an unlinked guest
specifically, until Step 14's recovery code lands: script-writable storage
(the session token included) is deleted by iOS Safari after seven days
regardless of any of this milestone's work.

Server-milestone Step 18 (2026-09-13) settles what happens when the same
account's saves diverge across two devices. In player-facing terms: if one save
is ahead of the other in every way that only ever moves forward — more floors
opened, deeper shafts, more material extracted and transported, a higher
elevator or warehouse, more gold ever delivered, more gold ever claimed
offline — the game keeps the ahead save without asking, because keeping it
loses nothing. If neither save is ahead in every way, each holds something the
other lacks, so both are shown and the player chooses; the game never picks one
on the player's behalf in that case and never destroys the save they did not
choose. The rule lives in `src/persistence/saveConflictPolicy.ts`; only a
genuine fork reaches the player as a prompt. Making "keeps the ahead save loses
nothing" true required counting *every* gold source, so an offline reward now
also increments a new monotonic `warehouse.totalOfflineGoldClaimed` counter
(save schema version 2, migrated from version 1 by defaulting it to zero) that
the conflict rule compares. Like the rest of this milestone,
no production UI surfaces it yet: the candidate saves are retained for the
session through a DEV-only hook, and the chooser screen plus the upload path
that produces a conflicting write are later steps. This changes nothing a
current player can see or do.

Server-milestone Step 19 (2026-09-13) makes the cloud save a real replica of
the local one without changing how the game plays. IndexedDB is still the
store the game boots from and writes to; a separate background cadence — at
most one upload per 60 seconds, plus an immediate one when the tab is hidden
or closed, when an offline reward is claimed, or right after the boot
comparison — sends the newest save to the account's cloud copy. Nothing about
this delays a frame or a local save, and if the network is slow or absent the
game is exactly as playable as before; a failed upload is retried silently in
the background and, once retries are exhausted, simply stops for that session
while the local save carries on. If the cloud copy has turned out to be ahead
of the local one, the game adopts it rather than overwriting it, through the
same dominance rule described above. As with the rest of this milestone no
production surface exposes any of it yet; the player-facing promise — a save
that survives a new device, cleared storage, or a lost browser — still waits
on Step 21 (surviving storage eviction) and on a production sign-in UI.

Server-milestone Step 20 (2026-09-14) makes sure an existing player is not
reset by the cloud. A player who has been playing the client-only build already
holds their save on their device as a version-1 document. On the first sign-in
that device makes, the game quietly adopts that save as the account's cloud
save — migrating it to the current format losslessly — instead of letting a
fresh, empty cloud save take its place. The player sees nothing; their
progress is simply the same progress they already had, now also recoverable
from their account.

Server-milestone Step 21 (2026-09-14) handles the case where the device's copy
disappears — a browser clearing site data, storage pressure, or iOS Safari's
seven-day sweep. When the account's session is still there but the local save is
gone, the game restores the account's cloud save if it has one; if the account
has no cloud save, the player is told plainly that their saved game could not be
found rather than silently handed a fresh mine. The game also asks the browser
to keep its storage persistent, and it saves to the cloud early in a session, so
a player who plays once and never returns still has something to restore. This
reduces the loss the seven-day cap causes but does not remove it: an unlinked
guest whose session and save are swept in the same event still needs the
recovery code to get back in, and the real seven-day iOS behaviour is being
measured rather than assumed.

Server-milestone Step 22 (2026-09-14; tightened 2026-09-15) makes the offline
reward the server's. When the player returns to an account with a cloud save,
the amount credited for their absence is computed by the server from its own
record of when it last saw the save, not from the device clock — so changing the
device clock, whether forward, backward, or mid-session, no longer changes what
they earn. The figure cannot exceed the time they were actually away: the server
grant is bounded by the game's own local estimate of the away interval, so an
upload that lagged behind their last play cannot hand back time the open game
already produced. The reward appears once that source is known (the download is
bounded by a short timeout rather than left open), and offline play is
unchanged; only when the game has no server figure to use at all — a brand-new
account with nothing in the cloud, or no backend configured — does it fall back
to its own local estimate. If the download or sign-in fails against a configured
backend, the player is shown no offline reward for that session rather than a
device-clock figure; the award is simply made on the next launch that reaches
the server. The reward formula, the two-hour cap, and the 50% efficiency are
unchanged; only the clock that decides the elapsed time is now the server's.

## Closed incident reports

Four base-game defect reports (marketplace popup, navigation hit-target,
upgrade CTA press, marketplace hardening and close-race) previously appeared
verbatim in this file and six others. They are now in
`archive/incident-log.md`, one canonical copy.
