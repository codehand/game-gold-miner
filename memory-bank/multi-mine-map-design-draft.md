# Multi-mine Map — design draft v1

**Status:** implemented and release-verified, 2026-10-05.
The implementation sequence and release gates are in
`multi-mine-map-implementation-plan-v1.md`. This design extends the existing
15-floor mine into a portfolio of locations. UI copy should remain English.

## Decisions from the feature request

- The current gold mine becomes the first, already-owned location. Each location
  retains its own fifteen floors, elevator, warehouse, upgrades, production
  queues, assigned cats, and progress.
- The player has **one shared gold wallet**. Mine purchases, upgrades, and
  Marketplace transactions spend that wallet.
- Exactly one mine is selected for foreground simulation. Its completed
  warehouse deliveries increase the shared wallet and its rate appears in the
  HUD. The Map does not sum the rates of owned mines.
- Other owned mines hold claimable offline income. Selecting one calculates and
  shows its reward; the wallet increases only when that reward is claimed.
  Multiple inactive mines can accumulate potential rewards over the same real
  time. This is delayed portfolio income, not a combined live production rate.
- Buying a location grants ownership; it does not automatically change the
  selected mine. A new mine's offline timer begins only after its first visit
  and departure, so buying and immediately entering cannot create a windfall.
- **Every floor in a mine has that mine's own visual design.** The resource
  changes the shape and color of the rock, ore veins, pile and cargo, not just
  the Map marker or a color tint over the existing Gold Mine art.

## Player journey and Map UI

1. The bottom **Map** button opens a full-screen location map. The current mine
   remains the selected foreground mine while the map is open.
2. The map shows a fixed path through six sites. Each site has a distinct color,
   silhouette and resource icon, plus its name and state: **Current**, **Owned**,
   **Reward ready**, **Claim pending**, **Available**, or **Locked**. Color alone
   never conveys ownership or claim status. A node has at least a 44
   logical-pixel target.
3. Tapping a locked site opens a detail sheet with resource, production theme,
   fixed gold price, prerequisite, and **Buy mine** action. The action is
   disabled with a concrete explanation until both the prerequisite and wallet
   requirement are met. Purchasing deducts the shared wallet once and marks
   the site Owned, even if the player stays on the current mine.
4. Tapping an owned site shows its current floor progression and a rough
   *potential* offline reward indicator. **Enter mine** opens the exact offline
   claim sheet when a positive reward exists; zero reward enters directly.
5. The claim sheet states the mine name, credited duration, capped duration,
   reward, and shared-wallet total after claim. **Claim & enter** settles the
   interval once and switches the foreground mine. A failed claim preserves the
   pending interval and allows retry. In a configured account that cannot reach
   the server, the player may enter and play; the reward stays visibly pending
   until server validation, rather than being silently credited or discarded.
6. The mine view shows the resource icon/name near the HUD balance. Returning
   to Map retains the mine camera position where practical. Opening Map alone
   never changes production ownership or claims a reward.

Suggested 360x640 logical layout: header with Back, Map title, shared wallet;
vertically scrollable authored path with six readable sites; selected-site
sheet above the bottom safe area. The first screen shows the current node and
the next purchasable goal without panning. Keep node labels and CTA clear at
mobile scale before producing final art.

