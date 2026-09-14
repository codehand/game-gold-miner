# Archive — Incident log

Closed defect reports from the base-game milestone. Each entry below previously
appeared **verbatim in seven Memory Bank files at once** (`progress.md`,
`activeContext.md`, `architecture.md`, `techContext.md`, `systemPatterns.md`,
`productContext.md`, `game-design-document.md`); the 2026-09-14 restructure kept
one canonical copy here and removed the other 14.

Not part of the contract. Open a specific entry only when you need the
provenance of one fix.

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