```text
┌──────────────────────────────┐
│ ‹ Back       Mine Map   Gold │
│                              │
│    ◆ Diamond Peak  Locked   │
│           │                  │
│    ◇ Emerald Forest Locked  │
│           │                  │
│    ● Sapphire Grotto Owned  │
│           │                  │
│    ✦ Ruby Crater Reward ready│
│           │                  │
│    ◆ Amethyst Cavern Current │
│           │                  │
│    ● Gold Mine       Owned   │
│ ┌──────────────────────────┐ │
│ │ Ruby Crater   +offline   │ │
│ │ [Enter mine]             │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

## Site catalog and progression

“Metal” is used loosely in the request; ruby, sapphire, emerald and diamond are
gemstones. In game data, call the category **resource**. All sites convert their
ore into the same spendable gold at the warehouse, so existing gold purchases
and Marketplace prices have one unit. Conversion multipliers express fictional
game balance, not real-world commodity prices.

| Order | Site | Floor shape, palette and landmark | Provisional value per ore unit |
| --- | --- | --- | ---: |
| 1 | Gold Mine | rounded ochre rock, irregular gold nuggets, wooden headframe | x1 |
| 2 | Amethyst Cavern | dark slate geodes, pointed violet clusters, crystal arch | x2 |
| 3 | Ruby Crater | fractured basalt, angular red shards, volcanic ridge | x4 |
| 4 | Sapphire Grotto | layered blue stone, compact blue crystals, underground lake | x8 |
| 5 | Emerald Forest | mossy cut stone, long green prisms, overgrown ruin | x16 |
| 6 | Diamond Peak | pale granite/ice, sharp clear facets, snow peak | x32 |

The authored path starts with one purchasable neighbor; later sites unlock in
order after the previous site is owned and reaches a clear progress milestone
(for example, floor 5). This prevents the player from buying far ahead solely
because of accumulated wallet gold. The x2–x32 values are **starting test data**,
not final prices or production guarantees. Site prices are fixed in config,
rise with the resource tier, and should be tuned against expected time to buy
and payback, including the fact that every owned inactive site can later yield
an offline claim. Do not derive a changing price from the player's current
income. Each site reuses the 15-floor production topology but may have its own
yield, cost and visual config; do not simply multiply all current costs and
rewards by the same number without a progression simulation.

**Balance checkpoints (2026-10-01–02):** the deterministic Gold Mine
progression reaches floor 5 at 13m 28s, has 516m wallet gold at 2h and 1.47b
at 4h. The provisional Amethyst price was reduced from 1t to 1b so it falls
inside that 2–4h play window. A second conservative pass uses one shared wallet
and moves through all six sites without claiming any inactive mine. Its upgrade
policy reaches each next price and floor-5 gate within five active hours:
Amethyst 1b, Ruby 5b, Sapphire 10b, Emerald 50b, Diamond 250b. Resource yield,
transport capacity and upgrade cost now have separate site scales, so the
rarity premium improves earning power instead of multiplying every cost and
reward equally. This is a deterministic blockout, not an approved final
economy: inactive-mine offline claims, frequent rotations and payback still
need simulation before release.

## Visual design of each mine's floors

The existing game uses bright, rounded 2D cartoon art at a 360x640 logical
viewport. Keep that level of detail, lighting direction, outline weight and
readability across all six mines, while giving **each site a coherent asset
family for all fifteen floors**. Gold Mine may keep its current identity as
the baseline; the other five require newly designed floor artwork. A site
should remain recognizable when shown in grayscale by its rock silhouette,
ore geometry, support/prop details and landmark, not by hue alone.

For each mine, specify and produce a matched set of floor wall/cutaway and
ground, ore vein, fixed decorative pile, mining contact effect, loaded cart,
elevator cargo and surface hopper contents. The resource icon and selected
mine label link that set to Map and HUD. The surface backdrop and headframe can
carry a smaller matching landmark so entering a mine immediately feels like a
location change. Keep empty carts, cats and level controls readable over every
palette; bought cat characters retain their identity and animation.

Within one site, use three depth bands across floors 1–5, 6–10 and 11–15:
the same resource and material language persists, while vein density, rock
layers, lighting accents and background props change with depth. This avoids
fifteen identical repeated backgrounds without implying a new resource type on
every floor. Locked floors may use a subdued variant, but the player can still
tell which mine they belong to. Production and unlock rules are independent of
these decorative variations.

Preserve current physical anchors and collision-free presentation contracts:
floor line, miner strike point, ore pile footprint, cart pickup, elevator bay
and warehouse handoff must align across all skins. New pile sprites cannot
float above the floor or hide the miner's action. Keep tile edges seamless
across consecutive floors and avoid a stretched bitmap over the full 15-floor
shaft. An asset manifest should record native size, pivot, frame count,
palette, source/provenance and `mineId` for each variant; the renderer resolves
the active mine's skin from that registry and loads only the needed art family.
Art approval requires native-scale screenshots of upper, middle and deep
floors, default and purchased miners, empty/full cargo, and the transition from
surface to shaft. Review them in motion as well as in a contact sheet.

### New asset checklist

The five new sites (Amethyst, Ruby, Sapphire, Emerald and Diamond) each need a
complete resource family. Gold Mine can reuse its approved mine art, but still
needs a matching Map landmark and any UI pieces absent from the current game.

| Area | New design deliverables | Scope |
| --- | --- | --- |
| Map | Regional backdrop, route, six site landmarks/markers and selected-site thumbnails | One map family; a recognizable landmark for each of six sites |
| Surface | Site backdrop, entrance/headframe, elevator tower, warehouse and small location props | One matched surface family per new site |
| Underground | Cutaway wall, ground, tunnel, shaft walls, structural supports, lighting and rock transitions | Three depth bands per new site: floors 1–5, 6–10, 11–15 |
| Ore at source | Wall vein, mineable deposit and persistent decorative pile | Resource-specific shape and color per new site; pile aligned to the existing strike and floor anchors |
| Cargo | Loaded cart, loaded elevator/cabin and surface hopper/warehouse contents | Empty/full states remain readable; the material changes at every visible handoff |
| Effects | Strike chips/dust, pickup, unloading and small resource glints | Short resource-specific effects with stable timing and no obscured controls |
| UI | Resource icon, mine thumbnail and offline-claim illustration/accent | One family per site, shared by Map, HUD and claim sheet |

Asset production status as of 2026-10-05:

| Asset group | Current status | Remaining approval |
| --- | --- | --- |
| Map terrain and landmarks | Implemented and reviewed for all six sites at 360×640 | None for this feature scope |
| Surface backdrops and structures | Implemented and native-scale reviewed for all six sites | None for this feature scope |
| Floor backgrounds and ore piles | Three depth bands implemented for all five new resource sites; Gold keeps its existing family | Native captures and texture assertions cover floors 1, 5, 10 and 15 |
| Shaft and elevator cargo | Site-specific shafts and swappable cabin ore overlays implemented | Full-depth captures verify shaft repetition; loaded-cabin binding is covered |
| Default, Tobi and Rivet carts | Resource-specific loaded cargo implemented | Runtime registry and texture binding are covered; broader animation polish can remain iterative |
| Boru excavator cargo | Runtime ore and pour overlays prevent the baked Gold load in non-Gold mines | Amethyst travel-loaded and Ruby deposit states are browser-verified |
| Mining and pour effects | Four-frame resource-specific sheets implemented | Active texture, visibility and animation state are covered |
| Claim UI | Mine landmark, name, resource label and accent implemented with the existing site family | Amethyst reward-ready/claim flow is browser-verified |

Map ownership states (**Locked**, **Available**, **Owned**, **Current**,
**Reward ready**, **Claim pending**) should use code-rendered labels and chrome
with reusable state symbols; they do not require separate full raster images
for every site/state combination. Cats keep
their existing identity, but audit animation sheets for gold painted directly
into the character or vehicle (for example, Boru's bucket). Where it is baked
in, make the cargo a resource-swappable overlay or produce controlled variants;
do not show gold in a Ruby or Diamond mine. Check both outbound and return
frames, as well as empty and full cart/cabin poses.

Existing V3 cat assignments migrate as Gold Mine assignments. A cat already
assigned to Gold cannot appear or contribute its bonus in another mine merely
because that mine has a floor or role slot with the same short name. The local
runtime and local V4 save now use `mine:<mineId>:<role slot>` keys. The active
scene receives only its mine's assignments under the familiar short role keys.
Old V3 and early V4 short keys migrate to Gold on load. The server RPC now
accepts qualified slots only for owned sites, and the configured client adopts
the exact authoritative V4 document after Collection or Marketplace mutations.

Production order: approve one complete floor and surface sample per resource at
native game scale, then expand to three depth bands and all cargo/effect states.
Each delivered family must have a manifest entry for dimensions, pivots,
animation frames, `mineId`, provenance and status. Review the six sites side by
side to catch accidental palette or silhouette overlap before final export.

**Final art checkpoint (2026-10-05):** the five non-Gold sites each
have upper/middle/deep floor backgrounds at 576×264 and a transparent
128×128 decorative ore pile with the same visible bounds as Gold's pile. See
`public/assets/sites/asset-manifest.json` and the contact sheets there. These
establish each resource's shape language. An Amethyst screenshot at native game
scale confirms the upper-band floor and pile render. Five 720×328 surface
landscape candidates now show the sites' geology above ground and hot-swap with
the selected mine; the Amethyst composition was reviewed in-game. The Map uses
its six-region terrain candidate plus six hand-authored, resource-specific SVG
landmarks in its nodes and selected-site detail. All five sites now also have
new tower artwork in full/empty hopper states, a site-specific warehouse, and
a filled default wood cart; those assets hot-swap with the selected mine and
Amethyst's surface structure composition was reviewed in-game. Each site now
also has its own repeated shaft tile, resource-loaded Tobi/Rivet vehicle
variants, a four-frame gemstone pour at the surface chute and a four-frame
crystal-impact effect at the ore pile. The shaft
preserves the existing rail and cabin anchors; the paid vehicle shapes retain
their identities while changing their visible loads. The moving cabin now
composes a small resource-specific ore pile in front of the cat only while it
carries material; the same overlay appears in the surface cabin twin. Diamond's
loaded cabin was checked at native game scale and the pile was moved inside the
cab frame. Boru now uses the empty travel/deposit frames with a resource ore
overlay and a site-specific pour sheet, so its baked Gold load is not rendered
in non-Gold mines. The offline claim sheet now reuses the selected site's
landmark, resource name and accent. Native 360×640 capture matrices now cover
upper, middle and deep positions for all five sites, including the continuous
shaft and resource identity at each depth. Browser contracts verify the active
pour/impact/cargo texture family, Amethyst Boru travel-loaded, Ruby Boru deposit
and the site-specific claim identity. Source and normalization history is
retained in `public/assets/sites/asset-manifest.json`.

## Earning and switching rules

Define `activeMineId` as the only site whose extraction, transport and
warehouse pipeline advances with foreground ticks. A warehouse delivery is
converted by that site's resource value and credited once to `walletGold`.
Inactive sites keep their last production state and a frozen effective-rate
snapshot taken at departure. They do **not** run fifteen-floor simulations in
the background, write gold to the wallet, or appear in the live rate HUD.

For an inactive site, the proposed reward is the existing offline formula:

```text
creditedDuration = min(elapsedSinceDeparture, 2 hours)
pendingGold = creditedDurationSeconds × savedEffectiveGoldPerSecond × 0.5
```

The server clock is authoritative for configured accounts. A claim records a
unique mine/interval identity and a settled-through timestamp in the same
atomic operation that credits the shared wallet. Reopening the sheet, retrying
after a failed write, reloading, or switching devices must return the already
settled result, never add it again. An unclaimed interval stays attached to its
mine and never leaks into another mine's wallet or progress. A site's offline
clock stops and foreground simulation starts at the successful enter boundary.
If entering without a validated claim, freeze the interval as pending and start
new foreground production from the entry boundary; settle the frozen interval
later without overlapping it with live earnings.

On page hide or app close, the selected mine also enters offline mode. On
resume, it follows the same single-interval claim path; the foreground driver
must not also catch up the hidden interval at full live rate. A negative or
unchanged clock delta yields zero. The two-hour cap applies **per mine per
unclaimed interval**, never to an aggregate HUD rate. Frequent switching can
still produce multiple delayed claims; this is intentional under the selected
rules and must be included in balance tests.

Example: while the player is in Amethyst from 10:00 to 10:30, only Amethyst
deliveries change the wallet live. Gold Mine's displayed wallet contribution
stays zero during those 30 minutes. On entering Gold Mine at 10:30, its pending
offline interval is offered once; claiming it adds the fixed amount to the
same wallet. Amethyst then becomes the inactive mine with a new departure
snapshot. This example does allow both mines to generate *eventual* income
over 10:00–10:30, so portfolio balance must account for it.

Mine Overdrive retains one account-wide cooldown but should bind an activation
to the mine selected when started. Its x4 window affects that mine's eligible
foreground or offline overlap only, never every inactive mine at once. The
server-owned boost record now stores the mine identifier, and activation is an
atomic revision-checked V4 command for an owned active mine.

## State, ownership, and compatibility

Target model: one account-level portfolio document containing `walletGold`,
`activeMineId`, stable site ownership, the account-wide cat roster, and a
`mines[mineId]` dictionary of production state, per-mine cumulative counters,
saved rate, offline interval cursor and pending claim. Site catalog properties
(name, map coordinates, resource multiplier and fixed price) belong in config,
not mutable save data. A mine's gold must not be copied into every mine state;
the current `GameState.gold` is a single-wallet field and needs a deliberate
extraction into account-level state. The foreground driver receives the
selected mine plus the shared wallet. Only data is saved, never Phaser objects.

Migrate a valid v3 save to a new portfolio version by placing its exact mine
progress in `mines.gold`, moving `state.gold` to `walletGold`, marking Gold Mine
owned and selected but suspended for its pending offline claim, and preserving
the cat roster, assigned slots, offline
counters, boost receipt and cloud revision. Preserve the old document until the
new local write succeeds. A failed migration must not create a fresh portfolio
over a recoverable old save. IndexedDB's single `active` record can still hold
one portfolio document, but the schema, validation, lifecycle journal, cloud
protocol and server parser must change together. Use a forward migration and
explicit version dispatch; do not mutate old saves in place.

Cat ownership stays account-wide. Assignment slot keys become mine-qualified
(`mine:<mineId>:miner:<floorId>`, and equivalents for shared stages), so an
owned cat cannot be assigned in two mines simultaneously. Old unqualified
slots migrate to Gold Mine. Marketplace buy/sell/rent continues to transact
against the shared wallet; its server response and save revision must reconcile
against that same wallet. The lifetime-gold leaderboard should sum deliveries
and offline claims across mines once, while its current ranking history is
preserved through migration. Cloud conflict dominance and anti-cheat bounds
must inspect per-mine monotonic counters plus the account wallet and claims;
two divergent device portfolios must not be merged by adding wallets or
claims together. Account-level switch, purchase and claim commands need
revision checks and idempotency keys.

**Server checkpoint (2026-10-05):** save-sync accepts bounded V4 routine
uploads and returns per-mine offline previews. A server-clock command migrates
supported V1–V3 saves, purchases mines, enters/claims and suspends. The local
Supabase RPC updates the save revision and stores the accepted response in one
transaction so a retried command cannot charge or claim twice. A configured
offline entry freezes the exact interval in `pendingClaim`, begins foreground
play at the saved `effectiveAtMs` boundary and journals the source document,
upload phase and accepted receipt. Reconnect or reload replays the idempotent
command, credits the server grant once and merges it into the still-live local
mine before cloud sync resumes. The Map labels this state **Claim pending**.
Collection and Marketplace adopt authoritative V4 wallet/roster mutations,
conflict choices preserve both candidates, and Mine Overdrive remains bound to
one selected mine with an account-wide cooldown.

## Delivery sequence and acceptance gates

1. **Design/balance blockout:** make the six-node map with simple shapes, fixed
   prices and prerequisites; simulate the critical path and time to next site.
2. **Pure portfolio core:** model ownership, one active mine, one wallet,
   switch/claim intervals, resource conversion and invariant checks. Unit tests
   cover wallet conservation, cap, no double claim, and no live ticks for
   inactive mines.
3. **Save and cloud migration:** v3-to-portfolio conversion, local journal,
   cloud sync, server clock, anti-cheat, conflict and cross-device behavior.
   Existing saves and cat assignments must survive reload/re-login.
4. **Map and mine handoff UI:** responsive node states, site detail, purchase,
   reward sheet, selected resource skin, and focus/input restoration. Browser
   tests cover buying, switching, claiming, reload and a narrow 9:16 viewport.
5. **Per-mine visual production:** approve one representative floor and surface
   view for each resource before producing its full matched family. Build all
   fifteen-floor depth bands, ore, pile, contact, cargo and surface variants;
   validate anchors, seams and legibility at native game scale.
6. **Economy and art gate:** tune costs and multipliers with a deterministic
   simulation that includes rotating through all owned sites. Confirm every
   floor, cargo state and map marker uses the selected resource family, and
   resource icons and text remain distinguishable without color.

Release gate, passed 2026-10-05: at all times only one site increases the shared wallet from
foreground delivery; an unvisited site never gets an offline windfall; each
closed inactive interval can increase the wallet at most once; switching, tab
hide/resume, reload, save failure, disconnected play and two-device conflict
cannot silently delete progress or double-credit a claim. Pure core, client,
Deno, live Supabase and browser coverage exercise these boundaries, including
durable replay at the original offline-entry timestamp.
